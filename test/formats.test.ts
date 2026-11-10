import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { CARD_TEMPLATE } from "../src/agents.js";
import { main } from "../src/cli.js";
import { parseDoc } from "../src/frontmatter.js";
import { openRepo } from "../src/git.js";
import { userConfig } from "../src/notify.js";
import { type RunningServer, findRunningServer, serverState, startServer } from "../src/server.js";
import { FILE_KINDS, type FileKindName, NewerFormat, newestFormat, upgradeFile } from "../src/schema.js";
import { Store, ValidationError } from "../src/store.js";
import { verify } from "../src/verify.js";
import { writeNotes } from "../src/vault.js";
import { BODY, REVIEWER, cleanup, draft, repo, sh } from "./helpers.js";

// Format numbers (D156, D157): every file Baesian writes carries `format`, right after `type`; a file with none was
// written before v1 and reads as format 1; a file in a newer format is refused, loudly outside a view and reported
// inside one. CI checks each commit against its own record, so a record from before the field must still pass.

const servers: RunningServer[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.close();
  cleanup();
});

const AGENT = { agent: "claude-code" };
const VAULT = "docs/vault";

async function run(cwd: string, args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const io = { out: (l: string) => out.push(l), err: (l: string) => err.push(l), stdin: () => "", cwd, hookFallback: [] as string[] };
  const code = await main(["node", "baesian", ...args], io);
  return { code, out: out.join("\n"), err: err.join("\n") };
}

/** A repo holding one file of every kind the store and the vault adapter write. */
function everyKind() {
  const { dir, store } = repo();
  mkdirSync(join(dir, VAULT), { recursive: true });
  store.setVault(VAULT);
  store.createDeck({ id: "formats", title: "Formats" }, "The briefing.\n");
  const file = (over: Record<string, unknown> = {}) => store.fileCard(draft({ deck: "formats", ...over }), BODY, { ...AGENT, force: true }).card.meta.id;
  // A card answered, returned, revised, answered against its pick, replied to, accepted with a rule asked for.
  const a = file();
  store.addVerdict({ card: a, revision: 1, response: "question", comment: "Why not Postgres?", ...REVIEWER });
  store.reviseCard(a, draft({ deck: "formats" }), BODY, AGENT);
  store.addVerdict({ card: a, revision: 2, response: "alternative", choice: "Postgres", ...REVIEWER });
  store.replyToCard(a, "Only one machine writes runs.", AGENT);
  store.addVerdict({ card: a, revision: 3, response: "accept", make_rule: true, ...REVIEWER });
  // The rule it asked for, saved, then retired by an answer that breaks it.
  const draftCard = store.draftRule(a, "Use SQLite for local state.", ["dep:sqlite*"], AGENT).meta.id;
  store.addVerdict({ card: draftCard, revision: 1, response: "accept", ...REVIEWER });
  const rule = store.rules()[0]!.meta.id;
  const b = file({ title: "The cache store", question: "Where should the cache live?", topic: "storage/cache", proposal_breaks: [rule] });
  store.addVerdict({ card: b, revision: 1, response: "accept", retire_rules: [rule], ...REVIEWER });
  // A topic alias, a withdrawal, an attachment, a fallback, a ledger entry, a merge.
  const c = file({ title: "Somewhere else", question: "Where else?", topic: "storage/other" });
  store.mergeTopics("storage/other", "storage/cache", "gus");
  store.withdraw(c, "not needed", "claude-code");
  const d = file({ title: "The blocking one", question: "Which one blocks?", topic: "storage/blocking", level: "blocking" });
  store.attach(d, "codex");
  store.recordFallback(d, "timeout", "claude-code");
  store.writeLedger(a, { commit: "0123456789abcdef" }, "Built in `0123456789`.\n");
  // A merge the hooks found (D181).
  store.writeMerge({ branch: "feat/x", into: "main", commit: "0".repeat(40), at: new Date().toISOString(), cards: [a] });
  // A preference file, which only the client writes (D147); every card above has its gate record.
  store.writePreferences({ preset: "fewer-interruptions" }, { by: "gus", client: "web" });
  // The mutable files: presence, a waiting marker, and the cursors, the branch's and a session's, with a delivery.
  store.touchPresence("web");
  store.startWaiting(d, "claude-code");
  store.inbox({ advance: true });
  store.inbox({ advance: true, session: "session-1" });
  // A session's model, as the plugin's hooks keep it (B-k0w7d).
  store.noteSessionModel("session-1", "claude-opus-5-5");
  store.addVerdict({ card: d, revision: 1, response: "defer", comment: "Later.", ...REVIEWER });
  store.markDelivered(d, { verdict: store.verdicts(d).at(-1)!, briefs: [] });
  // The vault's notes.
  store.syncRecord();
  expect(writeNotes(store).warnings).toEqual([]);
  return { dir, store, ids: { a, b, c, d, rule } };
}

/** Every file under a directory, relative to it. */
function walk(root: string, at = root): string[] {
  if (!existsSync(at)) return [];
  return readdirSync(at).flatMap((name) => {
    const path = join(at, name);
    return statSync(path).isDirectory() ? walk(root, path) : [relative(root, path)];
  });
}

/** A file's fields, in the order they're written: JSON, or Markdown's frontmatter. */
function fieldsOf(path: string): Record<string, unknown> {
  const text = readFileSync(path, "utf8");
  return path.endsWith(".md") ? parseDoc(text).meta : (JSON.parse(text) as Record<string, unknown>);
}

/** Rewrite a file's fields, keeping its body. */
function setFields(path: string, change: (f: Record<string, unknown>) => Record<string, unknown>): void {
  const text = readFileSync(path, "utf8");
  if (path.endsWith(".md")) {
    const { meta, body } = parseDoc(text);
    writeFileSync(path, `---\n${stringify(change(meta), { lineWidth: 0 })}---\n${body}`);
  } else {
    writeFileSync(path, `${JSON.stringify(change(JSON.parse(text) as Record<string, unknown>), null, 2)}\n`);
  }
}

const without = (f: Record<string, unknown>, ...keys: string[]) => Object.fromEntries(Object.entries(f).filter(([k]) => !keys.includes(k)));

/** Which kind a written file is, by where it is and its `type`. */
function kindOf(where: "live" | "record" | "vault", type: unknown): FileKindName {
  if (where === "vault") return type === "decision" ? "decision-note" : "rule-note";
  return type as FileKindName;
}

/** Everything the store reads, for comparing two reads of the same files. */
function readAll(store: Store) {
  return store.view(() => ({
    cards: store.cardIds().map((id) => ({ revisions: store.revisions(id), status: store.status(id), fallbacks: store.fallbacks(id), withdrawal: store.withdrawal(id), verdicts: store.verdicts(id), ledger: store.ledger(id) })),
    decks: store.decks(),
    rules: store.rules(),
    aliases: store.aliases(),
    attachments: store.attachments(),
    config: store.config(),
  }));
}

describe("a written file carries its format (D156)", () => {
  it("in every kind, as format 1, right after type", () => {
    const { dir, store, ids } = everyKind();
    const seen = new Set<FileKindName>();
    const layers = [["live", store.live], ["record", store.record], ["vault", join(dir, VAULT)]] as const;
    for (const [where, root] of layers) {
      for (const rel of walk(root)) {
        if (rel === "config.json" || (where === "vault" && !/^(Decisions|Rules)\//.test(rel))) continue;
        const f = fieldsOf(join(root, rel));
        expect(Object.keys(f).slice(0, 2), `${where} ${rel}`).toEqual(["type", "format"]);
        expect(f.format, `${where} ${rel}`).toBe(1);
        seen.add(kindOf(where, f.type));
      }
    }
    // Every kind Baesian writes but the server's two files, which `serve` writes (below). Drafts and the personal
    // config are written by people; signatures, passkey proofs and the keys by the hosted service (test/hosted.test.ts);
    // relay.json and the machine's grant by the CLI when it syncs and signs in (test/relay.test.ts); personal mode's
    // before-linking snapshot when a personal clone is linked (test/personal.test.ts); the pin's project line is printed
    // by `baesian ci`, never written (test/ci.test.ts); and the default branch is sent to the relay, never written here
    // (test/relay.test.ts, B-jr8mk).
    const relay = ["signature", "passkey-proof", "service-key", "service-key-revocation", "passkey-key", "relay", "grant", "project", "before-linking", "default-branch"];
    const written = Object.keys(FILE_KINDS).filter((k) => !["card-draft", "user-config", "config", "server", "port", ...relay].includes(k));
    expect([...seen].sort()).toEqual(written.sort());
    // The revisions Baesian writes from a draft, a revision and a reply are all in the newest card format.
    expect(store.revisions(ids.a).map((r) => r.meta.format)).toEqual([1, 1, 1]);
  });

  it("in the config Baesian writes, first, since it has no type", () => {
    const { store } = repo();
    expect(readFileSync(join(store.record, "config.json"), "utf8")).toBe(`{\n  "format": 1\n}\n`);
    store.setVault("docs");
    expect(Object.entries(fieldsOf(join(store.record, "config.json")))).toEqual([["format", 1], ["vault", "docs"]]);
  });

  it("in the server's file and the last port", async () => {
    const { store } = repo();
    const s = await startServer(store, { reviewer: "tester" });
    servers.push(s);
    for (const name of ["server.json", "port.json"]) {
      const f = fieldsOf(join(store.live, name));
      expect(Object.keys(f).slice(0, 2), name).toEqual(["type", "format"]);
      expect(f.format, name).toBe(1);
    }
    expect((await findRunningServer(store))?.format).toBe(1);
  });

  it("set by Baesian, never by the draft, whose format is its own; the template doesn't offer it", () => {
    const { store } = repo();
    const { card } = store.fileCard(draft({ format: 1 }), BODY, AGENT);
    expect(card.meta.format).toBe(newestFormat("card"));
    expect(fieldsOf(join(store.live, "cards", card.meta.id, "r1.md")).format).toBe(1);
    expect(CARD_TEMPLATE).not.toMatch(/format/);
  });
});

describe("a file with no format (D156)", () => {
  it("was written before v1, and reads as format 1, with nothing else changed", () => {
    const { store, ids } = everyKind();
    const before = readAll(store);
    const record = Store.overRecord(store.repo, store.record);
    const recordBefore = readAll(record);
    for (const root of [store.live, store.record]) {
      for (const rel of walk(root)) setFields(join(root, rel), (f) => without(f, "format"));
    }
    expect(fieldsOf(join(store.live, "cards", ids.a, "r1.md"))).not.toHaveProperty("format");
    expect(readAll(store)).toEqual(before);
    expect(readAll(record)).toEqual(recordBefore);
    expect(store.presence()?.format).toBe(1);
    expect(store.waitingOn(ids.d)[0]?.marker.format).toBe(1);
    expect(store.inbox({ advance: false })).toEqual([]);
    // The notes are rendered afresh from the record, so they come out the same.
    expect(writeNotes(store).written).toEqual([]);
  });

  it("is upgraded only in memory: reading never rewrites it", () => {
    const { store } = repo();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    const path = join(store.live, "cards", id, "r1.md");
    setFields(path, (f) => without(f, "format"));
    const text = readFileSync(path, "utf8");
    expect(store.card(id)?.meta.format).toBe(1);
    store.syncRecord();
    expect(readFileSync(path, "utf8")).toBe(text);
  });

  it("in a cursor, which had no type either, reads, and is written in the newest format next time", () => {
    const { store } = repo();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    const at = store.verdicts(id)[0]!.at;
    const cursor = join(store.live, "cursors", "main.json");
    mkdirSync(join(store.live, "cursors"), { recursive: true });
    writeFileSync(cursor, `${JSON.stringify({ at: "" })}\n`); // as written before v1
    expect(store.inbox({ advance: true }).map((i) => i.card)).toEqual([id]);
    expect(JSON.parse(readFileSync(cursor, "utf8"))).toEqual({ type: "cursor", format: 1, at });
    expect(store.inbox({ advance: true })).toEqual([]);
  });

  it("in a vault note, gains it at the note's next update, right after type", () => {
    const { dir, store } = everyKind();
    const notes = walk(join(dir, VAULT)).filter((p) => /^(Decisions|Rules)\//.test(p));
    expect(notes.length).toBeGreaterThan(1);
    const written = notes.map((p) => readFileSync(join(dir, VAULT, p), "utf8"));
    for (const p of notes) writeFileSync(join(dir, VAULT, p), readFileSync(join(dir, VAULT, p), "utf8").replace(/^format: 1\n/m, ""));
    expect(writeNotes(store).written.sort()).toEqual(notes.map((p) => `${VAULT}/${p}`).sort());
    expect(notes.map((p) => readFileSync(join(dir, VAULT, p), "utf8"))).toEqual(written);
  });

  it("in the configs people write, reads as format 1", () => {
    const { store } = repo();
    writeFileSync(join(store.record, "config.json"), `${JSON.stringify({ vault: "docs" })}\n`);
    expect(store.config()).toEqual({ format: 1, vault: "docs" });
    const dir = mkdtempSync(join(tmpdir(), "baesian-cfg-"));
    writeFileSync(join(dir, "config.json"), JSON.stringify({ os_notify: false }));
    expect(userConfig(join(dir, "config.json"))).toEqual({ format: 1, os_notify: false });
  });

  it("passes baesian verify, over a commit whose record predates the field", () => {
    const { dir, store } = repo();
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", "Set up Baesian");
    sh(dir, "checkout", "-q", "-b", "feat");
    const id = store.fileCard(draft({ touches: ["dependency"] }), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    const other = store.fileCard(draft({ title: "The cache store", question: "Where should the cache live?", topic: "storage/cache" }), BODY, AGENT).card.meta.id;
    store.mergeTopics("storage/cache", "storage/run-metadata", "gus");
    store.withdraw(other, "not needed", "claude-code");
    store.writeLedger(id, { commit: "0123456789abcdef" }, "Built.\n");
    store.syncRecord();
    // The record as a Baesian before v1 wrote it: no file has a format, the config included.
    for (const rel of walk(store.record)) setFields(join(store.record, rel), (f) => without(f, "format"));
    expect(walk(store.record).some((rel) => "format" in fieldsOf(join(store.record, rel)))).toBe(false);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", dependencies: { "better-sqlite3": "^11" } }));
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", `Add SQLite\n\nBaesian-Card: ${id}`);
    const r = verify(openRepo(dir), "main", { merge: true });
    expect(r.commits.map((c) => c.report.ok)).toEqual([true]);
    expect(r.merge?.problems).toEqual([]);
    expect(r.ok).toBe(true);
  });
});

describe("a file in a newer format (D157)", () => {
  const MESSAGE = (file: string, kind: string) => `${file} has ${kind} format 2; this Baesian reads up to 1: upgrade Baesian`;

  /** The store's files, each with how it's read: refusing one throws, or, in a reporting view, reports and skips it. */
  const READS = (ids: ReturnType<typeof everyKind>["ids"], live: string) => {
    const first = (dir: string, match: (f: string) => boolean) => `${dir}/${readdirSync(join(live, dir)).sort().find(match)!}`;
    return [
      { file: `cards/${ids.a}/r1.md`, kind: "card", read: (s: Store) => s.revisions(ids.a) },
      { file: first("verdicts", (f) => f.includes(ids.b)), kind: "verdict", read: (s: Store) => s.verdicts(ids.b) },
      { file: `cards/${ids.c}/withdrawn.json`, kind: "withdrawal", read: (s: Store) => s.withdrawal(ids.c) },
      { file: first(`cards/${ids.d}`, (f) => f.startsWith("fallback-")), kind: "fallback", read: (s: Store) => s.fallbacks(ids.d) },
      { file: first("ledger", (f) => f.startsWith(ids.a)), kind: "ledger entry", read: (s: Store) => s.ledger(ids.a) },
      { file: "decks/formats.md", kind: "deck", read: (s: Store) => s.decks() },
      { file: `rules/${ids.rule}.md`, kind: "rule", read: (s: Store) => s.rules() },
      { file: `rules/${ids.rule}-retired.json`, kind: "rule retirement", read: (s: Store) => s.rules().map((r) => r.retired) },
      { file: first("topics", () => true), kind: "topic alias", read: (s: Store) => s.aliases() },
      { file: first("attachments", () => true), kind: "attachment", read: (s: Store) => s.attachments() },
      { file: first("waiting", () => true), kind: "waiting marker", read: (s: Store) => s.waitingOn(ids.d) },
    ];
  };

  it("is refused, naming the kind, its format and what this Baesian reads: thrown outside a view, reported and skipped inside one", () => {
    const { store, ids } = everyKind();
    for (const { file, kind, read } of READS(ids, store.live)) {
      const path = join(store.live, file);
      const was = readFileSync(path, "utf8");
      const whole = store.view(() => read(store));
      setFields(path, (f) => ({ ...f, format: 2 }));
      expect(() => read(store), file).toThrow(NewerFormat);
      expect(() => store.view(() => read(store)), file).toThrow(MESSAGE(file, kind));
      const problems: { path: string; error: string }[] = [];
      const skipped = store.view(() => read(store), (p, error) => problems.push({ path: p, error }));
      expect(problems, file).toEqual([{ path: file, error: MESSAGE(file, kind) }]);
      expect(skipped, file).not.toEqual(whole);
      writeFileSync(path, was);
    }
  });

  it("is refused in a draft, a cursor and the configs", () => {
    const { store } = repo();
    expect(() => store.fileCard(draft({ format: 2 }), BODY, AGENT)).toThrow(MESSAGE("the card", "card draft"));
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    store.inbox({ advance: true });
    setFields(join(store.live, "cursors", "main.json"), (f) => ({ ...f, format: 2 }));
    expect(() => store.inbox({ advance: false })).toThrow(MESSAGE("cursors/main.json", "inbox cursor"));
    setFields(join(store.record, "config.json"), (f) => ({ ...f, format: 2 }));
    expect(() => store.config()).toThrow(MESSAGE("config.json", "config"));
    const dir = mkdtempSync(join(tmpdir(), "baesian-cfg-"));
    const personal = join(dir, "config.json");
    writeFileSync(personal, JSON.stringify({ format: 2, os_notify: false }));
    expect(() => userConfig(personal)).toThrow(MESSAGE(personal, "personal config"));
  });

  it("stops the CLI with the message, and the server reports it beside the cards it can read", async () => {
    const { dir, store } = repo();
    const ok = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    const newer = store.fileCard(draft({ title: "The cache store", question: "Where should the cache live?", topic: "storage/cache" }), BODY, AGENT).card.meta.id;
    setFields(join(store.live, "cards", newer, "r1.md"), (f) => ({ ...f, format: 2 }));
    const r = await run(dir, ["list", "--all"]);
    expect(r.code).toBe(1);
    expect(r.err).toBe(MESSAGE(`cards/${newer}/r1.md`, "card"));
    const st = serverState(store, { version: 1, started: new Date().toISOString(), watch: "poll" });
    expect(st.cards.map((c) => c.meta.id)).toEqual([ok]);
    expect(st.problems).toEqual([{ path: join("cards", newer, "r1.md"), error: MESSAGE(`cards/${newer}/r1.md`, "card") }]);
  });

  it("fails baesian verify, naming the file in the commit's record", async () => {
    const { dir, store } = repo();
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", "Set up Baesian");
    sh(dir, "checkout", "-q", "-b", "feat");
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    setFields(join(store.record, "cards", id, "r1.md"), (f) => ({ ...f, format: 2 }));
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", `Work\n\nBaesian-Card: ${id}`);
    const r = await run(dir, ["verify", "--base", "main"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain(MESSAGE(`cards/${id}/r1.md`, "card"));
  });

  it("is ignored where an unreadable file means unknown: presence, the server's file and the last port", async () => {
    const { store } = repo();
    store.touchPresence("web");
    setFields(join(store.live, "presence.json"), (f) => ({ ...f, format: 2 }));
    expect(store.presence()).toBeUndefined();
    const s = await startServer(store, { reviewer: "tester" });
    servers.push(s);
    setFields(join(store.live, "server.json"), (f) => ({ ...f, format: 2 }));
    expect(await findRunningServer(store)).toBeUndefined();
    await servers.pop()!.close();
    // The next server writes the last port afresh, in the newest format.
    setFields(join(store.live, "port.json"), (f) => ({ ...f, format: 2 }));
    servers.push(await startServer(store, { reviewer: "tester" }));
    expect(fieldsOf(join(store.live, "port.json")).format).toBe(1);
  });

  it("in a vault note, leaves it as it is, with a warning", () => {
    const { dir, store, ids } = everyKind();
    const name = readdirSync(join(dir, VAULT, "Decisions")).find((n) => n.startsWith(ids.b))!;
    const path = join(dir, VAULT, "Decisions", name);
    writeFileSync(path, readFileSync(path, "utf8").replace(/^format: 1$/m, "format: 2").replace(/^status: active$/m, "status: changed by hand"));
    const text = readFileSync(path, "utf8");
    const r = writeNotes(store);
    expect(r.warnings).toEqual([`left ${VAULT}/Decisions/${name} alone: the note has decision note format 2; this Baesian reads up to 1: upgrade Baesian`]);
    expect(readFileSync(path, "utf8")).toBe(text);
  });
});

describe("the upgrade table (D156)", () => {
  it("starts every kind at format 1", () => {
    for (const kind of Object.keys(FILE_KINDS) as FileKindName[]) expect(newestFormat(kind), kind).toBe(1);
  });

  it("upgrades through a kind's functions, so a format 2 adds one, and leaves the other kinds alone", () => {
    const upgrades = FILE_KINDS.verdict.upgrades as unknown as ((f: Record<string, unknown>) => Record<string, unknown>)[];
    upgrades.push((f) => ({ ...f, upgraded: true }));
    try {
      expect(newestFormat("verdict")).toBe(2);
      expect(newestFormat("card")).toBe(1);
      expect(upgradeFile("verdict", { type: "verdict", format: 1, card: "B-7f3kq" }, "v.json")).toEqual({ type: "verdict", format: 2, card: "B-7f3kq", upgraded: true });
      expect(upgradeFile("verdict", { type: "verdict", card: "B-7f3kq" }, "v.json")).toEqual({ type: "verdict", format: 2, card: "B-7f3kq", upgraded: true });
      expect(upgradeFile("verdict", { type: "verdict", format: 2 }, "v.json")).toEqual({ type: "verdict", format: 2 });
      expect(() => upgradeFile("verdict", { type: "verdict", format: 3 }, "v.json")).toThrow("v.json has verdict format 3; this Baesian reads up to 2: upgrade Baesian");
      expect(() => upgradeFile("card", { type: "card", format: 2 }, "r1.md")).toThrow(NewerFormat);
    } finally {
      upgrades.pop();
    }
  });

  it("leaves a format that isn't a whole number from 1 to the schema, which stays strict", () => {
    const { store } = repo();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    for (const bad of [0, 1.5, "1"]) {
      setFields(join(store.live, "cards", id, "r1.md"), (f) => ({ ...f, format: bad }));
      expect(() => store.card(id), String(bad)).toThrow(ValidationError);
    }
    setFields(join(store.live, "cards", id, "r1.md"), (f) => ({ ...f, format: 1, extra: "x" }));
    expect(() => store.card(id)).toThrow(ValidationError);
  });
});
