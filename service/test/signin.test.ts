import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "../src/access.js";
import { Accounts, LIMITS } from "../src/accounts.js";
import { hashOf } from "../src/secret.js";
import { Browser, TURNSTILE, outbox, reauth, signIn, signUp } from "./browser.js";
import { WebPasskey, randomChallenge } from "./passkeys.js";

// Signing in with a passkey (D153), the sign-ins it makes (B-vtr1r: 30 days unused, 90 in all; B-7bq05: a name and the
// last use), enrolling another passkey, signing out, and getting back in with an emailed code and a saved recovery code
// together (B-jzgy4).

describe("signing in with a passkey", () => {
  it("signs in with any of the site's passkeys, named for the browser it's in", async () => {
    const p = await signUp();
    const b = await signIn(p.passkey);
    const me = await b.get("/v1/account");
    expect(me.body).toMatchObject({ id: p.account, handle: p.handle });
    const list = await b.get("/v1/account/sessions");
    expect(list.body.sessions).toHaveLength(2);
    expect(list.body.sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    expect(list.body.sessions[0]).toEqual({ id: expect.stringMatching(/^sess-/), name: "Safari on a Mac", created: expect.any(String), last_used: expect.any(String), current: expect.any(Boolean) });
    // Nothing about where a sign-in came from is kept (B-7bq05).
    const row = await env.ACCOUNTS.prepare("SELECT * FROM sessions WHERE hash = ?").bind(hashOf(b.session!)).first();
    expect(Object.keys(row!).sort()).toEqual(["account", "created", "expires", "hash", "id", "last_used", "name", "verified"]);
    expect(JSON.stringify(row)).not.toContain(b.address);
  });

  it("refuses a passkey that isn't enrolled, a signature over another challenge, and a challenge used twice", async () => {
    const p = await signUp();
    const b = new Browser();
    let start = await b.post("/v1/signin/start");
    expect((await b.post("/v1/signin/finish", { flow: start.body.flow, response: new WebPasskey().sign(start.body.options.challenge) })).body.error).toMatch(/isn't enrolled/);
    start = await b.post("/v1/signin/start");
    expect((await b.post("/v1/signin/finish", { flow: start.body.flow, response: p.passkey.sign(randomChallenge()) })).status).toBe(400);
    start = await b.post("/v1/signin/start");
    expect((await b.post("/v1/signin/finish", { flow: start.body.flow, response: p.passkey.sign(start.body.options.challenge, { flags: 0x01 }) })).body.error).toMatch(/signature doesn't check/);
    start = await b.post("/v1/signin/start");
    const response = p.passkey.sign(start.body.options.challenge);
    expect((await b.post("/v1/signin/finish", { flow: start.body.flow, response })).status).toBe(200);
    expect((await new Browser().post("/v1/signin/finish", { flow: start.body.flow, response })).status).toBe(400);
  });

  it("refuses the account to anyone not signed in, to another site's pages, and to a bearer token", async () => {
    const p = await signUp();
    expect((await new Browser().get("/v1/account")).status).toBe(401);
    expect((await p.browser.get("/v1/account", { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await p.browser.post("/v1/account/signout", {}, { origin: "https://evil.test" })).status).toBe(403);
    expect((await p.browser.get("/v1/account", { authorization: "Bearer anything" })).status).toBe(403);
    expect((await p.browser.get("/v1/account")).status).toBe(200);
  });
});

describe("how long a sign-in lasts (B-vtr1r)", () => {
  it("ends after 30 days unused, or 90 days in all, however it's used", async () => {
    const p = await signUp();
    const cookie = p.browser.session!;
    let t = Date.now();
    const at = new Accounts(env.ACCOUNTS, () => new Date(t));
    t += LIMITS.sessionIdleMs - 60_000;
    expect(await at.session(cookie)).toBeDefined();
    // Used every 29 days, it lasts until 90 days from its start, and no longer.
    t += LIMITS.sessionIdleMs - 60_000;
    expect(await at.session(cookie)).toBeDefined();
    t += LIMITS.sessionIdleMs - 60_000;
    expect(await at.session(cookie)).toBeDefined();
    t += 4 * 60_000;
    expect(await at.session(cookie)).toBeUndefined();

    const q = await signUp();
    let u = Date.now();
    const later = new Accounts(env.ACCOUNTS, () => new Date(u));
    u += LIMITS.sessionIdleMs + 60_000;
    expect(await later.session(q.browser.session!)).toBeUndefined();
    // Once ended, it's gone, not merely refused.
    expect(await env.ACCOUNTS.prepare("SELECT 1 FROM sessions WHERE hash = ?").bind(hashOf(q.browser.session!)).first()).toBeNull();
  });

  it("is ended from the list, signed out of, or signed out everywhere", async () => {
    const p = await signUp();
    const other = await signIn(p.passkey);
    const third = await signIn(p.passkey);
    const list = (await p.browser.get("/v1/account/sessions")).body.sessions as { id: string; current: boolean }[];
    expect(list).toHaveLength(3);
    const otherId = (await other.get("/v1/account/sessions")).body.sessions.find((s: { current: boolean }) => s.current).id;
    expect((await p.browser.del(`/v1/account/sessions/${otherId}`)).status).toBe(204);
    expect((await other.get("/v1/account")).status).toBe(401);
    expect((await p.browser.del(`/v1/account/sessions/${otherId}`)).status).toBe(404);

    const out = await third.post("/v1/account/signout");
    expect(out.status).toBe(204);
    expect(out.response.headers.getSetCookie()[0]).toMatch(new RegExp(`^${SESSION_COOKIE}=; .*Max-Age=0`));
    expect((await third.get("/v1/account")).status).toBe(401);
    expect((await p.browser.get("/v1/account")).status).toBe(200);

    const again = await signIn(p.passkey);
    expect((await again.post("/v1/account/signout", { everywhere: true })).status).toBe(204);
    expect((await p.browser.get("/v1/account")).status).toBe(401);
  });
});

describe("enrolling another passkey", () => {
  it("asks for a passkey you have first, then enrols the new one, mails a notice and gives the line to pin (D159)", async () => {
    const p = await signUp();
    const b = await signIn(p.passkey);
    // A sign-in checks the passkey, so it's fresh for five minutes; past that, enrolling asks again.
    await env.ACCOUNTS.prepare("UPDATE sessions SET verified = ? WHERE hash = ?").bind(new Date(Date.now() - LIMITS.freshMs - 1000).toISOString(), hashOf(b.session!)).run();
    const refused = await b.post("/v1/account/passkeys/start");
    expect(refused).toMatchObject({ status: 403, body: { reauth: true } });
    await reauth({ browser: b, passkey: p.passkey });
    const start = await b.post("/v1/account/passkeys/start");
    expect(start.status).toBe(200);
    expect(start.body.options.excludeCredentials.map((c: { id: string }) => c.id)).toEqual([p.passkey.id]);
    const second = new WebPasskey("-", p.handle, -8);
    const done = await b.post("/v1/account/passkeys/finish", { flow: start.body.flow, response: second.register(start.body.options.challenge), name: "my laptop" });
    expect(done.status).toBe(201);
    expect(done.body.passkey).toMatchObject({ credential: second.id, name: "my laptop" });
    expect(JSON.parse(done.body.passkey.pin)).toMatchObject({ account: p.account, credential: second.id, alg: -8 });
    expect(outbox.last(p.email)!.kind).toBe("passkey-added");
    await signIn(second);
    expect((await b.get("/v1/account")).body.passkeys).toHaveLength(2);
  });

  it("doesn't check the passkey afresh with another account's passkey", async () => {
    const p = await signUp();
    const q = await signUp();
    const start = await p.browser.post("/v1/account/reauth/start");
    expect((await p.browser.post("/v1/account/reauth/finish", { flow: start.body.flow, response: q.passkey.sign(start.body.options.challenge) })).status).toBe(400);
  });
});

describe("getting back in with an emailed code and a saved recovery code (B-jzgy4)", () => {
  it("takes both codes, then a new passkey; issues a new recovery code, ends every other sign-in, and mails a notice", async () => {
    const p = await signUp();
    const b = new Browser();
    const sent = await b.post("/v1/recover/email", { email: p.email, turnstile: TURNSTILE });
    expect(sent.status).toBe(202);
    const code = outbox.last(p.email, "recovery-code")!.code!;
    const typed = p.recovery.toLowerCase().replace(/-/g, " ");
    const verified = await b.post("/v1/recover/verify", { flow: sent.body.flow, code, recovery_code: typed });
    expect(verified.status).toBe(200);
    expect(verified.body.options.user.name).toBe(p.handle);
    const fresh = new WebPasskey("-", p.handle);
    const done = await b.post("/v1/recover/finish", { flow: sent.body.flow, response: fresh.register(verified.body.options.challenge) });
    expect(done.status).toBe(201);
    expect(done.body.account.id).toBe(p.account);
    expect(done.body.recovery_code).not.toBe(p.recovery);
    expect(outbox.last(p.email)!.kind).toBe("recovered");
    expect((await p.browser.get("/v1/account")).status).toBe(401);
    expect((await b.get("/v1/account")).status).toBe(200);
    await signIn(fresh);

    // The old recovery code is spent.
    const again = await new Browser().post("/v1/recover/email", { email: p.email, turnstile: TURNSTILE });
    const r = await new Browser().post("/v1/recover/verify", { flow: again.body.flow, code: outbox.last(p.email, "recovery-code")!.code, recovery_code: p.recovery });
    expect(r).toMatchObject({ status: 400, body: { error: "those codes don't match" } });
  });

  it("takes neither code alone, and gives five tries in all", async () => {
    const p = await signUp();
    const b = new Browser();
    const sent = await b.post("/v1/recover/email", { email: p.email, turnstile: TURNSTILE });
    const code = outbox.last(p.email, "recovery-code")!.code!;
    const wrongCode = code === "000000" ? "000001" : "000000";
    expect((await b.post("/v1/recover/verify", { flow: sent.body.flow, code })).status).toBe(400);
    expect((await b.post("/v1/recover/verify", { flow: sent.body.flow, code, recovery_code: "AAAAA-AAAAA-AAAAA-AAAAA" })).body).toMatchObject({ attempts_left: 4 });
    expect((await b.post("/v1/recover/verify", { flow: sent.body.flow, code: wrongCode, recovery_code: p.recovery })).body).toMatchObject({ attempts_left: 3 });
    for (const left of [2, 1, 0]) expect((await b.post("/v1/recover/verify", { flow: sent.body.flow, code: wrongCode, recovery_code: p.recovery })).body.attempts_left).toBe(left);
    expect((await b.post("/v1/recover/verify", { flow: sent.body.flow, code, recovery_code: p.recovery })).body.attempts_left).toBe(0);
  });

  it("answers the same for an address with no account, and mails nobody", async () => {
    const b = new Browser();
    const email = `nobody-${Date.now()}@example.test`;
    const sent = await b.post("/v1/recover/email", { email, turnstile: TURNSTILE });
    expect(sent.status).toBe(202);
    expect(outbox.last(email)).toBeUndefined();
    expect((await b.post("/v1/recover/verify", { flow: sent.body.flow, code: "123456", recovery_code: "AAAAA-AAAAA-AAAAA-AAAAA" })).status).toBe(400);
  });
});
