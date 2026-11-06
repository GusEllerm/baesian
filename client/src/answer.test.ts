import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiCard } from "../../src/api";
import { describeAnswer, verdictFor } from "./answer";
import { Outbox } from "./outbox";

// What the reviewer answers, as the verdicts the server records (M4 step 5c).

const card = {
  meta: { id: "B-7f3kq", revision: 2, proposal: "SQLite", alternative: "Postgres" },
} as unknown as ApiCard;

describe("verdictFor", () => {
  it("accepts the proposal, recording the choice made before the reveal (D88)", () => {
    expect(verdictFor(card, { kind: "choose", option: "proposal", first: "alternative" })).toEqual({
      verdict: { card: "B-7f3kq", revision: 2, response: "accept", first_choice: "alternative" },
    });
  });

  it("chooses the alternative by name, with a disagreement's reason as its comment (D87)", () => {
    expect(verdictFor(card, { kind: "choose", option: "alternative", first: "alternative", why: "  Two machines write runs.  " })).toEqual({
      verdict: { card: "B-7f3kq", revision: 2, response: "alternative", choice: "Postgres", first_choice: "alternative", comment: "Two machines write runs." },
    });
  });

  it("sends no blind choice for a card answered in chat, whose pick you'd seen (B-hswmx)", () => {
    const seen = { meta: { ...card.meta, answered_in_chat: "SQLite, one machine." } } as unknown as ApiCard;
    expect(verdictFor(seen, { kind: "choose", option: "proposal", rule: true })).toEqual({ verdict: { card: "B-7f3kq", revision: 2, response: "accept", make_rule: true } });
    // Even if a blind choice reached it, it isn't sent: the server would refuse it.
    expect(verdictFor(seen, { kind: "choose", option: "alternative", first: "alternative", why: "I meant the other." })).toEqual({
      verdict: { card: "B-7f3kq", revision: 2, response: "alternative", choice: "Postgres", comment: "I meant the other." },
    });
    expect(describeAnswer(seen, { kind: "choose", option: "proposal" })).toBe("You confirmed “SQLite”, your answer in chat.");
    expect(describeAnswer(seen, { kind: "choose", option: "alternative" })).toBe("You chose “Postgres”.");
  });

  it("needs the text of a question, an answer of your own, or a rejection", () => {
    expect(verdictFor(card, { kind: "write", reason: "question", text: " " })).toEqual({ problem: "Write your question first." });
    expect(verdictFor(card, { kind: "write", reason: "correction", text: "DuckDB" })).toEqual({ verdict: { card: "B-7f3kq", revision: 2, response: "correction", choice: "DuckDB" } });
    expect(verdictFor(card, { kind: "write", reason: "reject", text: "Not here." })).toEqual({ verdict: { card: "B-7f3kq", revision: 2, response: "reject", comment: "Not here." } });
  });

  it("sends \"can't judge\" with an optional note, including \"I need to see it run\" (D85)", () => {
    expect(verdictFor(card, { kind: "pass", reason: "see_it_run", text: "" })).toEqual({ verdict: { card: "B-7f3kq", revision: 2, response: "see_it_run" } });
    expect(verdictFor(card, { kind: "pass", reason: "need_context", text: "What writes runs?" })).toEqual({
      verdict: { card: "B-7f3kq", revision: 2, response: "need_context", comment: "What writes runs?" },
    });
  });

  it("asks for a rule when you tick the toggle: on a choice, your own answer, or a rejection (D16, D109)", () => {
    expect(verdictFor(card, { kind: "choose", option: "proposal", first: "proposal", rule: true })).toEqual({ verdict: expect.objectContaining({ response: "accept", make_rule: true }) });
    expect(verdictFor(card, { kind: "write", reason: "correction", text: "DuckDB", rule: true })).toEqual({ verdict: expect.objectContaining({ response: "correction", make_rule: true }) });
    expect(verdictFor(card, { kind: "write", reason: "reject", text: "No ORMs.", rule: true })).toEqual({ verdict: expect.objectContaining({ response: "reject", make_rule: true }) });
    // A question isn't an answer to make a rule of.
    expect(verdictFor(card, { kind: "write", reason: "question", text: "Why?", rule: true })).toEqual({ verdict: expect.not.objectContaining({ make_rule: true }) });
    expect(verdictFor(card, { kind: "choose", option: "proposal", first: "proposal" })).toEqual({ verdict: expect.not.objectContaining({ make_rule: true }) });
  });

  it("retires the rules you ticked, with the choice that breaks them (D119)", () => {
    expect(verdictFor(card, { kind: "choose", option: "alternative", first: "alternative", retire: ["R-aaaaa"] })).toEqual({ verdict: expect.objectContaining({ response: "alternative", retire_rules: ["R-aaaaa"] }) });
    expect(verdictFor(card, { kind: "choose", option: "proposal", first: "proposal", retire: [] })).toEqual({ verdict: expect.not.objectContaining({ retire_rules: expect.anything() }) });
  });

  it("describes an answer in a few words", () => {
    expect(describeAnswer(card, { kind: "choose", option: "alternative", first: "alternative" })).toBe("You chose “Postgres”.");
    expect(describeAnswer(card, { kind: "pass", reason: "see_it_run", text: "" })).toBe("You asked to see it run.");
  });

  it("marks \"you should have asked me\" on the verdict when you tick it (B-87tkc), and words a held card's answer as keeping or overturning (D151)", () => {
    expect(verdictFor(card, { kind: "choose", option: "proposal", first: "alternative", asked: true })).toEqual({ verdict: expect.objectContaining({ response: "accept", first_choice: "alternative", should_have_asked: true }) });
    expect(verdictFor(card, { kind: "choose", option: "proposal", first: "proposal" })).toEqual({ verdict: expect.not.objectContaining({ should_have_asked: expect.anything() }) });
    const held = { ...card, status: "held" } as ApiCard;
    expect(describeAnswer(held, { kind: "choose", option: "proposal", first: "alternative" })).toBe("You kept “SQLite”.");
    expect(describeAnswer(held, { kind: "choose", option: "alternative", first: "alternative" })).toBe("You overturned it, for “Postgres”.");
  });
});

describe("the outbox (D82)", () => {
  afterEach(() => vi.useRealTimers());
  const verdict = { card: "B-7f3kq", revision: 1, response: "accept" as const };

  function outbox() {
    const posts: { keepalive: boolean }[] = [];
    const sent: string[] = [];
    const failed: string[] = [];
    const box = new Outbox(async (_v, opts) => void posts.push(opts), 5000, { sent: (c) => sent.push(c), failed: (_c, e) => failed.push(e) });
    return { box, posts, sent, failed };
  }

  it("sends an answer when the window closes, and not before", async () => {
    vi.useFakeTimers();
    const { box, posts, sent } = outbox();
    box.hold("B-7f3kq", verdict);
    await vi.advanceTimersByTimeAsync(4999);
    expect(posts).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(posts).toEqual([{ keepalive: false }]);
    expect(sent).toEqual(["B-7f3kq"]);
  });

  it("passes on the cards Baesian proposed from the answer (D161, B-y6jn6)", async () => {
    const sent: unknown[][] = [];
    const box = new Outbox(async () => ({ filed: ["B-ccccc"] }), 5000, { sent: (...a) => void sent.push(a), failed: () => {} });
    box.hold("B-7f3kq", verdict);
    box.flush();
    await vi.waitFor(() => expect(sent).toEqual([["B-7f3kq", { filed: ["B-ccccc"] }]]));
  });

  it("takes an answer back on undo, and sends nothing", async () => {
    vi.useFakeTimers();
    const { box, posts } = outbox();
    box.hold("B-7f3kq", verdict);
    expect(box.undo()).toBe("B-7f3kq");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(posts).toEqual([]);
    expect(box.undo()).toBeUndefined();
  });

  it("sends what's waiting at once when the next answer comes, or the page closes", async () => {
    vi.useFakeTimers();
    const { box, posts } = outbox();
    box.hold("B-aaaaa", verdict);
    box.hold("B-bbbbb", verdict);
    expect(posts).toEqual([{ keepalive: false }]);
    box.flush(true);
    expect(posts).toEqual([{ keepalive: false }, { keepalive: true }]);
  });

  it("reports a send that fails, with the server's reason", async () => {
    const failed: string[] = [];
    const box = new Outbox(async () => { throw new Error("B-7f3kq is at revision 2; a verdict on r1 is stale"); }, 5000, { sent: () => {}, failed: (_c, e) => failed.push(e) });
    box.hold("B-7f3kq", verdict);
    box.flush();
    await new Promise((r) => setTimeout(r, 0));
    expect(failed).toEqual(["B-7f3kq is at revision 2; a verdict on r1 is stale"]);
  });
});
