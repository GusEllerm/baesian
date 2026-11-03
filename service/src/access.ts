import { AccountId, ProjectId } from "../../src/schema.js";

// Who may do what on the relay (Hosted Service section 3), before sign-in exists. Accounts, sessions and machine grants
// are M9c's: it implements `Access`. Until then, `accessFor()` gives a stand-in that exists only for local development
// and the tests, and in production a relay that refuses everything.

/**
 * Who's asking, as sign-in says (M9c). Each session and each machine grant is for one project (P15 section 3).
 * - a **session**: a person signed in in a browser, with a cookie made by a passkey sign-in. Only a session answers.
 * - a **machine**: a grant made by `baesian login` on one machine, sent as a bearer token. It files and hears; it never answers.
 */
export type Principal =
  | { kind: "session"; account: string; handle: string; project: string }
  | { kind: "machine"; machine: string; account: string; project: string };

/** What sign-in gives the relay: who a request is from, or nobody. M9c implements it. */
export interface Access {
  /** A name for what's in use, for messages: "M9c", "the stand-in", "none". */
  readonly name: string;
  identify(request: Request): Promise<Principal | undefined>;
}

/** The session cookie (P15 section 3): `__Host-`, so it's Secure, host-only and for the whole site. */
export const SESSION_COOKIE = "__Host-baesian-session";

/** The bearer token in an `Authorization` header, if there is one. */
export function bearer(request: Request): string | undefined {
  const h = request.headers.get("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7).trim() : undefined;
}

/** A cookie's value, by name. */
export function cookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

/** Two secrets compared in time that doesn't depend on where they differ. */
function same(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i]! ^ y[i]!;
  return d === 0;
}

/** No sign-in: nobody is anyone, so every request is refused. Production's, until M9c. */
export const NO_ACCESS: Access = {
  name: "none",
  async identify() {
    return undefined;
  },
};

/**
 * The stand-in's grants, from `BAESIAN_DEV_ACCESS` (local development and tests only): fixed machine tokens and session
 * cookies, each for one project. Never a production secret: production refuses the stand-in whatever it's given.
 */
export interface DevGrants {
  machines: { token: string; machine: string; account: string; project: string }[];
  sessions: { cookie: string; account: string; handle: string; project: string }[];
}

/** The stand-in's grants from their JSON, checked: a secret of 16 characters or more, and IDs as the formats take them. */
export function readGrants(json: string): DevGrants {
  const raw = JSON.parse(json) as Partial<DevGrants>;
  const text = (v: unknown, min = 1) => typeof v === "string" && v.length >= min;
  const ids = (g: { account: unknown; project: unknown }) => AccountId.safeParse(g.account).success && ProjectId.safeParse(g.project).success;
  const machines = raw.machines ?? [];
  const sessions = raw.sessions ?? [];
  if (!Array.isArray(machines) || !machines.every((g) => text(g.token, 16) && text(g.machine) && ids(g))) throw new Error("BAESIAN_DEV_ACCESS: each machine needs a token of 16 characters or more, a machine, an account and a project");
  if (!Array.isArray(sessions) || !sessions.every((g) => text(g.cookie, 16) && text(g.handle) && ids(g))) throw new Error("BAESIAN_DEV_ACCESS: each session needs a cookie of 16 characters or more, an account, a handle and a project");
  return { machines, sessions };
}

/**
 * The stand-in for sign-in: a bearer token names a machine, the session cookie a person. With an `Authorization` header,
 * only the header counts, so a machine's request never passes as a person's.
 */
export function devAccess(grants: DevGrants): Access {
  return {
    name: "the stand-in for sign-in (local development and tests only)",
    async identify(request) {
      if (request.headers.has("authorization")) {
        const token = bearer(request);
        const m = token === undefined ? undefined : grants.machines.find((g) => same(g.token, token));
        return m && { kind: "machine", machine: m.machine, account: m.account, project: m.project };
      }
      const value = cookie(request, SESSION_COOKIE);
      const s = value === undefined ? undefined : grants.sessions.find((g) => same(g.cookie, value));
      return s && { kind: "session", account: s.account, handle: s.handle, project: s.project };
    },
  };
}

export interface AccessEnv {
  /** "development" or "test" allow the stand-in; anything else, or nothing, is production. */
  BAESIAN_ENV?: string;
  /** The stand-in's grants, as JSON (`DevGrants`). */
  BAESIAN_DEV_ACCESS?: string;
}

/** Whether this relay runs locally or in tests: only then may the stand-in run. Unset means production. */
export const isLocal = (env: AccessEnv) => env.BAESIAN_ENV === "development" || env.BAESIAN_ENV === "test";

/**
 * The relay's sign-in. Until M9c builds the real one, production refuses everything (`NO_ACCESS`), and only a local run
 * or the tests, with grants given, get the stand-in.
 */
export function accessFor(env: AccessEnv): Access {
  if (!isLocal(env) || !env.BAESIAN_DEV_ACCESS) return NO_ACCESS;
  return devAccess(readGrants(env.BAESIAN_DEV_ACCESS));
}
