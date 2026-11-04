import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { Accounts, LIMITS } from "../src/accounts.js";
import { hashOf } from "../src/secret.js";
import { call } from "./client.js";
import { Browser, machineLogin, oauth, reauth, signUp } from "./browser.js";

// A machine's sign-in (B-84e0d, B-t5wxr): RFC 8628's device flow, approved by a person signed in with a fresh passkey
// check, a grant for one machine and one project, tokens that rotate (RFC 9700) and revocation (RFC 7009); and the
// relay taking the grant's token (Hosted Service section 3).

const DEVICE = "urn:ietf:params:oauth:grant-type:device_code";
const asMachine = (access: string) => ({ headers: { authorization: `Bearer ${access}` } });
let n = 0;
const project = () => `proj-m${Date.now().toString(36)}${n++}`;

describe("a machine signs in (RFC 8628)", () => {
  it("asks, waits, is approved by a person, and gets a grant for one project that the relay takes", async () => {
    const p = await signUp();
    const proj = project();
    const d = await oauth("/v1/machines/device", { client_id: "baesian-cli", project: proj, machine: "spark-7" });
    expect(d.body).toEqual({ device_code: expect.any(String), user_code: expect.stringMatching(/^[B-Z]{4}-[B-Z]{4}$/), verification_uri: `${env.SERVICE_ORIGIN}/device`, verification_uri_complete: `${env.SERVICE_ORIGIN}/device?code=${d.body.user_code}`, expires_in: 600, interval: 5 });
    const poll = () => oauth("/v1/machines/token", { client_id: "baesian-cli", grant_type: DEVICE, device_code: d.body.device_code });
    expect((await poll()).body.error).toBe("authorization_pending");
    expect((await poll()).body.error).toBe("slow_down");

    // The approval page shows what's asked, then approving asks for the passkey afresh.
    const shown = await p.browser.get(`/v1/account/machines/approve?code=${d.body.user_code.toLowerCase().replace("-", "")}`);
    expect(shown.body).toMatchObject({ machine: "spark-7", project: proj, new_project: true, yours: true });
    await env.ACCOUNTS.prepare("UPDATE sessions SET verified = ? WHERE hash = ?").bind(new Date(Date.now() - LIMITS.freshMs - 1000).toISOString(), hashOf(p.browser.session!)).run();
    // A new project is named by the person approving its first machine (B-zqkwk): with no name, nothing is approved.
    expect((await p.browser.post("/v1/account/machines/approve", { code: d.body.user_code, approve: true })).body).toMatchObject({ needs_name: true, error: expect.stringMatching(/makes a new project: give it a name/) });
    expect((await p.browser.post("/v1/account/machines/approve", { code: d.body.user_code, approve: true, name: " \u0007 " })).body.needs_name).toBe(true);
    expect((await p.browser.post("/v1/account/machines/approve", { code: d.body.user_code, approve: true, name: "x".repeat(61) })).body.needs_name).toBe(true);
    expect((await p.browser.post("/v1/account/machines/approve", { code: d.body.user_code, approve: true, name: "Bakery  shop" })).body.reauth).toBe(true);
    await reauth(p);
    expect((await p.browser.post("/v1/account/machines/approve", { code: d.body.user_code, approve: true, name: "Bakery  shop" })).body).toMatchObject({ approved: true, new_project: true, name: "Bakery shop" });

    await env.ACCOUNTS.prepare("UPDATE device_codes SET last_poll = NULL WHERE user_code = ?").bind(d.body.user_code).run();
    const t = await poll();
    expect(t.body).toMatchObject({ token_type: "Bearer", expires_in: 3600, project: proj, machine: "spark-7", access_token: expect.any(String), refresh_token: expect.any(String) });
    expect((await poll()).body.error).toBe("invalid_grant");

    // The relay takes the token for its project, and for nothing else.
    expect((await call("GET", "state", { as: asMachine(t.body.access_token), project: proj })).status).toBe(200);
    expect((await call("GET", "state", { as: asMachine(t.body.access_token), project: "proj-a" })).status).toBe(403);
    expect((await call("POST", "verdicts", { as: asMachine(t.body.access_token), project: proj, json: {} })).status).toBe(403);
    // The project is the person's now: their session reaches it, and the Machines page lists the machine.
    expect((await call("GET", "state", { as: { headers: { cookie: `__Host-baesian-session=${p.browser.session}`, origin: env.SERVICE_ORIGIN } }, project: proj })).status).toBe(200);
    expect((await p.browser.get("/v1/account/machines")).body.machines).toEqual([{ id: t.body.grant, machine: "spark-7", project: proj, project_name: "Bakery shop", created: expect.any(String), last_used: expect.any(String) }]);
    expect((await p.browser.get("/v1/account")).body.projects).toEqual([{ id: proj, name: "Bakery shop", created: expect.any(String) }]);

    // Another machine for the project asks no name, and the approval page gives the one it has.
    const second = await oauth("/v1/machines/device", { client_id: "baesian-cli", project: proj, machine: "spark-8" });
    expect((await p.browser.get(`/v1/account/machines/approve?code=${second.body.user_code}`)).body).toMatchObject({ new_project: false, yours: true, name: "Bakery shop" });
    expect((await p.browser.post("/v1/account/machines/approve", { code: second.body.user_code, approve: true })).body).toMatchObject({ approved: true, new_project: false, name: "Bakery shop" });
  });

  it("names a project on the service, and only its owner renames it (B-zqkwk)", async () => {
    const p = await signUp();
    const q = await signUp();
    const proj = project();
    await machineLogin(p, proj);
    const rename = (who: typeof p, name: unknown) => who.browser.request("PATCH", `/v1/account/projects/${proj}`, { json: { name } });
    expect((await rename(p, "")).status).toBe(400);
    const r = await rename(p, "  The  bakery ");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ id: proj, name: "The bakery" });
    expect((await p.browser.get("/v1/account")).body.projects).toEqual([{ id: proj, name: "The bakery", created: expect.any(String) }]);
    // Someone else's project isn't renamed; nor is it renamed from another site.
    expect((await rename(q, "Mine now")).status).toBe(404);
    expect((await p.browser.request("PATCH", `/v1/account/projects/${proj}`, { json: { name: "Elsewhere" }, headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } })).status).toBe(403);
    expect((await p.browser.get("/v1/account")).body.projects[0].name).toBe("The bakery");
  });

  it("is refused by a person, or expires, and can't be approved into someone else's project", async () => {
    const p = await signUp();
    const q = await signUp();
    const proj = project();
    await machineLogin(p, proj);
    const d = await oauth("/v1/machines/device", { client_id: "baesian-cli", project: proj, machine: "theirs" });
    await reauth(q);
    const r = await q.browser.post("/v1/account/machines/approve", { code: d.body.user_code, approve: true });
    expect(r).toMatchObject({ status: 409, body: { error: expect.stringMatching(/belongs to another account/) } });
    expect((await q.browser.get(`/v1/account/machines/approve?code=${d.body.user_code}`)).body.yours).toBe(false);
    expect((await q.browser.post("/v1/account/machines/approve", { code: d.body.user_code, approve: false })).body.approved).toBe(false);
    expect((await oauth("/v1/machines/token", { client_id: "baesian-cli", grant_type: DEVICE, device_code: d.body.device_code })).body.error).toBe("access_denied");

    const late = await oauth("/v1/machines/device", { client_id: "baesian-cli", project: proj, machine: "slow" });
    await env.ACCOUNTS.prepare("UPDATE device_codes SET expires = ? WHERE user_code = ?").bind(new Date(Date.now() - 1000).toISOString(), late.body.user_code).run();
    expect((await oauth("/v1/machines/token", { client_id: "baesian-cli", grant_type: DEVICE, device_code: late.body.device_code })).body.error).toBe("expired_token");
    expect((await p.browser.get(`/v1/account/machines/approve?code=${late.body.user_code}`)).status).toBe(404);
  });

  it("speaks OAuth: form-encoded requests, its client, its grant types and its errors", async () => {
    expect((await oauth("/v1/machines/device", { client_id: "someone-else", project: "proj-x", machine: "m" })).body.error).toBe("invalid_client");
    expect((await oauth("/v1/machines/device", { client_id: "baesian-cli", project: "not a project", machine: "m" })).body.error).toBe("invalid_request");
    expect((await oauth("/v1/machines/token", { client_id: "baesian-cli", grant_type: "password" })).body.error).toBe("unsupported_grant_type");
    expect((await oauth("/v1/machines/token", { client_id: "baesian-cli", grant_type: DEVICE, device_code: "nothing" })).body.error).toBe("invalid_grant");
    const json = await new Browser().post("/v1/machines/token", { client_id: "baesian-cli" });
    expect(json).toMatchObject({ status: 400, body: { error: "invalid_request" } });
  });
});

describe("a machine's tokens (RFC 6749, RFC 9700, RFC 7009)", () => {
  it("refreshes, each refresh token once: one used again revokes the grant", async () => {
    const p = await signUp();
    const proj = project();
    const first = await machineLogin(p, proj);
    const r1 = await oauth("/v1/machines/token", { client_id: "baesian-cli", grant_type: "refresh_token", refresh_token: first.refresh });
    expect(r1.status).toBe(200);
    expect(r1.body.refresh_token).not.toBe(first.refresh);
    expect((await call("GET", "state", { as: asMachine(first.access), project: proj })).status).toBe(401);
    expect((await call("GET", "state", { as: asMachine(r1.body.access_token), project: proj })).status).toBe(200);
    // The old refresh token again: someone has a copy, so the grant ends, for whoever holds the newer tokens too.
    const reused = await oauth("/v1/machines/token", { client_id: "baesian-cli", grant_type: "refresh_token", refresh_token: first.refresh });
    expect(reused.body).toMatchObject({ error: "invalid_grant", error_description: expect.stringMatching(/used already, so the grant is revoked/) });
    expect((await call("GET", "state", { as: asMachine(r1.body.access_token), project: proj })).status).toBe(401);
    expect((await oauth("/v1/machines/token", { client_id: "baesian-cli", grant_type: "refresh_token", refresh_token: r1.body.refresh_token })).body.error).toBe("invalid_grant");
  });

  it("expires its access token after an hour, and lapses after 30 days unused", async () => {
    const p = await signUp();
    const proj = project();
    const t = await machineLogin(p, proj);
    let now = Date.now();
    const later = new Accounts(env.ACCOUNTS, () => new Date(now));
    now += LIMITS.accessMs + 1000;
    expect(await later.grantByAccess(t.access)).toBeUndefined();
    now += LIMITS.grantIdleMs;
    expect(await later.refresh(t.refresh)).toMatchObject({ error: "invalid_grant", why: expect.stringMatching(/lapsed/) });
  });

  it("is revoked by baesian logout (RFC 7009), or from the Machines page", async () => {
    const p = await signUp();
    const proj = project();
    const a = await machineLogin(p, proj, "one");
    expect((await oauth("/v1/machines/revoke", { token: a.refresh })).status).toBe(200);
    expect((await call("GET", "state", { as: asMachine(a.access), project: proj })).status).toBe(401);
    expect((await oauth("/v1/machines/revoke", { token: "not-a-token" })).status).toBe(200);
    const b = await machineLogin(p, proj, "two");
    expect((await p.browser.del(`/v1/account/machines/${b.grant}`)).status).toBe(204);
    expect((await call("GET", "state", { as: asMachine(b.access), project: proj })).status).toBe(401);
    expect((await p.browser.get("/v1/account/machines")).body.machines).toEqual([]);
  });
});

describe("a person's session on the relay (Hosted Service section 3)", () => {
  it("reaches only projects its account owns, and only from the site's own pages", async () => {
    const p = await signUp();
    const q = await signUp();
    const proj = project();
    await machineLogin(p, proj);
    const as = (who: typeof p, more: Record<string, string> = {}) => ({ headers: { cookie: `__Host-baesian-session=${who.browser.session}`, origin: env.SERVICE_ORIGIN, ...more } });
    expect((await call("GET", "state", { as: as(p), project: proj })).status).toBe(200);
    const theirs = await call("GET", "state", { as: as(q), project: proj });
    expect(theirs.status).toBe(403);
    expect(((await theirs.json()) as { error: string }).error).toMatch(/isn't a member/);
    expect((await call("GET", "state", { as: as(p, { "sec-fetch-site": "cross-site" }), project: proj })).status).toBe(403);
    expect((await call("POST", "presence", { as: as(p, { origin: "https://evil.test" }), project: proj, json: {} })).status).toBe(403);
    expect((await call("POST", "presence", { as: { headers: { cookie: `__Host-baesian-session=${p.browser.session}` } }, project: proj, json: {} })).status).toBe(403);
    expect((await call("POST", "presence", { as: as(p), project: proj, json: {} })).status).toBe(204);
    expect((await call("GET", "live", { as: as(p, { origin: "https://evil.test", upgrade: "websocket" }), project: proj })).status).toBe(403);
  });
});
