import { describe, expect, it } from "vitest";
import type { ApiCard, ApiState } from "../../src/api";
import { TODAY } from "../../src/routing";
import { agentOf, areaOf, byId, heldBack, heldRemoved, isHeld, liveDependents, ownText, parked, queue, quoted, rarityOf, relationsOf, replyOf, sidesFor, spaceOut, stakesLine, waitState } from "./model";

// The client's model (M4 step 5b), against hand-built snapshots.

const T0 = Date.parse("2026-10-31T12:00:00.000Z");
const at = (s: number) => new Date(T0 + s * 1000).toISOString();

let n = 0;
function card(over: Partial<ApiCard["meta"]> = {}, rest: Partial<Omit<ApiCard, "meta">> = {}): ApiCard {
  n += 1;
  const id = over.id ?? `B-${String(n).padStart(5, "0").replace(/[ilou]/g, "0")}`;
  const topic = over.topic ?? `area${n}/subject`;
  return {
    meta: {
      type: "card", format: 1, id, revision: 1, title: `Decision ${n}`, question: `Which option for ${n}?`, doing: "working",
      topic, deck: "branch-main", level: "provisional", touches: [], reverse: "cheap",
      proposal: "Option A", proposal_then: "A happens", alternative: "Option B", alternative_then: "B happens", also_considered: [],
      crux: "Does A fit?", crux_proposal: "If it does", crux_alternative: "If it doesn't",
      rules: [], proposal_breaks: [], alternative_breaks: [], depends_on: [], domain: [], evidence: [], rule_covers: [],
      source_agent: "claude-code", source_branch: "main", created: at(n),
      ...over,
    },
    body: "", revisions: 1, replied: false, status: "open", canonicalTopic: topic, verdicts: [], dependents: [], briefs: [], waiting: [], fallbacks: [], attachments: 0,
    ...rest,
  };
}
/** No preference file: "Today", in shadow (M8). */
const pooled = { shown: 0, held: 0, wouldHold: 0, drawn: 0, auditsAnswered: 0, auditsUnanswered: 0, answered: 0, misses: 0, switched: 0, blind: 0, matched: 0, streak: 0, recentMisses: 0 };
const ROUTING: ApiState["routing"] = { settings: TODAY, history: [], report: { rows: {}, pooled, beforeGate: 0 } };
function snapshot(cards: ApiCard[], rules: ApiState["rules"] = []): ApiState {
  // Dependents, as the server computes them.
  for (const c of cards) c.dependents = cards.filter((d) => d.meta.depends_on.includes(c.meta.id)).map((d) => d.meta.id);
  return { version: 1, server: { pid: 1, started: at(0), now: at(100), watch: "events" }, project: { name: "repo", branch: "main" }, decks: [], rules, cards, routing: ROUTING, problems: [] };
}
const rule = (id: string, body: string, topic?: string): ApiState["rules"][number] => ({
  meta: { type: "rule", format: 1, id, covers: [], accepted_by: "gus", created: at(0), ...(topic ? { topic } : {}) },
  body,
});

describe("rarity and stakes (D11)", () => {
  it("rises with reversibility, dependents, conflict and hard facts", () => {
    expect(rarityOf(card(), 0).rarity).toBe("common");
    expect(rarityOf(card({ reverse: "moderate" }), 0).rarity).toBe("uncommon");
    expect(rarityOf(card(), 1).rarity).toBe("uncommon");
    expect(rarityOf(card({ reverse: "one-way" }), 0).rarity).toBe("rare");
    expect(rarityOf(card(), 3).rarity).toBe("rare");
    expect(rarityOf(card({ conflict_of: ["B-aaaaa", "B-bbbbb"] }), 0).rarity).toBe("rare");
    const mythic = rarityOf(card({ touches: ["security"], reverse: "one-way", level: "hard" }), 0);
    expect(mythic).toMatchObject({ rarity: "mythic", tier: "high" });
    expect(mythic.why).toEqual(["it touches security", "it's hard to undo", "an agent has stopped for it"]);
  });

  it("says the stakes in words, never the tier's name", () => {
    expect(stakesLine(card({ reverse: "one-way", touches: ["security", "data-loss"] }), 2)).toBe("Hard to undo, touches security and data loss, 2 decisions rest on it");
    expect(stakesLine(card(), 0)).toBe("Easy to undo");
  });

  it("counts only dependents that still rest on the card", () => {
    const parent = card();
    const live = card({ depends_on: [parent.meta.id] });
    const gone = card({ depends_on: [parent.meta.id] }, { status: "withdrawn" });
    const s = snapshot([parent, live, gone]);
    expect(liveDependents(parent, byId(s)).map((c) => c.meta.id)).toEqual([live.meta.id]);
  });
});

describe("waiting agents (D90)", () => {
  const now = T0 + 200_000;
  it("tells waiting from gone from carried on", () => {
    expect(waitState(card({}, { waiting: [{ agent: "a", since: at(100), at: at(190), stale: false }] }), now)).toBe("waiting");
    expect(waitState(card({}, { waiting: [{ agent: "a", since: at(0), at: at(50), stale: false }] }), now)).toBe("gone");
    expect(waitState(card({}, { fallbacks: [{ type: "fallback", format: 1, card: "B-00001", revision: 1, reason: "timeout", agent: "a", at: at(9) }] }), now)).toBe("carried-on");
    expect(waitState(card(), now)).toBe("none");
  });
});

describe("the queue", () => {
  it("puts a card with an agent waiting now first of all, then areas by their rarest card", () => {
    const now = T0 + 200_000;
    const cheapA = card({ topic: "alpha/x" });
    const rareB = card({ topic: "beta/x", reverse: "one-way" });
    const cheapB = card({ topic: "beta/y" });
    const waitingA = card({ topic: "alpha/z", level: "blocking" }, { waiting: [{ agent: "codex", since: at(150), at: at(195), stale: false }] });
    const goneA = card({ topic: "alpha/w", level: "blocking" }, { waiting: [{ agent: "codex", since: at(0), at: at(10), stale: false }] });
    const order = queue(snapshot([cheapA, rareB, cheapB, waitingA, goneA]), now).map((c) => c.meta.id);
    expect(order[0]).toBe(waitingA.meta.id);
    // beta's rarest card (rare) outranks alpha's (common), so beta comes first; within an area, rarest then oldest.
    expect(order.slice(1)).toEqual([rareB.meta.id, cheapB.meta.id, cheapA.meta.id, goneA.meta.id]);
  });

  it("leaves out answered cards, and parks passed-on and deferred ones", () => {
    const open = card();
    const resolved = card({}, { status: "resolved" });
    const passed = card({}, { status: "rerouted" });
    const deferred = card({}, { status: "deferred" });
    const s = snapshot([open, resolved, passed, deferred]);
    expect(queue(s, T0).map((c) => c.meta.id)).toEqual([open.meta.id]);
    expect(parked(s).map((c) => c.meta.id)).toEqual([passed.meta.id, deferred.meta.id]);
  });
});

describe("held cards and audits (M8b: D150, D151)", () => {
  const held = (over: Partial<ApiCard["meta"]> = {}, rest: Partial<Omit<ApiCard, "meta">> = {}) => card(over, { status: "held", ...rest });

  it("keeps held cards out of the queue, in their own list, newest first; audits come through the queue", () => {
    const open = card();
    const old = held({ created: at(1) });
    const recent = held({ created: at(50) });
    const audit = held({}, { audit: true });
    const s = snapshot([open, old, recent, audit]);
    expect(queue(s, T0).map((c) => c.meta.id)).toEqual([open.meta.id, audit.meta.id]);
    expect(heldBack(s).map((c) => c.meta.id)).toEqual([recent.meta.id, old.meta.id]);
    expect([open, old, audit].map(isHeld)).toEqual([false, true, true]);
  });

  it("spaces audits out among the other cards, one after every two, never first, and the rest at the end", () => {
    const others = [card({ topic: "a/1" }), card({ topic: "b/1" }), card({ topic: "c/1" }), card({ topic: "d/1" }), card({ topic: "e/1" })];
    const audits = [held({ topic: "z/1" }, { audit: true }), held({ topic: "z/2" }, { audit: true }), held({ topic: "z/3" }, { audit: true })];
    const ids = queue(snapshot([...audits, ...others]), T0).map((c) => c.meta.id);
    const o = others.map((c) => c.meta.id), a = audits.map((c) => c.meta.id);
    expect(ids).toEqual([o[0], o[1], a[0], o[2], o[3], a[1], o[4], a[2]]);
    expect(spaceOut([], audits).map((c) => c.meta.id)).toEqual(a);
  });
});

describe("Baesian's own cards (M8b)", () => {
  it("are filed by Baesian, by name, and a slider proposal says it changes your preferences", () => {
    expect(agentOf(card({ source_agent: "baesian" }))).toBe("Baesian");
    expect(agentOf(card())).toBe("claude-code");
    expect(stakesLine(card({ pref_row: "dependency", pref_from: "tell-me", pref_to: "sample" }), 0)).toBe("Easy to undo, a change to your preferences");
  });

  it("name decisions by title, not ID, and drop their references in brackets (D69)", () => {
    const known = card({ id: "B-x1y2z", title: "The run store" });
    const cards = byId(snapshot([known]));
    expect(ownText("On B-x1y2z, “The run store”, you chose “SQLite”.", cards)).toBe("On “The run store”, you chose “SQLite”.");
    expect(ownText("B-x1y2z, “The run store”: you chose “SQLite”; B-zzzzz, “Gone”: you chose “A”", cards)).toBe("“The run store”: you chose “SQLite”; “Gone”: you chose “A”");
    expect(ownText("It builds on B-x1y2z and B-zzzzz.", cards)).toBe("It builds on “The run store” and another decision.");
    expect(ownText("Baesian files this itself, with no model (B-y6jn6): one stop up (D161, B-87tkc).", cards)).toBe("Baesian files this itself, with no model: one stop up.");
  });

  it("quote an option's name once, even when it quotes something itself", () => {
    expect(quoted("SQLite")).toBe("“SQLite”");
    expect(quoted("Move it to “stop and ask”")).toBe("Move it to “stop and ask”");
  });
});

describe("relations, from stated fields only (D65)", () => {
  it("names what it builds on, what relies on it, and its precedent on the same topic", () => {
    const base = card({ topic: "storage/db", title: "The run store" }, { status: "resolved" });
    const older = card({ topic: "storage/db", title: "An older store choice", created: at(1) }, { status: "resolved" });
    const subject = card({ topic: "storage/db", depends_on: [base.meta.id] });
    const child = card({ topic: "storage/files", depends_on: [subject.meta.id] });
    const rels = relationsOf(subject, snapshot([base, older, subject, child]));
    expect(rels.map((r) => [r.kind, r.name, r.state])).toEqual([
      ["builds-on", "The run store", "settled earlier"],
      ["relies-on-this", child.meta.title, "waiting for you"],
      ["precedent", "An older store choice", "settled earlier"],
    ]);
  });

  it("says a card decided in the repo before it was linked was settled then (B-3zjjx)", () => {
    const early = card({ topic: "storage/db", title: "Decided before linking" }, { status: "resolved", before_linking: true });
    const subject = card({ topic: "storage/db" });
    expect(relationsOf(subject, snapshot([early, subject])).map((r) => [r.kind, r.state])).toEqual([["precedent", "settled before linking"]]);
  });

  it("names a card whose text the relay removed by how it ended, never by its ID; held ones are listed (M9f)", () => {
    const removed = (id: string, ended: "answered" | "withdrawn" | "held", settled: string) => ({ id, revision: 1, level: "provisional" as const, ended, filed: at(0), settled, removed: at(90) });
    const subject = card({ depends_on: ["B-old01"], proposal_breaks: ["B-old02"] });
    const state = { ...snapshot([subject]), removed: [removed("B-old01", "answered", "2026-08-03T10:00:00.000Z"), removed("B-old02", "withdrawn", at(2)), removed("B-old03", "held", at(1)), removed("B-old04", "held", at(3))] };
    const rels = relationsOf(subject, state);
    expect(rels.map((r) => [r.kind, r.name])).toEqual([
      ["builds-on", "An earlier decision"],
      ["conflict", "A withdrawn card"],
    ]);
    expect(rels[0]!.state).toMatch(/^settled .*2026; its text is no longer on the service$/);
    expect(JSON.stringify(rels.map((r) => [r.name, r.state]))).not.toContain("B-old");
    expect(heldRemoved(state).map((r) => r.id)).toEqual(["B-old04", "B-old03"]);
    expect(heldRemoved(snapshot([subject]))).toEqual([]);
  });

  it("lights what an option would replace or break, as the agent declares it", () => {
    const decided = card({ title: "Tokens live in a cookie" }, { status: "resolved" });
    const subject = card({ proposal_breaks: [decided.meta.id, "R-aaaaa"] });
    const rels = relationsOf(subject, snapshot([decided, subject], [rule("R-aaaaa", "# Never put secrets in URLs.\n\nMore.")]));
    expect(rels).toEqual([
      expect.objectContaining({ id: decided.meta.id, kind: "conflict", label: "this card conflicts with", keptBy: "alternative", effect: { proposal: { text: "replaced", bad: true }, alternative: { text: "kept", bad: false } } }),
      expect.objectContaining({ id: "R-aaaaa", kind: "rule", name: "Never put secrets in URLs", state: "your rule", effect: { proposal: { text: "may break it", bad: true }, alternative: { text: "keeps to it", bad: false } } }),
    ]);
  });

  it("keeps one of a conflict card's two decisions with each option (D94)", () => {
    const onMain = card({ title: "ISO 8601 times" }, { status: "resolved" });
    const onBranch = card({ title: "Epoch times" }, { status: "resolved" });
    const conflict = card({ conflict_of: [onMain.meta.id, onBranch.meta.id], proposal_breaks: [onBranch.meta.id], alternative_breaks: [onMain.meta.id] });
    const rels = relationsOf(conflict, snapshot([onMain, onBranch, conflict]));
    expect(rels.map((r) => [r.name, r.keptBy])).toEqual([["ISO 8601 times", "proposal"], ["Epoch times", "alternative"]]);
  });

  it("says a rule the agent cites may conflict, but one only on the same topic is no more than that (D79)", () => {
    const subject = card({ topic: "client/auth", rules: ["R-ccccc"] });
    const s = snapshot([subject], [rule("R-ccccc", "Cited rule"), rule("R-ddddd", "Topic rule", "client/auth"), rule("R-eeeee", "Elsewhere", "storage/db")]);
    expect(relationsOf(subject, s).map((r) => [r.name, r.label])).toEqual([
      ["Cited rule", "this card may conflict with"],
      ["Topic rule", "a rule on the same topic"],
    ]);
  });

  it("shows a retired rule as retired, with nothing for either option to break, and drops it from its topic (D119)", () => {
    const retired = { ...rule("R-aaaaa", "Never put secrets in URLs.", "client/auth"), retired: { type: "rule-retirement" as const, format: 1, rule: "R-aaaaa", card: "B-bbbbb", by: "gus", at: at(1) } };
    const breaker = card({ topic: "client/auth", proposal_breaks: ["R-aaaaa"] });
    expect(relationsOf(breaker, snapshot([breaker], [retired]))).toEqual([expect.objectContaining({ id: "R-aaaaa", kind: "rule", state: "retired rule" })]);
    expect(relationsOf(breaker, snapshot([breaker], [retired]))[0]).not.toHaveProperty("effect");
    const onTopic = card({ topic: "client/auth" });
    expect(relationsOf(onTopic, snapshot([onTopic], [retired]))).toEqual([]);
  });

  it("never names a card it can't find", () => {
    const subject = card({ depends_on: ["B-zzzzz"] });
    expect(relationsOf(subject, snapshot([subject]))).toEqual([]);
  });
});

describe("sides (D86)", () => {
  it("stay put for a card within a session, and differ across cards and sessions", () => {
    expect(sidesFor("B-7f3kq", "s1")).toEqual(sidesFor("B-7f3kq", "s1"));
    const lefts = new Set(["B-00001", "B-00002", "B-00003", "B-00004", "B-00005", "B-00006", "B-00007", "B-00008"].map((id) => sidesFor(id, "s1").left));
    expect(lefts.size).toBe(2);
    const sessions = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map((salt) => sidesFor("B-7f3kq", salt).left));
    expect(sessions.size).toBe(2);
  });
});

describe("areas", () => {
  it("are the first segment of the canonical topic", () => {
    expect(areaOf(card({ topic: "storage/run-metadata" }))).toBe("storage");
  });
});

describe("the agent's reply (D89, D104)", () => {
  it("is on the revision that carries it, with the answer it replied to", () => {
    const v = (revision: number, response: string, choice?: string) => ({ card: "B-00001", revision, response, ...(choice ? { choice } : {}), reviewer: "gus", client: "web", at: at(revision) });
    const verdicts = [v(1, "question"), v(1, "alternative", "Option B"), v(2, "alternative", "Option C")] as unknown as ApiCard["verdicts"];
    expect(replyOf(card({ revision: 2, reply: "Only CI writes runs." }, { verdicts }))).toEqual({ reply: "Only CI writes runs.", to: "Option B" });
    expect(replyOf(card({}, { verdicts }))).toBeUndefined();
  });
});
