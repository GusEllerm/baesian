import { PracticeRefused, practiceEntry } from "../../src/practice-answers.js";
import { PracticeEntry, asWritten, upgradeFile } from "../../src/schema.js";
import type { Reply } from "./relay.js";

// Where a project's practice answers are kept on the service (B-rehdw, "On the service, for every device";
// docs/vault/Design/Practice Cards.md section 5): a table of the project's own object, beside its retention and
// notification tables, never in its files or its log (`SqlFileStorage`). So no machine is ever sent one, they're not in
// the state a machine may read, and nothing is announced when one is written. Its address, `practice`, is for a person
// signed in in a browser only (index.ts). They go when the project is deleted (`ProjectRelay.erase`), with everything else,
// and a member's go when they leave it, are removed, or their account is deleted (`ProjectRelay.memberGone`, B-wfw7a).

/** The hosted clients a practice answer comes from (D130), as an answer's do. */
const CLIENTS = ["hosted-desktop", "hosted-phone"] as const;

/** A project's practice entries (B-rehdw): the blind test's start, answers on practice cards, and marks in the test. */
export class PracticeTable {
  /** Its table, `practice`, is made by the object's migrations (`migrateObject()`, B-866d2). */
  constructor(private readonly sql: SqlStorage) {}

  /**
   * One account's entries, in the order written: practice answers are a person's own, so a project's other members never
   * see them, and one member's blind test is no part of another's (P20). A row this service can't read is skipped.
   */
  entries(account: string): PracticeEntry[] {
    return this.sql
      .exec<{ entry: string }>("SELECT entry FROM practice ORDER BY seq")
      .toArray()
      .flatMap((r) => {
        try {
          const entry = PracticeEntry.parse(upgradeFile("practice", JSON.parse(r.entry), "a practice row"));
          return entry.account === account ? [entry] : [];
        } catch {
          return [];
        }
      });
  }

  /**
   * Delete one account's entries: it has left the project or been removed (B-wfw7a, "They go at once"), or its account is
   * deleted and this is a project it only joined, which stays (B-b46z3). A row this service can't read is left, since
   * whose it is can't be told. Returns how many went.
   */
  forget(account: string): number {
    let gone = 0;
    for (const r of this.sql.exec<{ seq: number; entry: string }>("SELECT seq, entry FROM practice").toArray()) {
      let whose: string | undefined;
      try {
        whose = PracticeEntry.parse(upgradeFile("practice", JSON.parse(r.entry), "a practice row")).account;
      } catch {
        continue;
      }
      if (whose !== account) continue;
      this.sql.exec("DELETE FROM practice WHERE seq = ?", r.seq);
      gone++;
    }
    return gone;
  }

  /** `GET .../practice`: every entry of the asker's, oldest first. */
  read(account: string): Reply {
    return { status: 200, body: { entries: this.entries(account) } };
  }

  /**
   * `POST .../practice`: one entry, from a person's session (`practiceEntry()`), with its account, handle and client: the
   * desktop's or the phone's layout. 201 with what was kept.
   */
  write(input: unknown, who: { account: string; handle: string }): Reply {
    const { client, ...rest } = typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : { client: undefined };
    const asClient = client === undefined ? "hosted-desktop" : (CLIENTS as readonly unknown[]).includes(client) ? (client as string) : undefined;
    if (!asClient) return { status: 400, body: { error: `client is one of ${CLIENTS.join(", ")}` } };
    try {
      const entry = practiceEntry(typeof input === "object" && input !== null && !Array.isArray(input) ? rest : input, { reviewer: who.handle, account: who.account, client: asClient }, this.entries(who.account));
      this.sql.exec("INSERT INTO practice (at, entry) VALUES (?, ?)", entry.at, JSON.stringify(asWritten("practice", entry)));
      return { status: 201, body: { entry } };
    } catch (e) {
      if (e instanceof PracticeRefused) return { status: e.status, body: { error: e.message } };
      throw e;
    }
  }
}
