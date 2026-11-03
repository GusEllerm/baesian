import type { Replay, Settings, SurveyItem } from "./routing.js";
import type { CardMeta, DeckMeta, Fallback, GateRecord, Preferences, Presence, RuleMeta, RuleRetirement, Verdict } from "./schema.js";

// The server's API (D96): what `GET /api/state` returns, and what the client may write. Types only, and nothing
// from Node, so the client can share them. docs/vault/Design/Local Server.md describes the API for people.

/**
 * A card's status, computed from its files by the store. `held`: the gate held it back, enforcing, and it has no answer
 * yet (D150); its agent went ahead with its pick, and it counts as settled at merge.
 */
export type Status = "open" | "held" | "returned" | "rerouted" | "deferred" | "resolved" | "withdrawn" | "superseded";

/**
 * What an agent is told along with a verdict, computed from the records like status (D71): never stored.
 * - `parent-decided-otherwise` (D80): a card this one builds on was decided against the proposal it assumed,
 *   so this card is returned.
 * - `answer-changed` (D81): the answer on this card changed after an earlier one resolved it. `commits` are those
 *   built on it before the change: the commits on a branch whose trailers cite it, found in the history, then the
 *   ledger's entries whose commit is on no branch now, marked `rewritten` (B-9v5xj). Only commits that cite the card,
 *   so a lower bound.
 *
 * - `held-answered` (D150, D151): the gate held the card back, so its agent went ahead with its pick, and the reviewer
 *   has since answered it otherwise: an audit, or a card opened from the held-back list. `commits` as above.
 *
 * Each names who wrote its texts, so an agent reads them quoted with their authors (D169): the reviewer who gave each
 * answer, and the agent that filed the parent.
 */
export type Brief =
  | { kind: "parent-decided-otherwise"; card: string; parent: string; parentTitle: string; parentAgent: string; parentBranch: string; assumed: string; decided: string; reviewer: string; at: string }
  | { kind: "answer-changed"; card: string; was: string; wasReviewer: string; now: string | undefined; reviewer: string; response: Verdict["response"]; commits: BriefCommit[]; at: string }
  | { kind: "held-answered"; card: string; assumed: string; agent: string; branch: string; now: string | undefined; reviewer: string; response: Verdict["response"]; commits: BriefCommit[]; at: string };

/** A commit an `answer-changed` brief lists. `rewritten`: the ledger has it, but it's on no branch now (B-9v5xj). */
export interface BriefCommit {
  commit?: string;
  branch: string;
  rewritten?: true;
}

/** One card as the client sees it: its latest revision, and everything the store computes about it. */
export interface ApiCard {
  meta: CardMeta;
  body: string;
  /** How many revisions it has had. */
  revisions: number;
  /** Whether its agent has had its one reply to an answer against its pick, on any revision (D89, D104). */
  replied: boolean;
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
  /**
   * The gate's record for its latest revision, the one that counts (M8, P16 section 3). On a held card, hide it until
   * the reviewer has chosen (D151): it gives the agent's pick away. Absent on cards filed before the gate.
   */
  gate?: GateRecord;
  /** An audit card: held, drawn for audit, and not answered yet (D151). It belongs in the queue, answered blind first. */
  audit?: true;
}

/**
 * One of a deck's context notes (M6, P17 §8): the wikilink as the deck holds it, and what to show for it. With a
 * vault, the note it resolves to, relative to the repo root, and its `summary:` line; or `missing`, when no note in
 * the vault matches. Without a vault, neither: the link is plain text.
 */
export interface ApiContextNote {
  link: string;
  text: string;
  path?: string;
  summary?: string;
  missing?: true;
}

export interface ApiState {
  /** Changes whenever the live layer does; `/api/events` announces each new one. */
  version: number;
  server: { pid: number; started: string; now: string; watch: "events" | "poll" };
  project: { name: string; branch: string };
  presence?: Presence;
  /** Every deck; the body is its briefing, and `notes` its context notes, resolved in the vault. */
  decks: { meta: DeckMeta; body: string; notes: ApiContextNote[] }[];
  /** Every rule; a retired one carries its retirement (D119). */
  rules: { meta: RuleMeta; body: string; retired?: RuleRetirement }[];
  cards: ApiCard[];
  /** The repo's preferences and the gate's record per row (M8). */
  routing: ApiRouting;
  /** Files that couldn't be read: half-written, or invalid. They're read again on the next change. */
  problems: { path: string; error: string }[];
}

/** A preference file, by name (D147). */
export interface ApiPreferenceFile {
  name: string;
  file: Preferences;
}

/** The repo's preferences, and what the gate has done under them (M8, P14 sections 3 and 4). */
export interface ApiRouting {
  /** The file in force, the newest. With none, the "Today" preset runs in shadow, which routes as Baesian did before. */
  preferences?: ApiPreferenceFile;
  /** Why the newest file couldn't be read, if it couldn't: the gate then runs "Today" in shadow (P14). */
  problem?: string;
  /** The settings the gate applies now. */
  settings: Settings;
  /** Every readable preference file, oldest first: the history. */
  history: ApiPreferenceFile[];
  report: RoutingReport;
}

/** One row of the report (P14 section 3), or every row pooled. Counts are cards, from their gate records. */
export interface RowReport {
  /** The row's position now; absent when pooled. */
  position?: string;
  /** Cards the gate showed, in shadow too. */
  shown: number;
  /** Cards held back, enforcing. */
  held: number;
  /** Cards shown in shadow that the settings would have held. */
  wouldHold: number;
  /** Held cards drawn for audit, and of those, answered and not yet: an unanswered audit never counts as fine. */
  drawn: number;
  auditsAnswered: number;
  auditsUnanswered: number;
  /** Cards with a final answer: a choice, the reviewer's own answer, or a rejection. */
  answered: number;
  /** Final answers that overturned the agent's pick, and answers marked "you should have asked me" (B-87tkc). */
  misses: number;
  /** A blind choice against the agent's pick that the final answer then kept: reported, not counted (B-87tkc). */
  switched: number;
  /** Final answers with a blind choice, and those whose blind choice matched the agent's pick. */
  blind: number;
  matched: number;
  /** With no misses in `answered`, the miss rate is under about this, at 95% confidence: 3 in n. */
  bound?: number;
  /**
   * Since the row last moved, or Baesian last proposed moving it (`since`): the final answers at its position without
   * a miss, and the misses. Slider proposals read these (B-y6jn6).
   */
  since?: string;
  streak: number;
  recentMisses: number;
}

export interface RoutingReport {
  /** By row name (`dependency`, `money`): every row the repo sets, and the fixed rows that have cards. */
  rows: Record<string, RowReport>;
  pooled: RowReport;
  /** Cards filed before the gate, counted on their rows as "Today" showed them. */
  beforeGate: number;
}

/** What `GET /api/presets` returns: the rows, positions and presets, what each would have held, and the setup survey. */
export interface ApiPresets {
  rows: { row: string; name: string; floor?: string; fixed?: true }[];
  positions: { position: string; name: string; level?: string }[];
  presets: { id: string; name: string; summary: string; settings: Settings; replay: Replay }[];
  /** The settings in force, replayed the same way. */
  inForce: { settings: Settings; replay: Replay };
  /** The setup survey (B-5na1k): example decisions, each asked the same question. */
  survey: { question: string; see: string; fine: string; items: SurveyItem[] };
}

/**
 * What the client sends to `POST /api/preferences` (D147): a change to the preferences. `replaces` names the file in
 * force it was made from, and must be the newest (otherwise 409). `preset` starts from a preset's rows; with none, the
 * survey's answers pick one (B-5na1k). Any row, the mode, the rates and the burn-in may be given too, over the file in
 * force. The server adds who wrote it, and when.
 */
export type ApiPreferencesInput = Partial<
  Pick<
    Preferences,
    | "mode" | "row_public_api" | "row_schema" | "row_dependency" | "row_infra" | "row_user_facing" | "row_security" | "row_privacy" | "row_other"
    | "rate_agent_decides" | "rate_sample" | "burn_in" | "reason" | "survey_see" | "survey_fine"
  >
> & { replaces?: string; preset?: string };

/** What the client sends to `POST /api/verdicts`. The server adds `reviewer` and `client`. */
export type ApiVerdictInput = Pick<Verdict, "card" | "revision" | "response"> &
  Partial<Pick<Verdict, "choice" | "comment" | "first_choice" | "make_rule" | "retire_rules" | "should_have_asked">>;

/** What the client sends to `POST /api/aliases` to merge two topics (D44, D111). The server adds who merged them. */
export interface ApiAliasInput {
  from: string;
  to: string;
}

/** The milliseconds after which a waiting marker counts as gone; the same as the store's. */
export const WAITING_STALE_MS = 90_000;
