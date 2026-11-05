import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "../src/access.js";
import { Accounts, LIMITS } from "../src/accounts.js";
import { type Env, handleRequest } from "../src/index.js";
import { bindingMailer, mails } from "../src/mail.js";
import { turnstile } from "../src/turnstile.js";
import { BASE } from "./client.js";
import { Browser, ORIGIN, TURNSTILE, freshEmail, freshHandle, outbox, services, signUp } from "./browser.js";
import { WebPasskey, randomChallenge } from "./passkeys.js";

// Signing up (D153): an email, a code sent to it (B-pvye0), a handle, and a passkey (B-jp22m), behind Turnstile
// (B-1a03b) and limits per address (B-mz6qc); the account gets a recovery code to keep (B-jzgy4) and a sign-in.

describe("signing up with an email and a passkey (D153)", () => {
  it("sends a code, checks it, enrols the passkey, and signs in with a cookie only the site's own pages send", async () => {
    const b = new Browser();
    const email = freshEmail();
    const handle = freshHandle();
    const sent = await b.post("/v1/signup/email", { email: email.toUpperCase(), turnstile: TURNSTILE });
    expect(sent.status).toBe(202);
    expect(sent.body).toEqual({ flow: expect.any(String), expires_in: 900 });
    const mail = outbox.last(email, "signup-code")!;
    expect(mail.code).toMatch(/^\d{6}$/);
    expect(mail.text).toContain(mail.code!);
    const verified = await b.post("/v1/signup/verify", { flow: sent.body.flow, code: mail.code, handle });
    expect(verified.status).toBe(200);
    expect(verified.body.options).toMatchObject({ rp: { id: env.SERVICE_RP_ID }, user: { name: handle }, attestation: "none", authenticatorSelection: { residentKey: "required", userVerification: "required" } });
    expect(new Set(verified.body.options.pubKeyCredParams.map((p: { alg: number }) => p.alg))).toEqual(new Set([-7, -8, -257]));
    const passkey = new WebPasskey("-", handle);
    const done = await b.post("/v1/signup/finish", { flow: sent.body.flow, response: passkey.register(verified.body.options.challenge) });
    expect(done.status).toBe(201);
    expect(done.body.account).toEqual({ id: expect.stringMatching(/^acct-/), handle });
    expect(done.body.recovery_code).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);
    // Sign-up gives only the recovery code to keep: the passkey's line for CI is on the account, any time (B-yj5d5).
    expect(done.body.passkey).toEqual({ credential: passkey.id, name: expect.any(String) });

    const cookie = done.response.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`))!;
    expect(cookie).toMatch(/; Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=7776000$/);
    const me = await b.get("/v1/account");
    expect(me.status).toBe(200);
    const pin = JSON.parse(me.body.passkeys[0].pin);
    expect(pin).toMatchObject({ type: "passkey-key", format: 1, account: done.body.account.id, handle, credential: passkey.id, public_key: passkey.spki.toString("base64url"), alg: -7 });
    expect(me.body).toMatchObject({ id: done.body.account.id, handle, emails: [{ address: email, verified: expect.any(String) }], passkeys: [{ credential: passkey.id }], globus: null, projects: [] });

    // Nothing secret is stored as it is: the cookie, the code and the recovery code are hashes in the database.
    const dump = JSON.stringify((await env.ACCOUNTS.prepare("SELECT * FROM sessions").all()).results) + JSON.stringify((await env.ACCOUNTS.prepare("SELECT * FROM recovery_codes").all()).results);
    expect(dump).not.toContain(b.session!);
    expect(dump).not.toContain(done.body.recovery_code);
  });

  it("can't be finished twice, or with a passkey made for another challenge", async () => {
    const b = new Browser();
    const email = freshEmail();
    const sent = await b.post("/v1/signup/email", { email, turnstile: TURNSTILE });
    const verified = await b.post("/v1/signup/verify", { flow: sent.body.flow, code: outbox.last(email)!.code, handle: freshHandle() });
    const passkey = new WebPasskey();
    expect((await b.post("/v1/signup/finish", { flow: sent.body.flow, response: passkey.register(randomChallenge()) })).body.error).toMatch(/couldn't be enrolled/);
    expect((await b.post("/v1/signup/finish", { flow: sent.body.flow, response: passkey.register(verified.body.options.challenge, { origin: "https://evil.test" }) })).status).toBe(400);
    expect((await b.post("/v1/signup/finish", { flow: sent.body.flow, response: passkey.register(verified.body.options.challenge) })).status).toBe(201);
    expect((await b.post("/v1/signup/finish", { flow: sent.body.flow, response: passkey.register(verified.body.options.challenge) })).status).toBe(400);
  });

  it("takes five tries at a code, then none", async () => {
    const b = new Browser();
    const email = freshEmail();
    const sent = await b.post("/v1/signup/email", { email, turnstile: TURNSTILE });
    const code = outbox.last(email)!.code!;
    const wrong = code === "000000" ? "000001" : "000000";
    for (let left = LIMITS.codeAttempts - 1; left >= 1; left--) {
      const r = await b.post("/v1/signup/verify", { flow: sent.body.flow, code: wrong, handle: freshHandle() });
      expect(r).toMatchObject({ status: 400, body: { attempts_left: left } });
    }
    expect((await b.post("/v1/signup/verify", { flow: sent.body.flow, code: wrong, handle: freshHandle() })).body.attempts_left).toBe(0);
    // The right code is no use now.
    const r = await b.post("/v1/signup/verify", { flow: sent.body.flow, code, handle: freshHandle() });
    expect(r.body).toMatchObject({ attempts_left: 0, error: expect.stringMatching(/no tries left/) });
  });

  it("asks for a handle that's free and well formed, keeping the checked code meanwhile", async () => {
    const taken = await signUp();
    const b = new Browser();
    const email = freshEmail();
    const sent = await b.post("/v1/signup/email", { email, turnstile: TURNSTILE });
    const code = outbox.last(email)!.code;
    expect((await b.post("/v1/signup/verify", { flow: sent.body.flow, code, handle: taken.handle.toUpperCase() })).status).toBe(409);
    expect((await b.post("/v1/signup/verify", { flow: sent.body.flow, handle: "x" })).status).toBe(400);
    expect((await b.post("/v1/signup/verify", { flow: sent.body.flow, handle: "has space" })).status).toBe(400);
    expect((await b.post("/v1/signup/verify", { flow: sent.body.flow, handle: freshHandle() })).status).toBe(200);
  });

  it("answers the same for an address that has an account, and mails its owner a notice instead of a code", async () => {
    const p = await signUp();
    const b = new Browser();
    const r = await b.post("/v1/signup/email", { email: p.email, turnstile: TURNSTILE });
    expect(r.status).toBe(202);
    expect(Object.keys(r.body).sort()).toEqual(["expires_in", "flow"]);
    expect(outbox.last(p.email)!.kind).toBe("already-signed-up");
    expect(outbox.last(p.email)!.code).toBeUndefined();
  });
});

describe("what sign-up refuses (B-1a03b, B-mz6qc, Hosted Service section 3)", () => {
  it("runs Turnstile before any mail is sent: no token, or a token that fails, sends nothing", async () => {
    const b = new Browser();
    const email = freshEmail();
    expect((await b.post("/v1/signup/email", { email })).body.error).toMatch(/bot check's token is missing/);
    expect((await b.post("/v1/recover/email", { email })).status).toBe(403);
    const failing = { ...services, turnstile: turnstile("2x0000000000000000000000000000000AA", true) };
    const r = await handleRequest(new Request(`${BASE}/v1/signup/email`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json", "cf-connecting-ip": b.address }, body: JSON.stringify({ email, turnstile: TURNSTILE }) }), env as unknown as Env, failing);
    expect(r.status).toBe(403);
    expect(outbox.last(email)).toBeUndefined();
  });

  it("refuses Turnstile's test keys in production, and checks a real one with Cloudflare", async () => {
    expect(await turnstile("1x0000000000000000000000000000000AA", false).check(TURNSTILE, undefined)).toMatchObject({ ok: false, why: expect.stringMatching(/test key in production/) });
    expect(await turnstile(undefined, true).check(TURNSTILE, undefined)).toMatchObject({ ok: false });
    let asked: FormData | undefined;
    const cloudflare = (async (_url: string, init: RequestInit) => {
      asked = init.body as FormData;
      return Response.json({ success: asked.get("response") === "good" });
    }) as unknown as typeof fetch;
    expect(await turnstile("real-secret-for-the-test", false, cloudflare).check("good", "10.1.2.3")).toEqual({ ok: true });
    expect(asked!.get("remoteip")).toBe("10.1.2.3");
    expect(await turnstile("real-secret-for-the-test", false, cloudflare).check("bad", undefined)).toMatchObject({ ok: false });
  });

  it("sends at most five codes an hour, and ten a day, to one address", async () => {
    const email = freshEmail();
    const accounts = new Accounts(env.ACCOUNTS);
    // Earlier codes, as the flows that carried them: four this hour leave room for one more.
    for (let i = 0; i < LIMITS.codesPerHour - 1; i++) await accounts.startFlow("signup", { email }, LIMITS.codeMs);
    expect((await new Browser().post("/v1/signup/email", { email, turnstile: TURNSTILE })).status).toBe(202);
    const r = await new Browser().post("/v1/recover/email", { email, turnstile: TURNSTILE });
    expect(r.status).toBe(429);
    expect(r.body.error).toMatch(/at most 5 an hour and 10 a day/);
    // Ten in the day, none of them this hour, is the cap too.
    const other = freshEmail();
    const yesterday = new Accounts(env.ACCOUNTS, () => new Date(Date.now() - 3 * 3_600_000));
    for (let i = 0; i < LIMITS.codesPerDay; i++) await yesterday.startFlow("recover", { email: other }, LIMITS.codeMs);
    expect((await new Browser().post("/v1/signup/email", { email: other, turnstile: TURNSTILE })).status).toBe(429);
  });

  it("limits requests per network address and per email address with the rate-limiting bindings", async () => {
    const b = new Browser();
    const email = freshEmail();
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await b.post("/v1/signup/email", { email, turnstile: TURNSTILE })).status);
    expect(statuses.slice(0, 3)).toEqual([202, 202, 202]);
    expect(statuses.slice(3)).toEqual([429, 429]);
    const a = new Browser();
    const many: number[] = [];
    for (let i = 0; i < 32; i++) many.push((await a.post("/v1/signin/start")).status);
    expect(many.filter((s) => s === 429).length).toBeGreaterThan(0);
  });

  it("refuses requests from another site, and any with an Authorization header", async () => {
    const b = new Browser();
    const email = freshEmail();
    for (const headers of [{ origin: "https://evil.test" }, { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" }, { origin: "" }] as Record<string, string>[]) {
      const r = await b.post("/v1/signup/email", { email, turnstile: TURNSTILE }, headers);
      expect(r.status, JSON.stringify(headers)).toBe(403);
    }
    expect((await b.post("/v1/signin/start", {}, { authorization: "Bearer x" })).status).toBe(403);
    expect(outbox.last(email)).toBeUndefined();
  });

  it("sends through Email Sending's binding, which runs here with no account (B-pvye0)", async () => {
    await expect(bindingMailer(env.EMAIL, env.EMAIL_FROM).send(mails.signupCode("someone@example.test", "123456", ORIGIN))).resolves.toBeUndefined();
  });

  it("gives the website what it needs to show sign-up: the relying party, Turnstile's site key, whether Globus is on, and web push's key", async () => {
    const r = await new Browser().get("/v1/config");
    expect(r.body).toEqual({ origin: ORIGIN, rp_id: env.SERVICE_RP_ID, turnstile_site_key: env.TURNSTILE_SITE_KEY, globus: true, vapid_public_key: expect.stringMatching(/^[A-Za-z0-9_-]{87}$/) });
  });
});
