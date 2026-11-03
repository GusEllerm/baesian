import { afterEach, describe, expect, it } from "vitest";
import { WAITING_STALE_MS } from "../src/store.js";
import { describeOutcome, waitForVerdict } from "../src/wait.js";
import { BODY, REVIEWER, cleanup, draft, fakeClock, repo } from "./helpers.js";

// M4 step 3: what a verdict does beyond its own card (D80, D81), and the waiting marker (D90).

afterEach(cleanup);

const AGENT = { agent: "claude-code" };
const later = (s: number) => new Date(Date.now() + s * 1000).toISOString();

/** A card, and a second one that builds on it, filed on the same branch. */
function parentAndChild() {
  const r = repo();
  const parent = r.store.fileCard(draft(), BODY, AGENT).card.meta.id;
  const child = r.store.fileCard(
    draft({ title: "Where run files are kept", question: "Where should the run files go?", topic: "storage/run-files", depends_on: [parent] }),
    BODY,
    AGENT,
  ).card.meta.id;
  return { ...r, parent, child };
}

describe("choosing the alternative returns the cards built on the proposal (D80)", () => {
  it("returns a dependent, with a brief naming what changed", () => {
    const { store, parent, child } = parentAndChild();
    store.addVerdict({ card: parent, revision: 1, response: "alternative", choice: "Postgres", ...REVIEWER });
    expect(store.status(child)).toBe("returned");
    expect(store.briefs(child)).toEqual([
      expect.objectContaining({ kind: "parent-decided-otherwise", parent, assumed: "SQLite (WAL mode)", decided: "Postgres" }),
    ]);
  });

  it("does the same for the reviewer's own answer, and nothing for an accept", () => {
    const a = parentAndChild();
    a.store.addVerdict({ card: a.parent, revision: 1, response: "correction", choice: "DuckDB", ...REVIEWER });
    expect(a.store.status(a.child)).toBe("returned");
    const b = parentAndChild();
    b.store.addVerdict({ card: b.parent, revision: 1, response: "accept", ...REVIEWER });
    expect(b.store.status(b.child)).toBe("open");
  });

  it("reopens once the agent revises the dependent", () => {
    const { store, parent, child } = parentAndChild();
    store.addVerdict({ card: parent, revision: 1, response: "alternative", choice: "Postgres", ...REVIEWER });
    store.reviseCard(child, draft({ title: "Where run files are kept", question: "Where should the run files go?", topic: "storage/run-files", depends_on: [parent], proposal: "A Postgres table" }), BODY, AGENT);
    expect(store.status(child)).toBe("open");
    expect(store.briefs(child)).toEqual([]);
  });

  it("leaves a dependent the reviewer answered after the parent: they decided it knowing", () => {
    const { store, parent, child } = parentAndChild();
    store.addVerdict({ card: parent, revision: 1, response: "alternative", choice: "Postgres", ...REVIEWER });
    store.addVerdict({ card: child, revision: 1, response: "accept", ...REVIEWER, at: later(1) });
    expect(store.status(child)).toBe("resolved");
  });

  it("follows the parent if its answer changes back, since status is computed", () => {
    const { store, parent, child } = parentAndChild();
    store.addVerdict({ card: parent, revision: 1, response: "alternative", choice: "Postgres", ...REVIEWER });
    store.addVerdict({ card: parent, revision: 1, response: "accept", ...REVIEWER, at: later(1) });
    expect(store.status(child)).toBe("open");
  });

  it("delivers the return through the inbox, under the dependent's ID", () => {
    const { store, parent, child } = parentAndChild();
    store.addVerdict({ card: parent, revision: 1, response: "alternative", choice: "Postgres", ...REVIEWER });
    const items = store.inbox({ advance: true });
    expect(items).toContainEqual(expect.objectContaining({ card: child, verdict: expect.objectContaining({ card: parent }), brief: expect.objectContaining({ kind: "parent-decided-otherwise" }) }));
    expect(store.inbox({ advance: true })).toEqual([]);
  });

  it("ends a wait on the dependent, and tells the agent what to do", async () => {
    const { store, parent, child } = parentAndChild();
    const clock = fakeClock();
    clock.at(5_000, () => store.addVerdict({ card: parent, revision: 1, response: "alternative", choice: "Postgres", ...REVIEWER }));
    const o = await waitForVerdict(store, child, { ...AGENT, ...clock, timeoutMs: 60_000 });
    expect(o).toMatchObject({ kind: "answered", status: "returned" });
    const text = describeOutcome(o).join("\n");
    expect(text).toMatch(/decided the other way: "Postgres", not "SQLite \(WAL mode\)"/);
    expect(text).toMatch(new RegExp(`baesian revise ${child}`));
  });
});

describe("a changed answer comes with a rework brief (D81)", () => {
  function accepted() {
    const r = repo();
    const id = r.store.fileCard(draft(), BODY, AGENT).card.meta.id;
    r.store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    return { ...r, id };
  }

  it("lists the commits that cite the card, as a lower bound", () => {
    const { store, id } = accepted();
    // A ledger entry for a commit that isn't in the repo: it's marked rewritten (B-9v5xj; real commits in history.test.ts).
    store.writeLedger(id, { commit: "abc1234def5678", branch: "main" }, "");
    store.addVerdict({ card: id, revision: 1, response: "alternative", choice: "Postgres", ...REVIEWER, at: later(1) });
    expect(store.briefs(id)).toEqual([
      expect.objectContaining({ kind: "answer-changed", was: "SQLite (WAL mode)", now: "Postgres", commits: [{ commit: "abc1234def5678", branch: "main", rewritten: true }] }),
    ]);
    const item = store.inbox({ advance: true }).at(-1);
    expect(item?.brief).toMatchObject({ kind: "answer-changed" });
  });

  it("says so when the change is to a rejection", () => {
    const { store, id } = accepted();
    store.addVerdict({ card: id, revision: 1, response: "reject", comment: "Not SQLite.", ...REVIEWER, at: later(1) });
    expect(store.briefs(id)).toEqual([expect.objectContaining({ kind: "answer-changed", now: undefined, response: "reject", commits: [] })]);
  });

  it("is silent when nothing changed, or nothing had resolved it", () => {
    const a = accepted();
    a.store.addVerdict({ card: a.id, revision: 1, response: "accept", ...REVIEWER, at: later(1) });
    expect(a.store.briefs(a.id)).toEqual([]);
    const b = repo();
    const id = b.store.fileCard(draft(), BODY, AGENT).card.meta.id;
    b.store.addVerdict({ card: id, revision: 1, response: "question", comment: "Why not DuckDB?", ...REVIEWER });
    b.store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER, at: later(1) });
    expect(b.store.briefs(id)).toEqual([]);
  });

  it("goes to the agent with a resolved wait", async () => {
    const { store, id } = accepted();
    store.addVerdict({ card: id, revision: 1, response: "alternative", choice: "Postgres", ...REVIEWER, at: later(1) });
    const o = await waitForVerdict(store, id, { ...AGENT, ...fakeClock() });
    expect(o).toMatchObject({ kind: "resolved", decision: "Postgres" });
    expect(describeOutcome(o).join("\n")).toMatch(/was "SQLite \(WAL mode\)", and now it's "Postgres"[\s\S]*No commit cites/);
  });
});

describe("the waiting marker (D90)", () => {
  it("is there while the agent waits, refreshed, and gone when the wait returns", async () => {
    const r = repo();
    const id = r.store.fileCard(draft({ level: "blocking" }), BODY, AGENT).card.meta.id;
    const clock = fakeClock();
    const seen: ReturnType<typeof r.store.waitingOn>[] = [];
    clock.at(45_000, () => seen.push(r.store.waitingOn(id, clock.now())));
    clock.at(60_000, () => r.store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER }));
    await waitForVerdict(r.store, id, { ...AGENT, ...clock, timeoutMs: 5 * 60_000 });
    expect(seen[0]).toEqual([
      { marker: expect.objectContaining({ card: id, agent: "claude-code", since: clock.iso(0) }), stale: false },
    ]);
    expect(Date.parse(seen[0]![0]!.marker.at)).toBeGreaterThanOrEqual(Date.parse(clock.iso(30_000)));
    expect(r.store.waitingOn(id)).toEqual([]);
  });

  it("is removed when the wait gives up, too", async () => {
    const r = repo();
    const id = r.store.fileCard(draft({ level: "blocking" }), BODY, AGENT).card.meta.id;
    const o = await waitForVerdict(r.store, id, { ...AGENT, ...fakeClock(), timeoutMs: 60_000 });
    expect(o.kind).toBe("no-verdict");
    expect(r.store.waitingOn(id)).toEqual([]);
  });

  it("goes stale when an agent leaves it behind, as a killed one would", () => {
    const r = repo();
    const id = r.store.fileCard(draft({ level: "blocking" }), BODY, AGENT).card.meta.id;
    const at = "2026-10-24T12:00:00.000Z";
    r.store.startWaiting(id, "claude-code", at); // never stopped
    expect(r.store.waitingOn(id, Date.parse(at) + 60_000)[0]?.stale).toBe(false);
    expect(r.store.waitingOn(id, Date.parse(at) + WAITING_STALE_MS + 1_000)[0]?.stale).toBe(true);
  });
});
