import { USAGE_KINDS, USAGE_RAW_DAYS, type UsageKindName, usageProblem } from "../../src/usage-fields.js";
import { idWith } from "./secret.js";

// Usage counts (M9e step 2, D141, B-7nq85), in the accounts database (B-ytdt2): an event is kept only if its fields pass
// `usageProblem()` against src/usage-fields.ts, the list the public page shows, with a random usage ID per account and a
// random key per project, the hour rather than the time, and nothing from an account that opted out. After 90 days only
// daily counts are kept, with no ID, key or hour. docs/vault/Modules/service.md describes it.

const DAY = 86_400_000;

/** Whose an event is: an account (and one of its projects), a project (its owner's, in v1), or nobody's (an error). */
export type UsageWho = { account: string; project?: string } | { project: string } | null;

/** The counts, over the accounts database. A failure to count never fails what was counted: it's logged. */
export class Usage {
  /** When daily counts were last made, in this isolate: at most once an hour. */
  private static rolled = 0;

  constructor(
    readonly db: D1Database,
    readonly clock: () => Date = () => new Date(),
  ) {}

  /** Record an event, if its fields pass and its account counts. Never throws. */
  async record(who: UsageWho, kind: UsageKindName, fields: Record<string, unknown> = {}): Promise<void> {
    try {
      const problem = usageProblem(kind, fields);
      if (problem) throw new Error(problem);
      const now = this.clock();
      let usageId: string | null = null;
      let key: string | null = null;
      if (USAGE_KINDS[kind]!.ids) {
        if (!who) return;
        const project = "project" in who && who.project ? await this.db.prepare("SELECT id, owner, usage_key FROM projects WHERE id = ?").bind(who.project).first<{ id: string; owner: string; usage_key: string | null }>() : null;
        const account = "account" in who ? who.account : project?.owner;
        if (!account) return;
        usageId = await this.usageId(account);
        if (!usageId) return;
        if (project) key = project.usage_key ?? (await this.keyOf(project.id));
      }
      await this.db.prepare("INSERT INTO usage_events (usage_id, project, kind, hour, fields) VALUES (?, ?, ?, ?, ?)").bind(usageId, key, kind, now.toISOString().slice(0, 13), JSON.stringify(fields)).run();
      await this.rollupNow(now);
    } catch (e) {
      console.error(`counting ${kind} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Record an event once a day: the first with these fields today, for the account, across its projects (a visit). */
  async recordDaily(who: UsageWho, kind: UsageKindName, fields: Record<string, unknown>): Promise<void> {
    try {
      const account = who && ("account" in who ? who.account : (await this.db.prepare("SELECT owner FROM projects WHERE id = ?").bind(who.project).first<{ owner: string }>())?.owner);
      const usageId = account ? (await this.db.prepare("SELECT usage_id FROM accounts WHERE id = ?").bind(account).first<{ usage_id: string | null }>())?.usage_id : undefined;
      const day = this.clock().toISOString().slice(0, 10);
      if (usageId && (await this.db.prepare("SELECT 1 AS x FROM usage_events WHERE usage_id = ? AND kind = ? AND fields = ? AND hour >= ?").bind(usageId, kind, JSON.stringify(fields), day).first())) return;
    } catch (e) {
      console.error(`counting ${kind} failed: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    await this.record(who, kind, fields);
  }

  /** An account's usage ID, made at its first counted event; none while it has opted out. */
  private async usageId(account: string): Promise<string | null> {
    // Nothing is counted for an account that opted out, or that's closed, to be deleted (B-b46z3).
    const a = await this.db.prepare("SELECT usage_id, usage_opt_out, closed FROM accounts WHERE id = ?").bind(account).first<{ usage_id: string | null; usage_opt_out: string | null; closed: string | null }>();
    if (!a || a.usage_opt_out || a.closed) return null;
    if (a.usage_id) return a.usage_id;
    const id = idWith("u");
    await this.db.prepare("UPDATE accounts SET usage_id = COALESCE(usage_id, ?) WHERE id = ?").bind(id, account).run();
    return (await this.db.prepare("SELECT usage_id FROM accounts WHERE id = ?").bind(account).first<{ usage_id: string }>())!.usage_id;
  }

  private async keyOf(project: string): Promise<string> {
    await this.db.prepare("UPDATE projects SET usage_key = COALESCE(usage_key, ?) WHERE id = ?").bind(idWith("k"), project).run();
    return (await this.db.prepare("SELECT usage_key FROM projects WHERE id = ?").bind(project).first<{ usage_key: string }>())!.usage_key;
  }

  /** Whether an account is counted. */
  async counted(account: string): Promise<boolean> {
    const a = await this.db.prepare("SELECT usage_opt_out FROM accounts WHERE id = ?").bind(account).first<{ usage_opt_out: string | null }>();
    return !!a && !a.usage_opt_out;
  }

  /**
   * Opt out, or back in. Out: nothing more is counted, the account's raw events are deleted at once, and its usage ID is
   * dropped, so counting again starts with a new one, unlinked to before. Daily counts already made hold no ID, and stay.
   */
  async setCounted(account: string, counted: boolean): Promise<void> {
    if (counted) {
      await this.db.prepare("UPDATE accounts SET usage_opt_out = NULL WHERE id = ?").bind(account).run();
      return;
    }
    const a = await this.db.prepare("SELECT usage_id FROM accounts WHERE id = ?").bind(account).first<{ usage_id: string | null }>();
    await this.db.batch([
      ...(a?.usage_id ? [this.db.prepare("DELETE FROM usage_events WHERE usage_id = ?").bind(a.usage_id)] : []),
      this.db.prepare("UPDATE accounts SET usage_id = NULL, usage_opt_out = ? WHERE id = ?").bind(this.clock().toISOString(), account),
    ]);
  }

  /** Make daily counts of raw events older than 90 days, and delete those events, at most once an hour per isolate. */
  private async rollupNow(now: Date): Promise<void> {
    if (now.getTime() - Usage.rolled < 3_600_000) return;
    Usage.rolled = now.getTime();
    await this.rollup(now);
  }

  /** Daily counts of every raw event older than 90 days, then those events deleted. */
  async rollup(now: Date = this.clock()): Promise<void> {
    const before = new Date(now.getTime() - USAGE_RAW_DAYS * DAY).toISOString().slice(0, 10);
    const old = (await this.db.prepare("SELECT kind, hour, fields FROM usage_events WHERE hour < ?").bind(before).all<{ kind: string; hour: string; fields: string }>()).results;
    if (!old.length) return;
    const counts = new Map<string, number>();
    const add = (day: string, kind: string, field: string, value: string) => {
      const k = JSON.stringify([day, kind, field, value]);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    };
    for (const e of old) {
      const day = e.hour.slice(0, 10);
      add(day, e.kind, "", "");
      for (const [field, v] of Object.entries(JSON.parse(e.fields) as Record<string, unknown>)) {
        for (const value of Array.isArray(v) ? v : [v]) add(day, e.kind, field, String(value));
      }
    }
    await this.db.batch([
      ...[...counts].map(([k, n]) => {
        const [day, kind, field, value] = JSON.parse(k) as string[];
        return this.db.prepare("INSERT INTO usage_daily (day, kind, field, value, count) VALUES (?, ?, ?, ?, ?) ON CONFLICT (day, kind, field, value) DO UPDATE SET count = count + excluded.count").bind(day, kind, field, value, n);
      }),
      this.db.prepare("DELETE FROM usage_events WHERE hour < ?").bind(before),
    ]);
  }
}

/** A card's harness, as counted: the two known by name, any other agent only as `other` (B-7nq85). */
export const harnessOf = (agent: string): "claude-code" | "codex" | "other" => (agent === "claude-code" || agent === "codex" ? agent : "other");

/** A route's name for an error: a project's address by its last part, any other by its first after /v1/. */
export function routeOf(path: string): string {
  const m = /^\/v1\/projects\/[^/]+\/([^/]+)/.exec(path);
  const name = m ? (m[1] === "files" ? "upload" : m[1]!) : (/^\/v1\/([^/]+)/.exec(path)?.[1] ?? "other");
  return (USAGE_KINDS.error!.fields.route!.value as { values: readonly string[] }).values.includes(name) ? name : "other";
}
