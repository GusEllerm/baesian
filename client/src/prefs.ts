import type { ApiCard, ApiPreferencesInput, ApiRouting, RowReport } from "../../src/api";
import {
  ALL_ROWS,
  type AnyRow,
  FIXED_ROWS,
  type Mode,
  POSITIONS,
  POSITION_NAMES,
  PRESETS,
  type Position,
  ROWS,
  ROW_FLOOR,
  ROW_NAMES,
  type Replay,
  type ReplayCard,
  type Row,
  type Settings,
  rank,
  replay,
  replayCardOf,
  suggestPreset,
} from "../../src/routing";

// M8b: the client's side of the preferences (D147: only the client writes them). A draft of the rows and the mode,
// what it would have held of past cards (`replay()`, the rules the gate runs), the change it sends, and what each stop
// does, in words (D180). Pure, so it's tested on its own (prefs.test.ts).

export { ALL_ROWS, FIXED_ROWS, POSITIONS, POSITION_NAMES, PRESETS, ROWS, ROW_FLOOR, ROW_NAMES };
export type { AnyRow, Mode, Position, Row };

/** The setup survey's answers (B-5na1k): the rows whose example you'd want to see, and those you'd be fine not seeing. */
export interface SurveyAnswers {
  see: Row[];
  fine: Row[];
}

/** The survey's answers as you give them, by the row each example stands for; a row you weren't sure about has none. */
export type Answers = Partial<Record<Row, "see" | "fine">>;

export const surveyAnswersOf = (answers: Answers): SurveyAnswers => ({ see: ROWS.filter((r) => answers[r] === "see"), fine: ROWS.filter((r) => answers[r] === "fine") });

/**
 * What the survey sends to use its suggestion: its answers, kept in the file, and the preset they suggest, which the
 * server would pick from them too (B-5na1k). Named, so a survey with no answer either way still sets "Today"'s rows.
 */
export function surveyChange(answers: Answers, replaces: string | undefined): ApiPreferencesInput {
  const a = surveyAnswersOf(answers);
  return { ...(replaces ? { replaces } : {}), preset: suggestPreset(a).id, ...(a.see.length ? { survey_see: a.see } : {}), ...(a.fine.length ? { survey_fine: a.fine } : {}) };
}

/** What the preferences panel edits: every row, the mode, and where the draft started from, if not the file in force. */
export interface Draft {
  mode: Mode;
  rows: Record<Row, Position>;
  /** A preset picked in the panel or suggested by the survey: the file records it as the one it started from. */
  preset?: string;
  survey?: SurveyAnswers;
}

export const draftOf = (settings: Settings): Draft => ({ mode: settings.mode, rows: { ...settings.rows } });

/** Whether the draft differs from the settings in force. */
export const dirty = (draft: Draft, settings: Settings): boolean =>
  draft.mode !== settings.mode || ROWS.some((r) => draft.rows[r] !== settings.rows[r]) || draft.survey !== undefined;

/** The preset whose rows the draft's match, if any. */
export const presetOf = (rows: Record<Row, Position>) => PRESETS.find((p) => ROWS.every((r) => p.rows[r] === rows[r]));

/** The lowest stop a row may take: its floor (D146), or the bottom. Fixed rows take none but the top. */
export const lowest = (row: Row): Position => ROW_FLOOR[row] ?? POSITIONS[0];
export const allowed = (row: Row, p: Position): boolean => rank(p) >= rank(lowest(row));

/** A stop that holds cards back: the two lowest (P14's scale). */
export const holds = (p: Position): boolean => rank(p) < rank("tell-me");

/**
 * The file the change replaces: the newest (D147). With none, nothing; with one that can't be read, the gate applies
 * "Today" and names it in `problem`, and a change still has to replace it.
 */
export function replacesOf(routing: ApiRouting): string | undefined {
  if (routing.preferences) return routing.preferences.name;
  return routing.problem?.match(/preferences\/(\S+?\.json)/)?.[1];
}

/** The change to send to `POST /api/preferences`: every row and the mode, over the file it replaces. */
export function changeOf(draft: Draft, replaces: string | undefined, reason?: string): ApiPreferencesInput {
  const rows = Object.fromEntries(ROWS.map((r) => [`row_${r}`, draft.rows[r]])) as Pick<ApiPreferencesInput, `row_${Row}`>;
  return {
    ...(replaces ? { replaces } : {}),
    ...(draft.preset ? { preset: draft.preset } : {}),
    mode: draft.mode,
    ...rows,
    ...(draft.survey?.see.length ? { survey_see: draft.survey.see } : {}),
    ...(draft.survey?.fine.length ? { survey_fine: draft.survey.fine } : {}),
    ...(reason?.trim() ? { reason: reason.trim() } : {}),
  };
}

/**
 * The past cards as the replay reads them, in filing order, as the server counts them (`countedCards`): by the gate
 * record's time, or the card's for one filed before the gate. Baesian's own cards and withdrawn ones are left out.
 */
export function pastCards(cards: readonly ApiCard[]): ReplayCard[] {
  return [...cards]
    .sort((a, b) => (a.gate?.at ?? a.meta.created).localeCompare(b.gate?.at ?? b.meta.created))
    .flatMap((c) => replayCardOf(c) ?? []);
}

/** What a draft would have held of past cards. */
export const replayDraft = (cards: readonly ReplayCard[], draft: Draft, settings: Settings): Replay => replay(cards, { ...settings, mode: draft.mode, rows: draft.rows });

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * What a setting would have held of past cards, in words: "Would have held back 2 of your 56 past cards.", or with a
 * subject, "These settings would have…". Held cards you answered against the agent are the misses it would have hidden.
 */
export function heldWords(r: { held: number; cards: number; heldMissed: number }, subject?: string): string {
  const would = subject ? `${subject} would` : "Would";
  if (!r.cards) return "No past cards to try it on yet.";
  if (!r.held) return `${would} have shown you ${r.cards === 1 ? "your one past card" : `all ${r.cards} of your past cards`}.`;
  const missed = r.heldMissed ? ` You answered ${r.heldMissed} of ${r.held === 1 ? "it" : "those"} against the agent.` : "";
  return `${would} have held back ${r.held} of your ${plural(r.cards, "past card")}.${missed}`;
}

// ---------------------------------------------------------------- what each stop does, in words (D180)

/** What falls in each row, from the D11 facts its cards state (`Fact` in src/schema.ts, and the gate's detectors). */
export const ROW_WHAT: Record<AnyRow, string> = {
  public_api: "A public API, a URL scheme, or where one module ends and another begins.",
  schema: "A schema, a migration, or how something is stored on disk.",
  dependency: "A package the code needs to run, added or removed.",
  infra: "CI, infrastructure, or how the code is deployed.",
  user_facing: "Anything the product's users see or do.",
  security: "Who can get in, what they can reach, and the secrets that guard it.",
  privacy: "What's kept about people, and who sees it.",
  other: "Costly to reverse, and none of the above.",
  data_loss: "Deleting or overwriting what's stored.",
  money: "Anything that costs money.",
  publishes: "Releasing or posting something others will see.",
};

/** Each stop's name on its button, short enough for five in a row on a phone; the full name is its tooltip. */
export const STOP_SHORT: Record<Position, string> = {
  "agent-decides": "Agent decides",
  sample: "Sample after",
  "tell-me": "Tell me, carry on",
  "stop-and-ask": "Stop and ask",
  "never-without-me": "Never without me",
};

/** A stop's name as a heading: "Never without me". */
export const stopTitle = (p: Position): string => POSITION_NAMES[p].charAt(0).toUpperCase() + POSITION_NAMES[p].slice(1);

/** How long a blocking card's agent waits for you, in words: `baesian wait`'s budget (`DEFAULT_TIMEOUT_MS`, src/wait.ts). */
const WAIT_WORDS = "about 9 minutes";

/** An audit rate in words: "about 1 in 3", "every one" or "none". */
export function rateWords(r: number): string {
  if (r >= 1) return "every one";
  if (r <= 0) return "none";
  return `about 1 in ${Math.round(1 / r)}`;
}

/** How a held stop's cards come back to you as audits, in a sentence for the table: the rate, and the row's burn-in. */
function auditWords(rate: number, burnIn: number): string {
  const first = burnIn === 1 ? "a row's first one" : `a row's first ${burnIn}`;
  if (rate >= 1) return "Every one comes to you anyway, to check.";
  if (rate <= 0) return burnIn ? `Only ${first} ${burnIn === 1 ? "comes" : "come"} to you, to check.` : "None comes to you to check.";
  return `About 1 in ${Math.round(1 / rate)} comes to you anyway, at random, to check${burnIn ? `; so does ${burnIn === 1 ? first : `each of ${first}`}` : ""}.`;
}

export interface StopRow {
  position: Position;
  /** Its level when shown, or "held" for the two lowest stops. */
  chip: string;
  card: string;
  agent: string;
}

/**
 * The five stops, top to bottom from "never without me" (D180): what each does to a card, and what the agent does
 * meanwhile. The audit rates and burn-in come from the settings in force; the passkey is the website's (D139).
 */
export function stopRows(s: Pick<Settings, "rate_agent_decides" | "rate_sample" | "burn_in">, hosted: boolean): StopRow[] {
  return [
    { position: "never-without-me", chip: "hard", card: `Reaches you.${hosted ? " Answering it takes your passkey." : ""}`, agent: "Stops. It never goes ahead without your answer." },
    { position: "stop-and-ask", chip: "blocking", card: "Reaches you.", agent: `Waits for you while you're here, up to ${WAIT_WORDS}, then goes ahead with its pick until you answer.` },
    { position: "tell-me", chip: "provisional", card: "Reaches you.", agent: "Goes ahead with its pick at once, and hears your answer at its next stopping point. If you choose otherwise, it reworks." },
    { position: "sample", chip: "held", card: `Goes to your Held back list, not your queue. ${auditWords(s.rate_sample, s.burn_in)}`, agent: "Goes ahead with its pick. Its branch can merge without your answer, and you can still answer it later." },
    { position: "agent-decides", chip: "held", card: `Goes to your Held back list. ${auditWords(s.rate_agent_decides, s.burn_in)}`, agent: "Goes ahead with its pick, as above." },
  ];
}

/** The Holding back switch, in two sentences: what the mode does now, and what to know about it. */
export function holdingWords(mode: Mode, hosted: boolean): { now: string; more: string } {
  if (mode === "shadow") {
    return {
      now: "Shadow: your settings are tried out, not applied. Every card still reaches you.",
      more: "Baesian notes which cards the two lowest stops would have held back, so a row set to one of them shows what holding back would have cost you before you turn it on.",
    };
  }
  return {
    now: "On: cards on rows at the two lowest stops skip your queue. Their agents carry on, and a random sample comes back to you.",
    more: `${hosted ? "Turning it on takes your passkey, because it lets cards past you. " : ""}Rows at the three upper stops are unchanged.`,
  };
}

/**
 * What a row's stop means now, in a sentence (D180). For the two lowest stops it depends on the mode, and says how its
 * held cards come back: the rest of the row's burn-in (`held`, the row's cards held back so far), then the stop's rate.
 */
export function stopMeans(position: Position, mode: Mode, s: Pick<Settings, "rate_agent_decides" | "rate_sample" | "burn_in">, opts: { hosted: boolean; held: number }): string {
  if (position === "never-without-me") return `These cards reach you, and the agent stops until you answer${opts.hosted ? ", with your passkey" : ""}.`;
  if (position === "stop-and-ask") return `These cards reach you, and the agent waits for your answer while you're here, up to ${WAIT_WORDS}, before going ahead with its pick.`;
  if (position === "tell-me") return "These cards reach you, and the agent carries on with its pick meanwhile, so you never hold it up. It hears your answer at its next stopping point.";
  const rate = position === "sample" ? s.rate_sample : s.rate_agent_decides;
  const left = Math.max(0, s.burn_in - opts.held);
  const shadow = mode === "shadow";
  const some = rate > 0 && rate < 1 ? rateWords(rate) : undefined;
  const come = (one: boolean) => (shadow ? "would come" : one ? "comes" : "come");
  const random = some && !shadow ? ", at random" : "";
  let back: string;
  if (rate >= 1) back = `every one ${come(true)} back to you`;
  else if (left) back = `the row's ${opts.held ? "next" : "first"} ${left === 1 ? "one" : left} ${come(left === 1)} back to you, then ${some ?? "none"}${random}`;
  else back = `${some ?? "none"} ${come(true)} back to you${random}`;
  if (shadow) return `In shadow, these cards still reach you. With holding back on, they'd go to your Held back list and the agent would carry on with its pick; ${back}.`;
  return `These cards skip your queue: the agent carries on with its pick, and the card waits on your Held back list. ${back.charAt(0).toUpperCase()}${back.slice(1)}.`;
}

/**
 * A row's evidence (D180): its cards so far and the misses on them, from the report; and at a stop that holds cards
 * back, how many of its past cards that stop would have held, replayed under the draft (`replay()`).
 */
export function rowEvidence(r: RowReport | undefined, replayed: { cards: number; held: number; heldMissed: number } | undefined, holdsBack: boolean): string {
  const cards = r ? r.shown + r.held + r.wouldHold : 0;
  if (!cards) return "No cards in this row yet.";
  const said = r!.misses ? `${plural(cards, "card")} so far: ${plural(r!.misses, "miss", "misses")}.` : `${plural(cards, "card")} so far: no misses.`;
  if (!holdsBack || !replayed?.cards) return said;
  const n = replayed.cards;
  const one = n === 1 && cards === 1;
  const of = n === cards ? "them" : `its ${plural(n, "past card")}`;
  const which = one ? (replayed.held ? "it would" : "it wouldn't") : !replayed.held ? `none of ${of} would` : replayed.held === n && of === "them" ? "all of them would" : `${replayed.held} of ${of} would`;
  const missed = replayed.heldMissed ? (one ? ", and it was a miss" : `, including ${plural(replayed.heldMissed, "miss", "misses")}`) : "";
  return `${said} At this stop, ${which} have been held back${missed}.`;
}

/** A row's name in a sentence: "runtime dependencies". */
export const rowInSentence = (row: string): string => {
  const name = (ROW_NAMES as Record<string, string>)[row] ?? row;
  return name.charAt(0).toLowerCase() + name.slice(1);
};

/** How a gate record held a card back, in a sentence: "Held back by your setting for runtime dependencies, “check a sample afterwards”." */
export function heldBecause(gate: { row: string; position: string; mode: Mode }): string {
  const setting = `your setting for ${rowInSentence(gate.row)}, “${POSITION_NAMES[gate.position as Position] ?? gate.position}”`;
  return gate.mode === "enforce" ? `Held back by ${setting}.` : `In shadow, ${setting} would have held this back.`;
}

/** The rows a preset holds, by stop: for the survey's suggestion. */
export function heldRows(rows: Record<Row, Position>): { sample: Row[]; agent: Row[] } {
  return { sample: ROWS.filter((r) => rows[r] === "sample"), agent: ROWS.filter((r) => rows[r] === "agent-decides") };
}

/** A list in words: "a, b and c"; "a, b and c, and d" when an item has its own "and". */
export const listWords = (xs: string[]): string => {
  if (xs.length < 2) return xs.join("");
  const comma = xs.length > 2 && xs.some((x) => / and /.test(x)) ? "," : "";
  return `${xs.slice(0, -1).join(", ")}${comma} and ${xs.at(-1)}`;
};

/** Small counts in words, for sentences. */
export const countWords = (n: number): string => ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] ?? String(n);
