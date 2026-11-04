import { env } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "../../src/storage.js";
import { Accounts } from "../src/accounts.js";
import { WHEN, decide, pushText } from "../src/notify.js";
import { machineLogin, oauth, signUp } from "./browser.js";
import { call, fileCard, machineStore } from "./client.js";
import { PushStandIn, type TestBrowser } from "./push-service.js";

// The website's notifications from the relay (M9e step 2): when a card starts waiting, a push to every browser of the
// project's owner that turned them on, saying how many cards wait and their levels, with the project's name, never a
// card's text (B-mjf3g), built by Baesian's own code (B-nk97q), and sent when B-advkh's rules say: blocking and hard cards
// at once, provisional ones in a digest, never while the reviewer is present (D41), at most 4 an hour per project, and
// not for a machine filing a burst. A push service's 404 or 410 deletes the subscription. The push service is a stand-in
// that decrypts what it gets with keys the test made; the clock is the test's.

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
  at(Date.UTC(2027, 0, 4, 9));
  service = new PushStandIn();
});
afterEach(() => {
  service.restore();
  vi.useRealTimers();
});

let n = 0;
/** A person with a project of their own, a machine signed in to it, and a browser that gets notifications. */
async function owner(opts: { machines?: string[]; browsers?: number } = {}) {
  n += 1;
  const project = `p-notify-${n}-${Math.random().toString(36).slice(2, 8)}`;
  const person = await signUp();
  const machines: Record<string, { access: string; refresh: string }> = {};
  for (const m of opts.machines ?? ["laptop"]) machines[m] = await machineLogin(person, project, m);
  const browsers: TestBrowser[] = [];
  for (let i = 0; i < (opts.browsers ?? 1); i++) {
    const b = await service.browser();
    const r = await person.browser.post("/v1/account/push", { endpoint: b.endpoint, keys: { p256dh: b.p256dh, auth: b.auth } });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    browsers.push(b);
  }
  return { project, person, machines, browsers, store: machineStore(new MemoryStorage(), project) };
}

type Owner = Awaited<ReturnType<typeof owner>>;

/** A machine files a card and uploads it, as the CLI's sync does: decks, then the revision, then the rest. */
async function file(o: Owner, over: Record<string, unknown> = {}, machine = "laptop"): Promise<string> {
  const id = fileCard(o.store, over);
  const mem = o.store.storage as MemoryStorage;
  const paths = mem.paths().filter((p) => p.startsWith(`cards/${id}/`) && !p.endsWith(".sig") && !p.endsWith("-relay.json"));
  for (const p of paths.sort((a, b) => Number(/\/r\d+\.md$/.test(b)) - Number(/\/r\d+\.md$/.test(a)))) {
    const put = () => call("PUT", `files/${p}`, { as: asMachine(o, machine), project: o.project, body: mem.read(p)! });
    let r = await put();
    if (r.status === 401) {
      // An access token lasts an hour: the CLI refreshes it, as here.
      const t = await oauth("/v1/machines/token", { client_id: "baesian-cli", grant_type: "refresh_token", refresh_token: o.machines[machine]!.refresh });
      o.machines[machine] = { access: t.body.access_token, refresh: t.body.refresh_token };
      r = await put();
    }
    expect(r.status, await r.clone().text()).toBeLessThan(300);
  }
  return id;
}

const asMachine = (o: Owner, machine = "laptop") => ({ headers: { authorization: `Bearer ${o.machines[machine]!.access}` } });

const stub = (o: Owner) => env.PROJECTS.get(env.PROJECTS.idFromName(o.project));
const alarmAt = (o: Owner) => runInDurableObject(stub(o), (_i, s) => s.storage.getAlarm());
/** Run the project's alarm, as the runtime would when it comes due. */
const alarm = (o: Owner) => runDurableObjectAlarm(stub(o));
const titles = (b: TestBrowser) => service.to(b).map((r) => r.message.title);

describe("when a notification goes (B-advkh)", () => {
  it("a hard card notifies within seconds, at high urgency: counts, levels and the project's name, never what a card says", async () => {
    const o = await owner();
    const t0 = now;
    await file(o, { level: "provisional", title: "Where the access token lives", question: "Which store keeps the token?" });
    await file(o, { level: "hard", title: "Whether to delete old exports", question: "Should old exports be deleted?" });
    expect(await alarmAt(o)).toBe(t0 + WHEN.soonMs);
    later(WHEN.soonMs);
    expect(await alarm(o)).toBe(true);
    const [got] = service.to(o.browsers[0]!);
    expect(got!.message).toEqual({ title: `2 cards waiting in Project ${o.project} (1 hard)`, body: "Tap to open them.", url: `/projects/${o.project}`, tag: `baesian:${o.project}` });
    const all = JSON.stringify(got);
    for (const text of ["access token", "token", "exports", "Where the", "Whether"]) expect(all).not.toContain(text);
    expect(got!.headers).toMatchObject({ urgency: "high", "content-encoding": "aes128gcm" });
    expect(got!.headers.topic).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(got!.vapid.verified).toBe(true);
    expect(got!.vapid.claims.sub).toBe(env.SERVICE_ORIGIN);
    // The browser's last push is listed on the account page.
    const list = await o.person.browser.get("/v1/account/push");
    expect(list.body.subscriptions[0].last_sent).toBe(new Date(now).toISOString());
    // Told once: the alarm again sends nothing more.
    later(MINUTE);
    await alarm(o);
    expect(service.to(o.browsers[0]!)).toHaveLength(1);
  });

  it("gathers a burst of filings into one notification", async () => {
    const o = await owner();
    await file(o, { level: "blocking" });
    later(2 * SECOND);
    await file(o, { level: "hard" });
    later(3 * SECOND);
    await file(o, { level: "blocking" });
    later(WHEN.soonMs);
    await alarm(o);
    expect(titles(o.browsers[0]!)).toEqual([`3 cards waiting in Project ${o.project} (1 hard, 2 blocking)`]);
  });

  it("provisional cards wait for a digest at most 3 hours after the first; a sooner notification counts them in", async () => {
    const o = await owner();
    const t0 = now;
    await file(o, { level: "provisional" });
    later(WHEN.soonMs);
    await alarm(o);
    expect(service.received).toHaveLength(0);
    expect(await alarmAt(o)).toBe(t0 + WHEN.digestMs!);
    later(HOUR);
    await file(o, { level: "provisional" });
    at(t0 + WHEN.digestMs!);
    await alarm(o);
    expect(service.to(o.browsers[0]!).map((r) => [r.message.title, r.headers.urgency])).toEqual([[`2 cards waiting in Project ${o.project}`, "normal"]]);
    // The second was counted in the digest: nothing more for it.
    later(WHEN.digestMs!);
    await alarm(o);
    expect(service.received).toHaveLength(1);

    // A hard card's notification counts a provisional one waiting for its digest, which then sends nothing of its own.
    const p = await owner();
    const t1 = now;
    await file(p, { level: "provisional" });
    later(30 * MINUTE);
    await file(p, { level: "hard" });
    later(WHEN.soonMs);
    await alarm(p);
    expect(titles(p.browsers[0]!)).toEqual([`2 cards waiting in Project ${p.project} (1 hard)`]);
    at(t1 + WHEN.digestMs! + MINUTE);
    await alarm(p);
    expect(service.to(p.browsers[0]!)).toHaveLength(1);
  });

  it("sends nothing while the reviewer is present in a client, and nothing later for what arrived then (D41)", async () => {
    const o = await owner();
    const beat = await o.person.browser.post(`/v1/projects/${o.project}/presence`, { client: "hosted-desktop" });
    expect(beat.status).toBe(204);
    await file(o, { level: "hard" });
    later(WHEN.soonMs);
    await alarm(o);
    later(5 * MINUTE);
    await alarm(o);
    expect(service.received).toHaveLength(0);
    // Away now (no beat for 90 seconds): the next card notifies, counting both.
    await file(o, { level: "hard" });
    later(WHEN.soonMs);
    await alarm(o);
    expect(titles(o.browsers[0]!)).toEqual([`2 cards waiting in Project ${o.project} (2 hard)`]);
  });

  it("sends at most 4 an hour per project; the next waits until the hour frees, then counts everything waiting", async () => {
    const o = await owner();
    const t0 = now;
    for (let i = 0; i < 5; i++) {
      await file(o, { level: "hard" });
      later(WHEN.soonMs);
      await alarm(o);
      later(5 * MINUTE);
    }
    expect(service.received).toHaveLength(WHEN.capPerHour);
    expect(await alarmAt(o)).toBe(t0 + WHEN.soonMs + HOUR);
    at(t0 + WHEN.soonMs + HOUR);
    await alarm(o);
    expect(titles(o.browsers[0]!).at(-1)).toBe(`5 cards waiting in Project ${o.project} (5 hard)`);
    expect(service.received).toHaveLength(5);
  });

  it("pauses a machine that files more than 20 new cards in 10 minutes, says so on the project's page, and notifies another machine's", async () => {
    const o = await owner({ machines: ["laptop", "desktop"] });
    for (let i = 0; i < WHEN.burstCards + 1; i++) {
      await file(o, { level: "hard" });
      later(10 * SECOND);
    }
    later(WHEN.soonMs);
    await alarm(o);
    expect(service.received).toHaveLength(0);
    const page = await o.person.browser.get(`/v1/projects/${o.project}/pushes`);
    expect(page.status).toBe(200);
    expect(page.body.paused).toEqual([{ machine: "laptop", cards: WHEN.burstCards + 1, minutes: 10, until: expect.any(String) }]);
    expect(Date.parse(page.body.paused[0].until)).toBe(now - WHEN.soonMs - 10 * SECOND + WHEN.pauseMs);
    // Its next card doesn't notify either, and extends the pause.
    await file(o, { level: "hard" });
    later(WHEN.soonMs);
    await alarm(o);
    expect(service.received).toHaveLength(0);
    // Another machine's card does, counting everything waiting.
    await file(o, { level: "hard" }, "desktop");
    later(WHEN.soonMs);
    await alarm(o);
    expect(titles(o.browsers[0]!)).toEqual([`23 cards waiting in Project ${o.project} (23 hard)`]);
    // After the pause, the page says nothing.
    later(WHEN.pauseMs);
    expect((await o.person.browser.get(`/v1/projects/${o.project}/pushes`)).body.paused).toEqual([]);
  });

  it("doesn't notify for a card answered or held back before its time, and counts only cards still waiting", async () => {
    const o = await owner();
    const id = await file(o, { level: "blocking" });
    const card = (await (await call("GET", "state", { as: asMachine(o), project: o.project })).json()) as { cards: { meta: { id: string; revision: number } }[] };
    const r = await o.person.browser.post(`/v1/projects/${o.project}/verdicts`, { card: id, revision: card.cards[0]!.meta.revision, response: "accept" });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    later(2 * MINUTE);
    later(WHEN.soonMs);
    await alarm(o);
    expect(service.received).toHaveLength(0);
  });
});

describe("browsers that are gone", () => {
  it("deletes a subscription its push service answers 410 or 404 for, and keeps the others", async () => {
    const o = await owner({ browsers: 3 });
    const [a, b, c] = o.browsers as [TestBrowser, TestBrowser, TestBrowser];
    service.answer(a, 410);
    service.answer(b, 404);
    await file(o, { level: "hard" });
    later(WHEN.soonMs);
    await alarm(o);
    expect(service.to(c)).toHaveLength(1);
    const left = await new Accounts(env.ACCOUNTS!).subscriptions(o.person.account);
    expect(left.map((s) => s.endpoint)).toEqual([c.endpoint]);
    // A push service that fails otherwise keeps it.
    service.answer(c, 500);
    later(HOUR);
    await file(o, { level: "hard" });
    later(WHEN.soonMs);
    await alarm(o);
    expect(await new Accounts(env.ACCOUNTS!).subscriptions(o.person.account)).toHaveLength(1);
  });
});

describe("browsers that get notifications (the account's subscriptions)", () => {
  it("gives the VAPID key's public half in the config, lists each browser once, and removes one", async () => {
    const person = await signUp();
    const config = await person.browser.get("/v1/config");
    expect(config.body.vapid_public_key).toMatch(/^[A-Za-z0-9_-]{87}$/);
    const b = await service.browser();
    const sub = { endpoint: b.endpoint, keys: { p256dh: b.p256dh, auth: b.auth } };
    const first = await person.browser.post("/v1/account/push", sub);
    expect(first.status).toBe(201);
    expect(first.body.subscription).toMatchObject({ name: "Safari on a Mac", service: "push.test", last_sent: null });
    expect(first.body.subscription.key).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(first.body)).not.toContain(b.endpoint);
    // The same browser again (new keys, say) is still one row.
    const other = await service.browser();
    expect((await person.browser.post("/v1/account/push", { ...sub, keys: { p256dh: other.p256dh, auth: other.auth } })).body.subscription.id).toBe(first.body.subscription.id);
    await person.browser.post("/v1/account/push", { endpoint: other.endpoint, keys: { p256dh: other.p256dh, auth: other.auth } });
    const list = await person.browser.get("/v1/account/push");
    expect(list.body.subscriptions.map((s: { id: string }) => s.id)).toHaveLength(2);
    expect((await person.browser.del(`/v1/account/push/${first.body.subscription.id}`)).status).toBe(204);
    expect((await person.browser.del(`/v1/account/push/${first.body.subscription.id}`)).status).toBe(404);
    expect((await person.browser.get("/v1/account/push")).body.subscriptions).toHaveLength(1);

    // Another account signed in on the same browser takes its subscription over.
    const someone = await signUp();
    await someone.browser.post("/v1/account/push", { endpoint: other.endpoint, keys: { p256dh: other.p256dh, auth: other.auth } });
    expect((await person.browser.get("/v1/account/push")).body.subscriptions).toHaveLength(0);
    expect((await someone.browser.get("/v1/account/push")).body.subscriptions).toHaveLength(1);
    // Nobody removes another account's.
    const theirs = (await someone.browser.get("/v1/account/push")).body.subscriptions[0].id;
    expect((await person.browser.del(`/v1/account/push/${theirs}`)).status).toBe(404);
  });

  it("refuses an address that isn't a push service, keys that aren't a browser's, and anyone not signed in on the site", async () => {
    const person = await signUp();
    const b = await service.browser();
    const keys = { p256dh: b.p256dh, auth: b.auth };
    const refused = async (body: unknown) => (await person.browser.post("/v1/account/push", body)).body.error as string;
    expect(await refused({ endpoint: "https://example.test/hook", keys })).toMatch(/example.test isn't a push service/);
    expect(await refused({ endpoint: "http://push.test/x", keys })).toMatch(/push.test isn.t a push service/);
    expect(await refused({ endpoint: b.endpoint, keys: { ...keys, auth: "AAAA" } })).toMatch(/auth secret/);
    expect(await refused({ endpoint: b.endpoint, keys: { ...keys, p256dh: "AAAA" } })).toMatch(/p256dh/);
    expect(await refused({ endpoint: b.endpoint })).toMatch(/p256dh/);
    expect(await refused({})).toMatch(/subscription/);
    const fromElsewhere = await person.browser.post("/v1/account/push", { endpoint: b.endpoint, keys }, { origin: "https://elsewhere.test", "sec-fetch-site": "cross-site" });
    expect(fromElsewhere.status).toBe(403);
    const signedOut = await person.browser.post("/v1/account/push", { endpoint: b.endpoint, keys }, { cookie: "" });
    expect(signedOut.status).toBe(401);
  });

  it("refuses more than 20 browsers for one account", async () => {
    const person = await signUp();
    for (let i = 0; i < 20; i++) {
      const b = await service.browser();
      expect((await person.browser.post("/v1/account/push", { endpoint: b.endpoint, keys: { p256dh: b.p256dh, auth: b.auth } })).status).toBe(201);
    }
    const b = await service.browser();
    const r = await person.browser.post("/v1/account/push", { endpoint: b.endpoint, keys: { p256dh: b.p256dh, auth: b.auth } });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/at most 20 browsers: remove one first/);
  });

  it("refuses the stand-in push service in production", async () => {
    const { readSubscription, pushServiceAllowed } = await import("../src/push.js");
    const b = await service.browser();
    expect(readSubscription({ endpoint: b.endpoint, keys: { p256dh: b.p256dh, auth: b.auth } }, false)).toMatch(/push.test isn't a push service/);
    for (const ok of ["https://fcm.googleapis.com/fcm/send/x", "https://updates.push.services.mozilla.com/wpush/v2/x", "https://web.push.apple.com/x", "https://wns2-par02p.notify.windows.com/w/?token=x"]) expect(pushServiceAllowed(new URL(ok))).toBe(true);
    for (const no of ["http://fcm.googleapis.com/x", "https://fcm.googleapis.com.evil.test/x", "https://localhost/x"]) expect(pushServiceAllowed(new URL(no))).toBe(false);
  });
});

describe("the rules, as one function (B-advkh)", () => {
  const w = (card: string, level: "provisional" | "blocking" | "hard") => ({ card, revision: 1, level });
  const a = (card: string, arrived: number, machine = "laptop") => ({ card, revision: 1, machine, arrived });

  it("waits for what isn't due, and says when to look again", () => {
    const d = decide({ now: 5000, arrivals: [a("B-aaaaa", 0)], waiting: [w("B-aaaaa", "hard")], present: false, sent: [], pauses: [] });
    expect(d).toEqual({ settle: [], next: WHEN.soonMs });
  });

  it("with no digest (provisional cards never notifying alone), a provisional card waits for another's notification", () => {
    const when = { ...WHEN, digestMs: null };
    const d = decide({ now: 10 * HOUR, arrivals: [a("B-aaaaa", 0)], waiting: [w("B-aaaaa", "provisional")], present: false, sent: [], pauses: [], when });
    expect(d).toEqual({ settle: [] });
    const e = decide({ now: 10 * HOUR, arrivals: [a("B-aaaaa", 0), a("B-bbbbb", 10 * HOUR - WHEN.soonMs)], waiting: [w("B-aaaaa", "provisional"), w("B-bbbbb", "blocking")], present: false, sent: [], pauses: [], when });
    expect(e.send).toEqual({ urgency: "high", reason: "at once", total: 2, hard: 0, blocking: 1 });
    expect(e.settle).toHaveLength(2);
  });

  it("words: counts and levels only", () => {
    expect(pushText({ total: 1, hard: 1, blocking: 0 }, "Shop")).toEqual({ title: "1 card waiting in Shop (hard)", body: "Tap to open it." });
    expect(pushText({ total: 1, hard: 0, blocking: 0 }, null).title).toBe("1 card waiting in an unnamed project");
    expect(pushText({ total: 4, hard: 1, blocking: 2 }, "Shop").title).toBe("4 cards waiting in Shop (1 hard, 2 blocking)");
  });
});
