import { execFileSync } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { type FSWatcher, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, watch, writeFileSync } from "node:fs";
import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import { userInfo } from "node:os";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { type ApiPreferencesInput, type ApiState, type ApiVerdictInput, PREFERENCE_FIELDS, VERDICT_FIELDS } from "./api.js";
import { unmarkJson } from "./cite.js";
import { PRACTICE_DIR, PracticeRefused, inOrder, practiceEntry } from "./practice-answers.js";
import { afterVerdict } from "./proposals.js";
import { LastPort, PracticeEntry, ServerInfo, newestFormat, upgradeFile } from "./schema.js";
import { presets, snapshot } from "./state.js";
import { type Store, StalePreferences, ValidationError } from "./store.js";
import { contextNotes } from "./vault.js";

// The local server (M4 step 4): the client's API over the live layer. docs/vault/Design/Local Server.md is
// the design. Node's own HTTP server (D49), bound to 127.0.0.1 (D63), hardened as D62 says: a token traded
// for a cookie, Host checks, no CORS, JSON-only writes. A new token each time it starts (D97), on the last
// server's port when it's free (D103).

export type WatchMode = "events" | "poll";

export interface ServerOptions {
  /**
   * A port to listen on. Without one, the server starts on the port the last one used, if it's free, and
   * otherwise on one the system picks (D97, D103).
   */
  port?: number;
  /** Start on the last server's port, and remember this one (D103). Default true; not used when `port` is given. */
  reusePort?: boolean;
  /** Check the live layer on a timer instead of watching it: for shared storage. */
  poll?: boolean;
  /** Who the verdicts are from. Defaults to git's `user.name`. */
  reviewer?: string;
  /** Write `server.json`, so `baesian serve` can find this server. Default true. */
  writeServerFile?: boolean;
  /** The safety-net rescan while watching (D84), and the interval when polling. */
  rescanMs?: number;
  pollMs?: number;
  /** Changes are gathered for this long before one "changed" goes out. */
  debounceMs?: number;
  /** A comment on every event stream this often, so idle connections stay open. */
  keepAliveMs?: number;
  /** Where the client's build is. Defaults to `dist/client/` (D98). */
  clientDir?: string;
  /**
   * File the cards Baesian proposes after an answer: convention cards (D161) and slider moves (B-y6jn6). Default true;
   * tests of something else turn it off.
   */
  proposals?: boolean;
}

export interface RunningServer {
  port: number;
  token: string;
  /** The address to open: it carries the token, which the first request trades for a cookie. */
  url: string;
  version(): number;
  watchMode(): WatchMode;
  close(): Promise<void>;
}

/**
 * The sign-in cookie, named for the server's port. Browsers keep cookies apart by host but not by port, so two
 * projects served at once would otherwise overwrite each other's sign-in, and each would send its token to the other.
 */
const cookieName = (port: number) => `baesian-${port}`;
const MAX_BODY = 64 * 1024;
/**
 * The live layer's own bookkeeping, which never changes what the client shows: sessions' models among it (B-k0w7d), and
 * practice answers (B-rehdw), which aren't in the state: the client reads them at their own address.
 */
const IGNORED = (rel: string) =>
  rel.endsWith(".tmp") || rel === "presence.json" || rel === "server.json" || rel === "port.json" || ["cursors", "models", PRACTICE_DIR].some((d) => rel === d || rel.startsWith(`${d}${sep}`) || rel.startsWith(`${d}/`));

/**
 * The practice entries kept in a clone's live layer (B-rehdw), oldest first: one file each in `practice/`. A file that
 * can't be read, half-written or in a newer format (D157), is skipped.
 */
export function readPractice(live: string): PracticeEntry[] {
  const dir = join(live, PRACTICE_DIR);
  if (!existsSync(dir)) return [];
  const out: PracticeEntry[] = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
    try {
      out.push(PracticeEntry.parse(upgradeFile("practice", JSON.parse(readFileSync(join(dir, name), "utf8")), `${PRACTICE_DIR}/${name}`)));
    } catch {
      // half-written, or not one this Baesian reads: skipped
    }
  }
  return inOrder(out);
}

/** Keep one practice entry in a clone's live layer (B-rehdw): `practice/<at>-<suffix>.json`, written once. */
export function writePractice(live: string, e: PracticeEntry): string {
  const dir = join(live, PRACTICE_DIR);
  mkdirSync(dir, { recursive: true });
  const name = `${e.at.replace(/[-:]/g, "")}-${randomBytes(4).toString("hex")}.json`;
  const tmp = join(dir, `${name}.tmp`);
  writeFileSync(tmp, `${JSON.stringify(e, null, 2)}\n`, { flag: "wx" });
  renameSync(tmp, join(dir, name));
  return `${PRACTICE_DIR}/${name}`;
}

/** Who answers in the client: git's `user.name`, or the account name. */
export function reviewerName(toplevel: string): string {
  try {
    const name = execFileSync("git", ["config", "user.name"], { cwd: toplevel, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (name) return name;
  } catch {
    // no git identity: fall through
  }
  return userInfo().username;
}

/** The server another `baesian serve` started, if it's still answering (D97). A stale file is ignored, as is one this Baesian can't read, a newer format's included (D157). */
export async function findRunningServer(store: Store): Promise<ServerInfo | undefined> {
  const path = join(store.live, "server.json");
  if (!existsSync(path)) return undefined;
  let info: ServerInfo;
  try {
    info = ServerInfo.parse(upgradeFile("server", JSON.parse(readFileSync(path, "utf8")), "server.json"));
  } catch {
    return undefined;
  }
  try {
    process.kill(info.pid, 0);
  } catch {
    return undefined;
  }
  try {
    const r = await fetch(`http://127.0.0.1:${info.port}/api/health`, { headers: { authorization: `Bearer ${info.token}` }, signal: AbortSignal.timeout(1000) });
    return r.ok ? info : undefined;
  } catch {
    return undefined;
  }
}

/** The port the last server used, if it's on record and readable (D103): a file in a newer format isn't (D157). */
function lastPort(path: string): number | undefined {
  try {
    return LastPort.parse(upgradeFile("port", JSON.parse(readFileSync(path, "utf8")), "port.json")).port;
  } catch {
    return undefined;
  }
}

export const serverUrl = (info: { port: number; token: string }) => `http://127.0.0.1:${info.port}/?token=${info.token}`;

/**
 * The state `GET /api/state` returns (D96), as `baesian serve` gives it: built by `snapshot` (src/state.ts, which the
 * relay serves too), with this repo's name and branch, this process, and a deck's context notes resolved in the vault (M6),
 * which is listed once per snapshot, and only when a deck has context notes.
 */
export function serverState(store: Store, extra: { version: number; started: string; watch: WatchMode }): ApiState {
  const vaultNotes: { notes?: string[] } = {};
  return snapshot(store, {
    version: extra.version,
    server: { pid: process.pid, started: extra.started, watch: extra.watch },
    project: { name: basename(store.repo.toplevel), branch: store.repo.branch },
    notes: (links) => contextNotes(store, links, vaultNotes),
  });
}

/** A cheap summary of the live layer's files, to tell whether anything changed between two looks. */
function fingerprint(dir: string): string {
  const hash = createHash("sha1");
  const walk = (d: string) => {
    let names: string[];
    try {
      names = readdirSync(d).sort();
    } catch {
      return;
    }
    for (const name of names) {
      const path = join(d, name);
      const rel = relative(dir, path);
      if (IGNORED(rel)) continue;
      try {
        const st = statSync(path);
        if (st.isDirectory()) walk(path);
        else hash.update(`${rel}\0${st.size}\0${st.mtimeMs}\n`);
      } catch {
        // gone between listing and stat: the next look sees it
      }
    }
  };
  walk(dir);
  return hash.digest("hex");
}

/**
 * Watch the live layer (D84): recursive `fs.watch`, plus a rescan on a timer for anything it misses. If the
 * watcher fails, or `poll` is set, only the timer runs, at the polling interval.
 */
function watchLive(dir: string, onChange: () => void, opts: { poll: boolean; rescanMs: number; pollMs: number }) {
  let mode: WatchMode = opts.poll ? "poll" : "events";
  let last = fingerprint(dir);
  const look = () => {
    const now = fingerprint(dir);
    if (now !== last) {
      last = now;
      onChange();
    }
  };
  let timer = setInterval(look, mode === "poll" ? opts.pollMs : opts.rescanMs);
  let watcher: FSWatcher | undefined;
  const fallBack = () => {
    watcher?.close();
    watcher = undefined;
    mode = "poll";
    clearInterval(timer);
    timer = setInterval(look, opts.pollMs);
  };
  if (mode === "events") {
    try {
      watcher = watch(dir, { recursive: true }, (_type, name) => {
        if (name && IGNORED(String(name))) return;
        onChange();
      });
      watcher.on("error", fallBack);
    } catch {
      fallBack();
    }
  }
  return {
    mode: () => mode,
    close: () => {
      watcher?.close();
      clearInterval(timer);
    },
  };
}

function sameSecret(a: string | undefined, b: string): boolean {
  if (!a) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function cookieValue(req: IncomingMessage, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

const HEADERS = { "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" };

function send(res: ServerResponse, status: number, body: unknown, type = "application/json") {
  // Messages the store wrote may mark citations of Baesian's decisions (src/cite.ts): the client never shows them.
  const text = type === "application/json" ? `${JSON.stringify(body, unmarkJson)}\n` : String(body);
  res.writeHead(status, { ...HEADERS, "content-type": `${type}; charset=utf-8` });
  res.end(text);
}

function page(title: string, text: string): string {
  return `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font: 16px/1.5 system-ui; margin: 3rem auto; max-width: 36rem"><h1 style="font-size: 1.3rem">${title}</h1><p>${text}</p>`;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw Object.assign(new Error("the request is too large"), { status: 413 });
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("the request isn't valid JSON"), { status: 400 });
  }
}

/** The client's build (D98): beside this module once built, or in `dist/` when the server runs from source. */
export function findClient(): string | undefined {
  const here = dirname(fileURLToPath(import.meta.url));
  return [join(here, "client"), join(here, "..", "dist", "client")].find((d) => existsSync(join(d, "index.html")));
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

/** Only the server's own origin, for everything: the client needs nothing else, fonts included (D99). */
const CSP = "default-src 'self'; img-src 'self' data:; font-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** Serve a file of the client's build. A path with no extension is one of the client's own routes. */
function serveClient(res: ServerResponse, dir: string | undefined, pathname: string) {
  if (!dir || !existsSync(join(dir, "index.html"))) {
    return send(res, 200, page("Baesian is running", "The client hasn't been built: run <code>npm run build</code> in Baesian's repo. Until then, <a href=\"/api/state\">/api/state</a> shows the live layer."), "text/html");
  }
  let rel: string;
  try {
    rel = decodeURIComponent(pathname).replace(/^\/+/, "");
  } catch {
    return send(res, 400, { error: "a malformed path" });
  }
  const file = resolve(dir, rel || "index.html");
  const inside = file.startsWith(dir + sep);
  let path = inside && existsSync(file) && statSync(file).isFile() ? file : undefined;
  if (!path && inside && !extname(rel)) path = join(dir, "index.html");
  if (!path) return send(res, 404, { error: "not found" });
  const hashed = path.startsWith(join(dir, "assets") + sep);
  const body = readFileSync(path); // before any header goes out, so a failed read can still become an error
  res.writeHead(200, {
    ...HEADERS,
    "content-type": TYPES[extname(path)] ?? "application/octet-stream",
    "cache-control": hashed ? "public, max-age=31536000, immutable" : "no-store",
    ...(extname(path) === ".html" ? { "content-security-policy": CSP } : {}),
  });
  res.end(body);
}

/** Start the server. It runs until `close`. */
export async function startServer(store: Store, opts: ServerOptions = {}): Promise<RunningServer> {
  const token = randomBytes(32).toString("base64url");
  const reviewer = opts.reviewer ?? reviewerName(store.repo.toplevel);
  const started = new Date().toISOString();
  const debounceMs = opts.debounceMs ?? 100;
  const streams = new Set<ServerResponse>();
  let version = 1;
  let pending: NodeJS.Timeout | undefined;

  const changed = () => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = undefined;
      version += 1;
      for (const s of streams) s.write(`event: changed\ndata: ${JSON.stringify({ version })}\n\n`);
    }, debounceMs);
  };
  const watcher = watchLive(store.live, changed, { poll: opts.poll ?? false, rescanMs: opts.rescanMs ?? 30_000, pollMs: opts.pollMs ?? 1_000 });

  let port = 0;
  const server = createServer(async (req, res) => {
    try {
      // Only this machine's own addresses: a page on another site that rebinds a name to 127.0.0.1 is refused.
      const host = req.headers.host ?? "";
      if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return send(res, 403, { error: "wrong host" });
      const url = new URL(req.url ?? "/", `http://${host}`);

      // The address `baesian serve` opens: trade the token for a cookie, and drop it from the address bar.
      const offered = url.searchParams.get("token");
      if (url.pathname === "/" && offered !== null) {
        if (!sameSecret(offered, token)) return send(res, 403, page("Baesian", "That link has expired. Run <code>baesian serve</code> for a new one."), "text/html");
        res.writeHead(302, { ...HEADERS, location: "/", "set-cookie": `${cookieName(port)}=${token}; HttpOnly; SameSite=Strict; Path=/` });
        return res.end();
      }
      const bearer = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : undefined;
      if (!sameSecret(cookieValue(req, cookieName(port)), token) && !sameSecret(bearer, token)) {
        if (url.pathname.startsWith("/api/")) return send(res, 401, { error: "not signed in: open the address `baesian serve` printed" });
        return send(res, 401, page("Baesian", "Open the address <code>baesian serve</code> printed. It signs this browser in."), "text/html");
      }

      if (req.method === "POST") {
        // A form on another site can't send JSON without a preflight, and there's no CORS to pass one.
        if (!(req.headers["content-type"] ?? "").startsWith("application/json")) return send(res, 415, { error: "send application/json" });
        if (url.pathname === "/api/verdicts") {
          const input = (await readJson(req)) as Record<string, unknown>;
          const unknown = Object.keys(input ?? {}).filter((k) => !VERDICT_FIELDS.has(k));
          if (!input || typeof input !== "object" || unknown.length) return send(res, 400, { error: `unexpected fields: ${unknown.join(", ")}` });
          try {
            const verdict = store.addVerdict({ ...(input as unknown as ApiVerdictInput), reviewer, client: "web" });
            // Baesian's own proposals from the record (D161, B-y6jn6). A failure there never fails the answer.
            let filed: string[] = [];
            if (opts.proposals !== false) {
              try {
                filed = afterVerdict(store, verdict).map((c) => c.meta.id);
              } catch (e) {
                process.stderr.write(`baesian serve: proposals failed: ${e instanceof Error ? e.message : String(e)}
`);
              }
            }
            return send(res, 201, { verdict, status: store.status(verdict.card), ...(filed.length ? { filed } : {}) });
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            if (e instanceof ValidationError) return send(res, 400, { error: message });
            if (/stale/.test(message)) return send(res, 409, { error: message });
            if (/^no card/.test(message)) return send(res, 404, { error: message });
            throw e;
          }
        }
        // Merging two topics (D44, D111): `{ from, to }`, recorded as an alias by the reviewer.
        if (url.pathname === "/api/aliases") {
          const input = (await readJson(req)) as Record<string, unknown>;
          const unknown = Object.keys(input ?? {}).filter((k) => k !== "from" && k !== "to");
          if (!input || typeof input.from !== "string" || typeof input.to !== "string" || unknown.length) {
            return send(res, 400, { error: unknown.length ? `unexpected fields: ${unknown.join(", ")}` : "send { from, to }: the two topics" });
          }
          try {
            return send(res, 201, { alias: store.mergeTopics(input.from, input.to, reviewer) });
          } catch (e) {
            if (e instanceof ValidationError) return send(res, 400, { error: e.message });
            throw e;
          }
        }
        // A change to the preferences (D147): only the client writes them, and only through here.
        if (url.pathname === "/api/preferences") {
          const input = (await readJson(req)) as Record<string, unknown>;
          const unknown = Object.keys(input ?? {}).filter((k) => !PREFERENCE_FIELDS.has(k));
          if (!input || typeof input !== "object" || Array.isArray(input) || unknown.length) return send(res, 400, { error: `unexpected fields: ${unknown.join(", ")}` });
          try {
            const written = store.writePreferences(input as ApiPreferencesInput, { by: reviewer, client: "web" });
            return send(res, 201, written);
          } catch (e) {
            if (e instanceof StalePreferences) return send(res, 409, { error: e.message });
            if (e instanceof ValidationError) return send(res, 400, { error: e.message });
            throw e;
          }
        }
        if (url.pathname === "/api/presence") {
          store.touchPresence("web");
          res.writeHead(204, HEADERS);
          return res.end();
        }
        // A practice answer, a mark in the blind test, or its start (B-rehdw): kept in the live layer, apart from the state.
        if (url.pathname === "/api/practice") {
          const input = await readJson(req);
          try {
            const entry = practiceEntry(input, { reviewer, client: "web" }, readPractice(store.live));
            writePractice(store.live, entry);
            return send(res, 201, { entry });
          } catch (e) {
            if (e instanceof PracticeRefused) return send(res, e.status, { error: e.message });
            throw e;
          }
        }
        return send(res, 404, { error: "not found" });
      }

      if (req.method !== "GET") return send(res, 405, { error: "method not allowed" });
      if (url.pathname === "/api/health") return send(res, 200, { ok: true, pid: process.pid });
      if (url.pathname === "/api/state") return send(res, 200, serverState(store, { version, started, watch: watcher.mode() }));
      if (url.pathname === "/api/presets") return send(res, 200, presets(store));
      if (url.pathname === "/api/practice") return send(res, 200, { entries: readPractice(store.live) });
      if (url.pathname === "/api/events") {
        res.writeHead(200, { ...HEADERS, "content-type": "text/event-stream; charset=utf-8", connection: "keep-alive" });
        res.write(`retry: 2000\nevent: changed\ndata: ${JSON.stringify({ version })}\n\n`);
        streams.add(res);
        req.on("close", () => streams.delete(res));
        return;
      }
      if (!url.pathname.startsWith("/api/")) return serveClient(res, opts.clientDir ?? findClient(), url.pathname);
      return send(res, 404, { error: "not found" });
    } catch (e) {
      // Headers already sent: the response can't become an error any more, so end it rather than leave it hanging.
      if (res.headersSent) return res.destroy();
      const status = (e as { status?: number }).status ?? 500;
      return send(res, status, { error: e instanceof Error ? e.message : String(e) });
    }
  });

  const listen = (p: number) =>
    new Promise<void>((resolve, reject) => {
      const failed = (e: Error) => {
        server.off("listening", listening);
        reject(e);
      };
      const listening = () => {
        server.off("error", failed);
        resolve();
      };
      server.once("error", failed);
      server.once("listening", listening);
      server.listen(p, "127.0.0.1");
    });
  // The same address as last time keeps what the browser stored for it (D103). If that port is taken, any will do.
  const reuse = opts.port === undefined && opts.reusePort !== false;
  const portPath = join(store.live, "port.json");
  const last = reuse ? lastPort(portPath) : undefined;
  try {
    await listen(opts.port ?? last ?? 0);
  } catch (e) {
    if (last === undefined || (e as { code?: string }).code !== "EADDRINUSE") throw e;
    await listen(0);
  }
  const address = server.address();
  port = typeof address === "object" && address ? address.port : 0;
  if (reuse && port !== last) {
    const tmp = `${portPath}.${randomBytes(4).toString("hex")}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(LastPort.parse({ type: "port", format: newestFormat("port"), port }))}\n`);
    renameSync(tmp, portPath);
  }

  const infoPath = join(store.live, "server.json");
  const keepAlive = setInterval(() => {
    for (const s of streams) s.write(": keep-alive\n\n");
  }, opts.keepAliveMs ?? 15_000);
  if (opts.writeServerFile !== false) {
    const info = ServerInfo.parse({ type: "server", format: newestFormat("server"), pid: process.pid, port, token, started });
    const tmp = `${infoPath}.${randomBytes(4).toString("hex")}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(info)}\n`, { mode: 0o600 });
    renameSync(tmp, infoPath);
  }

  return {
    port,
    token,
    url: serverUrl({ port, token }),
    version: () => version,
    watchMode: () => watcher.mode(),
    close: async () => {
      watcher.close();
      clearInterval(keepAlive);
      if (pending) clearTimeout(pending);
      for (const s of streams) s.end();
      streams.clear();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      // Only remove the file if it's still this server's.
      if (opts.writeServerFile !== false && existsSync(infoPath)) {
        try {
          if (JSON.parse(readFileSync(infoPath, "utf8")).token === token) rmSync(infoPath, { force: true });
        } catch {
          // unreadable: leave it; the next serve replaces a stale file
        }
      }
    },
  };
}
