import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ApiError, call } from "./api";

// The website as an app (M9e step 2, D130): its service worker, at scope / (client/site-public/sw.js), which shows the
// notifications; installing it, through the browser's own prompt where there is one; and turning notifications on in
// this browser, which asks the browser only from a tap, never when a page loads. On an iPhone or iPad, web push reaches
// only the app added to the Home Screen (iOS 16.4 or later), so there the page says how to add it instead.

/** Register the service worker, once, as the site starts. It caches nothing (sw.js says why). */
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => console.error(`the service worker didn't register: ${e instanceof Error ? e.message : String(e)}`));
}

/** The browser's install prompt (Chrome, Edge), kept from the moment it's offered until it's used. */
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let offered: InstallPrompt | undefined;
const listeners = new Set<() => void>();
const changed = () => {
  for (const l of listeners) l();
};

/** Keep the browser's install prompt for the button that uses it: it's offered once, early, whatever page is open. */
export function listenForInstall(): void {
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    offered = e as InstallPrompt;
    changed();
  });
  addEventListener("appinstalled", () => {
    offered = undefined;
    changed();
  });
}

/** An iPhone or iPad (an iPad says it's a Mac, but has a touch screen). */
export const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** Whether the site runs as an installed app: from the Home Screen, a dock or a Start menu. */
export const isInstalled = () => matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** The install prompt, if the browser offers one, and using it. */
export function useInstall(): { canPrompt: boolean; prompt: () => Promise<boolean> } {
  const p = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => offered,
  );
  return {
    canPrompt: !!p,
    prompt: async () => {
      if (!p) return false;
      await p.prompt();
      const { outcome } = await p.userChoice;
      offered = undefined;
      changed();
      return outcome === "accepted";
    },
  };
}

/** A browser that gets notifications, as the account lists it (`GET /v1/account/push`). */
export interface PushRow {
  id: string;
  name: string;
  service: string;
  /** The first 16 hex of its endpoint's SHA-256: how this browser knows its own row. */
  key: string;
  created: string;
  last_sent: string | null;
}

/** Where this browser stands on notifications. */
export type PushStatus =
  | "loading"
  /** This browser can't get them at all. */
  | "unsupported"
  /** An iPhone or iPad, in Safari: only the app on the Home Screen can. */
  | "install-first"
  /** The service can't send them (no VAPID key). */
  | "unavailable"
  /** The person said no to the browser, which won't ask again. */
  | "blocked"
  | "off"
  | "on";

const keyOf = async (endpoint: string) => {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint)));
  return Array.from(d.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
};

/** The VAPID key, base64url, as the bytes `pushManager.subscribe()` takes. */
const keyBytes = (b64url: string): Uint8Array<ArrayBuffer> => {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64url.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/**
 * Notifications in this browser, and the account's list of browsers that get them. The service worker's registration and
 * the service's key are read when the page opens, so turning them on calls `pushManager.subscribe()` first thing in the
 * tap's handler: the browser's question follows the tap, as Safari requires, and is never asked on load.
 */
export function usePush(vapidKey: string | null | undefined) {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [rows, setRows] = useState<PushRow[]>();
  const [mine, setMine] = useState<string>();
  const registration = useRef<ServiceWorkerRegistration>(undefined);

  const list = useCallback(async () => {
    setRows((await call<{ subscriptions: PushRow[] }>("GET", "/v1/account/push")).subscriptions);
  }, []);

  const look = useCallback(async () => {
    if (vapidKey === undefined) return;
    // On an iPhone or iPad, only the app on the Home Screen gets them, whatever Safari's tab offers.
    if (isIos() && !isInstalled()) return setStatus("install-first");
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!supported) return setStatus("unsupported");
    if (!vapidKey) return setStatus("unavailable");
    registration.current = await navigator.serviceWorker.ready;
    const sub = await registration.current.pushManager.getSubscription();
    const key = sub ? await keyOf(sub.endpoint) : undefined;
    setMine(key);
    if (Notification.permission === "denied") return setStatus("blocked");
    setStatus(sub ? "on" : "off");
  }, [vapidKey]);

  useEffect(() => {
    void look();
    void list().catch(() => setRows([]));
  }, [look, list]);

  /** Turn them on: the browser asks, from this tap; then the service is told where to send. */
  const turnOn = async () => {
    const reg = registration.current ?? (await navigator.serviceWorker.ready);
    let sub: PushSubscription;
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey!) });
    } catch (e) {
      if (Notification.permission === "denied") {
        setStatus("blocked");
        throw new Error("notifications are blocked for this site in this browser. Allow them in its settings for this site, then try again");
      }
      throw new Error(`this browser couldn't turn notifications on (${e instanceof Error ? e.message : String(e)}). Try again`);
    }
    try {
      await call("POST", "/v1/account/push", sub.toJSON());
    } catch (e) {
      await sub.unsubscribe().catch(() => {});
      throw e;
    }
    setMine(await keyOf(sub.endpoint));
    setStatus("on");
    await list();
  };

  /** Stop a browser getting them: this one (its subscription ended here too), or another, by its row. */
  const remove = async (row: PushRow) => {
    try {
      await call("DELETE", `/v1/account/push/${encodeURIComponent(row.id)}`);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) throw e;
    }
    if (row.key === mine) {
      const sub = await registration.current?.pushManager.getSubscription();
      await sub?.unsubscribe().catch(() => {});
      setMine(undefined);
      setStatus("off");
    }
    await list();
  };

  /** This browser's row, if it gets them. */
  const here = rows?.find((r) => r.key === mine);
  return { status: status === "on" && rows && !here ? "off" : status, rows, here, turnOn, remove };
}
