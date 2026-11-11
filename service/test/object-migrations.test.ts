import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { type Env, ProjectRelay } from "../src/index.js";
import { NewerSchema, OBJECT_MIGRATIONS, type ObjectMigration, SCHEMA_KEY, SCHEMA_VERSION, migrateObject, schemaVersion } from "../src/object-migrations.js";

// B-866d2 ("Numbered migrations, on wake"; Release v1 step 3): each project's object records its schema version in its
// meta table, and runs the migrations it hasn't had, in one transaction, as it wakes. Real projects are stored on
// baesian.dev already, made by releases 0.1.0 to 0.1.10 with `CREATE TABLE IF NOT EXISTS`: they must come through with
// every row.

/** The tables migration 3 made, for several reviewers (P20, B-tzdjn). */
const MEMBERS = ["presence_of", "push_told", "sent_to"];

/** Every table a project's object holds at this release: migration 1's, `built` (migration 2, B-evrec), and migration 3's. */
const TABLES = ["before_linking", "built", "files", "log", "meta", "pending", "practice", "presence_of", "push_arrivals", "push_pauses", "push_sent", "push_told", "retention_commits", "retention_delivered", "retention_held", "retention_removed", "retention_sent", "sent_to"];

/** The tables 0.1.10 made, exactly as its code wrote them (service/src/sql-storage.ts, retention.ts, notify.ts at v0.1.10). */
const RELEASED_0_1_10 = [
  `CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, bytes BLOB NOT NULL, once INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  format INTEGER NOT NULL,
  size INTEGER NOT NULL,
  digest TEXT NOT NULL,
  machine TEXT,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pending (id TEXT PRIMARY KEY, value TEXT NOT NULL, expires TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS before_linking (path TEXT PRIMARY KEY);`,
  `CREATE TABLE IF NOT EXISTS retention_sent (machine TEXT PRIMARY KEY, seq INTEGER NOT NULL, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS retention_delivered (card TEXT PRIMARY KEY, seq INTEGER NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS retention_removed (
  card TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  level TEXT NOT NULL,
  ended TEXT NOT NULL,
  filed TEXT NOT NULL,
  settled TEXT NOT NULL,
  removed TEXT NOT NULL,
  size INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS retention_held (by TEXT NOT NULL, row TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (by, row));
CREATE TABLE IF NOT EXISTS retention_commits (commit_id TEXT PRIMARY KEY);`,
  "CREATE TABLE IF NOT EXISTS push_arrivals (card TEXT NOT NULL, revision INTEGER NOT NULL, machine TEXT, arrived INTEGER NOT NULL, settled INTEGER, PRIMARY KEY (card, revision))",
  "CREATE TABLE IF NOT EXISTS push_sent (at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS push_pauses (machine TEXT PRIMARY KEY, cards INTEGER NOT NULL, since INTEGER NOT NULL, until INTEGER NOT NULL)",
];

const tablesOf = (sql: SqlStorage) =>
  [...sql.exec<{ name: string; schema: string; type: string }>("PRAGMA table_list")]
    .filter((t) => t.schema === "main" && t.type === "table" && !t.name.startsWith("sqlite_") && !t.name.startsWith("_cf_"))
    .map((t) => t.name)
    .sort();

/** Every row of every table, for comparing before and after. */
const rowsOf = (sql: SqlStorage, tables: string[]) => Object.fromEntries(tables.map((t) => [t, sql.exec(`SELECT * FROM ${t} ORDER BY 1`).toArray()]));

/** Rows as they were before migration 3 gave two tables a column each, both empty in every row there was. */
function withoutNewColumns(rows: Record<string, Record<string, unknown>[]>): Record<string, Record<string, unknown>[]> {
  const drop = (table: string, column: string) =>
    (rows[table] ?? []).map((r) => {
      const { [column]: added, ...rest } = r;
      expect(added).toBeNull();
      return rest;
    });
  return { ...rows, ...(rows.push_sent ? { push_sent: drop("push_sent", "account") } : {}), ...(rows.push_arrivals ? { push_arrivals: drop("push_arrivals", "handed") } : {}) };
}

/** A fresh object, emptied, as a release before migrations left one: `make` writes its tables and rows. */
function asReleasedBefore(state: DurableObjectState, make: (sql: SqlStorage) => void): void {
  state.storage.sql.exec("DELETE FROM meta");
  for (const t of tablesOf(state.storage.sql)) state.storage.sql.exec(`DROP TABLE ${t}`);
  expect(tablesOf(state.storage.sql)).toEqual([]);
  make(state.storage.sql);
}

const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe("a project's tables, migrated as its object wakes (B-866d2)", () => {
  it("are numbered from 1 with no gaps, migration 1 being every table the relay had", () => {
    expect(OBJECT_MIGRATIONS.map((m) => m.version)).toEqual(OBJECT_MIGRATIONS.map((_, i) => i + 1));
    expect(SCHEMA_VERSION).toBe(3);
  });

  it("are all made, at this release's version, in a new project", () =>
    runInDurableObject(env.PROJECTS.get(env.PROJECTS.newUniqueId()), (_i, state) => {
      expect(tablesOf(state.storage.sql)).toEqual(TABLES);
      expect(schemaVersion(state.storage.sql)).toBe(SCHEMA_VERSION);
      expect(state.storage.sql.exec("SELECT value FROM meta WHERE key = ?", SCHEMA_KEY).one().value).toBe("3");
      // Waking again changes nothing.
      expect(migrateObject(state.storage)).toEqual({ from: 3, to: 3 });
    }));

  it("bring a project 0.1.10 made up to date as it wakes, every row kept, and it serves as before", async () => {
    const stub = env.PROJECTS.get(env.PROJECTS.newUniqueId());
    await runInDurableObject(stub, async (_i, state) => {
      let before: Record<string, unknown[]> = {};
      asReleasedBefore(state, (sql) => {
        for (const s of RELEASED_0_1_10) sql.exec(s);
        // A project with a deck in its files and log, as 0.1.10 wrote them, and a row in each table that had one.
        const deck = "---\ntype: deck\nformat: 1\nid: old-deck\ntitle: A deck from before\ncreated: 2026-11-05T00:00:00.000Z\n---\n\nFrom 0.1.10.\n";
        sql.exec("INSERT INTO files (path, bytes, once) VALUES (?, ?, 1)", "decks/old-deck.md", bytes(deck));
        sql.exec("INSERT INTO log (path, format, size, digest, machine, at) VALUES (?, 1, ?, ?, 'laptop', '2026-11-05T00:00:00.000Z')", "decks/old-deck.md", deck.length, "d".repeat(64));
        sql.exec("INSERT INTO meta (key, value) VALUES ('project', 'proj-old'), ('version', '7'), ('retention_next', '1800000000000')");
        sql.exec("INSERT INTO pending (id, value, expires) VALUES ('p-1', '{}', '2099-01-01T00:00:00.000Z')");
        sql.exec("INSERT INTO retention_sent (machine, seq, at) VALUES ('laptop', 1, '2026-11-05T00:00:00.000Z')");
        sql.exec("INSERT INTO retention_commits (commit_id) VALUES ('abc1234')");
        sql.exec("INSERT INTO push_sent (at) VALUES (1762300000000)");
        sql.exec("INSERT INTO push_pauses (machine, cards, since, until) VALUES ('laptop', 9, 1, 2)");
        before = rowsOf(sql, tablesOf(sql));
      });
      expect(tablesOf(state.storage.sql)).toEqual(TABLES.filter((t) => t !== "practice" && t !== "built" && !MEMBERS.includes(t)));
      expect(schemaVersion(state.storage.sql)).toBe(0);

      // It wakes with this release's code.
      const woke = new ProjectRelay(state, env as unknown as Env);
      expect(tablesOf(state.storage.sql)).toEqual(TABLES);
      expect(schemaVersion(state.storage.sql)).toBe(3);
      const after = withoutNewColumns(rowsOf(state.storage.sql, Object.keys(before)));
      expect({ ...after, meta: after.meta!.filter((r) => r.key !== SCHEMA_KEY) }).toEqual(before);
      expect(state.storage.sql.exec("SELECT COUNT(*) AS n FROM practice").one().n).toBe(0);

      // And serves the project as it was: its log, its version, and a new write at the next number.
      const log = (await woke.log("proj-old", 0, 100)) as { status: number; body: { entries: { seq: number; path: string }[] } };
      expect(log.status).toBe(200);
      expect(log.body.entries.map((e) => [e.seq, e.path])).toEqual([[1, "decks/old-deck.md"]]);
      const s = await woke.state("proj-old");
      expect(s.status).toBe(200);
      expect(JSON.parse(s.text!)).toMatchObject({ version: 7 });
      expect((await woke.practiceRead("proj-old", "acct-gus")).status).toBe(200);
    });
  });

  it("make what a project made before retention_commits lacks, keeping the rest", () =>
    runInDurableObject(env.PROJECTS.get(env.PROJECTS.newUniqueId()), (_i, state) => {
      asReleasedBefore(state, (sql) => {
        sql.exec(RELEASED_0_1_10[0]!);
        sql.exec("INSERT INTO meta (key, value) VALUES ('project', 'proj-older'), ('version', '3')");
      });
      expect(migrateObject(state.storage)).toEqual({ from: 0, to: 3 });
      expect(tablesOf(state.storage.sql)).toEqual(TABLES);
      expect(state.storage.sql.exec("SELECT value FROM meta WHERE key = 'version'").one().value).toBe("3");
    }));

  it("give a project 1.0.1 left at schema 1 its table for the state as built, every row kept, and it serves as before (B-evrec)", async () => {
    const stub = env.PROJECTS.get(env.PROJECTS.newUniqueId());
    await runInDurableObject(stub, async (_i, state) => {
      let before: Record<string, unknown[]> = {};
      asReleasedBefore(state, (sql) => {
        // As 1.0.0 and 1.0.1 left a project: migration 1 alone, and the schema's number.
        sql.exec(OBJECT_MIGRATIONS[0]!.sql);
        const deck = "---\ntype: deck\nformat: 1\nid: a-deck\ntitle: A deck from 1.0.1\ncreated: 2026-11-10T00:00:00.000Z\n---\n\nFrom 1.0.1.\n";
        sql.exec("INSERT INTO files (path, bytes, once) VALUES (?, ?, 1)", "decks/a-deck.md", bytes(deck));
        sql.exec("INSERT INTO log (path, format, size, digest, machine, at) VALUES (?, 1, ?, ?, 'laptop', '2026-11-10T00:00:00.000Z')", "decks/a-deck.md", deck.length, "d".repeat(64));
        sql.exec("INSERT INTO meta (key, value) VALUES ('project', 'proj-101'), ('version', '4'), (?, '1')", SCHEMA_KEY);
        sql.exec("INSERT INTO practice (at, entry) VALUES ('2026-11-10T00:00:00.000Z', '{}')");
        before = rowsOf(sql, tablesOf(sql));
      });
      expect(tablesOf(state.storage.sql)).toEqual(TABLES.filter((t) => t !== "built" && !MEMBERS.includes(t)));
      expect(schemaVersion(state.storage.sql)).toBe(1);

      const woke = new ProjectRelay(state, env as unknown as Env);
      expect(tablesOf(state.storage.sql)).toEqual(TABLES);
      expect(schemaVersion(state.storage.sql)).toBe(3);
      const after = withoutNewColumns(rowsOf(state.storage.sql, Object.keys(before)));
      expect({ ...after, meta: after.meta!.filter((r) => r.key !== SCHEMA_KEY) }).toEqual({ ...before, meta: before.meta!.filter((r) => (r as { key: string }).key !== SCHEMA_KEY) });
      // Nothing is kept until the state is first read; then it is, at the project's version, which reading doesn't move.
      expect(state.storage.sql.exec("SELECT COUNT(*) AS n FROM built").one().n).toBe(0);
      const s = await woke.state("proj-101");
      expect(JSON.parse(s.text!)).toMatchObject({ version: 4, decks: [{ meta: { id: "a-deck" } }] });
      expect(state.storage.sql.exec("SELECT COUNT(*) AS n FROM built").one().n).toBeGreaterThan(1);
      expect(state.storage.sql.exec("SELECT value FROM meta WHERE key = 'version'").one().value).toBe("4");
    });
  });

  it("give a project 1.0.2 left at schema 2 its tables for several reviewers, every row kept, and it notifies as before (P20)", async () => {
    const stub = env.PROJECTS.get(env.PROJECTS.newUniqueId());
    await runInDurableObject(stub, async (_i, state) => {
      let before: Record<string, unknown[]> = {};
      asReleasedBefore(state, (sql) => {
        // As 1.0.2 left a project: migrations 1 and 2, with a card that arrived and a notification that went.
        sql.exec(OBJECT_MIGRATIONS[0]!.sql);
        sql.exec(OBJECT_MIGRATIONS[1]!.sql);
        sql.exec("INSERT INTO meta (key, value) VALUES ('project', 'proj-102'), ('version', '9'), (?, '2')", SCHEMA_KEY);
        sql.exec("INSERT INTO push_arrivals (card, revision, machine, arrived, settled) VALUES ('B-aaaaa', 1, 'laptop', 1762300000000, NULL), ('B-bbbbb', 2, 'laptop', 1762300001000, 1762300011000)");
        sql.exec("INSERT INTO push_sent (at) VALUES (1762300011000)");
        sql.exec("INSERT INTO built (part, value) VALUES (0, 'kept by 1.0.2')");
        before = rowsOf(sql, tablesOf(sql));
      });
      expect(tablesOf(state.storage.sql)).toEqual(TABLES.filter((t) => !MEMBERS.includes(t)));
      expect(schemaVersion(state.storage.sql)).toBe(2);

      const woke = new ProjectRelay(state, env as unknown as Env);
      expect(tablesOf(state.storage.sql)).toEqual(TABLES);
      expect(schemaVersion(state.storage.sql)).toBe(3);
      const after = withoutNewColumns(rowsOf(state.storage.sql, Object.keys(before)));
      expect({ ...after, meta: after.meta!.filter((r) => r.key !== SCHEMA_KEY) }).toEqual({ ...before, meta: before.meta!.filter((r) => (r as { key: string }).key !== SCHEMA_KEY) });
      // Nobody is noted as sent a card that arrived before, or as told of one: such a card is its owners'.
      for (const t of MEMBERS) expect(state.storage.sql.exec(`SELECT COUNT(*) AS n FROM ${t}`).one().n).toBe(0);
      // Its alarm runs: the arrival whose card isn't waiting is settled, and nothing is sent.
      await woke.alarm();
      expect(state.storage.sql.exec("SELECT COUNT(*) AS n FROM push_arrivals WHERE settled IS NULL").one().n).toBe(0);
      expect((await woke.waiting("proj-102", { account: "acct-gus", role: "owner" })).body).toEqual({ total: 0, hard: 0, blocking: 0, yours: { total: 0, hard: 0, blocking: 0 } });
    });
  });

  it("run in one transaction: a migration that fails keeps nothing of any", () =>
    runInDurableObject(env.PROJECTS.get(env.PROJECTS.newUniqueId()), (_i, state) => {
      const next: ObjectMigration[] = [
        ...OBJECT_MIGRATIONS,
        { version: 4, name: "a column", sql: "ALTER TABLE files ADD COLUMN kind TEXT" },
        { version: 5, name: "a mistake", sql: "CREATE TABLE later (x INTEGER); INSERT INTO nowhere VALUES (1)" },
      ];
      expect(() => migrateObject(state.storage, next)).toThrow();
      expect(schemaVersion(state.storage.sql)).toBe(3);
      expect(tablesOf(state.storage.sql)).toEqual(TABLES);
      expect(state.storage.sql.exec("PRAGMA table_info(files)").toArray().map((c) => c.name)).toEqual(["path", "bytes", "once"]);
      // Fixed, they run in order, once each, and may change a table.
      next[4] = { version: 5, name: "a table", sql: "CREATE TABLE later (x INTEGER)" };
      expect(migrateObject(state.storage, next)).toEqual({ from: 3, to: 5 });
      expect(state.storage.sql.exec("PRAGMA table_info(files)").toArray().map((c) => c.name)).toEqual(["path", "bytes", "once", "kind"]);
      expect(migrateObject(state.storage, next)).toEqual({ from: 5, to: 5 });
    }));

  it("refuse a project a newer release migrated, rather than guess at its tables", () =>
    runInDurableObject(env.PROJECTS.get(env.PROJECTS.newUniqueId()), (_i, state) => {
      state.storage.sql.exec("INSERT OR REPLACE INTO meta (key, value) VALUES (?, '4')", SCHEMA_KEY);
      expect(() => migrateObject(state.storage)).toThrow(NewerSchema);
      expect(() => migrateObject(state.storage)).toThrow("this project's storage is at schema 4, newer than this release's 3");
      expect(() => new ProjectRelay(state, env as unknown as Env)).toThrow(NewerSchema);
    }));

  it("are made again from the first after the project is erased", () =>
    runInDurableObject(env.PROJECTS.get(env.PROJECTS.newUniqueId()), async (instance, state) => {
      await (instance as ProjectRelay).state("proj-erased");
      await (instance as ProjectRelay).erase("proj-erased");
      expect(tablesOf(state.storage.sql)).toEqual([]);
      expect((await (instance as ProjectRelay).state("proj-erased")).status).toBe(200);
      expect(tablesOf(state.storage.sql)).toEqual(TABLES);
      expect(schemaVersion(state.storage.sql)).toBe(3);
    }));
});
