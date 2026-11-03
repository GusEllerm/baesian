import { afterEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
import { BODY, REVIEWER, cleanup, draft, fakeClock, repo } from "./helpers.js";

// What `baesian wait` delivers, `inbox` (and the harness hooks that run it, D116) doesn't deliver again.

afterEach(cleanup);

const AGENT = { agent: "claude-code" };
const later = (s: number) => new Date(Date.now() + s * 1000).toISOString();

function run(cwd: string, args: string[]) {
  const out: string[] = [];
  const io = { out: (l: string) => out.push(l), err: () => {}, stdin: () => "", cwd, waitClock: fakeClock() };
  return main(["node", "baesian", ...args], io).then((code) => ({ code, out: out.join("\n") }));
}

describe("verdicts that wait delivered", () => {
  it("aren't in the inbox again", async () => {
    const { dir, store } = repo();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    expect((await run(dir, ["wait", id])).code).toBe(0);
    expect((await run(dir, ["inbox", "--quiet"])).out).toBe("");
    expect((await run(dir, ["inbox"])).out).toBe("no new verdicts");
  });

  it("nor is an answer that returned the card, once wait has said so", async () => {
    const { dir, store } = repo();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: id, revision: 1, response: "need_context", comment: "Which runs?", ...REVIEWER });
    expect((await run(dir, ["wait", id])).code).toBe(4);
    expect(store.inbox({ advance: false })).toEqual([]);
  });

  it("leave older verdicts the agent hasn't seen in the inbox", () => {
    const { store } = repo();
    const seen = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    const unseen = store.fileCard(draft({ title: "Where run files are kept", question: "Where should the run files go?", topic: "storage/run-files" }), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: unseen, revision: 1, response: "accept", ...REVIEWER });
    const v = store.addVerdict({ card: seen, revision: 1, response: "accept", ...REVIEWER, at: later(1) });
    store.markDelivered(seen, { verdict: v, briefs: [] });
    expect(store.inbox({ advance: false }).map((i) => i.card)).toEqual([unseen]);
    expect(store.inbox({ advance: true }).map((i) => i.card)).toEqual([unseen]);
    expect(store.inbox({ advance: true })).toEqual([]);
  });

  it("don't hide a later answer on the same card", () => {
    const { store } = repo();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    const first = store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    store.markDelivered(id, { verdict: first, briefs: [] });
    store.addVerdict({ card: id, revision: 1, response: "alternative", choice: "Postgres", ...REVIEWER, at: later(1) });
    expect(store.inbox({ advance: true }).map((i) => i.verdict.response)).toEqual(["alternative"]);
  });

  it("cover a dependent returned by its parent's answer, once wait on the dependent has said so", async () => {
    const { dir, store } = repo();
    const parent = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    const child = store.fileCard(
      draft({ title: "Where run files are kept", question: "Where should the run files go?", topic: "storage/run-files", depends_on: [parent] }),
      BODY,
      AGENT,
    ).card.meta.id;
    store.addVerdict({ card: parent, revision: 1, response: "alternative", choice: "Postgres", ...REVIEWER });
    expect((await run(dir, ["wait", child])).code).toBe(4);
    // The parent's own verdict is still news: the agent waited on the dependent, not on the parent.
    expect(store.inbox({ advance: false }).map((i) => i.card)).toEqual([parent]);
  });
});

describe("two sessions on one branch (B-ghhym)", () => {
  const second = { title: "Where run files are kept", question: "Where should the run files go?", topic: "storage/run-files" };

  it("each hear a verdict once, whatever the other or a plain inbox has read", () => {
    const { store } = repo();
    const a = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: a, revision: 1, response: "accept", ...REVIEWER });
    // A session that has never read starts where the branch is: here, before a's verdict.
    expect(store.inbox({ advance: true, session: "one" }).map((i) => i.card)).toEqual([a]);
    store.inbox({ advance: true, session: "two" });

    const b = store.fileCard(draft(second), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: b, revision: 1, response: "accept", ...REVIEWER, at: later(2) });
    expect(store.inbox({ advance: true }).map((i) => i.card)).toEqual([b]); // a plain `baesian inbox`, with no session
    expect(store.inbox({ advance: true, session: "one" }).map((i) => i.card)).toEqual([b]);
    expect(store.inbox({ advance: true, session: "one" })).toEqual([]);
    expect(store.inbox({ advance: true, session: "two" }).map((i) => i.card)).toEqual([b]);
  });

  it("don't take each other's verdicts", () => {
    const { store } = repo();
    const a = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    store.inbox({ advance: true, session: "one" });
    store.inbox({ advance: true, session: "two" });
    store.addVerdict({ card: a, revision: 1, response: "accept", ...REVIEWER, at: later(2) });
    expect(store.inbox({ advance: true, session: "one" }).map((i) => i.card)).toEqual([a]);
    expect(store.inbox({ advance: true, session: "two" }).map((i) => i.card)).toEqual([a]);
    expect(store.inbox({ advance: true, session: "two" })).toEqual([]);
    // A session that starts later begins at the newest any session read, so it isn't handed old verdicts.
    expect(store.inbox({ advance: true, session: "three" })).toEqual([]);
  });

  it("leave a verdict that wait delivered delivered, for every session", async () => {
    const { dir, store } = repo();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    store.inbox({ advance: true, session: "one" });
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER, at: later(2) });
    expect((await run(dir, ["wait", id])).code).toBe(0);
    expect((await run(dir, ["inbox", "--quiet", "--session", "one"])).out).toBe("");
  });
});
