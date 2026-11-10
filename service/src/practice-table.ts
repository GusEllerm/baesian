import { PracticeRefused, practiceEntry } from "../../src/practice-answers.js";
import { PracticeEntry, asWritten, upgradeFile } from "../../src/schema.js";
import type { Reply } from "./relay.js";

// Where a project's practice answers are kept on the service (B-rehdw, "On the service, for every device";
// docs/vault/Design/Practice Cards.md section 5): a table of the project's own object, beside its retention and
// notification tables, never in its files or its log (`SqlFileStorage`). So no machine is ever sent one, they're not in
// the state a machine may read, and nothing is announced when one is written. Its address, `practice`, is for a person
// signed in in a browser only (index.ts). They go when the project is deleted (`ProjectRelay.erase`), with everything else.

/** The hosted clients a practice answer comes from (D130), as an answer's do. */
const CLIENTS = ["hosted-desktop", "hosted-phone"] as const;

/** A project's practice entries (B-rehdw): the blind test's start, answers on practice cards, and marks in the test. */
export class PracticeTable {
  /** Its table, `practice`, is made by the object's migrations (`migrateObject()`, B-866d2). */
  constructor(private readonly sql: SqlStorage) {}

  /** Every entry, in the order written. A row this service can't read is skipped. */
  entries(): PracticeEntry[] {
    return this.sql
      .exec<{ entry: string }>("SELECT entry FROM practice ORDER BY seq")
      .toArray()
      .flatMap((r) => {
        try {
          return [PracticeEntry.parse(upgradeFile("practice", JSON.parse(r.entry), "a practice row"))];
        } catch {
          return [];
        }
      });
  }

  /** `GET .../practice`: every entry, oldest first. */
  read(): Reply {
    return { status: 200, body: { entries: this.entries() } };
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
      const entry = practiceEntry(typeof input === "object" && input !== null && !Array.isArray(input) ? rest : input, { reviewer: who.handle, account: who.account, client: asClient }, this.entries());
      this.sql.exec("INSERT INTO practice (at, entry) VALUES (?, ?)", entry.at, JSON.stringify(asWritten("practice", entry)));
      return { status: 201, body: { entry } };
    } catch (e) {
      if (e instanceof PracticeRefused) return { status: e.status, body: { error: e.message } };
      throw e;
    }
  }
}
