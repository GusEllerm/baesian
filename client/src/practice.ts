import type { ApiCard, ApiState } from "../../src/api";
import { FINAL, answeredInChat, isOwnCard } from "../../src/routing";
import type { OptionKind } from "../../src/schema";
import { type DeskCard, type Practice, isHard } from "./model";

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
