import { type GatePaths, pathsLoosening } from "./gate-paths.js";
import type { Fact, Level, Response } from "./schema.js";

// The gate's rules (M8, P14, P16): rows, positions, presets, and how a card's stated facts become an outcome at filing
// (D144, D145). Pure and deterministic, with nothing from Node and no runtime import but the commit gate's paths, pure
// too, so the CLI, CI (`baesian verify`), a relay later (D158) and the client all reach the same answer. The store runs it at filing and writes its record;
// docs/vault/Modules/src-routing.md describes it.

// ---------------------------------------------------------------- rows and positions

/** The rows a repo sets, keyed by name in the preference file (`row_<name>`): six sliders, security and privacy (D146). */
export const ROWS = ["public_api", "schema", "dependency", "infra", "user_facing", "security", "privacy", "other"] as const;
export type Row = (typeof ROWS)[number];

/** The rows fixed at "never without me", with no key in the preference file (D146). */
export const FIXED_ROWS = ["publishes", "money", "data_loss"] as const;
export type FixedRow = (typeof FIXED_ROWS)[number];
export type AnyRow = Row | FixedRow;
export const ALL_ROWS = [...ROWS, ...FIXED_ROWS] as const;

/** The five positions, from the loosest (P14's scale). The two lowest hold a card back; the rest show it at a level. */
export const POSITIONS = ["agent-decides", "sample", "tell-me", "stop-and-ask", "never-without-me"] as const;
export type Position = (typeof POSITIONS)[number];

export type Mode = "shadow" | "enforce";

/** What the client calls each row, by its consequence (P14). */
export const ROW_NAMES: Record<AnyRow, string> = {
  public_api: "Public interfaces and module boundaries",
  schema: "Data formats",
  dependency: "Runtime dependencies",
  infra: "Delivery and infrastructure",
  user_facing: "Product behaviour",
  security: "Security",
  privacy: "Privacy",
  other: "Anything else that's hard to undo",
  publishes: "Publishing",
  money: "Spending",
  data_loss: "Destroying data",
};

export const POSITION_NAMES: Record<Position, string> = {
  "agent-decides": "let the agent decide",
  sample: "check a sample afterwards",
  "tell-me": "tell me but carry on",
  "stop-and-ask": "stop and ask",
  "never-without-me": "never without me",
};

/** The level a shown card gets at each position. The two lowest positions hold it back. */
export const LEVEL_AT: Partial<Record<Position, Level>> = { "tell-me": "provisional", "stop-and-ask": "blocking", "never-without-me": "hard" };

/** The lowest a row may be set: security, and privacy beside it, no lower than "tell me but carry on" (D146, B-z3agk). */
export const ROW_FLOOR: Partial<Record<Row, Position>> = { security: "tell-me", privacy: "tell-me" };

/** The row each of the D11 facts falls in. A card with no fact falls in `other`. */
export const ROW_OF_FACT: Record<Fact, AnyRow> = {
  "public-api": "public_api",
  schema: "schema",
  dependency: "dependency",
  infra: "infra",
  "user-facing": "user_facing",
  security: "security",
  privacy: "privacy",
  publishes: "publishes",
  money: "money",
  "data-loss": "data_loss",
};

/** Which row a card counts in when several of its rows sit at the same position: the fixed rows, then security and privacy. */
const ROW_ORDER: readonly AnyRow[] = ["publishes", "money", "data_loss", "security", "privacy", "public_api", "schema", "infra", "dependency", "user_facing", "other"];

export const rank = (p: Position): number => POSITIONS.indexOf(p);
const LEVELS: readonly Level[] = ["provisional", "blocking", "hard"];
export const levelRank = (l: Level): number => LEVELS.indexOf(l);
export const higherLevel = (a: Level, b: Level | undefined): Level => (b !== undefined && levelRank(b) > levelRank(a) ? b : a);
export const isFixed = (row: AnyRow): row is FixedRow => (FIXED_ROWS as readonly string[]).includes(row);

/** One stop stricter or looser, within the row's floor; undefined at either end (B-y6jn6). */
export function stop(row: Row, from: Position, dir: "up" | "down"): Position | undefined {
  const i = rank(from) + (dir === "up" ? 1 : -1);
  const floor = ROW_FLOOR[row];
  if (i < (floor ? rank(floor) : 0) || i >= POSITIONS.length) return undefined;
  return POSITIONS[i];
}

// ---------------------------------------------------------------- settings and presets

/** What the gate applies: a preference file's rows, its mode, and its audit draw (P16 section 2). */
export interface Settings {
  mode: Mode;
  rows: Record<Row, Position>;
  /** The chance a held card is drawn for audit, at "let the agent decide" and at "check a sample" (B-fgc4y). */
  rate_agent_decides: number;
  rate_sample: number;
  /** How many of each row's first held cards are all drawn (B-fgc4y). */
  burn_in: number;
  /** What the commit gate looks at (B-qkek1): each list left out is the built-in one. */
  paths: GatePaths;
}

export interface Preset {
  id: "today" | "fewer-interruptions" | "hands-off";
  name: string;
  summary: string;
  rows: Record<Row, Position>;
}

const tellMe: Record<Row, Position> = {
  public_api: "tell-me",
  schema: "tell-me",
  dependency: "tell-me",
  infra: "tell-me",
  user_facing: "tell-me",
  security: "never-without-me",
  privacy: "never-without-me",
  other: "tell-me",
};

/**
 * What a preference change loosens, against the settings in force before it (D163): each row moved toward held,
 * enforcing turned on, and a lower audit rate or burn-in (B-shndb), which brings fewer held cards back to you; and a
 * commit gate that sees less, by its globs (B-qkek1, `pathsLoosening()`). Each lets more past you, so in a hosted repo it
 * takes your passkey; tightening doesn't.
 */
export function loosening(before: Settings, after: Settings): string[] {
  const out: string[] = [];
  if (before.mode === "shadow" && after.mode === "enforce") out.push("it turns enforcing on");
  for (const row of ROWS) {
    if (rank(after.rows[row]) < rank(before.rows[row])) out.push(`it moves ${row} from ${before.rows[row]} to ${after.rows[row]}`);
  }
  const percent = (x: number) => `${Math.round(x * 1000) / 10}%`;
  for (const rate of ["rate_agent_decides", "rate_sample"] as const) {
    if (after[rate] < before[rate]) out.push(`it lowers ${rate} from ${percent(before[rate])} to ${percent(after[rate])}`);
  }
  if (after.burn_in < before.burn_in) out.push(`it lowers burn_in from ${before.burn_in} to ${after.burn_in}`);
  out.push(...pathsLoosening(before.paths, after.paths));
  return out;
}

/** The three presets (B-wwxa3), from P14 section 4's table: security and privacy at "never without me" in all three. */
export const PRESETS: readonly Preset[] = [
  { id: "today", name: "Today", summary: "Every card reaches you, as it does now.", rows: tellMe },
  {
    id: "fewer-interruptions",
    name: "Fewer interruptions",
    summary: "Dependencies, infrastructure and anything else go ahead, and a sample comes back to you.",
    rows: { ...tellMe, dependency: "sample", infra: "sample", other: "sample" },
  },
  {
    id: "hands-off",
    name: "Hands-off",
    summary: "Every row but security and privacy goes ahead; dependencies and anything else are the agent's, with fewer audits.",
    rows: { ...tellMe, public_api: "sample", schema: "sample", infra: "sample", user_facing: "sample", dependency: "agent-decides", other: "agent-decides" },
  },
];

/**
 * Final answers in a row without a miss before Baesian proposes loosening a row (B-y6jn6): the count that bounds a miss
 * rate under 10% (P14). The calibration panel marks it on each row's bar, as what it takes to judge a row (D180).
 */
export const LOOSEN_AFTER = 29;

/** The audit rates and burn-in every preset starts with (B-fgc4y): 1 in 10, 1 in 3, and each row's first 10 held cards. */
export const AUDIT_DEFAULTS = { rate_agent_decides: 0.1, rate_sample: 1 / 3, burn_in: 10 } as const;

/** With no preference file, a repo runs "Today" in shadow, which routes exactly as Baesian did before the gate (P14). */
export const TODAY: Settings = { mode: "shadow", rows: PRESETS[0]!.rows, ...AUDIT_DEFAULTS, paths: {} };

// ---------------------------------------------------------------- the rules (rules-1)

/** The rules' version, in every gate record. */
export const GATE_VERSION = "rules-1";

/** What set a card's outcome (P16 section 3). */
export type GateReason = "row" | "floor" | "one-way" | "agent" | "baesian" | "answer" | "chat" | "error";

/**
 * Who a card is from, for the gate: an agent's decision; a card Baesian files itself (conflicts, rule drafts, convention
 * and slider cards), which always reaches you; a revision that follows your answer, or a reply, which is shown too; or a
 * choice you already answered in chat (B-hswmx), shown so you confirm it.
 */
export type GateSource = "agent" | "baesian" | "answer" | "chat";

export interface GateInput {
  touches: readonly Fact[];
  reverse: "cheap" | "moderate" | "one-way";
  /** The level the draft asked for, if any. It only raises a shown card's level (D144, B-chq61). */
  asked?: Level | undefined;
  source: GateSource;
  /** The card's draw, a number in [0, 1) from its ID and revision (`drawOf()`), for the audit. */
  draw: number;
  /** How many held cards the row has had before this one, for the burn-in: counted by the caller, once the row is known. */
  heldBefore: (row: AnyRow) => number;
}

export interface GateDecision {
  row: AnyRow;
  position: Position;
  outcome: "shown" | "held";
  /** The level it's shown at, when shown. */
  level?: Level;
  reason: GateReason;
  /** When held: the draw, the chance it had, the row's earlier held cards, and whether it was drawn (and by the burn-in). */
  draw?: number;
  p?: number;
  held_before?: number;
  burn_in?: boolean;
  drawn?: boolean;
}

/** The strictest row a card's facts fall in, and its position (P14: strictest wins); `other` for a card with none. */
export function rowOf(touches: readonly Fact[], settings: Settings): { row: AnyRow; position: Position } {
  const positionOf = (row: AnyRow): Position => (isFixed(row) ? "never-without-me" : settings.rows[row]);
  const rows = touches.length ? [...new Set(touches.map((f) => ROW_OF_FACT[f]))] : ["other" as const];
  let best = rows[0]!;
  for (const row of rows.slice(1)) {
    const d = rank(positionOf(row)) - rank(positionOf(best));
    if (d > 0 || (d === 0 && ROW_ORDER.indexOf(row) < ROW_ORDER.indexOf(best))) best = row;
  }
  return { row: best, position: positionOf(best) };
}

/**
 * The gate's outcome for a card (D145): its strictest row's position, raised by the floors, by the one-way rule (B-yebnn)
 * and for Baesian's own cards and revisions that follow an answer, each only raising it. "Tell me but carry on" or higher
 * shows it at that position's level, raised by the agent's (B-chq61: a level is a minimum only when it's shown);
 * either of the two lowest holds it back, drawn for audit at that position's rate, or always within the row's burn-in
 * (B-fgc4y). In shadow this is what it would have done (D148).
 */
export function route(input: GateInput, settings: Settings): GateDecision {
  const { row, position } = rowOf(input.touches, settings);
  let at = position;
  let reason: GateReason = isFixed(row) ? "floor" : "row";
  const raise = (to: Position, why: GateReason) => {
    if (rank(at) < rank(to)) {
      at = to;
      reason = why;
    }
  };
  if (!isFixed(row) && ROW_FLOOR[row]) raise(ROW_FLOOR[row]!, "floor");
  if (input.reverse === "one-way") raise("tell-me", "one-way");
  if (input.source !== "agent") raise("tell-me", input.source);
  const shownAt = LEVEL_AT[at];
  if (shownAt) {
    const level = higherLevel(shownAt, input.asked);
    return { row, position, outcome: "shown", level, reason: level !== shownAt ? "agent" : reason };
  }
  const p = at === "agent-decides" ? settings.rate_agent_decides : settings.rate_sample;
  const held_before = input.heldBefore(row);
  const burn_in = held_before < settings.burn_in;
  return { row, position, outcome: "held", reason, draw: input.draw, p, held_before, burn_in, drawn: burn_in || input.draw < p };
}

/**
 * The level a card is written with, the level in force locally (P16 section 3): a shown card's level; a held card's
 * "provisional" when enforcing, since the agent goes ahead with its pick (B-chq61); and in shadow, where nothing is
 * held, the agent's level or provisional, as Baesian showed it before the gate.
 */
export function levelInForce(d: GateDecision, mode: Mode, asked: Level | undefined): Level {
  if (d.outcome === "shown") return d.level!;
  return mode === "enforce" ? "provisional" : higherLevel("provisional", asked);
}

// ---------------------------------------------------------------- misses (B-87tkc, B-ab06a)

/** Answers that end a card one way or the other: a choice, the reviewer's own answer, or a rejection. */
export const FINAL: ReadonlySet<Response> = new Set(["accept", "alternative", "correction", "reject"]);
/** Final answers that overturn the agent's pick. */
export const OVERTURNS: ReadonlySet<Response> = new Set(["alternative", "correction", "reject"]);

/**
 * Why a card is a miss, the first that applies: a final answer that overturns the agent's pick; any answer marked "you
 * should have asked me" (B-87tkc); or, on a crux of preference, a blind choice against the agent's pick, whatever the
 * final answer (B-ab06a).
 */
export type MissBy = "overturn" | "asked" | "blind";

/** What a card's answers say for its row: its final answer, and whether it's a miss (B-87tkc, B-ab06a). */
export interface Outcome {
  /** The latest final answer, if any: its response, when, and the blind choice made before it. */
  final?: { response: Response; at: string; first_choice?: "proposal" | "alternative" };
  /**
   * A final answer that overturns the agent's pick, or any answer marked "you should have asked me"; and on a crux of
   * preference, a final answer whose blind choice went against the pick, even when the final answer kept it.
   */
  miss: boolean;
  /** Why, when it's a miss. */
  missBy?: MissBy;
  /**
   * A blind choice against the agent's pick that the final answer kept (B-87tkc): on a crux of fact it's reported and
   * never counted; on one of preference it's a miss as well (B-ab06a).
   */
  switched: boolean;
}

/**
 * A card's outcome from its verdicts. `preference` is whether its crux is one of preference (`crux_preference`, on its
 * latest revision): then the blind choice is the answer that counts, since the agent's case can persuade you of what to
 * value but holds no fact you lacked (B-ab06a). On a crux of fact B-87tkc stands: coming round after the case isn't a miss.
 */
export function outcomeOf(
  verdicts: readonly { response: Response; at: string; first_choice?: "proposal" | "alternative" | undefined; should_have_asked?: boolean | undefined }[],
  opts: { preference?: boolean | undefined } = {},
): Outcome {
  const last = [...verdicts].reverse().find((v) => FINAL.has(v.response));
  const asked = verdicts.some((v) => v.should_have_asked === true);
  if (!last) return asked ? { miss: true, missBy: "asked", switched: false } : { miss: false, switched: false };
  const final = { response: last.response, at: last.at, ...(last.first_choice ? { first_choice: last.first_choice } : {}) };
  const missBy: MissBy | undefined = OVERTURNS.has(last.response) ? "overturn" : asked ? "asked" : opts.preference === true && last.first_choice === "alternative" ? "blind" : undefined;
  return { final, miss: missBy !== undefined, ...(missBy ? { missBy } : {}), switched: last.response === "accept" && last.first_choice === "alternative" };
}

/**
 * Whether a card was answered in chat (B-hswmx): its latest revision says so, or an answer on an earlier one was marked
 * seen. Its choice wasn't made blind, so calibration leaves it out of every measure: the report's counts, the replay of
 * past cards, and the slider proposals. It's in the record, and can become a rule, like any card.
 */
export function answeredInChat(c: { meta: { answered_in_chat?: string | undefined }; verdicts: readonly { seen?: true | undefined }[] }): boolean {
  return c.meta.answered_in_chat !== undefined || c.verdicts.some((v) => v.seen === true);
}

// ---------------------------------------------------------------- Baesian's own cards

/** The name Baesian files its own cards under: conflict, convention and slider cards. */
export const BAESIAN = "baesian";

/**
 * Baesian's own cards: conflicts (D35), rule drafts (D110), convention cards (D161) and slider proposals (B-y6jn6). The
 * gate always shows them, and the report, the replay and the proposals leave them out: they're not an agent's decisions.
 */
export function isOwnCard(meta: { source_agent: string; rule?: string | undefined; convention?: string | undefined; pref_row?: string | undefined; conflict_of?: readonly string[] | undefined }): boolean {
  return meta.source_agent === BAESIAN || meta.rule !== undefined || meta.convention !== undefined || meta.pref_row !== undefined || meta.conflict_of !== undefined;
}

// ---------------------------------------------------------------- what a setting would have held

/** A past card, as the replay reads it. */
export interface ReplayCard {
  id: string;
  touches: readonly Fact[];
  reverse: "cheap" | "moderate" | "one-way";
  asked?: Level | undefined;
  source: GateSource;
  outcome: Outcome;
}

export interface ReplayRow {
  cards: number;
  shown: number;
  held: number;
  /** Held cards that were misses (`Outcome.miss`): overturned, marked "you should have asked me", or on a crux of preference chosen against blind. */
  heldMissed: number;
  /** About how many of the held cards would have come back as audits: each row's burn-in, then each card's chance. */
  audits: number;
}

export interface Replay {
  rows: Partial<Record<AnyRow, ReplayRow>>;
  total: ReplayRow;
  /** The cards it would have held, oldest first. */
  held: string[];
}

/**
 * A card as `GET /api/state` gives it, as the replay reads it, or undefined for one it leaves out: Baesian's own,
 * withdrawn ones, and those answered in chat (B-hswmx). So the client can replay any setting itself, a single row moved,
 * say, as the server does for presets.
 */
export function replayCardOf(c: {
  meta: {
    id: string;
    touches: readonly Fact[];
    reverse: "cheap" | "moderate" | "one-way";
    source_agent: string;
    rule?: string | undefined;
    convention?: string | undefined;
    pref_row?: string | undefined;
    conflict_of?: readonly string[] | undefined;
    answered_in_chat?: string | undefined;
    crux_preference?: boolean | undefined;
  };
  status: string;
  verdicts: readonly (Parameters<typeof outcomeOf>[0][number] & { seen?: true | undefined })[];
  gate?: { asked?: Level | undefined; source: GateSource } | undefined;
}): ReplayCard | undefined {
  if (isOwnCard(c.meta) || c.gate?.source === "baesian" || c.status === "withdrawn" || answeredInChat(c)) return undefined;
  return { id: c.meta.id, touches: c.meta.touches, reverse: c.meta.reverse, ...(c.gate?.asked ? { asked: c.gate.asked } : {}), source: c.gate?.source ?? "agent", outcome: outcomeOf(c.verdicts, { preference: c.meta.crux_preference }) };
}

/**
 * What a setting would have done to past cards, by re-running the rules over them (P14 section 4). Under "Today" the
 * shadow record never shows a card as would-have-held, so this is how the client shows what a looser preset would
 * hold. Cards in filing order; the audits are an expectation, since the draw needs a hash the client doesn't compute.
 */
export function replay(cards: readonly ReplayCard[], settings: Settings): Replay {
  const empty = (): ReplayRow => ({ cards: 0, shown: 0, held: 0, heldMissed: 0, audits: 0 });
  const rows: Partial<Record<AnyRow, ReplayRow>> = {};
  const total = empty();
  const heldSoFar = new Map<AnyRow, number>();
  const held: string[] = [];
  for (const c of cards) {
    const d = route({ touches: c.touches, reverse: c.reverse, asked: c.asked, source: c.source, draw: 1, heldBefore: (row) => heldSoFar.get(row) ?? 0 }, settings);
    const r = (rows[d.row] ??= empty());
    for (const t of [r, total]) {
      t.cards++;
      if (d.outcome === "shown") t.shown++;
      else {
        t.held++;
        if (c.outcome.miss) t.heldMissed++;
        t.audits += d.burn_in ? 1 : d.p!;
      }
    }
    if (d.outcome === "held") {
      heldSoFar.set(d.row, (heldSoFar.get(d.row) ?? 0) + 1);
      held.push(c.id);
    }
  }
  return { rows, total, held };
}

// ---------------------------------------------------------------- the setup survey (B-5na1k)

/**
 * One example decision for the setup survey, in Baesian's own card format (B-5na1k): what an agent would file for a
 * row the presets differ on. The person answers "see" (show me ones like it) or "fine" (fine not seeing it).
 */
export interface SurveyItem {
  row: Row;
  title: string;
  question: string;
  doing: string;
  touches: Fact[];
  reverse: "cheap" | "moderate" | "one-way";
  proposal: string;
  proposal_then: string;
  alternative: string;
  alternative_then: string;
}

/** The question every survey card asks, and its two answers. */
export const SURVEY_QUESTION = {
  question: "Would you be fine not seeing a decision like this one, and checking a sample afterwards?",
  see: "Show me ones like it",
  fine: "Fine not seeing it",
} as const;

export const SURVEY: readonly SurveyItem[] = [
  {
    row: "dependency",
    title: "The date-parsing library",
    question: "Which library should parse dates in the import step?",
    doing: "writing the CSV import",
    touches: ["dependency"],
    reverse: "cheap",
    proposal: "date-fns",
    proposal_then: "a small runtime dependency is added to package.json",
    alternative: "The platform's Intl API",
    alternative_then: "no dependency, and a little more code to handle formats",
  },
  {
    row: "infra",
    title: "Caching dependencies in CI",
    question: "Should the CI workflow cache installed packages between runs?",
    doing: "speeding up the test workflow",
    touches: ["infra"],
    reverse: "cheap",
    proposal: "Cache them",
    proposal_then: "the workflow restores packages from a cache keyed on the lockfile",
    alternative: "Install fresh each run",
    alternative_then: "runs stay slower, with nothing cached to go stale",
  },
  {
    row: "other",
    title: "Retrying failed uploads",
    question: "How should the uploader retry a failed upload?",
    doing: "making uploads survive a flaky network",
    touches: [],
    reverse: "moderate",
    proposal: "Exponential backoff, five tries",
    proposal_then: "a failed upload is retried over about a minute, then reported",
    alternative: "Fail at once",
    alternative_then: "the user sees the failure straight away and retries by hand",
  },
  {
    row: "user_facing",
    title: "The empty search page",
    question: "What should search show when nothing matches?",
    doing: "building the search page",
    touches: ["user-facing"],
    reverse: "cheap",
    proposal: "Suggestions from recent searches",
    proposal_then: "the empty page lists the user's last five searches",
    alternative: "A plain message",
    alternative_then: "the page says nothing matched, and nothing more",
  },
  {
    row: "schema",
    title: "Storing tags on a run",
    question: "How should a run's tags be stored?",
    doing: "adding tags to runs",
    touches: ["schema"],
    reverse: "moderate",
    proposal: "A tags table",
    proposal_then: "a migration adds a table joining runs to tags",
    alternative: "A JSON column on runs",
    alternative_then: "a migration adds one column; tags can't be indexed",
  },
  {
    row: "public_api",
    title: "Paging the runs endpoint",
    question: "How should the runs endpoint page its results?",
    doing: "adding paging to the API",
    touches: ["public-api"],
    reverse: "moderate",
    proposal: "Cursor tokens",
    proposal_then: "clients pass an opaque cursor from the last page",
    alternative: "Page numbers",
    alternative_then: "clients pass page and size, and can jump to any page",
  },
];

/**
 * The preset closest to the survey's answers (B-5na1k): the one whose rows agree with the most answers, a "fine" agreeing
 * with a row that holds cards back and a "see" with one that shows them. A tie goes to the stricter preset.
 */
export function suggestPreset(answers: { see?: readonly Row[]; fine?: readonly Row[] }): Preset {
  const held = (p: Position) => rank(p) < rank("tell-me");
  let best = PRESETS[0]!;
  let bestScore = -1;
  for (const preset of PRESETS) {
    const score = (answers.fine ?? []).filter((r) => held(preset.rows[r])).length + (answers.see ?? []).filter((r) => !held(preset.rows[r])).length;
    if (score > bestScore) {
      best = preset;
      bestScore = score;
    }
  }
  return best;
}
