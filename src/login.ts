import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { Told, cite } from "./cite.js";
import { CONFIG_PATH } from "./facts.js";
import { isShallow, rootCommits } from "./git.js";
import { randomSuffix } from "./ids.js";
import { userConfigPath } from "./notify.js";
import { MachineGrant, ProjectId, newestFormat, upgradeFile } from "./schema.js";
import type { Store } from "./store.js";

// Signing a machine in to the hosted service (M9d), the CLI's side of M9c's machine grants: OAuth's device flow (RFC 8628)
// at OAuth's standard endpoints (B-t5wxr), one grant per machine and project (B-84e0d), kept in a file only you can read
// (B-gq8j1); refresh tokens that rotate, so the new pair is written before it's used (RFC 9700); and revocation (RFC
// 7009). Linking a repo to a project writes the service, the project and the repo's first commit into its config
// (B-5gnea), which is a gate fact (B-w4g6c); `baesian login` links an unlinked repo as it signs in (B-62qnz). No token
// is ever printed, logged or put in an error.

/** Baesian's own CLI, the service's only client: public, with no secret (RFC 8628 section 3.1). */
export const CLIENT_ID = "baesian-cli";

/**
 * The hosted service `baesian login` links a repo to when neither `--service` nor `$BAESIAN_SERVICE` names one (B-f2mfb).
 * Its approval page names the service and takes a passkey before any card leaves the machine.
 */
export const DEFAULT_SERVICE = "https://baesian.dev";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

/** How long one request to the service may take before it counts as unreachable. */
export const REQUEST_MS = 10_000;

/** The service couldn't be reached: offline, refused, or too slow. Everything local goes on as before. */
export class Offline extends Told {}

/** This machine has no grant that works for the project: never signed in, revoked, lapsed, or signed out. */
export class SignedOut extends Told {}

/** Signing in didn't finish: the person refused, the code expired, or the service said no. */
export class SignInFailed extends Told {}

// ---------------------------------------------------------------- the grant file (B-gq8j1, P16 section 8)

/** Where machine grants are kept: `grants/` beside the personal config (`userConfigPath()`), readable only by you. */
export function grantsDir(): string {
  return join(dirname(userConfigPath()), "grants");
}

/** A project's grant file: `grants/<project>.json`. */
export function grantPath(project: string): string {
  return join(grantsDir(), `${ProjectId.parse(project)}.json`);
}

/**
 * This machine's grant for a project, or undefined when it has none. One that can't be read throws a `SignedOut` that
 * says so, without quoting the file: it holds tokens.
 */
export function readGrant(project: string): MachineGrant | undefined {
  const path = grantPath(project);
  if (!existsSync(path)) return undefined;
  const parsed = (() => {
    try {
      return MachineGrant.safeParse(upgradeFile("grant", JSON.parse(readFileSync(path, "utf8")), path));
    } catch {
      return undefined;
    }
  })();
  if (!parsed?.success) throw new SignedOut(`${path} isn't a grant this Baesian reads: run \`baesian login\` again`);
  return parsed.data;
}

/**
 * Write a grant, whole: to a temporary file created with mode 0600 in the same folder (0700), then renamed over the old,
 * so a reader sees the old tokens or the new, and nobody else can read either (B-gq8j1).
 */
export function writeGrant(grant: MachineGrant): void {
  const path = grantPath(grant.project);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${randomSuffix()}.tmp`;
  const fd = openSync(tmp, "wx", 0o600);
  try {
    writeSync(fd, `${JSON.stringify(MachineGrant.parse(grant), null, 2)}\n`);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, path);
}

/** Delete a project's grant file. Returns whether there was one. */
export function removeGrant(project: string): boolean {
  const path = grantPath(project);
  const was = existsSync(path);
  rmSync(path, { force: true });
  return was;
}

/**
 * Run `fn` holding the project's grant lock, `grants/<project>.lock`, so two commands on this machine never refresh at
 * once: a refresh token is used once, and the service revokes a grant whose refresh token comes back (RFC 9700). A lock
 * older than 30 seconds was left by a command that died, and is taken over.
 */
async function withGrantLock<T>(project: string, fn: () => Promise<T>, sleep: (ms: number) => Promise<void> = realSleep): Promise<T> {
  const lock = `${grantPath(project)}.lock`;
  mkdirSync(dirname(lock), { recursive: true, mode: 0o700 });
  for (let tries = 0; ; tries++) {
    try {
      closeSync(openSync(lock, "wx", 0o600));
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      let age = 0;
      try {
        age = Date.now() - statSync(lock).mtimeMs;
      } catch {
        continue; // gone meanwhile
      }
      if (age > 30_000 || tries > 150) rmSync(lock, { force: true });
      else await sleep(100);
    }
  }
  try {
    return await fn();
  } finally {
    rmSync(lock, { force: true });
  }
}

const realSleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

// ---------------------------------------------------------------- OAuth's endpoints (B-t5wxr)

export interface Http {
  /** The fetch to use: the global one, unless a test gives another. */
  fetch?: typeof fetch;
  /** Stops every request: a command's overall deadline, or Ctrl-C. */
  signal?: AbortSignal;
}

/** POST a form to one of the service's machine addresses, `/v1/machines/<name>`, and read its JSON. */
async function postForm(service: string, name: "device" | "token" | "revoke", fields: Record<string, string>, http: Http): Promise<{ status: number; body: Record<string, unknown> }> {
  const signal = http.signal ? AbortSignal.any([http.signal, AbortSignal.timeout(REQUEST_MS)]) : AbortSignal.timeout(REQUEST_MS);
  let r: Response;
  try {
    r = await (http.fetch ?? fetch)(`${service}/v1/machines/${name}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams(fields).toString(),
      signal,
    });
  } catch (e) {
    throw new Offline(`couldn't reach ${service} (${reason(e)})`);
  }
  const text = await r.text().catch(() => "");
  let body: Record<string, unknown> = {};
  try {
    const v = JSON.parse(text) as unknown;
    if (typeof v === "object" && v !== null && !Array.isArray(v)) body = v as Record<string, unknown>;
  } catch {
    // not JSON: an empty body (revoke), or a page from something that isn't the service
  }
  return { status: r.status, body };
}

/** Why a request failed, in a few words, for a person reading a terminal. */
export function reason(e: unknown): string {
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return "it didn't answer in time";
  const cause = e instanceof Error ? (e.cause as { code?: string; message?: string } | undefined) : undefined;
  return cause?.code ?? cause?.message ?? (e instanceof Error ? e.message : String(e));
}

/** An OAuth error's words: its description if the service gave one, else its code. Never anything the request sent. */
const oauthWords = (body: Record<string, unknown>, status: number) =>
  typeof body.error_description === "string" ? body.error_description : typeof body.error === "string" ? body.error : `HTTP ${status}`;

/** The tokens from a token response (RFC 6749 section 5.1), as a grant for `service`. */
function grantFrom(service: string, project: string, machine: string, body: Record<string, unknown>, now: number): MachineGrant {
  const { access_token, refresh_token, expires_in } = body;
  if (typeof access_token !== "string" || typeof refresh_token !== "string" || typeof expires_in !== "number") {
    throw new SignInFailed("the service's token response is missing its tokens");
  }
  if (body.project !== undefined && body.project !== project) throw new SignInFailed(`the service gave a grant for project ${String(body.project)}, not ${project}`);
  return {
    type: "grant",
    format: newestFormat("grant"),
    service,
    project,
    machine: typeof body.machine === "string" ? body.machine : machine,
    access_token,
    access_expires: new Date(now + expires_in * 1000).toISOString(),
    refresh_token,
  };
}

/** What a person needs to approve this machine: the code, and where to enter it (RFC 8628 section 3.3). */
export interface DeviceCode {
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
}

export interface SignInOptions extends Http {
  service: string;
  project: string;
  /** This machine's name, as the approval page and the Machines page show it (`machineName()`). */
  machine: string;
  /** Show the person the code to approve. */
  onCode: (code: DeviceCode) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/**
 * Sign this machine in to a project through the device flow (RFC 8628, B-t5wxr): ask for a code, show it, and poll until
 * a person approves it in a browser, at the interval the service asks, slowing down when told to. Returns the grant;
 * the caller writes it (`writeGrant()`). Approving a project nobody has yet makes it the approver's (M9c).
 */
export async function signInMachine(o: SignInOptions): Promise<MachineGrant> {
  const now = o.now ?? Date.now;
  const sleep = o.sleep ?? realSleep;
  const d = await postForm(o.service, "device", { client_id: CLIENT_ID, project: o.project, machine: o.machine }, o);
  const { device_code, user_code, verification_uri, verification_uri_complete, expires_in, interval } = d.body;
  if (d.status !== 200 || typeof device_code !== "string" || typeof user_code !== "string" || typeof verification_uri !== "string") {
    throw new SignInFailed(`the service didn't start a sign-in: ${oauthWords(d.body, d.status)}`);
  }
  const lasts = typeof expires_in === "number" ? expires_in : 600;
  o.onCode({ user_code, verification_uri, ...(typeof verification_uri_complete === "string" ? { verification_uri_complete } : {}), expires_in: lasts });
  let every = (typeof interval === "number" ? interval : 5) * 1000;
  const until = now() + lasts * 1000;
  for (;;) {
    await sleep(every);
    if (o.signal?.aborted) throw new SignInFailed("stopped waiting for the sign-in to be approved");
    const t = await postForm(o.service, "token", { grant_type: DEVICE_GRANT, device_code, client_id: CLIENT_ID }, o);
    if (t.status === 200) return grantFrom(o.service, o.project, o.machine, t.body, now());
    const error = t.body.error;
    if (error === "authorization_pending") {
      if (now() > until) throw new SignInFailed("the code expired before anyone approved it: run `baesian login` again");
      continue;
    }
    if (error === "slow_down") {
      every += 5000;
      continue;
    }
    if (error === "access_denied") throw new SignInFailed("the person refused this machine: nothing was signed in");
    if (error === "expired_token") throw new SignInFailed("the code expired before anyone approved it: run `baesian login` again");
    throw new SignInFailed(`the service refused the sign-in: ${oauthWords(t.body, t.status)}`);
  }
}

/**
 * New tokens for a grant (RFC 6749 section 6), holding the project's lock: if another command on this machine refreshed
 * meanwhile, its tokens are taken from the grant file, and the spent refresh token is never sent. The new pair is
 * written before it's returned, so it's never lost between use and save. A grant the service refuses (revoked, lapsed,
 * or its refresh token seen twice) is removed here, and `SignedOut` says to sign in again.
 */
export async function refreshGrant(held: MachineGrant, http: Http = {}): Promise<MachineGrant> {
  return withGrantLock(held.project, async () => {
    const current = readGrant(held.project);
    if (!current || current.service !== held.service) throw new SignedOut(`this machine isn't signed in to project ${held.project} any more: run \`baesian login\``);
    if (current.refresh_token !== held.refresh_token) return current;
    const r = await postForm(current.service, "token", { grant_type: "refresh_token", refresh_token: current.refresh_token, client_id: CLIENT_ID }, http);
    if (r.status === 200) {
      const next = grantFrom(current.service, current.project, current.machine, r.body, Date.now());
      writeGrant(next);
      return next;
    }
    if (r.body.error === "invalid_grant" || r.status === 401) {
      removeGrant(current.project);
      throw new SignedOut(`the service ended this machine's grant for project ${current.project} (${oauthWords(r.body, r.status)}): run \`baesian login\` to sign in again`);
    }
    throw new Offline(`${current.service} couldn't refresh this machine's tokens (${oauthWords(r.body, r.status)})`);
  });
}

/** Revoke a grant on the service (RFC 7009), by its refresh token: its access token goes with it. */
export async function revokeGrant(grant: MachineGrant, http: Http = {}): Promise<void> {
  const r = await postForm(grant.service, "revoke", { token: grant.refresh_token, client_id: CLIENT_ID }, http);
  if (r.status !== 200) throw new Offline(`${grant.service} didn't revoke the grant (${oauthWords(r.body, r.status)})`);
}

/** A name for this machine that the service takes: its hostname, with anything else made a dash, up to 64 characters. */
export function machineName(name: string = hostname()): string {
  const cleaned = name
    .normalize("NFC")
    .replace(/[^\p{L}\p{N} ._-]+/gu, "-")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .slice(0, 64)
    .trim();
  return cleaned || "machine";
}

// ---------------------------------------------------------------- linking a repo (B-5gnea, B-w4g6c, B-62qnz)

/** A new project's ID: random, from Crockford's base32, 100 bits. The CLI picks it; approving it makes it the approver's (M9c). */
export function newProjectId(): string {
  return `p-${randomSuffix(20)}`;
}

/**
 * A project's page on the website (M9e): `/projects/{project}`, as the relay's own addresses name it (B-7z97x). `baesian
 * serve` opens it in a linked repo (D143), and `baesian login` points to it once the machine is in.
 */
export function projectPage(service: string, project: string): string {
  return `${service.replace(/\/+$/, "")}/projects/${encodeURIComponent(project)}`;
}

/** The ack a commit that links the repo needs, since the link is a gate fact (B-w4g6c). */
export function linkAck(service: string, project: string): string {
  return `Baesian-Ack: infra:${CONFIG_PATH} linked this repo to ${service} as project ${project}`;
}

/**
 * The commit a repo's history starts from, which linking records (B-5gnea): with several roots, where unrelated histories
 * were merged, the last `git rev-list` gives, which is the oldest. A shallow clone can't see it, and a repo with no
 * commits has none: linking refuses both.
 */
export function firstCommitToLink(toplevel: string): string {
  if (isShallow(toplevel)) throw new SignInFailed(`linking records the repo's first commit${cite("B-5gnea")}, which a shallow clone can't see: fetch the full history (git fetch --unshallow), then run \`baesian login\` again`);
  const roots = rootCommits(toplevel);
  if (!roots?.length) throw new SignInFailed(`linking records the repo's first commit${cite("B-5gnea")}, and this repo has no commits yet: commit first`);
  return roots.at(-1)!;
}

/**
 * Link a repo to a project (B-62qnz): the service, the project and its first commit in `.baesian/config.json`, keeping
 * the rest. A gate fact when it's committed (B-w4g6c): `linkAck()` is the trailer that covers it. In personal mode
 * (B-4rwyz), in the clone's own config, `.git/baesian/config.json`, with nothing to commit (`Store.setLink`).
 */
export function linkRepo(store: Store, link: { service: string; project: string; first_commit: string }): void {
  store.setLink(link);
}
