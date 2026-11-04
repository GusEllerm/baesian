import { env } from "cloudflare:workers";
import { randomBytes } from "node:crypto";
import { expect } from "vitest";
import { SESSION_COOKIE } from "../src/access.js";
import { type Env, type Services, handleRequest } from "../src/index.js";
import type { Mail, Mailer } from "../src/mail.js";
import { BASE } from "./client.js";
import { WebPasskey } from "./passkeys.js";

// A browser on the website (M9e's pages, stood in for): it keeps its cookies, names the site's origin as a page's fetch
// does, and has a network address of its own, so limits per address don't run across tests. Requests go to the Worker
// with a mailer the tests can read (the codes), and a fetch that reaches a stand-in for Globus instead of the network.

export const ORIGIN = env.SERVICE_ORIGIN;

/** Every email the service sent, newest last. */
export class Outbox implements Mailer {
  readonly sent: Mail[] = [];
  async send(mail: Mail): Promise<void> {
    this.sent.push(mail);
  }
  /** The newest email to an address, of a kind. */
  last(to: string, kind?: Mail["kind"]): Mail | undefined {
    return this.sent.filter((m) => m.to === to && (!kind || m.kind === kind)).at(-1);
  }
}

export const outbox = new Outbox();

/** What the Worker is given in the tests: the outbox, and anything else a test stands in for. */
export const services: Partial<Services> = { mail: outbox };

const uniq = () => randomBytes(5).toString("hex");
export const freshEmail = () => `person-${uniq()}@example.test`;
export const freshHandle = () => `p-${uniq()}`;

export class Browser {
  readonly cookies = new Map<string, string>();
  readonly address = `10.${[0, 0, 0].map(() => Math.floor(Math.random() * 250)).join(".")}`;
  readonly userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15";

  /** A request as the website's page makes it: its cookies, its origin, its address. `headers` adds or replaces any. */
  async request(method: string, path: string, opts: { json?: unknown; headers?: Record<string, string>; body?: string } = {}): Promise<Response> {
    const headers: Record<string, string> = {
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
      "cf-connecting-ip": this.address,
      "user-agent": this.userAgent,
      ...(this.cookies.size ? { cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
      ...(opts.json !== undefined ? { "content-type": "application/json" } : {}),
      ...opts.headers,
    };
    for (const [k, v] of Object.entries(headers)) if (v === "") delete headers[k];
    const body = opts.json !== undefined ? JSON.stringify(opts.json) : opts.body;
    const r = await handleRequest(new Request(path.startsWith("http") ? path : `${BASE}${path}`, { method, headers, redirect: "manual", ...(body !== undefined ? { body } : {}) }), env as unknown as Env, services);
    for (const c of r.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(";");
      const [k, ...v] = pair!.split("=");
      if (attrs.some((a) => /max-age=0/i.test(a.trim()))) this.cookies.delete(k!.trim());
      else this.cookies.set(k!.trim(), v.join("="));
    }
    return r;
  }

  async post(path: string, json: unknown = {}, headers: Record<string, string> = {}): Promise<{ status: number; body: Record<string, any>; response: Response }> {
    const response = await this.request("POST", path, { json, headers });
    return { status: response.status, body: response.status === 204 || response.status === 200 && response.headers.get("content-length") === "0" ? {} : ((await response.json().catch(() => ({}))) as Record<string, any>), response };
  }

  async get(path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: Record<string, any>; response: Response }> {
    const response = await this.request("GET", path, { headers });
    return { status: response.status, body: response.status >= 300 && response.status < 400 ? {} : ((await response.json().catch(() => ({}))) as Record<string, any>), response };
  }

  async del(path: string): Promise<{ status: number; body: Record<string, any> }> {
    const response = await this.request("DELETE", path);
    return { status: response.status, body: response.status === 204 ? {} : ((await response.json().catch(() => ({}))) as Record<string, any>) };
  }

  get session(): string | undefined {
    return this.cookies.get(SESSION_COOKIE);
  }
}

/** Turnstile's token as the widget gives it with Cloudflare's test site key. */
export const TURNSTILE = "XXXX.DUMMY.TOKEN.XXXX";

/** Someone who signed up, with the passkey they enrolled and the recovery code they saved. */
export interface Person {
  browser: Browser;
  passkey: WebPasskey;
  email: string;
  handle: string;
  account: string;
  recovery: string;
  /** The line to pin in CI for this passkey (D159). */
  pin: string;
}

/** Sign up through the website: an email, its code, a handle, a passkey. */
export async function signUp(over: { email?: string; handle?: string; alg?: -7 | -8 | -257 } = {}): Promise<Person> {
  const browser = new Browser();
  const email = over.email ?? freshEmail();
  const handle = over.handle ?? freshHandle();
  const sent = await browser.post("/v1/signup/email", { email, turnstile: TURNSTILE });
  expect(sent.status, JSON.stringify(sent.body)).toBe(202);
  const code = outbox.last(email, "signup-code")!.code!;
  const verified = await browser.post("/v1/signup/verify", { flow: sent.body.flow, code, handle });
  expect(verified.status, JSON.stringify(verified.body)).toBe(200);
  const passkey = new WebPasskey("-", handle, over.alg ?? -7);
  const done = await browser.post("/v1/signup/finish", { flow: sent.body.flow, response: passkey.register(verified.body.options.challenge) });
  expect(done.status, JSON.stringify(done.body)).toBe(201);
  return { browser, passkey, email, handle, account: done.body.account.id, recovery: done.body.recovery_code, pin: done.body.passkey.pin };
}

/** Sign in with a passkey, in a browser of its own. */
export async function signIn(passkey: WebPasskey, browser = new Browser()): Promise<Browser> {
  const start = await browser.post("/v1/signin/start");
  const done = await browser.post("/v1/signin/finish", { flow: start.body.flow, response: passkey.sign(start.body.options.challenge) });
  expect(done.status, JSON.stringify(done.body)).toBe(200);
  return browser;
}

/** Check the passkey afresh in a signed-in browser, for what asks for it (adding a passkey, approving a machine). */
export async function reauth(p: { browser: Browser; passkey: WebPasskey }): Promise<void> {
  const start = await p.browser.post("/v1/account/reauth/start");
  const done = await p.browser.post("/v1/account/reauth/finish", { flow: start.body.flow, response: p.passkey.sign(start.body.options.challenge) });
  expect(done.status, JSON.stringify(done.body)).toBe(200);
}

/** A form, as the CLI sends OAuth's requests (B-t5wxr). */
export async function oauth(path: string, fields: Record<string, string>, address = `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`): Promise<{ status: number; body: Record<string, any> }> {
  const r = await handleRequest(new Request(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": address }, body: new URLSearchParams(fields).toString() }), env as unknown as Env, services);
  return { status: r.status, body: r.status === 200 && path.endsWith("revoke") ? {} : ((await r.json().catch(() => ({}))) as Record<string, any>) };
}

/** A machine signs in to a project through `baesian login`'s device flow, and the person approves it; returns its tokens. */
export async function machineLogin(p: Person, project: string, machine = "laptop"): Promise<{ access: string; refresh: string; grant: string }> {
  const d = await oauth("/v1/machines/device", { client_id: "baesian-cli", project, machine });
  expect(d.status, JSON.stringify(d.body)).toBe(200);
  await reauth(p);
  const ok = await p.browser.post("/v1/account/machines/approve", { code: d.body.user_code, approve: true });
  expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  const t = await oauth("/v1/machines/token", { client_id: "baesian-cli", grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: d.body.device_code });
  expect(t.status, JSON.stringify(t.body)).toBe(200);
  return { access: t.body.access_token, refresh: t.body.refresh_token, grant: t.body.grant };
}
