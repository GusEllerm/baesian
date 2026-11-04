import { DurableObject } from "cloudflare:workers";
import { Buffer } from "node:buffer";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { type PasskeyKey, ProjectId } from "../../src/schema.js";
import { signedFile } from "../../src/store.js";
import { type Access, type AccessEnv, NO_ACCESS, type Principal, accessFor, crossSite, isLocal } from "./access.js";
import { Accounts } from "./accounts.js";
import type { GlobusConfig } from "./globus.js";
import { HEADERS, fail, readJson } from "./http.js";
import { machinesRoute } from "./machines.js";
import { type Mailer, bindingMailer } from "./mail.js";
import { type Assertion, MAX_ENTRIES, MAX_FILE, type Pending, Relay, type Reply } from "./relay.js";
import { type KeyEnv, NoKey, ServiceSigner } from "./signer.js";
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

/** Who an address is for: reading (a machine or a person), uploading (a machine), or answering (a person, in a browser). */
type Who = "read" | "upload" | "answer";

interface Route {
  name: "log" | "state" | "presets" | "live" | "upload" | "stop-waiting" | "verdicts" | "aliases" | "preferences" | "presence" | "proofs";
  who: Who;
  path?: string;
}

/** What an address under a project is, by its method and the rest of its path; or why it's none. */
function routeOf(method: string, rest: string): Route | Response {
  const reads: Record<string, Route["name"]> = { log: "log", state: "state", presets: "presets", live: "live" };
  const answers: Record<string, Route["name"]> = { verdicts: "verdicts", aliases: "aliases", preferences: "preferences", presence: "presence", proofs: "proofs" };
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
  return fail(404, `no address ${rest} under a project: the relay has log, files/{path}, state, presets, live, verdicts, aliases, preferences, proofs and presence`);
}

/** Why `who` may not use a route, or nothing (Hosted Service section 3). Each grant is for one project; a session, for its own. */
function refusal(route: Route, who: Principal, project: string): string | undefined {
  if (who.project === undefined) return `your account isn't a member of project ${project}`;
  if (who.project !== project) return `this ${who.kind === "machine" ? "machine's grant" : "session"} is for project ${who.project}, not ${project}: each is for one project`;
  if (route.who === "upload" && who.kind !== "machine") return "only a machine uploads the files an agent writes";
  if (route.who === "answer" && who.kind !== "session") return "a machine never answers: answers come only from a person signed in in a browser";
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
  const who = await services.access.identify(request, project);
  if (!who) {
    return services.access === NO_ACCESS ? fail(401, "this service has no sign-in (no accounts database), so it refuses every request") : fail(401, "not signed in: a machine sends its grant's token; a person signs in in a browser");
  }
  // A person's request must come from the website's own pages, never another site's (Hosted Service section 3).
  if (who.kind === "session") {
    const cross = crossSite(request, env.SERVICE_ORIGIN);
    if (cross) return fail(403, cross);
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
      return reply(await stub.log(project, after, limit));
    }
    case "state":
      return reply(await stub.state(project));
    case "presets":
      return reply(await stub.presets(project));
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
    case "proofs": {
      const input = await readJson(request);
      if (input instanceof Response) return input;
      return proofRequest(input, project, person!, stub, env, services);
    }
    default: {
      const input = await readJson(request);
      if (input instanceof Response) return input;
      return passkeyOptions(await stub.answer(project, route.name, input, person!), person!.account, env, services);
    }
  }
}

/**
 * An answer composed and waiting for the passkey (202) gets the browser's options for `navigator.credentials.get()`: the
 * account's passkeys, user verification required, and the challenge the relay set, the digest of the file to prove.
 */
async function passkeyOptions(r: Reply, account: string, env: Env, services: Services): Promise<Response> {
  if (r.status !== 202) return reply(r);
  const p = (r.body as { passkey: { challenge: string } }).passkey;
  const allow = services.accounts ? await services.accounts.passkeys(account) : [];
  const options = await authenticationOptions(rpOf(env), allow, new Uint8Array(Buffer.from(p.challenge, "base64url")));
  return reply({ status: 202, body: { passkey: { ...p, options } } });
}

/**
 * `POST /v1/projects/{project}/proofs`, `{ pending, response }`: the passkey's assertion for a composed answer (D139,
 * D163). Checked here with SimpleWebAuthn (B-jp22m) against the account's own passkey and the digest the relay composed;
 * then the relay writes the answer, the proof beside it and the passkey's key file, and checks the proof counts.
 */
async function proofRequest(input: unknown, project: string, person: { account: string; handle: string }, stub: DurableObjectStub<ProjectRelay>, env: Env, services: Services): Promise<Response> {
  const body = typeof input === "object" && input !== null ? (input as { pending?: unknown; response?: unknown }) : {};
  if (typeof body.pending !== "string" || typeof body.response !== "object" || body.response === null) return fail(400, "send { pending, response }: the waiting answer's ID, and the passkey's assertion as the browser returned it");
  const response = body.response as AuthenticationResponseJSON;
  const pending = await stub.pendingFor(project, body.pending, person.account);
  if (!pending) return fail(404, "no answer of yours is waiting for a passkey with that ID, or it expired: answer again");
  const next = pending.need[pending.proofs.length]!;
  const challenge = Buffer.from(next.digest, "hex").toString("base64url");
  const passkey = services.accounts && typeof response.id === "string" ? await services.accounts.passkey(response.id) : null;
  if (!passkey || passkey.account !== person.account) return fail(400, "that passkey isn't one of your account's");
  try {
    await services.accounts!.usePasskey(passkey.credential, await verifyAssertion(rpOf(env), response, challenge, passkey));
  } catch (e) {
    return fail(400, `the passkey's signature doesn't check: ${e instanceof Error ? e.message : String(e)}`);
  }
  const r = response.response;
  const assertion: Assertion = { credential: passkey.credential, authenticator_data: r.authenticatorData, client_data: r.clientDataJSON, signature: r.signature };
  return passkeyOptions((await stub.prove(project, body.pending, person.account, assertion, keyFile(passkey, person.account, person.handle))) as Reply, person.account, env, services);
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
  };
  return (await signInRoute(s, request, url)) ?? fail(404, `no address ${request.method} ${url.pathname}`);
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (e) {
      return fail(500, e instanceof Error ? e.message : String(e));
    }
  },
} satisfies ExportedHandler<Env>;

/** What a live update says (B-bv49e): the state changed, and its version now. The client reads the state again. */
export const changedMessage = (version: number) => JSON.stringify({ type: "changed", version });

/**
 * One project's relay: its files in SQLite, and the sockets of the pages and agents listening (D140). It learns its
 * project on first use, and answers for no other. Everything it does goes through `Relay`; this is the glue.
 */
export class ProjectRelay extends DurableObject<Env> {
  private readonly files: SqlFileStorage;
  private readonly signer: ServiceSigner | undefined;
  private readonly keyProblem: string | undefined;
  private readonly started = new Date().toISOString();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    let signer: ServiceSigner | undefined;
    try {
      signer = ServiceSigner.fromEnv(env);
    } catch (e) {
      if (!(e instanceof NoKey)) throw e;
      this.keyProblem = e.message;
    }
    this.signer = signer;
    this.files = new SqlFileStorage(ctx.storage, {
      sign: (path, bytes) => {
        if (!signedFile(path)) return undefined;
        if (!this.signer) throw new NoKey(this.keyProblem ?? "the relay has no signing key");
        return this.signer.sign(path, bytes);
      },
    });
    // A ping is answered without waking the object (B-bv49e).
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  /** The project's relay, after checking this object is that project's. */
  private relay(project: string): Relay {
    const known = this.files.meta("project");
    if (known === undefined) this.files.setMeta("project", project);
    else if (known !== project) throw new Error(`this object holds project ${known}, not ${project}`);
    return new Relay(this.files, this.signer, this.keyProblem, project, this.env.SERVICE_ORIGIN, this.started);
  }

  /** Run one address's work, and tell every listener if it changed anything. */
  private run(project: string, fn: (relay: Relay) => Reply): Reply {
    const before = this.files.version();
    const out = fn(this.relay(project));
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

  async log(project: string, after: number, limit: number): Promise<Reply> {
    return this.run(project, (r) => r.log(after, limit));
  }

  async state(project: string): Promise<Reply> {
    return this.run(project, (r) => r.state());
  }

  async presets(project: string): Promise<Reply> {
    return this.run(project, (r) => r.presets());
  }

  async upload(project: string, path: string, bytes: Uint8Array, machine: string): Promise<Reply> {
    return this.run(project, (r) => r.upload(path, bytes, machine));
  }

  async stopWaiting(project: string, path: string): Promise<Reply> {
    return this.run(project, (r) => r.stopWaiting(path));
  }

  async answer(project: string, kind: "verdicts" | "aliases" | "preferences", input: unknown, who: { account: string; handle: string }): Promise<Reply> {
    return this.run(project, (r) => (kind === "verdicts" ? r.verdict(input, who) : kind === "aliases" ? r.alias(input, who) : r.preferences(input, who)));
  }

  /** A composed answer waiting for an account's passkey, for the Worker to check the assertion against. */
  async pendingFor(project: string, id: string, account: string): Promise<Pending | undefined> {
    return this.relay(project).pending(id, account);
  }

  async prove(project: string, id: string, account: string, assertion: Assertion, key: PasskeyKey): Promise<Reply> {
    return this.run(project, (r) => r.prove(id, account, assertion, key));
  }

  async putKeys(project: string, keys: PasskeyKey[]): Promise<Reply> {
    return this.run(project, (r) => r.putKeys(keys));
  }

  async presence(project: string, input: unknown): Promise<Reply> {
    return this.run(project, (r) => r.presence(input));
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
