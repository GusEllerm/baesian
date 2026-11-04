import { hashOf, idWith, token, userCode } from "./secret.js";
import type { NewPasskey, StoredPasskey } from "./webauthn.js";

// Accounts, passkeys, sign-ins, projects and machine grants, in one D1 database (B-ytdt2). The tables are in
// migrations/; docs/vault/Design/File Formats.md describes them. Everything secret is kept as its SHA-256 hash.

const DAY = 86_400_000;

/** How long things last, and how often they may be tried (the agent's choices, but for sign-ins: B-vtr1r). */
export const LIMITS = {
  /** A sign-in ends after 30 days unused, or 90 days in all (B-vtr1r). */
  sessionIdleMs: 30 * DAY,
  sessionMaxMs: 90 * DAY,
  /** What asks for the passkey afresh (adding a passkey, linking Globus, approving a machine) takes a check this recent. */
  freshMs: 5 * 60_000,
  /** An emailed code works for 15 minutes, and for 5 tries. */
  codeMs: 15 * 60_000,
  codeAttempts: 5,
  /** At most 5 codes an hour to one address, and 10 a day. */
  codesPerHour: 5,
  codesPerDay: 10,
  /** A sign-up or recovery, once its code is checked, has an hour to enrol its passkey; a ceremony, 5 minutes. */
  flowMs: 60 * 60_000,
  ceremonyMs: 5 * 60_000,
  /** A machine's access token lasts an hour; its grant lapses after 30 days unused (P15 section 2). */
  accessMs: 60 * 60_000,
  grantIdleMs: 30 * DAY,
  /** A machine's sign-in request waits 10 minutes for approval, polled every 5 seconds (RFC 8628). */
  deviceMs: 10 * 60_000,
  deviceIntervalS: 5,
  /** A last use is written at most every 5 minutes, so reading isn't a write each time. */
  touchMs: 5 * 60_000,
} as const;

export type FlowKind = "signup" | "recover" | "signin" | "fresh" | "enrol" | "globus";

/** A flow in progress (the `flows` table). */
export interface Flow {
  id: string;
  kind: FlowKind;
  email: string | null;
  account: string | null;
  handle: string | null;
  code_hash: string | null;
  attempts: number;
  verified: number;
  challenge: string | null;
  globus_sub: string | null;
  data: string | null;
  created: string;
  expires: string;
}

export interface Account {
  id: string;
  handle: string;
  created: string;
}

export interface Session {
  hash: string;
  id: string;
  account: string;
  name: string;
  created: string;
  last_used: string;
  verified: string;
  expires: string;
}

export interface Grant {
  id: string;
  account: string;
  project: string;
  machine: string;
  access_hash: string;
  access_expires: string;
  refresh_hash: string;
  created: string;
  last_used: string;
  revoked: string | null;
}

export interface DeviceCode {
  hash: string;
  user_code: string;
  project: string;
  machine: string;
  created: string;
  expires: string;
  last_poll: string | null;
  approved_by: string | null;
  denied: number;
  issued: number;
}

/** A handle: 2 to 32 letters, digits, dots, dashes and underscores, starting with a letter or digit. */
export const HANDLE = /^[A-Za-z0-9][A-Za-z0-9._-]{1,31}$/;

/** An email address, lowercased and trimmed, or undefined if it isn't one. */
export function normalEmail(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const e = raw.trim().toLowerCase();
  return e.length <= 254 && /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/.test(e) ? e : undefined;
}

/** The most characters a project's name may have. */
export const PROJECT_NAME_MAX = 60;

/**
 * A project's name as its owner typed it (B-zqkwk), tidied: trimmed, its runs of spaces made one, and 1 to 60 characters
 * with no control characters; or undefined if it isn't one.
 */
export function projectName(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const name = raw.replace(/\s+/g, " ").trim();
  return name.length >= 1 && [...name].length <= PROJECT_NAME_MAX && !/[\u0000-\u001f\u007f-\u009f]/.test(name) ? name : undefined;
}

/** A project on the service: its random ID, its owner, the name its owner gave it (B-zqkwk), and when it was made. */
export interface Project {
  id: string;
  owner: string;
  name: string | null;
  created: string;
}

/** A browser's subscription to web push (the `push_subscriptions` table, M9e step 2). */
export interface PushSubscriptionRow {
  id: string;
  account: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  name: string;
  created: string;
  last_sent: string | null;
}

/** The most browsers an account gets notifications on. */
export const PUSH_MAX = 20;

/** A conflict on a unique column (a handle or an email taken in the meantime). */
export class Taken extends Error {}

const isUnique = (e: unknown) => /UNIQUE constraint failed/.test(e instanceof Error ? e.message : String(e));

export class Accounts {
  constructor(
    readonly db: D1Database,
    readonly clock: () => Date = () => new Date(),
  ) {}

  private now(): string {
    return this.clock().toISOString();
  }

  private later(ms: number): string {
    return new Date(this.clock().getTime() + ms).toISOString();
  }

  private ago(ms: number): string {
    return new Date(this.clock().getTime() - ms).toISOString();
  }

  // ---------------------------------------------------------------- accounts

  account(id: string): Promise<Account | null> {
    return this.db.prepare("SELECT id, handle, created FROM accounts WHERE id = ?").bind(id).first<Account>();
  }

  async accountByEmail(address: string): Promise<Account | null> {
    return this.db.prepare("SELECT a.id, a.handle, a.created FROM accounts a JOIN emails e ON e.account = a.id WHERE e.address = ?").bind(address).first<Account>();
  }

  async handleTaken(handle: string): Promise<boolean> {
    return (await this.db.prepare("SELECT 1 AS x FROM accounts WHERE handle = ?").bind(handle).first()) !== null;
  }

  async emails(account: string): Promise<{ address: string; verified: string | null }[]> {
    return (await this.db.prepare("SELECT address, verified FROM emails WHERE account = ? ORDER BY created").bind(account).all<{ address: string; verified: string | null }>()).results;
  }

  /** A new account with its first passkey, its email if it has one, its recovery code's hash, and a Globus identity if it came that way: all or nothing. */
  async createAccount(a: { id: string; handle: string; email?: { address: string; verified: boolean } | undefined; passkey: NewPasskey; name: string; recoveryHash: string; globusSub?: string | undefined }): Promise<void> {
    const now = this.now();
    const statements = [
      this.db.prepare("INSERT INTO accounts (id, handle, created) VALUES (?, ?, ?)").bind(a.id, a.handle, now),
      ...(a.email ? [this.db.prepare("INSERT INTO emails (address, account, verified, created) VALUES (?, ?, ?, ?)").bind(a.email.address, a.id, a.email.verified ? now : null, now)] : []),
      this.insertPasskey(a.id, a.passkey, a.name, now),
      this.db.prepare("INSERT INTO recovery_codes (account, hash, created) VALUES (?, ?, ?)").bind(a.id, a.recoveryHash, now),
      ...(a.globusSub ? [this.db.prepare("INSERT INTO globus_identities (sub, account, linked) VALUES (?, ?, ?)").bind(a.globusSub, a.id, now)] : []),
    ];
    try {
      await this.db.batch(statements);
    } catch (e) {
      if (isUnique(e)) throw new Taken("that handle, email address, passkey or Globus identity is taken");
      throw e;
    }
  }

  // ---------------------------------------------------------------- passkeys

  private insertPasskey(account: string, p: NewPasskey, name: string, now: string): D1PreparedStatement {
    return this.db
      .prepare("INSERT INTO passkeys (credential, account, cose, spki, alg, counter, transports, name, enrolled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(p.credential, account, p.cose, p.spki, p.alg, p.counter, p.transports ? JSON.stringify(p.transports) : null, name, now);
  }

  async addPasskey(account: string, p: NewPasskey, name: string): Promise<StoredPasskey> {
    try {
      await this.insertPasskey(account, p, name, this.now()).run();
    } catch (e) {
      if (isUnique(e)) throw new Taken("that passkey is enrolled already");
      throw e;
    }
    return (await this.passkey(p.credential))!;
  }

  passkey(credential: string): Promise<StoredPasskey | null> {
    return this.db.prepare("SELECT * FROM passkeys WHERE credential = ?").bind(credential).first<StoredPasskey>();
  }

  async passkeys(account: string): Promise<StoredPasskey[]> {
    return (await this.db.prepare("SELECT * FROM passkeys WHERE account = ? ORDER BY enrolled").bind(account).all<StoredPasskey>()).results;
  }

  async usePasskey(credential: string, counter: number): Promise<void> {
    await this.db.prepare("UPDATE passkeys SET counter = ?, last_used = ? WHERE credential = ?").bind(counter, this.now(), credential).run();
  }

  // ---------------------------------------------------------------- recovery codes and Globus identities

  async recoveryHash(account: string): Promise<string | undefined> {
    return (await this.db.prepare("SELECT hash FROM recovery_codes WHERE account = ?").bind(account).first<{ hash: string }>())?.hash;
  }

  replaceRecovery(account: string, hash: string): D1PreparedStatement {
    return this.db.prepare("INSERT OR REPLACE INTO recovery_codes (account, hash, created) VALUES (?, ?, ?)").bind(account, hash, this.now());
  }

  async globusAccount(sub: string): Promise<string | undefined> {
    return (await this.db.prepare("SELECT account FROM globus_identities WHERE sub = ?").bind(sub).first<{ account: string }>())?.account;
  }

  async globusOf(account: string): Promise<{ sub: string; linked: string } | null> {
    return this.db.prepare("SELECT sub, linked FROM globus_identities WHERE account = ?").bind(account).first<{ sub: string; linked: string }>();
  }

  async linkGlobus(account: string, sub: string): Promise<void> {
    try {
      await this.db.prepare("INSERT INTO globus_identities (sub, account, linked) VALUES (?, ?, ?)").bind(sub, account, this.now()).run();
    } catch (e) {
      if (isUnique(e)) throw new Taken("that Globus identity is linked to an account already, or this account has one linked");
      throw e;
    }
  }

  async unlinkGlobus(account: string): Promise<boolean> {
    return (await this.db.prepare("DELETE FROM globus_identities WHERE account = ?").bind(account).run()).meta.changes > 0;
  }

  // ---------------------------------------------------------------- flows: codes, ceremonies, round trips

  /** Start a flow; returns the secret its browser holds. Expired flows are cleared on the way. */
  async startFlow(kind: FlowKind, fields: Partial<Omit<Flow, "id" | "kind" | "created" | "expires" | "attempts">>, ms: number, secret: string = token()): Promise<string> {
    const now = this.now();
    await this.db.batch([
      this.db.prepare("DELETE FROM flows WHERE expires < ?").bind(this.ago(DAY)),
      this.db
        .prepare("INSERT INTO flows (id, kind, email, account, handle, code_hash, verified, challenge, globus_sub, data, created, expires) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(hashOf(secret), kind, fields.email ?? null, fields.account ?? null, fields.handle ?? null, fields.code_hash ?? null, fields.verified ?? 0, fields.challenge ?? null, fields.globus_sub ?? null, fields.data ?? null, now, this.later(ms)),
    ]);
    return secret;
  }

  /** A flow by its secret, if it's of one of these kinds and hasn't expired. */
  async flow(secret: unknown, ...kinds: FlowKind[]): Promise<Flow | undefined> {
    if (typeof secret !== "string" || !secret) return undefined;
    const f = await this.db.prepare("SELECT * FROM flows WHERE id = ?").bind(hashOf(secret)).first<Flow>();
    return f && kinds.includes(f.kind) && f.expires > this.now() ? f : undefined;
  }

  /** Take a flow by its secret, once: the second to ask gets nothing. */
  async takeFlow(secret: unknown, ...kinds: FlowKind[]): Promise<Flow | undefined> {
    if (typeof secret !== "string" || !secret) return undefined;
    const f = await this.db.prepare("DELETE FROM flows WHERE id = ? RETURNING *").bind(hashOf(secret)).first<Flow>();
    return f && kinds.includes(f.kind) && f.expires > this.now() ? f : undefined;
  }

  async updateFlow(id: string, fields: Partial<Pick<Flow, "handle" | "verified" | "challenge" | "account" | "expires" | "data">>): Promise<void> {
    const keys = Object.keys(fields) as (keyof typeof fields)[];
    if (!keys.length) return;
    await this.db
      .prepare(`UPDATE flows SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
      .bind(...keys.map((k) => fields[k] ?? null), id)
      .run();
  }

  /**
   * One try at a flow's emailed code (and, for recovery, its saved code beside it): counted before it's checked, so
   * a flow takes at most `LIMITS.codeAttempts` tries, then is spent.
   */
  async tryCode(flow: Flow, ok: () => Promise<boolean> | boolean): Promise<{ ok: true } | { ok: false; left: number }> {
    const counted = await this.db.prepare("UPDATE flows SET attempts = attempts + 1 WHERE id = ? AND attempts < ? RETURNING attempts").bind(flow.id, LIMITS.codeAttempts).first<{ attempts: number }>();
    if (!counted) return { ok: false, left: 0 };
    if (await ok()) {
      await this.db.prepare("UPDATE flows SET verified = 1, code_hash = NULL, expires = ? WHERE id = ?").bind(this.later(LIMITS.flowMs), flow.id).run();
      return { ok: true };
    }
    return { ok: false, left: LIMITS.codeAttempts - counted.attempts };
  }

  /** How many codes went to an address in the last hour and the last day: each is a flow that names it. */
  async codesSent(email: string): Promise<{ hour: number; day: number }> {
    const r = await this.db
      .prepare("SELECT SUM(CASE WHEN created >= ? THEN 1 ELSE 0 END) AS hour, COUNT(*) AS day FROM flows WHERE email = ? AND kind IN ('signup', 'recover') AND created >= ?")
      .bind(this.ago(60 * 60_000), email, this.ago(DAY))
      .first<{ hour: number | null; day: number }>();
    return { hour: r?.hour ?? 0, day: r?.day ?? 0 };
  }

  // ---------------------------------------------------------------- sessions (B-vtr1r, B-7bq05)

  /** A new sign-in, with the passkey checked now; returns the token its cookie holds. */
  async startSession(account: string, name: string): Promise<{ token: string; session: Session }> {
    const t = token();
    const now = this.now();
    const session: Session = { hash: hashOf(t), id: idWith("sess"), account, name, created: now, last_used: now, verified: now, expires: this.later(LIMITS.sessionMaxMs) };
    await this.db
      .prepare("INSERT INTO sessions (hash, id, account, name, created, last_used, verified, expires) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(session.hash, session.id, account, name, now, now, now, session.expires)
      .run();
    return { token: t, session };
  }

  /** The sign-in a cookie holds, if it's still good: not ended, not past 90 days, used in the last 30. Its last use moves. */
  async session(cookieValue: string | undefined): Promise<(Session & { handle: string }) | undefined> {
    if (!cookieValue) return undefined;
    const s = await this.db.prepare("SELECT s.*, a.handle FROM sessions s JOIN accounts a ON a.id = s.account WHERE s.hash = ?").bind(hashOf(cookieValue)).first<Session & { handle: string }>();
    if (!s) return undefined;
    const now = this.now();
    if (s.expires <= now || s.last_used <= this.ago(LIMITS.sessionIdleMs)) {
      await this.db.prepare("DELETE FROM sessions WHERE hash = ?").bind(s.hash).run();
      return undefined;
    }
    if (s.last_used <= this.ago(LIMITS.touchMs)) {
      await this.db.prepare("UPDATE sessions SET last_used = ? WHERE hash = ?").bind(now, s.hash).run();
      s.last_used = now;
    }
    return s;
  }

  /** Whether a sign-in checked the passkey recently enough for what asks afresh. */
  fresh(s: Session): boolean {
    return s.verified > this.ago(LIMITS.freshMs);
  }

  async markFresh(hash: string): Promise<void> {
    await this.db.prepare("UPDATE sessions SET verified = ? WHERE hash = ?").bind(this.now(), hash).run();
  }

  async sessions(account: string): Promise<Session[]> {
    return (await this.db.prepare("SELECT * FROM sessions WHERE account = ? AND expires > ? AND last_used > ? ORDER BY last_used DESC").bind(account, this.now(), this.ago(LIMITS.sessionIdleMs)).all<Session>()).results;
  }

  async endSession(account: string, id: string): Promise<boolean> {
    return (await this.db.prepare("DELETE FROM sessions WHERE account = ? AND id = ?").bind(account, id).run()).meta.changes > 0;
  }

  /** End every sign-in of an account, but `keep`'s. */
  endSessions(account: string, keep?: string): D1PreparedStatement {
    return keep ? this.db.prepare("DELETE FROM sessions WHERE account = ? AND hash != ?").bind(account, keep) : this.db.prepare("DELETE FROM sessions WHERE account = ?").bind(account);
  }

  // ---------------------------------------------------------------- projects

  project(id: string): Promise<Project | null> {
    return this.db.prepare("SELECT id, owner, name, created FROM projects WHERE id = ?").bind(id).first<Project>();
  }

  /** An account's projects, oldest first, each with its name (B-zqkwk). */
  async projectsOf(account: string): Promise<{ id: string; name: string | null; created: string }[]> {
    return (await this.db.prepare("SELECT id, name, created FROM projects WHERE owner = ? ORDER BY created").bind(account).all<{ id: string; name: string | null; created: string }>()).results;
  }

  /** Rename a project its owner owns (B-zqkwk). Returns whether there was one to rename. */
  async renameProject(account: string, id: string, name: string): Promise<boolean> {
    return (await this.db.prepare("UPDATE projects SET name = ? WHERE id = ? AND owner = ?").bind(name, id, account).run()).meta.changes > 0;
  }

  /** Whether an account may answer in a project: in v1, its owner (P15 section 2). */
  async member(account: string, project: string): Promise<boolean> {
    return (await this.db.prepare("SELECT 1 AS x FROM projects WHERE id = ? AND owner = ?").bind(project, account).first()) !== null;
  }

  // ---------------------------------------------------------------- push subscriptions (M9e step 2, B-nk97q)

  /**
   * A browser's subscription to web push, for an account: one per account and browser. A browser's endpoint is its own,
   * so subscribing again from it replaces its keys, and moves it to this account if another had it (two accounts signed
   * in, one after the other, in one browser). An account has at most `PUSH_MAX`. Returns the row.
   */
  async subscribe(account: string, s: { endpoint: string; p256dh: string; auth: string }, name: string): Promise<PushSubscriptionRow | { problem: string }> {
    const had = await this.db.prepare("SELECT * FROM push_subscriptions WHERE endpoint = ?").bind(s.endpoint).first<PushSubscriptionRow>();
    if (!had || had.account !== account) {
      const n = await this.db.prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE account = ?").bind(account).first<{ n: number }>();
      if ((n?.n ?? 0) >= PUSH_MAX) return { problem: `an account gets notifications on at most ${PUSH_MAX} browsers: remove one first` };
    }
    const row: PushSubscriptionRow = { id: had?.account === account ? had.id : idWith("push"), account, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth, name, created: had?.account === account ? had.created : this.now(), last_sent: had?.account === account ? had.last_sent : null };
    await this.db
      .prepare("INSERT INTO push_subscriptions (id, account, endpoint, p256dh, auth, name, created, last_sent) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (endpoint) DO UPDATE SET id = excluded.id, account = excluded.account, p256dh = excluded.p256dh, auth = excluded.auth, name = excluded.name, created = excluded.created, last_sent = excluded.last_sent")
      .bind(row.id, row.account, row.endpoint, row.p256dh, row.auth, row.name, row.created, row.last_sent)
      .run();
    return row;
  }

  /** An account's subscriptions, oldest first. */
  async subscriptions(account: string): Promise<PushSubscriptionRow[]> {
    return (await this.db.prepare("SELECT * FROM push_subscriptions WHERE account = ? ORDER BY created").bind(account).all<PushSubscriptionRow>()).results;
  }

  /** Remove one of an account's subscriptions. Returns whether there was one. */
  async unsubscribe(account: string, id: string): Promise<boolean> {
    return (await this.db.prepare("DELETE FROM push_subscriptions WHERE account = ? AND id = ?").bind(account, id).run()).meta.changes > 0;
  }

  /** A subscription its push service says is gone (404 or 410): deleted. */
  async dropSubscription(endpoint: string): Promise<void> {
    await this.db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(endpoint).run();
  }

  /** When a push last reached a subscription's push service. */
  async markSent(ids: string[]): Promise<void> {
    if (ids.length) await this.db.batch(ids.map((id) => this.db.prepare("UPDATE push_subscriptions SET last_sent = ? WHERE id = ?").bind(this.now(), id)));
  }

  // ---------------------------------------------------------------- machines (B-84e0d, RFC 8628, RFC 9700)

  /** A machine asks to sign in to a project: its device code, and the code a person types to approve it. */
  async startDevice(project: string, machine: string): Promise<{ device: string; user: string }> {
    const device = token();
    const now = this.now();
    await this.db.prepare("DELETE FROM device_codes WHERE expires < ?").bind(this.ago(DAY)).run();
    for (let i = 0; ; i++) {
      const user = userCode();
      try {
        await this.db.prepare("INSERT INTO device_codes (hash, user_code, project, machine, created, expires) VALUES (?, ?, ?, ?, ?, ?)").bind(hashOf(device), user, project, machine, now, this.later(LIMITS.deviceMs)).run();
        return { device, user };
      } catch (e) {
        if (!isUnique(e) || i >= 5) throw e;
      }
    }
  }

  /** A pending request by the code a person typed, if it's still waiting. */
  async deviceByUserCode(user: string): Promise<DeviceCode | undefined> {
    const d = await this.db.prepare("SELECT * FROM device_codes WHERE user_code = ?").bind(user).first<DeviceCode>();
    return d && d.expires > this.now() && !d.approved_by && !d.denied ? d : undefined;
  }

  /**
   * A person approves a machine: the project is made for them if it's new, with the name they gave it (B-zqkwk), and must
   * be theirs if it isn't. Returns whether the project was new, or why not.
   */
  async approveDevice(d: DeviceCode, account: string, name?: string): Promise<{ created: boolean } | { problem: string }> {
    const p = await this.project(d.project);
    if (p && p.owner !== account) return { problem: `project ${d.project} belongs to another account: link this repo again, as a new project` };
    if (!p && !name) return { problem: "a new project needs a name" };
    const now = this.now();
    await this.db.batch([
      ...(p ? [] : [this.db.prepare("INSERT INTO projects (id, owner, name, created) VALUES (?, ?, ?, ?)").bind(d.project, account, name, now)]),
      this.db.prepare("UPDATE device_codes SET approved_by = ? WHERE hash = ? AND approved_by IS NULL AND denied = 0").bind(account, d.hash),
    ]);
    return { created: !p };
  }

  async denyDevice(d: DeviceCode): Promise<void> {
    await this.db.prepare("UPDATE device_codes SET denied = 1 WHERE hash = ?").bind(d.hash).run();
  }

  /**
   * A machine polls with its device code (RFC 8628 section 3.4): the error to give, or a new grant's tokens once a person
   * approved it. A device code gives tokens once.
   */
  async pollDevice(device: string): Promise<{ error: "authorization_pending" | "slow_down" | "access_denied" | "expired_token" | "invalid_grant" } | { grant: Grant; access: string; refresh: string }> {
    const d = await this.db.prepare("SELECT * FROM device_codes WHERE hash = ?").bind(hashOf(device)).first<DeviceCode>();
    if (!d || d.issued) return { error: "invalid_grant" };
    const now = this.now();
    if (d.expires <= now) return { error: "expired_token" };
    if (d.denied) return { error: "access_denied" };
    const tooSoon = d.last_poll !== null && d.last_poll > this.ago(LIMITS.deviceIntervalS * 1000 - 250);
    await this.db.prepare("UPDATE device_codes SET last_poll = ? WHERE hash = ?").bind(now, d.hash).run();
    if (!d.approved_by) return { error: tooSoon ? "slow_down" : "authorization_pending" };
    // Issued once: the first poll to mark it gets the grant.
    const marked = await this.db.prepare("UPDATE device_codes SET issued = 1 WHERE hash = ? AND issued = 0").bind(d.hash).run();
    if (!marked.meta.changes) return { error: "invalid_grant" };
    return this.createGrant(d.approved_by, d.project, d.machine);
  }

  private async createGrant(account: string, project: string, machine: string): Promise<{ grant: Grant; access: string; refresh: string }> {
    const access = token();
    const refresh = token();
    const now = this.now();
    const grant: Grant = { id: idWith("grant"), account, project, machine, access_hash: hashOf(access), access_expires: this.later(LIMITS.accessMs), refresh_hash: hashOf(refresh), created: now, last_used: now, revoked: null };
    await this.db
      .prepare("INSERT INTO grants (id, account, project, machine, access_hash, access_expires, refresh_hash, created, last_used) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(grant.id, account, project, machine, grant.access_hash, grant.access_expires, grant.refresh_hash, now, now)
      .run();
    return { grant, access, refresh };
  }

  /** The grant an access token is for, if it's good: not revoked, not lapsed, and the token not expired. */
  async grantByAccess(access: string): Promise<Grant | undefined> {
    const g = await this.db.prepare("SELECT * FROM grants WHERE access_hash = ?").bind(hashOf(access)).first<Grant>();
    const now = this.now();
    if (!g || g.revoked || g.access_expires <= now || g.last_used <= this.ago(LIMITS.grantIdleMs)) return undefined;
    if (g.last_used <= this.ago(LIMITS.touchMs)) await this.db.prepare("UPDATE grants SET last_used = ? WHERE id = ?").bind(now, g.id).run();
    return g;
  }

  /**
   * A refresh (RFC 6749 section 6): new tokens for a grant, the refresh token used up. One presented again, or used
   * twice at once, revokes the grant (RFC 9700 section 4.14.2).
   */
  async refresh(refresh: string): Promise<{ grant: Grant; access: string; refresh: string } | { error: "invalid_grant"; why: string }> {
    const old = hashOf(refresh);
    const g = await this.db.prepare("SELECT * FROM grants WHERE refresh_hash = ?").bind(old).first<Grant>();
    if (!g) {
      const spent = await this.db.prepare("SELECT grant_id FROM spent_tokens WHERE hash = ?").bind(old).first<{ grant_id: string }>();
      if (spent) {
        await this.revoke(spent.grant_id);
        return { error: "invalid_grant", why: "this refresh token was used already, so the grant is revoked: sign in again with baesian login" };
      }
      return { error: "invalid_grant", why: "no grant has this refresh token" };
    }
    if (g.revoked) return { error: "invalid_grant", why: "this grant was revoked" };
    if (g.last_used <= this.ago(LIMITS.grantIdleMs)) return { error: "invalid_grant", why: "this grant lapsed after 30 days unused: sign in again with baesian login" };
    const access = token();
    const next = token();
    const now = this.now();
    try {
      const [updated] = await this.db.batch([
        this.db.prepare("UPDATE grants SET access_hash = ?, access_expires = ?, refresh_hash = ?, last_used = ? WHERE id = ? AND refresh_hash = ? AND revoked IS NULL").bind(hashOf(access), this.later(LIMITS.accessMs), hashOf(next), now, g.id, old),
        this.db.prepare("INSERT INTO spent_tokens (hash, grant_id, spent) VALUES (?, ?, ?)").bind(old, g.id, now),
      ]);
      if (!updated?.meta.changes) throw new Error("raced");
    } catch {
      await this.revoke(g.id);
      return { error: "invalid_grant", why: "this refresh token was used twice at once, so the grant is revoked: sign in again with baesian login" };
    }
    return { grant: { ...g, access_hash: hashOf(access), refresh_hash: hashOf(next), last_used: now }, access, refresh: next };
  }

  /** Revoke a grant by a token it holds (RFC 7009), whichever it is. */
  async revokeByToken(t: string): Promise<void> {
    const h = hashOf(t);
    const g = await this.db.prepare("SELECT id FROM grants WHERE access_hash = ? OR refresh_hash = ?").bind(h, h).first<{ id: string }>();
    if (g) await this.revoke(g.id);
  }

  async revoke(id: string, account?: string): Promise<boolean> {
    const r = account
      ? await this.db.prepare("UPDATE grants SET revoked = ? WHERE id = ? AND account = ? AND revoked IS NULL").bind(this.now(), id, account).run()
      : await this.db.prepare("UPDATE grants SET revoked = ? WHERE id = ? AND revoked IS NULL").bind(this.now(), id).run();
    return r.meta.changes > 0;
  }

  /** A project's machines signed in now: its grants not revoked or lapsed, by ID. Retention waits for each (B-9jqt4). */
  async liveGrants(project: string): Promise<string[]> {
    return (await this.db.prepare("SELECT id FROM grants WHERE project = ? AND revoked IS NULL AND last_used > ?").bind(project, this.ago(LIMITS.grantIdleMs)).all<{ id: string }>()).results.map((r) => r.id);
  }

  /** An account's machines: grants not revoked or lapsed, newest use first. */
  async grants(account: string): Promise<Grant[]> {
    return (await this.db.prepare("SELECT * FROM grants WHERE account = ? AND revoked IS NULL AND last_used > ? ORDER BY last_used DESC").bind(account, this.ago(LIMITS.grantIdleMs)).all<Grant>()).results;
  }
}
