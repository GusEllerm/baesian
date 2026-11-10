import type { ApiRemovedCard } from "../../src/api.js";
import type { AnyRow } from "../../src/routing.js";
import { CARD_ID, type GateRecord, type Level } from "../../src/schema.js";

// How long a card's text stays on the relay (M9f), as cards B-9jqt4 ("Keep it 30 days after delivery"), B-ec3kj ("90
// days, then only its metadata") and B-dsqyd ("30 days after delivery, as answered") decided, and D137 ("card text
// deleted once it's answered"); the rule R-1sxpy says the same for every card that's settled, answered or withdrawn. The relay keeps each
// project's log for good, every entry with its path, size, digest, machine and time; what goes is the files' bytes, so
// an entry is sent without its body (P16 section 8). Each project's object checks once a day, at its alarm, and keeps
// what it needs for that in tables of its own (`RetentionLedger`). docs/vault/Modules/service.md describes it.

const DAY = 86_400_000;

/** The periods (B-9jqt4, B-ec3kj, B-dsqyd), and how often the relay looks. */
export interface Retention {
  /** An answered card's text goes this long after it was delivered: every machine of the project has its last entry. */
  answeredMs: number;
  /** A card held back and never answered loses its text this long after its latest revision arrived. */
  heldMs: number;
  /** A withdrawn card's text goes this long after it was delivered, as an answered card's (B-dsqyd); null would keep it. */
  withdrawnMs: number | null;
  /** How often each project's object looks. */
  everyMs: number;
}

export const RETENTION: Retention = {
  answeredMs: 30 * DAY,
  heldMs: 90 * DAY,
  withdrawnMs: 30 * DAY,
  everyMs: DAY,
};

export type Ended = ApiRemovedCard["ended"];

const ID = CARD_ID.source.replace(/^\^|\$$/g, "");
/**
 * The live layer's paths that belong to one card: its folder, its answers (and their proofs), its attachments, its
 * waiting markers, and the ledger's entries for the commits that cite it (D181), which go with its text.
 */
const CARD_PATHS = [new RegExp(`^cards/(${ID})/`), new RegExp(`^verdicts/\\d{8}T\\d{6}\\.\\d{3}Z-(${ID})-r\\d+-`), new RegExp(`^attachments/(${ID})-`), new RegExp(`^waiting/(${ID})-`), new RegExp(`^ledger/(${ID})-`)];

/** A ledger entry (D181): its card's, removed with its text, but a commit citing it later doesn't put that off. */
export const isLedgerPath = (path: string) => path.startsWith("ledger/");

/** The card a path in the live layer belongs to, if it belongs to one. Rules, topic merges, preferences, decks, trust files and merges don't. */
export function cardOfPath(path: string): string | undefined {
  for (const re of CARD_PATHS) {
    const m = re.exec(path);
    if (m) return m[1];
  }
  return undefined;
}

/**
 * Whether a card's text goes now: an answered card once it's delivered and `answeredMs` has passed since; a withdrawn
 * one likewise, `withdrawnMs` after (B-dsqyd); a held one `heldMs` after its latest revision arrived, delivered or not.
 * Anything else, a card in the queue, returned, passed on or deferred, keeps its text (B-ec3kj).
 */
export function due(c: { ended: Ended | undefined; delivered: boolean; deliveredAt: number | undefined; arrived: number }, now: number, r: Retention = RETENTION): boolean {
  if (c.ended === "held") return now - c.arrived >= r.heldMs;
  const wait = c.ended === "answered" ? r.answeredMs : c.ended === "withdrawn" ? r.withdrawnMs : null;
  return wait !== null && c.delivered && c.deliveredAt !== undefined && now - c.deliveredAt >= wait;
}

/**
 * Whether a card is delivered (B-9jqt4): every machine signed in to the project now has been sent the log past its last
 * entry, and at least one machine has. A machine signed out, or whose grant lapsed after 30 days unused, no longer holds it
 * back; an answer no machine was ever sent keeps its card's text.
 */
export function delivered(last: number, live: Iterable<string>, sent: ReadonlyMap<string, number>): boolean {
  for (const m of live) if ((sent.get(m) ?? 0) < last) return false;
  for (const s of sent.values()) if (s >= last) return true;
  return false;
}

/** What the relay keeps of a card whose text it removed: its ID, latest revision, level, times and size. */
export interface RemovedRow extends ApiRemovedCard {
  size: number;
}

/**
 * Retention's own tables in a project's object, never logged, signed or sent:
 * - `retention_sent`: per machine (its grant), the furthest it has been sent the log, so delivery can be known;
 * - `retention_delivered`: per card, when the relay first found it delivered, at which last entry;
 * - `retention_removed`: per card whose text went, what stays of it (`RemovedRow`);
 * - `retention_held`: per writer and row, how many held cards' gate records went, which the burn-in still counts;
 * - `retention_commits`: the commits whose ledger entries the relay held and removed, with their cards' text (B-15v62), so
 *   a merge listing a commit goes only once its entries were here and went, never because they never came.
 */
export class RetentionLedger {
  /** Its tables are made by the object's migrations (`migrateObject()`). */
  constructor(private readonly sql: SqlStorage) {}

  /** A machine was sent the log up to `seq`: it never goes back. */
  sent(machine: string, seq: number, at: string): void {
    this.sql.exec("INSERT INTO retention_sent (machine, seq, at) VALUES (?, ?, ?) ON CONFLICT (machine) DO UPDATE SET seq = MAX(seq, excluded.seq), at = excluded.at", machine, seq, at);
  }

  /** How far each machine has been sent the log. */
  sentTo(): Map<string, number> {
    return new Map(this.sql.exec<{ machine: string; seq: number }>("SELECT machine, seq FROM retention_sent").toArray().map((r) => [r.machine, r.seq]));
  }

  /** When a card was first found delivered at its last entry `seq`; a newer last entry (a changed answer) starts again. */
  deliveredAt(card: string, seq: number): number | undefined {
    const row = this.sql.exec<{ seq: number; at: number }>("SELECT seq, at FROM retention_delivered WHERE card = ?", card).toArray()[0];
    return row && row.seq === seq ? row.at : undefined;
  }

  setDelivered(card: string, seq: number, at: number): void {
    this.sql.exec("INSERT OR REPLACE INTO retention_delivered (card, seq, at) VALUES (?, ?, ?)", card, seq, at);
  }

  forgetDelivered(card: string): void {
    this.sql.exec("DELETE FROM retention_delivered WHERE card = ?", card);
  }

  /** Note a card whose text went. */
  removed(row: RemovedRow): void {
    this.sql.exec(
      "INSERT OR REPLACE INTO retention_removed (card, revision, level, ended, filed, settled, removed, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      row.id,
      row.revision,
      row.level,
      row.ended,
      row.filed,
      row.settled,
      row.removed,
      row.size,
    );
    this.forgetDelivered(row.id);
  }

  /** The cards whose text went, newest first, as the state lists them. */
  removedCards(): ApiRemovedCard[] {
    return this.sql
      .exec<{ card: string; revision: number; level: Level; ended: Ended; filed: string; settled: string; removed: string }>("SELECT card, revision, level, ended, filed, settled, removed FROM retention_removed ORDER BY settled DESC")
      .toArray()
      .map((r) => ({ id: r.card, revision: r.revision, level: r.level, ended: r.ended, filed: r.filed, settled: r.settled, removed: r.removed }));
  }

  /** Note the commits whose ledger entries went with a card's text (B-15v62). */
  commitsGone(commits: Iterable<string>): void {
    for (const c of commits) this.sql.exec("INSERT OR IGNORE INTO retention_commits (commit_id) VALUES (?)", c);
  }

  /** The commits whose ledger entries the relay held and removed, with their cards' text (B-15v62). */
  goneCommits(): Set<string> {
    return new Set(this.sql.exec<{ commit_id: string }>("SELECT commit_id FROM retention_commits").toArray().map((r) => r.commit_id));
  }

  /** Whether a card's text went. */
  isRemoved(card: string): ApiRemovedCard | undefined {
    const r = this.sql.exec<{ card: string; revision: number; level: Level; ended: Ended; filed: string; settled: string; removed: string }>("SELECT * FROM retention_removed WHERE card = ?", card).toArray()[0];
    return r && { id: r.card, revision: r.revision, level: r.level, ended: r.ended, filed: r.filed, settled: r.settled, removed: r.removed };
  }

  /** A held card's gate record went: the burn-in keeps counting it. */
  heldGone(by: GateRecord["by"], row: AnyRow): void {
    this.sql.exec("INSERT INTO retention_held (by, row, n) VALUES (?, ?, 1) ON CONFLICT (by, row) DO UPDATE SET n = n + 1", by, row);
  }

  /** How many held cards' gate records went, for a writer and row (`StorageOptions.heldEarlier`). */
  heldEarlier(row: AnyRow, by: GateRecord["by"]): number {
    return this.sql.exec<{ n: number }>("SELECT n FROM retention_held WHERE by = ? AND row = ?", by, row).toArray()[0]?.n ?? 0;
  }
}
