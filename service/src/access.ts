import { AccountId, ProjectId } from "../../src/schema.js";
import { type Accounts, LIMITS, type Session } from "./accounts.js";
import { same } from "./secret.js";

// Who may do what on the service (Hosted Service section 3). A person signs in in a browser and holds a session cookie;
// a machine holds a grant's bearer token (B-84e0d). `accountAccess()` reads both from the accounts database (M9c). The
// stand-in for sign-in from M9b, fixed tokens and cookies, still runs beside it, locally and in the tests only.

/**
 * Who's asking. Each machine grant is for one project (B-84e0d); a session is a person's, and is for the project an
 * address names only if their account may answer there.
 * - a **session**: a person signed in in a browser, with a cookie made by a passkey sign-in. Only a session answers.
 * - a **machine**: a grant made by `baesian login` on one machine, sent as a bearer token. It files and hears; it never answers.
 */
export type Principal =
  | { kind: "session"; account: string; handle: string; project: string | undefined; session?: Session }
  | { kind: "machine"; machine: string; account: string; project: string; grant?: string };

/** What sign-in gives the relay: who a request is from, or nobody. */
export interface Access {
  /** A name for what's in use, for messages. */
  readonly name: string;
  /** Who a request is from; for a session, whether it may answer in `project`, the project the address names. */
  identify(request: Request, project?: string): Promise<Principal | undefined>;
}

/** The session cookie (Hosted Service section 3): `__Host-`, so it's Secure, host-only and for the whole site. */
export const SESSION_COOKIE = "__Host-baesian-session";

/**
 * The session cookie's header (Hosted Service section 3, B-vtr1r): Secure, HttpOnly, SameSite=Strict so no other site's
 * page sends it, for the whole site, and gone after 90 days whatever happens; the service ends it sooner after 30 days unused.
 */
export const sessionCookie = (value: string): string => `${SESSION_COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(LIMITS.sessionMaxMs / 1000)}`;

/** A cookie's header that removes it. */
export const clearCookie = (name: string): string => `${name}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;

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

/**
 * Why a browser's request may come from another site, or nothing (Hosted Service section 3). SameSite keeps the cookie
 * off other sites' requests in today's browsers; this refuses them outright, as the fetch metadata and `Origin` say.
 * A request that changes something must name the site's own origin; one that only reads may also come with no
 * `Origin` (a navigation, or a tool such as curl), but never from another site.
 */
export function crossSite(request: Request, origin: string): string | undefined {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") return `a request from another site (${site}) is refused: the website's own pages call the service`;
  const from = request.headers.get("origin");
  if (from !== null && from !== origin) return `a request from ${from} is refused: only ${origin}'s own pages call the service`;
  const reads = request.method === "GET" || request.method === "HEAD";
  if (!reads && from === null) return `a request that changes something must say where it's from (Origin: ${origin})`;
  return undefined;
}

/** No sign-in at all: nobody is anyone, so every request is refused. What the relay has with no accounts database. */
export const NO_ACCESS: Access = {
  name: "none",
  async identify() {
    return undefined;
  },
};

/**
 * Sign-in from the accounts database (M9c): a bearer token is a machine's grant if its access token is good (B-84e0d);
 * otherwise the session cookie is a person's sign-in if it's good (B-vtr1r). With an `Authorization` header, only the
 * header counts, so a machine's request never passes as a person's.
 */
export function accountAccess(accounts: Accounts): Access {
  return {
    name: "sign-in",
    async identify(request, project) {
      if (request.headers.has("authorization")) {
        const t = bearer(request);
        const g = t ? await accounts.grantByAccess(t) : undefined;
        return g && { kind: "machine", machine: g.machine, account: g.account, project: g.project, grant: g.id };
      }
      const s = await accounts.session(cookie(request, SESSION_COOKIE));
      if (!s) return undefined;
      const member = project !== undefined && (await accounts.member(s.account, project));
      return { kind: "session", account: s.account, handle: s.handle, project: member ? project : undefined, session: s };
    },
  };
}

/** The first of several ways in that knows who's asking. */
export function eitherOf(...ways: Access[]): Access {
  return {
    name: ways.map((w) => w.name).join(", or "),
    async identify(request, project) {
      for (const w of ways) {
        const who = await w.identify(request, project);
        if (who) return who;
      }
      return undefined;
    },
  };
}

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
 * The stand-in for sign-in: a bearer token names a machine, the session cookie a person, each for one project. With an
 * `Authorization` header, only the header counts.
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

/** Whether the service runs locally or in tests: only then may the stand-in run. Unset means production. */
export const isLocal = (env: AccessEnv) => env.BAESIAN_ENV === "development" || env.BAESIAN_ENV === "test";

/**
 * The service's sign-in: the accounts database's (`accountAccess()`), and, only locally or in the tests with grants
 * given, the stand-in beside it. With no accounts database, nobody is anyone (`NO_ACCESS`), but the stand-in's.
 */
export function accessFor(env: AccessEnv, accounts?: Accounts): Access {
  const real = accounts ? accountAccess(accounts) : undefined;
  const dev = isLocal(env) && env.BAESIAN_DEV_ACCESS ? devAccess(readGrants(env.BAESIAN_DEV_ACCESS)) : undefined;
  if (real && dev) return eitherOf(dev, real);
  return real ?? dev ?? NO_ACCESS;
}
