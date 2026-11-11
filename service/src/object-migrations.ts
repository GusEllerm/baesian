// How a project's own storage changes from release to release (B-866d2, "Numbered migrations, on wake"; Release v1
// step 3): each project's Durable Object records its schema version in its meta table, and when it wakes runs the
// numbered migrations it hasn't had, in order, in one transaction, so a migration that fails leaves the project as it
// was. A migration may add, change or drop tables and columns. The accounts database is apart: its migrations are in
// service/migrations/, applied by the deploy. docs/vault/Modules/service.md describes both.

/** One numbered change to a project's tables. Written once and never edited: a later change is a new migration. */
export interface ObjectMigration {
  /** Its number: 1, 2, 3…, in order, with no gaps. */
  version: number;
  /** What it does, for a person reading the list. */
  name: string;
  /** Its statements, run in order, inside the transaction. */
  sql: string;
}

/**
 * Every migration, oldest first (B-866d2). Migration 1 is every table the relay had before migrations, each made if it
 * isn't there: releases 0.1.0 to 0.1.10 made them as each object started, with `CREATE TABLE IF NOT EXISTS` and nothing
 * else, and never changed one after the first deploy (v0.1.0) but by adding `retention_commits`; the practice table is
 * new with it (B-rehdw). So a project made by any of those releases, whatever tables it has, ends it with all of them,
 * every row kept; a new project gets them all at once.
 */
export const OBJECT_MIGRATIONS: readonly ObjectMigration[] = [
  {
    version: 1,
    name: "the relay's tables before migrations: files, log, meta, pending, before_linking; retention's five; notifications' three; practice",
    sql: `
CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, bytes BLOB NOT NULL, once INTEGER NOT NULL);
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
CREATE TABLE IF NOT EXISTS before_linking (path TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS retention_sent (machine TEXT PRIMARY KEY, seq INTEGER NOT NULL, at TEXT NOT NULL);
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
CREATE TABLE IF NOT EXISTS retention_commits (commit_id TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS push_arrivals (card TEXT NOT NULL, revision INTEGER NOT NULL, machine TEXT, arrived INTEGER NOT NULL, settled INTEGER, PRIMARY KEY (card, revision));
CREATE TABLE IF NOT EXISTS push_sent (at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS push_pauses (machine TEXT PRIMARY KEY, cards INTEGER NOT NULL, since INTEGER NOT NULL, until INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS practice (seq INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, entry TEXT NOT NULL);
`,
  },
  {
    version: 2,
    name: "the state as last built, kept until the project changes (B-evrec)",
    sql: "CREATE TABLE built (part INTEGER PRIMARY KEY, value TEXT NOT NULL)",
  },
];

/** The schema version this release's code needs: the last migration's. */
export const SCHEMA_VERSION = OBJECT_MIGRATIONS.length;

/** The meta table's key for the schema version (the key `version` is the project's own, which moves with every write). */
export const SCHEMA_KEY = "schema";

/**
 * A project whose tables a newer release migrated: this code may not know their shape, so it serves nothing rather than
 * guess. It happens only when the service runs an older release than one that already ran, as after a rollback.
 */
export class NewerSchema extends Error {}

/** A project's schema version: 0 for one made before migrations, or empty, with no `schema` in its meta table. */
export function schemaVersion(sql: SqlStorage): number {
  const meta = [...sql.exec<{ name: string }>("PRAGMA table_list")].some((t) => t.name === "meta");
  if (!meta) return 0;
  const row = sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = ?", SCHEMA_KEY).toArray()[0];
  return row ? Number(row.value) : 0;
}

/**
 * Bring a project's tables up to this release's schema (B-866d2), when its object wakes: the migrations after its
 * version, in order, then the version, all in one transaction, so if one throws, nothing is kept and the object stays
 * as it was. A project at this version is left alone; one at a newer version throws `NewerSchema`. Returns the versions
 * it went from and to.
 */
export function migrateObject(storage: DurableObjectStorage, migrations: readonly ObjectMigration[] = OBJECT_MIGRATIONS): { from: number; to: number } {
  const sql = storage.sql;
  return storage.transactionSync(() => {
    const from = schemaVersion(sql);
    const to = migrations.length;
    if (from > to) throw new NewerSchema(`this project's storage is at schema ${from}, newer than this release's ${to}: a newer release of the service migrated it, so this one serves nothing from it; deploy that release or a later one`);
    for (const m of migrations.slice(from)) sql.exec(m.sql);
    if (to > from) sql.exec("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", SCHEMA_KEY, String(to));
    return { from, to };
  });
}
