import { useEffect, useState } from "react";
import type { ApiState } from "../../src/api";

export type Live =
  | { kind: "loading" }
  | { kind: "signed-out" }
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
