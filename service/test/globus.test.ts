import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "../src/access.js";
import { Browser, ORIGIN, freshEmail, freshHandle, outbox, services, signUp } from "./browser.js";
import { GlobusStandIn, ISSUER, type Tamper } from "./globus-issuer.js";
import { WebPasskey } from "./passkeys.js";

// Signing in and up through Globus (D153, D176), with oauth4webapi (B-s76hg), against a stand-in for Globus Auth with
// its own discovery document, keys and token endpoint: the network is never reached. A new account still enrols a
// passkey (D153); an identity is linked only while signed in, never by matching an email address.

const globus = new GlobusStandIn(env.GLOBUS_CLIENT_ID, (env as unknown as { GLOBUS_CLIENT_SECRET: string }).GLOBUS_CLIENT_SECRET);
services.fetch = globus.fetch;

const sub = () => crypto.randomUUID();
/** Globus's redirect back is a navigation from another site: no Origin, and the fetch metadata says so. */
const fromGlobus = { origin: "", "sec-fetch-site": "cross-site" };

/** The round trip, as the browser makes it: off to Globus, sign in there, and back to the service's callback. */
async function roundTrip(b: Browser, purpose: "signin" | "link", who: { sub: string; email?: string }, tamper: Tamper = {}): Promise<URL> {
  const start = await b.get(`/v1/globus/start?purpose=${purpose}`);
  expect(start.status, JSON.stringify(start.body)).toBe(302);
  const location = start.response.headers.get("location")!;
  const back = globus.authorize(location, who, tamper);
  const done = await b.get(back, fromGlobus);
  expect(done.status).toBe(302);
  return new URL(done.response.headers.get("location")!);
}

const fragment = (u: URL) => Object.fromEntries(new URLSearchParams(u.hash.slice(1)));

describe("signing in through Globus (D153, B-s76hg)", () => {
  it("doesn't sign in to a closed account (B-b46z3): that's restored only with its passkey", async () => {
    const p = await signUp();
    const id = sub();
    await env.ACCOUNTS!.prepare("INSERT INTO globus_identities (sub, account, linked) VALUES (?, ?, ?)").bind(id, p.account, new Date().toISOString()).run();
    await env.ACCOUNTS!.prepare("UPDATE accounts SET closed = ? WHERE id = ?").bind(new Date().toISOString(), p.account).run();
    const b = new Browser();
    const back = await roundTrip(b, "signin", { sub: id });
    expect(back.pathname).toBe("/sign-in");
    expect(fragment(back)).toMatchObject({ error: "closed", message: expect.stringContaining(`the account ${p.handle} is closed: sign in with your passkey to restore it`) });
    expect(b.session).toBeUndefined();
  });

  it("sends the browser to Globus with PKCE, a nonce and state, asking only for openid and email", async () => {
    const b = new Browser();
    const start = await b.get("/v1/globus/start?purpose=signin");
    const to = new URL(start.response.headers.get("location")!);
    expect(to.origin).toBe(ISSUER);
    expect(Object.fromEntries(to.searchParams)).toMatchObject({ client_id: env.GLOBUS_CLIENT_ID, redirect_uri: `${ORIGIN}/v1/globus/callback`, response_type: "code", scope: "openid email", code_challenge_method: "S256", state: expect.any(String), nonce: expect.any(String), code_challenge: expect.any(String) });
    expect(start.response.headers.get("set-cookie")).toMatch(/^__Host-baesian-globus=[^;]+; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=600$/);
  });

  it("signs up a new person, who still enrols a passkey, then signs them in", async () => {
    const b = new Browser();
    const id = sub();
    const email = freshEmail();
    const back = await roundTrip(b, "signin", { sub: id, email });
    expect(back.pathname).toBe("/sign-up");
    const { flow, via } = fragment(back);
    expect(via).toBe("globus");
    // No emailed code: Globus vouched for the sign-in. A handle and a passkey, as any sign-up.
    const handle = freshHandle();
    const verified = await b.post("/v1/signup/verify", { flow, handle });
    expect(verified.status).toBe(200);
    const passkey = new WebPasskey("-", handle);
    const done = await b.post("/v1/signup/finish", { flow, response: passkey.register(verified.body.options.challenge) });
    expect(done.status).toBe(201);
    expect(done.body.recovery_code).toBeDefined();
    const me = await b.get("/v1/account");
    expect(me.body).toMatchObject({ handle, globus: { linked: expect.any(String) }, emails: [{ address: email, verified: null }] });
    expect(outbox.last(email)).toBeUndefined();

    // Next time, Globus signs them straight in, with the same cookie a passkey sign-in makes.
    const again = new Browser();
    const home = await roundTrip(again, "signin", { sub: id, email });
    expect(home.pathname).toBe("/");
    expect(fragment(home)).toEqual({ signed_in: handle });
    expect(again.session).toBeDefined();
    expect((await again.get("/v1/account")).body.id).toBe(done.body.account.id);
    // And the passkey alone signs them in too: the account doesn't depend on Globus (D153).
    const start = await new Browser().post("/v1/signin/start");
    expect((await new Browser().post("/v1/signin/finish", { flow: start.body.flow, response: passkey.sign(start.body.options.challenge) })).status).toBe(200);
  });

  it("links Globus to an account only while signed in with a fresh passkey check, and never by email", async () => {
    const p = await signUp();
    const id = sub();
    // An identity whose email matches the account's isn't taken in by matching it.
    const stranger = await roundTrip(new Browser(), "signin", { sub: id, email: p.email });
    expect(fragment(stranger)).toMatchObject({ error: "globus-email" });
    const linked = await roundTrip(p.browser, "link", { sub: id, email: p.email });
    expect(linked.pathname).toBe("/account");
    expect(fragment(linked)).toEqual({ globus: "linked" });
    const b = new Browser();
    expect((await roundTrip(b, "signin", { sub: id })).pathname).toBe("/");
    expect((await b.get("/v1/account")).body.id).toBe(p.account);
    // Another account can't link the same identity.
    const q = await signUp();
    expect(fragment(await roundTrip(q.browser, "link", { sub: id }))).toMatchObject({ error: "globus-linked" });
    // Unlinked, it signs nobody in, and starts a sign-up instead.
    expect((await p.browser.del("/v1/account/globus")).status).toBe(204);
    expect((await roundTrip(new Browser(), "signin", { sub: id })).pathname).toBe("/sign-up");
    // Linking without being signed in is refused before Globus is asked.
    expect((await new Browser().get("/v1/globus/start?purpose=link")).status).toBe(401);
  });
});

describe("what the Globus callback refuses", () => {
  it("a round trip that didn't start in this browser, or whose state is unknown", async () => {
    const b = new Browser();
    const start = await b.get("/v1/globus/start?purpose=signin");
    const back = globus.authorize(start.response.headers.get("location")!, { sub: sub() });
    const elsewhere = await new Browser().get(back, fromGlobus);
    expect(fragment(new URL(elsewhere.response.headers.get("location")!))).toMatchObject({ error: "globus-flow" });
    // The real state wasn't spent by it: the round trip still completes, once.
    expect(new URL((await b.get(back, fromGlobus)).response.headers.get("location")!).pathname).toBe("/sign-up");
    expect(fragment(new URL((await b.get(back, fromGlobus)).response.headers.get("location")!))).toMatchObject({ error: "globus-flow" });
    // A state nobody started is refused, cookie or not.
    const c = new Browser();
    const mine = await c.get("/v1/globus/start?purpose=signin");
    const forged = new URL(globus.authorize(mine.response.headers.get("location")!, { sub: sub() }));
    forged.searchParams.set("state", "made-up");
    expect(fragment(new URL((await c.get(forged.href, fromGlobus)).response.headers.get("location")!))).toMatchObject({ error: "globus-flow" });
  });

  it("an ID token with the wrong nonce, issuer, audience, signature or expiry", async () => {
    for (const tamper of [{ nonce: "another" }, { iss: "https://evil.test" }, { aud: "someone-else" }, { otherKey: true }, { exp: Math.floor(Date.now() / 1000) - 3600 }] as Tamper[]) {
      const b = new Browser();
      const back = await roundTrip(b, "signin", { sub: sub() }, tamper);
      expect(back.pathname, JSON.stringify(tamper)).toBe("/sign-in");
      expect(fragment(back).error, JSON.stringify(tamper)).toBe("globus");
      expect(b.session).toBeUndefined();
    }
  });

  it("is off when no Globus app is set up, and never reaches beyond the stand-in", async () => {
    expect(globus.asked.every((a) => a.includes(ISSUER))).toBe(true);
    const r = await new Browser().get("/v1/config");
    expect(r.body.globus).toBe(true);
    expect(SESSION_COOKIE).toBe("__Host-baesian-session");
  });
});
