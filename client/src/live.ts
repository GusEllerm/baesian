import { useCallback, useEffect, useState } from "react";
import type { ApiPractice, ApiState } from "../../src/api";
import type { PracticeEntry } from "../../src/schema";
import { type Endpoints, hostedClient, useEndpoints } from "./endpoints";
import { dropState, keepState, keptState } from "./kept";

export type Live =
  | { kind: "loading" }
  | { kind: "signed-out" }
  /** On the website: signed in, but the project isn't one of yours (403). */
  | { kind: "not-yours"; message: string }
  | { kind: "error"; message: string }
  /**
   * `fetchedAt` is when the snapshot arrived, by this browser's clock, so the server's clock can be read forward. On the
   * website, `refreshing` while it's the copy this tab kept from before, until a fresh read replaces it (B-3va5g).
   */
  | { kind: "ready"; state: ApiState; fetchedAt: number; refreshing?: boolean };

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

/** How long a read that failed while the desk shows its kept copy waits before it tries again. */
const REREAD_MS = 5000;

/**
 * A project's live connection on the website (B-bv49e), kept open. `changed` hears each version the relay announces: one
 * as the connection opens, and one after every change. A connection that closes is opened again, later each time
 * (`RECONNECT_MS`), and `reopening` is called just before, since anything may have changed while it was down. A ping keeps
 * a proxy from dropping it as idle. Returns how to stop.
 */
export function listen(liveUrl: string, on: { changed: (version: number) => void; reopening?: () => void }): () => void {
  let stopped = false;
  let ws: WebSocket | undefined;
  let attempts = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const open = () => {
    if (stopped) return;
    const socket = new WebSocket(liveUrl);
    ws = socket;
    socket.onopen = () => {
      attempts = 0;
    };
    socket.onmessage = (m) => {
      let msg: { type?: string; version?: number };
      try {
        msg = JSON.parse(String(m.data)) as { type?: string; version?: number };
      } catch {
        return; // a pong, or nothing the relay sends: ignored
      }
      if (msg.type !== "changed") return;
      // With no version, it's newer than anything heard so far.
      on.changed(typeof msg.version === "number" ? msg.version : Number.POSITIVE_INFINITY);
    };
    socket.onclose = () => {
      if (ws === socket) ws = undefined;
      if (stopped) return;
      retry = setTimeout(() => {
        on.reopening?.();
        open();
      }, RECONNECT_MS[Math.min(attempts++, RECONNECT_MS.length - 1)]);
    };
  };
  open();
  const ping = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) ws.send("ping");
  }, PING_MS);
  return () => {
    stopped = true;
    clearTimeout(retry);
    clearInterval(ping);
    ws?.close();
  };
}

/**
 * One project's state on the website (M9e, B-17wn9): the relay's snapshot, read as the local server's is, and read again
 * whenever its live connection says the project changed (`listen()`, B-bv49e), and when that connection comes back after
 * closing, so nothing is missed while it was down. A project this tab has read before starts from that copy, marked as
 * refreshing until the first read comes back (B-3va5g); each read is kept for the next time (`kept.ts`).
 */
export function useHostedState(e: Endpoints): Live {
  const [live, setLive] = useState<Live>(() => {
    const kept = keptState(e.state);
    return kept ? { kind: "ready", ...kept, refreshing: true } : { kind: "loading" };
  });
  const stateUrl = e.state;
  const liveUrl = e.hosted?.live;
  useEffect(() => {
    let stopped = false;
    let newest = keptState(stateUrl)?.state.version ?? 0;
    let reread: ReturnType<typeof setTimeout> | undefined;
    // One read at a time. The connection says the project's version as it opens, while the first read is still on its
    // way; a change announced during a read is read again only if that read came back older than it.
    let reading = false;
    let announced = 0;
    const load = async () => {
      if (reading) return;
      reading = true;
      // What was announced before this read starts, it reads.
      announced = 0;
      await read();
      reading = false;
      if (!stopped && announced > newest) void load();
    };
    const read = async () => {
      try {
        const r = await fetch(stateUrl, { credentials: "same-origin" });
        if (stopped) return;
        if (r.status === 401) {
          dropState(stateUrl);
          return setLive({ kind: "signed-out" });
        }
        if (r.status === 403 || r.status === 404) {
          dropState(stateUrl);
          const body = (await r.json().catch(() => ({}))) as { error?: string };
          return setLive({ kind: "not-yours", message: body.error ?? `the service answered ${r.status}` });
        }
        if (!r.ok) throw new Error(`the service answered ${r.status}`);
        const state = (await r.json()) as ApiState;
        if (!stopped && state.version >= newest) {
          newest = state.version;
          const fetchedAt = Date.now();
          keepState(stateUrl, { state, fetchedAt });
          setLive({ kind: "ready", state, fetchedAt });
        }
      } catch (err) {
        if (stopped) return;
        // Showing the kept copy, the desk stays, still refreshing, with answers held, and reads again shortly.
        setLive((had) => (had.kind === "ready" && had.refreshing ? had : { kind: "error", message: err instanceof Error ? err.message : String(err) }));
        clearTimeout(reread);
        reread = setTimeout(() => void load(), REREAD_MS);
      }
    };
    void load();
    const stop = liveUrl
      ? listen(liveUrl, {
          changed: (version) => {
            if (version <= newest) return;
            announced = Math.max(announced, version);
            void load();
          },
          reopening: () => void load(),
        })
      : undefined;
    return () => {
      stopped = true;
      clearTimeout(reread);
      stop?.();
    };
  }, [stateUrl, liveUrl]);
  return live;
}

/**
 * Your practice answers (B-rehdw), from their own address, apart from the state: read when the desk opens, again when the
 * page comes back into view (another device may have added some), and as each one is written here. `ready` once the
 * first read has come back: until then the desk draws no practice card, so one is never drawn twice. A read that fails
 * keeps what was there.
 */
export function usePractice(e: Endpoints): { entries: PracticeEntry[]; ready: boolean; add: (entry: PracticeEntry) => void } {
  const [entries, setEntries] = useState<PracticeEntry[]>([]);
  const [ready, setReady] = useState(false);
  const url = e.practice;
  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        const r = await fetch(url, { credentials: "same-origin" });
        if (!r.ok) return;
        const body = (await r.json()) as ApiPractice;
        if (!stopped) {
          setEntries((had) => merged(body.entries, had));
          setReady(true);
        }
      } catch {
        // offline, or the server went away: what's here stays
      }
    };
    void load();
    const back = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", back);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", back);
    };
  }, [url]);
  const add = useCallback((entry: PracticeEntry) => setEntries((had) => merged([entry], had)), []);
  return { entries, ready, add };
}

/** Practice entries from two reads, each once, in the order written. */
function merged(a: readonly PracticeEntry[], b: readonly PracticeEntry[]): PracticeEntry[] {
  const key = (x: PracticeEntry) => JSON.stringify(x);
  const seen = new Set<string>();
  return [...a, ...b].filter((x) => !seen.has(key(x)) && !!seen.add(key(x))).sort((x, y) => x.at.localeCompare(y.at));
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
