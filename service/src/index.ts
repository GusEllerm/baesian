import { DurableObject } from "cloudflare:workers";
import { Buffer } from "node:buffer";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import type { Settings } from "../../src/routing.js";
import { type PasskeyKey, ProjectId, type ServiceKey, type Verdict, asWritten } from "../../src/schema.js";
import { signedFile } from "../../src/store.js";
import { type Access, type AccessEnv, NO_ACCESS, type Principal, accessFor, crossSite, isLocal, readGrants } from "./access.js";
import { Accounts } from "./accounts.js";
import { deleteClosed } from "./deletion.js";
import { PushLedger, WHEN, decide, pushText } from "./notify.js";
import { migrateObject } from "./object-migrations.js";
import { PracticeTable } from "./practice-table.js";
import { RETENTION, RetentionLedger } from "./retention.js";
import { Vapid, sendPush, topicOf, vapidKey, vapidPublicKey } from "./push.js";
import { tooOld } from "./release.js";
import { RELEASE_HEADER } from "../../src/version.js";
import { Usage, routeOf as usageRoute } from "./usage.js";
import type { GlobusConfig } from "./globus.js";
import { HEADERS, fail, readJson } from "./http.js";
import { machinesRoute } from "./machines.js";
import { type Mailer, bindingMailer } from "./mail.js";
import { type Assertion, type Batch, MAX_ENTRIES, MAX_FILE, type Outcome, REVISION, Relay, type Reply, challengeFor } from "./relay.js";
import { type KeyEnv, NoKey, ServiceSigner, spareKey } from "./signer.js";
import { type SignIn, signInRoute } from "./signin.js";
import { SqlFileStorage } from "./sql-storage.js";
import { type Turnstile, turnstile } from "./turnstile.js";
import { type RelyingParty, authenticationOptions, keyFile, verifyAssertion } from "./webauthn.js";

// Baesian's hosted service: the relay (M9b), a Worker that routes every address under /v1/projects/{project}/ (B-7z97x)
// to that project's Durable Object, on SQLite (D140), after deciding who may do what (Hosted Service section 3); and
// accounts and sign-in (M9c), in one D1 database (B-ytdt2). Live updates are hibernating WebSockets (B-bv49e).
// docs/vault/Modules/service.md describes it.

export const reply = ({ status, body }: Reply): Response =>
  status === 204 || body === undefined ? new Response(null, { status, headers: { "cache-control": "no-store" } }) : new Response(`${JSON.stringify(body)}\n`, { status, headers: HEADERS });

export interface Env extends KeyEnv, AccessEnv {
  PROJECTS: DurableObjectNamespace<ProjectRelay>;
  ACCOUNTS?: D1Database;
  EMAIL?: SendEmail;
  LIMIT_ADDRESS?: RateLimit;
  LIMIT_EMAIL?: RateLimit;
  EMAIL_FROM?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;
  GLOBUS_ISSUER?: string;
  GLOBUS_CLIENT_ID?: string;
  GLOBUS_CLIENT_SECRET?: string;
  /** Web push's VAPID key (B-nk97q), a P-256 private key as a JWK: a secret. */
  VAPID_KEY?: string;
}

/**
 * What the Worker works with besides its bindings: sign-in, the mailer, Turnstile, the clock and how it reaches outside
 * services. `servicesFor()` makes them from the environment; a test may hand in its own, to read the codes it mails or
 * to stand in for Globus.
 */
export interface Services {
  access: Access;
  accounts: Accounts | undefined;
  mail: Mailer;
  turnstile: Turnstile;
  fetch: typeof fetch;
}

const noMail: Mailer = {
  async send() {
    throw new Error("this service has no way to send email (the EMAIL binding)");
  },
};

/** The services from the environment, with any given in their place. */
export function servicesFor(env: Env, given: Partial<Services> = {}): Services {
  const accounts = given.accounts ?? (env.ACCOUNTS ? new Accounts(env.ACCOUNTS) : undefined);
  return {
    accounts,
    access: given.access ?? accessFor(env, accounts),
    mail: given.mail ?? (env.EMAIL ? bindingMailer(env.EMAIL, env.EMAIL_FROM ?? `sign-in@${env.SERVICE_RP_ID}`) : noMail),
    fetch: given.fetch ?? ((input, init) => fetch(input, init)),
    turnstile: given.turnstile ?? turnstile(env.TURNSTILE_SECRET, isLocal(env), given.fetch),
  };
}

/**
 * Who an address is for: reading (a machine or a person), uploading (a machine), answering (a person, in a browser), or
 * a person's own (a person, in a browser, reading or writing): practice answers (B-rehdw), which no machine reads.
 */
type Who = "read" | "upload" | "answer" | "person";

interface Route {
  name: "log" | "state" | "presets" | "live" | "pushes" | "upload" | "stop-waiting" | "verdicts" | "aliases" | "preferences" | "presence" | "batches" | "proofs" | "practice";
  who: Who;
  path?: string;
}

/** What an address under a project is, by its method and the rest of its path; or why it's none. */
function routeOf(method: string, rest: string): Route | Response {
  const reads: Record<string, Route["name"]> = { log: "log", state: "state", presets: "presets", live: "live", pushes: "pushes" };
  const answers: Record<string, Route["name"]> = { verdicts: "verdicts", aliases: "aliases", preferences: "preferences", presence: "presence", batches: "batches", proofs: "proofs" };
  if (rest.startsWith("files/")) {
    let path: string;
    try {
      path = rest.slice("files/".length).split("/").map(decodeURIComponent).join("/");
    } catch {
      return fail(400, "a malformed path");
    }
    if (method === "PUT") return { name: "upload", who: "upload", path };
    if (method === "DELETE") return { name: "stop-waiting", who: "upload", path };
    return fail(405, "a machine PUTs a file, or DELETEs a waiting marker");
  }
  const read = reads[rest];
  if (read) return method === "GET" ? { name: read, who: "read" } : fail(405, `${rest} is read with GET`);
  const answer = answers[rest];
  if (answer) return method === "POST" ? { name: answer, who: "answer" } : fail(405, `${rest} takes a POST`);
  // Practice answers (B-rehdw): read and written by a person in a browser, never by a machine.
  if (rest === "practice") return method === "GET" || method === "POST" ? { name: "practice", who: "person" } : fail(405, "practice is read with GET and written with POST");
  return fail(404, `no address ${rest} under a project: the relay has log, files/{path}, state, presets, live, pushes, verdicts, aliases, preferences, batches, proofs, presence and practice`);
}

/** Why `who` may not use a route, or nothing (Hosted Service section 3). Each grant is for one project; a session, for its own. */
function refusal(route: Route, who: Principal, project: string): string | undefined {
  if (who.project === undefined) return `your account isn't a member of project ${project}`;
  if (who.project !== project) return `this ${who.kind === "machine" ? "machine's grant" : "session"} is for project ${who.project}, not ${project}: each is for one project`;
  if (route.who === "upload" && who.kind !== "machine") return "only a machine uploads the files an agent writes";
  if (route.who === "answer" && who.kind !== "session") return "a machine never answers: answers come only from a person signed in in a browser";
  if (route.who === "person" && who.kind !== "session") return "practice answers are a person's own: only someone signed in in a browser reads or writes them, never a machine";
  return undefined;
}

/** The relying party, from the environment: the website's origin and its WebAuthn ID. */
const rpOf = (env: Env): RelyingParty => ({ origin: env.SERVICE_ORIGIN, rpID: env.SERVICE_RP_ID });

/** Sign-in through Globus, if it's set up: a client ID in the environment, and its secret (B-s76hg). */
function globusOf(env: Env, services: Services): GlobusConfig | undefined {
  if (!env.GLOBUS_CLIENT_ID || !env.GLOBUS_CLIENT_SECRET) return undefined;
  return { issuer: env.GLOBUS_ISSUER ?? "https://auth.globus.org", clientId: env.GLOBUS_CLIENT_ID, clientSecret: env.GLOBUS_CLIENT_SECRET, redirectUri: `${env.SERVICE_ORIGIN}/v1/globus/callback`, fetch: services.fetch };
}

/** A limit from a rate-limiting binding (B-mz6qc); with none bound, no limit. */
const limiter = (binding: RateLimit | undefined) => async (key: string) => (binding ? (await binding.limit({ key })).success : true);

/** The service's Worker, with the services it's given: `servicesFor()` unless a test gives others. */
export async function handleRequest(request: Request, env: Env, given: Partial<Services> | Access = {}): Promise<Response> {
  const services = servicesFor(env, "identify" in given ? { access: given } : given);
  const url = new URL(request.url);
  if (url.pathname === "/v1/keys") return request.method === "GET" ? keysReply(env) : fail(405, "the service's keys are read with GET");
  if (!url.pathname.startsWith("/v1/projects/")) return accountsRequest(request, url, env, services);
  const m = /^\/v1\/projects\/([^/]+)\/(.+)$/.exec(url.pathname);
  if (!m) return fail(404, "not found: every relay address starts /v1/projects/{project}/");
  let project: string;
  try {
    project = decodeURIComponent(m[1]!);
  } catch {
    return fail(400, "a malformed project");
  }
  if (!ProjectId.safeParse(project).success) return fail(400, "a project ID is letters, digits, dots, dashes and underscores");
  const route = routeOf(request.method, m[2]!);
  if (route instanceof Response) return route;
  // Answers come only from a session made by a passkey sign-in: a request carrying an Authorization header is refused,
  // whatever it holds, so no token can ever answer (Hosted Service section 3).
  if (route.who === "answer" && request.headers.has("authorization")) {
    return fail(403, "an answer comes only from a person signed in in a browser: a request with an Authorization header is refused, whatever it holds");
  }
  // So does anything at a person's own address (B-rehdw): no token reads or writes practice answers.
  if (route.who === "person" && request.headers.has("authorization")) {
    return fail(403, "practice answers are a person's own: a request with an Authorization header is refused, whatever it holds");
  }
  const who = await services.access.identify(request, project);
  if (!who) {
    return services.access === NO_ACCESS ? fail(401, "this service has no sign-in (no accounts database), so it refuses every request") : fail(401, "not signed in: a machine sends its grant's token; a person signs in in a browser");
  }
  // A person's request must come from the website's own pages, never another site's (Hosted Service section 3).
  if (who.kind === "session") {
    const cross = crossSite(request, env.SERVICE_ORIGIN);
    if (cross) return fail(403, cross);
  }
  // A machine's names its Baesian's release, and one too old to read what the relay holds is told to upgrade before it
  // pulls anything (B-4p43b). The website is the service's own, always this release.
  if (who.kind === "machine") {
    const old = tooOld(request.headers.get(RELEASE_HEADER));
    if (old) return old;
  }
  const no = refusal(route, who, project);
  if (no) return fail(403, no);
  const stub = env.PROJECTS.get(env.PROJECTS.idFromName(project));
  const person = who.kind === "session" ? { account: who.account, handle: who.handle } : undefined;
  switch (route.name) {
    case "log": {
      const after = Number(url.searchParams.get("after") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? MAX_ENTRIES);
      if (!Number.isInteger(after) || after < 0 || !Number.isInteger(limit) || limit < 1) return fail(400, "after is a sequence number from 0, and limit a count from 1");
      // A machine's read is noted by its grant, for retention (B-9jqt4); the stand-in's machines, by name.
      return reply(await stub.log(project, after, limit, who.kind === "machine" ? (who.grant ?? `dev:${who.machine}`) : undefined));
    }
    case "state":
      return reply(await stub.state(project));
    case "presets":
      return reply(await stub.presets(project));
    case "pushes":
      return reply(await stub.pushes(project));
    case "live":
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return fail(426, "live updates are a WebSocket: send Upgrade: websocket");
      return stub.fetch(request);
    case "upload": {
      const declared = Number(request.headers.get("content-length") ?? 0);
      if (declared > MAX_FILE) return fail(413, `the relay takes files up to ${MAX_FILE} bytes`);
      const bytes = new Uint8Array(await request.arrayBuffer());
      return reply(await stub.upload(project, route.path!, bytes, (who as Extract<Principal, { kind: "machine" }>).machine));
    }
    case "stop-waiting":
      return reply(await stub.stopWaiting(project, route.path!));
    case "presence": {
      const input = request.headers.get("content-type") ? await readJson(request) : {};
      if (input instanceof Response) return input;
      return reply(await stub.presence(project, input));
    }
    case "batches": {
      const input = await readJson(request);
      if (input instanceof Response) return input;
      return passkeyOptions(await stub.batch(project, input, person!.account), person!.account, env, services);
    }
    case "proofs": {
      const input = await readJson(request);
      if (input instanceof Response) return input;
      return proofRequest(input, project, person!, stub, env, services);
    }
    case "practice": {
      if (request.method === "GET") return reply(await stub.practiceRead(project));
      const input = await readJson(request);
      if (input instanceof Response) return input;
      return reply(await stub.practiceWrite(project, input, person!));
    }
    default:
      // An answer that takes the passkey replies 202 and waits, to be confirmed with others or alone (B-a6xpc).
      {
        const input = await readJson(request);
        if (input instanceof Response) return input;
        return reply(await stub.answer(project, route.name, input, person!));
      }
  }
}

/**
 * Answers asked for together (`POST batches`, 202, B-a6xpc) get the browser's options for `navigator.credentials.get()`:
 * the account's passkeys, user verification required, and the challenge the relay set, the digest of the batch's list (or
 * of its one file).
 */
async function passkeyOptions(r: Reply, account: string, env: Env, services: Services): Promise<Response> {
  if (r.status !== 202) return reply(r);
  const p = (r.body as { passkey: { challenge: string } }).passkey;
  const allow = services.accounts ? await services.accounts.passkeys(account) : [];
  const options = await authenticationOptions(rpOf(env), allow, new Uint8Array(Buffer.from(p.challenge, "base64url")));
  return reply({ status: 202, body: { passkey: { ...p, options } } });
}

/**
 * `POST /v1/projects/{project}/proofs`, `{ batch, response }`: the passkey's one assertion for answers asked for together
 * (D139, D163, B-a6xpc). Checked here with SimpleWebAuthn (B-jp22m) against the account's own passkey and the batch's
 * challenge; then the relay writes each answer, its proofs beside its files and the passkey's key file, and checks each
 * proof counts. 200, with what became of each answer.
 */
async function proofRequest(input: unknown, project: string, person: { account: string; handle: string }, stub: DurableObjectStub<ProjectRelay>, env: Env, services: Services): Promise<Response> {
  const body = typeof input === "object" && input !== null ? (input as { batch?: unknown; response?: unknown }) : {};
  if (typeof body.batch !== "string" || typeof body.response !== "object" || body.response === null) return fail(400, "send { batch, response }: the answers' batch, and the passkey's assertion as the browser returned it");
  const response = body.response as AuthenticationResponseJSON;
  const batch = await stub.batchFor(project, body.batch, person.account);
  if (!batch) return fail(404, "no answers of yours are waiting for your passkey under that ID, or they expired: confirm them again");
  const passkey = services.accounts && typeof response.id === "string" ? await services.accounts.passkey(response.id) : null;
  if (!passkey || passkey.account !== person.account) return fail(400, "that passkey isn't one of your account's");
  try {
    await services.accounts!.usePasskey(passkey.credential, await verifyAssertion(rpOf(env), response, challengeFor(batch.digests), passkey));
  } catch (e) {
    return fail(400, `the passkey's signature doesn't check: ${e instanceof Error ? e.message : String(e)}`);
  }
  const r = response.response;
  const assertion: Assertion = { credential: passkey.credential, authenticator_data: r.authenticatorData, client_data: r.clientDataJSON, signature: r.signature };
  return reply(await stub.proveBatch(project, body.batch, person.account, assertion, keyFile(passkey, person.account, person.handle)));
}

/**
 * `GET /v1/keys`, for anyone (B-x47ek): the service's keys, as the service key files a project's `trust/` holds. `service`
 * is the key it signs with; `spare`, a key whose private half is kept offline and which it never signs with, until the day
 * the key in use must be replaced. `baesian ci` prints the spare's line beside the key's, so CI that pins both keeps
 * passing when the service switches. A spare the environment names but that can't be read is left out, and `problem`
 * says why.
 */
export function keysReply(env: KeyEnv): Response {
  let service: ServiceKey[] = [];
  try {
    service = [ServiceSigner.fromEnv(env).serviceKey()];
  } catch (e) {
    if (!(e instanceof NoKey)) throw e;
  }
  const spare = spareKey(env);
  if (spare && "problem" in spare) console.error(`the spare key: ${spare.problem}`);
  return reply({
    status: 200,
    body: {
      service: service.map((k) => asWritten("service-key", k)),
      spare: spare && "key" in spare ? [asWritten("service-key", spare.key)] : [],
      ...(spare && "problem" in spare ? { problem: spare.problem } : {}),
    },
  });
}

/** Every address that isn't a project's: accounts and sign-in (`signInRoute()`), and machines' sign-in (`machinesRoute()`). */
async function accountsRequest(request: Request, url: URL, env: Env, services: Services): Promise<Response> {
  if (!url.pathname.startsWith("/v1/")) return fail(404, "not found: every address of the service starts /v1/");
  if (!services.accounts) return fail(503, "this service has no accounts database (the ACCOUNTS binding)");
  const address = limiter(env.LIMIT_ADDRESS);
  if (url.pathname.startsWith("/v1/machines/")) {
    const r = await machinesRoute(services.accounts, env.SERVICE_ORIGIN, address, request, url);
    if (r) return r;
  }
  const s: SignIn = {
    accounts: services.accounts,
    rp: rpOf(env),
    mail: services.mail,
    turnstile: services.turnstile,
    turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? "",
    limit: { address, email: limiter(env.LIMIT_EMAIL) },
    globus: globusOf(env, services),
    putKeys: async (project, keys) => {
      const r = (await env.PROJECTS.get(env.PROJECTS.idFromName(project)).putKeys(project, keys)) as Reply;
      if (r.status >= 300) throw new Error(JSON.stringify(r.body));
    },
    vapidPublicKey: vapidPublicKey(env.VAPID_KEY),
    testPush: isLocal(env),
    usage: new Usage(services.accounts.db),
  };
  return (await signInRoute(s, request, url)) ?? fail(404, `no address ${request.method} ${url.pathname}`);
}

/**
 * The service's daily job (M9f), on its cron trigger (`service/wrangler.jsonc#triggers`): accounts closed 14 days ago are
 * deleted, their projects' relay data first (B-b46z3, `deleteClosed()`), and rows whose time is over are cleared
 * (`Accounts.clearEnded`). Returns the accounts deleted.
 */
export async function housekeeping(env: Env, now: number = Date.now()): Promise<string[]> {
  if (!env.ACCOUNTS) return [];
  const accounts = new Accounts(env.ACCOUNTS);
  const deleted = await deleteClosed(accounts, async (project) => env.PROJECTS.get(env.PROJECTS.idFromName(project)).erase(project), now);
  await accounts.clearEnded();
  return deleted;
}

export default {
  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(
      housekeeping(env).catch((e) => {
        console.error(`the daily job failed: ${e instanceof Error ? e.message : String(e)}`);
      }),
    );
  },

  async fetch(request, env, ctx): Promise<Response> {
    let r: Response;
    try {
      r = await handleRequest(request, env);
    } catch (e) {
      r = fail(500, e instanceof Error ? e.message : String(e));
    }
    // A failure is counted by the address's name and its status alone, with no usage ID (B-7nq85).
    if (r.status >= 500 && env.ACCOUNTS) ctx.waitUntil(new Usage(env.ACCOUNTS).record(null, "error", { route: usageRoute(new URL(request.url).pathname), status: r.status }));
    return r;
  },
} satisfies ExportedHandler<Env>;

/** The meta key for when a project's object next looks at retention (M9f). */
const SWEEP_AT = "retention_next";

/** What a live update says (B-bv49e): the state changed, and its version now. The client reads the state again. */
export const changedMessage = (version: number) => JSON.stringify({ type: "changed", version });

/**
 * One project's relay: its files in SQLite, and the sockets of the pages and agents listening (D140). It learns its
 * project on first use, and answers for no other. Everything it does goes through `Relay`; this is the glue.
 */
export class ProjectRelay extends DurableObject<Env> {
  private files!: SqlFileStorage;
  private readonly signer: ServiceSigner | undefined;
  private readonly keyProblem: string | undefined;
  private readonly started = new Date().toISOString();
  /** The project's notification state (M9e step 2). */
  private ledger!: PushLedger;
  /** Web push's VAPID tokens, made when first needed and each reused for an hour (B-nk97q). */
  private vapid: Vapid | undefined;
  /** Usage counts (D141, B-7nq85), in the accounts database. */
  private readonly usage: Usage | undefined;
  /** The days and screens whose first visit this object has counted already. */
  private readonly visited = new Set<string>();
  /** Retention's tables (M9f, B-9jqt4, B-ec3kj). */
  private retention!: RetentionLedger;
  /** Practice answers (B-rehdw): a table of their own, never in the files or the log. */
  private practice!: PracticeTable;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.usage = env.ACCOUNTS ? new Usage(env.ACCOUNTS) : undefined;
    let signer: ServiceSigner | undefined;
    try {
      signer = ServiceSigner.fromEnv(env);
    } catch (e) {
      if (!(e instanceof NoKey)) throw e;
      this.keyProblem = e.message;
    }
    this.signer = signer;
    this.open();
    // A ping is answered without waking the object (B-bv49e).
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  /**
   * The object's tables, brought up to this release's schema by the numbered migrations it hasn't had (B-866d2): as it
   * wakes, and again after `ProjectRelay.erase` emptied it.
   */
  private open(): void {
    migrateObject(this.ctx.storage);
    this.ledger = new PushLedger(this.ctx.storage.sql);
    this.retention = new RetentionLedger(this.ctx.storage.sql);
    this.practice = new PracticeTable(this.ctx.storage.sql);
    this.files = new SqlFileStorage(this.ctx.storage, {
      sign: (path, bytes) => {
        if (!signedFile(path)) return undefined;
        if (!this.signer) throw new NoKey(this.keyProblem ?? "the relay has no signing key");
        return this.signer.sign(path, bytes);
      },
    });
  }

  /**
   * Erase the project (B-b46z3, M9f): its owner's account is deleted. Every socket is closed, the alarm deleted, and
   * the object's whole database deleted (`storage.deleteAll`, atomic on SQLite), log and all, so nothing of the project
   * is left; its tables are made again only if anything asks for it after.
   */
  async erase(project: string): Promise<void> {
    if (this.erased) return;
    const known = this.files.meta("project");
    if (known !== undefined && known !== project) throw new Error(`this object holds project ${known}, not ${project}`);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(1000, "the project was deleted");
      } catch {
        // closing already
      }
    }
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.visited.clear();
    this.erased = true;
  }

  /** Erased (`ProjectRelay.erase`): the tables are made again at the next use, not before. */
  private erased = false;

  private reopened(): void {
    if (!this.erased) return;
    this.erased = false;
    this.open();
  }

  /** The project's relay, after checking this object is that project's. */
  private relay(project: string): Relay {
    this.reopened();
    const known = this.files.meta("project");
    if (known === undefined) this.files.setMeta("project", project);
    else if (known !== project) throw new Error(`this object holds project ${known}, not ${project}`);
    return new Relay(this.files, this.signer, this.keyProblem, project, this.env.SERVICE_ORIGIN, this.started, this.retention);
  }

  /** Run one address's work, and tell every listener if it changed anything. */
  private run(project: string, fn: (relay: Relay) => Reply): Reply {
    // The relay first: after `ProjectRelay.erase`, it makes the tables again, which reading the version needs.
    const relay = this.relay(project);
    const before = this.files.version();
    const out = fn(relay);
    const now = this.files.version();
    if (now !== before) this.announce(now);
    return out;
  }

  private announce(version: number): void {
    const message = changedMessage(version);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(message);
      } catch {
        // closing already: the page reconnects and reads the state again
      }
    }
  }

  async log(project: string, after: number, limit: number, machine?: string): Promise<Reply> {
    return this.run(project, (r) => r.log(after, limit, machine));
  }

  async state(project: string): Promise<Reply> {
    return this.run(project, (r) => r.state());
  }

  async presets(project: string): Promise<Reply> {
    return this.run(project, (r) => r.presets());
  }

  async upload(project: string, path: string, bytes: Uint8Array, machine: string): Promise<Reply> {
    const out = this.run(project, (r) => r.upload(path, bytes, machine));
    // A card revision that arrives may start a notification (M9e step 2): noted now, decided at the object's alarm, at
    // most `WHEN.soonMs` from now, so a burst of filings is decided once.
    const m = out.status === 201 ? REVISION.exec(path) : null;
    if (m) {
      const now = Date.now();
      this.ledger.arrive(m[1]!, Number(m[2]), machine, now);
      const at = await this.ctx.storage.getAlarm();
      if (at === null || at > now + WHEN.soonMs) await this.ctx.storage.setAlarm(now + WHEN.soonMs);
      const fields = this.relay(project).filedUsage(m[1]!, Number(m[2]));
      if (fields) await this.usage?.record({ project }, "card_filed", fields);
    }
    if (out.status < 300) await this.keepAlarm();
    return out;
  }

  /** The machines whose cards don't notify now (a burst, B-advkh), for the project's page to say so. */
  async pushes(project: string): Promise<Reply> {
    this.relay(project);
    const now = Date.now();
    const paused = this.ledger
      .pauses(now)
      .filter((p) => p.until > now)
      .map((p) => ({ machine: p.machine, cards: p.cards, minutes: Math.round(WHEN.burstWindowMs / 60_000), until: new Date(p.until).toISOString() }));
    return { status: 200, body: { paused } };
  }

  /**
   * The object's alarm: decide whether a notification goes now (`decide()`, B-advkh), send it to every browser of the
   * project's owner that turned them on, settle what it told, and set the alarm for the next time anything's due.
   */
  async alarm(): Promise<void> {
    if (this.erased) return;
    const project = this.files.meta("project");
    if (project === undefined) return;
    const now = Date.now();
    const relay = this.relay(project);
    const d = decide({ now, arrivals: this.ledger.arrivals(), waiting: relay.waiting(), present: relay.present(now), sent: this.ledger.sent(now), pauses: this.ledger.pauses(now) });
    this.ledger.settle(d.settle, now);
    if (d.send) {
      try {
        if (await this.send(project, d.send)) this.ledger.markSent(now);
      } catch (e) {
        console.error(`notifying project ${project} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    // Retention (M9f): once a day, the text of cards whose time has come is removed.
    let sweep = Number(this.files.meta(SWEEP_AT) ?? 0);
    if (sweep <= now) {
      try {
        await this.sweep(project, now);
      } catch (e) {
        console.error(`retention in project ${project} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      sweep = now + RETENTION.everyMs;
      this.files.setMeta(SWEEP_AT, String(sweep));
    }
    await this.ctx.storage.setAlarm(Math.max(Math.min(d.next ?? Number.POSITIVE_INFINITY, sweep), Date.now() + 1000));
  }

  /**
   * Retention's daily look (M9f, B-9jqt4, B-ec3kj): the machines signed in to the project now, from the accounts database
   * (and, locally and in tests, the stand-in's for it), then `Relay.sweep`. Listeners hear of what changed.
   */
  async sweep(project: string, now: number = Date.now()): Promise<string[]> {
    const live = new Set<string>();
    if (this.env.ACCOUNTS) for (const g of await new Accounts(this.env.ACCOUNTS).liveGrants(project)) live.add(g);
    if (isLocal(this.env) && this.env.BAESIAN_DEV_ACCESS) for (const m of readGrants(this.env.BAESIAN_DEV_ACCESS).machines) if (m.project === project) live.add(`dev:${m.machine}`);
    let removed: string[] = [];
    this.run(project, (r) => {
      removed = r.sweep(now, live);
      return { status: 200 };
    });
    return removed;
  }

  /** After a write, an alarm is always set, so retention looks at the project at least once a day. */
  private async keepAlarm(): Promise<void> {
    if ((await this.ctx.storage.getAlarm()) !== null) return;
    const sweep = Number(this.files.meta(SWEEP_AT) ?? 0);
    await this.ctx.storage.setAlarm(Math.max(sweep || Date.now() + RETENTION.everyMs, Date.now() + 1000));
  }

  /**
   * One notification, to every browser of the project's owner that gets them (B-ytdt2), saying how many cards wait and
   * their levels, with the project's name (B-mjf3g, B-zqkwk); a browser whose push service says it's gone (404 or 410)
   * is deleted. Returns whether any was sent.
   */
  private async send(project: string, counts: { urgency: "high" | "normal"; reason: "at once" | "digest"; total: number; hard: number; blocking: number }): Promise<boolean> {
    if (!this.env.ACCOUNTS || !this.env.VAPID_KEY || counts.total === 0) return false;
    const accounts = new Accounts(this.env.ACCOUNTS);
    const p = await accounts.project(project);
    const subs = p ? await accounts.subscriptions(p.owner) : [];
    if (!p || !subs.length) return false;
    this.vapid ??= new Vapid(await vapidKey(this.env.VAPID_KEY), this.env.SERVICE_ORIGIN);
    const { title, body } = pushText(counts, p.name);
    const message = { title, body, url: `/projects/${encodeURIComponent(project)}`, tag: `baesian:${project}` };
    const topic = await topicOf(project);
    const results = await Promise.all(subs.map(async (s) => ({ s, r: await sendPush(s, message, { vapid: this.vapid!, urgency: counts.urgency, topic }) })));
    for (const { s, r } of results) {
      if (r.result === "gone") await accounts.dropSubscription(s.endpoint);
      if (r.result === "failed") console.error(`a push to ${new URL(s.endpoint).hostname} failed: ${r.status} ${r.why}`);
    }
    await accounts.markSent(results.filter((x) => x.r.result === "delivered").map((x) => x.s.id));
    const some = (r: string) => results.some((x) => x.r.result === r);
    await this.usage?.record({ project }, "push_sent", { reason: counts.reason, urgency: counts.urgency, cards: counts.total, result: some("delivered") ? "delivered" : some("failed") ? "failed" : "gone" });
    return true;
  }

  async stopWaiting(project: string, path: string): Promise<Reply> {
    return this.run(project, (r) => r.stopWaiting(path));
  }

  async answer(project: string, kind: "verdicts" | "aliases" | "preferences", input: unknown, who: { account: string; handle: string }): Promise<Reply> {
    const before = this.relay(project).settings();
    const out = this.run(project, (r) => (kind === "verdicts" ? r.verdict(input, who) : kind === "aliases" ? r.alias(input, who) : r.preferences(input, who)));
    if (out.status === 201) await this.countAnswer(project, who.account, kind === "verdicts" ? "verdict" : kind === "aliases" ? "alias" : "preferences", out, before);
    if (out.status === 201) await this.keepAlarm();
    return out;
  }

  /** An answer written, counted (B-7nq85): a card answered, a topic merge, or a change to the preferences. */
  private async countAnswer(project: string, account: string, kind: "verdict" | "alias" | "preferences", out: Reply, before: Settings): Promise<void> {
    if (!this.usage) return;
    const who = { account, project };
    const relay = this.relay(project);
    if (kind === "alias") return this.usage.record(who, "topic_merged");
    if (kind === "preferences") return this.usage.record(who, "preferences_changed", relay.preferencesUsage(before));
    const v = (out.body as { verdict?: Verdict }).verdict;
    const fields = v && relay.answeredUsage(v);
    if (fields) await this.usage.record(who, "card_answered", fields);
  }

  /** Waiting answers asked for together (B-a6xpc): the batch, and its challenge for the passkey. */
  async batch(project: string, input: unknown, account: string): Promise<Reply> {
    return this.run(project, (r) => r.batch(input, account));
  }

  /** A batch waiting for an account's passkey, for the Worker to check the assertion against its challenge. */
  async batchFor(project: string, id: string, account: string): Promise<Batch | undefined> {
    return this.relay(project).batchOf(id, account);
  }

  /** One tap's assertion over a batch: each answer written, and each one written counted (B-7nq85). */
  async proveBatch(project: string, id: string, account: string, assertion: Assertion, key: PasskeyKey): Promise<Reply> {
    const before = this.relay(project).settings();
    const out = this.run(project, (r) => r.proveBatch(id, account, assertion, key));
    const written = out.status === 200 ? (out.body as { answers: Outcome[] }).answers.filter((a) => a.status === 201 && a.kind) : [];
    for (const a of written) await this.countAnswer(project, account, a.kind!, { status: a.status, body: a.body }, before);
    if (written.length) await this.keepAlarm();
    return out;
  }

  /**
   * Practice answers (B-rehdw), a person's own: read and written in their own table, never through the store, so nothing
   * is logged, signed, announced or counted.
   */
  async practiceRead(project: string): Promise<Reply> {
    this.relay(project);
    return this.practice.read();
  }

  async practiceWrite(project: string, input: unknown, who: { account: string; handle: string }): Promise<Reply> {
    this.relay(project);
    return this.practice.write(input, who);
  }

  async putKeys(project: string, keys: PasskeyKey[]): Promise<Reply> {
    return this.run(project, (r) => r.putKeys(keys));
  }

  async presence(project: string, input: unknown): Promise<Reply> {
    const out = this.run(project, (r) => r.presence(input));
    // The day's first visit on each kind of screen is counted (B-7nq85); the heartbeats after it, never.
    if (out.status === 204 && this.usage) {
      const client = typeof input === "object" && input !== null && (input as { client?: unknown }).client === "hosted-phone" ? "phone" : "desktop";
      const today = `${new Date().toISOString().slice(0, 10)}:${client}`;
      if (!this.visited.has(today)) {
        this.visited.add(today);
        await this.usage.recordDaily({ project }, "visit", { client });
      }
    }
    return out;
  }

  /** Live updates (B-bv49e): a hibernating WebSocket, told the version at once, and again whenever it changes. */
  async fetch(request: Request): Promise<Response> {
    const project = decodeURIComponent(new URL(request.url).pathname.split("/")[3] ?? "");
    this.relay(project);
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.send(changedMessage(this.files.version()));
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Listeners send nothing but pings, which the runtime answers; anything else is ignored. */
  async webSocketMessage(): Promise<void> {}

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      // already closed
    }
  }
}
