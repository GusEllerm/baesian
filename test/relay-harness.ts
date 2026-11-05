import { type KeyObject, generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The real relay (M9b, M9c), run locally for the CLI's tests (M9d): the service's own Worker, from service/wrangler.jsonc,
// started in workerd by Wrangler's `unstable_startWorker`, from the service's own packages. Its accounts database gets
// its migrations first. Its signing key and the stand-in's sessions (one person, in a few projects) are made fresh for
// each run, as the service's tests make theirs; nothing reaches a network but 127.0.0.1. When the service's packages
// aren't installed (`npm ci --prefix service`), `relayAvailable` is false and these tests are skipped.

export const SERVICE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "service");
const WRANGLER = join(SERVICE_DIR, "node_modules", "wrangler", "wrangler-dist", "cli.js");

export const relayAvailable = existsSync(WRANGLER);

/** The website's origin in `service/wrangler.jsonc`: a person's requests name it, as a browser's do. */
export const SITE = "https://baesian.test";

/** The person, and the projects the stand-in lets them answer in, as a session cookie each. */
export const PERSON = { account: "acct-gus", handle: "gus" };
export const PROJECTS = ["proj-1", "proj-2", "proj-3", "proj-4", "proj-5", "proj-6", "proj-7", "proj-8", "proj-9", "proj-10", "proj-11", "proj-12", "proj-13"];

export interface D1Like {
  prepare(sql: string): { bind(...values: unknown[]): { run(): Promise<unknown>; first<T>(): Promise<T | null>; all<T>(): Promise<{ results: T[] }> }; run(): Promise<unknown> };
}

export interface LocalRelay {
  /** The Worker's address, http://127.0.0.1:<port>: what a linked repo's config names as its service. */
  url: string;
  db: D1Like;
  /** The relay's signing key, made for the run: a test signs with it what the service would write, such as a passkey's key file. */
  signingKey: KeyObject;
  /** Approve a machine's code, as a person with a fresh passkey check would on the website: their project if it's new. */
  approve(userCode: string): Promise<void>;
  /** Refuse a machine's code. */
  deny(userCode: string): Promise<void>;
  /** A person's request to a project's address, from the website's own page. */
  person(project: string, method: string, rest: string, body?: unknown): Promise<Response>;
  dispose(): Promise<void>;
}

/** The accounts database's migrations (service/migrations), in order, as `wrangler d1 migrations apply` applies them. */
export async function applyMigrations(db: D1Like): Promise<void> {
  const dir = join(SERVICE_DIR, "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(dir, file), "utf8");
    for (const statement of sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) await db.prepare(statement).run();
  }
}

export async function startRelay(): Promise<LocalRelay> {
  process.env.WRANGLER_SEND_METRICS = "false";
  const { unstable_startWorker } = (await import(pathToFileURL(WRANGLER).href)) as { unstable_startWorker: (o: unknown) => Promise<any> };
  const persist = mkdtempSync(join(tmpdir(), "baesian-relay-"));
  mkdirSync(join(persist, "site"));
  const sessions = PROJECTS.map((project) => ({ cookie: randomBytes(24).toString("base64url"), ...PERSON, project }));
  const signingKey = generateKeyPairSync("ed25519").privateKey;
  const worker = await unstable_startWorker({
    config: join(SERVICE_DIR, "wrangler.jsonc"),
    // The CLI's tests don't open the website (M9e), and its build may not be there yet: an empty folder in its place.
    assets: join(persist, "site"),
    bindings: {
      BAESIAN_ENV: { type: "plain_text", value: "test" },
      // The tests' own address and Turnstile's test site key, not the deployed service's (wrangler.jsonc).
      SERVICE_ORIGIN: { type: "plain_text", value: SITE },
      SERVICE_RP_ID: { type: "plain_text", value: new URL(SITE).hostname },
      EMAIL_FROM: { type: "plain_text", value: `sign-in@${new URL(SITE).hostname}` },
      TURNSTILE_SITE_KEY: { type: "plain_text", value: "1x00000000000000000000AA" },
      BAESIAN_DEV_ACCESS: { type: "plain_text", value: JSON.stringify({ machines: [], sessions }) },
      SERVICE_SIGNING_KEY: { type: "secret_text", value: signingKey.export({ format: "pem", type: "pkcs8" }) as string },
      // Every test signs in from one address, 127.0.0.1: the limit per address (30 a minute) is raised for them.
      LIMIT_ADDRESS: { type: "ratelimit", namespace_id: "1001", simple: { limit: 10_000, period: 60 } },
    },
    // inferOriginFromRoutes: false, or the local server would pose as the route's host, baesian.dev (B-aa9pc).
    dev: { persist, server: { hostname: "127.0.0.1", port: 0 }, inspector: false, watch: false, logLevel: "none", inferOriginFromRoutes: false },
  });
  await worker.ready;
  const url = (await worker.url).origin as string;
  // The local runtime's Miniflare, which holds the accounts database: set once the runtime has started.
  let mf: { getD1Database(name: string): Promise<unknown> } | undefined;
  for (let i = 0; i < 100 && !mf; i++) {
    mf = (worker.raw.runtimes as { mf?: typeof mf }[]).find((r) => r.mf)?.mf;
    if (!mf) await new Promise((done) => setTimeout(done, 100));
  }
  if (!mf) throw new Error("the relay's local runtime didn't start");
  const db = (await mf.getD1Database("ACCOUNTS")) as D1Like;
  await applyMigrations(db);
  const now = () => new Date().toISOString();
  await db.prepare("INSERT INTO accounts (id, handle, created) VALUES (?, ?, ?)").bind(PERSON.account, PERSON.handle, now()).run();
  return {
    url,
    db,
    signingKey,
    async approve(userCode) {
      const d = await db.prepare("SELECT project FROM device_codes WHERE user_code = ?").bind(userCode).first<{ project: string }>();
      if (!d) throw new Error(`no machine is waiting with code ${userCode}`);
      await db.prepare("INSERT OR IGNORE INTO projects (id, owner, created) VALUES (?, ?, ?)").bind(d.project, PERSON.account, now()).run();
      await db.prepare("UPDATE device_codes SET approved_by = ? WHERE user_code = ?").bind(PERSON.account, userCode).run();
    },
    async deny(userCode) {
      await db.prepare("UPDATE device_codes SET denied = 1 WHERE user_code = ?").bind(userCode).run();
    },
    async person(project, method, rest, body) {
      const cookie = sessions.find((s) => s.project === project)?.cookie;
      if (!cookie) throw new Error(`the stand-in has no session for ${project}`);
      return fetch(`${url}/v1/projects/${project}/${rest}`, {
        method,
        headers: { cookie: `__Host-baesian-session=${cookie}`, origin: SITE, "sec-fetch-site": "same-origin", ...(body !== undefined ? { "content-type": "application/json" } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    },
    async dispose() {
      await worker.dispose();
      rmSync(persist, { recursive: true, force: true });
    },
  };
}
