import type { ApiCard, ApiPracticeInput, ApiState } from "../../src/api";
import { FINAL, answeredInChat, isOwnCard } from "../../src/routing";
import type { OptionKind, PracticeEntry, PracticeMark } from "../../src/schema";
import type { Answer } from "./answer";
import { type DeskCard, type Practice, agentOf, dayOf, isHard, quoted } from "./model";

// Practice cards with planted picks (B-kb5yt, D83, docs/vault/Design/Practice Cards.md): a past card rebuilt with its
// options swapped, so the option its agent didn't pick is shown as the pick, with the case the agent wrote for it when
// it filed (B-sy0kz). Built here, in the client, from the state it already reads; nothing generates text (D65). Pure, so
// it's tested on its own (practice.test.ts).

const DAY = 86_400_000;

/**
 * How old a card's final answer must be for it to come back (B-j583c, "From a week to a month old"): a week at least, so
 * you're less likely to remember it, and a month at most, while the relay still holds its text (R-1sxpy, `RETENTION`).
 */
export const MIN_AGE_MS = 7 * DAY;
export const MAX_AGE_MS = 30 * DAY;

/**
 * Words in a card's background that speak of the agent's own pick, or of which option is the alternative: the swap would
 * make them argue the wrong way, so a card whose background has them never comes back. About one card in six.
 */
const SPEAKS_OF_PICK = /\b(?:the proposal|proposals?|proposed|propose|the alternative|alternative's|my pick|our pick|its pick|the pick|i pick|i'd pick|i would pick|i chose|i'd choose|i would choose|i'd go with|i recommend|recommend(?:ed|s)?)\b/i;

/** A card's final answer, when it's a choice of one of its options: the option, when, and the blind choice before it. */
export function finalChoice(card: ApiCard): { option: OptionKind; at: string; first?: OptionKind } | undefined {
  const last = [...card.verdicts].reverse().find((v) => FINAL.has(v.response));
  if (!last || (last.response !== "accept" && last.response !== "alternative")) return undefined;
  return { option: last.response === "accept" ? "proposal" : "alternative", at: last.at, ...(last.first_choice ? { first: last.first_choice } : {}) };
}

/**
 * Why a past card can't come back as practice now, or nothing when it can (Practice Cards, section 1). Each rule keeps off
 * the desk what would be untrue, or would give the card away, once its options are swapped:
 * - it's settled, by a choice of one option, with a blind choice before it;
 * - it's an agent's card, answered on the desk, never revised, with no reply;
 * - it isn't hard: a hard answer waits for your passkey on the website (B-a6xpc), which a practice card can't honestly ask;
 * - the gate didn't hold it back, or in shadow say it would have: the reveal of such a card says so;
 * - its agent wrote a case for its alternative (B-sy0kz);
 * - nothing on it names the pick: nothing already built, no unchecked premise, nothing either option would break, no
 *   conflict, no rule cited or made from its answer, and a background that doesn't speak of the pick;
 * - it was answered from a week to a month ago (B-j583c);
 * - it hasn't come back before: each card once.
 */
export function whyNot(card: ApiCard, state: ApiState, nowMs: number, practised: ReadonlySet<string>): string | undefined {
  const m = card.meta;
  if (card.status !== "resolved") return "it isn't settled";
  const final = finalChoice(card);
  if (!final) return "its final answer isn't a choice of one option";
  if (!final.first) return "it has no blind choice";
  if (isOwnCard(m)) return "it's Baesian's own card";
  if (answeredInChat(card)) return "it was answered in chat";
  if (card.revisions !== 1 || m.revision !== 1) return "it was revised";
  if (card.replied || m.reply !== undefined) return "its agent replied";
  if (isHard(card)) return "it's hard";
  if (card.gate?.outcome === "held") return "the gate held it back";
  if (!m.alternative_rationale) return "it has no case for its alternative";
  if (m.acted || m.premise) return "it says what's built, or rests on a premise";
  if (m.proposal_breaks.length || m.alternative_breaks.length) return "an option breaks a decision or rule";
  if (m.conflict_of?.length || state.cards.some((c) => c.meta.conflict_of?.includes(m.id))) return "it's in a conflict";
  if (m.rules.length) return "it cites a rule";
  if (card.verdicts.some((v) => v.make_rule) || state.rules.some((r) => r.meta.from_card === m.id)) return "a rule was made from it";
  if (SPEAKS_OF_PICK.test(card.body)) return "its background speaks of the pick";
  const age = nowMs - Date.parse(final.at);
  if (age < MIN_AGE_MS) return "it was answered under a week ago";
  if (age > MAX_AGE_MS) return "it was answered over a month ago";
  if (practised.has(m.id)) return "it has come back before";
  return undefined;
}

/** The past cards that can come back as practice now, oldest answer first. */
export function sources(state: ApiState, nowMs: number, practised: ReadonlySet<string>): ApiCard[] {
  return state.cards
    .filter((c) => whyNot(c, state, nowMs, practised) === undefined)
    .sort((a, b) => finalChoice(a)!.at.localeCompare(finalChoice(b)!.at));
}

/** A practice card's ID: its own, so it never collides with its original in what the desk remembers (`useSeen()`, `sidesFor()`). Never shown (D69). */
export const practiceId = (id: string) => `P-${id.slice(2)}`;

/**
 * A past card rebuilt as practice (D83, B-kb5yt, Practice Cards section 2). Its question, `doing`, agent and model, topic,
 * deck, facts, crux, fact and background are the original's; its two options are swapped, each keeping its own crux
 * answer and outcome, so the option the agent didn't pick is shown as its pick (the planted pick); and that pick's case is
 * the one the agent wrote for it (B-sy0kz). The original's rationale, "wrong if", check and `serves` go: they argue for
 * the other option. It has no verdicts, dependents, briefs, gate record, waiting markers or fallbacks, as a card just
 * filed has none.
 */
export function rebuild(card: ApiCard): DeskCard & { practice: Practice } {
  const { rationale: _r, wrong_if: _w, check: _c, serves: _s, alternative_rationale, ...m } = card.meta;
  const final = finalChoice(card);
  return {
    meta: {
      ...m,
      id: practiceId(m.id),
      proposal: m.alternative,
      proposal_then: m.alternative_then,
      crux_proposal: m.crux_alternative,
      alternative: m.proposal,
      alternative_then: m.proposal_then,
      crux_alternative: m.crux_proposal,
      ...(alternative_rationale ? { rationale: alternative_rationale } : {}),
    },
    body: card.body,
    revisions: 1,
    replied: false,
    status: "open",
    canonicalTopic: card.canonicalTopic,
    verdicts: [],
    dependents: [],
    briefs: [],
    waiting: [],
    fallbacks: [],
    attachments: 0,
    practice: { of: m.id, revision: m.revision, answered: final?.at ?? m.created },
  };
}

/** Whether practice cards come now: the blind test (B-xx49m), or, once it wasn't spotted, for good (B-kb5yt). */
export type Phase = "test" | "on";

/**
 * How often a practice card comes, after a real answer: about 1 in 4 during the blind test, until ten have come (B-xx49m),
 * and about 1 in 20 after it (B-kb5yt). At random, not every fourth or twentieth.
 */
export const RATE: Record<Phase, number> = { test: 1 / 4, on: 1 / 20 };

/** The real answers there must be since the last practice card: one during the test, so two never come in a row; five after. */
export const GAP: Record<Phase, number> = { test: 1, on: 5 };

/**
 * Whether the next card is a practice card, drawn after a real answer (Practice Cards section 4): never the first card you
 * see, since it's drawn only after an answer; never the last, since a real card must still be waiting after it; and at
 * least `GAP` real answers after the last; then at the phase's rate, by `roll`, a random number from 0 to 1.
 */
export function draws(p: { phase: Phase; since: number; realLeft: number; pool: number; roll: number }): boolean {
  return p.pool > 0 && p.realLeft >= 1 && p.since >= GAP[p.phase] && p.roll < RATE[p.phase];
}

// ---------------------------------------------------------------- the blind test (B-xx49m, B-bb7ga)

/** How many practice cards the blind test takes (D83, B-kb5yt): it ends when the tenth is answered and marked. */
export const TEST_SIZE = 10;

/** The marks in the blind test (B-xx49m, B-bb7ga), in the words the mark card shows, with the key for each (B-9prve). */
export const MARKS: readonly { mark: PracticeMark; label: string; key: string }[] = [
  { mark: "no", label: "No", key: "1" },
  { mark: "maybe", label: "Maybe", key: "2" },
  { mark: "sure", label: "Sure", key: "3" },
];

/** Practice cards answered so far, of any phase: each card comes back once. */
export const practised = (entries: readonly PracticeEntry[]): Set<string> => new Set(entries.flatMap((e) => (e.kind === "answer" ? [e.card] : [])));

/** One card marked in the blind test: whether it was practice, your mark, and for a practice card when its original was answered. */
export interface Marked {
  card: string;
  practice: boolean;
  mark: PracticeMark;
  /** For a practice card: when the card it was rebuilt from was answered (B-j583c's check). */
  answered?: string;
  at: string;
}

/**
 * The blind test's marks, as its entries say: each card's latest mark, practice and real kept apart (a card answered in the
 * test may come back as practice in it a week later), in the order first marked, with a practice card's original's answer
 * time from its answer. Every real card marked counts; two devices answering at once could go past ten practice cards:
 * the test is the first ten.
 */
export function testMarks(entries: readonly PracticeEntry[]): Marked[] {
  const answered = new Map<string, string>();
  for (const e of entries) if (e.kind === "answer" && e.test) answered.set(e.card, e.answered);
  const byCard = new Map<string, Marked>();
  for (const e of entries) {
    if (e.kind !== "mark") continue;
    const key = `${e.practice ? "p" : "r"}:${e.card}`;
    const at = byCard.get(key)?.at ?? e.at;
    const from = e.practice ? answered.get(e.card) : undefined;
    byCard.set(key, { card: e.card, practice: e.practice === true, mark: e.mark, ...(from ? { answered: from } : {}), at });
  }
  const all = [...byCard.values()].sort((a, b) => a.at.localeCompare(b.at));
  const tenth = all.filter((m) => m.practice)[TEST_SIZE - 1];
  return tenth ? all.filter((m) => !m.practice || m.at <= tenth.at) : all;
}

/** The log of n choose k. */
function logChoose(n: number, k: number): number {
  let s = 0;
  for (let i = 0; i < k; i++) s += Math.log(n - i) - Math.log(i + 1);
  return s;
}

/**
 * One-sided Fisher's exact test (B-bb7ga): the chance that, guessing, at least `right` of the `marked` cards you marked
 * would be practice, with `practice` practice cards among `total`. The hypergeometric tail, from `right` up.
 */
export function fisherP(total: number, practice: number, marked: number, right: number): number {
  let p = 0;
  for (let x = right; x <= Math.min(practice, marked); x++) {
    if (marked - x > total - practice) continue;
    p += Math.exp(logChoose(practice, x) + logChoose(total - practice, marked - x) - logChoose(total, marked));
  }
  return Math.min(1, p);
}

/** Practice cards count as spotted when your marks beat guessing at 95% (B-bb7ga): a chance under this. */
export const SPOTTED_P = 0.05;

/** The blind test's result (B-bb7ga), over every card in it: maybe and sure count as marked, and wrong marks against you. */
export interface TestResult {
  total: number;
  practice: number;
  /** Cards you marked maybe or sure, and how many of those were practice. */
  marked: number;
  right: number;
  p: number;
  spotted: boolean;
}

export function resultOf(marks: readonly Marked[]): TestResult {
  const practice = marks.filter((m) => m.practice).length;
  const flagged = marks.filter((m) => m.mark !== "no");
  const right = flagged.filter((m) => m.practice).length;
  const p = fisherP(marks.length, practice, flagged.length, right);
  return { total: marks.length, practice, marked: flagged.length, right, p, spotted: p < SPOTTED_P };
}

/**
 * Where practice cards are (Practice Cards sections 7 and 8): before the blind test; during it, with how many practice cards
 * it has had; or after it: spotted, so practice cards are dropped (D71), or not, so they come about 1 in 20 (B-kb5yt).
 */
export type PracticeStatus =
  | { kind: "before" }
  | { kind: "test"; started: string; marks: Marked[]; practice: number }
  | { kind: "spotted" | "on"; started: string; marks: Marked[]; result: TestResult };

export function statusOf(entries: readonly PracticeEntry[]): PracticeStatus {
  const start = entries.find((e) => e.kind === "test-start");
  if (!start) return { kind: "before" };
  const marks = testMarks(entries);
  const practice = marks.filter((m) => m.practice).length;
  if (practice < TEST_SIZE) return { kind: "test", started: start.at, marks, practice };
  const result = resultOf(marks);
  return { kind: result.spotted ? "spotted" : "on", started: start.at, marks, result };
}

/** When practice cards come now: in the test, and after it if it wasn't spotted; never before it, nor once it was. */
export const phaseOf = (s: PracticeStatus): Phase | undefined => (s.kind === "test" ? "test" : s.kind === "on" ? "on" : undefined);

// ---------------------------------------------------------------- the calibration panel's row (Practice Cards section 6)

/**
 * Your practice cards' bar: chose the planted pick blind; chose against it blind, then came round to it; or kept against
 * it. Each practice card once, by its latest answer. Answers in the blind test are left out, since you were looking for
 * practice cards then, and so are written answers and "can't judge", which chose no option.
 */
export interface PracticeBar {
  planted: number;
  cameRound: number;
  kept: number;
  total: number;
}

export function practiceBar(entries: readonly PracticeEntry[]): PracticeBar {
  const latest = new Map<string, Extract<PracticeEntry, { kind: "answer" }>>();
  for (const e of entries) if (e.kind === "answer" && !e.test) latest.set(e.card, e);
  let planted = 0;
  let round = 0;
  let kept = 0;
  for (const e of latest.values()) {
    if (e.blind === "planted") planted += 1;
    else if (e.blind === "other" && e.final === "planted") round += 1;
    else if (e.blind === "other" && e.final === "other") kept += 1;
  }
  return { planted, cameRound: round, kept, total: planted + round + kept };
}

/**
 * Coming round, compared like with like (Practice Cards section 6): of the practice cards you chose otherwise blind, how many
 * you came round to (`planted`); and of real cards practice could have come from (an agent's, not hard, not answered in
 * chat), settled by a choice after a blind choice against the agent's pick, how many ended on its pick (`real`).
 */
export function cameRound(entries: readonly PracticeEntry[], state: ApiState): { planted: { came: number; of: number }; real: { came: number; of: number } } {
  const bar = practiceBar(entries);
  let came = 0;
  let of = 0;
  for (const c of state.cards) {
    if ((c.status !== "resolved" && c.status !== "superseded") || isOwnCard(c.meta) || answeredInChat(c) || isHard(c)) continue;
    const f = finalChoice(c);
    if (!f || f.first !== "alternative") continue;
    of += 1;
    if (f.option === "proposal") came += 1;
  }
  return { planted: { came: bar.cameRound, of: bar.cameRound + bar.kept }, real: { came, of } };
}

/** Whole days from one time to another. */
export const daysBetween = (from: string, to: string): number => Math.max(0, Math.floor((Date.parse(to) - Date.parse(from)) / DAY));

/** The blind test's result in a sentence (B-bb7ga): what you marked, how that compares with guessing, and what follows. */
export function resultWords(r: TestResult): string {
  const marked = `You marked ${r.marked} of the ${r.total} cards in the test as maybe or sure, and ${r.right} of those ${r.right === 1 ? "was" : "were"} rebuilt, of ${r.practice} rebuilt in all.`;
  const chance = `Guessing would do that well ${pct(r.p)} of the time.`;
  return r.spotted ? `${marked} ${chance} That beats guessing, so practice cards are spotted, and they're dropped.` : `${marked} ${chance} That doesn't beat guessing, so practice cards aren't spotted: they now come about 1 in 20 cards.`;
}

/** A chance as people say it: "4%", "under 1%". */
const pct = (p: number) => (p < 0.01 ? "under 1%" : `${Math.round(p * 100)}%`);

/**
 * The blind test's result as a dated note for the vault's `Reviews/` (Practice Cards section 7): the result, then each
 * practice card with your mark against how long before it its original was answered (B-j583c's check), and your marks on
 * the real cards. `titleOf` names a card the client still has; one whose text is gone is named by its ID alone.
 */
export function resultNote(s: Extract<PracticeStatus, { kind: "spotted" | "on" }>, titleOf: (id: string) => string | undefined): { name: string; text: string } {
  const ended = s.marks.at(-1)?.at ?? s.started;
  const day = ended.slice(0, 10);
  const r = s.result;
  const named = (id: string) => (titleOf(id) ? `${id}, “${titleOf(id)}”` : id);
  const practice = s.marks.filter((m) => m.practice);
  const real = s.marks.filter((m) => !m.practice);
  const count = (marks: Marked[], mark: PracticeMark) => marks.filter((m) => m.mark === mark).length;
  const text = [
    "---",
    "type: review",
    "status: active",
    "authority: log",
    `summary: "The blind test of practice cards (B-xx49m, B-bb7ga), ${s.started.slice(0, 10)} to ${day}: ${r.total} cards, ${r.practice} rebuilt; ${r.marked} marked maybe or sure, ${r.right} of them rebuilt; ${r.spotted ? "spotted, so practice cards are dropped (D71)" : "not spotted, so practice cards start (B-kb5yt)"}."`,
    `created: ${day}`,
    `updated: ${day}`,
    `reviewed: ${day}`,
    "tags: [baesian, review, calibration]",
    "---",
    "",
    "# Practice Cards Blind Test",
    "",
    `The blind test that [[Practice Cards]] puts before practice cards ship (D83, B-kb5yt), run in the deck as you worked (B-xx49m), from ${s.started.slice(0, 10)} to ${day}. Counted as B-bb7ga decided: a one-sided Fisher's exact test over every card in the test, maybe and sure counted as marked.`,
    "",
    `**Result:** ${resultWords(r)} (p = ${r.p.toFixed(4)}.)`,
    "",
    "## The rebuilt cards",
    "",
    "| Card | Your mark | Its original answered | Days before you marked it |",
    "|---|---|---|---|",
    ...practice.map((m) => `| ${named(m.card)} | ${m.mark} | ${m.answered?.slice(0, 10) ?? ""} | ${m.answered ? daysBetween(m.answered, m.at) : ""} |`),
    "",
    "## The real cards",
    "",
    `${real.length} real cards answered in the test: marked no ${count(real, "no")}, maybe ${count(real, "maybe")}, sure ${count(real, "sure")}.`,
    "",
  ].join("\n");
  return { name: `${day} Practice Cards Blind Test.md`, text };
}

// ---------------------------------------------------------------- answering one (Practice Cards section 4)

/**
 * What a practice card's answer keeps (B-rehdw): the card it came from, its blind choice and final answer against the
 * planted pick (the option the practice card showed as the pick), and whether it came in the blind test. Never what you
 * typed, nor a reason you chose: only the kind of answer. Your mark in the test is an entry of its own (`markOf()`).
 */
export function practiceAnswer(p: Practice, answer: Answer, test = false): ApiPracticeInput {
  const side = (o: OptionKind) => (o === "proposal" ? ("planted" as const) : ("other" as const));
  return {
    kind: "answer",
    card: p.of,
    revision: p.revision,
    answered: p.answered,
    ...(answer.kind === "choose" && answer.first ? { blind: side(answer.first) } : {}),
    final: answer.kind === "choose" ? side(answer.option) : answer.kind,
    ...(test ? { test: true as const } : {}),
  };
}

/**
 * Your mark in the blind test on a card you've just answered (B-xx49m, B-9prve: on a card of its own, after the answer):
 * the card, or for a practice card the one it was rebuilt from, and that it was practice. Nothing shows it until the test
 * ends.
 */
export function markOf(card: DeskCard, mark: PracticeMark): ApiPracticeInput {
  const p = card.practice;
  return { kind: "mark", card: p ? p.of : card.meta.id, revision: p ? p.revision : card.meta.revision, mark, ...(p ? { practice: true as const } : {}) };
}

/** A practice card on the path, once it may say so: "practice: you chose “Postgres”". */
export function practicePath(card: DeskCard, answer: Answer): string {
  const what = answer.kind === "choose" ? `you chose ${quoted(card.meta[answer.option])}` : answer.kind === "write" ? "you wrote an answer" : "you couldn't judge it";
  return `practice: ${what}`;
}

/**
 * What a practice card says once you've answered it, where a real card would say it was sent (Practice Cards section 4):
 * what it was rebuilt from and when you answered that, that the pick it showed was the option its agent didn't pick, that
 * no agent was waiting on it if it said one had stopped (B-zw55w), that nothing went to an agent, and that what you
 * wrote wasn't kept.
 */
export function practiceWords(card: DeskCard, stopped: boolean): string {
  const p = card.practice;
  const when = p ? dayOf(p.answered) : "an earlier day";
  return `That was a practice card, rebuilt from one you answered on ${when}. The pick it showed was the option ${agentOf(card)} didn't pick${stopped ? ", and no agent was waiting on it" : ""}. Nothing went to an agent, and anything you wrote wasn't kept.`;
}
