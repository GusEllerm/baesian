import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { parseDoc } from "../../src/frontmatter.js";
import { type RelayEntry, readRelayEntry } from "../../src/schema.js";
import { FileExists, type Storage, checkPath } from "../../src/storage.js";
import { cardOfPath } from "./retention.js";

// The live layer in a Durable Object's SQLite (B-0ag7h, D140): one row per path, and beside it the relay's append-only
// log of entries (P16 section 8), written in the same transaction. The store runs over it as over a folder.
// docs/vault/Modules/service.md describes it.

/** What signs a file as it's written: the service's signature for the kinds it signs, undefined for the rest. */
export type Sign = (path: string, bytes: Uint8Array) => string | undefined;

const SCHEMA = `
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
`;

/** One card's entries in the log, for retention (`SqlFileStorage.cardsInLog`). */
export interface CardInLog {
  /** Its last entry's sequence number, and when it arrived. */
  last: number;
  lastAt: string;
  /** When its first revision arrived, and its latest. */
  firstAt: string | undefined;
  revisionAt: string | undefined;
  revision: number;
  /** Its files' bytes, in all. */
  size: number;
  /** Every path of it that's logged. */
  paths: string[];
}

/** The folders of what a person writes: an answer, a rule, a topic merge, a preference file (Hosted Service section 3). */
const ANSWERS = ["verdicts", "rules", "topics", "preferences"];

/** Mutable files whose changes the client never needs to hear of: the reviewer's own heartbeat, as `baesian serve` ignores it. */
const QUIET = new Set(["presence.json"]);

/** A path's signature beside it. A signature rides in its file's entry, never in one of its own. */
const SIG = ".sig";

/** Bytes for a BLOB binding: exactly these, in a buffer of their own. */
const blob = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer as ArrayBuffer;

/** A file's own format number (D156): its JSON's, or its frontmatter's; 1 when it names none, as a file from before v1. */
function formatOf(path: string, bytes: Uint8Array): number {
  try {
    const text = new TextDecoder().decode(bytes);
    const fields: unknown = path.endsWith(".md") ? parseDoc(text).meta : JSON.parse(text);
    const format = (fields as { format?: unknown }).format;
    return typeof format === "number" && Number.isInteger(format) && format >= 1 ? format : 1;
  } catch {
    return 1;
  }
}

interface EntryRow extends Record<string, SqlStorageValue> {
  seq: number;
  path: string;
  format: number;
  size: number;
  digest: string;
  machine: string | null;
  at: string;
  body: ArrayBuffer | null;
  sig: ArrayBuffer | null;
  before_linking: number;
}

/**
 * `Storage` over a Durable Object's SQLite (B-0ag7h). `SqlFileStorage.create` is an INSERT, so a taken path throws
 * `FileExists`; `SqlFileStorage.replace` is an INSERT OR REPLACE; `SqlFileStorage.list` is a range query. Each file
 * written once gets the project's next sequence number in the log, in the same transaction, with its signature when the
 * service signs its kind. Every write but the reviewer's heartbeat moves the project's version, which live updates
 * announce (B-bv49e).
 */
export class SqlFileStorage implements Storage {
  private readonly sql: SqlStorage;
  /** The machine an upload came from, while it's written: its entry names it (D162). */
  private machine: string | undefined;
  /** While an answer from before linking is written (B-3zjjx): unsigned, and kept apart. */
  private early = false;
  /** What was written once since `SqlFileStorage.mark`, in order. */
  private written: string[] = [];

  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly opts: { sign?: Sign; now?: () => string } = {},
  ) {
    this.sql = storage.sql;
    this.sql.exec(SCHEMA);
  }

  read(path: string): Uint8Array | undefined {
    const row = this.sql.exec<{ bytes: ArrayBuffer }>("SELECT bytes FROM files WHERE path = ?", checkPath(path)).toArray()[0];
    return row ? new Uint8Array(row.bytes) : undefined;
  }

  list(dir: string): string[] {
    const prefix = checkPath(dir, true) === "" ? "" : `${dir}/`;
    // Everything under `dir/`: from "dir/" up to "dir0", since "0" sorts just after "/".
    const rows = prefix
      ? this.sql.exec<{ path: string }>("SELECT path FROM files WHERE path >= ? AND path < ?", prefix, `${dir}0`).toArray()
      : this.sql.exec<{ path: string }>("SELECT path FROM files").toArray();
    return [...new Set(rows.map((r) => r.path.slice(prefix.length).split("/")[0]!))];
  }

  create(path: string, bytes: Uint8Array): void {
    checkPath(path);
    if (path.endsWith(SIG)) throw new Error(`${path}: a signature is the relay's own, written with its file`);
    this.storage.transactionSync(() => {
      try {
        this.sql.exec("INSERT INTO files (path, bytes, once) VALUES (?, ?, 1)", path, blob(bytes));
      } catch (e) {
        if (/UNIQUE constraint failed/.test(e instanceof Error ? e.message : String(e))) throw new FileExists(path);
        throw e;
      }
      const sig = this.early ? undefined : this.opts.sign?.(path, bytes);
      if (this.early) this.sql.exec("INSERT INTO before_linking (path) VALUES (?)", path);
      if (sig !== undefined) this.sql.exec("INSERT INTO files (path, bytes, once) VALUES (?, ?, 1)", `${path}${SIG}`, blob(new TextEncoder().encode(sig)));
      this.sql.exec(
        "INSERT INTO log (path, format, size, digest, machine, at) VALUES (?, ?, ?, ?, ?, ?)",
        path,
        formatOf(path, bytes),
        bytes.byteLength,
        createHash("sha256").update(bytes).digest("hex"),
        this.machine ?? null,
        this.opts.now?.() ?? new Date().toISOString(),
      );
      this.written.push(path);
      this.bump();
    });
  }

  // `replace` and `remove` do what they say to any path, as a folder and memory do: the store uses them only for its
  // mutable files (presence, waiting markers, cursors), and a machine's uploads reach them only for waiting markers.

  replace(path: string, bytes: Uint8Array): void {
    checkPath(path);
    this.storage.transactionSync(() => {
      this.sql.exec("INSERT OR REPLACE INTO files (path, bytes, once) VALUES (?, ?, 0)", path, blob(bytes));
      if (!QUIET.has(path)) this.bump();
    });
  }

  remove(path: string): void {
    checkPath(path);
    this.storage.transactionSync(() => {
      if (!this.sql.exec("DELETE FROM files WHERE path = ?", path).rowsWritten) return;
      if (!QUIET.has(path)) this.bump();
    });
  }

  // ---------------------------------------------------------------- the relay's own

  /** Run `fn` as one transaction: if it throws, nothing it wrote is kept, its log entries included. */
  transaction<T>(fn: () => T): T {
    return this.storage.transactionSync(fn);
  }

  /** Write as `machine`: the entries `fn` adds name it (D162). */
  asMachine<T>(machine: string, fn: () => T): T {
    const outer = this.machine;
    this.machine = machine;
    try {
      return fn();
    } finally {
      this.machine = outer;
    }
  }

  /**
   * Write what a person wrote before the repo was linked, as a machine uploaded it at first link (B-3zjjx): never signed,
   * and kept apart, in `before_linking`, so its entry says so and the relay's store counts it as B-45xz8 does.
   */
  asBeforeLinking<T>(fn: () => T): T {
    const outer = this.early;
    this.early = true;
    try {
      return fn();
    } finally {
      this.early = outer;
    }
  }

  /** The files written as from before linking (B-3zjjx). */
  beforeLinking(): Set<string> {
    return new Set(this.sql.exec<{ path: string }>("SELECT path FROM before_linking").toArray().map((r) => r.path));
  }

  /**
   * Whether a person has answered here on the website: anything in their folders that the relay signed. Until then, a
   * machine may upload the answers from before linking (B-3zjjx); after it, never.
   */
  answered(): boolean {
    const ranges = ANSWERS.map(() => "(path >= ? AND path < ?)").join(" OR ");
    const args = ANSWERS.flatMap((d) => [`${d}/`, `${d}0`]);
    return this.sql.exec(`SELECT 1 AS x FROM files WHERE path LIKE '%${SIG}' AND (${ranges}) LIMIT 1`, ...args).toArray().length > 0;
  }

  /** Start noting what's written once; `SqlFileStorage.writtenSince` gives it back. */
  mark(): number {
    return this.written.length;
  }

  writtenSince(mark: number): string[] {
    return this.written.slice(mark);
  }

  /** The project's version: it moves with every write but the reviewer's heartbeat, and never goes back. */
  version(): number {
    const row = this.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'version'").toArray()[0];
    return row ? Number(row.value) : 1;
  }

  private bump(): void {
    this.sql.exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('version', ?)", String(this.version() + 1));
  }

  /** A value the relay keeps for itself, apart from the live layer. */
  meta(key: string): string | undefined {
    return this.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = ?", key).toArray()[0]?.value;
  }

  setMeta(key: string, value: string): void {
    this.sql.exec("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", key, value);
  }

  /** An answer composed and waiting for the reviewer's passkey (D139, D163): kept apart from the live layer, briefly. */
  putPending(id: string, value: string, expires: string): void {
    this.sql.exec("DELETE FROM pending WHERE expires < ?", new Date().toISOString());
    this.sql.exec("INSERT OR REPLACE INTO pending (id, value, expires) VALUES (?, ?, ?)", id, value, expires);
  }

  pending(id: string): string | undefined {
    return this.sql.exec<{ value: string }>("SELECT value FROM pending WHERE id = ? AND expires > ?", id, new Date().toISOString()).toArray()[0]?.value;
  }

  dropPending(id: string): void {
    this.sql.exec("DELETE FROM pending WHERE id = ?", id);
  }

  /** The last sequence number given, or 0. */
  head(): number {
    return this.sql.exec<{ seq: number | null }>("SELECT MAX(seq) AS seq FROM log").one().seq ?? 0;
  }

  /** A file's entry, by its path, if it was written once. */
  entryOf(path: string): RelayEntry | undefined {
    return this.entries(`WHERE l.path = ?`, [path], 1)[0];
  }

  /** The log's entries after `after`, oldest first, at most `limit` (P16 section 8). */
  after(after: number, limit: number): RelayEntry[] {
    return this.entries("WHERE l.seq > ?", [after], limit);
  }

  private entries(where: string, args: SqlStorageValue[], limit: number): RelayEntry[] {
    const rows = this.sql
      .exec<EntryRow>(
        `SELECT l.seq, l.path, l.format, l.size, l.digest, l.machine, l.at, f.bytes AS body, s.bytes AS sig, b.path IS NOT NULL AS before_linking
         FROM log l LEFT JOIN files f ON f.path = l.path LEFT JOIN files s ON s.path = l.path || '${SIG}' LEFT JOIN before_linking b ON b.path = l.path
         ${where} ORDER BY l.seq LIMIT ?`,
        ...args,
        limit,
      )
      .toArray();
    return rows.map((r) =>
      readRelayEntry({
        seq: r.seq,
        path: r.path,
        format: r.format,
        size: r.size,
        digest: r.digest,
        ...(r.body ? { body: Buffer.from(r.body).toString("base64") } : {}),
        ...(r.sig ? { sig: Buffer.from(r.sig).toString("base64") } : {}),
        ...(r.machine ? { machine: r.machine } : {}),
        ...(r.before_linking ? { before_linking: true } : {}),
        at: r.at,
      }),
    );
  }

  // ---------------------------------------------------------------- retention (M9f, B-9jqt4, B-ec3kj)

  /**
   * The log, by the card each entry belongs to (`cardOfPath()`): its last entry's sequence number and time, when its
   * first and latest revisions arrived, its files' bytes in all, and the paths logged. What retention decides from.
   */
  cardsInLog(): Map<string, CardInLog> {
    const out = new Map<string, CardInLog>();
    for (const r of this.sql.exec<{ seq: number; path: string; size: number; at: string }>("SELECT seq, path, size, at FROM log ORDER BY seq").toArray()) {
      const card = cardOfPath(r.path);
      if (!card) continue;
      const c = out.get(card) ?? { last: 0, lastAt: r.at, firstAt: undefined, revisionAt: undefined, revision: 0, size: 0, paths: [] };
      c.last = r.seq;
      c.lastAt = r.at;
      c.size += r.size;
      c.paths.push(r.path);
      const rev = /^cards\/[^/]+\/r(\d+)\.md$/.exec(r.path);
      if (rev) {
        if (Number(rev[1]) === 1) c.firstAt = r.at;
        if (Number(rev[1]) >= c.revision) {
          c.revision = Number(rev[1]);
          c.revisionAt = r.at;
        }
      }
      out.set(card, c);
    }
    return out;
  }

  /**
   * Remove a card's files' bytes (D137): every path given, with its signature, and the card's waiting markers. Their log
   * entries stay, so the log sends each without its body, and an upload of the same path is still known. One move of the
   * version, never logged.
   */
  dropCard(card: string, paths: readonly string[]): void {
    this.storage.transactionSync(() => {
      for (const path of paths) this.sql.exec("DELETE FROM files WHERE path = ? OR path = ?", path, `${path}${SIG}`);
      this.sql.exec("DELETE FROM files WHERE path >= ? AND path < ?", `waiting/${card}-`, `waiting/${card}.`);
      this.bump();
    });
  }

  /** Every file, mutable ones too, with its bytes: for tests, and for building a store elsewhere over the same files. */
  files(): { path: string; bytes: Uint8Array }[] {
    return this.sql
      .exec<{ path: string; bytes: ArrayBuffer }>("SELECT path, bytes FROM files ORDER BY path")
      .toArray()
      .map((r) => ({ path: r.path, bytes: new Uint8Array(r.bytes) }));
  }
}
