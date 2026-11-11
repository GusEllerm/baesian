import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiState } from "../../src/api.js";
import { WAITING_STALE_MS } from "../../src/api.js";
import { MemoryStorage } from "../../src/storage.js";
import type { Store } from "../../src/store.js";
import { BUILD_AFTER_MS, BuiltTable, inParts } from "../src/built.js";
import type { ProjectRelay } from "../src/index.js";
import { type Person, machineLogin, signUp } from "./browser.js";
import { call, fileCard, machineStore } from "./client.js";

// B-evrec ("Kept in the project's database"): the relay keeps the state it built in the project's own database and sends
// it again until the project changes. Every write empties it in the write's own step, so it's never older than the files;
// shortly after a change it's built again, so the next read finds it. What moves no version is added as it's sent: the
// clock, when the object started, the reviewer's presence. A waiting marker goes stale by the clock alone, so what's
// kept holds only until one in it would.

let n = 0;
interface Owner {
  project: string;
  person: Person;
  access: string;
  store: Store;
  /** The card filed first. */
  id: string;
}

/** A person with a project of their own, a machine signed in to it, and one card filed and uploaded. */
async function owner(): Promise<Owner> {
  n += 1;
  const project = `p-built-${n}-${Math.random().toString(36).slice(2, 8)}`;
  const person = await signUp();
  const { access } = await machineLogin(person, project, "laptop");
  const store = machineStore(new MemoryStorage(), project);
  const o = { project, person, access, store, id: fileCard(store, { title: "Where the run store lives", question: "Where does the run store live?" }) };
  await push(o);
  return o;
}

const stub = (o: { project: string }) => env.PROJECTS.get(env.PROJECTS.idFromName(o.project));
const inObject = <T>(o: { project: string }, fn: (relay: ProjectRelay, state: DurableObjectState) => T | Promise<T>) => runInDurableObject(stub(o), fn as (i: ProjectRelay, s: DurableObjectState) => Promise<T>);

/** The machine uploads a file, straight to the object, as the Worker passes it on. */
async function put(o: { project: string }, path: string, bytes: Uint8Array | string): Promise<void> {
  const r = await inObject(o, (relay) => relay.upload(o.project, path, typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes, "laptop"));
  expect(r.status, `${path}: ${JSON.stringify(r.body)}`).toBeLessThan(300);
}

/** The machine uploads what its store holds of its cards, revisions first, as the CLI's sync does. */
async function push(o: { project: string; store: Store }): Promise<void> {
  const mem = o.store.storage as MemoryStorage;
  const order = (p: string) => (/\/r\d+\.md$/.test(p) ? 0 : 1);
  const paths = mem.paths().filter((p) => p.startsWith("cards/") && !p.endsWith(".sig") && !p.endsWith("-relay.json"));
  for (const p of paths.sort((a, b) => order(a) - order(b) || a.localeCompare(b))) await put(o, p, mem.read(p)!);
}

const get = async <T>(o: Owner, path: string): Promise<T> => {
  const r = await o.person.browser.get(`/v1/projects/${o.project}/${path}`);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body as T;
};
const state = (o: Owner) => get<ApiState>(o, "state");
const counts = (o: Owner) => get<{ total: number; hard: number; blocking: number }>(o, "waiting");
const post = (o: Owner, path: string, json: unknown) => o.person.browser.post(`/v1/projects/${o.project}/${path}`, json);

interface About {
  version: number;
  stamp: string;
  parts: number;
  waiting: { card: string; revision: number; level: string }[];
  until?: number;
}

/** What the table holds: part 0, and the state's text; nothing when it's empty. */
const kept = (o: Owner) =>
  inObject(o, (_r, s) => {
    const rows = s.storage.sql.exec<{ part: number; value: string }>("SELECT part, value FROM built ORDER BY part").toArray();
    return rows.length ? { about: JSON.parse(rows[0]!.value) as About, text: rows.slice(1).map((r) => r.value).join(""), parts: rows.length - 1 } : undefined;
  });

/** Mark the text that's kept, so a read that sends it shows the mark. */
const mark = (o: Owner, as: string) => inObject(o, (_r, s) => void s.storage.sql.exec("UPDATE built SET value = replace(value, 'run store live?', ?) WHERE part > 0", as));

/** No half of a character on its own. */
const whole = (text: string) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text);

afterEach(() => vi.useRealTimers());

describe("the state, kept as built until the project changes (B-evrec)", () => {
  it("is built once and sent again as kept, with the clock and the reviewer's presence added as it's sent", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2027, 2, 1, 9));
    const o = await owner();
    expect(await kept(o)).toBeUndefined();

    const first = await state(o);
    expect(first.cards.map((c) => c.meta.id)).toEqual([o.id]);
    expect(first.server).toMatchObject({ now: "2027-03-01T09:00:00.000Z", watch: "events" });
    const was = (await kept(o))!;
    expect(was.about).toMatchObject({ version: first.version, parts: 1, waiting: [{ card: o.id, revision: 1, level: "provisional" }] });
    // What's kept is everything but what's added as it's sent.
    expect(was.text).toContain("Where does the run store live?");
    expect(was.text).not.toContain('"server"');
    expect(JSON.parse(was.text)).toEqual(Object.fromEntries(Object.entries(first).filter(([k]) => k !== "server" && k !== "presence")));

    // The next read is that text, not a new build: marked here, the mark comes back.
    await mark(o, "RUN STORE LIVE?");
    vi.setSystemTime(Date.UTC(2027, 2, 1, 9, 0, 7));
    const second = await state(o);
    expect(second.cards[0]!.meta.question).toBe("Where does the RUN STORE LIVE?");
    expect(second.version).toBe(first.version);
    // The clock is the moment it was sent, and the object's start its own.
    expect(second.server).toEqual({ ...first.server, now: "2027-03-01T09:00:07.000Z" });

    // A heartbeat moves no version, so it empties nothing, and still shows in the state sent next.
    expect(second).not.toHaveProperty("presence");
    expect((await post(o, "presence", { client: "hosted-desktop" })).status).toBe(204);
    const third = await state(o);
    expect(third.presence).toMatchObject({ at: "2027-03-01T09:00:07.000Z" });
    expect(third.cards[0]!.meta.question).toBe("Where does the RUN STORE LIVE?");
    expect((await kept(o))!.about).toEqual(was.about);
    // A machine reads the same.
    const machine = await call("GET", "state", { as: { headers: { authorization: `Bearer ${o.access}` } }, project: o.project });
    expect(((await machine.json()) as ApiState).cards[0]!.meta.question).toBe("Where does the RUN STORE LIVE?");
  });

  it("is emptied by every kind of write, in that write's own step, and built from the files again", async () => {
    const o = await owner();
    const fresh = async () => {
      const s = await state(o);
      expect((await kept(o))!.about.version).toBe(s.version);
      return s;
    };
    const emptied = async (what: string) => expect(await kept(o), what).toBeUndefined();

    // A machine's upload: another card.
    await fresh();
    const other = fileCard(o.store);
    await push(o);
    await emptied("an upload");
    expect((await fresh()).cards.map((c) => c.meta.id).sort()).toEqual([o.id, other].sort());

    // A waiting marker: written, written again, and removed.
    const waiting = o.store.startWaiting(o.id, "claude-code");
    const mem = o.store.storage as MemoryStorage;
    const marker = mem.paths().find((p) => p.startsWith("waiting/"))!;
    await put(o, marker, mem.read(marker)!);
    await emptied("a waiting marker");
    expect((await fresh()).cards.find((c) => c.meta.id === o.id)!.waiting).toHaveLength(1);
    waiting.refresh(new Date(Date.now() + 30_000).toISOString());
    await put(o, marker, mem.read(marker)!);
    await emptied("a marker's beat");
    await fresh();
    expect((await inObject(o, (relay) => relay.stopWaiting(o.project, marker))).status).toBe(204);
    await emptied("a marker removed");
    expect((await fresh()).cards.find((c) => c.meta.id === o.id)!.waiting).toHaveLength(0);

    // The repo's default branch, replaced.
    await put(o, "default-branch.json", `${JSON.stringify({ type: "default-branch", format: 1, branch: "main" })}\n`);
    await emptied("the default branch");
    expect((await fresh()).defaultBranch).toBe("main");

    // A person's answer: the card is settled in the state read next, and no longer waits.
    expect((await post(o, "verdicts", { card: o.id, revision: 1, response: "accept" })).status).toBe(201);
    await emptied("an answer");
    const after = await fresh();
    expect(after.cards.find((c) => c.meta.id === o.id)).toMatchObject({ status: "resolved" });
    expect((await kept(o))!.about.waiting.map((w) => w.card)).toEqual([other]);

    // A topic merged into another.
    const topic = (id: string) => after.cards.find((c) => c.meta.id === id)!.meta.topic;
    const merged = await post(o, "aliases", { from: topic(other), to: topic(o.id) });
    expect(merged.status, JSON.stringify(merged.body)).toBe(201);
    await emptied("a topic merge");
    expect((await fresh()).cards.find((c) => c.meta.id === other)!.canonicalTopic).toBe(topic(o.id));

    // Reading empties nothing: the counts, the log, the presets, the paused machines.
    for (const path of ["waiting", "log?after=0", "presets", "pushes"]) await get(o, path);
    expect((await kept(o))!.about.version).toBe((await state(o)).version);
  });

  it("is built again by itself shortly after a change, so the next read finds it", async () => {
    const o = await owner();
    const s = await state(o);
    fileCard(o.store);
    await push(o);
    expect(await kept(o)).toBeUndefined();
    await new Promise((done) => setTimeout(done, BUILD_AFTER_MS + 400));
    const built = (await kept(o))!;
    expect(built.about.version).toBeGreaterThan(s.version);
    expect(built.about.waiting).toHaveLength(2);
    expect(JSON.parse(built.text).cards).toHaveLength(2);
    // And the read that follows is that.
    await mark(o, "BUILT BY ITSELF");
    expect((await state(o)).cards.map((c) => c.meta.question)).toContain("Where does the BUILT BY ITSELF");
  });

  it("answers the projects page's counts from what's kept, without the state's text", async () => {
    const o = await owner();
    const hard = fileCard(o.store, { touches: ["security"], wrong_if: "a token leaks", check: "the audit log" });
    const blocking = fileCard(o.store, { level: "blocking" });
    await push(o);

    // Asking for the counts builds the state, and keeps it for the read that follows.
    expect(await kept(o)).toBeUndefined();
    expect(await counts(o)).toEqual({ total: 3, hard: 1, blocking: 1 });
    const built = (await kept(o))!;
    const byCard = (a: { card: string }, b: { card: string }) => a.card.localeCompare(b.card);
    expect([...built.about.waiting].sort(byCard)).toEqual(
      [
        { card: o.id, revision: 1, level: "provisional" },
        { card: hard, revision: 1, level: "hard" },
        { card: blocking, revision: 1, level: "blocking" },
      ].sort(byCard),
    );
    // With the text gone, the counts still come, from part 0; the state is built again, and kept whole.
    await inObject(o, (_r, s) => void s.storage.sql.exec("DELETE FROM built WHERE part > 0"));
    expect(await counts(o)).toEqual({ total: 3, hard: 1, blocking: 1 });
    expect((await kept(o))!.parts).toBe(0);
    expect((await state(o)).cards).toHaveLength(3);
    expect((await kept(o))!.parts).toBe(1);
  });

  it("holds only until a waiting marker in it would go stale, which no write says", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t0 = Date.UTC(2027, 2, 1, 9);
    vi.setSystemTime(t0);
    const o = await owner();
    o.store.startWaiting(o.id, "claude-code", new Date(t0).toISOString());
    const mem = o.store.storage as MemoryStorage;
    const marker = mem.paths().find((p) => p.startsWith("waiting/"))!;
    await put(o, marker, mem.read(marker)!);
    const waitingOn = (s: ApiState) => s.cards.find((c) => c.meta.id === o.id)!.waiting;

    expect(waitingOn(await state(o))).toMatchObject([{ agent: "claude-code", stale: false }]);
    expect((await kept(o))!.about.until).toBe(t0 + WAITING_STALE_MS);
    // Up to that moment it's what's kept that's sent.
    vi.setSystemTime(t0 + WAITING_STALE_MS);
    await mark(o, "KEPT");
    const still = await state(o);
    expect(still.cards[0]!.meta.question).toBe("Where does the KEPT");
    expect(waitingOn(still)).toMatchObject([{ stale: false }]);
    // A millisecond on, the marker is stale, and nothing wrote: it's built again, and holds until the project changes.
    vi.setSystemTime(t0 + WAITING_STALE_MS + 1);
    const later = await state(o);
    expect(later.cards[0]!.meta.question).toBe("Where does the run store live?");
    expect(waitingOn(later)).toMatchObject([{ agent: "claude-code", stale: true }]);
    expect(later.version).toBe(still.version);
    expect((await kept(o))!.about).not.toHaveProperty("until");
    // The counts hold on the same terms.
    vi.setSystemTime(t0 + 10 * WAITING_STALE_MS);
    expect(await counts(o)).toEqual({ total: 1, hard: 0, blocking: 0 });
  });

  it("is built afresh by another release, or with another key: what's kept under another stamp isn't used", async () => {
    const o = await owner();
    const first = await state(o);
    const was = (await kept(o))!;
    expect(was.about.stamp).toMatch(/^[0-9a-f]{32}$/);
    const about = (value: string) => inObject(o, (_r, s) => void s.storage.sql.exec("UPDATE built SET value = ? WHERE part = 0", value));
    // Another release's, or another key's; another version of the project; one that can't be read.
    for (const other of [JSON.stringify({ ...was.about, stamp: "0".repeat(32) }), JSON.stringify({ ...was.about, version: first.version - 1 }), "not JSON"]) {
      await mark(o, "SOMETHING OLD");
      await about(other);
      expect((await state(o)).cards[0]!.meta.question, other).toBe("Where does the run store live?");
      expect((await kept(o))!.about).toEqual(was.about);
    }
  });

  it("is gone with an erased project, which isn't built again", async () => {
    const o = await owner();
    fileCard(o.store);
    await push(o);
    await inObject(o, (relay) => relay.erase(o.project));
    const tables = () =>
      inObject(o, (_r, s) => [...s.storage.sql.exec<{ name: string; schema: string; type: string }>("PRAGMA table_list")].filter((t) => t.schema === "main" && t.type === "table" && !t.name.startsWith("sqlite_") && !t.name.startsWith("_cf_")).length);
    expect(await tables()).toBe(0);
    // The build the upload asked for never comes: it would have made the tables again.
    await new Promise((done) => setTimeout(done, BUILD_AFTER_MS + 400));
    expect(await tables()).toBe(0);
  });
});

describe("the table itself", () => {
  it("splits text into parts without ever parting a character's two halves", () => {
    expect(inParts("", 4)).toEqual([]);
    expect(inParts("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
    // "𝄞" is two units: a part that would end between them ends before it.
    expect(inParts("abc𝄞def", 4)).toEqual(["abc", "𝄞de", "f"]);
    expect(inParts("𝄞𝄞𝄞", 3)).toEqual(["𝄞", "𝄞", "𝄞"]);
    // Never an empty part, however small the size asked for.
    expect(inParts("a𝄞b", 1)).toEqual(["a", "𝄞", "b"]);
    for (const size of [1, 2, 3, 5, 7, 64]) {
      const text = "é𝄞 “quoted” 日本語 🧪".repeat(9);
      const parts = inParts(text, size);
      expect(parts.join("")).toBe(text);
      for (const p of parts) expect(whole(p), JSON.stringify(p)).toBe(true);
    }
  });

  it("keeps a state of any size in parts, all or none, and gives back exactly what was kept", () =>
    runInDurableObject(env.PROJECTS.get(env.PROJECTS.newUniqueId()), (_i, s) => {
      const table = new BuiltTable(s.storage, 7);
      const rest = JSON.stringify({ version: 3, note: "é𝄞 “quoted” 日本語 🧪".repeat(5) });
      const waiting = [{ card: "B-aaaaa", revision: 2, level: "hard" as const }];
      expect(table.get(3, "s", 0)).toBeUndefined();
      expect(table.waiting(3, "s", 0)).toBeUndefined();
      table.keep(3, "s", { rest, waiting, until: 1000 });
      expect(s.storage.sql.exec("SELECT COUNT(*) AS n FROM built").one().n).toBeGreaterThan(10);
      expect(table.get(3, "s", 1000)).toEqual({ rest, waiting, until: 1000 });
      expect(table.waiting(3, "s", 1000)).toEqual(waiting);
      // Another version, another stamp, or past its time: nothing.
      expect(table.get(4, "s", 0)).toBeUndefined();
      expect(table.get(3, "t", 0)).toBeUndefined();
      expect(table.get(3, "s", 1001)).toBeUndefined();
      expect(table.waiting(3, "s", 1001)).toBeUndefined();
      // A part missing: nothing, rather than part of a state.
      s.storage.sql.exec("DELETE FROM built WHERE part = 2");
      expect(table.get(3, "s", 0)).toBeUndefined();
      // Kept again, it replaces what was there, and with no time it holds whenever it's asked.
      table.keep(5, "s", { rest: "{}", waiting: [] });
      expect(s.storage.sql.exec("SELECT COUNT(*) AS n FROM built").one().n).toBe(2);
      expect(table.get(5, "s", Number.MAX_SAFE_INTEGER)).toEqual({ rest: "{}", waiting: [] });
    }));
});
