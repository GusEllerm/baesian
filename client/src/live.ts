import { useEffect, useState } from "react";
import type { ApiState } from "../../src/api";
import { type Endpoints, hostedClient, useEndpoints } from "./endpoints";

export type Live =
  | { kind: "loading" }
  | { kind: "signed-out" }
  /** On the website: signed in, but the project isn't one of yours (403). */
  | { kind: "not-yours"; message: string }
  | { kind: "error"; message: string }
  /** `fetchedAt` is when the snapshot arrived, by this browser's clock, so the server's clock can be read forward. */
  | { kind: "ready"; state: ApiState; fetchedAt: number };

/**
 * The live layer, as the server sees it (D96): one snapshot, read again whenever the server says it changed.
 * A slower read that lands after a newer one is ignored, by its version.
 */
export function useLiveState(): Live {
  const [live, setLive] = useState<Live>({ kind: "loading" });
  useEffect(() => {
    let stopped = false;
    let newest = 0;
    const load = async () => {
      try {
        const r = await fetch("/api/state", { credentials: "same-origin" });
        if (stopped) return;
        if (r.status === 401) return setLive({ kind: "signed-out" });
        if (!r.ok) throw new Error(`the server answered ${r.status}`);
        const state = (await r.json()) as ApiState;
        if (!stopped && state.version >= newest) {
          newest = state.version;
          setLive({ kind: "ready", state, fetchedAt: Date.now() });
        }
      } catch (e) {
        if (!stopped) setLive({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      }
    };
    void load();
    const events = new EventSource("/api/events");
    events.addEventListener("changed", () => void load());
    return () => {
      stopped = true;
      events.close();
    };
  }, []);
  return live;
}

/** How long a live socket that closed waits before it's opened again, by attempt (as `baesian wait` does, M9d). */
const RECONNECT_MS = [1000, 2000, 5000, 10_000];
/** A ping on the live socket this often, which the relay answers without waking (B-bv49e), so no proxy drops it as idle. */
const PING_MS = 30_000;

/**
 * One project's state on the website (M9e, B-17wn9): the relay's snapshot, read as the local server's is, and read again
 * whenever its live socket says the project changed (B-bv49e). The socket is opened again when it closes, and the state
 * read again then, so nothing is missed while it was down.
 */
export function useHostedState(e: Endpoints): Live {
  const [live, setLive] = useState<Live>({ kind: "loading" });
  const stateUrl = e.state;
  const liveUrl = e.hosted?.live;
  useEffect(() => {
    let stopped = false;
    let newest = 0;
    let ws: WebSocket | undefined;
    let attempts = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;
    const load = async () => {
      try {
        const r = await fetch(stateUrl, { credentials: "same-origin" });
        if (stopped) return;
        if (r.status === 401) return setLive({ kind: "signed-out" });
        if (r.status === 403 || r.status === 404) {
          const body = (await r.json().catch(() => ({}))) as { error?: string };
          return setLive({ kind: "not-yours", message: body.error ?? `the service answered ${r.status}` });
        }
        if (!r.ok) throw new Error(`the service answered ${r.status}`);
        const state = (await r.json()) as ApiState;
        if (!stopped && state.version >= newest) {
          newest = state.version;
          setLive({ kind: "ready", state, fetchedAt: Date.now() });
        }
      } catch (err) {
        if (!stopped) setLive({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      }
    };
    const open = () => {
      if (stopped || !liveUrl) return;
      const socket = new WebSocket(liveUrl);
      ws = socket;
      socket.onopen = () => {
        attempts = 0;
      };
      socket.onmessage = (m) => {
        try {
          const msg = JSON.parse(String(m.data)) as { type?: string; version?: number };
          if (msg.type === "changed" && (typeof msg.version !== "number" || msg.version > newest)) void load();
        } catch {
          // a pong, or nothing the relay sends: ignored
        }
      };
      socket.onclose = () => {
        if (ws === socket) ws = undefined;
        if (stopped) return;
        retry = setTimeout(() => {
          void load();
          open();
        }, RECONNECT_MS[Math.min(attempts++, RECONNECT_MS.length - 1)]);
      };
    };
    void load();
    open();
    ping = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) ws.send("ping");
    }, PING_MS);
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(ping);
      ws?.close();
    };
  }, [stateUrl, liveUrl]);
  return live;
}

/** How often the open client says the reviewer is there (D41). Three missed beats and they count as away. */
export const PRESENCE_EVERY_MS = 30_000;

/**
 * The presence heartbeat (D41): while the page is open, and at once when you come back to it, so an agent's
 * `baesian wait` knows someone may answer. A beat that fails is simply missed. On the website it names the hosted client.
 */
export function usePresence() {
  const e = useEndpoints();
  useEffect(() => {
    const body = JSON.stringify(e.hosted ? { client: hostedClient() } : {});
    const beat = () =>
      void fetch(e.presence, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body }).catch(() => {});
    const back = () => document.visibilityState === "visible" && beat();
    beat();
    const t = setInterval(beat, PRESENCE_EVERY_MS);
    document.addEventListener("visibilitychange", back);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", back);
    };
  }, [e]);
}
