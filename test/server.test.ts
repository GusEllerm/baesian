import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { ApiState } from "../src/api.js";
import { type RunningServer, findRunningServer, startServer } from "../src/server.js";
import { WAITING_STALE_MS } from "../src/store.js";
import { WAITING_STALE_MS as API_WAITING_STALE_MS } from "../src/api.js";
import { BODY, REVIEWER, cleanup, draft, draftFile, repo } from "./helpers.js";

// M4 step 4: the local server, against real repos, with real processes writing to the store while it runs.

const ROOT = resolve(import.meta.dirname, "..");
const TSX = pathToFileURL(join(ROOT, "node_modules/tsx/dist/loader.mjs")).href;
const AGENT = { agent: "claude-code" };
const servers: RunningServer[] = [];
const children: ChildProcess[] = [];

afterEach(async () => {
  for (const c of children.splice(0)) c.kill("SIGKILL");
  for (const s of servers.splice(0)) await s.close();
  cleanup();
});

async function serve(store: Parameters<typeof startServer>[0], opts: Parameters<typeof startServer>[1] = {}) {
  const s = await startServer(store, { reviewer: "tester", debounceMs: 20, ...opts });
  servers.push(s);
  return s;
}

const base = (s: RunningServer) => `http://127.0.0.1:${s.port}`;
const auth = (s: RunningServer) => ({ authorization: `Bearer ${s.token}` });
const state = async (s: RunningServer): Promise<ApiState> => (await fetch(`${base(s)}/api/state`, { headers: auth(s) })).json() as Promise<ApiState>;
const post = (s: RunningServer, path: string, body: unknown, type = "application/json") =>
  fetch(`${base(s)}${path}`, { method: "POST", headers: { ...auth(s), "content-type": type }, body: JSON.stringify(body) });

/** Run the real CLI from source, in `cwd`. */
function cli(cwd: string, args: string[]): ChildProcess {
  const c = spawn(process.execPath, ["--import", TSX, join(ROOT, "src/bin.ts"), ...args], { cwd, env: { ...process.env, BAESIAN_OS_NOTIFY: "0" }, stdio: ["ignore", "pipe", "pipe"] });
  children.push(c);
  return c;
}
const exited = (c: ChildProcess) => new Promise<number | null>((r) => c.on("exit", (code) => r(code)));
async function until<T>(get: () => Promise<T> | T, ok: (v: T) => boolean, ms = 5000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await get();
    if (ok(v) || Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** Listen on `/api/events`, and collect the versions it announces. */
function listen(s: RunningServer) {
  const versions: number[] = [];
  const req = request({ host: "127.0.0.1", port: s.port, path: "/api/events", headers: auth(s) }, (res) => {
    res.setEncoding("utf8");
    res.on("data", (chunk: string) => {
      for (const m of chunk.matchAll(/event: changed\ndata: (\{.*\})/g)) versions.push(JSON.parse(m[1]!).version);
    });
  });
  req.end();
  return { versions, close: () => req.destroy() };
}

describe("security (D62, D97)", () => {
  it("trades the token for a cookie, and refuses anything else", async () => {
    const { store } = repo();
    const s = await serve(store);
    expect((await fetch(`${base(s)}/?token=wrong`, { redirect: "manual" })).status).toBe(403);
    const signIn = await fetch(s.url, { redirect: "manual" });
    expect(signIn.status).toBe(302);
    const cookie = signIn.headers.get("set-cookie")!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect((await fetch(`${base(s)}/api/state`, { headers: { cookie: cookie.split(";")[0]! } })).status).toBe(200);
    expect((await fetch(`${base(s)}/api/state`)).status).toBe(401);
    const ok = await fetch(`${base(s)}/api/state`, { headers: auth(s) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("refuses a request for another host name, as a DNS-rebinding page would send", async () => {
    const { store } = repo();
    const s = await serve(store);
    const status = await new Promise<number>((done) => {
      request({ host: "127.0.0.1", port: s.port, path: "/api/state", headers: { ...auth(s), host: `evil.example:${s.port}` } }, (res) => done(res.statusCode!)).end();
    });
    expect(status).toBe(403);
  });

  it("accepts writes only as JSON", async () => {
    const { store } = repo();
    const s = await serve(store);
    expect((await post(s, "/api/presence", {}, "text/plain")).status).toBe(415);
  });

  it("keeps its file readable only by the user, and removes it when it stops", async () => {
    const { store } = repo();
    const s = await serve(store);
    const path = join(store.live, "server.json");
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(await findRunningServer(store)).toMatchObject({ port: s.port, pid: process.pid });
    await servers.pop()!.close();
    expect(existsSync(path)).toBe(false);
    expect(await findRunningServer(store)).toBeUndefined();
  });

  it("ignores a file left by a server that has gone", async () => {
    const { store } = repo();
    writeFileSync(join(store.live, "server.json"), JSON.stringify({ type: "server", pid: 2 ** 22 - 1, port: 1, token: "x".repeat(43), started: new Date().toISOString() }));
    expect(await findRunningServer(store)).toBeUndefined();
  });
});

describe("the address (D97, D103)", () => {
  const remembered = (store: { live: string }) => JSON.parse(readFileSync(join(store.live, "port.json"), "utf8"));

  it("starts on the port the last server used, so the browser keeps what it stored, with a new token", async () => {
    const { store } = repo();
    const first = await serve(store);
    await servers.pop()!.close();
    const second = await serve(store);
    expect(second.port).toBe(first.port);
    expect(second.token).not.toBe(first.token);
    expect(remembered(store)).toEqual({ type: "port", format: 1, port: first.port });
  });

  it("takes a port the system picks when the last one is in use, and remembers that one", async () => {
    const { store } = repo();
    const first = await serve(store);
    const second = await serve(store, { writeServerFile: false });
    expect(second.port).not.toBe(first.port);
    expect(remembered(store)).toEqual({ type: "port", format: 1, port: second.port });
  });

  it("neither reads nor writes the record when given a port, or told not to reuse it", async () => {
    const { store } = repo();
    await serve(store, { reusePort: false });
    expect(existsSync(join(store.live, "port.json"))).toBe(false);
    writeFileSync(join(store.live, "port.json"), JSON.stringify({ type: "port", port: 1 }));
    const s = await serve(store, { reusePort: false });
    expect(s.port).not.toBe(1);
  });
});

describe("the API (D96)", () => {
  it("serves the live layer as one snapshot, with what the store computes", async () => {
    const { store } = repo();
    const parent = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    const child = store.fileCard(draft({ title: "Where run files are kept", question: "Where should run files go?", topic: "storage/run-files", depends_on: [parent] }), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: parent, revision: 1, response: "alternative", choice: "Postgres", ...REVIEWER });
    store.startWaiting(child, "codex");
    const s = await serve(store);
    const st = await state(s);
    const byId = Object.fromEntries(st.cards.map((c) => [c.meta.id, c]));
    expect(byId[parent]).toMatchObject({ status: "resolved", decision: "Postgres", dependents: [child] });
    expect(byId[child]).toMatchObject({ status: "returned", briefs: [expect.objectContaining({ kind: "parent-decided-otherwise" })] });
    expect(byId[child]!.waiting).toEqual([expect.objectContaining({ agent: "codex", stale: false })]);
    expect(st.problems).toEqual([]);
    expect(st.server.watch).toBe("events");
    expect(API_WAITING_STALE_MS).toBe(WAITING_STALE_MS);
  });

  it("records the client's verdicts, and refuses bad ones", async () => {
    const { store } = repo();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    const s = await serve(store);
    const ok = await post(s, "/api/verdicts", { card: id, revision: 1, response: "alternative", choice: "Postgres", first_choice: "alternative" });
    expect(ok.status).toBe(201);
    expect(await ok.json()).toMatchObject({ status: "resolved" });
    expect(store.verdicts(id).at(-1)).toMatchObject({ reviewer: "tester", client: "web", first_choice: "alternative" });
    expect((await post(s, "/api/verdicts", { card: id, revision: 2, response: "accept" })).status).toBe(409);
    expect((await post(s, "/api/verdicts", { card: "B-zzzzz", revision: 1, response: "accept" })).status).toBe(404);
    expect((await post(s, "/api/verdicts", { card: id, revision: 1, response: "maybe" })).status).toBe(400);
    expect((await post(s, "/api/verdicts", { card: id, revision: 1, response: "accept", reviewer: "someone else" })).status).toBe(400);
    // Retiring a rule the chosen option doesn't break is refused, as an invalid verdict (D119).
    const refused = await post(s, "/api/verdicts", { card: id, revision: 1, response: "accept", retire_rules: ["R-aaaaa"] });
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { error: string }).error).toMatch(/isn't a rule that/);
  });

  it("merges two topics for the reviewer, and refuses a bad merge (D44, D111)", async () => {
    const { store } = repo();
    store.fileCard(draft({ title: "Timestamp format?", topic: "time/format" }), BODY, AGENT);
    store.fileCard(draft({ title: "Clock source?", topic: "time/formats" }), BODY, { ...AGENT, force: true });
    const s = await serve(store);
    const ok = await post(s, "/api/aliases", { from: "time/formats", to: "time/format" });
    expect(ok.status).toBe(201);
    expect(((await ok.json()) as { alias: unknown }).alias).toMatchObject({ from: "time/formats", to: "time/format", by: "tester" });
    expect((await state(s)).cards.map((c) => c.canonicalTopic)).toEqual(["time/format", "time/format"]);
    expect((await post(s, "/api/aliases", { from: "time/formats", to: "time/format" })).status).toBe(400);
    expect((await post(s, "/api/aliases", { from: "time/formats" })).status).toBe(400);
    expect((await post(s, "/api/aliases", { from: "a/b", to: "time/format", by: "someone else" })).status).toBe(400);
  });

  it("writes the client's heartbeat (D41)", async () => {
    const { store } = repo();
    const s = await serve(store);
    expect((await post(s, "/api/presence", {})).status).toBe(204);
    expect(store.presence()).toMatchObject({ client: "web" });
  });

  it("reports a half-written file instead of failing, and recovers", async () => {
    const { store } = repo();
    store.fileCard(draft(), BODY, AGENT);
    mkdirSync(join(store.live, "cards", "B-zzzzz"));
    writeFileSync(join(store.live, "cards", "B-zzzzz", "r1.md"), "---\ntitle: [half");
    const s = await serve(store);
    const st = await state(s);
    expect(st.cards).toHaveLength(1);
    expect(st.problems).toEqual([expect.objectContaining({ path: join("cards", "B-zzzzz", "r1.md") })]);
    rmSync(join(store.live, "cards", "B-zzzzz"), { recursive: true });
    expect((await state(s)).problems).toEqual([]);
  });
});

describe("live updates (D84)", () => {
  for (const poll of [false, true]) {
    it(`announces a card another process files, ${poll ? "when polling" : "from file events"}`, async () => {
      const { dir, store } = repo();
      const s = await serve(store, { poll, pollMs: 100 });
      const events = listen(s);
      await until(() => events.versions.length, (n) => n > 0);
      const first = events.versions.at(-1)!;
      writeFileSync(join(dir, "card.md"), draftFile());
      expect(await exited(cli(dir, ["file", "card.md"]))).toBe(0);
      await until(() => events.versions.at(-1)!, (v) => v > first);
      expect(events.versions.at(-1)).toBeGreaterThan(first);
      expect((await state(s)).cards).toHaveLength(1);
      expect(s.watchMode()).toBe(poll ? "poll" : "events");
      events.close();
    });
  }

  it("keeps up with four agents filing at once", async () => {
    const { dir, store } = repo();
    const s = await serve(store);
    const events = listen(s);
    const writers = [0, 1, 2, 3].map((w) => {
      const c = spawn(process.execPath, ["--import", TSX, join(ROOT, "test/fixtures/file-cards.ts"), dir, String(w), "10"], { stdio: "ignore" });
      children.push(c);
      return exited(c);
    });
    expect(await Promise.all(writers)).toEqual([0, 0, 0, 0]);
    const st = await until(() => state(s), (x) => x.cards.length === 40 && x.problems.length === 0);
    expect(st.cards).toHaveLength(40);
    expect(st.problems).toEqual([]);
    expect(events.versions.length).toBeGreaterThan(1);
    events.close();
  }, 30_000);

  it("reads 150 cards in one snapshot quickly", async () => {
    const { store } = repo();
    for (let i = 0; i < 150; i++) {
      store.fileCard(draft({ title: `Card ${i}`, topic: `scale/c${i}`, depends_on: i > 0 && i % 5 === 0 ? [store.cardIds()[0]!] : [] }), BODY, { ...AGENT, force: true });
    }
    const s = await serve(store);
    const t0 = performance.now();
    const st = await state(s);
    const ms = performance.now() - t0;
    expect(st.cards).toHaveLength(150);
    expect(ms).toBeLessThan(3000);
  }, 60_000);
});

describe("serving the client (D98, D99)", () => {
  function fakeBuild() {
    const dir = join(repo().dir, "client-build");
    mkdirSync(join(dir, "assets"), { recursive: true });
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>client</title>");
    writeFileSync(join(dir, "assets", "index-abc123.js"), "console.log(1)");
    writeFileSync(join(dir, "secret.txt"), "inside the build, but fine to serve");
    return dir;
  }
  const get = (s: RunningServer, path: string) => fetch(`${base(s)}${path}`, { headers: auth(s) });

  it("serves index.html with a policy that allows only its own origin", async () => {
    const { store } = repo();
    const s = await serve(store, { clientDir: fakeBuild() });
    const r = await get(s, "/");
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("<title>client</title>");
    expect(r.headers.get("content-security-policy")).toMatch(/default-src 'self'/);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("caches hashed assets for good, and sends the client's own routes to index.html", async () => {
    const { store } = repo();
    const s = await serve(store, { clientDir: fakeBuild() });
    const asset = await get(s, "/assets/index-abc123.js");
    expect(asset.headers.get("content-type")).toMatch(/javascript/);
    expect(asset.headers.get("cache-control")).toMatch(/immutable/);
    expect(await (await get(s, "/cards/B-7f3kq")).text()).toContain("<title>client</title>");
    expect((await get(s, "/assets/missing.js")).status).toBe(404);
  });

  it("never serves a file from outside the build", async () => {
    const { store } = repo();
    const dir = fakeBuild();
    writeFileSync(join(dir, "..", "outside.txt"), "not for the browser");
    const s = await serve(store, { clientDir: dir });
    for (const path of ["/../outside.txt", "/%2e%2e/outside.txt", "/assets/..%2f..%2foutside.txt"]) {
      const r = await get(s, path);
      expect(await r.text()).not.toContain("not for the browser");
    }
  });

  it("still asks for sign-in before serving the client", async () => {
    const { store } = repo();
    const s = await serve(store, { clientDir: fakeBuild() });
    expect((await fetch(`${base(s)}/assets/index-abc123.js`)).status).toBe(401);
  });

  it("says how to build the client when there's no build", async () => {
    const { store } = repo();
    const s = await serve(store, { clientDir: join(store.live, "no-such-build") });
    expect(await (await get(s, "/")).text()).toContain("npm run build");
  });
});

describe("baesian serve", () => {
  it("prints its address, finds itself when run again, and stops cleanly", async () => {
    const { dir, store } = repo();
    const first = cli(dir, ["serve", "--no-open"]);
    let out = "";
    first.stdout!.on("data", (d) => (out += d));
    await until(() => out, (o) => /serving .* at http/.test(o), 15_000);
    const url = out.match(/at (http\S+)/)![1]!;
    expect((await fetch(url, { redirect: "manual" })).status).toBe(302);

    const second = cli(dir, ["serve", "--no-open"]);
    let again = "";
    second.stdout!.on("data", (d) => (again += d));
    expect(await exited(second)).toBe(0);
    expect(again).toContain(`already serving this repo: ${url}`);

    first.kill("SIGINT");
    expect(await exited(first)).toBe(0);
    expect(existsSync(join(store.live, "server.json"))).toBe(false);
  }, 30_000);
});
