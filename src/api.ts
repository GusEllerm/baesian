import type { CardMeta, DeckMeta, Fallback, Presence, RuleMeta, Verdict } from "./schema.js";
import type { Brief, Status } from "./store.js";

// The server's API (D96): what `GET /api/state` returns, and what the client may write. Types only, so the
// client can share them. docs/vault/Design/Local Server.md describes the API for people.

/** One card as the client sees it: its latest revision, and everything the store computes about it. */
export interface ApiCard {
  meta: CardMeta;
  body: string;
  /** How many revisions it has had. */
  revisions: number;
  status: Status;
  /** What was decided, for a resolved card. */
  decision?: string;
  canonicalTopic: string;
  /** Every verdict on the card, on any revision, oldest first. */
  verdicts: Verdict[];
  /** Cards whose `depends_on` names this one. */
  dependents: string[];
  /** What its agent has been told beyond the verdict (D80, D81). */
  briefs: Brief[];
  /**
   * Agents waiting on it (D90). `stale` is as of `server.now`: a marker stops counting once it's older than
   * `WAITING_STALE_MS`, so the client re-evaluates it as time passes.
   */
  waiting: { agent: string; since: string; at: string; stale: boolean }[];
  fallbacks: Fallback[];
  /** Other agents waiting on it instead of filing a duplicate (D36). */
  attachments: number;
}

export interface ApiState {
  /** Changes whenever the live layer does; `/api/events` announces each new one. */
  version: number;
  server: { pid: number; started: string; now: string; watch: "events" | "poll" };
  project: { name: string; branch: string };
  presence?: Presence;
  decks: { meta: DeckMeta; body: string }[];
  rules: { meta: RuleMeta; body: string }[];
  cards: ApiCard[];
  /** Files that couldn't be read: half-written, or invalid. They're read again on the next change. */
  problems: { path: string; error: string }[];
}

/** What the client sends to `POST /api/verdicts`. The server adds `reviewer` and `client`. */
export type ApiVerdictInput = Pick<Verdict, "card" | "revision" | "response"> &
  Partial<Pick<Verdict, "choice" | "comment" | "first_choice" | "make_rule">>;

/** The milliseconds after which a waiting marker counts as gone; the same as the store's. */
export const WAITING_STALE_MS = 90_000;
