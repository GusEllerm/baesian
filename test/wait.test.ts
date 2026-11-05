import { afterEach, describe, expect, it } from "vitest";
import { waitAllOp } from "../src/ops.js";
import type { Store } from "../src/store.js";
import { PRESENCE_STALE_MS, WAIT_EXIT, WaitCancelled, describeAll, describeOutcome, exitCodeFor, exitCodeForAll, waitForAll, waitForVerdict } from "../src/wait.js";
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
  it("stops when its signal aborts, removing its marker and recording no fallback (P18)", async () => {
    const { store, id } = filed("blocking");
    const stop = new AbortController();
    const clock = fakeClock();
    const beats: number[] = [];
    clock.at(45_000, () => stop.abort());
    const waiting = waitForVerdict(store, id, { ...AGENT, ...clock, signal: stop.signal, onBeat: (b) => beats.push(b.waitedMs) });
    await expect(waiting).rejects.toBeInstanceOf(WaitCancelled);
    expect(beats).toEqual([30_000]);
    expect(store.waitingOn(id)).toEqual([]);
    expect(store.fallbacks(id)).toEqual([]);
    // A real sleep ends as soon as the signal aborts.
    const again = new AbortController();
    const started = Date.now();
    setTimeout(() => again.abort(), 50);
    await expect(waitForVerdict(store, id, { ...AGENT, signal: again.signal, pollMs: 60_000 })).rejects.toBeInstanceOf(WaitCancelled);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("returns the decision when the reviewer resolves the card", async () => {
    const { store, id } = filed("blocking");
    const clock = fakeClock();
    clock.at(3_000, () => store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER }));
    const o = await waitForVerdict(store, id, { ...AGENT, ...clock, timeoutMs: 10 * MIN });
    expect(o.kind).toBe("resolved");
    expect(exitCodeFor(o)).toBe(WAIT_EXIT.resolved);
    expect(clock.elapsed()).toBeLessThan(10_000);
    expect(describeOutcome(o)[0]).toBe(`${id} resolved by gus (a person): "SQLite (WAL mode)"`);
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

describe("waiting on several cards (B-xnae9)", () => {
  const HOUR = 60 * MIN;
  const TITLES = ["Where runs live", "Which queue carries jobs", "How logs rotate"];

  /** Cards filed by the agent, each on a question of its own. */
  function several(store: Store, levels: ("provisional" | "blocking" | "hard")[]): string[] {
    return levels.map((level, i) => store.fileCard(draft({ level, title: TITLES[i], topic: `area/question-${i}` }), BODY, { ...AGENT, force: true }).card.meta.id);
  }
  const live = (store: Store, id: string, at: number) => store.waitingOn(id, at).filter((w) => !w.stale).length;

  it("waits until every card is answered, removing each card's marker as it's answered, then gives every answer (0)", async () => {
    const { store } = repo();
    const [a, b, c] = several(store, ["blocking", "provisional", "blocking"]) as [string, string, string];
    const clock = fakeClock();
    const markers: number[] = [];
    clock.at(10_000, () => store.addVerdict({ card: a, revision: 1, response: "accept", ...REVIEWER }));
    clock.at(15_000, () => markers.push(...[a, b, c].map((id) => live(store, id, clock.now()))));
    clock.at(20_000, () => store.addVerdict({ card: b, revision: 1, response: "alternative", choice: "Postgres", ...REVIEWER }));
    clock.at(30_000, () => store.addVerdict({ card: c, revision: 1, response: "accept", ...REVIEWER }));
    const o = await waitForAll(store, [a, b, c], { ...AGENT, ...clock });
    expect(o).toMatchObject({ kind: "several", ended: "answered", ids: [a, b, c], untilAnswered: false });
    expect(o.cards.map((x) => [x.id, x.kind])).toEqual([
      [a, "resolved"],
      [b, "resolved"],
      [c, "resolved"],
    ]);
    expect(exitCodeForAll(o)).toBe(WAIT_EXIT.resolved);
    expect(markers).toEqual([0, 1, 1]);
    expect(clock.elapsed()).toBe(30_000);
    for (const id of [a, b, c]) expect(store.waitingOn(id)).toEqual([]);
    const lines = describeAll(o);
    expect(lines[0]).toBe(`Every card you waited on has an answer: ${a}, ${b} and ${c}.`);
    expect(lines).toContain(`${b} resolved by gus (a person): "Postgres"`);
  });

  it("returns as soon as one card comes back to the agent, naming it, with the rest still open (4)", async () => {
    const { store } = repo();
    const [a, b, c] = several(store, ["blocking", "blocking", "provisional"]) as [string, string, string];
    const clock = fakeClock();
    clock.at(5_000, () => store.addVerdict({ card: a, revision: 1, response: "accept", ...REVIEWER }));
    clock.at(10_000, () => store.addVerdict({ card: b, revision: 1, response: "question", comment: "Have you considered DuckDB?", ...REVIEWER }));
    const o = await waitForAll(store, [a, b, c], { ...AGENT, ...clock, untilAnswered: true });
    expect(o.ended).toBe("returned");
    expect(o.cards).toMatchObject([
      { kind: "resolved", id: a },
      { kind: "answered", id: b, status: "returned" },
      { kind: "open", id: c, level: "provisional" },
    ]);
    expect(exitCodeForAll(o)).toBe(WAIT_EXIT.answered);
    expect(clock.elapsed()).toBe(10_000);
    for (const id of [a, b, c]) expect(store.waitingOn(id)).toEqual([]);
    const lines = describeAll(o);
    expect(lines.slice(0, 3)).toEqual([`${b} came back to you, so the wait ended before every card was answered.`, `${b} returned (question by gus (a person)).`, '  Comment by gus (a person): "Have you considered DuckDB?"']);
    expect(lines).toContain(`${a} resolved by gus (a person): "SQLite (WAL mode)"`);
    expect(lines.at(-1)).toBe(`Still with the reviewer: ${c}. To wait on it again once you've acted on ${b}: \`baesian wait ${c} --until-answered\`, with any card you revise added.`);
  });

  it("returns at once when a card is held back, writing no marker (8)", async () => {
    const { store } = repo();
    store.writePreferences({ preset: "hands-off", mode: "enforce", rate_agent_decides: 1, burn_in: 0 }, { by: "gus", client: "test" });
    const held = store.fileCard(draft({ touches: ["dependency"], level: "blocking", title: TITLES[0], topic: "area/held" }), BODY, { ...AGENT, force: true }).card.meta.id;
    const shown = store.fileCard(draft({ reverse: "one-way", wrong_if: "two machines write runs", check: "the deploy plan", title: TITLES[1], topic: "area/shown" }), BODY, { ...AGENT, force: true }).card.meta.id;
    expect([store.status(held), store.status(shown)]).toEqual(["held", "open"]);
    const clock = fakeClock();
    const told: string[] = [];
    const o = await waitForAll(store, [shown, held], { ...AGENT, ...clock, onMarker: (m) => told.push(m.path) });
    expect(o).toMatchObject({ ended: "held", cards: [{ kind: "open", id: shown }, { kind: "held", id: held }] });
    expect(exitCodeForAll(o)).toBe(WAIT_EXIT.held);
    expect(clock.elapsed()).toBe(0);
    expect(told).toEqual([]);
    expect(describeAll(o)[0]).toBe(`${held} is held back, so the wait ended before every card was answered.`);
  });

  it("ends a run after its slice with no answers yet, keeping the open cards' markers; the next run gives them all (7, then 0)", async () => {
    const { store } = repo();
    const [a, b] = several(store, ["blocking", "blocking"]) as [string, string];
    const clock = fakeClock();
    for (let t = 0; t <= 10 * MIN; t += 30_000) clock.at(t, () => store.touchPresence("client-1", clock.iso(t)));
    store.touchPresence("client-1", clock.iso());
    clock.at(50_000, () => store.addVerdict({ card: a, revision: 1, response: "accept", ...REVIEWER }));
    const first = await waitAllOp(store, [a, b], { ...AGENT, ...clock });
    expect(first.data).toMatchObject({ ended: "again", next: "again", exit: WAIT_EXIT.again });
    expect(first.lines).toEqual([
      `No verdict yet on ${b}, and the reviewer is still there (1 of 2 answered so far; every answer comes when the wait ends).`,
      `Run \`baesian wait ${a} ${b}\` again: the wait goes on for about 7 more minutes.`,
    ]);
    expect([live(store, a, clock.now()), live(store, b, clock.now())]).toEqual([0, 1]);
    // Nothing delivered yet: the inbox still has the answer.
    expect(store.inbox({ advance: false }).map((i) => i.card)).toEqual([a]);
    clock.at(150_000, () => store.addVerdict({ card: b, revision: 1, response: "accept", ...REVIEWER }));
    const second = await waitAllOp(store, [a, b], { ...AGENT, ...clock });
    expect(second.data).toMatchObject({ ended: "answered", next: "use", exit: WAIT_EXIT.resolved });
    expect(second.lines.filter((l) => l.includes("resolved by gus"))).toHaveLength(2);
    expect(store.waitingOn(b)).toEqual([]);
    expect(store.inbox({ advance: false })).toEqual([]);
  });

  it("when the time runs out, parks if a card still open is hard (6), and otherwise proceeds (5), recording blocking cards' fallbacks", async () => {
    const one = repo();
    const [hard, blocking] = several(one.store, ["hard", "blocking"]) as [string, string];
    const parked = await waitForAll(one.store, [hard, blocking], { ...AGENT, ...fakeClock(), timeoutMs: MIN });
    expect(parked).toMatchObject({ ended: "no-verdict", cards: [{ kind: "no-verdict", id: hard, proceed: false }, { kind: "no-verdict", id: blocking, proceed: true, recorded: true }] });
    expect(exitCodeForAll(parked)).toBe(WAIT_EXIT.park);
    expect(one.store.fallbacks(blocking)).toHaveLength(1);
    expect(one.store.fallbacks(hard)).toEqual([]);
    expect(describeAll(parked)[0]).toBe(`The wait is over with no verdict yet on ${hard} and ${blocking}.`);
    const two = repo();
    const [p, b] = several(two.store, ["provisional", "blocking"]) as [string, string];
    const clock = fakeClock();
    clock.at(5_000, () => two.store.addVerdict({ card: p, revision: 1, response: "accept", ...REVIEWER }));
    const proceed = await waitForAll(two.store, [p, b], { ...AGENT, ...clock, timeoutMs: MIN });
    expect(proceed.cards).toMatchObject([{ kind: "resolved", id: p }, { kind: "no-verdict", id: b, reason: "timeout" }]);
    expect(exitCodeForAll(proceed)).toBe(WAIT_EXIT.proceed);
  });

  it("says 4 when every card is answered and one isn't a go-ahead", async () => {
    const { store } = repo();
    const [a, b] = several(store, ["blocking", "blocking"]) as [string, string];
    store.addVerdict({ card: a, revision: 1, response: "accept", ...REVIEWER });
    store.addVerdict({ card: b, revision: 1, response: "defer", comment: "After the audit.", ...REVIEWER });
    const o = await waitForAll(store, [a, b], { ...AGENT, ...fakeClock() });
    expect(o).toMatchObject({ ended: "answered", waitedMs: 0 });
    expect(exitCodeForAll(o)).toBe(WAIT_EXIT.answered);
    expect(describeAll(o)).toContain(`${b} deferred by gus (a person).`);
  });

  it("writes no marker for a card answered before it starts, and takes away one an earlier run left", async () => {
    const { store } = repo();
    const [a, b] = several(store, ["blocking", "blocking"]) as [string, string];
    const clock = fakeClock();
    expect((await waitForVerdict(store, a, { ...AGENT, ...clock })).kind).toBe("again");
    expect(live(store, a, clock.now())).toBe(1);
    store.addVerdict({ card: a, revision: 1, response: "accept", ...REVIEWER });
    const told: { path: string; removed: boolean }[] = [];
    clock.at(clock.elapsed() + 5_000, () => store.addVerdict({ card: b, revision: 1, response: "accept", ...REVIEWER }));
    const o = await waitForAll(store, [a, b], { ...AGENT, ...clock, onMarker: (m) => told.push(m) });
    expect(o.ended).toBe("answered");
    expect(store.waitingOn(a)).toEqual([]);
    // a's leftover marker is removed; b's is written, then removed when it's answered.
    expect(told.map((m) => [m.path.includes(a) ? "a" : "b", m.removed])).toEqual([
      ["a", true],
      ["b", false],
      ["b", true],
    ]);
  });

  it("with no time limit, ignores the slice, the budget and an away reviewer, showing its markers for the budget only (B-3az04)", async () => {
    const { store } = repo();
    const [a, b] = several(store, ["blocking", "provisional"]) as [string, string];
    const clock = fakeClock();
    // The reviewer has been away for hours: an ordinary wait would return at once.
    store.touchPresence("client-1", clock.iso(-10 * HOUR));
    const markers: number[][] = [];
    for (const t of [5 * MIN, 10 * MIN, HOUR]) clock.at(t, () => markers.push([a, b].map((id) => live(store, id, clock.now()))));
    clock.at(2 * HOUR, () => store.addVerdict({ card: a, revision: 1, response: "accept", ...REVIEWER }));
    clock.at(3 * HOUR, () => store.addVerdict({ card: b, revision: 1, response: "accept", ...REVIEWER }));
    const o = await waitForAll(store, [a, b], { ...AGENT, ...clock, pollMs: 30_000, untilAnswered: true });
    expect(o).toMatchObject({ ended: "answered", untilAnswered: true });
    expect(exitCodeForAll(o)).toBe(WAIT_EXIT.resolved);
    expect(clock.elapsed()).toBe(3 * HOUR);
    expect(markers).toEqual([
      [1, 1],
      [0, 0],
      [0, 0],
    ]);
    // It didn't give up, so nothing says the agent proceeded without a verdict.
    expect(store.fallbacks(a)).toEqual([]);
  });

  it("waits on one card with no time limit too; and stops when its signal aborts", async () => {
    const { store } = repo();
    const [a, b, c] = several(store, ["hard", "blocking", "blocking"]) as [string, string, string];
    const clock = fakeClock();
    clock.at(HOUR, () => store.addVerdict({ card: a, revision: 1, response: "accept", ...REVIEWER }));
    const o = await waitForVerdict(store, a, { ...AGENT, ...clock, pollMs: 60_000, untilAnswered: true });
    expect(o.kind).toBe("resolved");
    expect(clock.elapsed()).toBe(HOUR);
    const stop = new AbortController();
    const later = fakeClock();
    later.at(2 * HOUR, () => stop.abort());
    await expect(waitForAll(store, [b, c], { ...AGENT, ...later, pollMs: 60_000, untilAnswered: true, signal: stop.signal })).rejects.toThrow(`stopped waiting on ${b} ${c}`);
    expect(store.waitingOn(b)).toEqual([]);
  });
});
