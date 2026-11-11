import type { Waiting } from "./notify.js";

// The state as last built, kept in the project's own database until the project changes (B-evrec). Building it reads,
// parses and checks every file of the project, most of a second for a couple of hundred cards, and until this it was
// built for every request; now a project that hasn't changed sends what it built last time. The table holds nothing the
// files don't: it's a second copy of what `snapshot()` made of them, emptied by every write in that write's own
// transaction (`SqlFileStorage`'s version moving), so it's never older than the files, and a card's text that retention
// removes goes from here in the same step (R-1sxpy). docs/vault/Modules/service.md describes it.

/**
 * How long after a project's last change its state is built again, so the next read finds it kept: long enough that a
 * burst of uploads is one build. (Here, not beside the object that uses it: a Worker's main module may export only its
 * handlers and classes.)
 */
export const BUILD_AFTER_MS = 2000;

/**
 * A part's length in UTF-16 units. SQLite stores each as at most three bytes, so a part is at most 3 MB, under the 8 MB
 * a Durable Object's value may be, however large a project's state grows.
 */
export const PART = 1_000_000;

/** What was built from a project at one version. */
export interface Built {
  /**
   * The state's JSON, without what's added as it's sent: the clock, when this object started, and the reviewer's
   * presence, none of which moves the project's version.
   */
  rest: string;
  /** The cards waiting for the reviewer (open, and audits), at their level in force: what a notification counts. */
  waiting: Waiting[];
  /**
   * The last moment it's true, in ms: a waiting marker goes stale by the clock alone (D90), with no write, so what was
   * built says "still waiting" only until the first of its fresh markers would. Absent when it holds until the project
   * changes.
   */
  until?: number;
}

/** Part 0 of the table: what the rest was built from, and how many parts follow. */
interface About {
  version: number;
  stamp: string;
  parts: number;
  waiting: Waiting[];
  until?: number;
}

/** Text in parts of at most `size` UTF-16 units, never split between the two halves of one character. */
export function inParts(text: string, size: number = PART): string[] {
  const out: string[] = [];
  // Two units at least, so a part that gives up its last one is never empty.
  const n = Math.max(2, size);
  for (let from = 0; from < text.length; ) {
    let to = Math.min(from + n, text.length);
    const last = text.charCodeAt(to - 1);
    // A high surrogate at the end would be stored without its other half, and come back as a replacement character.
    if (to < text.length && last >= 0xd800 && last <= 0xdbff) to -= 1;
    out.push(text.slice(from, to));
    from = to;
  }
  return out;
}

/**
 * The table `built` (the object's migration 2): part 0 says what was built, from which version, by which release and
 * keys (`stamp`), and until when; parts 1 up are the state's text, in order. Empty, or current: every write empties it.
 */
export class BuiltTable {
  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly size: number = PART,
  ) {}

  /**
   * Part 0, if what's kept was built at this version, by this release with these keys, and still holds at `now`. Anything
   * else (nothing kept, another version or stamp, past its time) is nothing: it's built again.
   */
  private about(version: number, stamp: string, now: number): About | undefined {
    const head = this.storage.sql.exec<{ value: string }>("SELECT value FROM built WHERE part = 0").toArray()[0];
    if (!head) return undefined;
    let about: About;
    try {
      about = JSON.parse(head.value) as About;
    } catch {
      return undefined;
    }
    if (about.version !== version || about.stamp !== stamp) return undefined;
    if (about.until !== undefined && now > about.until) return undefined;
    return about;
  }

  /** The cards waiting, as kept, if what's kept holds (`BuiltTable.about`): read without the state's text. */
  waiting(version: number, stamp: string, now: number): Waiting[] | undefined {
    return this.about(version, stamp, now)?.waiting;
  }

  /** What's kept, if it holds (`BuiltTable.about`) and every part of its text is there. */
  get(version: number, stamp: string, now: number): Built | undefined {
    const about = this.about(version, stamp, now);
    if (!about) return undefined;
    const parts = this.storage.sql.exec<{ value: string }>("SELECT value FROM built WHERE part > 0 ORDER BY part").toArray();
    if (parts.length !== about.parts) return undefined;
    return { rest: parts.map((p) => p.value).join(""), waiting: about.waiting, ...(about.until !== undefined ? { until: about.until } : {}) };
  }

  /** Keep what was built at this version, in place of whatever was kept: all of it, or none. */
  keep(version: number, stamp: string, built: Built): void {
    const sql = this.storage.sql;
    const parts = inParts(built.rest, this.size);
    const about: About = { version, stamp, parts: parts.length, waiting: built.waiting, ...(built.until !== undefined ? { until: built.until } : {}) };
    this.storage.transactionSync(() => {
      sql.exec("DELETE FROM built");
      sql.exec("INSERT INTO built (part, value) VALUES (0, ?)", JSON.stringify(about));
      parts.forEach((value, i) => sql.exec("INSERT INTO built (part, value) VALUES (?, ?)", i + 1, value));
    });
  }
}
