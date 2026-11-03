import { DurableObject } from "cloudflare:workers";
import { ProjectId } from "../../src/schema.js";
import { signedFile } from "../../src/store.js";
import { type Access, type AccessEnv, NO_ACCESS, type Principal, accessFor } from "./access.js";
import { MAX_ENTRIES, MAX_FILE, Relay, type Reply } from "./relay.js";
import { type KeyEnv, NoKey, ServiceSigner } from "./signer.js";
import { SqlFileStorage } from "./sql-storage.js";

// Baesian's hosted relay (M9b): a Worker that routes every address under /v1/projects/{project}/ (B-7z97x) to that
// project's Durable Object, on SQLite (D140), after deciding who may do what (Hosted Service section 3). Live updates are
// hibernating WebSockets (B-bv49e). docs/vault/Modules/service.md describes it.

export interface Env extends KeyEnv, AccessEnv {
  PROJECTS: DurableObjectNamespace<ProjectRelay>;
}

/** Who an address is for: reading (a machine or a person), uploading (a machine), or answering (a person, in a browser). */
type Who = "read" | "upload" | "answer";

interface Route {
  name: "log" | "state" | "presets" | "live" | "upload" | "stop-waiting" | "verdicts" | "aliases" | "preferences" | "presence";
  who: Who;
  path?: string;
}

const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" };
const MAX_JSON = 64 * 1024;

export const reply = ({ status, body }: Reply): Response =>
  status === 204 || body === undefined ? new Response(null, { status, headers: { "cache-control": "no-store" } }) : new Response(`${JSON.stringify(body)}\n`, { status, headers: HEADERS });
const fail = (status: number, error: string) => reply({ status, body: { error } });

/** What an address under a project is, by its method and the rest of its path; or why it's none. */
function routeOf(method: string, rest: string): Route | Response {
  const reads: Record<string, Route["name"]> = { log: "log", state: "state", presets: "presets", live: "live" };
  const answers: Record<string, Route["name"]> = { verdicts: "verdicts", aliases: "aliases", preferences: "preferences", presence: "presence" };
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
  return fail(404, `no address ${rest} under a project: the relay has log, files/{path}, state, presets, live, verdicts, aliases, preferences and presence`);
}

/** Why `who` may not use a route, or nothing (Hosted Service section 3). Each grant and session is for one project. */
function refusal(route: Route, who: Principal, project: string): string | undefined {
  if (who.project !== project) return `this ${who.kind === "machine" ? "machine's grant" : "session"} is for project ${who.project}, not ${project}: each is for one project`;
  if (route.who === "upload" && who.kind !== "machine") return "only a machine uploads the files an agent writes";
  if (route.who === "answer" && who.kind !== "session") return "a machine never answers: answers come only from a person signed in in a browser";
  return undefined;
}

async function readJson(request: Request): Promise<unknown | Response> {
  // A form on another site can't send JSON without a preflight, and the relay answers no preflight (no CORS).
  if (!(request.headers.get("content-type") ?? "").startsWith("application/json")) return fail(415, "send application/json");
  const text = await request.text();
  if (text.length > MAX_JSON) return fail(413, "the request is too large");
  try {
    return JSON.parse(text);
  } catch {
    return fail(400, "the request isn't valid JSON");
  }
}

/** The relay's Worker, with the sign-in it's given: `accessFor()` unless a test gives another. */
export async function handleRequest(request: Request, env: Env, access: Access = accessFor(env)): Promise<Response> {
  const url = new URL(request.url);
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
  // whatever it holds, so no token can ever answer (P15 section 3).
  if (route.who === "answer" && request.headers.has("authorization")) {
    return fail(403, "an answer comes only from a person signed in in a browser: a request with an Authorization header is refused, whatever it holds");
  }
  const who = await access.identify(request);
  if (!who) {
    return access === NO_ACCESS
      ? fail(401, "sign-in isn't built yet (M9c), so this relay refuses every request")
      : fail(401, "not signed in: a machine sends its grant's token; a person signs in in a browser");
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
    default: {
      const input = await readJson(request);
      if (input instanceof Response) return input;
      return reply(await stub.answer(project, route.name, input, person!));
    }
  }
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
