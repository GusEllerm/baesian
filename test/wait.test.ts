import { afterEach, describe, expect, it } from "vitest";
import { PRESENCE_STALE_MS, WAIT_EXIT, describeOutcome, exitCodeFor, waitForVerdict } from "../src/wait.js";
import { BODY, REVIEWER, cleanup, draft, fakeClock, repo } from "./helpers.js";

afterEach(cleanup);

const AGENT = { agent: "claude-code" };
const MIN = 60_000;

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
    const o = await waitForVerdict(store, id, { ...AGENT, ...clock, timeoutMs: 2 * MIN });
    expect(o).toMatchObject({ kind: "no-verdict", reason: "timeout", proceed: true, recorded: true });
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
    const o = await waitForVerdict(store, id, { ...AGENT, ...clock, timeoutMs: 3 * MIN });
    expect(o).toMatchObject({ reason: "timeout" });
    expect(clock.elapsed()).toBe(3 * MIN);
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
