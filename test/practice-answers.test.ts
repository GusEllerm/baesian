import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ApiPractice, ApiState } from "../src/api.js";
import { PRACTICE_DIR, PracticeRefused, practiceEntry } from "../src/practice.js";
import { type RunningServer, readPractice, startServer } from "../src/server.js";
import { PracticeEntry } from "../src/schema.js";
import { unsent } from "../src/sync.js";
import { BODY, REVIEWER, cleanup, draft, repo } from "./helpers.js";

// B-rehdw, "On the service, for every device": practice answers have an address of their own, apart from the state. On
// `baesian serve` (a clone that isn't linked) they're files in the live layer's `practice/`; the relay's table is tested
// in service/test/practice.test.ts. Nothing an agent runs reads them (Practice Cards section 5).

const ROOT = resolve(import.meta.dirname, "..");
const servers: RunningServer[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.close();
  cleanup();
});

async function serve(store: Parameters<typeof startServer>[0]) {
  const s = await startServer(store, { reviewer: "tester", debounceMs: 20, writeServerFile: false, proposals: false });
  servers.push(s);
  return s;
}
const base = (s: RunningServer) => `http://127.0.0.1:${s.port}`;
const auth = (s: RunningServer) => ({ authorization: `Bearer ${s.token}` });
const post = (s: RunningServer, body: unknown) => fetch(`${base(s)}/api/practice`, { method: "POST", headers: { ...auth(s), "content-type": "application/json" }, body: JSON.stringify(body) });
const read = async (s: RunningServer) => ((await (await fetch(`${base(s)}/api/practice`, { headers: auth(s) })).json()) as ApiPractice).entries;
const state = async (s: RunningServer) => (await (await fetch(`${base(s)}/api/state`, { headers: auth(s) })).json()) as ApiState;

const ANSWERED = "2026-11-01T10:00:00.000Z";
const answer = (over: Record<string, unknown> = {}) => ({ kind: "answer", card: "B-abcde", revision: 1, answered: ANSWERED, blind: "other", final: "planted", ...over });
const WHO = { reviewer: "gus", client: "web" };

describe("a practice entry (B-rehdw)", () => {
  it("is one of three kinds, in its own format, with who wrote it, which client and when set by the server", () => {
    const e = practiceEntry(answer(), WHO, [], "2026-11-10T12:00:00.000Z");
    expect(e).toEqual({ type: "practice", format: 1, kind: "answer", card: "B-abcde", revision: 1, answered: ANSWERED, blind: "other", final: "planted", reviewer: "gus", client: "web", at: "2026-11-10T12:00:00.000Z" });
    expect(PracticeEntry.parse(e)).toEqual(e);
    const start = practiceEntry({ kind: "test-start" }, WHO, []);
    expect(start.kind).toBe("test-start");
    const mark = practiceEntry({ kind: "mark", card: "B-fghjk", revision: 2, mark: "maybe" }, WHO, [start]);
    expect(mark).toMatchObject({ kind: "mark", card: "B-fghjk", revision: 2, mark: "maybe" });
    expect(practiceEntry(answer({ test: true, mark: "no" }), WHO, [start])).toMatchObject({ test: true, mark: "no" });
  });

  it("never carries what you typed, nor anything the server sets: those fields are refused", () => {
    for (const extra of [{ comment: "why" }, { choice: "Postgres" }, { reviewer: "someone" }, { at: ANSWERED }, { client: "web" }, { why: "because" }]) {
      expect(() => practiceEntry(answer(extra), WHO, [])).toThrow(/unexpected fields/);
    }
    expect(() => practiceEntry(answer({ final: "accept" }), WHO, [])).toThrow(PracticeRefused);
    expect(() => practiceEntry(answer({ card: "not-a-card" }), WHO, [])).toThrow(/isn't valid/);
    expect(() => practiceEntry([answer()], WHO, [])).toThrow(/JSON object/);
  });

  it("the blind test starts once; an entry in it needs it started; an answer in it has a mark, and only one in it", () => {
    const start = practiceEntry({ kind: "test-start" }, WHO, []);
    expect(() => practiceEntry({ kind: "test-start" }, WHO, [start])).toThrow(/started already/);
    expect(() => practiceEntry({ kind: "mark", card: "B-fghjk", revision: 1, mark: "sure" }, WHO, [])).toThrow(/hasn't started/);
    expect(() => practiceEntry(answer({ test: true, mark: "no" }), WHO, [])).toThrow(/hasn't started/);
    expect(() => practiceEntry(answer({ test: true }), WHO, [start])).toThrow(/has a mark/);
    expect(() => practiceEntry(answer({ mark: "no" }), WHO, [start])).toThrow(/has a mark/);
    try {
      practiceEntry({ kind: "test-start" }, WHO, [start]);
    } catch (e) {
      expect((e as PracticeRefused).status).toBe(409);
    }
  });
});

describe("on `baesian serve` (B-rehdw)", () => {
  it("keeps each entry as a file in the live layer's practice folder, and gives them back at their own address, oldest first", async () => {
    const { store } = repo();
    const s = await serve(store);
    expect(await read(s)).toEqual([]);
    const r1 = await post(s, { kind: "test-start" });
    expect(r1.status).toBe(201);
    expect(((await r1.json()) as { entry: PracticeEntry }).entry).toMatchObject({ kind: "test-start", reviewer: "tester", client: "web" });
    expect((await post(s, answer({ test: true, mark: "sure" }))).status).toBe(201);
    expect((await post(s, { kind: "mark", card: "B-fghjk", revision: 1, mark: "no" })).status).toBe(201);
    expect((await read(s)).map((e) => e.kind)).toEqual(["test-start", "answer", "mark"]);
    const files = readdirSync(join(store.live, PRACTICE_DIR));
    expect(files).toHaveLength(3);
    for (const f of files) expect(f).toMatch(/^\d{8}T\d{6}\.\d{3}Z-[0-9a-f]{8}\.json$/);
    expect(readPractice(store.live)).toEqual(await read(s));
  });

  it("refuses what isn't a practice entry, a second start, and anything not JSON", async () => {
    const { store } = repo();
    const s = await serve(store);
    expect((await post(s, answer({ comment: "the case was weak" }))).status).toBe(400);
    expect((await post(s, { kind: "test-start" })).status).toBe(201);
    const again = await post(s, { kind: "test-start" });
    expect(again.status).toBe(409);
    expect(((await again.json()) as { error: string }).error).toMatch(/runs once/);
    const form = await fetch(`${base(s)}/api/practice`, { method: "POST", headers: { ...auth(s), "content-type": "text/plain" }, body: "{}" });
    expect(form.status).toBe(415);
    expect((await fetch(`${base(s)}/api/practice`)).status).toBe(401);
  });

  it("is never in the state, and writing one changes nothing the state or its events say", async () => {
    const { store } = repo();
    const id = store.fileCard(draft(), BODY, { agent: "claude-code", force: true }).card.meta.id;
    const s = await serve(store);
    // The watcher may still hear of the card filed just before it started (FSEvents on macOS): let that settle first.
    const pause = () => new Promise((r) => setTimeout(r, 250));
    let version = s.version();
    for (await pause(); s.version() !== version; await pause()) version = s.version();
    const before = await state(s);
    await post(s, answer({ card: id }));
    await pause();
    expect(s.version()).toBe(version);
    const after = await state(s);
    expect(JSON.stringify(after)).not.toMatch(/practice|planted/);
    expect(after.cards).toEqual(before.cards);
  });

  it("stays out of the record, out of what a machine uploads when the repo is linked, and out of the inbox", async () => {
    const { dir, store } = repo();
    const id = store.fileCard(draft(), BODY, { agent: "claude-code", force: true }).card.meta.id;
    store.addVerdict({ card: id, revision: 1, response: "accept", first_choice: "alternative", ...REVIEWER });
    const inboxBefore = store.inbox({ advance: false });
    const s = await serve(store);
    await post(s, answer({ card: id }));
    store.syncRecord();
    expect(existsSync(join(dir, ".baesian", PRACTICE_DIR))).toBe(false);
    expect(unsent(store, new Set()).filter((p) => p.startsWith(`${PRACTICE_DIR}/`))).toEqual([]);
    expect(store.storage.list(PRACTICE_DIR)).toHaveLength(1);
    expect(store.inbox({ advance: false })).toEqual(inboxBefore);
  });
});

describe("nothing an agent runs reads practice answers (Practice Cards section 5)", () => {
  // `inbox`, `wait`, the MCP tools, the plugin's hooks, `sync`, the vault adapter, the gate, the slider proposals and the
  // report read cards and verdicts through the store, which knows nothing of practice; only the local server's address
  // and the relay's table do. So none of these modules may name it.
  const AGENTS_RUN = ["cli.ts", "ops.ts", "wait.ts", "mcp.ts", "sync.ts", "vault.ts", "gate.ts", "hooks.ts", "verify.ts", "proposals.ts", "report.ts", "routing.ts", "store.ts", "state.ts", "notify.ts", "trailers.ts", "merges.ts"];
  it.each(AGENTS_RUN)("src/%s", (file) => {
    const text = readFileSync(join(ROOT, "src", file), "utf8");
    expect(text).not.toMatch(/from "\.\/practice\.js"|readPractice|PRACTICE_DIR|PracticeEntry|\/api\/practice/);
  });
  it("the plugin's hooks", () => {
    const dir = join(ROOT, "plugins", "baesian", "hooks");
    for (const f of readdirSync(dir)) expect(readFileSync(join(dir, f), "utf8"), f).not.toMatch(/practice/i);
  });
  it("the relay's log, uploads and usage counts", () => {
    for (const f of ["relay.ts", "uploads.ts", "usage.ts", "sql-storage.ts", "retention.ts", "notify.ts"]) {
      expect(readFileSync(join(ROOT, "service", "src", f), "utf8"), f).not.toMatch(/practice/i);
    }
  });
});
