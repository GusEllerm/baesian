import type { ApiCard, ApiState, RowReport, RowTest } from "../../src/api";
import { answeredInChat, loosenAfter, oneMissWithin, tightenAt } from "../../src/routing";
import type { Answer } from "./answer";
import type { Rarity } from "./model";
import { listWords } from "./prefs";

// M4 step 5e: the calibration panel and the recap, from what can be stood behind (D71, Client Data Contract):
// time spent comes from this browser's own log; "later reversed" from the store, worded as superseded, never
// "wrong"; practice cards wait for D83. Pure, so it's tested on its own (calibration.test.ts).

/** How long a card was on screen before you answered it: kept in this browser only. */
export interface Spent {
  rarity: Rarity;
  ms: number;
  at: string;
}

export function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const a = [...xs].sort((p, q) => p - q);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}

/** Median time spent, by stakes: the rare and mythic cards together, then uncommon, then common. */
export function timeSpent(log: Spent[]): { high?: number; uncommon?: number; common?: number } {
  const of = (rs: Rarity[]) => median(log.filter((s) => rs.includes(s.rarity)).map((s) => s.ms));
  const out: { high?: number; uncommon?: number; common?: number } = {};
  const high = of(["rare", "mythic"]), uncommon = of(["uncommon"]), common = of(["common"]);
  if (high !== undefined) out.high = high;
  if (uncommon !== undefined) out.uncommon = uncommon;
  if (common !== undefined) out.common = common;
  return out;
}

export const seconds = (ms: number | undefined) => (ms === undefined ? "none yet" : `${(ms / 1000).toFixed(1)}\u00a0s`);

/**
 * Decisions you resolved in the client that were later superseded (Client Data Contract: "Partial: say
 * 'superseded', not 'wrong'"). By name, never by ID (D69). Those you answered in chat first are left out, as from every
 * measure here (B-hswmx), and counted, so the panel can say how many: `inChat`, of the decisions you settled here.
 */
export function laterSuperseded(state: ApiState): { names: string[]; inChat: number } {
  const settled = (c: ApiCard) => c.verdicts.some((v) => CLIENTS.has(v.client) && (v.response === "accept" || v.response === "alternative" || v.response === "correction"));
  return {
    names: state.cards.filter((c) => c.status === "superseded" && settled(c) && !answeredInChat(c)).map((c) => c.meta.title),
    inChat: state.cards.filter((c) => (c.status === "superseded" || c.status === "resolved") && settled(c) && answeredInChat(c)).length,
  };
}

/** The clients a verdict names when it was given here: the local desk, and the website's desktop and phone layouts. */
const CLIENTS: ReadonlySet<string> = new Set(["web", "hosted-desktop", "hosted-phone"]);

// ---------------------------------------------------------------- your answers, row by row (D180)

/** A row with fewer answers than this is faded: too few to say anything about it yet. */
export const THIN = 10;
/**
 * The shortest scale the rows are drawn on: the answers a row takes, with no miss, before Baesian proposes a lower stop
 * (B-jtsfh, 28), so a row with a few answers never fills the track.
 */
export const SCALE_MIN = loosenAfter(0);

/**
 * A row's bar, from the report: each card once, by how its answers compare with the agent's pick. `missed` is the
 * report's misses: overturned, should have been asked, or on a question of what you value chosen otherwise blind
 * (B-87tkc, B-ab06a).
 */
export interface Bar {
  agreed: number;
  cameRound: number;
  missed: number;
  total: number;
}

export const barOf = (r: RowReport): Bar => ({ agreed: r.agreed, cameRound: r.cameRound, missed: r.misses, total: r.agreed + r.cameRound + r.misses });

/** The rows' one scale: the longest row's answers, so it fills the track, or `SCALE_MIN` while no row has that many. */
export const scaleOf = (bars: readonly Bar[]): number => Math.max(SCALE_MIN, ...bars.map((b) => b.total));

/**
 * What a row now needs before Baesian proposes a lower stop, in words read at a glance (B-jtsfh): the answers still to go
 * without a miss, counted since the row last moved, the agents' model changed, or you kept it where it was. Nothing for
 * a fixed row, or "All rows".
 */
export function needsWords(t: RowTest | undefined): string | undefined {
  if (!t) return undefined;
  if (t.waiting) return "A move for this row waits for you";
  if (t.toLoosen === undefined) return "As low as it can go";
  if (t.toLoosen === 0) return "Enough for a lower stop";
  return `${t.toLoosen} more without a miss for a lower stop`;
}

/** The rule, in the reading notes' words: the answers loosening takes, and the misses tightening takes. */
export const ruleWords = {
  down: `after ${loosenAfter(0)} answers with none, ${loosenAfter(1)} with one, ${loosenAfter(2)} with two`,
  up: `a miss in its first ${oneMissWithin()} answers, ${tightenAt(10)} in 10, ${tightenAt(20)} in 20`,
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const times = (n: number) => (n === 1 ? "once" : `${n} times`);

/**
 * What a row's bar leaves out, in short phrases: cards not answered yet, held back and not answered (D150), audits
 * waiting for you (D151), final accepts with no blind choice recorded, and choices you answered in chat (B-hswmx).
 */
export function leftOut(r: RowReport): string[] {
  const audits = Math.min(r.auditsUnanswered, r.heldWaiting);
  const waiting = r.unanswered - r.heldWaiting;
  const held = r.heldWaiting - audits;
  return [
    waiting ? `${waiting} not answered` : "",
    held ? `${held} held back` : "",
    audits ? `${plural(audits, "audit")} waiting` : "",
    r.unblind ? `${r.unblind} kept without a blind choice` : "",
    r.inChat ? `${r.inChat} answered in chat` : "",
  ].filter(Boolean);
}

/** How many of a row's cards its bar leaves out (`leftOut()`). */
export const notCounted = (r: RowReport | undefined): number => (r ? r.unanswered + r.unblind + r.inChat : 0);

/** All your answers in a sentence (D180), and what the bars leave out, if anything. */
export function summaryWords(pooled: RowReport): string {
  const b = barOf(pooled);
  const left = leftOut(pooled);
  const more = notCounted(pooled);
  if (!b.total) return more ? `No answers to count yet: ${listWords(left)}.` : "No answers yet: each row's bar fills in as you answer its cards.";
  const said = `Of ${plural(b.total, "card")}, you chose as the agent did ${times(b.agreed)} without seeing its pick and came round to it ${times(b.cameRound)} after reading its case; ${b.missed === 1 ? "1 was a miss" : `${b.missed} were misses`}.`;
  return more ? `${said} ${more}\u00a0more ${more === 1 ? "isn't" : "aren't"} counted: ${listWords(left)}.` : said;
}

/** A segment's tooltip: "Security: you chose as the agent did, blind, on 23 of 43 cards"; "Security: a miss, on 1 of 43 cards". */
export function segmentWords(row: string, kind: keyof Omit<Bar, "total">, n: number, total: number): string {
  const what = { agreed: "you chose as the agent did, blind", cameRound: "you came round to its pick", missed: n === 1 ? "a miss" : "misses" }[kind];
  return `${row}: ${what}, on ${n} of ${plural(total, "card")}`;
}

/** This session's answers, in a sentence (round 5's recap). */
export function recap(answers: Answer[]): string {
  if (!answers.length) return "";
  const n = (f: (a: Answer) => boolean) => answers.filter(f).length;
  const parts = [
    [n((a) => a.kind === "choose" && a.option === "proposal"), "took the agent's pick"],
    [n((a) => a.kind === "choose" && a.option === "alternative"), "chose the alternative"],
    [n((a) => a.kind === "write"), "wrote an answer"],
    [n((a) => a.kind === "pass"), "couldn't judge"],
  ] as [number, string][];
  const used = parts.filter(([k]) => k);
  const cards = `${answers.length} card${answers.length === 1 ? "" : "s"}`;
  if (used.length === 1) return `You answered ${cards}, and ${used[0]![1]} ${answers.length === 1 ? "" : "each time"}`.trimEnd() + ".";
  const list = used.map(([k, t]) => `${k} ${t}`);
  return `You answered ${cards}: ${list.slice(0, -1).join(", ")} and ${list.at(-1)}.`;
}
