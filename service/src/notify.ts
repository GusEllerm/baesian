import type { Level } from "../../src/schema.js";
import type { Urgency } from "./push.js";

// When the website's notifications go (M9e step 2, card B-advkh), and what they say (B-mjf3g). Each project's relay keeps
// what arrived and what it has sent in its own SQLite (`PushLedger`), and decides at its alarm (`decide()`), so the rules
// are one pure function and the numbers one table (`WHEN`). docs/vault/Modules/service.md describes them.

/** The rules' numbers (B-advkh). */
export interface When {
  /** A blocking or hard card notifies this long after it arrives, so a burst of filings is one notification. */
  soonMs: number;
  /** A provisional card waits at most this long for a digest; null: it never notifies on its own. */
  digestMs: number | null;
  /** At most this many notifications per project in any hour. */
  capPerHour: number;
  /** More than this many new cards from one machine within `burstWindowMs` pauses its cards' notifications... */
  burstCards: number;
  burstWindowMs: number;
  /** ...for this long after its latest card. */
  pauseMs: number;
}

export const WHEN: When = {
  soonMs: 10_000,
  digestMs: 3 * 3600_000,
  capPerHour: 4,
  burstCards: 20,
  burstWindowMs: 10 * 60_000,
  pauseMs: 3600_000,
};

const HOUR = 3600_000;

/** A card revision that arrived from a machine and hasn't been notified or settled yet. */
export interface Arrival {
  card: string;
  revision: number;
  machine: string | null;
  arrived: number;
}

/** A card waiting for the reviewer, as the desk's queue has it (open, or an audit), at its level in force. */
export interface Waiting {
  card: string;
  revision: number;
  level: Level;
}

/** A machine whose cards don't notify: it filed a burst (`since` to its latest card), until `until`. */
export interface Pause {
  machine: string;
  cards: number;
  since: number;
  until: number;
}

/** What to do now: send a notification counting what's waiting, settle arrivals (told, or never to be), and when to look again. */
export interface Decision {
  send?: { urgency: Urgency; reason: "at once" | "digest"; total: number; hard: number; blocking: number };
  settle: Arrival[];
  next?: number;
}

const key = (x: { card: string; revision: number }) => `${x.card}/r${x.revision}`;

/**
 * The rules (B-advkh), as one function of what's known now:
 * - an arrival no longer waiting (answered, withdrawn, revised) is settled;
 * - while the reviewer is present in a client, nothing is sent, and what arrived is settled as seen (D41);
 * - an arrival from a paused machine never notifies on its own;
 * - a blocking or hard arrival is due `soonMs` after it arrived; a provisional one `digestMs` after (never, if null);
 * - with one due and fewer than `capPerHour` sent in the last hour, one notification goes, counting every waiting card by
 *   level, and every arrival still waiting is settled by it; at the cap, the next waits until the hour frees.
 */
export function decide(s: { now: number; arrivals: Arrival[]; waiting: Waiting[]; present: boolean; sent: number[]; pauses: Pause[]; when?: When }): Decision {
  const when = s.when ?? WHEN;
  const levels = new Map(s.waiting.map((w) => [key(w), w.level]));
  const settle = s.arrivals.filter((a) => !levels.has(key(a)));
  const live = s.arrivals.filter((a) => levels.has(key(a)));
  if (s.present) return { settle: [...settle, ...live] };
  const quiet = (a: Arrival) => s.pauses.some((p) => p.machine === a.machine && p.since <= a.arrived && a.arrived <= p.until);
  settle.push(...live.filter(quiet));
  const loud = live.filter((a) => !quiet(a));
  const urgent = (a: Arrival) => levels.get(key(a)) !== "provisional";
  const dueAt = (a: Arrival) => (urgent(a) ? a.arrived + when.soonMs : when.digestMs === null ? undefined : a.arrived + when.digestMs);
  const times = loud.map(dueAt).filter((t): t is number => t !== undefined);
  const due = loud.filter((a) => (dueAt(a) ?? Infinity) <= s.now);
  if (!due.length) return { settle, ...(times.length ? { next: Math.min(...times) } : {}) };
  const recent = s.sent.filter((t) => t > s.now - HOUR);
  if (recent.length >= when.capPerHour) return { settle, next: Math.min(...recent) + HOUR };
  const at = due.some(urgent);
  return { send: { urgency: at ? "high" : "normal", reason: at ? "at once" : "digest", ...countWaiting(s.waiting) }, settle: [...settle, ...loud] };
}

/** How many cards wait, and how many of them are hard or blocking: what a notification says, and the projects page (B-wgbdh). */
export function countWaiting(waiting: readonly Waiting[]): { total: number; hard: number; blocking: number } {
  return { total: waiting.length, hard: waiting.filter((w) => w.level === "hard").length, blocking: waiting.filter((w) => w.level === "blocking").length };
}

/** A notification's words (B-mjf3g): counts and levels only, never a card's text; "2 cards waiting in Shop (1 hard)". */
export function pushText(c: { total: number; hard: number; blocking: number }, name: string | null): { title: string; body: string } {
  const levels = [c.hard ? `${c.hard} hard` : "", c.blocking ? `${c.blocking} blocking` : ""].filter(Boolean);
  const only = c.total === 1 && levels.length === 1 ? ` (${levels[0]!.replace(/^1 /, "")})` : levels.length ? ` (${levels.join(", ")})` : "";
  const where = name ?? "an unnamed project";
  return { title: `${c.total} ${c.total === 1 ? "card" : "cards"} waiting in ${where}${only}`, body: c.total === 1 ? "Tap to open it." : "Tap to open them." };
}

/** A burst from one machine (B-advkh): its new cards in the window, if there are more than allowed. */
export function burst(arrivedNew: number[], now: number, when: When = WHEN): { cards: number; since: number } | undefined {
  const inWindow = arrivedNew.filter((t) => t > now - when.burstWindowMs && t <= now);
  return inWindow.length > when.burstCards ? { cards: inWindow.length, since: Math.min(...inWindow) } : undefined;
}

/**
 * The project's notification state, in its object's SQLite beside its files: card revisions that arrived and whether
 * they've been settled, the times notifications were sent (for the cap), and paused machines. Never logged or signed;
 * nothing here leaves the object but a notification's counts.
 */
export class PushLedger {
  /** Its tables, push_arrivals, push_sent and push_pauses, are made by the object's migrations (`migrateObject()`). */
  constructor(private readonly sql: SqlStorage) {}

  /** A card revision arrived from a machine; a new card from a machine filing a burst pauses it (B-advkh). */
  arrive(card: string, revision: number, machine: string | null, now: number, when: When = WHEN): void {
    this.sql.exec("INSERT OR IGNORE INTO push_arrivals (card, revision, machine, arrived) VALUES (?, ?, ?, ?)", card, revision, machine, now);
    if (!machine || revision !== 1) return;
    const times = this.sql.exec<{ arrived: number }>("SELECT arrived FROM push_arrivals WHERE machine = ? AND revision = 1 AND arrived > ?", machine, now - when.burstWindowMs).toArray().map((r) => r.arrived);
    const b = burst(times, now, when);
    if (!b) return;
    const had = this.pauses(now).find((p) => p.machine === machine);
    this.sql.exec(
      "INSERT INTO push_pauses (machine, cards, since, until) VALUES (?, ?, ?, ?) ON CONFLICT (machine) DO UPDATE SET cards = excluded.cards, since = excluded.since, until = excluded.until",
      machine,
      Math.max(b.cards, had?.cards ?? 0),
      had ? Math.min(had.since, b.since) : b.since,
      now + when.pauseMs,
    );
  }

  /** Arrivals not settled yet. */
  arrivals(): Arrival[] {
    return this.sql.exec<{ card: string; revision: number; machine: string | null; arrived: number }>("SELECT card, revision, machine, arrived FROM push_arrivals WHERE settled IS NULL ORDER BY arrived").toArray();
  }

  /** Settle arrivals: told by a notification, seen while present, or never to notify. Old settled rows are dropped. */
  settle(done: Arrival[], now: number, when: When = WHEN): void {
    for (const a of done) this.sql.exec("UPDATE push_arrivals SET settled = ? WHERE card = ? AND revision = ?", now, a.card, a.revision);
    this.sql.exec("DELETE FROM push_arrivals WHERE settled IS NOT NULL AND arrived < ?", now - Math.max(when.burstWindowMs, HOUR));
  }

  /** When notifications went, in the last hour. */
  sent(now: number): number[] {
    this.sql.exec("DELETE FROM push_sent WHERE at <= ?", now - HOUR);
    return this.sql.exec<{ at: number }>("SELECT at FROM push_sent ORDER BY at").toArray().map((r) => r.at);
  }

  markSent(now: number): void {
    this.sql.exec("INSERT INTO push_sent (at) VALUES (?)", now);
  }

  /** Machines paused now, or whose pause covers an arrival not settled yet. */
  pauses(now: number): Pause[] {
    return this.sql.exec<{ machine: string; cards: number; since: number; until: number }>("SELECT machine, cards, since, until FROM push_pauses ORDER BY since").toArray().filter((p) => p.until > now - HOUR);
  }
}
