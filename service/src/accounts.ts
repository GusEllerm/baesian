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
  /** A link that adds a member is good for seven days, once (B-jsady). */
  inviteMs: 7 * DAY,
} as const;

export type FlowKind = "signup" | "recover" | "signin" | "fresh" | "enrol" | "globus" | "restore";

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
  /** When its owner closed it, to be deleted 14 days on (B-b46z3); null while it's open. */
  closed: string | null;
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

/**
 * A project on the service: its random ID, the account that made it and holds it (`owner`: deleting that account deletes
 * the project, B-b46z3), the name it was given (B-zqkwk), and when it was made.
 */
export interface Project {
  id: string;
  owner: string;
  name: string | null;
  created: string;
}

/**
 * What a member is in a project (P20, B-rxbss): an owner adds and removes members, and changes the project's settings and
 * rules; a member reads it and answers its cards (B-r51ts). The account that holds the project is always an owner.
 */
export type Role = "owner" | "member";

/** One of a project's members: the account, its handle, its role, and when it joined. */
export interface Member {
  account: string;
  handle: string;
  role: Role;
  joined: string;
}

/** A project an account is a member of, with its role there. */
export interface MemberProject {
  id: string;
  name: string | null;
  created: string;
  role: Role;
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
    return this.db.prepare("SELECT id, handle, created, closed FROM accounts WHERE id = ?").bind(id).first<Account>();
  }

  async accountByEmail(address: string): Promise<Account | null> {
    return this.db.prepare("SELECT a.id, a.handle, a.created, a.closed FROM accounts a JOIN emails e ON e.account = a.id WHERE e.address = ?").bind(address).first<Account>();
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
    // A closed account has no sign-ins (B-b46z3): closing ends them all, and none is taken while it's closed.
    const s = await this.db.prepare("SELECT s.*, a.handle FROM sessions s JOIN accounts a ON a.id = s.account WHERE s.hash = ? AND a.closed IS NULL").bind(hashOf(cookieValue)).first<Session & { handle: string }>();
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

  /**
   * The projects an account is a member of (P20), oldest first, each with its name (B-zqkwk) and the account's role there.
   * A project whose holder's account is closed isn't among them: it's closed with it (B-b46z3).
   */
  async projectsOf(account: string): Promise<MemberProject[]> {
    return (
      await this.db
        .prepare("SELECT p.id, p.name, p.created, m.role FROM members m JOIN projects p ON p.id = m.project JOIN accounts h ON h.id = p.owner WHERE m.account = ? AND h.closed IS NULL ORDER BY p.created, p.id")
        .bind(account)
        .all<MemberProject>()
    ).results;
  }

  /**
   * The projects an account holds: the ones it made, which are deleted with it (B-b46z3). Never the projects it's only a
   * member of: deleting a member's account leaves those as they are.
   */
  async projectsHeldBy(account: string): Promise<{ id: string; name: string | null; created: string }[]> {
    return (await this.db.prepare("SELECT id, name, created FROM projects WHERE owner = ? ORDER BY created").bind(account).all<{ id: string; name: string | null; created: string }>()).results;
  }

  /** Rename a project, by one of its owners (B-zqkwk, B-rxbss). Returns whether there was one of theirs to rename. */
  async renameProject(account: string, id: string, name: string): Promise<boolean> {
    if ((await this.role(account, id)) !== "owner") return false;
    return (await this.db.prepare("UPDATE projects SET name = ? WHERE id = ?").bind(name, id).run()).meta.changes > 0;
  }

  /**
   * An account's role in a project, or nothing if it isn't a member (P20). Nobody has a role in a project whose holder's
   * account is closed: the project is closed with it, for every member, until it's restored or deleted (B-b46z3).
   */
  async role(account: string, project: string): Promise<Role | undefined> {
    const r = await this.db
      .prepare("SELECT m.role FROM members m JOIN projects p ON p.id = m.project JOIN accounts h ON h.id = p.owner WHERE m.project = ? AND m.account = ? AND h.closed IS NULL")
      .bind(project, account)
      .first<{ role: Role }>();
    return r?.role;
  }

  /** Whether an account may read a project and answer its cards: any member (B-r51ts). */
  async member(account: string, project: string): Promise<boolean> {
    return (await this.role(account, project)) !== undefined;
  }

  /** A project's members, each with its handle and role: the account that holds the project first, then in the order they joined. */
  async members(project: string): Promise<Member[]> {
    return (
      await this.db
        .prepare("SELECT m.account, a.handle, m.role, m.joined FROM members m JOIN accounts a ON a.id = m.account JOIN projects p ON p.id = m.project WHERE m.project = ? ORDER BY (m.account = p.owner) DESC, m.joined, a.handle")
        .bind(project)
        .all<Member>()
    ).results;
  }

  /**
   * The members a project's notifications may go to (B-tzdjn), each with its role: those whose own account is open, in a
   * project whose holder's is. Nobody, for a project that's closed with its holder's account (B-b46z3).
   */
  async toNotify(project: string): Promise<{ account: string; role: Role }[]> {
    return (
      await this.db
        .prepare(
          "SELECT m.account, m.role FROM members m JOIN accounts a ON a.id = m.account JOIN projects p ON p.id = m.project JOIN accounts h ON h.id = p.owner WHERE m.project = ? AND a.closed IS NULL AND h.closed IS NULL ORDER BY (m.account = p.owner) DESC, m.joined, m.account",
        )
        .bind(project)
        .all<{ account: string; role: Role }>()
    ).results;
  }

  /** Every project an account is a member of and doesn't hold, whoever holds it and whether or not it's closed: what leaves with the account. */
  async memberOnlyOf(account: string): Promise<string[]> {
    return (await this.db.prepare("SELECT m.project FROM members m JOIN projects p ON p.id = m.project WHERE m.account = ? AND p.owner != ? ORDER BY m.project").bind(account, account).all<{ project: string }>()).results.map((r) => r.project);
  }

  // ---------------------------------------------------------------- joining and leaving a project (P20, B-jsady, B-rxbss)

  /**
   * A link that adds one person to a project (B-jsady): its code, shown once, and when it stops working. Only the code's
   * hash is kept, with who made it. The caller checks that an owner is asking.
   */
  async invite(project: string, by: string): Promise<{ code: string; expires: string }> {
    const code = token();
    const now = this.now();
    const expires = this.later(LIMITS.inviteMs);
    await this.db.batch([
      this.db.prepare("DELETE FROM invites WHERE project = ? AND expires <= ?").bind(project, now),
      this.db.prepare("INSERT INTO invites (hash, project, created_by, created, expires) VALUES (?, ?, ?, ?, ?)").bind(hashOf(code), project, by, now, expires),
    ]);
    return { code, expires };
  }

  /** A project's links that still work: when each was made, by whom, and until when. Never a code: none is kept. */
  async invites(project: string): Promise<{ created: string; expires: string; by: string }[]> {
    return (
      await this.db
        .prepare("SELECT i.created, i.expires, a.handle AS by FROM invites i JOIN accounts a ON a.id = i.created_by WHERE i.project = ? AND i.used_by IS NULL AND i.expires > ? ORDER BY i.created")
        .bind(project, this.now())
        .all<{ created: string; expires: string; by: string }>()
    ).results;
  }

  /** Cancel a project's links that haven't been used. Returns how many there were. */
  async cancelInvites(project: string): Promise<number> {
    return (await this.db.prepare("DELETE FROM invites WHERE project = ? AND used_by IS NULL").bind(project).run()).meta.changes;
  }

  /** What a link is for, if it still works: the project, its name, and who made the link. */
  async lookInvite(code: string): Promise<{ project: string; name: string | null; by: string; expires: string } | undefined> {
    const r = await this.db
      .prepare("SELECT i.project, p.name, a.handle AS by, i.expires FROM invites i JOIN projects p ON p.id = i.project JOIN accounts a ON a.id = i.created_by JOIN accounts h ON h.id = p.owner WHERE i.hash = ? AND i.used_by IS NULL AND i.expires > ? AND h.closed IS NULL")
      .bind(hashOf(code), this.now())
      .first<{ project: string; name: string | null; by: string; expires: string }>();
    return r ?? undefined;
  }

  /**
   * Join a project by a link (B-jsady): the link is used up and the account becomes a member, both or neither. A link
   * works once, until it expires. Someone who's a member already uses nothing up.
   */
  async acceptInvite(code: string, account: string): Promise<{ project: string; name: string | null; joined: boolean } | { problem: string }> {
    const invite = await this.lookInvite(code);
    if (!invite) return { problem: "this link doesn't work: it was used already, it expired, or it was cancelled. Ask one of the project's owners for a new one" };
    if (await this.member(account, invite.project)) return { project: invite.project, name: invite.name, joined: false };
    const now = this.now();
    const hash = hashOf(code);
    const [used, added] = await this.db.batch([
      this.db.prepare("UPDATE invites SET used_by = ?, used = ? WHERE hash = ? AND used_by IS NULL AND expires > ?").bind(account, now, hash, now),
      // Only if this account used it up just now: two people opening one link at once can't both join.
      this.db.prepare("INSERT INTO members (project, account, role, joined, added_by) SELECT project, ?, 'member', ?, created_by FROM invites WHERE hash = ? AND used_by = ? AND used = ?").bind(account, now, hash, account, now),
    ]);
    if (!used?.meta.changes || !added?.meta.changes) return { problem: "this link was used a moment ago: ask one of the project's owners for a new one" };
    return { project: invite.project, name: invite.name, joined: true };
  }

  /**
   * Remove a member from a project, or leave it: the membership goes, and that account's machines are signed out of the
   * project, in one batch. The account that holds the project can't leave it or be removed. Returns whether a member went.
   */
  async removeMember(project: string, account: string): Promise<boolean | { problem: string }> {
    const p = await this.project(project);
    if (!p) return false;
    if (p.owner === account) return { problem: "the account that made a project holds it, and can't leave it or be removed: deleting that account deletes the project" };
    const now = this.now();
    const [gone] = await this.db.batch([
      this.db.prepare("DELETE FROM members WHERE project = ? AND account = ?").bind(project, account),
      this.db.prepare("UPDATE grants SET revoked = ? WHERE project = ? AND account = ? AND revoked IS NULL").bind(now, project, account),
    ]);
    return (gone?.meta.changes ?? 0) > 0;
  }

  /** Make a member an owner, or an owner a member (B-rxbss). The account that holds the project stays an owner. */
  async setRole(project: string, account: string, role: Role): Promise<boolean | { problem: string }> {
    const p = await this.project(project);
    if (!p) return false;
    if (p.owner === account && role !== "owner") return { problem: "the account that made a project holds it, and stays an owner" };
    return (await this.db.prepare("UPDATE members SET role = ? WHERE project = ? AND account = ?").bind(role, project, account).run()).meta.changes > 0;
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
   * A person approves a machine: the project is made for them if it's new, with the name they gave it (B-zqkwk), and
   * they become its first member, an owner; if it isn't new, they must be one of its members (P20). Returns whether the
   * project was new, or why not.
   */
  async approveDevice(d: DeviceCode, account: string, name?: string): Promise<{ created: boolean } | { problem: string }> {
    const p = await this.project(d.project);
    if (p && !(await this.member(account, d.project))) {
      return { problem: `project ${d.project} is someone else's, and you aren't a member of it: ask one of its owners for a link to join, then sign this machine in again; or link this repo again, as a new project` };
    }
    if (!p && !name) return { problem: "a new project needs a name" };
    const now = this.now();
    await this.db.batch([
      ...(p
        ? []
        : [
            this.db.prepare("INSERT INTO projects (id, owner, name, created) VALUES (?, ?, ?, ?)").bind(d.project, account, name, now),
            this.db.prepare("INSERT INTO members (project, account, role, joined) VALUES (?, ?, 'owner', ?)").bind(d.project, account, now),
          ]),
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

  // ---------------------------------------------------------------- deleting an account (M9f, B-b46z3)

  /**
   * Close an account (B-b46z3): from now, every sign-in is ended, every machine's grant revoked, every browser's
   * subscription to notifications removed, and its flows dropped, in one batch. The projects it holds close with it, for
   * every member (P20): their machines are signed out of those projects too, and nobody has a role there (`Accounts.role`)
   * until the account is restored. Returns whether it was open.
   */
  async close(account: string): Promise<boolean> {
    const now = this.now();
    const [closed] = await this.db.batch([
      this.db.prepare("UPDATE accounts SET closed = ? WHERE id = ? AND closed IS NULL").bind(now, account),
      this.db.prepare("DELETE FROM sessions WHERE account = ?").bind(account),
      this.db.prepare("UPDATE grants SET revoked = ? WHERE (account = ? OR project IN (SELECT id FROM projects WHERE owner = ?)) AND revoked IS NULL").bind(now, account, account),
      this.db.prepare("DELETE FROM push_subscriptions WHERE account = ?").bind(account),
      this.db.prepare("DELETE FROM flows WHERE account = ?").bind(account),
    ]);
    return (closed?.meta.changes ?? 0) > 0;
  }

  /** Open a closed account again (B-b46z3: within 14 days, with its passkey). Returns whether it was closed. */
  async reopen(account: string): Promise<boolean> {
    return (await this.db.prepare("UPDATE accounts SET closed = NULL WHERE id = ? AND closed IS NOT NULL").bind(account).run()).meta.changes > 0;
  }

  /** The accounts closed at or before a time, oldest first: those whose 14 days are over. */
  async closedBefore(time: string): Promise<string[]> {
    return (await this.db.prepare("SELECT id FROM accounts WHERE closed IS NOT NULL AND closed <= ? ORDER BY closed").bind(time).all<{ id: string }>()).results.map((r) => r.id);
  }

  /**
   * Delete an account and every row under it, in one batch (B-b46z3): its raw usage events, its flows (and those for
   * its addresses), its machines' grants and spent refresh tokens, device codes it approved or for its projects, its
   * browsers' subscriptions, sign-ins, Globus identity, recovery code, passkeys, email addresses, its memberships and the
   * links it made (P20), the projects it holds with their members and links, and itself.
   * Each table is named rather than left to the cascades, so nothing rests on the database enforcing them. Daily usage
   * totals (`usage_daily`) name no one, and stay. The projects' relay data is the caller's to erase first.
   */
  async erase(account: string): Promise<void> {
    const owned = "SELECT id FROM projects WHERE owner = ?";
    await this.db.batch([
      this.db.prepare("DELETE FROM usage_events WHERE usage_id IS NOT NULL AND usage_id = (SELECT usage_id FROM accounts WHERE id = ?)").bind(account),
      this.db.prepare("DELETE FROM flows WHERE account = ? OR email IN (SELECT address FROM emails WHERE account = ?)").bind(account, account),
      this.db.prepare(`DELETE FROM spent_tokens WHERE grant_id IN (SELECT id FROM grants WHERE account = ? OR project IN (${owned}))`).bind(account, account),
      this.db.prepare(`DELETE FROM grants WHERE account = ? OR project IN (${owned})`).bind(account, account),
      this.db.prepare(`DELETE FROM device_codes WHERE approved_by = ? OR project IN (${owned})`).bind(account, account),
      this.db.prepare("DELETE FROM push_subscriptions WHERE account = ?").bind(account),
      this.db.prepare("DELETE FROM sessions WHERE account = ?").bind(account),
      this.db.prepare("DELETE FROM globus_identities WHERE account = ?").bind(account),
      this.db.prepare("DELETE FROM recovery_codes WHERE account = ?").bind(account),
      this.db.prepare("DELETE FROM passkeys WHERE account = ?").bind(account),
      this.db.prepare("DELETE FROM emails WHERE account = ?").bind(account),
      this.db.prepare(`DELETE FROM invites WHERE created_by = ? OR project IN (${owned})`).bind(account, account),
      this.db.prepare(`DELETE FROM members WHERE account = ? OR project IN (${owned})`).bind(account, account),
      // The members of projects it didn't make who joined by its link stay; that it was its link is forgotten.
      this.db.prepare("UPDATE members SET added_by = NULL WHERE added_by = ?").bind(account),
      this.db.prepare("DELETE FROM projects WHERE owner = ?").bind(account),
      this.db.prepare("DELETE FROM accounts WHERE id = ?").bind(account),
    ]);
  }

  /**
   * Rows whose time is over, cleared once a day: sign-ins ended (90 days in all, or 30 unused), machines' grants signed
   * out or lapsed more than a day ago (their spent tokens with them), and flows and device codes expired a day ago.
   */
  async clearEnded(): Promise<void> {
    const dayAgo = this.ago(DAY);
    await this.db.batch([
      this.db.prepare("DELETE FROM sessions WHERE expires <= ? OR last_used <= ?").bind(this.now(), this.ago(LIMITS.sessionIdleMs)),
      this.db.prepare("DELETE FROM spent_tokens WHERE grant_id IN (SELECT id FROM grants WHERE revoked <= ? OR last_used <= ?)").bind(dayAgo, this.ago(LIMITS.grantIdleMs + DAY)),
      this.db.prepare("DELETE FROM grants WHERE revoked <= ? OR last_used <= ?").bind(dayAgo, this.ago(LIMITS.grantIdleMs + DAY)),
      this.db.prepare("DELETE FROM flows WHERE expires <= ?").bind(dayAgo),
      this.db.prepare("DELETE FROM device_codes WHERE expires <= ?").bind(dayAgo),
      // A link to a project (P20, B-jsady) that was used, or that expired, a day ago: nothing more rests on it.
      this.db.prepare("DELETE FROM invites WHERE expires <= ? OR used <= ?").bind(dayAgo, dayAgo),
    ]);
  }

  /** An account's machines: grants not revoked or lapsed, newest use first. */
  async grants(account: string): Promise<Grant[]> {
    return (await this.db.prepare("SELECT * FROM grants WHERE account = ? AND revoked IS NULL AND last_used > ? ORDER BY last_used DESC").bind(account, this.ago(LIMITS.grantIdleMs)).all<Grant>()).results;
  }
}
