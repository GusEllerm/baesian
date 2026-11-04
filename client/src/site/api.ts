import { useCallback, useEffect, useState } from "react";
import { type RequestOptionsJSON, signWithPasskey } from "../webauthn";

// The service's account addresses (M9c, docs/vault/Modules/service.md), as the website's pages call them: JSON, with
// the browser's cookie, from the site's own origin. Every error the service gives says what went wrong; the pages show it.

/** The service refused: its status, its words, and the rest of what it said (`attempts_left`, `reauth`, `needs_name`). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** One call to the service. Resolves with its JSON (or nothing, for 204); rejects with `ApiError`. */
export async function call<T = Record<string, unknown>>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "content-type": "application/json" } : {},
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError("the service couldn't be reached: check your connection, then try again", 0, {});
  }
  if (r.status === 204) return undefined as T;
  const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new ApiError(typeof json.error === "string" ? json.error : `the service answered ${r.status}`, r.status, json);
  return json as T;
}

/** What `GET /v1/config` gives: Turnstile's site key, and whether Globus is on. */
export interface SiteConfig {
  origin: string;
  rp_id: string;
  turnstile_site_key: string;
  globus: boolean;
}

let config: Promise<SiteConfig> | undefined;
export const siteConfig = () => (config ??= call<SiteConfig>("GET", "/v1/config").catch((e) => {
  config = undefined;
  throw e;
}));

export function useConfig(): SiteConfig | undefined {
  const [c, setC] = useState<SiteConfig>();
  useEffect(() => {
    siteConfig().then(setC, () => {});
  }, []);
  return c;
}

/** A passkey of yours, as the account lists it. */
export interface Passkey {
  credential: string;
  name: string;
  pin: string;
  enrolled: string;
  last_used: string | null;
}

/** A project of yours (B-zqkwk: its name is kept with it). */
export interface Project {
  id: string;
  name: string | null;
  created: string;
}

/** `GET /v1/account`. */
export interface Account {
  id: string;
  handle: string;
  created: string;
  emails: { address: string; verified: string | null }[];
  passkeys: Passkey[];
  globus: { linked: string } | null;
  projects: Project[];
  fresh_until: string;
}

export type Me = { kind: "loading" } | { kind: "signed-out" } | { kind: "error"; message: string } | { kind: "in"; account: Account };

/** The signed-in account, or that nobody is; `reload` reads it again. */
export function useMe(): Me & { reload: () => Promise<void> } {
  const [me, setMe] = useState<Me>({ kind: "loading" });
  const reload = useCallback(async () => {
    try {
      setMe({ kind: "in", account: await call<Account>("GET", "/v1/account") });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setMe({ kind: "signed-out" });
      else setMe({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { ...me, reload };
}

/** Check your passkey afresh (M9c): what adds a way in, or approves a machine, asks for a check in the last 5 minutes. */
export async function reauth(): Promise<void> {
  const start = await call<{ flow: string; options: RequestOptionsJSON }>("POST", "/v1/account/reauth/start", {});
  await call("POST", "/v1/account/reauth/finish", { flow: start.flow, response: await signWithPasskey(start.options) });
}

/** Run something that may need a fresh passkey check: if the service says so (403, `reauth`), check, then run it again. */
export async function fresh<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (!(e instanceof ApiError && e.body.reauth === true)) throw e;
  }
  await reauth();
  return run();
}

/** A date, as the pages say it: "4 Nov 2026". */
export const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "never");

/** How long ago, roughly: "today", "yesterday", "3 days ago", or the date. */
export function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return days < 30 ? `${days} days ago` : day(iso);
}

/** A project's name, or what to call it until it has one. */
export const projectName = (p: { name: string | null }) => p.name ?? "Unnamed project";
