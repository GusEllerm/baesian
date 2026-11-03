import { afterEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
import { describeOutcome, waitForVerdict } from "../src/wait.js";
import { BODY, REVIEWER, cleanup, draft, fakeClock, repo } from "./helpers.js";

// The agent's one reply to an answer that went against its pick (D89, D104).

afterEach(cleanup);

const AGENT = { agent: "claude-code" };
const later = (s: number) => new Date(Date.now() + s * 1000).toISOString();
const FACT = "Only the CI runner writes runs; nothing else ever will.";

/** A card the reviewer answered with the alternative, against the agent's pick. */
function disagreed(over: Record<string, unknown> = {}) {
  const r = repo();
  const id = r.store.fileCard(draft(over), BODY, AGENT).card.meta.id;
  r.store.addVerdict({ card: id, revision: 1, response: "alternative", choice: "Postgres", comment: "Two machines will write runs.", ...REVIEWER });
  return { ...r, id };
}

function run(cwd: string, args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const io = { out: (l: string) => out.push(l), err: (l: string) => err.push(l), stdin: () => "", cwd };
  return main(["node", "baesian", "--agent", "claude-code", ...args], io).then((code) => ({ code, out: out.join("\n"), err: err.join("\n") }));
}

describe("the agent's one reply (D89, D104)", () => {
  it("files the next revision, the same card with the fact added, and reopens it", () => {
    const { store, id } = disagreed();
    expect(store.canReply(id)).toBe(true);
    const card = store.replyToCard(id, `  ${FACT} `, AGENT);
    expect(card.meta).toMatchObject({ revision: 2, reply: FACT, proposal: "SQLite (WAL mode)", alternative: "Postgres", crux: "Will more than one machine write runs at once?" });
    expect(store.revisions(id)[0]!.body).toBe(store.revisions(id)[1]!.body);
    expect(store.status(id)).toBe("open");
    expect(store.canReply(id)).toBe(false);
  });

  it("is open only after an answer against the pick: the alternative, or the reviewer's own", () => {
    const own = repo();
    const a = own.store.fileCard(draft(), BODY, AGENT).card.meta.id;
    own.store.addVerdict({ card: a, revision: 1, response: "correction", choice: "DuckDB", comment: "Analytics, mostly.", ...REVIEWER });
    expect(own.store.canReply(a)).toBe(true);

    const agreed = repo();
    const b = agreed.store.fileCard(draft(), BODY, AGENT).card.meta.id;
    expect(() => agreed.store.replyToCard(b, FACT, AGENT)).toThrow(/is open; only a card answered against your pick/);
    agreed.store.addVerdict({ card: b, revision: 1, response: "accept", ...REVIEWER });
    expect(() => agreed.store.replyToCard(b, FACT, AGENT)).toThrow(/is resolved; only a card answered against your pick/);
    // A returned card is revised, not replied to.
    agreed.store.addVerdict({ card: b, revision: 1, response: "question", comment: "Why not DuckDB?", ...REVIEWER, at: later(1) });
    expect(() => agreed.store.replyToCard(b, FACT, AGENT)).toThrow(/is returned/);
  });

  it("happens once per card, even if the reviewer goes against the pick again", () => {
    const { store, id } = disagreed();
    store.replyToCard(id, FACT, AGENT);
    store.addVerdict({ card: id, revision: 2, response: "alternative", choice: "Postgres", ...REVIEWER, at: later(1) });
    expect(store.status(id)).toBe("resolved");
    expect(store.canReply(id)).toBe(false);
    expect(() => store.replyToCard(id, "Another fact.", AGENT)).toThrow(/has had its reply/);
  });

  it("can't be set by filing or revising a card: only by the reply", () => {
    const { store } = repo();
    expect(() => store.fileCard(draft({ reply: FACT }), BODY, AGENT)).toThrow(/reply/);
    const { store: s2, id } = disagreed();
    expect(() => s2.replyToCard(id, "   ", AGENT)).toThrow(/the reply is empty/);
  });

  it("brings a rework brief when the reviewer changes their answer after it (D81)", () => {
    const { store, id } = disagreed();
    store.writeLedger(id, { commit: "abc1234def5678", branch: "main" }, "");
    store.replyToCard(id, FACT, AGENT);
    expect(store.briefs(id)).toEqual([]);
    store.addVerdict({ card: id, revision: 2, response: "accept", ...REVIEWER, at: later(1) });
    expect(store.decision(id)).toBe("SQLite (WAL mode)");
    expect(store.briefs(id)).toEqual([expect.objectContaining({ kind: "answer-changed", was: "Postgres", now: "SQLite (WAL mode)", commits: [{ commit: "abc1234def5678", branch: "main", rewritten: true }] })]);
  });

  it("is offered to a waiting agent, once, and not when the answer was its pick", async () => {
    const { store, id } = disagreed();
    const o = await waitForVerdict(store, id, { ...AGENT, ...fakeClock() });
    expect(o).toMatchObject({ kind: "resolved", decision: "Postgres", canReply: true });
    expect(describeOutcome(o).join("\n")).toContain(`baesian reply ${id} "<the fact or check>"`);
    store.replyToCard(id, FACT, AGENT);
    store.addVerdict({ card: id, revision: 2, response: "alternative", choice: "Postgres", ...REVIEWER, at: later(1) });
    const again = await waitForVerdict(store, id, { ...AGENT, ...fakeClock() });
    expect(describeOutcome(again).join("\n")).not.toContain("baesian reply");
  });
});

describe("baesian reply", () => {
  it("files the reply, says what happens next, and the inbox offers it only while it's open", async () => {
    const { dir, id } = disagreed();
    const inbox = await run(dir, ["inbox"]);
    expect(inbox.out).toContain(`baesian reply ${id}`);
    const r = await run(dir, ["reply", id, FACT]);
    expect(r.code).toBe(0);
    expect(r.out).toContain(`filed ${id} r2: your reply goes to the reviewer, and the card is open again`);
    expect(r.out).toContain("proceed with their decision");
    const twice = await run(dir, ["reply", id, "Another fact."]);
    expect(twice.code).not.toBe(0);
    expect(twice.err).toMatch(/has had its reply/);
    expect((await run(dir, ["inbox", "--peek"])).out).not.toContain("baesian reply");
  });

  it("tells the agent on a hard card not to commit work that cites it until the new answer", async () => {
    const { dir, id } = disagreed({ touches: ["security"], reverse: "one-way", wrong_if: "a page script reads it", check: "the client's scripts" });
    const r = await run(dir, ["reply", id, FACT]);
    expect(r.out).toContain(`it's hard: don't commit work that cites it until \`baesian wait ${id}\` exits 0`);
  });

  it("is in the instructions agents get", async () => {
    const { AGENTS_BLOCK } = await import("../src/agents.js");
    expect(AGENTS_BLOCK).toContain('baesian reply <id> "<the fact or check>"');
  });
});

