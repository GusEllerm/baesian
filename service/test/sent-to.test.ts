import { env } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiState } from "../../src/api.js";
import { readRelayEntry } from "../../src/schema.js";
import { MemoryStorage } from "../../src/storage.js";
import type { Store } from "../../src/store.js";
import { DELETION } from "../src/deletion.js";
import { type ProjectRelay, housekeeping } from "../src/index.js";
import { type Arrival, WHEN, type Waiting, type When, decide } from "../src/notify.js";
import { type Person, machineLogin, oauth, reauth, signUp } from "./browser.js";
import { call, fileCard, machineStore, pulled } from "./client.js";
import { PushStandIn, type TestBrowser } from "./push-service.js";

// Several reviewers per project (P20), stage 1, step 2: whom each card was sent to, and who's told. A card is every
// member's (B-r51ts); it's sent to the member whose machine filed it (B-2n7s4), or, when only owners answer it, to nobody
// in particular. The member it was sent to is told as the one reviewer was (B-advkh); the others, only when it's passed on
// to them, or after a while (B-tzdjn; how long is card B-aaj69's). Each member's counts say what was sent to them. The push
// service is a stand-in; the clock is the test's.

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

let now: number;
let service: PushStandIn;
const at = (t: number) => {
  now = t;
  vi.setSystemTime(t);
};
const later = (ms: number) => at(now + ms);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // Ahead of the real clock, so no alarm the relay sets comes due by itself: the test runs each.
  at(Date.UTC(2027, 2, 1, 9));
  service = new PushStandIn();
});
afterEach(() => {
  service.restore();
  vi.useRealTimers();
});

/** A member of a project, with a machine signed in to it as them, that machine's store, and a browser that gets notifications. */
interface Member {
  person: Person;
  machine: string;
  grant: { access: string; refresh: string };
  store: Store;
  browser: TestBrowser;
}

interface Team {
  project: string;
  /** Made the project, and holds it: an owner. */
  ana: Member;
  /** Joined by Ana's link: a member. */
  ben: Member;
}

async function member(person: Person, project: string, machine: string): Promise<Member> {
  const grant = await machineLogin(person, project, machine);
  const browser = await service.browser();
  const r = await person.browser.post("/v1/account/push", { endpoint: browser.endpoint, keys: { p256dh: browser.p256dh, auth: browser.auth } });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return { person, machine, grant, store: machineStore(new MemoryStorage(), project), browser };
}

/** Someone new joins a project by a link its owner makes. */
async function join(project: string, owner: Person): Promise<Person> {
  await reauth(owner);
  const made = await owner.browser.post(`/v1/account/projects/${project}/invites`);
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const p = await signUp();
  const r = await p.browser.post("/v1/account/invites/accept", { code: String(made.body.link).split("#")[1] });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return p;
}

let n = 0;
async function team(): Promise<Team> {
  n += 1;
  const project = `p-sent-${n}-${Math.random().toString(36).slice(2, 8)}`;
  const ana = await member(await signUp(), project, "anas-laptop");
  const ben = await member(await join(project, ana.person), project, "bens-laptop");
  return { project, ana, ben };
}

/**
 * A member's machine uploads what a store holds of its decks and cards (or of one card), through the Worker, as the
 * CLI's sync does: decks, then revisions, then the rest.
 */
async function upload(t: Team, m: Member, store: Store = m.store, card?: string): Promise<void> {
  const mem = store.storage as MemoryStorage;
  const order = (p: string) => (p.startsWith("decks/") ? 0 : /\/r\d+\.md$/.test(p) ? 1 : 2);
  const paths = mem.paths().filter((p) => (card ? p.startsWith(`cards/${card}/`) : /^(decks|cards)\//.test(p)) && !p.endsWith(".sig") && !p.endsWith("-relay.json"));
  for (const p of paths.sort((a, b) => order(a) - order(b) || a.localeCompare(b))) {
    const put = () => call("PUT", `files/${p}`, { as: { headers: { authorization: `Bearer ${m.grant.access}` } }, project: t.project, body: mem.read(p)! });
    let r = await put();
    if (r.status === 401) {
      // A machine's sign-in lasts an hour: the CLI renews it, as here.
      const renewed = await oauth("/v1/machines/token", { client_id: "baesian-cli", grant_type: "refresh_token", refresh_token: m.grant.refresh });
      m.grant = { access: renewed.body.access_token, refresh: renewed.body.refresh_token };
      r = await put();
    }
    expect(r.status, `${p}: ${await r.clone().text()}`).toBeLessThan(300);
  }
}

/** A member's agent files a card, and their machine uploads it. */
async function file(t: Team, m: Member, over: Record<string, unknown> = {}): Promise<string> {
  const id = fileCard(m.store, over);
  await upload(t, m, m.store, id);
  return id;
}

const under = (t: Team, path: string) => `/v1/projects/${t.project}/${path}`;
const stub = (t: Team) => env.PROJECTS.get(env.PROJECTS.idFromName(t.project));
const inObject = <T>(t: Team, fn: (relay: ProjectRelay, state: DurableObjectState) => T | Promise<T>) => runInDurableObject(stub(t), fn as (i: ProjectRelay, s: DurableObjectState) => Promise<T>);
/** Run the project's alarm, as the runtime would when it comes due. */
const alarm = (t: Team) => runDurableObjectAlarm(stub(t));
const alarmAt = (t: Team) => inObject(t, (_i, s) => s.storage.getAlarm());
const titles = (m: Member) => service.to(m.browser).map((r) => r.message.title);

const state = async (t: Team, m: Member) => (await m.person.browser.get(under(t, "state"))).body as unknown as ApiState;
const sentTo = async (t: Team, m: Member) => Object.fromEntries((await state(t, m)).cards.map((c) => [c.meta.id, c.sent_to]));
const counts = async (t: Team, m: Member) => {
  const r = await m.person.browser.get(under(t, "waiting"));
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body;
};
const none = { total: 0, hard: 0, blocking: 0 };

const answer = (t: Team, m: Member, input: Record<string, unknown>) => m.person.browser.post(under(t, "verdicts"), { revision: 1, response: "accept", ...input });
const pass = async (t: Team, m: Member, card: string) => {
  const r = await answer(t, m, { card, response: "not_my_area" });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
};
const beat = async (t: Team, m: Member) => expect((await m.person.browser.post(under(t, "presence"), { client: "hosted-desktop" })).status).toBe(204);

describe("whom a card is sent to (B-2n7s4: whoever runs the agent)", () => {
  it("is the member whose machine filed it, said in the state to every member; each member's counts say what was sent to them", async () => {
    const t = await team();
    const a = await file(t, t.ana, { level: "blocking" });
    const b = await file(t, t.ben, { level: "hard" });
    const c = await file(t, t.ben, { level: "provisional" });
    const sent = { [a]: t.ana.person.account, [b]: t.ben.person.account, [c]: t.ben.person.account };
    expect(await sentTo(t, t.ana)).toEqual(sent);
    expect(await sentTo(t, t.ben)).toEqual(sent);
    // Every card waits for every member (B-r51ts); `yours` is what was sent to them.
    expect(await counts(t, t.ana)).toEqual({ total: 3, hard: 1, blocking: 1, yours: { total: 1, hard: 0, blocking: 1 } });
    expect(await counts(t, t.ben)).toEqual({ total: 3, hard: 1, blocking: 0 + 1, yours: { total: 2, hard: 1, blocking: 0 } });
    // A machine isn't a member: it's told what waits, and nothing of whose.
    const machine = await call("GET", "waiting", { as: { headers: { authorization: `Bearer ${t.ben.grant.access}` } }, project: t.project });
    expect(await machine.json()).toEqual({ total: 3, hard: 1, blocking: 1 });
    // Answered by either, it leaves both counts: Ana answers the card sent to Ben.
    expect((await answer(t, t.ana, { card: c })).status).toBe(201);
    expect(await counts(t, t.ben)).toEqual({ total: 2, hard: 1, blocking: 1, yours: { total: 1, hard: 1, blocking: 0 } });
    // The note is the relay's own: it's in no file a machine pulls, and nothing in the log.
    const log = (await inObject(t, (relay) => relay.log(t.project, 0, 1000))).body as { entries: { path: string }[] };
    expect(JSON.stringify(log.entries)).not.toContain("sent_to");
  });

  it("is nobody in particular, the project's owners, for a card only owners answer, whoever's machine filed it", async () => {
    const t = await team();
    // With its deck, which the draft of a rule from it is filed in.
    const id = fileCard(t.ben.store);
    await upload(t, t.ben);
    // Ben asks for a rule with his answer; his agent drafts it, and his machine uploads the draft.
    expect((await answer(t, t.ben, { card: id, make_rule: true })).status).toBe(201);
    const entries = (await inObject(t, (relay) => relay.log(t.project, 0, 1000))).body as { entries: unknown[] };
    const bens = machineStore(pulled(entries.entries.map(readRelayEntry)), t.project);
    const draft = bens.draftRule(id, "Small dev dependencies need no card.", ["dep:vitest-*"], { agent: "claude-code" });
    await upload(t, t.ben, bens);
    expect((await sentTo(t, t.ana))[draft.meta.id]).toBeUndefined();
    // It's among the owner's, not the member's, though it waits on both desks.
    expect((await counts(t, t.ana)).yours.total).toBe(1);
    expect(await counts(t, t.ben)).toMatchObject({ total: 1, yours: none });
  });
});

describe("who is told of a card (B-tzdjn: sent to one, open to all)", () => {
  it("the member it was sent to, as the one reviewer was: at once for a blocking or hard card, in the digest for a provisional one", async () => {
    const t = await team();
    const t0 = now;
    await file(t, t.ben, { level: "blocking" });
    expect(await alarmAt(t)).toBe(t0 + WHEN.soonMs);
    later(WHEN.soonMs);
    await alarm(t);
    expect(titles(t.ben)).toEqual([`1 card waiting in Project ${t.project} (blocking)`]);
    expect(titles(t.ana)).toEqual([]);
    // Ana's own hard card tells Ana, counting every card that waits for her, Ben's among them; Ben hears nothing more.
    await file(t, t.ana, { level: "hard" });
    later(WHEN.soonMs);
    await alarm(t);
    expect(titles(t.ana)).toEqual([`2 cards waiting in Project ${t.project} (1 hard, 1 blocking)`]);
    expect(titles(t.ben)).toHaveLength(1);
    // A provisional card of Ben's waits for his digest, and is never Ana's to be told of on its own.
    await file(t, t.ben, { level: "provisional" });
    later(WHEN.digestMs!);
    await alarm(t);
    expect(titles(t.ben).at(-1)).toBe(`3 cards waiting in Project ${t.project} (1 hard, 1 blocking)`);
    expect(titles(t.ben)).toHaveLength(2);
    expect(titles(t.ana)).toHaveLength(1);
  });

  it("the others at once when the member it was sent to passes it on, whatever its level; it no longer waits for them", async () => {
    const t = await team();
    const id = await file(t, t.ben, { level: "provisional" });
    later(WHEN.soonMs);
    await alarm(t);
    later(MINUTE);
    await pass(t, t.ben, id);
    expect(await alarmAt(t)).toBe(now + WHEN.soonMs);
    later(WHEN.soonMs);
    await alarm(t);
    expect(titles(t.ana)).toEqual([`1 card waiting in Project ${t.project}`]);
    expect(titles(t.ben)).toEqual([]);
    // It waits for Ana, marked as sent to Ben; not for Ben, who passed it.
    expect(await counts(t, t.ana)).toEqual({ total: 1, hard: 0, blocking: 0, yours: none });
    expect(await counts(t, t.ben)).toEqual({ ...none, yours: none });
    expect((await sentTo(t, t.ana))[id]).toBe(t.ben.person.account);
    // Told once: nothing more at a later alarm. And Ana answers it, which decides it for both.
    later(HOUR);
    await alarm(t);
    expect(titles(t.ana)).toHaveLength(1);
    expect((await answer(t, t.ana, { card: id })).status).toBe(201);
    expect((await state(t, t.ben)).cards.find((c) => c.meta.id === id)!.status).toBe("resolved");
    expect(await counts(t, t.ana)).toEqual({ ...none, yours: none });
  });

  it("the others at once when a hard card is passed on with the passkey, and when an owner passes on a card sent to nobody in particular", async () => {
    const t = await team();
    const hard = await file(t, t.ben, { level: "hard" });
    later(WHEN.soonMs);
    await alarm(t);
    expect(titles(t.ben)).toHaveLength(1);
    // A hard card's answer waits for the passkey: Ben passes it on with one tap.
    later(MINUTE);
    const waits = await answer(t, t.ben, { card: hard, response: "not_my_area" });
    expect(waits.status, JSON.stringify(waits.body)).toBe(202);
    const asked = await t.ben.person.browser.post(under(t, "batches"), { pending: [waits.body.passkey.pending] });
    expect(asked.status, JSON.stringify(asked.body)).toBe(202);
    const done = await t.ben.person.browser.post(under(t, "proofs"), { batch: asked.body.passkey.batch, response: t.ben.person.passkey.sign(asked.body.passkey.challenge) });
    expect(done.body.answers[0].status, JSON.stringify(done.body)).toBe(201);
    later(WHEN.soonMs);
    await alarm(t);
    expect(titles(t.ana)).toEqual([`1 card waiting in Project ${t.project} (hard)`]);
    expect(titles(t.ben)).toHaveLength(1);

    // A card sent to nobody in particular is the owners': when Ana, an owner, passes it on, Ben is told.
    const loose = fileCard(t.ana.store, { level: "blocking" });
    const mem = t.ana.store.storage as MemoryStorage;
    for (const p of mem.paths().filter((x) => x.startsWith(`cards/${loose}/`) && !x.endsWith(".sig") && !x.endsWith("-relay.json")).sort((x, y) => Number(/\/r\d+\.md$/.test(y)) - Number(/\/r\d+\.md$/.test(x)))) {
      // Straight to the object, from a machine that names no account, as a shared machine's would be.
      expect((await inObject(t, (relay) => relay.upload(t.project, p, mem.read(p)!, "shared"))).status).toBeLessThan(300);
    }
    expect((await sentTo(t, t.ben))[loose]).toBeUndefined();
    expect((await counts(t, t.ana)).yours).toEqual({ total: 1, hard: 0, blocking: 1 });
    later(MINUTE);
    await pass(t, t.ana, loose);
    later(WHEN.soonMs);
    await alarm(t);
    expect(titles(t.ben).at(-1)).toBe(`1 card waiting in Project ${t.project} (blocking)`);
    expect(titles(t.ben)).toHaveLength(2);
  });

  it("nobody, when a member puts aside a card that was sent to someone else", async () => {
    const t = await team();
    const id = await file(t, t.ben, { level: "blocking" });
    later(WHEN.soonMs);
    await alarm(t);
    expect(titles(t.ben)).toHaveLength(1);
    await pass(t, t.ana, id);
    later(WHEN.soonMs);
    await alarm(t);
    later(HOUR);
    await alarm(t);
    expect(service.received).toHaveLength(1);
    // It's off Ana's desk, and still first on Ben's.
    expect(await counts(t, t.ana)).toEqual({ ...none, yours: none });
    expect(await counts(t, t.ben)).toEqual({ total: 1, hard: 0, blocking: 1, yours: { total: 1, hard: 0, blocking: 1 } });
    // Ben then passes it on too: it waits for nobody, as a card its one reviewer passed on always has.
    await pass(t, t.ben, id);
    later(WHEN.soonMs);
    await alarm(t);
    expect(service.received).toHaveLength(1);
    expect(await counts(t, t.ben)).toEqual({ ...none, yours: none });
  });

  it("not a member who is at the desk, though another's being there silences nobody else (D41)", async () => {
    const t = await team();
    await beat(t, t.ana);
    await file(t, t.ben, { level: "blocking" });
    later(WHEN.soonMs);
    await alarm(t);
    expect(titles(t.ben)).toHaveLength(1);
    // Ben at the desk, Ana gone from it: Ben's next card tells nobody, then or later; Ana's tells Ana.
    later(5 * MINUTE);
    await beat(t, t.ben);
    await file(t, t.ben, { level: "hard" });
    await file(t, t.ana, { level: "hard" });
    later(WHEN.soonMs);
    await alarm(t);
    later(5 * MINUTE);
    await alarm(t);
    expect(titles(t.ben)).toHaveLength(1);
    expect(titles(t.ana)).toEqual([`3 cards waiting in Project ${t.project} (2 hard, 1 blocking)`]);
  });

  it("at most 4 times an hour each: one member's notifications don't use up another's", async () => {
    const t = await team();
    for (let i = 0; i < 5; i++) {
      await file(t, t.ben, { level: "hard" });
      later(WHEN.soonMs);
      await alarm(t);
      later(5 * MINUTE);
    }
    expect(titles(t.ben)).toHaveLength(WHEN.capPerHour);
    await file(t, t.ana, { level: "hard" });
    later(WHEN.soonMs);
    await alarm(t);
    expect(titles(t.ana)).toEqual([`6 cards waiting in Project ${t.project} (6 hard)`]);
    expect(titles(t.ben)).toHaveLength(WHEN.capPerHour);
  });
});

describe("a member who leaves (P20)", () => {
  it("the cards sent to them are the owners' from then: said in the state, heard by the pages listening, and told to an owner", async () => {
    const t = await team();
    const id = await file(t, t.ben, { level: "blocking" });
    later(WHEN.soonMs);
    await alarm(t);
    expect(titles(t.ben)).toHaveLength(1);
    const before = (await state(t, t.ana)).version;
    later(MINUTE);
    expect((await t.ben.person.browser.del(`/v1/account/projects/${t.project}/members/${t.ben.person.account}`)).status).toBe(204);
    const after = await state(t, t.ana);
    expect(after.version).toBeGreaterThan(before);
    expect(after.cards.find((c) => c.meta.id === id)!.sent_to).toBeUndefined();
    expect(await counts(t, t.ana)).toEqual({ total: 1, hard: 0, blocking: 1, yours: { total: 1, hard: 0, blocking: 1 } });
    later(WHEN.soonMs);
    await alarm(t);
    expect(titles(t.ana)).toEqual([`1 card waiting in Project ${t.project} (blocking)`]);
    expect(titles(t.ben)).toHaveLength(1);
    // Nothing of them is left in the project's own notes.
    const left = await inObject(t, (_i, s) => ["sent_to", "presence_of", "push_told", "push_sent"].map((table) => s.storage.sql.exec(`SELECT COUNT(*) AS n FROM ${table} WHERE account = ?`, t.ben.person.account).one().n));
    expect(left).toEqual([0, 0, 0, 0]);
  });

  it("the same when their account is deleted, 14 days after they close it", async () => {
    const t = await team();
    const id = await file(t, t.ben, { level: "provisional" });
    await beat(t, t.ben);
    await reauth(t.ben.person);
    expect((await t.ben.person.browser.post("/v1/account/delete", { handle: t.ben.person.handle })).status).toBe(200);
    // Closed, it's still sent to them: restoring the account within its 14 days finds it as it was.
    expect((await sentTo(t, t.ana))[id]).toBe(t.ben.person.account);
    at(now + DELETION.graceMs + MINUTE);
    expect(await housekeeping(env as never, now)).toEqual([t.ben.person.account]);
    expect((await sentTo(t, t.ana))[id]).toBeUndefined();
    expect((await counts(t, t.ana)).yours.total).toBe(1);
    expect(await inObject(t, (_i, s) => s.storage.sql.exec("SELECT COUNT(*) AS n FROM presence_of").one().n)).toBe(0);
  });

  it("nobody is told of a card in a project whose holder closed their account", async () => {
    const t = await team();
    await file(t, t.ben, { level: "hard" });
    await reauth(t.ana.person);
    expect((await t.ana.person.browser.post("/v1/account/delete", { handle: t.ana.person.handle })).status).toBe(200);
    later(WHEN.soonMs);
    await alarm(t);
    later(HOUR);
    await alarm(t);
    expect(service.received).toHaveLength(0);
  });
});

describe("the rules, for one member (B-tzdjn)", () => {
  const a = (card: string, arrived: number, over: Partial<Arrival> = {}): Arrival => ({ card, revision: 1, machine: "laptop", arrived, ...over });
  const w = (card: string, level: Waiting["level"], over: Partial<Waiting> = {}): Waiting => ({ card, revision: 1, level, ...over });
  const ana = { account: "acct-ana", role: "owner" as const };
  const ben = { account: "acct-ben", role: "member" as const };
  const after: When = { ...WHEN, othersMs: 10 * MINUTE };
  const base = { present: false, sent: [], pauses: [] };

  it("a blocking or hard card sent to someone else is due once it has waited `othersMs`; a provisional one never is on its own", () => {
    const waiting = [w("B-aaaaa", "blocking", { to: ben.account }), w("B-bbbbb", "provisional", { to: ben.account })];
    const arrivals = [a("B-aaaaa", 0), a("B-bbbbb", 0)];
    const early = decide({ ...base, now: 5 * MINUTE, arrivals, waiting, who: ana, when: after });
    expect(early).toEqual({ settle: [], next: 10 * MINUTE });
    const due = decide({ ...base, now: 10 * MINUTE, arrivals, waiting, who: ana, when: after });
    expect(due.send).toEqual({ urgency: "high", reason: "at once", total: 2, hard: 0, blocking: 1 });
    expect(due.settle).toEqual(arrivals);
    // The provisional one alone waits for ever, however long.
    expect(decide({ ...base, now: 100 * HOUR, arrivals: [arrivals[1]!], waiting, who: ana, when: after })).toEqual({ settle: [] });
    // With no time set, nor is the blocking one.
    expect(decide({ ...base, now: 100 * HOUR, arrivals, waiting, who: ana, when: { ...WHEN, othersMs: null } })).toEqual({ settle: [] });
    // Its own member is told of both as ever: ten seconds, and the digest.
    expect(decide({ ...base, now: WHEN.soonMs, arrivals, waiting, who: ben, when: after }).send).toMatchObject({ reason: "at once", total: 2 });
  });

  it("a card sent to nobody in particular is an owner's, and someone else's to a member", () => {
    const waiting = [w("B-aaaaa", "hard")];
    const arrivals = [a("B-aaaaa", 0)];
    expect(decide({ ...base, now: WHEN.soonMs, arrivals, waiting, who: ana, when: after }).send).toMatchObject({ total: 1, hard: 1 });
    expect(decide({ ...base, now: WHEN.soonMs, arrivals, waiting, who: ben, when: after })).toEqual({ settle: [], next: 10 * MINUTE });
  });

  it("a card passed on is due ten seconds after, whatever its level or its machine's pause; and it's settled for whoever passed it", () => {
    const waiting = [w("B-aaaaa", "provisional", { to: ben.account, passed: [ben.account] })];
    const arrivals = [a("B-aaaaa", 0, { handed: HOUR })];
    const pauses = [{ machine: "laptop", cards: 30, since: 0, until: 2 * HOUR }];
    expect(decide({ ...base, pauses, now: HOUR + 5 * SECOND, arrivals, waiting, who: ana, when: after })).toEqual({ settle: [], next: HOUR + WHEN.soonMs });
    const due = decide({ ...base, pauses, now: HOUR + WHEN.soonMs, arrivals, waiting, who: ana, when: after });
    expect(due.send).toEqual({ urgency: "high", reason: "at once", total: 1, hard: 0, blocking: 0 });
    expect(decide({ ...base, pauses, now: HOUR + WHEN.soonMs, arrivals, waiting, who: ben, when: after })).toEqual({ settle: arrivals });
  });

  it("with nobody named, everything is the one reviewer's, as before there were members", () => {
    const waiting = [w("B-aaaaa", "blocking", { to: ben.account })];
    expect(decide({ ...base, now: WHEN.soonMs, arrivals: [a("B-aaaaa", 0)], waiting }).send).toMatchObject({ reason: "at once", total: 1, blocking: 1 });
  });
});
