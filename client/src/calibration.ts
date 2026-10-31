import type { ApiState } from "../../src/api";
import type { Answer } from "./answer";
import type { Rarity } from "./model";

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
 * 'superseded', not 'wrong'"). By name, never by ID (D69).
 */
export function laterSuperseded(state: ApiState): string[] {
  return state.cards
    .filter((c) => c.status === "superseded" && c.verdicts.some((v) => v.client === "web" && (v.response === "accept" || v.response === "alternative" || v.response === "correction")))
    .map((c) => c.meta.title);
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
