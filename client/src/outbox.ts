import type { ApiPracticeInput, ApiVerdictInput } from "../../src/api";
import type { PracticeEntry } from "../../src/schema";
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
  /** The practice entry kept, for a practice card's answer (B-rehdw). */
  practice?: PracticeEntry;
}

/**
 * What waits in the undo window: a verdict; or a practice card's answer (B-kb5yt), which goes to its own address and never
 * to an agent. Both wait the same, so a practice card answers as a real one does. A mark in the blind test isn't held: it
 * comes after the answer, on a card of its own (B-9prve), and is kept at once.
 */
export type Outgoing = { verdict: ApiVerdictInput } | { practice: ApiPracticeInput };

export type Post = (item: Outgoing, opts: { keepalive: boolean }) => Promise<Posted | void>;

export interface Held {
  card: string;
  item: Outgoing;
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
  hold(card: string, item: Outgoing): Held {
    this.flush();
    const until = this.now() + this.ms;
    this.held = { card, item, until, timer: setTimeout(() => this.flush(), this.ms) };
    return { card, item, until };
  }

  /** The answer waiting, if any. */
  waiting(): Held | undefined {
    return this.held && { card: this.held.card, item: this.held.item, until: this.held.until };
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
    const { card, item } = this.held;
    this.held = undefined;
    this.post(item, { keepalive }).then(
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
  async (item, { keepalive }) => {
    // A practice card's answer goes to the practice address alone (B-rehdw): never to an agent, and never a verdict.
    if ("practice" in item) return { practice: await postPractice(e, item.practice, keepalive) };
    return posted(await postAnswer(e, e.verdicts, item.verdict, { keepalive, client: true, wait: true }));
  };

/** Keep a practice entry (B-rehdw): the start of the blind test, a practice card's answer, or a mark. Rejects with the server's reason. */
export async function postPractice(e: Endpoints, input: ApiPracticeInput, keepalive = false): Promise<PracticeEntry> {
  const r = await postAnswer(e, e.practice, input, { keepalive, client: true });
  const body = (await r.json().catch(() => ({}))) as { entry?: PracticeEntry; error?: string };
  if (!r.ok || !body.entry) throw new Error(body.error ?? `the server answered ${r.status}`);
  return body.entry;
}

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
