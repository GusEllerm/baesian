import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiState } from "../../src/api.js";
import { readRelayEntry } from "../../src/schema.js";
import { MemoryStorage } from "../../src/storage.js";
import type { Store } from "../../src/store.js";
import { Accounts, LIMITS } from "../src/accounts.js";
import { DELETION } from "../src/deletion.js";
import { type ProjectRelay, housekeeping } from "../src/index.js";
import { type Person, machineLogin, reauth, signUp } from "./browser.js";
import { call, fileCard, machineStore, pulled } from "./client.js";

// Several reviewers per project (P20), stage 1, step 1: members on the service. A project has members (B-r51ts: any of
// them answers its cards), some of them owners, who alone add and remove members and change its settings and rules
// (B-rxbss). Someone joins by a link an owner makes: good once, for seven days (B-jsady). A second member's answer on a
// card someone else decided is refused, never written (B-v43z8). The clock is the test's.

const DAY = 86_400_000;
const MINUTE = 60_000;

let now: number;
const at = (t: number) => {
  now = t;
  vi.setSystemTime(t);
};
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at(Date.UTC(2027, 5, 7, 9));
});
afterEach(() => vi.useRealTimers());

let n = 0;
interface Team {
  project: string;
  /** The account that made the project, and holds it. */
  owner: Person;
  store: Store;
}

/** A person with a project of their own and a machine signed in to it. */
async function team(): Promise<Team> {
  n += 1;
  const project = `p-team-${n}-${Math.random().toString(36).slice(2, 8)}`;
  const owner = await signUp();
  await machineLogin(owner, project, "laptop");
  return { project, owner, store: machineStore(new MemoryStorage(), project) };
}

const inObject = <T>(t: Team, fn: (relay: ProjectRelay, state: DurableObjectState) => T | Promise<T>) =>
  runInDurableObject(env.PROJECTS.get(env.PROJECTS.idFromName(t.project)), fn as (i: ProjectRelay, s: DurableObjectState) => Promise<T>);

/** A machine uploads what a store holds of its decks and cards, decks then revisions first; straight to the object, as the Worker passes it on. */
async function push(t: Team, store: Store = t.store, machine = "laptop"): Promise<void> {
  const mem = store.storage as MemoryStorage;
  const order = (p: string) => (p.startsWith("decks/") ? 0 : /\/r\d+\.md$/.test(p) ? 1 : 2);
  const paths = mem.paths().filter((p) => /^(decks|cards)\//.test(p) && !p.endsWith(".sig") && !p.endsWith("-relay.json"));
  for (const p of paths.sort((a, b) => order(a) - order(b) || a.localeCompare(b))) {
    const r = await inObject(t, (relay) => relay.upload(t.project, p, mem.read(p)!, machine));
    expect(r.status, `${p}: ${JSON.stringify(r.body)}`).toBeLessThan(300);
  }
}

async function file(t: Team, over: Record<string, unknown> = {}): Promise<string> {
  const id = fileCard(t.store, over);
  await push(t);
  return id;
}

const at_ = (t: Team, path: string) => `/v1/projects/${t.project}/${path}`;
const members = (t: Team) => `/v1/account/projects/${t.project}/members`;
const invites = (t: Team) => `/v1/account/projects/${t.project}/invites`;

/** An owner makes a link, with the passkey checked afresh; returns its code, the part after the `#`. */
async function link(t: Team, by: Person = t.owner): Promise<string> {
  await reauth(by);
  const r = await by.browser.post(invites(t));
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  expect(r.body.link).toMatch(new RegExp(`^${env.SERVICE_ORIGIN}/join#[A-Za-z0-9_-]{20,}$`));
  return String(r.body.link).split("#")[1]!;
}

/** Someone new signs up and joins the project by a link its owner made. */
async function joined(t: Team): Promise<Person> {
  const p = await signUp();
  const r = await p.browser.post("/v1/account/invites/accept", { code: await link(t) });
  expect(r, JSON.stringify(r.body)).toMatchObject({ status: 200, body: { project: t.project, joined: true } });
  return p;
}

const answer = (t: Team, who: Person, input: Record<string, unknown>) => who.browser.post(at_(t, "verdicts"), { revision: 1, response: "accept", ...input });

/** Confirm an answer that waits for the passkey, alone, with one tap (B-a6xpc); returns what became of it. */
async function tap(t: Team, who: Person, pending: string): Promise<{ status: number; body: Record<string, any> }> {
  const asked = await who.browser.post(at_(t, "batches"), { pending: [pending] });
  expect(asked.status, JSON.stringify(asked.body)).toBe(202);
  const done = await who.browser.post(at_(t, "proofs"), { batch: asked.body.passkey.batch, response: who.passkey.sign(asked.body.passkey.challenge) });
  expect(done.status, JSON.stringify(done.body)).toBe(200);
  return done.body.answers[0];
}

describe("joining a project (B-jsady: a link the owner sends)", () => {
  it("adds one person, once, by a link only an owner can make; the code is after the #, and no address is kept", async () => {
    const t = await team();
    const b = await signUp();
    // Not a member: the project isn't theirs to read, or to list.
    expect((await b.browser.get(at_(t, "state"))).status).toBe(403);
    expect((await b.browser.get("/v1/account")).body.projects).toEqual([]);
    expect((await b.browser.get(members(t))).status).toBe(404);
    expect((await b.browser.post(invites(t))).status).toBe(404);

    const code = await link(t);
    // What the link is for, before it's used: the project, its name, who made it.
    const look = await b.browser.post("/v1/account/invites/look", { code });
    expect(look).toMatchObject({ status: 200, body: { project: t.project, name: `Project ${t.project}`, by: t.owner.handle, member: false } });
    expect(Date.parse(look.body.expires) - now).toBe(LIMITS.inviteMs);
    // Only its hash is kept, with who made it.
    const rows = (await env.ACCOUNTS!.prepare("SELECT * FROM invites WHERE project = ?").bind(t.project).all<Record<string, unknown>>()).results;
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(code);
    expect(Object.keys(rows[0]!).sort()).toEqual(["created", "created_by", "expires", "hash", "project", "used", "used_by"]);

    const r = await b.browser.post("/v1/account/invites/accept", { code });
    expect(r).toMatchObject({ status: 200, body: { project: t.project, joined: true } });
    expect((await b.browser.get("/v1/account")).body.projects).toEqual([{ id: t.project, name: `Project ${t.project}`, created: expect.any(String), role: "member" }]);
    expect((await b.browser.get(at_(t, "state"))).status).toBe(200);

    // Used up: nobody else joins by it, and looking it up says so.
    const c = await signUp();
    expect((await c.browser.post("/v1/account/invites/accept", { code })).status).toBe(404);
    expect((await c.browser.post("/v1/account/invites/look", { code })).status).toBe(404);
    expect((await c.browser.get(at_(t, "state"))).status).toBe(403);

    // Every member sees who's in the project; only an owner sees its links.
    const mine = await b.browser.get(members(t));
    expect(mine.body).toMatchObject({ project: t.project, role: "member" });
    expect(mine.body.members).toEqual([
      { account: t.owner.account, handle: t.owner.handle, role: "owner", joined: expect.any(String), holds: true },
      { account: b.account, handle: b.handle, role: "member", joined: expect.any(String), you: true },
    ]);
    expect(mine.body).not.toHaveProperty("invites");
    expect((await t.owner.browser.get(members(t))).body.invites).toEqual([]);
    // A member doesn't make a link.
    await reauth(b);
    expect((await b.browser.post(invites(t))).status).toBe(403);
  });

  it("asks for the owner's passkey afresh; a link stops working after seven days, or when it's cancelled", async () => {
    const t = await team();
    const b = await signUp();
    // The passkey was checked more than five minutes ago.
    at(now + LIMITS.freshMs + MINUTE);
    expect(await t.owner.browser.post(invites(t))).toMatchObject({ status: 403, body: { reauth: true } });

    const old = await link(t);
    expect((await t.owner.browser.get(members(t))).body.invites).toEqual([{ created: expect.any(String), expires: expect.any(String), by: t.owner.handle }]);
    at(now + LIMITS.inviteMs - MINUTE);
    expect((await b.browser.post("/v1/account/invites/look", { code: old })).status).toBe(200);
    at(now + 2 * MINUTE);
    expect((await b.browser.post("/v1/account/invites/accept", { code: old })).status).toBe(404);
    expect((await b.browser.get(at_(t, "state"))).status).toBe(403);

    const cancelled = await link(t);
    expect((await t.owner.browser.request("DELETE", invites(t))).status).toBe(200);
    expect((await b.browser.post("/v1/account/invites/accept", { code: cancelled })).status).toBe(404);
    // A code that isn't one, or none at all.
    expect((await b.browser.post("/v1/account/invites/accept", { code: "x".repeat(43) })).status).toBe(404);
    expect((await b.browser.post("/v1/account/invites/accept", {})).status).toBe(400);
  });

  it("lets a member's machine sign in to the project, and nobody else's", async () => {
    const t = await team();
    const b = await joined(t);
    const grant = await machineLogin(b, t.project, "b-laptop");
    const log = await call("GET", "log?after=0", { as: { headers: { authorization: `Bearer ${grant.access}` } }, project: t.project });
    expect(log.status).toBe(200);
    // Someone who isn't a member is told how to become one.
    const c = await signUp();
    const d = await (await import("./browser.js")).oauth("/v1/machines/device", { client_id: "baesian-cli", project: t.project, machine: "c-laptop" });
    await reauth(c);
    expect((await c.browser.get(`/v1/account/machines/approve?code=${d.body.user_code}`)).body.yours).toBe(false);
    const refused = await c.browser.post("/v1/account/machines/approve", { code: d.body.user_code, approve: true });
    expect(refused).toMatchObject({ status: 409, body: { error: expect.stringMatching(/ask one of its owners for a link to join/) } });
  });
});

describe("a link, once it's used or expired", () => {
  it("is forgotten a day later by the daily job; one that still works is kept", async () => {
    const t = await team();
    await joined(t);
    const unused = await link(t);
    const links = async () => (await env.ACCOUNTS!.prepare("SELECT COUNT(*) AS n, SUM(used_by IS NOT NULL) AS used FROM invites WHERE project = ?").bind(t.project).first<{ n: number; used: number | null }>())!;
    expect(await links()).toEqual({ n: 2, used: 1 });
    // A day on: the used one is gone, and the one nobody has used still works.
    at(now + DAY + MINUTE);
    await housekeeping(env as never, now);
    expect(await links()).toEqual({ n: 1, used: 0 });
    const someone = await signUp();
    expect((await someone.browser.post("/v1/account/invites/look", { code: unused })).status).toBe(200);
    // A day after it expires, it's gone too.
    at(now + LIMITS.inviteMs + DAY);
    await housekeeping(env as never, now);
    expect(await links()).toEqual({ n: 0, used: null });
    expect((await someone.browser.post("/v1/account/invites/look", { code: unused })).status).toBe(404);
  });
});

describe("what a member may do (B-r51ts, B-rxbss)", () => {
  it("answers any card, as an owner does; the answer names them", async () => {
    const t = await team();
    const b = await joined(t);
    const first = await file(t);
    const second = await file(t);
    const mine = await answer(t, b, { card: first });
    expect(mine).toMatchObject({ status: 201, body: { verdict: { card: first, reviewer: b.handle, account: b.account, project: t.project }, status: "resolved" } });
    expect(await answer(t, t.owner, { card: second })).toMatchObject({ status: 201, body: { verdict: { reviewer: t.owner.handle, account: t.owner.account } } });
    const s = (await b.browser.get(at_(t, "state"))).body as unknown as ApiState;
    expect(s.cards.map((c) => [c.meta.id, c.status, c.verdicts.at(-1)?.reviewer]).sort()).toEqual(
      [
        [first, "resolved", b.handle],
        [second, "resolved", t.owner.handle],
      ].sort(),
    );
  });

  it("proves a hard answer with their own passkey, whose key the project got as they joined", async () => {
    const t = await team();
    const b = await joined(t);
    const hard = await file(t, { touches: ["security"], wrong_if: "a token leaks", check: "the audit log" });
    const asked = await answer(t, b, { card: hard });
    expect(asked.status, JSON.stringify(asked.body)).toBe(202);
    const done = await tap(t, b, asked.body.passkey.pending);
    expect(done).toMatchObject({ status: 201, body: { verdict: { card: hard, account: b.account }, status: "resolved" } });
    // The relay's own store counts it, by the same checks `baesian verify` makes.
    const counted = await inObject(t, (relay) => (relay as unknown as { relay(p: string): { store(): Store } }).relay(t.project).store().uncounted());
    expect(counted).toEqual([]);
  });

  it("doesn't change the project's settings; an owner does", async () => {
    const t = await team();
    const b = await joined(t);
    const change = { mode: "shadow", row_dependency: "tell-me", client: "hosted-desktop" };
    expect(await b.browser.post(at_(t, "preferences"), change)).toMatchObject({ status: 403, body: { error: expect.stringMatching(/only a project's owners change its settings/) } });
    expect((await t.owner.browser.post(at_(t, "preferences"), change)).status).toBe(201);
    // Reading them is any member's.
    expect((await b.browser.get(at_(t, "presets"))).status).toBe(200);
  });

  it("doesn't accept a rule: its draft is an owner's to answer", async () => {
    const t = await team();
    const b = await joined(t);
    const id = await file(t);
    // A member may ask for a rule with their answer.
    expect((await answer(t, b, { card: id, make_rule: true })).status).toBe(201);
    // The agent hears it and drafts the rule on its machine; the draft goes up as any card does.
    const entries = (await inObject(t, (relay) => relay.log(t.project, 0, 1000))).body as { entries: unknown[] };
    const mine = machineStore(pulled(entries.entries.map(readRelayEntry)), t.project);
    expect(mine.ruleAsked(id)).toBe(true);
    const draft = mine.draftRule(id, "Small dev dependencies need no card.", ["dep:vitest-*"], { agent: "claude-code" });
    await push(t, mine);
    expect(await answer(t, b, { card: draft.meta.id })).toMatchObject({ status: 403, body: { error: expect.stringMatching(/only its owners do/) } });
    expect((await answer(t, t.owner, { card: draft.meta.id })).status).toBe(201);
  });

  it("keeps practice answers each member's own", async () => {
    const t = await team();
    const b = await joined(t);
    expect((await t.owner.browser.post(at_(t, "practice"), { kind: "test-start" })).status).toBe(201);
    expect((await t.owner.browser.get(at_(t, "practice"))).body.entries).toHaveLength(1);
    expect((await b.browser.get(at_(t, "practice"))).body.entries).toEqual([]);
    // One member's blind test having started is no part of another's.
    expect((await b.browser.post(at_(t, "practice"), { kind: "test-start" })).status).toBe(201);
    expect((await b.browser.get(at_(t, "practice"))).body.entries).toMatchObject([{ kind: "test-start", account: b.account }]);
    expect((await t.owner.browser.post(at_(t, "practice"), { kind: "test-start" })).status).toBe(409);
  });
});

describe("a second person's answer on a decided card (B-v43z8: someone settles it)", () => {
  it("is refused, saying who decided and whether it differs; the member who decided may change their own", async () => {
    const t = await team();
    const b = await joined(t);
    const id = await file(t);
    expect((await answer(t, b, { card: id })).status).toBe(201);
    const version = ((await b.browser.get(at_(t, "state"))).body as unknown as ApiState).version;

    // The owner would have chosen the other option: nothing is written, and the card stands as it was decided.
    const alternative = t.store.card(id)!.meta.alternative;
    const other = await answer(t, t.owner, { card: id, response: "alternative", choice: alternative });
    expect(other).toMatchObject({ status: 409, body: { error: expect.stringMatching(new RegExp(`^${b.handle} decided this card already: a second person's answer doesn't replace the first`)), decided: { by: b.handle, same: false, decision: t.store.card(id)!.meta.proposal } } });
    // The same answer is refused too, and says it was the same.
    expect(await answer(t, t.owner, { card: id })).toMatchObject({ status: 409, body: { decided: { by: b.handle, same: true } } });
    // So is one that would send it back to its agent.
    expect((await answer(t, t.owner, { card: id, response: "need_context", comment: "Which store?" })).status).toBe(409);
    const s = (await b.browser.get(at_(t, "state"))).body as unknown as ApiState;
    expect(s.version).toBe(version);
    expect(s.cards[0]).toMatchObject({ status: "resolved", decision: t.store.card(id)!.meta.proposal });
    expect(s.cards[0]!.verdicts).toHaveLength(1);

    // Whoever decided it changes their own answer, as before.
    const changed = await answer(t, b, { card: id, response: "alternative", choice: alternative });
    expect(changed).toMatchObject({ status: 201, body: { status: "resolved" } });
    expect(((await b.browser.get(at_(t, "state"))).body as unknown as ApiState).cards.find((c) => c.meta.id === id)).toMatchObject({ decision: alternative });
  });

  it("is refused when it waited for the passkey while someone else decided", async () => {
    const t = await team();
    const b = await joined(t);
    const hard = await file(t, { touches: ["security"], wrong_if: "a token leaks", check: "the audit log" });
    // The owner answers first, and it waits for their passkey.
    const waiting = await answer(t, t.owner, { card: hard });
    expect(waiting.status).toBe(202);
    // Meanwhile the member answers, and confirms.
    const theirs = await answer(t, b, { card: hard, response: "alternative", choice: t.store.card(hard)!.meta.alternative });
    expect((await tap(t, b, theirs.body.passkey.pending)).status).toBe(201);
    // The owner's tap comes: the card is decided, and theirs isn't written.
    const late = await tap(t, t.owner, waiting.body.passkey.pending);
    expect(late).toMatchObject({ status: 409, body: { decided: { by: b.handle, same: false } } });
    const s = (await b.browser.get(at_(t, "state"))).body as unknown as ApiState;
    expect(s.cards[0]!.verdicts.map((v) => v.reviewer)).toEqual([b.handle]);
  });

  it("doesn't stop a card that came back to its agent, or was passed on, being answered by anyone", async () => {
    const t = await team();
    const b = await joined(t);
    const id = await file(t);
    expect((await answer(t, b, { card: id, response: "not_my_area" })).status).toBe(201);
    expect(await answer(t, t.owner, { card: id })).toMatchObject({ status: 201, body: { status: "resolved" } });
  });
});

describe("leaving a project, and removing a member (B-rxbss)", () => {
  it("ends their reach at once, their machines' too; only an owner removes someone else, and the account that holds the project stays", async () => {
    const t = await team();
    const b = await joined(t);
    const c = await joined(t);
    const machine = await machineLogin(b, t.project, "b-laptop");
    const asMachine = () => call("GET", "log?after=0", { as: { headers: { authorization: `Bearer ${machine.access}` } }, project: t.project });
    expect((await asMachine()).status).toBe(200);

    // A member doesn't remove another, or the owner.
    expect((await b.browser.del(`${members(t)}/${c.account}`)).status).toBe(403);
    expect((await b.browser.del(`${members(t)}/${t.owner.account}`)).status).toBe(403);
    // The account that made the project can't leave it.
    expect(await t.owner.browser.del(`${members(t)}/${t.owner.account}`)).toMatchObject({ status: 409, body: { error: expect.stringMatching(/holds it, and can't leave it or be removed/) } });

    // The owner removes b: their session and their machine lose the project.
    expect((await t.owner.browser.del(`${members(t)}/${b.account}`)).status).toBe(204);
    expect((await b.browser.get(at_(t, "state"))).status).toBe(403);
    expect((await asMachine()).status).toBe(401);
    expect((await b.browser.get("/v1/account")).body.projects).toEqual([]);
    expect((await t.owner.browser.del(`${members(t)}/${b.account}`)).status).toBe(404);
    // What they answered stays in the record.

    // c leaves by themselves.
    expect((await c.browser.del(`${members(t)}/${c.account}`)).status).toBe(204);
    expect((await c.browser.get(members(t))).status).toBe(404);
    expect((await t.owner.browser.get(members(t))).body.members.map((m: { handle: string }) => m.handle)).toEqual([t.owner.handle]);
  });

  it("keeps a removed member's answers, which still count", async () => {
    const t = await team();
    const b = await joined(t);
    const id = await file(t);
    expect((await answer(t, b, { card: id })).status).toBe(201);
    expect((await t.owner.browser.del(`${members(t)}/${b.account}`)).status).toBe(204);
    const s = (await t.owner.browser.get(at_(t, "state"))).body as unknown as ApiState;
    expect(s.cards[0]).toMatchObject({ status: "resolved" });
    expect(s.cards[0]!.verdicts.at(-1)).toMatchObject({ reviewer: b.handle, account: b.account });
  });

  it("deletes a leaver's practice answers there, and a removed member's, and only theirs (B-wfw7a: they go at once)", async () => {
    const t = await team();
    const b = await joined(t);
    const c = await joined(t);
    const practice = async (account: string) => ((await inObject(t, (relay) => relay.practiceRead(t.project, account))).body as { entries: unknown[] }).entries;
    for (const who of [t.owner, b, c]) expect((await who.browser.post(at_(t, "practice"), { kind: "test-start" })).status).toBe(201);
    // b leaves by themselves; c is removed by the owner.
    expect((await b.browser.del(`${members(t)}/${b.account}`)).status).toBe(204);
    expect((await t.owner.browser.del(`${members(t)}/${c.account}`)).status).toBe(204);
    expect(await practice(b.account)).toEqual([]);
    expect(await practice(c.account)).toEqual([]);
    expect(await practice(t.owner.account)).toMatchObject([{ kind: "test-start", account: t.owner.account }]);
    // Back by a new link, b starts the blind test afresh.
    expect((await b.browser.post("/v1/account/invites/accept", { code: await link(t) })).status).toBe(200);
    expect((await b.browser.get(at_(t, "practice"))).body.entries).toEqual([]);
    expect((await b.browser.post(at_(t, "practice"), { kind: "test-start" })).status).toBe(201);
  });

  it("cancels the unused links of someone who stops being an owner: removed, leaving, or made a member (B-rxbss: owners add members)", async () => {
    const t = await team();
    const owner = async (p: Person) => {
      await reauth(t.owner);
      expect((await t.owner.browser.request("PATCH", `${members(t)}/${p.account}`, { json: { role: "owner" } })).status).toBe(200);
    };
    const b = await joined(t);
    const c = await joined(t);
    const d = await joined(t);
    for (const p of [b, c, d]) await owner(p);
    const [fromB, fromC, fromD, fromOwner] = [await link(t, b), await link(t, c), await link(t, d), await link(t)];
    expect((await t.owner.browser.get(members(t))).body.invites).toHaveLength(4);
    // b is removed, c leaves, d is made a member again.
    expect((await t.owner.browser.del(`${members(t)}/${b.account}`)).status).toBe(204);
    expect((await c.browser.del(`${members(t)}/${c.account}`)).status).toBe(204);
    await reauth(t.owner);
    expect((await t.owner.browser.request("PATCH", `${members(t)}/${d.account}`, { json: { role: "member" } })).status).toBe(200);
    expect((await t.owner.browser.get(members(t))).body.invites.map((i: { by: string }) => i.by)).toEqual([t.owner.handle]);
    const someone = await signUp();
    for (const code of [fromB, fromC, fromD]) expect((await someone.browser.post("/v1/account/invites/accept", { code })).status).toBe(404);
    expect((await someone.browser.post("/v1/account/invites/accept", { code: fromOwner })).status).toBe(200);
  });

  it("makes a member an owner, with the passkey afresh: they then change settings and make links; the holder stays an owner", async () => {
    const t = await team();
    const b = await joined(t);
    const role = (who: Person, account: string, r: string) => who.browser.request("PATCH", `${members(t)}/${account}`, { json: { role: r } });
    expect((await role(b, b.account, "owner")).status).toBe(403);
    at(now + LIMITS.freshMs + MINUTE);
    expect((await role(t.owner, b.account, "owner")).status).toBe(403);
    await reauth(t.owner);
    expect((await role(t.owner, b.account, "admin")).status).toBe(400);
    const made = await role(t.owner, b.account, "owner");
    expect(made.status).toBe(200);
    expect(await made.json()).toEqual({ account: b.account, role: "owner" });
    expect((await b.browser.post(at_(t, "preferences"), { mode: "shadow", row_dependency: "tell-me", client: "hosted-desktop" })).status).toBe(201);
    await link(t, b);
    // The account that made the project stays an owner, whoever asks.
    await reauth(b);
    expect((await role(b, t.owner.account, "member")).status).toBe(409);
    expect((await t.owner.browser.get(members(t))).body.members.map((m: { role: string }) => m.role)).toEqual(["owner", "owner"]);
  });
});

describe("accounts that close (B-b46z3), with members", () => {
  /** The person deletes their account on the account page: the handle typed, the passkey fresh. It's closed at once. */
  const close = async (p: Person) => {
    await reauth(p);
    const r = await p.browser.post("/v1/account/delete", { handle: p.handle });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  };

  it("deleting a member's account leaves the project as it was, without them", async () => {
    const t = await team();
    const b = await joined(t);
    const id = await file(t);
    expect((await answer(t, b, { card: id })).status).toBe(201);
    await close(b);
    at(now + DELETION.graceMs + MINUTE);
    expect(await housekeeping(env as never, now)).toEqual([b.account]);
    // The project, its cards and the member's answer are all still there, for its owner.
    const s = (await t.owner.browser.get(at_(t, "state"))).body as unknown as ApiState;
    expect(s.cards.map((c) => [c.meta.id, c.status])).toEqual([[id, "resolved"]]);
    expect((await t.owner.browser.get(members(t))).body.members.map((m: { handle: string }) => m.handle)).toEqual([t.owner.handle]);
    expect(await new Accounts(env.ACCOUNTS!).project(t.project)).not.toBeNull();
  });

  it("deleting a member's account deletes their practice answers in the project, and only theirs (B-b46z3)", async () => {
    const t = await team();
    const b = await joined(t);
    expect((await t.owner.browser.post(at_(t, "practice"), { kind: "test-start" })).status).toBe(201);
    expect((await b.browser.post(at_(t, "practice"), { kind: "test-start" })).status).toBe(201);
    await close(b);
    // Closed, it can still be restored, so they're kept.
    expect(((await inObject(t, (relay) => relay.practiceRead(t.project, b.account))).body as { entries: unknown[] }).entries).toHaveLength(1);
    at(now + DELETION.graceMs + MINUTE);
    expect(await housekeeping(env as never, now)).toEqual([b.account]);
    expect(((await inObject(t, (relay) => relay.practiceRead(t.project, b.account))).body as { entries: unknown[] }).entries).toEqual([]);
    expect((await t.owner.browser.get(at_(t, "practice"))).body.entries).toMatchObject([{ kind: "test-start", account: t.owner.account }]);
  });

  it("deleting an owner's account forgets that the members they added joined by their link (B-b46z3)", async () => {
    const t = await team();
    const b = await joined(t);
    await reauth(t.owner);
    expect((await t.owner.browser.request("PATCH", `${members(t)}/${b.account}`, { json: { role: "owner" } })).status).toBe(200);
    const c = await signUp();
    expect((await c.browser.post("/v1/account/invites/accept", { code: await link(t, b) })).status).toBe(200);
    const addedBy = async () => (await env.ACCOUNTS!.prepare("SELECT added_by FROM members WHERE project = ? AND account = ?").bind(t.project, c.account).first<{ added_by: string | null }>())?.added_by;
    expect(await addedBy()).toBe(b.account);
    await close(b);
    at(now + DELETION.graceMs + MINUTE);
    expect(await housekeeping(env as never, now)).toEqual([b.account]);
    // c stays a member; nothing names the account that's gone.
    expect(await addedBy()).toBeNull();
  });

  it("closing the account that holds a project closes it for every member, and deleting it deletes the project", async () => {
    const t = await team();
    const b = await joined(t);
    await file(t);
    const machine = await machineLogin(b, t.project, "b-laptop");
    await close(t.owner);
    // Closed at once, for the member too: nothing is read, by them or their machine, and it isn't among their projects.
    expect((await b.browser.get(at_(t, "state"))).status).toBe(403);
    expect((await call("GET", "log?after=0", { as: { headers: { authorization: `Bearer ${machine.access}` } }, project: t.project })).status).toBe(401);
    expect((await b.browser.get("/v1/account")).body.projects).toEqual([]);
    at(now + DELETION.graceMs + MINUTE);
    expect(await housekeeping(env as never, now)).toEqual([t.owner.account]);
    const accounts = new Accounts(env.ACCOUNTS!);
    expect(await accounts.project(t.project)).toBeNull();
    expect(await accounts.members(t.project)).toEqual([]);
    // The member's account is untouched.
    expect((await b.browser.get("/v1/account")).status).toBe(200);
    expect(DAY).toBe(86_400_000);
  });
});
