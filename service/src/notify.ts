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
  /**
   * A blocking or hard card still waiting this long after it arrived is notified to the members it wasn't sent to
   * (B-tzdjn); null: they're never told of it on its own. A provisional card never notifies them on its own.
   */
  othersMs: number | null;
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
  // How long before the others are told is card B-aaj69's to say, and it isn't answered: until it is, they're told of
  // another member's card only when it's passed on to them.
  othersMs: null,
  capPerHour: 4,
  burstCards: 20,
  burstWindowMs: 10 * 60_000,
  pauseMs: 3600_000,
};

const HOUR = 3600_000;

/**
 * A card revision that arrived from a machine and hasn't been notified or settled yet. `handed` is when whoever it was
 * sent to passed it on ("it's outside my expertise"), which tells the others now (B-tzdjn).
 */
export interface Arrival {
  card: string;
  revision: number;
  machine: string | null;
  arrived: number;
  handed?: number;
}

/** A member of a project, as the rules need them: their account, and whether they're one of its owners. */
export interface Member {
  account: string;
  role: "owner" | "member";
}

/**
 * A card waiting for a reviewer, as the desk's queue has it (open, or an audit), at its level in force. With several
 * members (P20): `to` is the account it was sent to (B-tzdjn), absent when that's nobody in particular, the project's
 * owners; `passed` is the accounts that passed it on ("it's outside my expertise"), for whom it no longer waits, while
 * it still does for everyone else, whoever it was sent to.
 */
export interface Waiting {
  card: string;
  revision: number;
  level: Level;
  to?: string;
  passed?: string[];
}

/** Whether a waiting card waits for a member: any card does (B-r51ts), but one they passed on. */
export const waitsFor = (w: Waiting, account: string): boolean => !w.passed?.includes(account);

/** Whether a waiting card was sent to a member (B-tzdjn): to their account, or to nobody in particular when they're an owner. */
export const sentTo = (w: Waiting, who: Member): boolean => waitsFor(w, who.account) && (w.to === who.account || (w.to === undefined && who.role === "owner"));

/** The cards nobody has passed on: what waits when it isn't asked for a member, as before there were several. */
export const waitingForAll = (waiting: readonly Waiting[]): Waiting[] => waiting.filter((w) => !w.passed?.length);

/**
 * What a member's inbox says (B-wgbdh, B-tzdjn): how many cards wait for them, by level, and how many of those were sent
 * to them (`yours`). For nobody in particular (a machine asking), the cards nobody has passed on, and no `yours`.
 */
export function countFor(waiting: readonly Waiting[], who?: Member): { total: number; hard: number; blocking: number; yours?: { total: number; hard: number; blocking: number } } {
  if (!who) return countWaiting(waitingForAll(waiting));
  const theirs = waiting.filter((w) => waitsFor(w, who.account));
  return { ...countWaiting(theirs), yours: countWaiting(theirs.filter((w) => sentTo(w, who))) };
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
 * The rules (B-advkh), as one function of what's known now, for one person: `who`, a member of the project (P20), or with
 * none, the one reviewer there was before there were members, to whom everything was sent.
 * - an arrival no longer waiting for them (answered, withdrawn, revised, or passed on by them) is settled;
 * - while they're present in a client, nothing is sent, and what arrived is settled as seen (D41);
 * - an arrival from a paused machine never notifies on its own;
 * - a card sent to them (B-tzdjn): a blocking or hard arrival is due `soonMs` after it arrived; a provisional one
 *   `digestMs` after (never, if null);
 * - a card sent to someone else: a blocking or hard arrival is due `othersMs` after it arrived (never, if null), and a
 *   provisional one never is on its own;
 * - a card whoever it was sent to passed on is due `soonMs` after they did, whatever its level and whatever its machine;
 * - with one due and fewer than `capPerHour` sent to them in the last hour, one notification goes, counting every card
 *   waiting for them by level, and every arrival still waiting is settled by it; at the cap, the next waits until the hour
 *   frees.
 */
export function decide(s: { now: number; arrivals: Arrival[]; waiting: Waiting[]; present: boolean; sent: number[]; pauses: Pause[]; when?: When; who?: Member }): Decision {
  const when = s.when ?? WHEN;
  const who = s.who;
  const theirs = who ? s.waiting.filter((w) => waitsFor(w, who.account)) : s.waiting;
  const waits = new Map(theirs.map((w) => [key(w), w]));
  const settle = s.arrivals.filter((a) => !waits.has(key(a)));
  const live = s.arrivals.filter((a) => waits.has(key(a)));
  if (s.present) return { settle: [...settle, ...live] };
  const handed = (a: Arrival) => a.handed !== undefined;
  const quiet = (a: Arrival) => !handed(a) && s.pauses.some((p) => p.machine === a.machine && p.since <= a.arrived && a.arrived <= p.until);
  settle.push(...live.filter(quiet));
  const loud = live.filter((a) => !quiet(a));
  const urgent = (a: Arrival) => waits.get(key(a))!.level !== "provisional";
  const mine = (a: Arrival) => !who || sentTo(waits.get(key(a))!, who);
  const dueAt = (a: Arrival): number | undefined => {
    if (handed(a)) return a.handed! + when.soonMs;
    if (mine(a)) return urgent(a) ? a.arrived + when.soonMs : when.digestMs === null ? undefined : a.arrived + when.digestMs;
    return urgent(a) && when.othersMs !== null ? a.arrived + when.othersMs : undefined;
  };
  const times = loud.map(dueAt).filter((t): t is number => t !== undefined);
  const due = loud.filter((a) => (dueAt(a) ?? Infinity) <= s.now);
  if (!due.length) return { settle, ...(times.length ? { next: Math.min(...times) } : {}) };
  const recent = s.sent.filter((t) => t > s.now - HOUR);
  if (recent.length >= when.capPerHour) return { settle, next: Math.min(...recent) + HOUR };
  const at = due.some((a) => urgent(a) || handed(a));
  return { send: { urgency: at ? "high" : "normal", reason: at ? "at once" : "digest", ...countWaiting(theirs) }, settle: [...settle, ...loud] };
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
 * they've been settled, for the project and for each member (P20); the times notifications were sent, and to whom (for
 * the cap); and paused machines. Never logged or signed; nothing here leaves the object but a notification's counts.
 */
export class PushLedger {
  /** Its tables, push_arrivals, push_told, push_sent and push_pauses, are made by the object's migrations (`migrateObject()`). */
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

  /**
   * Arrivals not settled yet: for the project, or with an account, for that member too (they haven't been told of it,
   * seen it while present, or had it settled as never to notify them).
   */
  arrivals(account?: string): Arrival[] {
    const rows = this.sql
      .exec<{ card: string; revision: number; machine: string | null; arrived: number; handed: number | null }>(
        `SELECT card, revision, machine, arrived, handed FROM push_arrivals a WHERE settled IS NULL ${account === undefined ? "" : "AND NOT EXISTS (SELECT 1 FROM push_told t WHERE t.card = a.card AND t.revision = a.revision AND t.account = ?) "}ORDER BY arrived`,
        ...(account === undefined ? [] : [account]),
      )
      .toArray();
    return rows.map(({ handed, ...a }) => (handed === null ? a : { ...a, handed }));
  }

  /**
   * Settle arrivals for the project: told by a notification, seen while present, never to notify, or, with members, no
   * longer waiting for anyone. Old settled rows are dropped, and what each member was told of them with them.
   */
  settle(done: Arrival[], now: number, when: When = WHEN): void {
    for (const a of done) this.sql.exec("UPDATE push_arrivals SET settled = ? WHERE card = ? AND revision = ?", now, a.card, a.revision);
    this.sql.exec("DELETE FROM push_arrivals WHERE settled IS NOT NULL AND arrived < ?", now - Math.max(when.burstWindowMs, HOUR));
    this.sql.exec("DELETE FROM push_told WHERE NOT EXISTS (SELECT 1 FROM push_arrivals a WHERE a.card = push_told.card AND a.revision = push_told.revision)");
  }

  /** Settle arrivals for one member (P20): told by a notification to them, seen while they were present, or never to notify them. */
  told(done: Arrival[], account: string, now: number): void {
    for (const a of done) this.sql.exec("INSERT OR IGNORE INTO push_told (card, revision, account, at) VALUES (?, ?, ?, ?)", a.card, a.revision, account, now);
  }

  /**
   * Whoever a card was sent to passed it on (B-tzdjn): it's an arrival again, for everyone but them, due at once. If its
   * first arrival is gone (settled long ago), it's noted afresh, from no machine, so it counts toward no burst.
   */
  handOn(card: string, revision: number, by: string, now: number): void {
    this.sql.exec(
      "INSERT INTO push_arrivals (card, revision, machine, arrived, handed) VALUES (?, ?, NULL, ?, ?) ON CONFLICT (card, revision) DO UPDATE SET handed = excluded.handed, settled = NULL",
      card,
      revision,
      now,
      now,
    );
    this.sql.exec("DELETE FROM push_told WHERE card = ? AND revision = ? AND account != ?", card, revision, by);
  }

  /** A member left the project: what they were told goes with them. */
  forget(account: string): void {
    this.sql.exec("DELETE FROM push_told WHERE account = ?", account);
    this.sql.exec("DELETE FROM push_sent WHERE account = ?", account);
  }

  /**
   * When notifications went, in the last hour: the project's, or with an account, those to that member (and those sent
   * before notifications named anyone, which were the one reviewer's).
   */
  sent(now: number, account?: string): number[] {
    this.sql.exec("DELETE FROM push_sent WHERE at <= ?", now - HOUR);
    const rows = account === undefined ? this.sql.exec<{ at: number }>("SELECT at FROM push_sent ORDER BY at") : this.sql.exec<{ at: number }>("SELECT at FROM push_sent WHERE account = ? OR account IS NULL ORDER BY at", account);
    return rows.toArray().map((r) => r.at);
  }

  markSent(now: number, account?: string): void {
    this.sql.exec("INSERT INTO push_sent (at, account) VALUES (?, ?)", now, account ?? null);
  }

  /** Machines paused now, or whose pause covers an arrival not settled yet. */
  pauses(now: number): Pause[] {
    return this.sql.exec<{ machine: string; cards: number; since: number; until: number }>("SELECT machine, cards, since, until FROM push_pauses ORDER BY since").toArray().filter((p) => p.until > now - HOUR);
  }
}
