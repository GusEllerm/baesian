import { describe, expect, it } from "vitest";
import type { ApiCard, ApiState } from "../../src/api";
import { TODAY } from "../../src/routing";
import type { Verdict } from "../../src/schema";
import { keyOf, rarityOf, relationsOf, sidesFor } from "./model";
import { GAP, MAX_AGE_MS, MIN_AGE_MS, RATE, draws, finalChoice, practiceId, rebuild, sources, whyNot } from "./practice";

// Practice cards with planted picks (B-kb5yt, D83): which past cards come back (Practice Cards, section 1; B-j583c's
// window), how one is rebuilt (section 2; B-sy0kz's case), and when one is drawn (section 4; B-xx49m's rate in the test).

const NOW = Date.parse("2026-11-20T12:00:00.000Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const CASE = "One server everyone already runs beats a file per machine once two machines write.";

let n = 0;
function verdict(over: Partial<Verdict> = {}): Verdict {
  return { type: "verdict", format: 1, card: "B-00001", revision: 1, response: "accept", first_choice: "alternative", reviewer: "gus", client: "hosted-desktop", at: ago(10), ...over };
}
/** A settled card that can come back: answered ten days ago, blind first, with a case for its alternative. */
function past(over: Partial<ApiCard["meta"]> = {}, rest: Partial<Omit<ApiCard, "meta">> = {}): ApiCard {
  n += 1;
  const id = over.id ?? `B-${String(n).padStart(5, "0")}`;
  const topic = over.topic ?? `area${n}/subject`;
  return {
    meta: {
      type: "card", format: 1, id, revision: 1, title: `Decision ${n}`, question: `Which store for ${n}?`, doing: "writing the run store",
      topic, deck: "storage", level: "blocking", touches: ["schema"], reverse: "moderate",
      proposal: "SQLite (WAL mode)", proposal_then: "runs go in one file next to the repo", alternative: "Postgres", alternative_then: "runs go to a server",
      also_considered: [], crux: "Will two machines write at once?", crux_proposal: "If not", crux_alternative: "If so", crux_fact: "Today one laptop writes runs.",
      rationale: "A file is enough for one machine.", wrong_if: "a second machine writes runs", check: "the CI runners", serves: "simplicity",
      alternative_rationale: CASE,
      rules: [], proposal_breaks: [], alternative_breaks: [], depends_on: [], domain: [], evidence: [], rule_covers: [],
      source_agent: "claude-code", source_model: "claude-opus-5-5", source_branch: "v1/next", created: ago(12),
      ...over,
    },
    body: "Both are installed on the laptop.",
    revisions: 1, replied: false, status: "resolved", decision: "SQLite (WAL mode)", canonicalTopic: topic,
    verdicts: [verdict({ card: id })], dependents: [], briefs: [], waiting: [], fallbacks: [], attachments: 0,
    ...rest,
  };
}
const pooled = { shown: 0, held: 0, wouldHold: 0, drawn: 0, auditsAnswered: 0, auditsUnanswered: 0, answered: 0, misses: 0, switched: 0, blind: 0, matched: 0, agreed: 0, cameRound: 0, unblind: 0, unanswered: 0, heldWaiting: 0, inChat: 0 };
function snapshot(cards: ApiCard[], rules: ApiState["rules"] = []): ApiState {
  return { version: 1, server: { started: ago(1), now: new Date(NOW).toISOString(), watch: "events" }, project: { name: "repo", branch: "relay" }, decks: [], rules, cards, routing: { settings: TODAY, history: [], report: { rows: {}, pooled, beforeGate: 0 } }, problems: [] };
}
const none = new Set<string>();
const why = (c: ApiCard, others: ApiCard[] = [], rules: ApiState["rules"] = []) => whyNot(c, snapshot([c, ...others], rules), NOW, none);

describe("which past cards come back (Practice Cards section 1)", () => {
  it("a settled agent's card, chosen blind, answered a week to a month ago, with a case for its alternative", () => {
    expect(why(past())).toBeUndefined();
    // The final answer can be either option, and the blind choice either way.
    expect(why(past({}, { verdicts: [verdict({ response: "alternative", choice: "Postgres", first_choice: "proposal" })] }))).toBeUndefined();
  });

  it("not unless it's settled by a choice of one option, with a blind choice", () => {
    expect(why(past({}, { status: "open", verdicts: [] }))).toBe("it isn't settled");
    expect(why(past({}, { verdicts: [verdict({ response: "correction", choice: "MySQL" })] }))).toBe("its final answer isn't a choice of one option");
    expect(why(past({}, { status: "superseded" }))).toBe("it isn't settled");
    const { first_choice: _, ...unblind } = verdict();
    expect(why(past({}, { verdicts: [unblind] }))).toBe("it has no blind choice");
    // A later "Can't judge" doesn't count as final: the choice before it does.
    expect(why(past({}, { verdicts: [verdict(), verdict({ response: "need_context", at: ago(9) })] }))).toBeUndefined();
  });

  it("not Baesian's own cards, nor one answered in chat, revised or replied to", () => {
    expect(why(past({ source_agent: "baesian" }))).toBe("it's Baesian's own card");
    expect(why(past({ pref_row: "schema", pref_from: "stop-and-ask", pref_to: "tell-me" }))).toBe("it's Baesian's own card");
    expect(why(past({ answered_in_chat: "SQLite" }))).toBe("it was answered in chat");
    expect(why(past({ revision: 2 }, { revisions: 2 }))).toBe("it was revised");
    expect(why(past({}, { replied: true }))).toBe("its agent replied");
  });

  it("not a hard card, whose answer would wait for the passkey; nor one the gate held back, or would have in shadow", () => {
    expect(why(past({ level: "hard" }))).toBe("it's hard");
    const shownHard = past({}, { gate: { type: "gate", format: 1, card: "B-x", revision: 1, row: "schema", position: "never-without-me", outcome: "shown", level: "hard", reason: "row", mode: "enforce", by: "relay", at: ago(12) } as unknown as ApiCard["gate"] });
    expect(why(shownHard)).toBe("it's hard");
    const held = past({}, { gate: { type: "gate", format: 1, card: "B-x", revision: 1, row: "schema", position: "agent-decides", outcome: "held", reason: "row", mode: "shadow", by: "relay", at: ago(12) } as unknown as ApiCard["gate"] });
    expect(why(held)).toBe("the gate held it back");
  });

  it("only with the agent's case for its alternative (B-sy0kz)", () => {
    expect(why(past({ alternative_rationale: undefined }))).toBe("it has no case for its alternative");
  });

  it("not when anything on it names the pick", () => {
    expect(why(past({ acted: "the table is written", acted_option: "proposal" }))).toBe("it says what's built, or rests on a premise");
    expect(why(past({ premise: "WAL works on the share", premise_option: "proposal", premise_check: "try it" }))).toBe("it says what's built, or rests on a premise");
    expect(why(past({ alternative_breaks: ["B-zzzzz"] }))).toBe("an option breaks a decision or rule");
    expect(why(past({ conflict_of: ["B-aaaaa", "B-bbbbb"] }))).not.toBeUndefined();
    const c = past();
    expect(why(c, [past({ source_agent: "baesian", conflict_of: [c.meta.id, "B-zzzzz"] })])).toBe("it's in a conflict");
    expect(why(past({ rules: ["R-aaaaa"] }))).toBe("it cites a rule");
    expect(why(past({}, { verdicts: [verdict({ make_rule: true })] }))).toBe("a rule was made from it");
    const ruled = past();
    expect(why(ruled, [], [{ meta: { type: "rule", format: 1, id: "R-aaaaa", covers: [], from_card: ruled.meta.id, accepted_by: "gus", created: ago(9) }, body: "Use SQLite." }])).toBe("a rule was made from it");
    for (const body of ["Under the proposal, runs stay local.", "The alternative needs a server.", "I'd pick SQLite for now.", "Proposed by the storage review.", "I recommend waiting."]) {
      expect(why(past({}, { body })), body).toBe("its background speaks of the pick");
    }
    expect(why(past({}, { body: "Postgres is installed on the CI runners; the laptop has both." }))).toBeUndefined();
  });

  it("from a week to a month after its final answer (B-j583c), and once", () => {
    const at = (days: number) => past({}, { verdicts: [verdict({ at: ago(days) })] });
    expect(why(at(6.9))).toBe("it was answered under a week ago");
    expect(why(at(7))).toBeUndefined();
    expect(why(at(30))).toBeUndefined();
    expect(why(at(30.1))).toBe("it was answered over a month ago");
    expect(MIN_AGE_MS).toBe(7 * DAY);
    expect(MAX_AGE_MS).toBe(30 * DAY);
    const c = past();
    expect(whyNot(c, snapshot([c]), NOW, new Set([c.meta.id]))).toBe("it has come back before");
  });

  it("lists those that can come back, oldest answer first", () => {
    const a = past({}, { verdicts: [verdict({ at: ago(8) })] });
    const b = past({}, { verdicts: [verdict({ at: ago(20) })] });
    const no = past({ level: "hard" });
    expect(sources(snapshot([a, no, b]), NOW, none).map((c) => c.meta.id)).toEqual([b.meta.id, a.meta.id]);
    expect(sources(snapshot([a, no, b]), NOW, new Set([b.meta.id])).map((c) => c.meta.id)).toEqual([a.meta.id]);
  });
});

describe("a practice card, rebuilt (Practice Cards section 2, B-sy0kz)", () => {
  it("swaps the options, each with its own crux answer and outcome, and gives the planted pick the agent's case for it", () => {
    const c = past();
    const p = rebuild(c);
    expect(p.meta).toMatchObject({
      proposal: "Postgres", proposal_then: "runs go to a server", crux_proposal: "If so",
      alternative: "SQLite (WAL mode)", alternative_then: "runs go in one file next to the repo", crux_alternative: "If not",
      rationale: CASE,
    });
    // The case for the real pick argues for the other option: it goes, with what would show it wrong and what it serves.
    for (const gone of ["wrong_if", "check", "serves", "alternative_rationale"]) expect(p.meta, gone).not.toHaveProperty(gone);
  });

  it("keeps the rest as filed: question, doing, agent and model, topic, deck, facts, level, crux and its fact, background", () => {
    const c = past({ depends_on: ["B-zzzzz"] });
    const p = rebuild(c);
    for (const k of ["title", "question", "doing", "topic", "deck", "touches", "reverse", "level", "crux", "crux_fact", "crux_preference", "source_agent", "source_model", "depends_on", "created"] as const) {
      expect(p.meta[k], k).toEqual(c.meta[k]);
    }
    expect(p.body).toBe(c.body);
    expect(p.canonicalTopic).toBe(c.canonicalTopic);
  });

  it("is a card just filed: open, nothing on it, nothing resting on it; with an identity of its own; and says what it came from", () => {
    const c = past({}, { dependents: ["B-yyyyy"], waiting: [{ agent: "claude-code", since: ago(1), at: ago(0), stale: false }] });
    const p = rebuild(c);
    expect(p).toMatchObject({ status: "open", revisions: 1, replied: false, verdicts: [], dependents: [], briefs: [], waiting: [], fallbacks: [], attachments: 0 });
    expect(p).not.toHaveProperty("gate");
    expect(p).not.toHaveProperty("decision");
    expect(p.practice).toEqual({ of: c.meta.id, revision: 1, answered: c.verdicts[0]!.at });
    expect(p.meta.id).toBe(practiceId(c.meta.id));
    expect(keyOf(p)).not.toBe(keyOf(c));
    // Its sides are drawn by its own ID, as any card's are.
    expect(sidesFor(p.meta.id, "salt")).toEqual(sidesFor(practiceId(c.meta.id), "salt"));
    // Its rarity from its own fields, with nothing resting on it, as it was when filed.
    expect(rarityOf(p, 0).rarity).toBe("uncommon");
  });

  it("on the path, leaves out its original, which would show as your precedent on the same topic; keeps what it built on", () => {
    const parent = past({ title: "Where runs are kept" });
    const c = past({ topic: "storage/runs", depends_on: [parent.meta.id] });
    const p = rebuild(c);
    const state = snapshot([parent, c]);
    expect(relationsOf(p, state).map((r) => [r.id, r.kind])).toEqual([[parent.meta.id, "builds-on"]]);
    // A real card on the same topic would show it as the precedent.
    const fresh = { ...c, meta: { ...c.meta, id: "B-fresh" }, status: "open" as const, verdicts: [] };
    expect(relationsOf(fresh, state).map((r) => r.kind)).toContain("precedent");
  });
});

describe("when one comes (Practice Cards section 4, B-xx49m)", () => {
  it("about 1 in 4 in the blind test, two never in a row; about 1 in 20 after it, five real cards apart", () => {
    expect(RATE).toEqual({ test: 0.25, on: 0.05 });
    expect(GAP).toEqual({ test: 1, on: 5 });
    const base = { since: 5, realLeft: 3, pool: 4 };
    expect(draws({ ...base, phase: "test", roll: 0.24 })).toBe(true);
    expect(draws({ ...base, phase: "test", roll: 0.25 })).toBe(false);
    expect(draws({ ...base, phase: "on", roll: 0.049 })).toBe(true);
    expect(draws({ ...base, phase: "on", roll: 0.06 })).toBe(false);
    expect(draws({ ...base, phase: "on", since: 4, roll: 0 })).toBe(false);
    expect(draws({ ...base, phase: "test", since: 0, roll: 0 })).toBe(false);
  });

  it("never the last card: a real card must still be waiting after it; and only with a card to rebuild", () => {
    expect(draws({ phase: "test", since: 3, realLeft: 0, pool: 4, roll: 0 })).toBe(false);
    expect(draws({ phase: "test", since: 3, realLeft: 1, pool: 0, roll: 0 })).toBe(false);
    expect(draws({ phase: "test", since: 3, realLeft: 1, pool: 1, roll: 0 })).toBe(true);
  });

  it("reads a card's final choice: the latest final answer, when it chose an option", () => {
    expect(finalChoice(past({}, { verdicts: [verdict({ response: "accept", first_choice: "alternative", at: ago(3) })] }))).toEqual({ option: "proposal", at: ago(3), first: "alternative" });
    expect(finalChoice(past({}, { verdicts: [verdict({ response: "reject", comment: "no" })] }))).toBeUndefined();
  });
});
