import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isShallow, rootCommits } from "./git.js";
import { type Http, Offline, REQUEST_MS, SignedOut, readGrant, reason, refreshGrant } from "./login.js";
import type { Op, WaitResult } from "./ops.js";
import { waitOp } from "./ops.js";
import { CARD_ID, CardDraft, type Config, type MachineGrant, Presence, type RelayEntry, RelayState, newestFormat, readRelayEntry, upgradeFile } from "./schema.js";
import { alreadyExists, checkPath } from "./storage.js";
import type { Store } from "./store.js";
import type { WaitOptions } from "./wait.js";

// The CLI's side of the relay (M9d, Hosted Service sections 1 and 2): pulling the project's log into the live layer, as
// if each file had been written here; pushing the files an agent writes, in order; `relay.json`, what this machine
// keeps of the relay (P16 section 8); and, while `baesian wait` runs, the relay's live socket (B-bv49e) and the waiting
// marker's heartbeat. There's no daemon: the commands sync when they already touch the live layer (`syncRelay()`,
// `aroundFiling()`, `waitWithRelay()`). Offline, or signed out, everything local works as before, and what's new goes up
// at the next command that reaches the relay. What counts is the store's to say: in a hosted repo, only what the service
// signed (D138), and what was in the record when the repo was linked (B-45xz8). Those answers from before linking go up
// once, at first link, before anyone answers on the website (B-3zjjx).

/** `relay.json` in the live layer. */
export const RELAY_STATE = "relay.json";

/** The live layer's top folders a relay's log may write into: the files it holds. Never presence, cursors or markers. */
const PULLED = new Set(["cards", "decks", "verdicts", "rules", "topics", "preferences", "trust", "attachments"]);

const ID = CARD_ID.source.replace(/^\^|\$$/g, "");
const REVISION = new RegExp(`^cards/(${ID})/r(\\d+)\\.md$`);
const CARD_FILE = new RegExp(`^cards/(${ID})/(?:gate-r\\d+-cli\\.json|withdrawn\\.json|fallback-[0-9a-z]+\\.json)$`);
const ATTACHMENT = new RegExp(`^attachments/(${ID})-[0-9a-z]+\\.json$`);
const DECK = /^decks\/[a-z0-9][a-z0-9-]*\.md$/;

/**
 * Whether a live-layer file is one of the kinds an agent writes, which a machine pushes (Hosted Service section 1): card
 * revisions, the CLI's gate records, withdrawals, fallbacks, attachments and decks. Waiting markers go up only while
 * `baesian wait` runs. Everything a person writes comes down, signed, and never goes up.
 */
export function agentWritten(rel: string): boolean {
  return DECK.test(rel) || REVISION.test(rel) || CARD_FILE.test(rel) || ATTACHMENT.test(rel);
}

/** The card a file belongs to, if any. */
const cardOf = (rel: string) => (REVISION.exec(rel) ?? CARD_FILE.exec(rel) ?? ATTACHMENT.exec(rel))?.[1];

const encode = (text: string) => new TextEncoder().encode(text);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const same = (a: Uint8Array, b: Uint8Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength));
const encodePath = (rel: string) => rel.split("/").map(encodeURIComponent).join("/");

/** The relay answered, but not as hoped: a refusal that isn't about the grant. */
export class RelayError extends Error {}

// ---------------------------------------------------------------- the relay's addresses (B-7z97x)

/**
 * A machine's client for one project's relay: every address under `/v1/projects/{project}/`, with the grant's access
 * token as `Authorization: Bearer`. The token is refreshed when it's within a minute of expiring, and on a 401: unless
 * another command on this machine refreshed meanwhile, whose tokens it then takes from the grant file.
 */
export class RelayClient {
  constructor(
    private grant: MachineGrant,
    private readonly http: Http = {},
  ) {}

  get service(): string {
    return this.grant.service;
  }

  get project(): string {
    return this.grant.project;
  }

  /** The access token, refreshed first when it has less than a minute left. */
  async token(): Promise<string> {
    if (Date.parse(this.grant.access_expires) - Date.now() < 60_000) this.grant = await refreshGrant(this.grant, this.http);
    return this.grant.access_token;
  }

  /** One request to the project's relay: its status and its JSON, if any. */
  async request(method: "GET" | "PUT" | "DELETE", rest: string, body?: Uint8Array): Promise<{ status: number; json: unknown }> {
    for (let attempt = 0; ; attempt++) {
      const token = await this.token();
      const signal = this.http.signal ? AbortSignal.any([this.http.signal, AbortSignal.timeout(REQUEST_MS)]) : AbortSignal.timeout(REQUEST_MS);
      let r: Response;
      try {
        r = await (this.http.fetch ?? fetch)(`${this.service}/v1/projects/${encodeURIComponent(this.project)}/${rest}`, {
          method,
          headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(body ? { "content-type": "application/octet-stream" } : {}) },
          ...(body ? { body } : {}),
          signal,
        });
      } catch (e) {
        throw new Offline(`couldn't reach ${this.service} (${reason(e)})`);
      }
      if (r.status === 401 && attempt === 0) {
        await r.body?.cancel();
        const current = readGrant(this.project);
        if (!current || current.service !== this.service) throw new SignedOut(`this machine isn't signed in to project ${this.project} any more`);
        this.grant = current.access_token !== token ? current : await refreshGrant(current, this.http);
        continue;
      }
      if (r.status === 401) throw new SignedOut(`${this.service} refused this machine's grant for project ${this.project}`);
      const text = await r.text().catch(() => "");
      let json: unknown;
      try {
        json = text ? JSON.parse(text) : undefined;
      } catch {
        json = undefined;
      }
      return { status: r.status, json };
    }
  }

  /** The live updates' address (B-bv49e), as a WebSocket URL. */
  liveUrl(): string {
    return `${this.service.replace(/^http/, "ws")}/v1/projects/${encodeURIComponent(this.project)}/live`;
  }
}

/** A relay's refusal, in its own words. */
const errorOf = (r: { status: number; json: unknown }) => {
  const e = (r.json as { error?: unknown } | undefined)?.error;
  return typeof e === "string" ? e.split("\n")[0]! : `HTTP ${r.status}`;
};

// ---------------------------------------------------------------- is this repo linked, and is this machine in?

/** A repo's link to a project, if it has one: off, stopped (a copy, B-5gnea), signed out, or on. */
export type Link = { kind: "off" } | { kind: "stopped" | "signed-out"; why: string } | { kind: "on"; client: RelayClient };

/**
 * Why this checkout mustn't sync with the project its config names (B-5gnea), or nothing: its history must start at the
 * project's first commit, so a copy, such as one made from a template, doesn't mix its cards with the original's. A
 * shallow clone can't see its first commit, and skips the check.
 */
export function linkProblem(store: Store, c: Config = store.config()): string | undefined {
  if (!c.project || !store.hasRepo) return undefined;
  if (!c.first_commit) return `\`.baesian/config.json\` names project ${c.project} but not the repo's first commit, so this checkout can't be told from a copy (B-5gnea): run \`baesian login\` to link it again`;
  const top = store.repo.toplevel;
  if (isShallow(top)) return undefined;
  const roots = rootCommits(top);
  if (!roots) return `this checkout has no commits yet, so it can't be checked against project ${c.project}'s first commit (B-5gnea): it doesn't sync until it has one`;
  if (roots.includes(c.first_commit)) return undefined;
  return `this checkout's history doesn't start at project ${c.project}'s first commit (${c.first_commit.slice(0, 12)}), so it's a copy of that repo, such as one made from a template, not the repo itself: it doesn't sync with that project (B-5gnea). Run \`baesian login\` to link it to a project of its own.`;
}

/** Whether this repo syncs, and if it does, the client to sync with: the config's service and project, and this machine's grant. */
export function relayFor(store: Store, http: Http = {}): Link {
  const c = store.config();
  if (!c.service || !c.project) return { kind: "off" };
  const problem = linkProblem(store, c);
  if (problem) return { kind: "stopped", why: `relay: ${problem}` };
  let grant: MachineGrant | undefined;
  try {
    grant = readGrant(c.project);
  } catch (e) {
    return { kind: "signed-out", why: `relay: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!grant || grant.service !== c.service) {
    return {
      kind: "signed-out",
      why: `relay: this machine isn't signed in to project ${c.project} on ${c.service}, so nothing goes to the reviewer or comes back: ask the person to run \`baesian login\` here. Everything else works as before.`,
    };
  }
  return { kind: "on", client: new RelayClient(grant, http) };
}

// ---------------------------------------------------------------- relay.json (P16 section 8)

/** What a sync works with: `relay.json`, its `uploaded` as a set. */
interface Working {
  service: string;
  project: string;
  pulled: number;
  uploaded: Set<string>;
}

/** This machine's state for a relay, from `relay.json`; afresh when there's none, or it's for another relay, or unreadable. */
export function readRelayState(store: Store, service: string, project: string): RelayState {
  const fresh: RelayState = { type: "relay", format: newestFormat("relay"), service, project, pulled: 0, uploaded: [], at: new Date(0).toISOString() };
  const bytes = store.storage.read(RELAY_STATE);
  if (!bytes) return fresh;
  try {
    const s = RelayState.parse(upgradeFile("relay", JSON.parse(Buffer.from(bytes).toString("utf8")), RELAY_STATE));
    return s.service === service && s.project === project ? s : fresh;
  } catch {
    // unreadable, or a newer Baesian's: pulling again from the start is harmless, since every file is written once
    return fresh;
  }
}

/** Replace `relay.json` whole (`Storage.replace`): a reader sees the old state or the new. */
function saveState(store: Store, w: Working): void {
  const state = RelayState.parse({ type: "relay", format: newestFormat("relay"), service: w.service, project: w.project, pulled: w.pulled, uploaded: [...w.uploaded].sort(), at: new Date().toISOString() });
  store.storage.replace(RELAY_STATE, encode(`${JSON.stringify(state, null, 2)}\n`));
}

// ---------------------------------------------------------------- pulling and pushing

/** What a sync did, and what the agent should be told. */
export interface SyncReport {
  /** `off`: the repo isn't linked; `stopped`: a copy (B-5gnea); `signed-out`; `offline`: the relay couldn't be reached or refused; `synced`. */
  state: "off" | "stopped" | "signed-out" | "offline" | "synced";
  /** Lines for the agent: why it didn't sync, and anything the relay refused or changed. */
  notes: string[];
  /** Files written into the live layer from the relay. */
  pulled: string[];
  /** Files the relay took. */
  pushed: string[];
  /** Files here that another machine wrote first, with other bytes: the relay's copy replaced this machine's. */
  replaced: string[];
  /** New cards whose ID another machine's card had taken on the relay, filed again under a new one. */
  renamed: { from: string; to: string }[];
}

const report = (state: SyncReport["state"], notes: string[] = []): SyncReport => ({ state, notes, pulled: [], pushed: [], replaced: [], renamed: [] });

/** A card about to be filed again under a new ID, since another machine's new card took its ID on the relay. */
interface Refile {
  id: string;
  draft: Record<string, unknown>;
  body: string;
  agent: string;
  withdrawn: boolean;
}

/** One sync's work in progress: what it pulled and pushed, and the cards to file again once the pull is done. */
interface Run {
  w: Working;
  out: SyncReport;
  refiles: Refile[];
}

/**
 * Take a card whose ID another machine's card took on the relay out of this machine's layer and record, keeping what its
 * agent filed, so the relay's card can come down under that ID, and this one be filed again under a new one.
 */
function takeOut(store: Store, id: string): Refile | undefined {
  const latest = store.card(id);
  if (!latest) return undefined;
  const asked = store.gateRecordBy(id, latest.meta.revision, "cli")?.asked;
  const fields = new Set(Object.keys(CardDraft.shape));
  const draft = Object.fromEntries(Object.entries(latest.meta).filter(([k]) => fields.has(k) && k !== "level" && k !== "type" && k !== "format"));
  const out: Refile = { id, draft: { ...draft, ...(asked ? { level: asked } : {}) }, body: latest.body, agent: latest.meta.source_agent, withdrawn: store.withdrawal(id) !== undefined };
  for (const f of store.storage.list(`cards/${id}`)) {
    const rel = `cards/${id}/${f}`;
    const bytes = store.storage.read(rel);
    store.storage.remove(rel);
    if (!store.hasRepo || !bytes) continue;
    const copy = join(store.record, "cards", id, f);
    if (existsSync(copy) && same(readFileSync(copy), bytes)) rmSync(copy);
  }
  if (store.hasRepo) {
    const dir = join(store.record, "cards", id);
    if (existsSync(dir) && readdirSync(dir).length === 0) rmdirSync(dir);
  }
  return out;
}

/**
 * Write a file the relay sent, as if it had been written here: an exclusive create. If this machine wrote other bytes at
 * that path first, the relay's copy is everyone's, so it replaces this one, in the worktree's record too, and the agent
 * is told: a revision was revised on another machine first, as the local API's 409 says of a stale verdict. A card's
 * first revision means another machine's new card took this one's ID: this one is taken out, to be filed again.
 */
function put(store: Store, rel: string, bytes: Uint8Array, run: Run): void {
  try {
    store.storage.create(rel, bytes);
    run.out.pulled.push(rel);
    return;
  } catch (e) {
    if (!alreadyExists(e)) throw e;
  }
  const here = store.storage.read(rel);
  if (here && same(here, bytes)) return;
  const m = REVISION.exec(rel);
  const taken = m?.[2] === "1" && !run.w.uploaded.has(rel) ? takeOut(store, m[1]!) : undefined;
  if (taken) {
    run.refiles.push(taken);
    store.storage.create(rel, bytes);
    run.out.pulled.push(rel);
    return;
  }
  store.storage.replace(rel, bytes);
  if (store.hasRepo && here) {
    const copy = join(store.record, ...rel.split("/"));
    if (existsSync(copy) && same(readFileSync(copy), here)) writeFileSync(copy, bytes);
  }
  run.out.replaced.push(rel);
  run.out.notes.push(
    m
      ? `relay: ${m[1]} r${m[2]} was revised on another machine first, so yours wasn't sent, and the relay's r${m[2]} replaces it here: read it with \`baesian show ${m[1]}\`, and if yours still applies, revise again once it's returned to you`
      : `relay: ${rel} was written first by another machine, with other bytes: the relay's copy replaces this machine's`,
  );
}

/** Apply one entry of the relay's log: its file, with its `.sig` written first, so no reader sees it signed but without one. */
function apply(store: Store, e: RelayEntry, run: Run): void {
  let rel: string;
  try {
    rel = checkPath(e.path);
  } catch {
    run.out.notes.push(`relay: skipped an entry that isn't a path in the live layer (${JSON.stringify(e.path)})`);
    return;
  }
  if (!PULLED.has(rel.split("/")[0]!) || rel.endsWith(".sig") || rel.endsWith(".tmp")) {
    run.out.notes.push(`relay: skipped ${rel}, which isn't a kind of file the relay holds`);
    return;
  }
  // Its body is dropped once it's delivered and its card resolved (D137): nothing to write.
  if (e.body === undefined) return;
  const bytes = Buffer.from(e.body, "base64");
  if (bytes.byteLength !== e.size || sha256(bytes) !== e.digest) {
    run.out.notes.push(`relay: skipped ${rel}, whose bytes don't match the digest its entry gives`);
    return;
  }
  if (e.sig !== undefined) put(store, `${rel}.sig`, Buffer.from(e.sig, "base64"), run);
  put(store, rel, bytes, run);
  // An answer from before linking another machine uploaded (B-3zjjx) is one the relay has: this machine counts it only
  // where its own record at the linking commit holds it (B-45xz8).
  if (agentWritten(rel) || e.before_linking) run.w.uploaded.add(rel);
}

/**
 * Pull the log after the last sequence number pulled, page by page (`GET log`), into the live layer; then file again,
 * under new IDs, the cards whose IDs another machine's cards took.
 */
async function pull(store: Store, client: RelayClient, run: Run): Promise<void> {
  for (;;) {
    const r = await client.request("GET", `log?after=${run.w.pulled}`);
    if (r.status !== 200) throw new RelayError(`the relay didn't give its log (${errorOf(r)})`);
    const page = r.json as { entries?: unknown[]; more?: boolean } | undefined;
    const entries = Array.isArray(page?.entries) ? page.entries : [];
    for (const raw of entries) {
      const e = readRelayEntry(raw);
      apply(store, e, run);
      run.w.pulled = Math.max(run.w.pulled, e.seq);
    }
    if (!page?.more || !entries.length) break;
  }
  for (const r of run.refiles.splice(0)) {
    if (r.withdrawn) {
      run.out.notes.push(`relay: ${r.id} was already taken on the relay by another machine's card; yours was withdrawn, so it isn't filed again`);
      continue;
    }
    const to = store.fileCard(r.draft, r.body, { agent: r.agent, force: true }).card.meta.id;
    run.out.renamed.push({ from: r.id, to });
    run.out.notes.push(`relay: ${r.id} was already taken on the relay by another machine's card, so yours is filed again as ${to}: use ${to} from now on (\`baesian show ${to}\`)`);
  }
}

/**
 * The agent-written files the relay doesn't have yet, in the order it takes them (M9c): decks first, then card
 * revisions, each card's in order, then the rest (the CLI's gate records, withdrawals, fallbacks, attachments). When a
 * repo is first linked, that's every one in the live layer (B-6k0rk).
 */
export function unsent(store: Store, uploaded: ReadonlySet<string>): string[] {
  const list = (dir: string) => store.storage.list(dir).sort();
  const decks = list("decks").map((f) => `decks/${f}`).filter((p) => DECK.test(p));
  const revisions: string[] = [];
  const rest: string[] = [];
  for (const id of list("cards")) {
    const files = list(`cards/${id}`).map((f) => `cards/${id}/${f}`);
    const revs = files.flatMap((p) => {
      const m = REVISION.exec(p);
      return m ? [{ p, n: Number(m[2]) }] : [];
    });
    revisions.push(...revs.sort((a, b) => a.n - b.n).map((r) => r.p));
    rest.push(...files.filter((p) => CARD_FILE.test(p)));
  }
  rest.push(...list("attachments").map((f) => `attachments/${f}`).filter((p) => ATTACHMENT.test(p)));
  return [...decks, ...revisions, ...rest].filter((p) => !uploaded.has(p));
}

/** The folders of what a person writes: answers, rules, topic merges and preference files (Hosted Service section 3). */
const ANSWERS = ["verdicts", "rules", "topics", "preferences"];

/**
 * Whether someone has answered on the website, as far as this machine has pulled: anything in the answers' folders with
 * the service's signature. The relay then takes no more answers from before linking (B-3zjjx), so none are offered.
 */
function answeredOnWebsite(store: Store): boolean {
  return ANSWERS.some((dir) => store.storage.list(dir).some((f) => f.endsWith(".sig")));
}

/**
 * The answers, rules, topic merges and preference files from before linking that the relay doesn't have yet (B-3zjjx):
 * those that count here as B-45xz8 counts them, in the order it takes them. None once someone has answered on the website.
 */
export function unsentBeforeLinking(store: Store, uploaded: ReadonlySet<string>): string[] {
  if (answeredOnWebsite(store)) return [];
  return store.answersFromBeforeLinking().filter((p) => !uploaded.has(p));
}

/**
 * Push what the relay doesn't have yet: what agents wrote, then, at first link, the answers from before linking
 * (B-3zjjx). A file another machine wrote first, with other bytes, is refused (409); the pull that follows brings the
 * relay's copy, and tells the agent (`put()`). Anything else refused stays here, and is offered again at the next sync.
 * Returns whether anything was refused for being written elsewhere first.
 */
async function push(store: Store, client: RelayClient, run: Run): Promise<boolean> {
  const blocked = new Set<string>();
  let conflicted = false;
  for (const rel of unsent(store, run.w.uploaded)) {
    const card = cardOf(rel);
    if (card && blocked.has(card)) continue;
    const bytes = store.storage.read(rel);
    if (!bytes) continue;
    const r = await client.request("PUT", `files/${encodePath(rel)}`, bytes);
    if (r.status === 200 || r.status === 201) {
      run.w.uploaded.add(rel);
      run.out.pushed.push(rel);
      continue;
    }
    if (card) blocked.add(card);
    if (r.status === 503) throw new RelayError(`the relay can't take files just now (${errorOf(r)})`);
    if (r.status === 409) conflicted = true;
    else run.out.notes.push(`relay: refused ${rel} (${errorOf(r)}); it stays here, and is offered again at the next sync`);
  }
  for (const rel of unsentBeforeLinking(store, run.w.uploaded)) {
    const bytes = store.storage.read(rel);
    if (!bytes) continue;
    const r = await client.request("PUT", `files/${encodePath(rel)}`, bytes);
    if (r.status === 200 || r.status === 201) {
      run.w.uploaded.add(rel);
      run.out.pushed.push(rel);
      continue;
    }
    if (r.status === 503) throw new RelayError(`the relay can't take files just now (${errorOf(r)})`);
    if ((r.json as { before_linking?: unknown } | undefined)?.before_linking === "closed") {
      run.out.notes.push("relay: someone has answered on the website, so the answers from before linking that hadn't gone up stay in git, where they still count (B-45xz8); the website shows their cards as waiting (B-3zjjx)");
      break;
    }
    run.out.notes.push(`relay: refused ${rel}, from before linking (${errorOf(r)}); it stays here, and is offered again at the next sync`);
  }
  return conflicted;
}

/** Pull, push, or both, with this client, keeping `relay.json` up to date with whatever got done. */
async function syncWith(store: Store, client: RelayClient, o: { pull: boolean; push: boolean }): Promise<SyncReport> {
  const s = readRelayState(store, client.service, client.project);
  const run: Run = { w: { service: s.service, project: s.project, pulled: s.pulled, uploaded: new Set(s.uploaded) }, out: report("synced"), refiles: [] };
  try {
    if (o.pull) await pull(store, client, run);
    // A push refused for what another machine wrote first pulls the relay's copy, then pushes again: a card filed again
    // under a new ID goes up in the next round.
    if (o.push) for (let round = 0; round < 3 && (await push(store, client, run)); round++) await pull(store, client, run);
  } catch (e) {
    run.out.state = e instanceof SignedOut ? "signed-out" : "offline";
    run.out.notes.push(failureNote(e, client.service));
  } finally {
    saveState(store, run.w);
  }
  return run.out;
}

/** What the agent is told when a sync couldn't finish. */
function failureNote(e: unknown, service: string): string {
  if (e instanceof Offline) return `relay: ${e.message}. Everything here works as before; what's new goes up at the next command that reaches the relay.`;
  if (e instanceof SignedOut) return `relay: ${e.message}. Ask the person to run \`baesian login\` here; until then nothing goes to the reviewer or comes back.`;
  return `relay: syncing with ${service} stopped: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`;
}

export interface SyncOptions extends Http {
  /** Pull the relay's log first. Default true. */
  pull?: boolean;
  /** Then push what the relay doesn't have. Default true. */
  push?: boolean;
}

/**
 * Sync this repo with its relay, if it's linked: pull, then push. Never throws for the network, the grant or the relay:
 * what went wrong is in the report's notes, and the live layer works as before. A repo that isn't linked does nothing.
 */
export async function syncRelay(store: Store, o: SyncOptions = {}): Promise<SyncReport> {
  const link = relayFor(store, o);
  if (link.kind === "off") return report("off");
  if (link.kind !== "on") return report(link.kind, [link.why]);
  return syncWith(store, link.client, { pull: o.pull ?? true, push: o.push ?? true });
}

/**
 * A filing command (Hosted Service section 1): pull first, so the filing check sees other machines' open cards (D36),
 * then run it, then push what it wrote. When the pull couldn't reach the relay, the push isn't tried: the command doesn't
 * wait twice. Returns what the command returned, and the notes for the agent.
 */
export async function aroundFiling<T>(store: Store, op: () => T | Promise<T>, http: Http = {}): Promise<{ value: T; notes: string[] }> {
  const before = await syncRelay(store, { ...http, push: false });
  const value = await op();
  const after = before.state === "synced" ? await syncRelay(store, { ...http, pull: false }) : undefined;
  return { value, notes: [...before.notes, ...(after?.notes ?? [])] };
}

// ---------------------------------------------------------------- waiting on the relay (B-bv49e)

/** How long a closed or failed live socket waits before it's opened again, by attempt. */
const RECONNECT_MS = [1000, 2000, 5000, 10_000];

/**
 * While `baesian wait` runs in a linked repo: the relay's live socket, `GET /v1/projects/{p}/live`, whose `changed`
 * messages each start a pull, so an answer reaches the live layer within a moment and the wait's own poll finds it; the
 * waiting marker, sent up with each beat and removed when the wait ends (D90); and the reviewer's presence from the
 * relay's state, written into the live layer when it's newer, so the wait knows when they're away (D41).
 */
class Listener {
  private ws: WebSocket | undefined;
  private closed = false;
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pulling: Promise<void> | undefined;
  private again = false;
  private queue: Promise<unknown> = Promise.resolve();
  readonly notes: string[] = [];

  constructor(
    private readonly store: Store,
    private readonly client: RelayClient,
  ) {}

  /** Open the socket. A failure is retried until the wait ends; the wait goes on either way. */
  async open(): Promise<void> {
    if (this.closed) return;
    let token: string;
    try {
      token = await this.client.token();
    } catch (e) {
      this.note(e);
      return this.retry();
    }
    if (this.closed) return;
    const ws = new WebSocket(this.client.liveUrl(), { headers: { authorization: `Bearer ${token}` } });
    this.ws = ws;
    ws.onopen = () => {
      this.attempts = 0;
    };
    ws.onmessage = (m) => {
      try {
        if ((JSON.parse(String(m.data)) as { type?: unknown }).type === "changed") this.pull();
      } catch {
        // not a message the relay sends: ignored
      }
    };
    ws.onclose = () => {
      if (this.ws === ws) this.ws = undefined;
      this.retry();
    };
    ws.onerror = () => {
      // onclose follows, and retries
    };
  }

  private retry(): void {
    if (this.closed || this.timer) return;
    const ms = RECONNECT_MS[Math.min(this.attempts++, RECONNECT_MS.length - 1)]!;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.open();
    }, ms);
  }

  private note(e: unknown): void {
    const line = failureNote(e, this.client.service);
    if (!this.notes.includes(line)) this.notes.push(line);
  }

  /** Pull now, or once more after the pull that's running: changes that come while pulling aren't missed. */
  pull(): void {
    if (this.pulling) {
      this.again = true;
      return;
    }
    this.pulling = (async () => {
      do {
        this.again = false;
        const r = await syncWith(this.store, this.client, { pull: true, push: false });
        for (const n of r.notes) if (!this.notes.includes(n)) this.notes.push(n);
      } while (this.again && !this.closed);
    })().finally(() => {
      this.pulling = undefined;
    });
  }

  /** The waiting marker, written or refreshed (PUT, with the presence read afresh) or removed (DELETE), in order. */
  marker(m: { path: string; removed: boolean }): void {
    this.queue = this.queue
      .then(async () => {
        if (m.removed) {
          await this.client.request("DELETE", `files/${encodePath(m.path)}`);
          return;
        }
        const bytes = this.store.storage.read(m.path);
        if (bytes) await this.client.request("PUT", `files/${encodePath(m.path)}`, bytes);
        await this.presence();
      })
      .catch((e) => this.note(e));
  }

  /** The reviewer's presence on the relay (`GET state`), into the live layer when it's newer than what's there. */
  private async presence(): Promise<void> {
    const r = await this.client.request("GET", "state");
    if (r.status !== 200) return;
    const p = Presence.safeParse((r.json as { presence?: unknown } | undefined)?.presence);
    if (!p.success) return;
    const here = this.store.presence();
    if (here && Date.parse(here.at) >= Date.parse(p.data.at)) return;
    this.store.storage.replace("presence.json", encode(`${JSON.stringify(p.data)}\n`));
  }

  /** Close the socket and stop retrying; let the marker's removal and a pull in progress finish, for a few seconds at most. */
  async close(): Promise<void> {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    try {
      this.ws?.close();
    } catch {
      // already closing
    }
    let limit: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([Promise.all([this.queue, this.pulling]), new Promise<void>((done) => (limit = setTimeout(done, 3000)))]);
    clearTimeout(limit);
  }
}

/**
 * `baesian wait` in a linked repo (B-bv49e): sync first, so the card is on the relay and any answer already given is
 * here; then wait as ever, with the relay's live socket starting a pull at each change, and the waiting marker going up
 * as a heartbeat. Offline or signed out, it waits on the live layer alone, as before.
 */
export async function waitWithRelay(store: Store, id: string, opts: WaitOptions, http: Http = {}): Promise<{ op: Op<WaitResult>; notes: string[] }> {
  const link = relayFor(store, http);
  if (link.kind === "off") return { op: await waitOp(store, id, opts), notes: [] };
  if (link.kind !== "on") return { op: await waitOp(store, id, opts), notes: [link.why] };
  const first = await syncWith(store, link.client, { pull: true, push: true });
  if (first.state !== "synced") return { op: await waitOp(store, id, opts), notes: first.notes };
  const live = new Listener(store, link.client);
  await live.open();
  try {
    const op = await waitOp(store, id, {
      ...opts,
      onMarker: (m) => {
        live.marker(m);
        opts.onMarker?.(m);
      },
    });
    return { op, notes: [...first.notes, ...live.notes] };
  } finally {
    await live.close();
  }
}
