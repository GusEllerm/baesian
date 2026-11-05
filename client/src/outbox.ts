import type { ApiVerdictInput } from "../../src/api";
import { type Endpoints, postAnswer } from "./endpoints";
import type { Wait } from "./waiting";

// M4 step 5c: the undo window (D82). An answer waits here before it's sent: undo takes it back; the next answer, or
// the page closing, sends it at once. One answer waits at a time. A plain class, so its timing is tested with fake
// timers (outbox.test.ts); the desk holds one for the session.

/**
 * What the server said once it took an answer: `filed`, the cards Baesian proposed from it (M8: D161, B-y6jn6); or, on
 * the website, `waiting`, the relay holding it for your passkey, to be confirmed with other answers by one tap (B-a6xpc).
 */
export interface Posted {
  filed?: string[];
  waiting?: Wait;
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

/**
 * Send a verdict to the server, with the browser's cookie: the local server's, or on the website the project's relay,
 * which holds an answer that takes the passkey until you confirm it (B-a6xpc). Rejects with the server's own reason.
 */
export const postVerdictTo =
  (e: Endpoints): Post =>
  async (verdict, { keepalive }) => {
    const r = await postAnswer(e, e.verdicts, verdict, { keepalive, client: true, wait: true });
    return posted(r);
  };

/** What a recorded answer's reply says, that it waits for the passkey, or the server's reason it wasn't recorded. */
async function posted(r: Response): Promise<Posted> {
  if (r.status === 202) return { waiting: ((await r.json()) as { passkey: Wait }).passkey };
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
}
