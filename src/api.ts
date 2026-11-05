import type { Replay, Settings, SurveyItem } from "./routing.js";
import type { CardMeta, DeckMeta, Fallback, GateRecord, Level, Preferences, Presence, RuleMeta, RuleRetirement, Verdict } from "./schema.js";

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
  /**
   * A resolved card decided in the repo before it was linked to the service (B-3zjjx): its answer counts as one from
   * before linking (B-45xz8), not by the service's signature.
   */
  before_linking?: true;
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
  /**
   * What serves it: its process (`baesian serve`'s; absent on the relay, which has none, M9b), when it started, its clock
   * now, and how it hears of changes. The relay hears of each write as it's made, so it says `events`.
   */
  server: { pid?: number; started: string; now: string; watch: "events" | "poll" };
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
  /**
   * Cards whose text the relay removed (B-9jqt4, B-ec3kj, M9f): only their IDs, times and levels stay, so they're listed
   * without it, and can't be answered. Only the relay sets it; `baesian serve` never removes anything.
   */
  removed?: ApiRemovedCard[];
  /**
   * The merges the CLI's hooks found (D181), oldest first: each a branch merged into another, at a commit and a time, with
   * the cards it brought. For the branches panel; absent from a server that predates them.
   */
  merges?: ApiMerge[];
  /**
   * The commits that cite cards, from the ledger (D181), oldest first: each one's ID, time, branch and card. Never its
   * subject or message, which stay on the machine.
   */
  commits?: ApiCommit[];
}

/** A merge the CLI found (D181): `branch` merged into `into` at `commit`, at `at`, bringing `cards`. */
export interface ApiMerge {
  branch: string;
  into: string;
  commit: string;
  at: string;
  cards: string[];
}

/** A commit that cites a card (D181), as the ledger records it: made on `branch`, at `at`. */
export interface ApiCommit {
  commit: string;
  branch: string;
  card: string;
  at: string;
}

/** A card the relay keeps only the metadata of (M9f): no title, question or answer, only what retention keeps. */
export interface ApiRemovedCard {
  id: string;
  /** Its latest revision when its text went. */
  revision: number;
  /** Its level in force then. */
  level: Level;
  /** How it ended: answered (or superseded), withdrawn, or held back and never answered. */
  ended: "answered" | "withdrawn" | "held";
  /** When its first revision arrived on the relay. */
  filed: string;
  /** When its last file arrived: the answer, the withdrawal, or, for a held card, its latest revision. */
  settled: string;
  /** When its text was removed. */
  removed: string;
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
  /**
   * Your calibration's bar (D180): each card once, by its answers. `agreed`: a final accept whose blind choice was the
   * agent's pick. `cameRound`: a blind choice against it that the final answer kept (`switched`). Overturned is
   * `misses`, and a miss counts only there, so the three don't overlap.
   */
  agreed: number;
  cameRound: number;
  /** Left out of the bar: final accepts with no blind choice recorded, which can't say whether you chose as the agent did. */
  unblind: number;
  /** Left out of the bar: cards with no final answer and no miss: waiting, held back, deferred, passed on or returned. */
  unanswered: number;
  /** Of `unanswered`, the cards held back now, enforcing; the audits among them are `auditsUnanswered`. */
  heldWaiting: number;
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
 * survey's answers pick one (B-5na1k). Any row, the mode, the rates, the burn-in and what the commit gate looks at (B-qkek1,
 * each a whole list) may be given too, over the file in force. The server adds who wrote it, and when.
 */
export type ApiPreferencesInput = Partial<
  Pick<
    Preferences,
    | "mode" | "row_public_api" | "row_schema" | "row_dependency" | "row_infra" | "row_user_facing" | "row_security" | "row_privacy" | "row_other"
    | "rate_agent_decides" | "rate_sample" | "burn_in" | "reason" | "survey_see" | "survey_fine"
    | "gate_schema" | "gate_infra" | "gate_api" | "gate_ignore"
  >
> & { replaces?: string; preset?: string };

/** What the client sends to `POST /api/verdicts`. The server adds `reviewer` and `client`. */
export type ApiVerdictInput = Pick<Verdict, "card" | "revision" | "response"> &
  Partial<Pick<Verdict, "choice" | "comment" | "first_choice" | "make_rule" | "retire_rules" | "should_have_asked">>;

/** The fields a verdict may be sent with (`ApiVerdictInput`); anything else is refused. The local server and the relay share them. */
export const VERDICT_FIELDS: ReadonlySet<string> = new Set(["card", "revision", "response", "choice", "comment", "first_choice", "make_rule", "retire_rules", "should_have_asked"]);

/** The fields a preference change may be sent with (`ApiPreferencesInput`); anything else is refused. */
export const PREFERENCE_FIELDS: ReadonlySet<string> = new Set([
  "replaces", "preset", "mode", "rate_agent_decides", "rate_sample", "burn_in", "reason", "survey_see", "survey_fine",
  "gate_schema", "gate_infra", "gate_api", "gate_ignore",
  ...["public_api", "schema", "dependency", "infra", "user_facing", "security", "privacy", "other"].map((r) => `row_${r}`),
]);

/** What the client sends to `POST /api/aliases` to merge two topics (D44, D111). The server adds who merged them. */
export interface ApiAliasInput {
  from: string;
  to: string;
}

/** The milliseconds after which a waiting marker counts as gone; the same as the store's. */
export const WAITING_STALE_MS = 90_000;
