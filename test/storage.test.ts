import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FolderStorage } from "../src/folder-storage.js";
import { afterVerdict, proposeSliderMoves } from "../src/proposals.js";
import { presets, snapshot } from "../src/state.js";
import { MemoryStorage, type Storage, alreadyExists } from "../src/storage.js";
import { DEFAULT_BRANCH, NeedsRepo, NotAllowed, StalePreferences, Store } from "../src/store.js";
import { BODY, REVIEWER, cleanup, draft, memory, repo } from "./helpers.js";
import { ORIGIN, TestPasskey, TestService } from "./service.js";

// B-0ag7h: one store, two kinds of storage. The interface's two implementations; the store over memory with no repo and
// no record, as the relay will run it over its Durable Object's table (M9b); and the state built over each.

// Every call this file's modules make to node:fs and node:child_process is noted, then made: a store with no repo must
// make none (B-0ag7h), and the tests over memory check it.
const touched = vi.hoisted(() => [] as string[]);
vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  const noted = Object.fromEntries(
    Object.entries(real).map(([k, v]) => [k, typeof v === "function" && /^[a-z]/.test(k) ? (...a: unknown[]) => (touched.push(`node:fs ${k}`), (v as (...x: unknown[]) => unknown)(...a)) : v]),
  );
  return { ...noted, default: noted };
});
vi.mock("node:child_process", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  const noted = Object.fromEntries(
    Object.entries(real).map(([k, v]) => [k, typeof v === "function" && /^[a-z]/.test(k) ? (...a: unknown[]) => (touched.push(`node:child_process ${k}`), (v as (...x: unknown[]) => unknown)(...a)) : v]),
  );
  return { ...noted, default: noted };
});

const dirs: string[] = [];
afterEach(() => {
  cleanup();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const AGENT = { agent: "claude-code" };
const WHO = { by: "gus", client: "test" };
const bytes = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array | undefined) => (b === undefined ? undefined : new TextDecoder().decode(b));

let n = 0;
/** A card of its own: its own title and topic, so none is a possible duplicate of another. */
function file(store: Store, over: Record<string, unknown> = {}): string {
  n += 1;
  return store.fileCard(draft({ title: `Decision ${n} on its own`, topic: `area${n}/q`, ...over }), BODY, { ...AGENT, force: true }).card.meta.id;
}
const answer = (store: Store, id: string, over: Record<string, unknown> = {}) =>
  store.addVerdict({ card: id, revision: store.card(id)!.meta.revision, response: "accept", ...REVIEWER, ...over } as Parameters<Store["addVerdict"]>[0]);

describe.each<[string, () => Storage]>([
  ["memory", () => new MemoryStorage()],
  ["a folder", () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "baesian-storage-")));
    dirs.push(dir);
    return new FolderStorage(dir);
  }],
])("the live layer's storage, in %s (B-0ag7h)", (_, make) => {
  it("reads what was written, and nothing where nothing was", () => {
    const s = make();
    expect(s.read("cards/B-7f3kq/r1.md")).toBeUndefined();
    s.create("cards/B-7f3kq/r1.md", bytes("one"));
    expect(text(s.read("cards/B-7f3kq/r1.md"))).toBe("one");
  });

  it("writes a write-once file once: a second create fails with EEXIST, and the first stays", () => {
    const s = make();
    s.create("verdicts/a.json", bytes("first"));
    let error: unknown;
    try {
      s.create("verdicts/a.json", bytes("second"));
    } catch (e) {
      error = e;
    }
    expect(alreadyExists(error)).toBe(true);
    expect(text(s.read("verdicts/a.json"))).toBe("first");
  });

  it("replaces a mutable file whole, and removes one", () => {
    const s = make();
    s.replace("presence.json", bytes("old"));
    s.replace("presence.json", bytes("new"));
    expect(text(s.read("presence.json"))).toBe("new");
    s.remove("presence.json");
    expect(s.read("presence.json")).toBeUndefined();
    expect(() => s.remove("presence.json")).not.toThrow();
  });

  it("lists a folder's files and folders, one level down, and nothing for a folder with no files", () => {
    const s = make();
    s.create("cards/B-aaaaa/r1.md", bytes("a"));
    s.create("cards/B-aaaaa/gate-r1-cli.json", bytes("g"));
    s.create("cards/B-bbbbb/r1.md", bytes("b"));
    s.replace("presence.json", bytes("p"));
    expect(s.list("cards").sort()).toEqual(["B-aaaaa", "B-bbbbb"]);
    expect(s.list("cards/B-aaaaa").sort()).toEqual(["gate-r1-cli.json", "r1.md"]);
    expect(s.list("verdicts")).toEqual([]);
    expect(s.list("").sort()).toEqual(["cards", "presence.json"]);
  });
});

describe("the storages' own ways", () => {
  it("memory hands out copies, and refuses a path that isn't the layer's", () => {
    const s = new MemoryStorage();
    s.create("a/b.json", bytes("x"));
    s.read("a/b.json")![0] = 0;
    expect(text(s.read("a/b.json"))).toBe("x");
    for (const bad of ["/a", "a//b", "../a", "a/./b", "a\\b", ""]) expect(() => s.read(bad), bad).toThrow(/not a path/);
    expect(s.paths()).toEqual(["a/b.json"]);
  });

  it("a folder never lists a write in progress", () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "baesian-storage-")));
    dirs.push(dir);
    const s = new FolderStorage(dir);
    s.create("cards/B-aaaaa/r1.md", bytes("a"));
    writeFileSync(join(dir, "cards", "B-aaaaa", "r2.md.x4k2m.tmp"), "");
    expect(s.list("cards/B-aaaaa")).toEqual(["r1.md"]);
  });
});

// ---------------------------------------------------------------- a store with no repo (B-0ag7h)

describe("a store with no repo and no record, over memory (B-0ag7h)", () => {
  beforeEach(() => {
    touched.length = 0;
  });
  // Nothing here touches a disk or runs git: the relay has neither.
  afterEach(() => {
    expect(touched).toEqual([]);
  });

  it("files and revises cards, each revision gated, with its record beside it", () => {
    const { store, storage } = memory();
    const r = store.fileCard(draft(), BODY, AGENT);
    const id = r.card.meta.id;
    expect(r.card.meta).toMatchObject({ deck: "branch-main", source_branch: "main", level: "provisional" });
    expect(store.gateRecord(id)).toMatchObject({ by: "cli", revision: 1, outcome: "shown", source: "agent" });
    expect(storage.paths()).toEqual(["decks/branch-main.md", `cards/${id}/gate-r1-cli.json`, `cards/${id}/r1.md`].sort());
    expect(() => store.fileCard(draft({ title: "Postgres or SQLite?" }), BODY, AGENT)).toThrow(/already be on file/);
    answer(store, id, { response: "reject", comment: "Not yet." });
    expect(store.status(id)).toBe("returned");
    const r2 = store.reviseCard(id, draft({ proposal: "Postgres", alternative: "SQLite (WAL mode)" }), BODY, AGENT);
    expect(r2.card.meta.revision).toBe(2);
    expect(store.gateRecord(id)).toMatchObject({ revision: 2, source: "answer" });
    expect(store.status(id)).toBe("open");
  });

  it("withdraws a card once, and records a fallback", () => {
    const { store } = memory();
    const id = file(store, { level: "blocking" });
    expect(store.recordFallback(id, "timeout", "claude-code")).toMatchObject({ card: id, revision: 1, reason: "timeout" });
    expect(store.fallbacks(id)).toHaveLength(1);
    store.withdraw(id, "Not needed after all.", "claude-code");
    expect(store.status(id)).toBe("withdrawn");
    expect(store.withdrawal(id)?.reason).toBe("Not needed after all.");
    expect(() => store.withdraw(id, "again", "claude-code")).toThrow(NotAllowed);
  });

  it("answers with everything an answer does: stale revisions refused, rules saved and retired", () => {
    const { store } = memory();
    const id = file(store);
    answer(store, id, { response: "reject", comment: "Not yet." });
    store.reviseCard(id, draft({ title: `Decision ${n} on its own`, topic: `area${n}/q` }), BODY, AGENT);
    expect(() => answer(store, id, { revision: 1 })).toThrow(/stale/);
    answer(store, id, { make_rule: true });
    expect(store.ruleAsked(id)).toBe(true);
    const ruleCard = store.draftRule(id, "Keep run metadata in SQLite.", ["dep:pytest*"], AGENT);
    answer(store, ruleCard.meta.id);
    const [rule] = store.rules();
    expect(rule?.meta).toMatchObject({ from_card: id, covers: ["dep:pytest*"], accepted_by: "gus" });
    const breaker = file(store, { proposal_breaks: [rule!.meta.id] });
    expect(() => answer(store, breaker, { response: "reject", comment: "No.", retire_rules: [rule!.meta.id] })).toThrow(/only choosing one of a card's options/);
    answer(store, breaker, { retire_rules: [rule!.meta.id] });
    expect(store.rules()[0]?.retired).toMatchObject({ rule: rule!.meta.id, card: breaker });
    expect(() => answer(store, file(store), { should_have_asked: true })).toThrow(/wasn't held back/);
  });

  it("files Baesian's own proposals after an answer, and accepting a slider proposal writes the preference file", () => {
    const { store } = memory();
    const id = file(store, { touches: ["infra"] });
    const v = answer(store, id, { response: "alternative", choice: "Postgres", comment: "Always keep state out of process." });
    const filed = afterVerdict(store, v);
    expect(filed.map((c) => c.meta.deck).sort()).toEqual(["conventions", "preferences"]);
    const convention = filed.find((c) => c.meta.convention)!;
    answer(store, convention.meta.id);
    expect(store.ruleAsked(convention.meta.id)).toBe(true);
    const slider = filed.find((c) => c.meta.pref_row)!;
    expect(store.inForce().file).toBeUndefined();
    answer(store, slider.meta.id);
    expect(store.inForce().file).toMatchObject({ row_infra: "stop-and-ask", from_card: slider.meta.id, by: "gus" });
    expect(proposeSliderMoves(store)).toEqual([]);
  });

  it("merges topics, and follows the alias", () => {
    const { store } = memory();
    file(store, { title: "Timestamp format?", topic: "time/format" });
    file(store, { title: "Clock source?", topic: "time/formats" });
    expect(store.mergeTopics("time/formats", "time/format", "gus")).toMatchObject({ from: "time/formats", to: "time/format" });
    expect(store.canonicalTopic("time/formats")).toBe("time/format");
    expect(() => store.mergeTopics("time/formats", "time/format", "gus")).toThrow(/already the same topic/);
  });

  it("changes the preferences, refusing a change from an older view, and the gate holds cards back under them", () => {
    const { store } = memory();
    const first = store.writePreferences({ preset: "hands-off", mode: "enforce", rate_agent_decides: 0, burn_in: 0 }, WHO);
    expect(() => store.writePreferences({ row_schema: "tell-me" }, WHO)).toThrow(StalePreferences);
    expect(store.inForce()).toMatchObject({ name: first.name, settings: { mode: "enforce" } });
    const held = file(store, { touches: ["dependency"] });
    expect(store.gateRecord(held)).toMatchObject({ outcome: "held", preferences: first.name });
    expect(store.status(held)).toBe("held");
    answer(store, held, { should_have_asked: true, first_choice: "proposal" });
    expect(store.status(held)).toBe("resolved");
  });

  it("gives status and levels: hard by its facts, and in force", () => {
    const { store } = memory();
    const hard = file(store, { touches: ["data-loss"] });
    expect(store.levelOf(hard)).toBe("hard");
    const parent = file(store);
    const child = file(store, { depends_on: [parent] });
    answer(store, parent, { response: "alternative", choice: "Parquet files" });
    expect(store.status(child)).toBe("returned");
    expect(store.briefs(child)).toMatchObject([{ kind: "parent-decided-otherwise", parent }]);
    expect(store.decision(parent)).toBe("Parquet files");
  });

  it("reads through a view, reporting a file it can't read instead of throwing", () => {
    const { store, storage } = memory();
    const id = file(store);
    storage.replace(`cards/${id}/r1.md`, bytes("---\nnot: a card\n---\n"));
    expect(() => store.view(() => store.cards())).toThrow(/is not valid/);
    const skipped: string[] = [];
    expect(store.view(() => store.cards(), (path) => skipped.push(path))).toEqual([]);
    expect(skipped).toEqual([`cards/${id}/r1.md`]);
  });

  it("keeps presence, waiting markers and inbox cursors, replaced whole", () => {
    const { store, storage } = memory();
    const id = file(store, { level: "blocking" });
    store.touchPresence("web", "2026-11-03T10:00:00.000Z");
    expect(store.presence()).toMatchObject({ client: "web", at: "2026-11-03T10:00:00.000Z" });
    const w = store.startWaiting(id, "claude-code", "2026-11-03T10:00:00.000Z");
    expect(store.waitingOn(id, Date.parse("2026-11-03T10:00:30.000Z"))).toMatchObject([{ marker: { agent: "claude-code" }, stale: false }]);
    expect(store.waitingOn(id, Date.parse("2026-11-03T10:05:00.000Z"))[0]?.stale).toBe(true);
    w.stop();
    expect(store.waitingOn(id)).toEqual([]);
    answer(store, id);
    expect(store.inbox({ advance: true })).toHaveLength(1);
    expect(store.inbox({ advance: true })).toHaveLength(0);
    expect(storage.paths()).toContain("cursors/main.json");
  });

  it("checks what a person writes in a hosted project (M9a): signed, in its project, and proved on a hard card", () => {
    const service = new TestService();
    const { store } = memory({ config: { service: ORIGIN, project: service.project } });
    service.link(store);
    expect(store.hosted()).toMatchObject({ pinned: false, project: service.project });
    const id = file(store);
    const unsigned = service.answer(store, { card: id, response: "accept" }, { unsigned: true });
    expect(store.judge(unsigned)).toMatchObject({ ok: false, why: expect.stringContaining("no signature") });
    expect(store.status(id)).toBe("open");
    service.answer(store, { card: id, response: "accept" });
    expect(store.status(id)).toBe("resolved");
    expect(store.uncounted()).toEqual([{ file: unsigned, why: expect.stringContaining("no signature") }]);
    // A hard card takes the reviewer's passkey (D139); and only the relay's signed gate record counts (D158).
    const passkey = new TestPasskey();
    service.enrol(store, passkey);
    const hard = file(store, { touches: ["data-loss"] });
    expect(store.gateRecord(hard)).toBeUndefined();
    service.gate(store, hard);
    expect(store.gateRecord(hard)).toMatchObject({ by: "relay" });
    service.answer(store, { card: hard, response: "accept" });
    expect(store.status(hard)).toBe("open");
    service.answer(store, { card: hard, response: "accept" }, { passkey });
    expect(store.status(hard)).toBe("resolved");
  });

  it("takes its pinned keys only from its options, never CI's settings", () => {
    const service = new TestService();
    process.env.BAESIAN_TRUST = "not even JSON";
    try {
      const { store } = memory({ config: { project: service.project } });
      expect(store.hosted()).toBeUndefined();
      const pinned = memory({ config: { project: service.project }, trust: { pinned: service.pinned() } }).store;
      expect(pinned.hosted()).toMatchObject({ pinned: true, project: service.project });
    } finally {
      delete process.env.BAESIAN_TRUST;
    }
  });

  it("refuses what needs git or the record, with a clear error, and writes nothing", () => {
    const { store, storage } = memory();
    file(store);
    const before = storage.paths();
    for (const attempt of [
      () => store.init(),
      () => store.setVault("docs"),
      () => store.syncRecord(),
      () => store.createDeck({ id: "plan", title: "The plan", from: "docs/plan.md" }, ""),
      () => store.repo,
      () => store.live,
      () => store.record,
    ]) {
      expect(attempt).toThrow(NeedsRepo);
    }
    expect(() => store.syncRecord()).toThrow(/needs the repository and its record/);
    expect(storage.paths()).toEqual(before);
    expect(store.hasRepo).toBe(false);
    expect(store.isInitialised()).toBe(true);
  });

  it("reads every card a constant number of times for the state, so the state is linear in the cards", () => {
    const reads = (count: number) => {
      const storage = new MemoryStorage();
      let calls = 0;
      const counted: Storage = {
        read: (p) => (calls++, storage.read(p)),
        list: (p) => (calls++, storage.list(p)),
        create: (p, b) => storage.create(p, b),
        replace: (p, b) => storage.replace(p, b),
        remove: (p) => storage.remove(p),
      };
      const store = Store.over(counted, { branch: "main" });
      for (let i = 0; i < count; i++) answer(store, file(store));
      calls = 0;
      snapshot(store, CONTEXT);
      return calls;
    };
    const ten = reads(10);
    const forty = reads(40);
    // Linear is four times as many; a status that read every card afresh would be sixteen.
    expect(forty).toBeLessThan(ten * 6);
  });
});

// ---------------------------------------------------------------- the state over both (B-17wn9)

const CONTEXT = {
  version: 7,
  server: { pid: 0, started: "2026-11-03T09:00:00.000Z", watch: "poll" as const },
  project: { name: "crumb", branch: "main" },
  now: Date.parse("2026-11-03T12:00:00.000Z"),
};

/** Every file in a folder, as a layer path. */
function walk(dir: string, prefix = ""): string[] {
  return readdirSync(join(dir, prefix)).flatMap((name) => {
    const rel = prefix ? `${prefix}/${name}` : name;
    return statSync(join(dir, rel)).isDirectory() ? walk(dir, rel) : [rel];
  });
}

describe("the state the client reads (B-17wn9)", () => {
  it("is the same over memory as over the repo's folder holding the same files", () => {
    const { store } = repo();
    // A project with some of everything: answered, returned and revised, withdrawn, held, a rule and its retirement, an
    // alias, a deck with context notes, an attachment, a fallback, presence and an agent waiting.
    store.createDeck({ id: "storage-layer", title: "Storage", context_notes: ["[[Design/Storage#Runs|the runs]]", "Vault Adapter"] }, "## Goal\nPersist runs.\n");
    const plain = file(store, { deck: "storage-layer" });
    const parent = file(store);
    const child = file(store, { depends_on: [parent] });
    answer(store, parent, { response: "alternative", choice: "Parquet files" });
    answer(store, plain, { make_rule: true });
    answer(store, store.draftRule(plain, "Keep runs in SQLite.", ["dep:sqlite*"], AGENT).meta.id);
    const rule = store.rules()[0]!.meta.id;
    answer(store, file(store, { proposal_breaks: [rule] }), { retire_rules: [rule] });
    const returned = file(store);
    answer(store, returned, { response: "reject", comment: "Not yet." });
    store.reviseCard(returned, draft({ title: `Decision ${n} on its own`, topic: `area${n}/q` }), BODY, AGENT);
    store.withdraw(file(store), "Not needed.", "claude-code");
    file(store, { title: "Clock source?", topic: "time/formats" });
    file(store, { title: "Timestamp format?", topic: "time/format" });
    store.mergeTopics("time/formats", "time/format", "gus");
    store.writePreferences({ preset: "hands-off", mode: "enforce", rate_agent_decides: 0, burn_in: 0 }, WHO);
    const held = file(store, { touches: ["dependency"] });
    store.attach(child, "codex");
    store.recordFallback(child, "timeout", "claude-code");
    store.touchPresence("web", "2026-11-03T11:59:00.000Z");
    store.startWaiting(child, "claude-code", "2026-11-03T11:58:00.000Z");

    const storage = new MemoryStorage();
    for (const rel of walk(store.live)) storage.create(rel, readFileSync(join(store.live, rel)));
    // The default branch, which the folder's store reads from git, the relay's has as a machine sent it (B-jr8mk).
    storage.replace(DEFAULT_BRANCH, new TextEncoder().encode(`${JSON.stringify({ type: "default-branch", format: 1, branch: store.defaultBranch() })}\n`));
    const relay = Store.over(storage, { branch: "main" });

    const local = snapshot(store, CONTEXT);
    expect(local.defaultBranch).toBe("main");
    expect(local.cards.find((c) => c.meta.id === held)?.status).toBe("held");
    expect(local.cards.find((c) => c.meta.id === child)?.waiting).toHaveLength(1);
    expect(local.decks.find((d) => d.meta.id === "storage-layer")?.notes).toEqual([
      { link: "[[Design/Storage#Runs|the runs]]", text: "the runs" },
      { link: "Vault Adapter", text: "Vault Adapter" },
    ]);
    expect(local.problems).toEqual([]);
    // The folder's store reads through node:fs, and searches git's history for briefs; the store over memory does neither.
    expect(touched).toEqual(expect.arrayContaining(["node:fs readFileSync", "node:child_process execFileSync"]));
    touched.length = 0;
    expect(snapshot(relay, CONTEXT)).toEqual(local);
    expect(touched).toEqual([]);
    expect(presets(relay)).toEqual(presets(store));
  });
});
