import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiState } from "../../src/api.js";
import { renderDoc } from "../../src/frontmatter.js";
import { ledgerBody } from "../../src/schema.js";
import { MemoryStorage } from "../../src/storage.js";
import { mergeFile } from "../../src/store.js";
import { LIMITS } from "../src/accounts.js";
import { DELETION } from "../src/deletion.js";
import { hashOf } from "../src/secret.js";
import { type ProjectRelay, housekeeping } from "../src/index.js";
import { Usage } from "../src/usage.js";
import { Browser, type Person, TURNSTILE, machineLogin, outbox, reauth, signIn, signUp } from "./browser.js";
import { call, fileCard, machineStore } from "./client.js";

// Deleting an account (M9f), as card B-b46z3 decided, "Closed for 14 days, then deleted": asked for on the account page
// with the passkey checked afresh and the handle typed out; closed at once (sign-ins and machines ended, notifications
// removed, nothing counted, a notice emailed); restored by signing in with its passkey within 14 days; then deleted by
// the daily job, with every project it owns, and nothing else. The clock is the test's.

const DAY = 86_400_000;
const MINUTE = 60_000;

let now: number;
const at = (t: number) => {
  now = t;
  vi.setSystemTime(t);
};
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at(Date.UTC(2027, 4, 3, 9));
});
afterEach(() => vi.useRealTimers());

const db = () => env.ACCOUNTS!;
const count = async (sql: string, ...args: unknown[]) => (await db().prepare(sql).bind(...args).first<{ n: number }>())!.n;
const stub = (project: string) => env.PROJECTS.get(env.PROJECTS.idFromName(project));

let n = 0;
/** A person with a project of their own, a machine signed in to it, a card filed and answered there, and a browser that gets notifications. */
async function owner(): Promise<{ p: Person; project: string; machine: { access: string; refresh: string; grant: string }; card: string }> {
  n += 1;
  const p = await signUp();
  const project = `p-del-${n}-${Math.random().toString(36).slice(2, 8)}`;
  const machine = await machineLogin(p, project);
  const store = machineStore(new MemoryStorage(), project);
  const card = fileCard(store, { touches: ["schema"], title: "Which queue the jobs use" });
  const mem = store.storage as MemoryStorage;
  for (const path of mem.paths().filter((x) => x.startsWith(`cards/${card}/`) && !x.endsWith("-relay.json")).sort((a, b) => Number(/\/r\d+\.md$/.test(b)) - Number(/\/r\d+\.md$/.test(a)))) {
    const r = await call("PUT", `files/${path}`, { as: { headers: { authorization: `Bearer ${machine.access}` } }, project, body: mem.read(path)! });
    expect(r.status, await r.clone().text()).toBeLessThan(300);
  }
  expect((await p.browser.post(`/v1/projects/${project}/verdicts`, { card, revision: 1, response: "accept" })).status).toBe(201);
  // D181: a commit that cites it, and the merge that brought it.
  const commit = "c".repeat(40);
  const hooks: [string, string][] = [
    [`ledger/${card}-abcde.md`, renderDoc({ type: "ledger", format: 1, card, branch: "feat/x", commit, at: new Date(now).toISOString() }, ledgerBody(commit, card))],
    [mergeFile(commit, "feat/x", "main"), JSON.stringify({ type: "merge", format: 1, branch: "feat/x", into: "main", commit, at: new Date(now).toISOString(), cards: [card] })],
  ];
  for (const [path, text] of hooks) {
    const r = await call("PUT", `files/${path}`, { as: { headers: { authorization: `Bearer ${machine.access}` } }, project, body: new TextEncoder().encode(text) });
    expect(r.status, await r.clone().text()).toBe(201);
  }
  await db().prepare("INSERT INTO push_subscriptions (id, account, endpoint, p256dh, auth, name, created) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(`push-${n}`, p.account, `https://push.test/${p.account}`, "key", "auth", "Firefox on a Mac", new Date(now).toISOString()).run();
  return { p, project, machine, card };
}

/** The person deletes their account on the account page: the handle typed, the passkey fresh. */
async function deleteAccount(p: Person) {
  await reauth(p);
  return p.browser.post("/v1/account/delete", { handle: p.handle });
}

/** Every row the accounts database holds for an account, table by table. */
async function rowsOf(account: string, project: string, usageId: string | null) {
  return {
    accounts: await count("SELECT COUNT(*) AS n FROM accounts WHERE id = ?", account),
    emails: await count("SELECT COUNT(*) AS n FROM emails WHERE account = ?", account),
    passkeys: await count("SELECT COUNT(*) AS n FROM passkeys WHERE account = ?", account),
    recovery_codes: await count("SELECT COUNT(*) AS n FROM recovery_codes WHERE account = ?", account),
    globus_identities: await count("SELECT COUNT(*) AS n FROM globus_identities WHERE account = ?", account),
    sessions: await count("SELECT COUNT(*) AS n FROM sessions WHERE account = ?", account),
    projects: await count("SELECT COUNT(*) AS n FROM projects WHERE owner = ? OR id = ?", account, project),
    grants: await count("SELECT COUNT(*) AS n FROM grants WHERE account = ? OR project = ?", account, project),
    spent_tokens: await count("SELECT COUNT(*) AS n FROM spent_tokens WHERE grant_id IN (SELECT id FROM grants WHERE account = ?)", account),
    device_codes: await count("SELECT COUNT(*) AS n FROM device_codes WHERE approved_by = ? OR project = ?", account, project),
    push_subscriptions: await count("SELECT COUNT(*) AS n FROM push_subscriptions WHERE account = ?", account),
    flows: await count("SELECT COUNT(*) AS n FROM flows WHERE account = ?", account),
    usage_events: usageId ? await count("SELECT COUNT(*) AS n FROM usage_events WHERE usage_id = ?", usageId) : 0,
  };
}

/** What the project's object still holds: its log's entries and its files, or none at all. */
const relayRows = (project: string) =>
  runInDurableObject(stub(project), (_i: ProjectRelay, s) => {
    const n = (table: string) => {
      try {
        return s.storage.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`).one().n;
      } catch {
        return 0;
      }
    };
    return { log: n("log"), files: n("files"), removed: n("retention_removed") };
  });

describe("deleting an account closes it at once (B-b46z3)", () => {
  it("takes the handle typed out and the passkey afresh; then signs everything out, revokes machines, removes notifications, counts nothing, and says so by email", async () => {
    const { p, project, machine } = await owner();
    // The handle, typed: a wrong one is refused.
    expect((await p.browser.post("/v1/account/delete", { handle: "someone-else" })).body).toMatchObject({ needs_handle: true });
    // The passkey, afresh: a check older than five minutes is refused.
    await db().prepare("UPDATE sessions SET verified = ? WHERE account = ?").bind(new Date(now - LIMITS.freshMs - MINUTE).toISOString(), p.account).run();
    const stale = await p.browser.post("/v1/account/delete", { handle: p.handle.toUpperCase() });
    expect(stale.status).toBe(403);
    expect(stale.body).toMatchObject({ reauth: true });
    const other = await signIn(p.passkey);
    const before = await count("SELECT COUNT(*) AS n FROM usage_events WHERE usage_id = (SELECT usage_id FROM accounts WHERE id = ?)", p.account);

    const r = await deleteAccount(p);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toEqual({ closed: true, deletes: new Date(now + DELETION.graceMs).toISOString() });
    expect(r.response.headers.getSetCookie().join()).toMatch(/__Host-baesian-session=;.*Max-Age=0/);
    // Every sign-in is ended, this one and the other browser's.
    expect((await p.browser.get("/v1/account")).status).toBe(401);
    expect((await other.get("/v1/account")).status).toBe(401);
    // The machine is signed out: the relay refuses it.
    expect((await call("GET", "state", { as: { headers: { authorization: `Bearer ${machine.access}` } }, project })).status).toBe(401);
    const rows = await rowsOf(p.account, project, null);
    expect(rows).toMatchObject({ accounts: 1, sessions: 0, push_subscriptions: 0, projects: 1, flows: 0 });
    expect(await count("SELECT COUNT(*) AS n FROM grants WHERE account = ? AND revoked IS NULL", p.account)).toBe(0);
    // Nothing more is counted.
    await new Usage(db()).record({ account: p.account, project }, "machine_approved", { new_project: false });
    expect(await count("SELECT COUNT(*) AS n FROM usage_events WHERE usage_id = (SELECT usage_id FROM accounts WHERE id = ?)", p.account)).toBe(before);
    // The notice says when, and how to keep it.
    const notice = outbox.last(p.email, "account-closed")!;
    expect(notice.text).toContain(`The Baesian account ${p.handle}`);
    expect(notice.text).toContain("sign in at https://baesian.test/sign-in with your passkey");
    expect(notice.text).toMatch(/On 17 May 2027 it will be deleted/);
    // Getting back in by email treats it as no account: it's restored only with its passkey.
    const sent = outbox.sent.length;
    expect((await p.browser.post("/v1/recover/email", { email: p.email, turnstile: TURNSTILE })).status).toBe(202);
    expect(outbox.sent.slice(sent).filter((m) => m.kind === "recovery-code")).toEqual([]);
    // And deleting twice does nothing more.
    expect((await p.browser.post("/v1/account/delete", { handle: p.handle })).status).toBe(401);
  });

  it("signing in with its passkey within 14 days offers to restore it, as it was; restored, it's signed in and won't be deleted", async () => {
    const { p, project, card } = await owner();
    const t0 = now;
    expect((await deleteAccount(p)).status).toBe(200);
    at(t0 + 13 * DAY);
    const b = new Browser();
    const start = await b.post("/v1/signin/start");
    const finish = await b.post("/v1/signin/finish", { flow: start.body.flow, response: p.passkey.sign(start.body.options.challenge) });
    expect(finish.status).toBe(409);
    expect(finish.body.closed).toEqual({ handle: p.handle, deletes: new Date(t0 + DELETION.graceMs).toISOString() });
    expect(b.session).toBeUndefined();
    // A restore flow is good once.
    expect((await b.post("/v1/signin/restore", { restore: "not-a-flow" })).status).toBe(400);
    const restored = await b.post("/v1/signin/restore", { restore: finish.body.restore });
    expect(restored.status, JSON.stringify(restored.body)).toBe(200);
    expect(restored.body).toMatchObject({ account: { id: p.account, handle: p.handle }, restored: true });
    expect((await b.post("/v1/signin/restore", { restore: finish.body.restore })).status).toBe(400);
    expect((await b.get("/v1/account")).body).toMatchObject({ handle: p.handle, projects: [{ id: project }] });
    expect(outbox.last(p.email, "account-restored")!.text).toContain("has been restored");
    // The project is as it was.
    const state = (await (await call("GET", "state", { as: { headers: { cookie: `__Host-baesian-session=${b.session}`, origin: env.SERVICE_ORIGIN } }, project })).json()) as ApiState;
    expect(state.cards.map((c) => c.meta.id)).toEqual([card]);
    // Day 15: the daily job leaves it be.
    at(t0 + 15 * DAY);
    expect(await housekeeping(env as never, now)).not.toContain(p.account);
    expect(await count("SELECT COUNT(*) AS n FROM accounts WHERE id = ? AND closed IS NULL", p.account)).toBe(1);
  });
});

describe("14 days on, the daily job deletes it (B-b46z3)", () => {
  it("deletes everything the card says goes, its projects' relay data included, and nothing of anyone else's", async () => {
    const a = await owner();
    const b = await owner();
    const t0 = now;
    const usageId = (await db().prepare("SELECT usage_id FROM accounts WHERE id = ?").bind(a.p.account).first<{ usage_id: string | null }>())!.usage_id;
    expect(usageId).not.toBeNull();
    // A Globus identity, a refresh token spent, and a daily total, so each is seen to go or stay.
    await db().prepare("INSERT INTO globus_identities (sub, account, linked) VALUES (?, ?, ?)").bind(`sub-${a.p.account}`, a.p.account, new Date(now).toISOString()).run();
    await db().prepare("INSERT INTO spent_tokens (hash, grant_id, spent) VALUES (?, ?, ?)").bind(`spent-${a.p.account}`, a.machine.grant, new Date(now).toISOString()).run();
    await db().prepare("INSERT INTO usage_daily (day, kind, field, value, count) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO UPDATE SET count = count + 1").bind("2027-01-01", "card_filed", "", "", 1).run();
    const daily = await count("SELECT COUNT(*) AS n FROM usage_daily");
    expect(await relayRows(a.project)).toMatchObject({ log: expect.any(Number) });
    expect((await relayRows(a.project)).log).toBeGreaterThan(0);
    const before = await runInDurableObject(stub(a.project), (_i: ProjectRelay, s) => s.storage.sql.exec<{ path: string }>("SELECT path FROM files WHERE path LIKE 'ledger/%' OR path LIKE 'merges/%'").toArray().length);
    expect(before).toBe(2);
    const bRows = await rowsOf(b.p.account, b.project, null);
    const bRelay = await relayRows(b.project);

    expect((await deleteAccount(a.p)).status).toBe(200);
    at(t0 + 14 * DAY - MINUTE);
    expect(await housekeeping(env as never, now)).not.toContain(a.p.account);
    expect((await rowsOf(a.p.account, a.project, usageId)).accounts).toBe(1);
    at(t0 + 14 * DAY + MINUTE);
    expect(await housekeeping(env as never, now)).toContain(a.p.account);

    // Everything of A's is gone, table by table, and its project's object holds nothing.
    expect(await rowsOf(a.p.account, a.project, usageId)).toEqual({
      accounts: 0, emails: 0, passkeys: 0, recovery_codes: 0, globus_identities: 0, sessions: 0, projects: 0, grants: 0, spent_tokens: 0, device_codes: 0, push_subscriptions: 0, flows: 0, usage_events: 0,
    });
    expect(await count("SELECT COUNT(*) AS n FROM emails WHERE address = ?", a.p.email)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM spent_tokens WHERE hash = ?", `spent-${a.p.account}`)).toBe(0);
    expect(await relayRows(a.project)).toEqual({ log: 0, files: 0, removed: 0 });
    expect(await runInDurableObject(stub(a.project), (_i, s) => s.storage.getAlarm())).toBeNull();
    // Its passkey signs nobody in now.
    const nobody = new Browser();
    const start = await nobody.post("/v1/signin/start");
    expect((await nobody.post("/v1/signin/finish", { flow: start.body.flow, response: a.p.passkey.sign(start.body.options.challenge) })).body.error).toMatch(/isn't enrolled/);
    // B's account and project are as they were (but for its expired codes and flows, which the job clears for everyone), and the daily totals stay.
    const kept = ({ device_codes: _d, flows: _f, ...rest }: Awaited<ReturnType<typeof rowsOf>>) => rest;
    expect(kept(await rowsOf(b.p.account, b.project, null))).toEqual(kept(bRows));
    expect(bRows).toMatchObject({ accounts: 1, emails: 1, passkeys: 1, recovery_codes: 1, sessions: 1, projects: 1, grants: 1, push_subscriptions: 1 });
    expect(await relayRows(b.project)).toEqual(bRelay);
    expect(await count("SELECT COUNT(*) AS n FROM usage_daily")).toBe(daily);
    // Run again, nothing more.
    expect(await housekeeping(env as never, now)).not.toContain(a.p.account);
  });

  it("clears rows whose time is over: ended sign-ins, machines signed out or lapsed a day ago; live ones stay", async () => {
    const { p, machine } = await owner();
    const live = await signIn(p.passkey);
    const other = await machineLogin(p, `p-del-other-${Math.random().toString(36).slice(2, 8)}`, "desktop");
    await db().prepare("UPDATE grants SET revoked = ? WHERE id = ?").bind(new Date(now).toISOString(), machine.grant).run();
    at(now + 2 * DAY);
    // A sign-in past 30 days unused is ended; the live one is used today.
    await db().prepare("UPDATE sessions SET last_used = ? WHERE hash != ? AND account = ?").bind(new Date(now - 31 * DAY).toISOString(), hashOf(live.session!), p.account).run();
    expect((await live.get("/v1/account")).status).toBe(200);
    await db().prepare("UPDATE grants SET last_used = ? WHERE id = ?").bind(new Date(now).toISOString(), other.grant).run();
    await housekeeping(env as never, now);
    expect(await count("SELECT COUNT(*) AS n FROM grants WHERE id = ?", machine.grant)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM grants WHERE id = ?", other.grant)).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM sessions WHERE account = ?", p.account)).toBe(1);
    expect((await live.get("/v1/account")).status).toBe(200);
  });
});
