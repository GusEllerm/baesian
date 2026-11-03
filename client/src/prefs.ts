import type { ApiCard, ApiPreferencesInput, ApiRouting, RowReport } from "../../src/api";
import {
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
// what it would have held of past cards (`replay()`, the rules the gate runs), the change it sends, and the report's
// rows in words. Pure, so it's tested on its own (prefs.test.ts).

export { FIXED_ROWS, POSITIONS, POSITION_NAMES, PRESETS, ROWS, ROW_FLOOR, ROW_NAMES };
export type { Mode, Position, Row };

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

/** One row's past cards at a stop, in a few words, for the row in the panel. */
export function rowHeldWords(r: { held: number; cards: number } | undefined): string {
  if (!r?.cards) return "No past cards";
  if (!r.held) return `${plural(r.cards, "past card")}, all reach you`;
  return `${r.held} of ${plural(r.cards, "past card")} held back`;
}

/**
 * The upper bound on a miss rate with no misses in `n` answers, in words (P14: under about 3 in n, at 95% confidence),
 * as Baesian's slider proposals word it: "under about 1 in 9". Too few answers bound nothing worth saying.
 */
export function boundWords(n: number): string {
  const one = Math.floor(n / 3);
  return one >= 2 ? `under about 1 in ${one}` : "too few answers to bound it yet";
}

/** One row of the report, or every row pooled, in short lines: what reached you, the audits, and the misses. */
export function reportLines(r: RowReport): string[] {
  const out: string[] = [];
  const counts = [
    r.shown ? `${r.shown} reached you` : "",
    r.held ? `${r.held} held back` : "",
    r.wouldHold ? `${r.wouldHold} would have been held back` : "",
  ].filter(Boolean);
  if (!counts.length) return ["No cards yet."];
  out.push(`${counts.join(", ")}.`);
  if (r.drawn) out.push(`${plural(r.drawn, "audit")}: ${r.auditsAnswered} answered${r.auditsUnanswered ? `, ${r.auditsUnanswered} waiting for you` : ""}.`);
  if (r.answered) {
    out.push(r.misses ? `${plural(r.misses, "miss", "misses")} in ${plural(r.answered, "answer")}.` : `No misses in ${plural(r.answered, "answer")}: ${boundWords(r.answered)}.`);
  } else if (r.misses) {
    out.push(`${plural(r.misses, "miss", "misses")}.`);
  }
  return out;
}

/** The pooled line about your blind choices (P14: how often it matched the agent's pick), and switches. */
export function blindWords(r: RowReport): string | undefined {
  if (!r.blind) return undefined;
  const switched = r.switched ? ` ${plural(r.switched, "time")} you switched to the agent's pick once you'd seen its case.` : "";
  return `Your blind choice matched the agent's pick on ${r.matched} of ${r.blind}.${switched}`;
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
