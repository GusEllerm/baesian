import type { ApiVerdictInput } from "../../src/api";

// M4 step 5c: the undo window (D82). An answer waits here before it's sent: undo takes it back; the next answer, or
// the page closing, sends it at once. One answer waits at a time. A plain class, so its timing is tested with fake
// timers (outbox.test.ts); the desk holds one for the session.

/** What the server said once it recorded an answer: `filed`, the cards Baesian proposed from it (M8: D161, B-y6jn6). */
export interface Posted {
  filed?: string[];
}
export type Post = (verdict: ApiVerdictInput, opts: { keepalive: boolean }) => Promise<Posted | void>;

export interface Held {
  card: string;
  verdict: ApiVerdictInput;
  /** When it goes, by this browser's clock. */
  until: number;
}

export class Outbox {
  private held: (Held & { timer: ReturnType<typeof setTimeout> }) | undefined;

  constructor(
    private readonly post: Post,
    private readonly ms: number,
    private readonly events: { sent: (card: string, posted?: Posted) => void; failed: (card: string, error: string) => void },
    private readonly now: () => number = Date.now,
  ) {}

  /** Hold an answer for the undo window. Anything already waiting is sent first. */
  hold(card: string, verdict: ApiVerdictInput): Held {
    this.flush();
    const until = this.now() + this.ms;
    this.held = { card, verdict, until, timer: setTimeout(() => this.flush(), this.ms) };
    return { card, verdict, until };
  }

  /** The answer waiting, if any. */
  waiting(): Held | undefined {
    return this.held && { card: this.held.card, verdict: this.held.verdict, until: this.held.until };
  }

  /** Take back the answer waiting. Returns its card, or undefined if nothing was waiting. */
  undo(): string | undefined {
    if (!this.held) return undefined;
    clearTimeout(this.held.timer);
    const { card } = this.held;
    this.held = undefined;
    return card;
  }

  /** Send what's waiting now. `keepalive` lets the request outlive the page, when it closes (D82). */
  flush(keepalive = false): void {
    if (!this.held) return;
    clearTimeout(this.held.timer);
    const { card, verdict } = this.held;
    this.held = undefined;
    this.post(verdict, { keepalive }).then(
      (posted) => (posted ? this.events.sent(card, posted) : this.events.sent(card)),
      (e: unknown) => this.events.failed(card, e instanceof Error ? e.message : String(e)),
    );
  }
}

/** Send a verdict to the server, with the browser's cookie. Rejects with the server's own reason. */
export const postVerdict: Post = async (verdict, { keepalive }) => {
  const r = await fetch("/api/verdicts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(verdict),
    credentials: "same-origin",
    keepalive,
  });
  if (r.ok) {
    const { filed } = (await r.json().catch(() => ({}))) as Posted;
    return filed?.length ? { filed } : {};
  }
  let reason = `the server answered ${r.status}`;
  try {
    reason = ((await r.json()) as { error?: string }).error ?? reason;
  } catch {
    // no JSON: keep the status
  }
  throw new Error(reason);
};
