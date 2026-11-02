import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
import { describeOutcome, waitForVerdict } from "../src/wait.js";
import { BODY, REVIEWER, cleanup, draft, fakeClock, repo } from "./helpers.js";

// A rule from an answer (D16): the reviewer ticks "make this a rule", the agent drafts it with the gate patterns
// it covers, and it comes back as a card; accepting it saves the rule (D109, D110).

afterEach(cleanup);

const AGENT = { agent: "claude-code" };
const later = (s: number) => new Date(Date.now() + s * 1000).toISOString();
const RULE = "Use pytest for every Python test suite.";

/** A decision the reviewer answered, asking for a rule. */
function asked(over: Record<string, unknown> = {}) {
  const r = repo();
  const id = r.store.fileCard(draft({ title: "The test runner", question: "Which test runner?", topic: "testing/runner", proposal: "pytest", alternative: "unittest" }), BODY, AGENT).card.meta.id;
  r.store.addVerdict({ card: id, revision: 1, response: "accept", make_rule: true, ...REVIEWER, ...over });
  return { ...r, id };
}

function run(cwd: string, args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const io = { out: (l: string) => out.push(l), err: (l: string) => err.push(l), stdin: () => "", cwd };
  return main(["node", "baesian", "--agent", "claude-code", ...args], io).then((code) => ({ code, out: out.join("\n"), err: err.join("\n") }));
}

describe("drafting a rule (D109, D110)", () => {
  it("is asked for by the toggle, and drafted as a card that builds on the decision", () => {
    const { store, id } = asked();
    expect(store.ruleAsked(id)).toBe(true);
    const card = store.draftRule(id, ` ${RULE} `, ["dep:pytest*"], AGENT);
    expect(card.meta).toMatchObject({
      title: "A rule from “The test runner”",
      question: `Make this a rule: “${RULE}”?`,
      topic: "testing/runner",
      deck: store.card(id)!.meta.deck,
      proposal: "Make it a rule",
      alternative: "Keep it to this decision",
      depends_on: [id],
      rule: RULE,
      rule_covers: ["dep:pytest*"],
      level: "provisional",
    });
    expect(card.meta.proposal_then).toContain("dep:pytest*");
    expect(store.status(card.meta.id)).toBe("open");
    expect(store.ruleAsked(id)).toBe(false);
  });

  it("only when the reviewer asked, once per decision, with patterns the gate knows", () => {
    const r = repo();
    const plain = r.store.fileCard(draft(), BODY, AGENT).card.meta.id;
    r.store.addVerdict({ card: plain, revision: 1, response: "accept", ...REVIEWER });
    expect(r.store.ruleAsked(plain)).toBe(false);
    expect(() => r.store.draftRule(plain, RULE, [], AGENT)).toThrow(/didn't ask for a rule/);

    const { store, id } = asked();
    expect(() => store.draftRule(id, "  ", [], AGENT)).toThrow(/the rule is empty/);
    expect(() => store.draftRule(id, RULE, ["pytest"], AGENT)).toThrow(/not a gate pattern: pytest/);
    store.draftRule(id, RULE, [], AGENT);
    expect(() => store.draftRule(id, RULE, [], AGENT)).toThrow(/already drafted/);
  });

  it("can't be set by filing a card: only by drafting", () => {
    const { store } = repo();
    expect(() => store.fileCard(draft({ rule: RULE }), BODY, AGENT)).toThrow(/rule/);
  });
});

describe("saving a rule (D110)", () => {
  it("is done when you accept the draft, with its wording, patterns and topic", () => {
    const { store, id } = asked();
    const card = store.draftRule(id, RULE, ["dep:pytest*"], AGENT);
    expect(store.rules()).toEqual([]);
    store.addVerdict({ card: card.meta.id, revision: 1, response: "accept", ...REVIEWER, at: later(1) });
    const rules = store.rules();
    expect(rules).toHaveLength(1);
    expect(rules[0]!.meta).toMatchObject({ topic: "testing/runner", covers: ["dep:pytest*"], from_card: id, accepted_by: "gus" });
    expect(rules[0]!.body.trim()).toBe(RULE);
    expect(existsSync(join(store.record, "rules", `${rules[0]!.meta.id}.md`))).toBe(true);
  });

  it("takes your own wording, if you answer with it", () => {
    const { store, id } = asked();
    const card = store.draftRule(id, RULE, [], AGENT);
    store.addVerdict({ card: card.meta.id, revision: 1, response: "correction", choice: "Use pytest, except for the CLI's smoke tests.", ...REVIEWER, at: later(1) });
    expect(store.rules().map((r) => r.body.trim())).toEqual(["Use pytest, except for the CLI's smoke tests."]);
  });

  it("isn't done when you keep it to the decision, and is done once however often you answer", () => {
    const a = asked();
    const kept = a.store.draftRule(a.id, RULE, [], AGENT);
    a.store.addVerdict({ card: kept.meta.id, revision: 1, response: "alternative", choice: "Keep it to this decision", ...REVIEWER, at: later(1) });
    expect(a.store.rules()).toEqual([]);

    const b = asked();
    const card = b.store.draftRule(b.id, RULE, [], AGENT);
    b.store.addVerdict({ card: card.meta.id, revision: 1, response: "accept", ...REVIEWER, at: later(1) });
    b.store.addVerdict({ card: card.meta.id, revision: 1, response: "accept", ...REVIEWER, at: later(2) });
    expect(b.store.rules()).toHaveLength(1);
  });
});

describe("telling the agent (D109)", () => {
  it("offers the draft to a waiting agent until it's drafted", async () => {
    const { store, id } = asked();
    const o = await waitForVerdict(store, id, { ...AGENT, ...fakeClock() });
    expect(o).toMatchObject({ kind: "resolved", ruleAsked: true });
    expect(describeOutcome(o).join("\n")).toContain(`baesian rule ${id} "<the rule>" --covers <pattern>…`);
    store.draftRule(id, RULE, [], AGENT);
    const again = await waitForVerdict(store, id, { ...AGENT, ...fakeClock() });
    expect(describeOutcome(again).join("\n")).not.toContain("baesian rule");
  });

  it("offers it on a rejection that asks for a rule, too", async () => {
    const { store, id } = asked({ response: "reject", comment: "Never unittest." });
    const o = await waitForVerdict(store, id, { ...AGENT, ...fakeClock() });
    expect(o).toMatchObject({ kind: "answered", status: "returned", ruleAsked: true });
    expect(describeOutcome(o).join("\n")).toContain(`baesian rule ${id}`);
  });

  it("through the inbox and the command", async () => {
    const { dir, id } = asked();
    expect((await run(dir, ["inbox", "--peek"])).out).toContain(`baesian rule ${id}`);
    const r = await run(dir, ["rule", id, RULE, "--covers", "dep:pytest*", "dep:pytest-cov"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^filed B-\w{5}: the rule goes to the reviewer as a card/);
    expect((await run(dir, ["inbox", "--peek"])).out).not.toContain("baesian rule");
    const { AGENTS_BLOCK } = await import("../src/agents.js");
    expect(AGENTS_BLOCK).toContain('baesian rule <id> "<the rule>"');
  });
});

describe("retiring a rule (D119)", () => {
  /** A saved rule, and a card whose proposal breaks it. */
  function ruled() {
    const r = asked();
    const draftCard = r.store.draftRule(r.id, RULE, ["dep:pytest*"], AGENT);
    r.store.addVerdict({ card: draftCard.meta.id, revision: 1, response: "accept", ...REVIEWER, at: later(1) });
    const rule = r.store.rules()[0]!.meta.id;
    const breaker = r.store.fileCard(
      draft({ title: "The CLI's smoke tests", question: "How should the CLI's smoke tests run?", topic: "testing/smoke", proposal: "A shell script", alternative: "pytest", proposal_breaks: [rule] }),
      BODY,
      AGENT,
    ).card.meta.id;
    return { ...r, rule, breaker };
  }

  it("is done by an answer that chooses the option breaking it, beside the rule, which stays", async () => {
    const { store, rule, breaker, dir } = ruled();
    store.addVerdict({ card: breaker, revision: 1, response: "accept", retire_rules: [rule], ...REVIEWER, at: later(2) });
    const [saved] = store.rules();
    expect(saved!.meta.id).toBe(rule);
    expect(saved!.retired).toMatchObject({ rule, card: breaker, by: "gus" });
    expect(existsSync(join(store.record, "rules", `${rule}-retired.json`))).toBe(true);
    // The agent is told, and stops citing it.
    expect((await run(dir, ["inbox"])).out).toContain(`${breaker} r1  accept; retires ${rule}`);
  });

  it("stops the gate approving what it covered", async () => {
    const { store, rule, breaker, dir } = ruled();
    const { evaluate } = await import("../src/gate.js");
    const { parseTrailers } = await import("../src/trailers.js");
    const fact = { id: "dep:pytest-cov", kind: "dep" as const, path: "package.json", detail: "added to package.json" };
    expect(evaluate(store, { facts: [fact], warnings: [] }, parseTrailers("Add pytest-cov\n", dir)).covered[0]?.cover).toEqual({ by: "rule", rule });
    store.addVerdict({ card: breaker, revision: 1, response: "accept", retire_rules: [rule], ...REVIEWER, at: later(2) });
    expect(evaluate(store, { facts: [fact], warnings: [] }, parseTrailers("Add pytest-cov\n", dir)).uncovered).toEqual([fact]);
  });

  it("only for a rule the chosen option breaks, by a choice between the options, once", () => {
    const { store, rule, breaker } = ruled();
    expect(() => store.addVerdict({ card: breaker, revision: 1, response: "alternative", choice: "pytest", retire_rules: [rule], ...REVIEWER, at: later(2) })).toThrow(/isn't a rule that .* alternative breaks/);
    expect(() => store.addVerdict({ card: breaker, revision: 1, response: "reject", comment: "Neither.", retire_rules: [rule], ...REVIEWER, at: later(2) })).toThrow(/only choosing one of a card's options/);
    expect(() => store.addVerdict({ card: breaker, revision: 1, response: "accept", retire_rules: ["R-zzzzz"], ...REVIEWER, at: later(2) })).toThrow(/isn't a rule that/);
    expect(store.verdicts(breaker)).toEqual([]); // a refused answer writes nothing
    store.addVerdict({ card: breaker, revision: 1, response: "accept", retire_rules: [rule], ...REVIEWER, at: later(2) });
    expect(() => store.addVerdict({ card: breaker, revision: 1, response: "accept", retire_rules: [rule], ...REVIEWER, at: later(3) })).toThrow(/already retired/);
  });

  it("tells a waiting agent", async () => {
    const { store, rule, breaker } = ruled();
    store.addVerdict({ card: breaker, revision: 1, response: "accept", retire_rules: [rule], ...REVIEWER, at: later(2) });
    const lines = describeOutcome(await waitForVerdict(store, breaker, { ...AGENT, ...fakeClock() }));
    expect(lines).toContain(`  The reviewer retired the rule it breaks, ${rule}: don't cite it again.`);
  });
});
