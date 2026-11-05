import { useCallback, useEffect, useRef, useState } from "react";
import { type RequestOptionsJSON, signWithPasskey } from "../webauthn";

// The service's account addresses (M9c, docs/vault/Modules/service.md), as the website's pages call them: JSON, with
// the browser's cookie, from the site's own origin. Every error the service gives says what went wrong; the pages show it.

/** The service refused: its status, its words, and the rest of what it said (`attempts_left`, `reauth`, `needs_name`). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** One call to the service. Resolves with its JSON (or nothing, for 204); rejects with `ApiError`. */
export async function call<T = Record<string, unknown>>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "content-type": "application/json" } : {},
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError("the service couldn't be reached: check your connection, then try again", 0, {});
  }
  if (r.status === 204) return undefined as T;
  const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new ApiError(typeof json.error === "string" ? json.error : `the service answered ${r.status}`, r.status, json);
  return json as T;
}

/** What `GET /v1/config` gives: Turnstile's site key, and whether Globus is on. */
export interface SiteConfig {
  origin: string;
  rp_id: string;
  turnstile_site_key: string;
  globus: boolean;
  /** Web push's VAPID key, base64url, for browsers to subscribe with; null when the service can't send (M9e step 2). */
  vapid_public_key: string | null;
}

let config: Promise<SiteConfig> | undefined;
export const siteConfig = () => (config ??= call<SiteConfig>("GET", "/v1/config").catch((e) => {
  config = undefined;
  throw e;
}));

export function useConfig(): SiteConfig | undefined {
  const [c, setC] = useState<SiteConfig>();
  useEffect(() => {
    siteConfig().then(setC, () => {});
  }, []);
  return c;
}

/** A passkey of yours, as the account lists it. */
export interface Passkey {
  credential: string;
  name: string;
  /** Its line for CI's `BAESIAN_TRUST` (D159): its key file as JSON on one line, shown on the account page (B-yj5d5). */
  pin: string;
  enrolled: string;
  last_used: string | null;
}

/** A project of yours (B-zqkwk: its name is kept with it). */
export interface Project {
  id: string;
  name: string | null;
  created: string;
}

/** `GET /v1/account`. */
export interface Account {
  id: string;
  handle: string;
  created: string;
  emails: { address: string; verified: string | null }[];
  passkeys: Passkey[];
  globus: { linked: string } | null;
  projects: Project[];
  fresh_until: string;
  /** Whether the account's usage is counted (D141): yes unless it opted out. */
  usage: { counted: boolean };
}

export type Me = { kind: "loading" } | { kind: "signed-out" } | { kind: "error"; message: string } | { kind: "in"; account: Account };

/** The signed-in account, or that nobody is; `reload` reads it again. */
export function useMe(): Me & { reload: () => Promise<void> } {
  const [me, setMe] = useState<Me>({ kind: "loading" });
  const reload = useCallback(async () => {
    try {
      setMe({ kind: "in", account: await call<Account>("GET", "/v1/account") });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setMe({ kind: "signed-out" });
      else setMe({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { ...me, reload };
}

// ---------------------------------------------------------------- passkeys from a tap (M9e step 2)
// Safari starts a passkey only from a tap: `navigator.credentials` must be called in the tap's own handler, with no
// request to the service before it. So a page fetches a ceremony's options when it opens (`usePrepared()`), keeps them
// fresh while it's open, and the tap uses them at once. If they weren't ready (the device slept, say), the tap fetches
// them and asks for one more tap.

/** How long prepared options are used: under the service's 5 minutes for a ceremony (`LIMITS.ceremonyMs`). */
export const PREPARED_MS = 4 * 60_000;

/** A ceremony's options from the service, with the flow they belong to. */
export interface Ceremony<O> {
  flow: string;
  options: O;
}

/** The tap came before the passkey was ready; it is now. */
export class TapAgain extends Error {
  constructor() {
    super("your passkey wasn't ready yet. Tap again to use it");
  }
}

/**
 * Options for a passkey ceremony, fetched before the tap that uses them, and again before they expire while the page is
 * open. `take()` hands them over at once, with nothing awaited before the passkey (a flow is used once, so it fetches the
 * next); with none ready, it starts fetching them and throws `TapAgain`, so the page asks for another tap. `ready` is
 * false only while the first options are on their way, for the button to wait on; with no `load`, nothing is prepared,
 * and it's ready.
 */
export function usePrepared<T>(load: (() => Promise<T>) | undefined): { take: () => T; ready: boolean } {
  const held = useRef<{ value: T; at: number } | undefined>(undefined);
  const loading = useRef<Promise<void> | undefined>(undefined);
  const [ready, setReady] = useState(!load);
  const refresh = useCallback(() => {
    if (!load) return Promise.resolve();
    loading.current ??= load()
      .then((value) => {
        held.current = { value, at: Date.now() };
      })
      .catch(() => {
        // Failed: the tap fetches them again, and says to tap once more.
        held.current = undefined;
      })
      .finally(() => {
        loading.current = undefined;
        setReady(true);
      });
    return loading.current;
  }, [load]);
  useEffect(() => {
    held.current = undefined;
    setReady(!load);
    if (!load) return;
    void refresh();
    const stale = () => !held.current || Date.now() - held.current.at > PREPARED_MS;
    const t = setInterval(() => stale() && void refresh(), 15_000);
    const back = () => document.visibilityState === "visible" && stale() && void refresh();
    document.addEventListener("visibilitychange", back);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", back);
    };
  }, [load, refresh]);
  return {
    ready,
    take: () => {
      const h = held.current;
      held.current = undefined;
      // The next options are fetched after this tap's passkey has started, never before it.
      setTimeout(() => void refresh(), 0);
      if (h && Date.now() - h.at <= PREPARED_MS) return h.value;
      throw new TapAgain();
    },
  };
}

/** A fresh check's options (`POST /v1/account/reauth/start`). */
export const reauthStart = () => call<Ceremony<RequestOptionsJSON>>("POST", "/v1/account/reauth/start", {});

/**
 * Check your passkey afresh (M9c), with options prepared before the tap: what adds a way in, approves a machine or links
 * Globus asks for a check in the last 5 minutes. `navigator.credentials.get()` is the first thing it does.
 */
export async function reauthWith(c: Ceremony<RequestOptionsJSON>): Promise<void> {
  const response = await signWithPasskey(c.options);
  await call("POST", "/v1/account/reauth/finish", { flow: c.flow, response });
}

/**
 * Whether the sign-in's last passkey check is recent enough for what asks for it, with half a minute to spare; it
 * changes as time passes, so it's read again when it would lapse.
 */
export function useFresh(freshUntil: string): boolean {
  const until = Date.parse(freshUntil) - 30_000;
  const [, tick] = useState(0);
  useEffect(() => {
    const left = until - Date.now();
    if (left <= 0) return;
    const t = setTimeout(() => tick((n) => n + 1), left + 50);
    return () => clearTimeout(t);
  }, [until]);
  return until > Date.now();
}

/** A date, as the pages say it: "4 Nov 2026". */
export const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "never");

/** How long ago, roughly: "today", "yesterday", "3 days ago", or the date. */
export function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return days < 30 ? `${days} days ago` : day(iso);
}

/** A project's name, or what to call it until it has one. */
export const projectName = (p: { name: string | null }) => p.name ?? "Unnamed project";
