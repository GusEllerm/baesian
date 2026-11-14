// Whom each card was sent to, and which members are there (P20, B-2n7s4, B-tzdjn): the relay's own notes, in its
// object's SQLite beside its notification state, never in the files or the log. Nothing about who may answer rests on
// them (any member answers any card, B-r51ts), so nothing here is signed, and CI has nothing to check. They say who is
// told of a card first, and whose queue it leads. docs/vault/Modules/service.md describes them.

/** How long a member's heartbeat counts: three missed beats and they're away, as the project's own presence (D41). */
export const MEMBER_PRESENT_MS = 90_000;

/** Whom a card's revision was sent to: an account, or nobody in particular (the project's owners), and when it arrived. */
export interface Sent {
  revision: number;
  account: string | undefined;
  at: number;
}

/**
 * The table `sent_to` (the object's migration 3): one row per card revision that a machine uploaded, naming the account
 * whose machine it was. A card only owners answer (a rule's draft, a proposed move of the gate) is sent to nobody in
 * particular. A row goes when its card's text does.
 */
export class SentTo {
  constructor(private readonly sql: SqlStorage) {}

  /** A card revision arrived: it's sent to `account`, or to nobody in particular. The first note of a revision stands. */
  note(card: string, revision: number, account: string | undefined, now: number): void {
    this.sql.exec("INSERT OR IGNORE INTO sent_to (card, revision, account, at) VALUES (?, ?, ?, ?)", card, revision, account ?? null, now);
  }

  /** Every card's notes, by card: each revision that was noted. */
  all(): Map<string, Sent[]> {
    const out = new Map<string, Sent[]>();
    for (const r of this.sql.exec<{ card: string; revision: number; account: string | null; at: number }>("SELECT card, revision, account, at FROM sent_to ORDER BY card, revision").toArray()) {
      (out.get(r.card) ?? out.set(r.card, []).get(r.card)!).push({ revision: r.revision, account: r.account ?? undefined, at: r.at });
    }
    return out;
  }

  /** Whom a card's revision was sent to, if it was noted: one filed before members were has no note. */
  of(card: string, revision: number): Sent | undefined {
    const r = this.sql.exec<{ account: string | null; at: number }>("SELECT account, at FROM sent_to WHERE card = ? AND revision = ?", card, revision).toArray()[0];
    return r && { revision, account: r.account ?? undefined, at: r.at };
  }

  /**
   * A member left the project (or their account was deleted): the cards sent to them are sent to nobody in particular,
   * the project's owners. Returns whether there were any.
   */
  release(account: string): boolean {
    return this.sql.exec("UPDATE sent_to SET account = NULL WHERE account = ?", account).rowsWritten > 0;
  }

  /** A card's text went (retention), or the card did: its notes go with it. */
  forget(card: string): void {
    this.sql.exec("DELETE FROM sent_to WHERE card = ?", card);
  }
}

/**
 * The table `presence_of` (the object's migration 3): each member's last heartbeat from the desk. The project's own
 * `presence.json` still says whether anyone is there, which is what an agent's wait reads (D41); this says who, so a
 * notification isn't sent to a member who is looking at the desk, and is sent to one who isn't.
 */
export class MemberPresence {
  constructor(private readonly sql: SqlStorage) {}

  beat(account: string, client: string, now: number): void {
    this.sql.exec("INSERT INTO presence_of (account, client, at) VALUES (?, ?, ?) ON CONFLICT (account) DO UPDATE SET client = excluded.client, at = excluded.at", account, client, now);
  }

  /** A member left the project: their heartbeat goes. */
  forget(account: string): void {
    this.sql.exec("DELETE FROM presence_of WHERE account = ?", account);
  }

  /** Forget every heartbeat more than a day old: the privacy policy keeps one a day. Retention's daily look calls it too. */
  clearStale(now: number): void {
    this.sql.exec("DELETE FROM presence_of WHERE at < ?", now - 24 * 3600_000);
  }

  /** The accounts there now: a heartbeat in the last 90 seconds. Rows more than a day old are dropped. */
  present(now: number): Set<string> {
    this.clearStale(now);
    return new Set(this.sql.exec<{ account: string }>("SELECT account FROM presence_of WHERE at >= ?", now - MEMBER_PRESENT_MS).toArray().map((r) => r.account));
  }
}
