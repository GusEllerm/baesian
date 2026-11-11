import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import type { PasskeyKey } from "../../src/schema.js";
import { type Account, type Accounts, type Flow, HANDLE, LIMITS, PROJECT_NAME_MAX, type PushSubscriptionRow, type Session, Taken, normalEmail, projectName } from "./accounts.js";
import { SESSION_COOKIE, clearCookie, cookie, crossSite, sessionCookie } from "./access.js";
import { closeAccount, deletesAt, restoreAccount } from "./deletion.js";
import { type GlobusConfig, authorizationUrl, identityFrom, newRoundTrip, whyNot } from "./globus.js";
import { addressOf, browserName, fail, readObject, respond } from "./http.js";
import { type Mailer, mails } from "./mail.js";
import { readSubscription } from "./push.js";
import type { Usage } from "./usage.js";
import { emailCode, hashOf, idWith, normalRecoveryCode, normalUserCode, recoveryCode, same, token } from "./secret.js";
import type { Turnstile } from "./turnstile.js";
import { type NewPasskey, type RelyingParty, type StoredPasskey, authenticationOptions, keyFile, passkeyName, pinLine, registrationOptions, verifyAssertion, verifyRegistration } from "./webauthn.js";

// Accounts and sign-in for the website (M9c), as JSON for its pages (M9e) to call: sign up with an email and a passkey
// (D153), sign in with a passkey, get back in with an emailed code and a saved recovery code (B-jzgy4), through Globus
// (D153, D176), and, signed in, the account: passkeys, sign-ins, machines, signing out, and deleting it, which closes it
// for 14 days first (B-b46z3, M9f). Every address here is listed in docs/vault/Modules/service.md.

/** What the account addresses work with, made once per request by the Worker. */
export interface SignIn {
  accounts: Accounts;
  rp: RelyingParty;
  mail: Mailer;
  turnstile: Turnstile;
  /** Turnstile's site key, for the website's widget (`GET /v1/config`). */
  turnstileSiteKey: string;
  /** Limits per network address and per email address (B-mz6qc); true when the request may go on. */
  limit: { address(key: string): Promise<boolean>; email(key: string): Promise<boolean> };
  /** Sign-in through Globus, when it's set up. */
  globus: GlobusConfig | undefined;
  /** Put an account's passkeys' key files into one of its projects, signed (P16 section 7). */
  putKeys(project: string, keys: PasskeyKey[]): Promise<void>;
  /** Tell a project's relay that a member has left it (P20): the cards sent to them are the owners' again. */
  memberGone(project: string, account: string): Promise<void>;
  /** Web push (M9e step 2): the VAPID key's public half, for browsers to subscribe with, if the service has the key. */
  vapidPublicKey: string | undefined;
  /** Whether a subscription may name the stand-in push service (a local run, or a test). */
  testPush: boolean;
  /** Usage counts (D141, B-7nq85). */
  usage: Usage | undefined;
}

const GLOBUS_COOKIE = "__Host-baesian-globus";

/** A flow's secret and the browser's response, from a request's JSON. */
const isText = (x: unknown): x is string => typeof x === "string" && x.length > 0 && x.length <= 4096;
const isCredential = (x: unknown): x is { id: string; response: object } => typeof x === "object" && x !== null && isText((x as { id?: unknown }).id) && typeof (x as { response?: unknown }).response === "object";

/** The account's passkeys' key files, as each of its projects holds them, with the line CI pins (D159). */
async function keysOf(s: SignIn, account: Account): Promise<PasskeyKey[]> {
  return (await s.accounts.passkeys(account.id)).map((p) => keyFile(p, account.id, account.handle));
}

/** Put the account's key files into every project it's a member of. A failure is logged: an answer that needs a key puts it there again. */
async function spreadKeys(s: SignIn, account: Account): Promise<void> {
  const keys = await keysOf(s, account);
  for (const p of await s.accounts.projectsOf(account.id)) {
    try {
      await s.putKeys(p.id, keys);
    } catch (e) {
      console.error(`putting ${account.id}'s passkey keys into project ${p.id} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

/** What a new passkey's enrolment answers: its ID and its name. Its line for CI is on the account, any time (B-yj5d5). */
const enrolled = (p: Pick<StoredPasskey, "credential" | "name">) => ({ credential: p.credential, name: p.name });

/** A passkey as the account lists it: with the line CI pins for it (D159), from what's stored, any time (B-yj5d5). */
const listed = (p: StoredPasskey, account: Account) => ({ ...enrolled(p), pin: pinLine(keyFile(p, account.id, account.handle)), enrolled: p.enrolled, last_used: p.last_used });

/** A new sign-in, as a reply with its cookie. */
async function signedIn(s: SignIn, request: Request, account: Account, status: number, body: Record<string, unknown>): Promise<Response> {
  const { token: t } = await s.accounts.startSession(account.id, browserName(request.headers.get("user-agent")));
  return respond({ status, body: { account: { id: account.id, handle: account.handle }, ...body } }, [["set-cookie", sessionCookie(t)]]);
}

/** Refused before anything else: a request from another site, or over the limit for its address. */
async function guard(s: SignIn, request: Request): Promise<Response | undefined> {
  const cross = crossSite(request, s.rp.origin);
  if (cross) return fail(403, cross);
  if (request.headers.has("authorization")) return fail(403, "sign-in is for a person in a browser: a request with an Authorization header is refused");
  if (!(await s.limit.address(addressOf(request)))) return fail(429, "too many requests from this network: wait a minute");
  return undefined;
}

/** The code-sending step shared by sign-up and recovery: the bot check, the limits per address, and the flow. */
async function sendCode(s: SignIn, request: Request, kind: "signup" | "recover"): Promise<Response> {
  const input = await readObject(request);
  if (input instanceof Response) return input;
  const email = normalEmail(input.email);
  if (!email) return fail(400, "give an email address");
  const bot = await s.turnstile.check(input.turnstile, addressOf(request));
  if (!bot.ok) return fail(403, bot.why);
  if (!(await s.limit.email(email))) return fail(429, "too many codes to this address: wait a minute");
  const sent = await s.accounts.codesSent(email);
  if (sent.hour >= LIMITS.codesPerHour || sent.day >= LIMITS.codesPerDay) return fail(429, `too many codes to this address: at most ${LIMITS.codesPerHour} an hour and ${LIMITS.codesPerDay} a day`);
  const account = await s.accounts.accountByEmail(email);
  const code = emailCode();
  // A closed account (B-b46z3) is restored only with its passkey: getting back in treats it as no account.
  const recoverable = !!account && !account.closed;
  // The reply is the same whether the address has an account or not, so nobody learns which addresses do.
  const real = kind === "signup" ? !account : recoverable;
  const flow = await s.accounts.startFlow(kind, { email, account: kind === "recover" && recoverable ? account!.id : null, code_hash: real ? hashOf(code) : hashOf(token()) }, LIMITS.codeMs);
  if (kind === "signup") await s.mail.send(account ? mails.alreadySignedUp(email, s.rp.origin) : mails.signupCode(email, code, s.rp.origin));
  else if (recoverable) await s.mail.send(mails.recoveryCode(email, code, s.rp.origin));
  return respond({ status: 202, body: { flow, expires_in: LIMITS.codeMs / 1000 } });
}

/** A code typed against a flow, counted; or the response refusing it. */
async function checkCode(s: SignIn, f: Flow, ok: () => Promise<boolean> | boolean): Promise<Response | undefined> {
  const r = await s.accounts.tryCode(f, ok);
  if (r.ok) return undefined;
  return r.left ? fail(400, kind(f) === "recover" ? "those codes don't match" : "that code isn't right", { attempts_left: r.left }) : fail(400, `this ${kind(f) === "recover" ? "recovery" : "sign-up"} has no tries left: ask for a new code`, { attempts_left: 0 });
}
const kind = (f: Flow) => f.kind;

/** A registration the browser returned for a flow, checked, or the response refusing it. */
async function registered(s: SignIn, f: Flow, response: unknown): Promise<NewPasskey | Response> {
  if (!f.challenge) return fail(400, "this flow asked for no passkey yet");
  if (!isCredential(response)) return fail(400, "send the passkey's registration as `response`, as the browser returned it");
  try {
    return await verifyRegistration(s.rp, response as RegistrationResponseJSON, f.challenge);
  } catch (e) {
    return fail(400, `the passkey couldn't be enrolled: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** An assertion the browser returned, checked against a challenge and one of the passkeys allowed, or the response refusing it. */
async function asserted(s: SignIn, challenge: string | null, response: unknown, account?: string): Promise<{ passkey: StoredPasskey } | Response> {
  if (!challenge) return fail(400, "this flow has no challenge");
  if (!isCredential(response)) return fail(400, "send the passkey's assertion as `response`, as the browser returned it");
  const passkey = await s.accounts.passkey(response.id);
  if (!passkey || (account && passkey.account !== account)) return fail(400, "that passkey isn't enrolled here");
  try {
    await s.accounts.usePasskey(passkey.credential, await verifyAssertion(s.rp, response as AuthenticationResponseJSON, challenge, passkey));
  } catch (e) {
    return fail(400, `the passkey's signature doesn't check: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { passkey };
}

/** The signed-in person, or the response refusing the request: a session cookie that's good, from the site's own pages. */
async function session(s: SignIn, request: Request) {
  const cross = crossSite(request, s.rp.origin);
  if (cross) return fail(403, cross);
  if (request.headers.has("authorization")) return fail(403, "the account is a person's, in a browser: a request with an Authorization header is refused");
  const ses = await s.accounts.session(cookie(request, SESSION_COOKIE));
  if (!ses) return fail(401, "not signed in");
  const account = (await s.accounts.account(ses.account))!;
  return { ses, account };
}

// ---------------------------------------------------------------- the addresses

/** The account addresses: `/v1/signup/…`, `/v1/signin/…`, `/v1/recover/…`, `/v1/globus/…`, `/v1/account…` and `/v1/config`. */
export async function signInRoute(s: SignIn, request: Request, url: URL): Promise<Response | undefined> {
  const path = url.pathname;
  const m = request.method;
  if (path === "/v1/config" && m === "GET") return respond({ status: 200, body: { origin: s.rp.origin, rp_id: s.rp.rpID, turnstile_site_key: s.turnstileSiteKey, globus: !!s.globus, vapid_public_key: s.vapidPublicKey ?? null } });
  if (path.startsWith("/v1/globus/") && m === "GET") return globusRoute(s, request, url);
  if (path.startsWith("/v1/account")) return accountRoute(s, request, path, m, url);
  const flows: Record<string, (r: Request) => Promise<Response>> = {
    "/v1/signup/email": (r) => sendCode(s, r, "signup"),
    "/v1/signup/verify": (r) => signupVerify(s, r),
    "/v1/signup/finish": (r) => signupFinish(s, r),
    "/v1/signin/start": (r) => signinStart(s, r),
    "/v1/signin/finish": (r) => signinFinish(s, r),
    "/v1/signin/restore": (r) => signinRestore(s, r),
    "/v1/recover/email": (r) => sendCode(s, r, "recover"),
    "/v1/recover/verify": (r) => recoverVerify(s, r),
    "/v1/recover/finish": (r) => recoverFinish(s, r),
  };
  const handler = flows[path];
  if (!handler) return undefined;
  if (m !== "POST") return fail(405, `${path} takes a POST`);
  const refused = await guard(s, request);
  return refused ?? handler(request);
}

/** Sign-up, step 2: the emailed code (unless Globus vouched for the address), and a handle; returns the passkey's options. */
async function signupVerify(s: SignIn, request: Request): Promise<Response> {
  const input = await readObject(request);
  if (input instanceof Response) return input;
  const f = await s.accounts.flow(input.flow, "signup");
  if (!f) return fail(400, "no sign-up with that flow, or it expired: ask for a new code");
  if (!f.verified) {
    if (!isText(input.code)) return fail(400, "give the code from the email");
    const no = await checkCode(s, f, () => !!f.code_hash && same(f.code_hash, hashOf(String(input.code).trim())));
    if (no) return no;
  }
  if (typeof input.handle !== "string" || !HANDLE.test(input.handle)) return fail(400, "choose a handle: 2 to 32 letters, digits, dots, dashes and underscores", { verified: true });
  if (await s.accounts.handleTaken(input.handle)) return fail(409, `the handle ${input.handle} is taken: choose another`, { verified: true });
  const account = f.account ?? idWith("acct");
  const options = await registrationOptions(s.rp, { account, handle: input.handle });
  await s.accounts.updateFlow(f.id, { handle: input.handle, account, challenge: options.challenge, verified: 1 });
  return respond({ status: 200, body: { options } });
}

/** Sign-up, step 3: the passkey, enrolled; the account made, with a recovery code to keep, and signed in. */
async function signupFinish(s: SignIn, request: Request): Promise<Response> {
  const input = await readObject(request);
  if (input instanceof Response) return input;
  const f = await s.accounts.flow(input.flow, "signup");
  if (!f?.verified || !f.handle || !f.account) return fail(400, "no sign-up ready for a passkey with that flow: check the code and choose a handle first");
  const p = await registered(s, f, input.response);
  if (p instanceof Response) return p;
  if (!(await s.accounts.takeFlow(input.flow, "signup"))) return fail(409, "this sign-up was finished already");
  const recovery = recoveryCode();
  try {
    await s.accounts.createAccount({ id: f.account, handle: f.handle, email: f.email ? { address: f.email, verified: !f.globus_sub } : undefined, passkey: p, name: passkeyName(p.transports), recoveryHash: hashOf(recovery), globusSub: f.globus_sub ?? undefined });
  } catch (e) {
    if (e instanceof Taken) return fail(409, `${e.message}: start again`);
    throw e;
  }
  const account = (await s.accounts.account(f.account))!;
  const stored = (await s.accounts.passkey(p.credential))!;
  await s.usage?.record({ account: account.id }, "account_created", { via: f.globus_sub ? "globus" : "email" });
  return signedIn(s, request, account, 201, { recovery_code: recovery, passkey: enrolled(stored) });
}

/** Sign-in, step 1: a challenge for any passkey of this site's (a discoverable credential). */
async function signinStart(s: SignIn, _request: Request): Promise<Response> {
  const options = await authenticationOptions(s.rp, []);
  const flow = await s.accounts.startFlow("signin", { challenge: options.challenge }, LIMITS.ceremonyMs);
  return respond({ status: 200, body: { flow, options } });
}

/**
 * Sign-in, step 2: the passkey's assertion, checked; signed in. A closed account (B-b46z3) isn't signed in: the reply
 * (409, `closed`) says when it will be deleted, with a flow that restores it, for five minutes.
 */
async function signinFinish(s: SignIn, request: Request): Promise<Response> {
  const input = await readObject(request);
  if (input instanceof Response) return input;
  const f = await s.accounts.takeFlow(input.flow, "signin");
  if (!f) return fail(400, "no sign-in with that flow, or it expired: start again");
  const a = await asserted(s, f.challenge, input.response);
  if (a instanceof Response) return a;
  const account = (await s.accounts.account(a.passkey.account))!;
  if (account.closed) {
    const restore = await s.accounts.startFlow("restore", { account: account.id }, LIMITS.ceremonyMs);
    return fail(409, `the account ${account.handle} is closed, and will be deleted with everything in it on ${deletesAt(account.closed).slice(0, 10)}: restore it to keep it`, { closed: { handle: account.handle, deletes: deletesAt(account.closed) }, restore });
  }
  return signedIn(s, request, account, 200, {});
}

/** Restoring a closed account (B-b46z3): the flow its passkey's sign-in gave, once; open again, a notice sent, and signed in. */
async function signinRestore(s: SignIn, request: Request): Promise<Response> {
  const input = await readObject(request);
  if (input instanceof Response) return input;
  const f = await s.accounts.takeFlow(input.restore, "restore");
  const account = f?.account ? await s.accounts.account(f.account) : null;
  if (!account) return fail(400, "no restore with that flow, or it expired: sign in with your passkey again");
  if (account.closed && !(await restoreAccount(s.accounts, account, s.mail, s.rp.origin))) return fail(409, "this account was restored already");
  return signedIn(s, request, (await s.accounts.account(account.id))!, 200, { restored: true });
}

/** Recovery, step 2: the emailed code and the saved recovery code, together (B-jzgy4); returns a new passkey's options. */
async function recoverVerify(s: SignIn, request: Request): Promise<Response> {
  const input = await readObject(request);
  if (input instanceof Response) return input;
  const f = await s.accounts.flow(input.flow, "recover");
  if (!f) return fail(400, "no recovery with that flow, or it expired: ask for a new code");
  if (!f.verified) {
    if (!isText(input.code) || !isText(input.recovery_code)) return fail(400, "give the code from the email and the recovery code you saved, together");
    const saved = f.account ? await s.accounts.recoveryHash(f.account) : undefined;
    const no = await checkCode(s, f, () => {
      // Both are checked whatever the first says, and only together do they count.
      const email = !!f.code_hash && same(f.code_hash, hashOf(String(input.code).trim()));
      const kept = !!saved && same(saved, hashOf(normalRecoveryCode(String(input.recovery_code))));
      return !!f.account && email && kept;
    });
    if (no) return no;
  }
  const account = (await s.accounts.account(f.account!))!;
  const options = await registrationOptions(s.rp, { account: account.id, handle: account.handle }, await s.accounts.passkeys(account.id));
  await s.accounts.updateFlow(f.id, { challenge: options.challenge });
  return respond({ status: 200, body: { options } });
}

/**
 * Recovery, step 3: the new passkey, enrolled; a new recovery code issued, the old one spent; every other sign-in ended;
 * a notice sent; signed in.
 */
async function recoverFinish(s: SignIn, request: Request): Promise<Response> {
  const input = await readObject(request);
  if (input instanceof Response) return input;
  const f = await s.accounts.flow(input.flow, "recover");
  if (!f?.verified || !f.account) return fail(400, "no recovery ready for a passkey with that flow: check the codes first");
  const p = await registered(s, f, input.response);
  if (p instanceof Response) return p;
  if (!(await s.accounts.takeFlow(input.flow, "recover"))) return fail(409, "this recovery was finished already");
  const account = (await s.accounts.account(f.account))!;
  const recovery = recoveryCode();
  let stored: StoredPasskey;
  try {
    stored = await s.accounts.addPasskey(account.id, p, passkeyName(p.transports));
  } catch (e) {
    if (e instanceof Taken) return fail(409, e.message);
    throw e;
  }
  await s.accounts.db.batch([s.accounts.replaceRecovery(account.id, hashOf(recovery)), s.accounts.endSessions(account.id)]);
  for (const e of await s.accounts.emails(account.id)) await s.mail.send(mails.recovered(e.address, account.handle, s.rp.origin));
  await spreadKeys(s, account);
  return signedIn(s, request, account, 201, { recovery_code: recovery, passkey: enrolled(stored) });
}

// ---------------------------------------------------------------- signed in: the account

/**
 * A project's members (P20), under `/v1/account/projects/{project}/`. To any member: `GET members`, and `DELETE
 * members/{account}` for themselves, which is leaving. To its owners only (B-rxbss): `POST invites`, a link that adds one
 * person (B-jsady), with the passkey checked afresh; `DELETE invites`, cancelling the unused ones; `PATCH
 * members/{account}`, a role; and `DELETE members/{account}`, removing someone. A project that isn't the asker's is 404.
 */
async function membersRoute(s: SignIn, request: Request, m: string, tail: string[], ses: Session, account: Account): Promise<Response> {
  const [project, what, other] = tail as [string, string, string | undefined];
  const role = await s.accounts.role(account.id, project);
  if (!role || tail.length > 3) return fail(404, "no project of yours with that ID");
  const owners = "only a project's owners do that: ask one of them";
  if (what === "members" && other === undefined) {
    if (m !== "GET") return fail(405, "a project's members are read with GET");
    const p = (await s.accounts.project(project))!;
    const members = await s.accounts.members(project);
    return respond({
      status: 200,
      body: {
        project,
        name: p.name,
        role,
        // `you` marks the asker; `holds`, the account that made the project, which can't leave it.
        members: members.map((x) => ({ account: x.account, handle: x.handle, role: x.role, joined: x.joined, ...(x.account === account.id ? { you: true } : {}), ...(x.account === p.owner ? { holds: true } : {}) })),
        ...(role === "owner" ? { invites: await s.accounts.invites(project) } : {}),
      },
    });
  }
  if (what === "invites" && other === undefined) {
    if (role !== "owner") return fail(403, owners);
    if (m === "DELETE") return respond({ status: 200, body: { cancelled: await s.accounts.cancelInvites(project) } });
    if (m !== "POST") return fail(405, "a link is made with POST, and the unused ones cancelled with DELETE");
    if (!s.accounts.fresh(ses)) return fail(403, "making a link that adds a member asks for your passkey: check it with /v1/account/reauth, then try again", { reauth: true });
    const { code, expires } = await s.accounts.invite(project, account.id);
    // The code goes after the `#`, which a browser never sends to a server: it reaches the service only in the body of
    // the request that looks the link up or uses it, and is shown here once.
    return respond({ status: 201, body: { link: `${s.rp.origin}/join#${code}`, expires } });
  }
  if (what === "members" && other !== undefined) {
    if (m === "DELETE") {
      if (other !== account.id && role !== "owner") return fail(403, owners);
      const r = await s.accounts.removeMember(project, other);
      if (typeof r === "object") return fail(409, r.problem);
      if (!r) return fail(404, "no member of this project with that ID");
      // They're gone already; the relay's notes of them follow, and a failure there is logged, not theirs to see.
      try {
        await s.memberGone(project, other);
      } catch (e) {
        console.error(`telling project ${project} that ${other} left it failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      return respond({ status: 204 });
    }
    if (m === "PATCH") {
      if (role !== "owner") return fail(403, owners);
      const input = await readObject(request);
      if (input instanceof Response) return input;
      if (input.role !== "owner" && input.role !== "member") return fail(400, "a role is owner or member");
      if (!s.accounts.fresh(ses)) return fail(403, "changing who owns a project asks for your passkey: check it with /v1/account/reauth, then try again", { reauth: true });
      const r = await s.accounts.setRole(project, other, input.role);
      if (typeof r === "object") return fail(409, r.problem);
      return r ? respond({ status: 200, body: { account: other, role: input.role } }) : fail(404, "no member of this project with that ID");
    }
    return fail(405, "a member is removed with DELETE, and given a role with PATCH");
  }
  return fail(404, "no project of yours with that ID");
}

async function accountRoute(s: SignIn, request: Request, path: string, m: string, url: URL): Promise<Response> {
  const who = await session(s, request);
  if (who instanceof Response) return who;
  const { ses, account } = who;
  const route = `${m} ${path.replace(/^\/v1\/account/, "") || "/"}`;
  const tail = path.split("/").slice(4).map(decodeURIComponent);
  const body = async (): Promise<Record<string, unknown> | Response> => (m === "GET" || m === "DELETE" ? {} : readObject(request));
  if (route === "GET /") {
    // Read together: each is one trip to the accounts database, and none waits on another's answer.
    const [passkeys, globus, emails, projects, counted] = await Promise.all([
      s.accounts.passkeys(account.id),
      s.accounts.globusOf(account.id),
      s.accounts.emails(account.id),
      s.accounts.projectsOf(account.id),
      s.usage ? s.usage.counted(account.id) : false,
    ]);
    return respond({
      status: 200,
      body: {
        id: account.id,
        handle: account.handle,
        created: account.created,
        emails,
        passkeys: passkeys.map((p) => listed(p, account)),
        globus: globus ? { linked: globus.linked } : null,
        projects,
        fresh_until: new Date(Date.parse(ses.verified) + LIMITS.freshMs).toISOString(),
        usage: { counted },
      },
    });
  }
  if (route === "POST /reauth/start") {
    const options = await authenticationOptions(s.rp, await s.accounts.passkeys(account.id));
    return respond({ status: 200, body: { flow: await s.accounts.startFlow("fresh", { account: account.id, challenge: options.challenge }, LIMITS.ceremonyMs), options } });
  }
  if (route === "POST /reauth/finish") {
    const input = await body();
    if (input instanceof Response) return input;
    const f = await s.accounts.takeFlow(input.flow, "fresh");
    if (!f || f.account !== account.id) return fail(400, "no check with that flow, or it expired: start again");
    const a = await asserted(s, f.challenge, input.response, account.id);
    if (a instanceof Response) return a;
    await s.accounts.markFresh(ses.hash);
    return respond({ status: 200, body: { fresh_until: new Date(Date.now() + LIMITS.freshMs).toISOString() } });
  }
  if (route === "POST /passkeys/start") {
    if (!s.accounts.fresh(ses)) return fail(403, "adding a passkey asks for one you have first: check it with /v1/account/reauth, then try again", { reauth: true });
    const options = await registrationOptions(s.rp, { account: account.id, handle: account.handle }, await s.accounts.passkeys(account.id));
    return respond({ status: 200, body: { flow: await s.accounts.startFlow("enrol", { account: account.id, challenge: options.challenge }, LIMITS.ceremonyMs), options } });
  }
  if (route === "POST /passkeys/finish") {
    const input = await body();
    if (input instanceof Response) return input;
    const f = await s.accounts.takeFlow(input.flow, "enrol");
    if (!f || f.account !== account.id) return fail(400, "no enrolment with that flow, or it expired: start again");
    const p = await registered(s, f, input.response);
    if (p instanceof Response) return p;
    const name = typeof input.name === "string" && input.name.trim() && input.name.length <= 64 ? input.name.trim() : passkeyName(p.transports);
    let stored: StoredPasskey;
    try {
      stored = await s.accounts.addPasskey(account.id, p, name);
    } catch (e) {
      if (e instanceof Taken) return fail(409, e.message);
      throw e;
    }
    for (const e of await s.accounts.emails(account.id)) await s.mail.send(mails.passkeyAdded(e.address, account.handle, s.rp.origin));
    await spreadKeys(s, account);
    return respond({ status: 201, body: { passkey: enrolled(stored) } });
  }
  if (route === "GET /sessions") {
    const list = await s.accounts.sessions(account.id);
    return respond({ status: 200, body: { sessions: list.map((x) => ({ id: x.id, name: x.name, created: x.created, last_used: x.last_used, current: x.hash === ses.hash })) } });
  }
  if (m === "DELETE" && path.startsWith("/v1/account/sessions/") && tail.length === 1) {
    return (await s.accounts.endSession(account.id, tail[0]!)) ? respond({ status: 204 }, tail[0] === ses.id ? [["set-cookie", clearCookie(SESSION_COOKIE)]] : []) : fail(404, "no sign-in of yours with that ID");
  }
  if (route === "POST /signout") {
    const input = await body();
    if (input instanceof Response) return input;
    await (input.everywhere === true ? s.accounts.endSessions(account.id) : s.accounts.db.prepare("DELETE FROM sessions WHERE hash = ?").bind(ses.hash)).run();
    return respond({ status: 204 }, [["set-cookie", clearCookie(SESSION_COOKIE)]]);
  }
  if (route === "GET /machines") {
    const list = await s.accounts.grants(account.id);
    const names = new Map((await s.accounts.projectsOf(account.id)).map((p) => [p.id, p.name]));
    return respond({ status: 200, body: { machines: list.map((g) => ({ id: g.id, machine: g.machine, project: g.project, project_name: names.get(g.project) ?? null, created: g.created, last_used: g.last_used })) } });
  }
  if (m === "PATCH" && path.startsWith("/v1/account/projects/") && tail.length === 1) {
    const input = await readObject(request);
    if (input instanceof Response) return input;
    const name = projectName(input.name);
    if (!name) return fail(400, `give the project a name: 1 to ${PROJECT_NAME_MAX} characters`);
    return (await s.accounts.renameProject(account.id, tail[0]!, name)) ? respond({ status: 200, body: { id: tail[0], name } }) : fail(404, "no project of yours to rename with that ID: only a project's owners rename it");
  }
  // A project's members, and the links that add one (P20).
  if (path.startsWith("/v1/account/projects/") && tail.length >= 2 && (tail[1] === "members" || tail[1] === "invites")) return membersRoute(s, request, m, tail, ses, account);
  if (route === "POST /invites/look" || route === "POST /invites/accept") {
    const input = await body();
    if (input instanceof Response) return input;
    if (!isText(input.code)) return fail(400, "give the link's code: what follows the # in the link");
    if (route === "POST /invites/look") {
      const invite = await s.accounts.lookInvite(input.code);
      if (!invite) return fail(404, "this link doesn't work: it was used already, it expired, or it was cancelled. Ask one of the project's owners for a new one");
      return respond({ status: 200, body: { project: invite.project, name: invite.name, by: invite.by, expires: invite.expires, member: await s.accounts.member(account.id, invite.project) } });
    }
    const r = await s.accounts.acceptInvite(input.code, account.id);
    if ("problem" in r) return fail(404, r.problem);
    // A new member's passkeys' key files go into the project, so a hard answer of theirs can be proved there (P16 section 7).
    if (r.joined) {
      try {
        await s.putKeys(r.project, await keysOf(s, account));
      } catch (e) {
        console.error(`putting ${account.id}'s passkey keys into project ${r.project} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return respond({ status: 200, body: { project: r.project, name: r.name, joined: r.joined } });
  }
  if (m === "DELETE" && path.startsWith("/v1/account/machines/") && tail.length === 1) {
    return (await s.accounts.revoke(tail[0]!, account.id)) ? respond({ status: 204 }) : fail(404, "no machine of yours with that ID");
  }
  if (route === "GET /machines/approve") {
    const d = await s.accounts.deviceByUserCode(normalUserCode(url.searchParams.get("code") ?? ""));
    if (!d) return fail(404, "no machine is waiting with that code, or it expired");
    const p = await s.accounts.project(d.project);
    // Yours to approve a machine for: a new project, or one you're a member of (P20).
    const yours = !p || (await s.accounts.member(account.id, d.project));
    return respond({ status: 200, body: { machine: d.machine, project: d.project, new_project: !p, yours, ...(p && yours ? { name: p.name } : {}), expires: d.expires, can: "file cards and hear answers in this project; never answer" } });
  }
  if (route === "POST /machines/approve") {
    const input = await body();
    if (input instanceof Response) return input;
    const d = await s.accounts.deviceByUserCode(normalUserCode(String(input.code ?? "")));
    if (!d) return fail(404, "no machine is waiting with that code, or it expired");
    if (input.approve !== true) {
      await s.accounts.denyDevice(d);
      return respond({ status: 200, body: { approved: false } });
    }
    // A new project is named here, by the person approving its first machine (B-zqkwk): the CLI never sends a repo's name.
    const known = await s.accounts.project(d.project);
    const name = known ? undefined : projectName(input.name);
    if (!known && !name) return fail(400, `approving this machine makes a new project: give it a name, 1 to ${PROJECT_NAME_MAX} characters`, { needs_name: true });
    if (!s.accounts.fresh(ses)) return fail(403, "approving a machine asks for your passkey: check it with /v1/account/reauth, then try again", { reauth: true });
    const r = await s.accounts.approveDevice(d, account.id, name);
    if ("problem" in r) return fail(409, r.problem);
    await s.usage?.record({ account: account.id, project: d.project }, "machine_approved", { new_project: r.created });
    if (r.created) {
      try {
        await s.putKeys(d.project, await keysOf(s, account));
      } catch (e) {
        console.error(`putting ${account.id}'s passkey keys into new project ${d.project} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return respond({ status: 200, body: { approved: true, machine: d.machine, project: d.project, new_project: r.created, name: name ?? known?.name ?? null } });
  }
  // Web push (M9e step 2): the browsers that get notifications, one per account and browser; each removable.
  if (route === "GET /push") {
    return respond({ status: 200, body: { subscriptions: (await s.accounts.subscriptions(account.id)).map(subscriptionRow) } });
  }
  if (route === "POST /push") {
    if (!s.vapidPublicKey) return fail(503, "this service can't send notifications yet: it has no VAPID key");
    const input = await body();
    if (input instanceof Response) return input;
    const sub = readSubscription(input, s.testPush);
    if (typeof sub === "string") return fail(400, sub);
    const row = await s.accounts.subscribe(account.id, sub, browserName(request.headers.get("user-agent")));
    if ("problem" in row) return fail(409, row.problem);
    return respond({ status: 201, body: { subscription: subscriptionRow(row) } });
  }
  // A notification opened (the service worker says so): its minutes since it was shown, counted (B-7nq85).
  if (route === "POST /push/opened") {
    const input = await body();
    if (input instanceof Response) return input;
    const minutes = typeof input.minutes_after === "number" && Number.isFinite(input.minutes_after) ? Math.max(0, Math.round(input.minutes_after)) : undefined;
    if (minutes === undefined) return fail(400, "send { minutes_after, project }");
    const project = typeof input.project === "string" && (await s.accounts.member(account.id, input.project)) ? input.project : undefined;
    await s.usage?.record({ account: account.id, ...(project ? { project } : {}) }, "push_opened", { minutes_after: Math.min(minutes, 10_000_000) });
    return respond({ status: 204 });
  }
  // Usage counts (D141): counted unless the account opts out; out deletes its raw events at once.
  if (route === "POST /usage") {
    const input = await body();
    if (input instanceof Response) return input;
    if (typeof input.counted !== "boolean") return fail(400, "send { counted: true } or { counted: false }");
    if (!s.usage) return fail(503, "this service keeps no usage counts");
    await s.usage.setCounted(account.id, input.counted);
    return respond({ status: 200, body: { counted: input.counted } });
  }
  if (m === "DELETE" && path.startsWith("/v1/account/push/") && tail.length === 1) {
    return (await s.accounts.unsubscribe(account.id, tail[0]!)) ? respond({ status: 204 }) : fail(404, "no browser of yours gets notifications with that ID");
  }
  if (route === "DELETE /globus") {
    return (await s.accounts.unlinkGlobus(account.id)) ? respond({ status: 204 }) : fail(404, "no Globus identity is linked to this account");
  }
  // Deleting the account (B-b46z3): its passkey checked afresh and its handle typed out; closed at once, deleted 14 days on.
  if (route === "POST /delete") {
    const input = await body();
    if (input instanceof Response) return input;
    if (typeof input.handle !== "string" || input.handle.trim().toLowerCase() !== account.handle.toLowerCase()) return fail(400, `type your handle, ${account.handle}, to delete the account`, { needs_handle: true });
    if (!s.accounts.fresh(ses)) return fail(403, "deleting the account asks for your passkey: check it with /v1/account/reauth, then try again", { reauth: true });
    const { deletes } = await closeAccount(s.accounts, account, s.mail, s.rp.origin);
    return respond({ status: 200, body: { closed: true, deletes } }, [["set-cookie", clearCookie(SESSION_COOKIE)]]);
  }
  return fail(404, `no address ${m} ${path}`);
}

/**
 * A subscription as the account page lists it: its browser's name, its push service's host, when it was added and last
 * sent to, and `key`, the first 16 hex of its endpoint's SHA-256, so the page can tell which is this browser's without
 * the service handing endpoints back.
 */
const subscriptionRow = (r: PushSubscriptionRow) => ({ id: r.id, name: r.name, service: new URL(r.endpoint).hostname, key: hashOf(r.endpoint).slice(0, 16), created: r.created, last_sent: r.last_sent });

// ---------------------------------------------------------------- Globus (D153, D176, B-s76hg)

/** Where the browser goes after a Globus round trip: the website's own page, with what happened in the fragment. */
const back = (s: SignIn, page: string, fragment: Record<string, string>, cookies: string[] = []) => {
  const headers = new Headers({ location: `${s.rp.origin}${page}#${new URLSearchParams(fragment)}`, "cache-control": "no-store", "referrer-policy": "no-referrer" });
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(null, { status: 302, headers });
};

/**
 * `GET /v1/globus/start?purpose=signin|link`: off to Globus, with state, a nonce and PKCE, kept in a flow; the browser
 * holds the flow's secret in a short-lived cookie that's sent back on Globus's redirect (SameSite=Lax) and nowhere else.
 * Linking takes a session that checked its passkey recently. `GET /v1/globus/callback`: who Globus says it is, and then
 * signed in, sent to sign up, or linked.
 */
async function globusRoute(s: SignIn, request: Request, url: URL): Promise<Response> {
  if (!s.globus) return fail(404, "sign-in through Globus isn't set up on this service");
  if (!(await s.limit.address(addressOf(request)))) return fail(429, "too many requests from this network: wait a minute");
  if (url.pathname === "/v1/globus/start") {
    const purpose = url.searchParams.get("purpose") ?? "signin";
    if (purpose !== "signin" && purpose !== "link") return fail(400, "purpose is signin or link");
    let account: string | null = null;
    if (purpose === "link") {
      const ses = await s.accounts.session(cookie(request, SESSION_COOKIE));
      if (!ses) return fail(401, "sign in first: Globus is linked only to an account you're signed in to");
      if (!s.accounts.fresh(ses)) return fail(403, "linking Globus asks for your passkey: check it with /v1/account/reauth, then try again", { reauth: true });
      account = ses.account;
    }
    const trip = newRoundTrip();
    const binding = token();
    // The flow is found again by its state, which comes back on Globus's redirect.
    await s.accounts.startFlow("globus", { account, data: JSON.stringify({ ...trip, purpose, binding: hashOf(binding) }) }, 10 * 60_000, `globus:${trip.state}`);
    let location: string;
    try {
      location = await authorizationUrl(s.globus, trip);
    } catch (e) {
      return fail(502, `Globus can't be reached: ${whyNot(e)}`);
    }
    return new Response(null, { status: 302, headers: { location, "cache-control": "no-store", "referrer-policy": "no-referrer", "set-cookie": `${GLOBUS_COOKIE}=${binding}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600` } });
  }
  if (url.pathname !== "/v1/globus/callback") return fail(404, "Globus's addresses are /v1/globus/start and /v1/globus/callback");
  const clear = `${GLOBUS_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;
  const state = url.searchParams.get("state");
  // The flow is spent only by the browser that started it: a request without its cookie leaves it be.
  const f = state ? await s.accounts.flow(`globus:${state}`, "globus") : undefined;
  const data = f?.data ? (JSON.parse(f.data) as { state: string; nonce: string; verifier: string; purpose: "signin" | "link"; binding: string }) : undefined;
  const held = cookie(request, GLOBUS_COOKIE);
  const ours = !!f && !!data && !!held && same(hashOf(held), data.binding);
  if (!ours || !(await s.accounts.takeFlow(`globus:${state}`, "globus"))) return back(s, "/sign-in", { error: "globus-flow", message: "this sign-in through Globus didn't start in this browser, or it expired: start again" }, [clear]);
  let who;
  try {
    who = await identityFrom(s.globus, url, data);
  } catch (e) {
    return back(s, "/sign-in", { error: "globus", message: whyNot(e) }, [clear]);
  }
  const linked = await s.accounts.globusAccount(who.sub);
  if (data.purpose === "link") {
    if (linked) return back(s, "/account", { error: "globus-linked", message: linked === f.account ? "this Globus identity is linked to your account already" : "this Globus identity is linked to another account" }, [clear]);
    try {
      await s.accounts.linkGlobus(f.account!, who.sub);
    } catch (e) {
      if (e instanceof Taken) return back(s, "/account", { error: "globus-linked", message: e.message }, [clear]);
      throw e;
    }
    return back(s, "/account", { globus: "linked" }, [clear]);
  }
  if (linked) {
    const account = (await s.accounts.account(linked))!;
    // A closed account (B-b46z3) is restored only with its passkey.
    if (account.closed) return back(s, "/sign-in", { error: "closed", message: `the account ${account.handle} is closed: sign in with your passkey to restore it before ${deletesAt(account.closed).slice(0, 10)}` }, [clear]);
    const { token: t } = await s.accounts.startSession(account.id, browserName(request.headers.get("user-agent")));
    return back(s, "/", { signed_in: account.handle }, [clear, sessionCookie(t)]);
  }
  // Nobody has this identity: a sign-up, which still enrols a passkey (D153). An address Globus gives that an account
  // already has isn't taken over by matching it: that person signs in with their passkey and links Globus.
  const email = normalEmail(who.email);
  if (email && (await s.accounts.accountByEmail(email))) {
    return back(s, "/sign-in", { error: "globus-email", message: "an account already has this email address: sign in with your passkey, then link Globus from your account" }, [clear]);
  }
  const signup = await s.accounts.startFlow("signup", { email: email ?? null, globus_sub: who.sub, verified: 1 }, LIMITS.flowMs);
  return back(s, "/sign-up", { flow: signup, via: "globus" }, [clear]);
}
