import { env, exports } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { Buffer } from "node:buffer";
import type { ApiState } from "../../src/api.js";
import { type RelayEntry, readRelayEntry } from "../../src/schema.js";
import { MemoryStorage } from "../../src/storage.js";
import { Store } from "../../src/store.js";
import { type TrustRoot, parseTrust } from "../../src/trust.js";
import { BODY, draft } from "../../test/helpers.js";
import { type DevGrants, SESSION_COOKIE, readGrants } from "../src/access.js";
import { SqlFileStorage } from "../src/sql-storage.js";
import { RELEASE_HEADER, VERSION } from "../../src/version.js";

// What the relay's tests talk to it with: a machine (its grant's token), a person (a session cookie), or nobody, over
// HTTP through the Worker, as the CLI (M9d) and the website (M9e) will. And a machine's own store, as the CLI's.

export const grants: DevGrants = readGrants(env.BAESIAN_DEV_ACCESS!);
export const ORIGIN = env.SERVICE_ORIGIN;
export const BASE = "https://relay.test";

export type As = "machine" | "person" | "nobody" | { headers: Record<string, string> };

/**
 * Headers for who's asking, in a project: the grant's token, or the session's cookie, for that project. A person's
 * requests come from the website's own pages, so they name its origin, as a browser does (Hosted Service section 3).
 */
export function headersFor(as: As, project = "proj-a"): Record<string, string> {
  if (typeof as === "object") return as.headers;
  if (as === "machine") return { authorization: `Bearer ${grants.machines.find((g) => g.project === project)!.token}`, ...RELEASE };
  if (as === "person") return { cookie: `${SESSION_COOKIE}=${grants.sessions.find((g) => g.project === project)!.cookie}`, origin: ORIGIN };
  return {};
}

/** The release the CLI names on every request (B-4p43b): this one's, as the CLI of this tree sends it. */
export const RELEASE = { [RELEASE_HEADER]: VERSION };

/** A request to the relay's Worker, as a browser or the CLI makes it: with this release's version, unless told otherwise. */
export async function call(method: string, path: string, opts: { as?: As; project?: string; body?: string | Uint8Array; json?: unknown; headers?: Record<string, string> } = {}): Promise<Response> {
  const project = opts.project ?? "proj-a";
  const headers: Record<string, string> = { ...RELEASE, ...headersFor(opts.as ?? "nobody", project), ...(opts.json !== undefined ? { "content-type": "application/json" } : {}), ...opts.headers };
  const body = opts.json !== undefined ? JSON.stringify(opts.json) : opts.body;
  return exports.default.fetch(new Request(`${BASE}/v1/projects/${project}/${path}`, { method, headers, ...(body !== undefined ? { body } : {}) }));
}

/** A machine uploads a file of its live layer, by path. */
export const upload = (path: string, bytes: Uint8Array | string, opts: { as?: As; project?: string } = {}) =>
  call("PUT", `files/${path}`, { as: opts.as ?? "machine", ...(opts.project ? { project: opts.project } : {}), body: typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes });

/** A person answers a card. */
export const answer = (input: Record<string, unknown>, project = "proj-a") => call("POST", "verdicts", { as: "person", project, json: input });

/** The whole log, read in pages as the CLI will pull it (M9d). */
export async function pullLog(project = "proj-a", after = 0): Promise<RelayEntry[]> {
  const out: RelayEntry[] = [];
  for (;;) {
    const r = await call("GET", `log?after=${after}`, { as: "machine", project });
    const page = (await r.json()) as { entries: unknown[]; more: boolean };
    out.push(...page.entries.map(readRelayEntry));
    if (!page.more || !page.entries.length) return out;
    after = out.at(-1)!.seq;
  }
}

/** The state, as the website's client reads it. */
export async function state(project = "proj-a"): Promise<ApiState> {
  return (await (await call("GET", "state", { as: "person", project })).json()) as ApiState;
}

/** A machine's live layer: memory, filled from the log as the CLI's pull will write it (each file with its `.sig`). */
export function pulled(entries: RelayEntry[], into = new MemoryStorage()): MemoryStorage {
  for (const e of entries) {
    if (!e.body || into.read(e.path)) continue;
    if (e.sig) into.create(`${e.path}.sig`, Buffer.from(e.sig, "base64"));
    into.create(e.path, Buffer.from(e.body, "base64"));
  }
  return into;
}

/** The service's key as CI pins it (D142): the service key file from the log, its JSON on a line. */
export function pinFrom(entries: RelayEntry[]): TrustRoot {
  const key = entries.find((e) => e.path.startsWith("trust/service-"))!;
  return parseTrust(Buffer.from(key.body!, "base64").toString("utf8").replace(/\n/g, " "), "the test pin");
}

/** A machine's store, as the CLI's on `main`, linked to the project; hosted once it pins the service's key. */
export function machineStore(storage = new MemoryStorage(), project = "proj-a", pinned: TrustRoot | null = null): Store {
  return Store.over(storage, { branch: "main", config: { service: ORIGIN, project }, trust: { pinned } });
}

/** File a card in a machine's store, of its own title and topic, and return its ID. */
let n = 0;
export function fileCard(store: Store, over: Record<string, unknown> = {}): string {
  n += 1;
  return store.fileCard(draft({ title: `Decision ${n} on its own`, question: `Question ${n}?`, topic: `area${n}/q`, ...over }), BODY, { agent: "claude-code", force: true }).card.meta.id;
}

/** Upload everything a machine's store holds that the relay doesn't, in the order the CLI will: decks, then cards. */
export async function push(store: Store, project = "proj-a"): Promise<Response[]> {
  const mem = store.storage as MemoryStorage;
  const order = (p: string) => (p.startsWith("decks/") ? 0 : /\/r\d+\.md$/.test(p) ? 1 : 2);
  const paths = mem.paths().filter((p) => /^(decks|cards|attachments)\//.test(p) && !p.endsWith(".sig") && !p.endsWith("-relay.json"));
  const out: Response[] = [];
  for (const p of paths.sort((a, b) => order(a) - order(b) || a.localeCompare(b))) out.push(await upload(p, mem.read(p)!, { project }));
  return out;
}

/** Every file the project's object holds, mutable ones too, read inside it. */
export async function relayFiles(project = "proj-a"): Promise<MemoryStorage> {
  const mem = new MemoryStorage();
  await runInDurableObject(env.PROJECTS.get(env.PROJECTS.idFromName(project)), (_i, s) => {
    for (const f of new SqlFileStorage(s.storage).files()) mem.create(f.path, f.bytes);
  });
  return mem;
}
