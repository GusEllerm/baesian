import { afterEach, describe, expect, it } from "vitest";
import { PRESENCE_STALE_MS, WAIT_EXIT, describeOutcome, exitCodeFor, waitForVerdict } from "../src/wait.js";
import { BODY, REVIEWER, cleanup, draft, fakeClock, repo } from "./helpers.js";

afterEach(cleanup);

const AGENT = { agent: "claude-code" };
const MIN = 60_000;

/** What an agent does with `baesian wait` (D101): on exit 7 it runs it again, until the wait is over. */
async function waitLikeAnAgent(...args: Parameters<typeof waitForVerdict>) {
  for (let runs = 1; ; runs++) {
    const o = await waitForVerdict(...args);
    if (o.kind !== "again") return { ...o, runs };
  }
}

function filed(level: "provisional" | "blocking" | "hard") {
  const r = repo();
  const id = r.store.fileCard(draft({ level }), BODY, AGENT).card.meta.id;
  return { ...r, id };
}

describe("wait", () => {
  it("returns the decision when the reviewer resolves the card", async () => {
    const { store, id } = filed("blocking");
    const clock = fakeClock();
    clock.at(3_000, () => store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER }));
    const o = await waitForVerdict(store, id, { ...AGENT, ...clock, timeoutMs: 10 * MIN });
    expect(o.kind).toBe("resolved");
    expect(exitCodeFor(o)).toBe(WAIT_EXIT.resolved);
    expect(clock.elapsed()).toBeLessThan(10_000);
    expect(describeOutcome(o)[0]).toBe(`${id} resolved: SQLite (WAL mode)`);
  });

  it("reports a returned card with the reviewer's comment", async () => {
    const { store, id } = filed("blocking");
    store.addVerdict({ card: id, revision: 1, response: "question", comment: "Have you considered DuckDB?", ...REVIEWER });
    const o = await waitForVerdict(store, id, { ...AGENT, ...fakeClock() });
    expect(o).toMatchObject({ kind: "answered", status: "returned" });
    expect(exitCodeFor(o)).toBe(WAIT_EXIT.answered);
    expect(describeOutcome(o).join("\n")).toMatch(/DuckDB[\s\S]*baesian revise/);
  });

  it("keeps waiting while a card is rerouted to another reviewer", async () => {
    const { store, id } = filed("blocking");
    const clock = fakeClock();
    store.addVerdict({ card: id, revision: 1, response: "not_my_area", ...REVIEWER });
    clock.at(60_000, () => store.addVerdict({ card: id, revision: 1, response: "accept", reviewer: "ana", client: "test" }));
    const o = await waitForVerdict(store, id, { ...AGENT, ...clock, timeoutMs: 5 * MIN });
    expect(o.kind).toBe("resolved");
  });

  it("times out on a blocking card: proceed provisionally, and record the fallback (D46)", async () => {
    const { store, id } = filed("blocking");
    const clock = fakeClock();
    const o = await waitLikeAnAgent(store, id, { ...AGENT, ...clock, timeoutMs: 2 * MIN });
    expect(o).toMatchObject({ kind: "no-verdict", reason: "timeout", proceed: true, recorded: true, runs: 2 });
    expect(exitCodeFor(o)).toBe(WAIT_EXIT.proceed);
    expect(clock.elapsed()).toBe(2 * MIN);
    expect(store.fallbacks(id)).toMatchObject([{ reason: "timeout", agent: "claude-code", revision: 1 }]);
    expect(store.status(id)).toBe("open"); // still waiting for the reviewer
  });

  it("never proceeds on a hard card, and records nothing (D42)", async () => {
    const { store, id } = filed("hard");
    const o = await waitForVerdict(store, id, { ...AGENT, ...fakeClock(), timeoutMs: MIN });
    expect(o).toMatchObject({ kind: "no-verdict", proceed: false, recorded: false });
    expect(exitCodeFor(o)).toBe(WAIT_EXIT.park);
    expect(describeOutcome(o).join("\n")).toMatch(/do not proceed/);
    expect(store.fallbacks(id)).toEqual([]);
  });

  it("returns at once when the client's heartbeat is stale (D41)", async () => {
    const { store, id } = filed("blocking");
    const clock = fakeClock();
    store.touchPresence("client-1", clock.iso(-(PRESENCE_STALE_MS + 1)));
    const o = await waitForVerdict(store, id, { ...AGENT, ...clock, timeoutMs: 10 * MIN });
    expect(o).toMatchObject({ kind: "no-verdict", reason: "away", proceed: true });
    expect(clock.elapsed()).toBe(0);
    expect(store.fallbacks(id)[0]?.reason).toBe("away");
  });

  it("keeps waiting while the heartbeat is fresh, and stops when it goes stale", async () => {
    const { store, id } = filed("hard");
    const clock = fakeClock();
    store.touchPresence("client-1", clock.iso());
    const o = await waitForVerdict(store, id, { ...AGENT, ...clock, timeoutMs: 10 * MIN, pollMs: 5_000 });
    expect(o).toMatchObject({ kind: "no-verdict", reason: "away", proceed: false });
    expect(clock.elapsed()).toBeGreaterThan(PRESENCE_STALE_MS);
    expect(clock.elapsed()).toBeLessThan(PRESENCE_STALE_MS + 10_000);
  });

  it("treats a client that has never run as unknown, and waits the full timeout", async () => {
    const { store, id } = filed("blocking");
    const clock = fakeClock();
    const o = await waitLikeAnAgent(store, id, { ...AGENT, ...clock, timeoutMs: 3 * MIN });
    expect(o).toMatchObject({ reason: "timeout" });
    expect(clock.elapsed()).toBe(3 * MIN);
  });

  it("ends a run after its slice while the reviewer is there, and says to run it again (D101)", async () => {
    const { store, id } = filed("blocking");
    const clock = fakeClock();
    for (let t = 0; t <= 10 * MIN; t += 30_000) clock.at(t, () => store.touchPresence("client-1", clock.iso(t)));
    store.touchPresence("client-1", clock.iso());
    const first = await waitForVerdict(store, id, { ...AGENT, ...clock });
    expect(first).toMatchObject({ kind: "again", waitedMs: 100_000 });
    expect(exitCodeFor(first)).toBe(WAIT_EXIT.again);
    expect(describeOutcome(first).join("\n")).toMatch(/Run `baesian wait .*` again/);
    // The marker stays, fresh, for the next run to pick up.
    expect(store.waitingOn(id, clock.now())).toEqual([expect.objectContaining({ stale: false })]);
    clock.at(150_000, () => store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER }));
    const second = await waitForVerdict(store, id, { ...AGENT, ...clock });
    expect(second.kind).toBe("resolved");
    expect(store.waitingOn(id, clock.now())).toEqual([]);
  });

  it("counts the wait's budget from its first run, across runs (D101)", async () => {
    const { store, id } = filed("blocking");
    const clock = fakeClock();
    const first = await waitForVerdict(store, id, { ...AGENT, ...clock, timeoutMs: 3 * MIN });
    expect(first.kind).toBe("again");
    const since = store.waitingOn(id, clock.now())[0]!.marker.since;
    const second = await waitForVerdict(store, id, { ...AGENT, ...clock, timeoutMs: 3 * MIN });
    expect(second).toMatchObject({ kind: "no-verdict", reason: "timeout" });
    expect(clock.elapsed()).toBe(3 * MIN);
    expect(store.fallbacks(id)).toHaveLength(1);
    expect(since).toBe(clock.iso(0));
  });

  it("leaves a marker that goes stale if the agent never runs it again (D90, D101)", async () => {
    const { store, id } = filed("blocking");
    const clock = fakeClock();
    expect((await waitForVerdict(store, id, { ...AGENT, ...clock })).kind).toBe("again");
    expect(store.waitingOn(id, clock.now() + 60_000)[0]?.stale).toBe(false);
    expect(store.waitingOn(id, clock.now() + 91_000)[0]?.stale).toBe(true);
  });

  it("ignores presence when asked", async () => {
    const { store, id } = filed("blocking");
    const clock = fakeClock();
    store.touchPresence("client-1", clock.iso(-10 * MIN));
    const o = await waitForVerdict(store, id, { ...AGENT, ...clock, timeoutMs: MIN, usePresence: false });
    expect(o).toMatchObject({ reason: "timeout" });
  });

  it("explains a deferral according to the level", async () => {
    const hard = filed("hard");
    hard.store.addVerdict({ card: hard.id, revision: 1, response: "defer", comment: "After the audit.", ...REVIEWER });
    const o = await waitForVerdict(hard.store, hard.id, { ...AGENT, ...fakeClock() });
    expect(o).toMatchObject({ kind: "answered", status: "deferred", level: "hard" });
    expect(describeOutcome(o).join("\n")).toMatch(/don't proceed/);
  });

  it("tells the agent when a card no longer applies", async () => {
    const { store, id } = filed("blocking");
    store.withdraw(id, "Not needed.", "claude-code");
    const o = await waitForVerdict(store, id, { ...AGENT, ...fakeClock() });
    expect(o).toMatchObject({ kind: "answered", status: "withdrawn" });
    expect(describeOutcome(o)[0]).toMatch(/no longer applies/);
  });

  it("syncs fallbacks into the record", async () => {
    const { store, id } = filed("blocking");
    await waitForVerdict(store, id, { ...AGENT, ...fakeClock(), timeoutMs: MIN });
    expect(store.syncRecord()).toEqual([]); // already copied when recorded
  });
});
