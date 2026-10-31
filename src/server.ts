import { execFileSync } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { type FSWatcher, existsSync, readFileSync, readdirSync, renameSync, rmSync, statSync, watch, writeFileSync } from "node:fs";
import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import { userInfo } from "node:os";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { ApiCard, ApiState, ApiVerdictInput } from "./api.js";
import { ServerInfo } from "./schema.js";
import { type Store, ValidationError } from "./store.js";

// The local server (M4 step 4): the client's API over the live layer. docs/vault/Design/Local Server.md is
// the design. Node's own HTTP server (D49), bound to 127.0.0.1 (D63), hardened as D62 says: a token traded
// for a cookie, Host checks, no CORS, JSON-only writes. A new token and port each time it starts (D97).

export type WatchMode = "events" | "poll";

export interface ServerOptions {
  /** 0, the default, lets the system pick (D97). */
  port?: number;
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
/** The live layer's own bookkeeping, which never changes what the client shows. */
const IGNORED = (rel: string) => rel.endsWith(".tmp") || rel === "presence.json" || rel === "server.json" || rel.startsWith(`cursors${sep}`) || rel.startsWith("cursors/");

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

/** The server another `baesian serve` started, if it's still answering (D97). A stale file is ignored. */
export async function findRunningServer(store: Store): Promise<ServerInfo | undefined> {
  const path = join(store.live, "server.json");
  if (!existsSync(path)) return undefined;
  let info: ServerInfo;
  try {
    info = ServerInfo.parse(JSON.parse(readFileSync(path, "utf8")));
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

export const serverUrl = (info: { port: number; token: string }) => `http://127.0.0.1:${info.port}/?token=${info.token}`;

/** The snapshot `GET /api/state` returns, read as one consistent view (D96). */
export function snapshot(store: Store, extra: { version: number; started: string; watch: WatchMode }): ApiState {
  const problems: ApiState["problems"] = [];
  return store.view(() => {
    const cards: ApiCard[] = [];
    const all = store.cardIds().flatMap((id) => store.card(id) ?? []);
    const dependents = new Map<string, string[]>();
    for (const c of all) for (const p of c.meta.depends_on) dependents.set(p, [...(dependents.get(p) ?? []), c.meta.id]);
    const nowMs = Date.now();
    for (const c of all) {
      const id = c.meta.id;
      try {
        const decision = store.decision(id);
        cards.push({
          meta: c.meta,
          body: c.body,
          revisions: store.revisions(id).length,
          status: store.status(id),
          ...(decision !== undefined ? { decision } : {}),
          canonicalTopic: store.canonicalTopic(c.meta.topic),
          verdicts: store.verdicts(id),
          dependents: dependents.get(id) ?? [],
          briefs: store.briefs(id),
          waiting: store.waitingOn(id, nowMs).map(({ marker, stale }) => ({ agent: marker.agent, since: marker.since, at: marker.at, stale })),
          fallbacks: store.fallbacks(id),
          attachments: store.attachments(id).length,
        });
      } catch (e) {
        problems.push({ path: join("cards", id), error: e instanceof Error ? e.message : String(e) });
      }
    }
    const presence = store.presence();
    return {
      version: extra.version,
      server: { pid: process.pid, started: extra.started, now: new Date(nowMs).toISOString(), watch: extra.watch },
      project: { name: basename(store.repo.toplevel), branch: store.repo.branch },
      ...(presence ? { presence } : {}),
      decks: store.decks(),
      rules: store.rules(),
      cards,
      problems,
    };
  }, (path, error) => problems.push({ path, error }));
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
  const text = type === "application/json" ? `${JSON.stringify(body)}\n` : String(body);
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

const VERDICT_KEYS = new Set(["card", "revision", "response", "choice", "comment", "first_choice", "make_rule"]);

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
          const unknown = Object.keys(input ?? {}).filter((k) => !VERDICT_KEYS.has(k));
          if (!input || typeof input !== "object" || unknown.length) return send(res, 400, { error: `unexpected fields: ${unknown.join(", ")}` });
          try {
            const verdict = store.addVerdict({ ...(input as unknown as ApiVerdictInput), reviewer, client: "web" });
            return send(res, 201, { verdict, status: store.status(verdict.card) });
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            if (e instanceof ValidationError) return send(res, 400, { error: message });
            if (/stale/.test(message)) return send(res, 409, { error: message });
            if (/^no card/.test(message)) return send(res, 404, { error: message });
            throw e;
          }
        }
        if (url.pathname === "/api/presence") {
          store.touchPresence("web");
          res.writeHead(204, HEADERS);
          return res.end();
        }
        return send(res, 404, { error: "not found" });
      }

      if (req.method !== "GET") return send(res, 405, { error: "method not allowed" });
      if (url.pathname === "/api/health") return send(res, 200, { ok: true, pid: process.pid });
      if (url.pathname === "/api/state") return send(res, 200, snapshot(store, { version, started, watch: watcher.mode() }));
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

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  port = typeof address === "object" && address ? address.port : 0;

  const infoPath = join(store.live, "server.json");
  const keepAlive = setInterval(() => {
    for (const s of streams) s.write(": keep-alive\n\n");
  }, opts.keepAliveMs ?? 15_000);
  if (opts.writeServerFile !== false) {
    const info = ServerInfo.parse({ type: "server", pid: process.pid, port, token, started });
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
