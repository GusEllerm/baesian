import { generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { type BrowserContext, type CDPSession, type Page, expect } from "@playwright/test";
import { GlobusStandIn, ISSUER } from "../service/test/globus-issuer.js";
import { type D1Like, applyMigrations } from "../test/relay-harness.js";

// The website (M9e), run locally for the browser tests: the service's own Worker from service/wrangler.jsonc, started in
// workerd by Wrangler's `unstable_startWorker`, serving the site's build (dist/site/) as its assets and every /v1/ address
// as the service. Its origin is http://localhost:<port>, which browsers treat as secure, so passkeys and the `__Host-`
// cookie work. Nothing reaches a network: Turnstile's test keys are answered locally, its script is a stand-in served by
// the test (`standInTurnstile()`), Globus is the service's tests' stand-in, reached by the Worker through Wrangler's
// outbound service and by the browser through a route, and emails are read from where the local runtime saves them.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = join(ROOT, "service");
const WRANGLER = join(SERVICE, "node_modules", "wrangler", "wrangler-dist", "cli.js");
export const SITE_BUILD = join(ROOT, "dist", "site");

/** Whether the website can run here: the service's packages, and the site's build (`npm run build`). */
export const siteAvailable = existsSync(WRANGLER) && existsSync(join(SITE_BUILD, "index.html"));

/** A port nobody's using, for the site's origin, which the Worker must know before it starts. */
async function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const s = createServer();
    s.once("error", fail);
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => done(port));
    });
  });
}

/** A push the Worker sent to the stand-in push service, as it arrived: still encrypted. */
export interface SentPush {
  endpoint: string;
  headers: Record<string, string>;
  body: Uint8Array;
}

export interface LocalSite {
  /** http://localhost:<port> */
  url: string;
  db: D1Like;
  globus: GlobusStandIn;
  /** Every push the Worker sent, to the stand-in push service at https://push.test (M9e step 2). */
  pushes: SentPush[];
  /** What the stand-in push service answers for an endpoint from now on (201 unless told: 404 or 410 for one that's gone). */
  pushAnswer: Map<string, number>;
  /** The newest email the service sent with this text in it, after `since` (ms), waiting for it to be saved. */
  email(contains: string, since: number): Promise<string>;
  dispose(): Promise<void>;
}

export async function startSite(): Promise<LocalSite> {
  process.env.WRANGLER_SEND_METRICS = "false";
  const { unstable_startWorker } = (await import(pathToFileURL(WRANGLER).href)) as { unstable_startWorker: (o: unknown) => Promise<any> };
  const port = await freePort();
  const url = `http://localhost:${port}`;
  const persist = mkdtempSync(join(tmpdir(), "baesian-site-"));
  const secret = randomBytes(24).toString("base64url");
  const globus = new GlobusStandIn("baesian-site-test", secret);
  const pushes: SentPush[] = [];
  const pushAnswer = new Map<string, number>();
  const plain = (value: string) => ({ type: "plain_text", value });
  const worker = await unstable_startWorker({
    config: join(SERVICE, "wrangler.jsonc"),
    bindings: {
      BAESIAN_ENV: plain("test"),
      SERVICE_ORIGIN: plain(url),
      SERVICE_RP_ID: plain("localhost"),
      SERVICE_SIGNING_KEY: { type: "secret_text", value: generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }) as string },
      TURNSTILE_SECRET: { type: "secret_text", value: ["1x", "0".repeat(31), "AA"].join("") },
      GLOBUS_ISSUER: plain(ISSUER),
      GLOBUS_CLIENT_ID: plain(globus.clientId),
      GLOBUS_CLIENT_SECRET: { type: "secret_text", value: secret },
      // Web push's VAPID key (B-nk97q), made for this run.
      VAPID_KEY: { type: "secret_text", value: JSON.stringify(generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ format: "jwk" })) },
      // Every test signs in from one address: the limits per address and per email are raised for them.
      LIMIT_ADDRESS: { type: "ratelimit", namespace_id: "1001", simple: { limit: 10_000, period: 60 } },
      LIMIT_EMAIL: { type: "ratelimit", namespace_id: "1002", simple: { limit: 10_000, period: 60 } },
    },
    dev: {
      persist,
      server: { hostname: "localhost", port },
      inspector: false,
      watch: false,
      logLevel: "none",
      // The Worker's own requests go nowhere but the stand-ins: a push service at https://push.test, which keeps what it's
      // sent, and Globus, which refuses anything else. The local runtime's request is its own kind, so it's read across
      // into this one's.
      outboundService: async (request: Request) => {
        if (new URL(request.url).host === "push.test") {
          pushes.push({ endpoint: request.url, headers: Object.fromEntries(request.headers), body: new Uint8Array(await request.arrayBuffer()) });
          return new Response(null, { status: pushAnswer.get(request.url) ?? 201 });
        }
        const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();
        try {
          return await globus.fetch(request.url, { method: request.method, headers: Object.fromEntries(request.headers), ...(body !== undefined ? { body } : {}) });
        } catch (e) {
          return new Response(e instanceof Error ? e.message : String(e), { status: 502 });
        }
      },
    },
  });
  await worker.ready;
  let mf: { getD1Database(name: string): Promise<unknown> } | undefined;
  for (let i = 0; i < 100 && !mf; i++) {
    mf = (worker.raw.runtimes as { mf?: typeof mf }[]).find((r) => r.mf)?.mf;
    if (!mf) await new Promise((done) => setTimeout(done, 100));
  }
  if (!mf) throw new Error("the site's local runtime didn't start");
  const db = (await mf.getD1Database("ACCOUNTS")) as D1Like;
  await applyMigrations(db);
  // Each email is read once: two tests in a row may each ask for a code.
  const read = new Set<string>();
  return {
    url,
    db,
    globus,
    pushes,
    pushAnswer,
    async email(contains, since) {
      for (let i = 0; i < 100; i++) {
        const found = emailsSince(since).find((e) => !read.has(e.path) && e.text.includes(contains) && e.text.includes(url));
        if (found) {
          read.add(found.path);
          return found.text;
        }
        await new Promise((done) => setTimeout(done, 100));
      }
      throw new Error(`no email with “${contains}” from ${url}`);
    },
    async dispose() {
      await worker.dispose();
      rmSync(persist, { recursive: true, force: true });
    },
  };
}

/** Where the local runtime saves the emails it would send (Email Sending, simulated): their text, newest last. */
function emailsSince(since: number): { path: string; text: string }[] {
  const roots = [join(SERVICE, ".wrangler", "tmp"), join(ROOT, ".wrangler", "tmp")].filter(existsSync);
  const out: { at: number; path: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else if (name.endsWith(".txt") && p.includes("email") && s.mtimeMs >= since - 50) out.push({ at: s.mtimeMs, path: p, text: readFileSync(p, "utf8") });
    }
  };
  for (const r of roots) walk(r);
  return out.sort((a, b) => b.at - a.at);
}

/** The code in an email: the line of six digits, or the recovery code's. */
export const codeIn = (text: string) => /^\s*(\d{6})\s*$/m.exec(text)?.[1] ?? "";

/**
 * Turnstile in the browser, stood in for: the page's request for Cloudflare's script gets a small one that renders a box
 * and gives Cloudflare's published dummy token, as the test site key does, so no request leaves the machine.
 */
export async function standInTurnstile(context: BrowserContext | Page): Promise<void> {
  await context.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `window.turnstile = {
        render(el, o) {
          const box = document.createElement("div");
          box.className = "turnstile-stand-in";
          box.textContent = "Bot check passed (test)";
          box.style.cssText = "height:65px;display:flex;align-items:center;padding:0 16px;border:1px solid #d9c68e;border-radius:6px;background:#fafafa;font:500 14px system-ui";
          el.append(box);
          setTimeout(() => o.callback("XXXX.DUMMY.TOKEN.XXXX"), 50);
          return "w1";
        },
        reset() {},
        remove() {},
      };`,
    }),
  );
}

/**
 * The browser's sign-in at Globus, stood in for. Chromium won't let a test route a hop the service redirects to another
 * site, so the service's own redirect is caught instead: the request to `/v1/globus/start` goes to the Worker as it is,
 * and where it sends the browser, Globus's page, is answered as Globus would once you'd signed in there, by sending the
 * browser back to the callback, with the round trip's cookie the Worker set.
 */
export async function standInGlobus(context: BrowserContext | Page, site: LocalSite, who: { sub: string; email?: string }): Promise<void> {
  await context.route(/\/v1\/globus\/start/, async (route) => {
    const r = await route.fetch({ maxRedirects: 0 });
    const to = r.headers().location;
    if (r.status() !== 302 || !to?.startsWith(ISSUER)) return route.fulfill({ response: r });
    const headers: Record<string, string> = { location: site.globus.authorize(to, who), "cache-control": "no-store" };
    const cookie = r.headersArray().find((h) => h.name.toLowerCase() === "set-cookie");
    if (cookie) headers["set-cookie"] = cookie.value;
    await route.fulfill({ status: 302, headers });
  });
}

/**
 * A passkey authenticator in the browser: Chromium's virtual one through the DevTools protocol, with user verification,
 * which keeps its credentials (discoverable) and answers at once. Returns the session, to read or remove them.
 */
export async function virtualAuthenticator(page: Page): Promise<{ cdp: CDPSession; id: string }> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  return { cdp, id: authenticatorId };
}

/** Sign up through the website's pages, as a person does: email, code, handle, passkey. Returns the handle and the email. */
export async function signUpOnPage(page: Page, site: LocalSite, who: { email: string; handle: string }): Promise<{ recovery: string; pin: string }> {
  await page.goto(`${site.url}/sign-up`);
  await page.getByLabel("Email address").fill(who.email);
  const since = Date.now();
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.getByLabel("The code from the email").fill(codeIn(await site.email("finish signing up", since)));
  await page.getByRole("textbox", { name: /^Your handle/ }).fill(who.handle);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Make a passkey" }).click();
  await expect(page.getByRole("heading", { name: "Save your recovery code" })).toBeVisible();
  const recovery = (await page.getByLabel("Your recovery code", { exact: true }).textContent())!;
  const pin = (await page.getByLabel("Your passkey's line for CI", { exact: true }).textContent())!;
  await page.getByLabel("I've saved my recovery code").check();
  await page.getByRole("button", { name: "Go to your projects" }).click();
  await expect(page.getByRole("heading", { name: "Your projects" })).toBeVisible();
  return { recovery, pin };
}

let n = 0;
/** A fresh person to sign up as. */
export const somebody = () => {
  n += 1;
  const tag = `${Date.now().toString(36)}${n}${randomBytes(2).toString("hex")}`;
  return { email: `p-${tag}@example.test`, handle: `p-${tag}` };
};

// ---------------------------------------------------------------- the CLI beside the website (M9d)

/** Run the CLI in a repo, as an agent's machine does; `onLine` hears each line it prints. */
export async function cli(cwd: string, args: string[], opts: { stdin?: string; onLine?: (line: string) => void } = {}) {
  const { main } = await import("../src/cli.js");
  const out: string[] = [];
  const err: string[] = [];
  const io = {
    out: (l: string) => {
      out.push(l);
      opts.onLine?.(l);
    },
    err: (l: string) => err.push(l),
    stdin: () => opts.stdin ?? "",
    cwd,
    notify: () => {},
    sleep: () => new Promise<void>((done) => setTimeout(done, 200)),
  };
  const code = await main(["node", "baesian", ...args], io);
  return { code, out: out.join("\n"), err: err.join("\n") };
}

/** `baesian login` in a repo, waiting for its code: the login itself, still polling, and the code to approve. */
export async function startLogin(dir: string, args: string[]): Promise<{ code: string; done: ReturnType<typeof cli> }> {
  let seen: (code: string) => void;
  const code = new Promise<string>((resolve) => (seen = resolve));
  const done = cli(dir, ["login", ...args], { onLine: (l) => /the code ([0-9A-Z]{4}-[0-9A-Z]{4})/.exec(l) && seen(/the code ([0-9A-Z]{4}-[0-9A-Z]{4})/.exec(l)![1]!) });
  return { code: await Promise.race([code, done.then((r) => Promise.reject(new Error(`login ended: ${r.err}`)))]), done };
}

/** Screenshots for looking at, with BAESIAN_SHOTS set to a folder: each named for its page and the window's width. */
export async function siteShot(page: Page, name: string): Promise<void> {
  const dir = process.env.BAESIAN_SHOTS;
  if (!dir) return;
  const { mkdirSync } = await import("node:fs");
  mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(120);
  await page.screenshot({ path: join(dir, `site-${name}-${page.viewportSize()?.width ?? 0}.png`), fullPage: false });
}

/**
 * Hand a passkey from one authenticator to another, with its sign count: two devices holding one passkey, as a synced
 * passkey is, where the service refuses a count that goes backwards (a cloned key's tell).
 */
export async function handOver(from: { cdp: CDPSession; id: string }, to: { cdp: CDPSession; id: string }): Promise<void> {
  const { credentials } = await from.cdp.send("WebAuthn.getCredentials", { authenticatorId: from.id });
  await to.cdp.send("WebAuthn.clearCredentials", { authenticatorId: to.id });
  for (const credential of credentials) await to.cdp.send("WebAuthn.addCredential", { authenticatorId: to.id, credential });
}

// ---------------------------------------------------------------- the website as an app (M9e step 2)

/**
 * The browser's push service, stood in for: Chromium under test can't reach Google's, so `pushManager.subscribe()` makes a
 * subscription in the page with a key pair of its own, at an endpoint on the Worker's stand-in push service
 * (https://push.test), and keeps it (with its private key, for the test to decrypt with) in the page's storage. Everything
 * else, the permission included, is the browser's own.
 */
export async function standInPushService(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const KEY = "baesian-test:push";
    const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const made = (s: { endpoint: string; p256dh: string; auth: string }) =>
      ({
        endpoint: s.endpoint,
        expirationTime: null,
        toJSON: () => ({ endpoint: s.endpoint, expirationTime: null, keys: { p256dh: s.p256dh, auth: s.auth } }),
        unsubscribe: async () => {
          localStorage.removeItem(KEY);
          return true;
        },
      }) as unknown as PushSubscription;
    PushManager.prototype.subscribe = async function (opts?: PushSubscriptionOptionsInit) {
      (window as unknown as { __taps?: { what: string }[] }).__taps?.push({ what: "subscribe" });
      if (Notification.permission !== "granted" && (await Notification.requestPermission()) !== "granted") throw new DOMException("Permission denied", "NotAllowedError");
      const had = localStorage.getItem(KEY);
      if (had) return made(JSON.parse(had));
      const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
      const s = {
        endpoint: `https://push.test/send/${crypto.randomUUID()}`,
        p256dh: b64(await crypto.subtle.exportKey("raw", pair.publicKey)),
        auth: b64(crypto.getRandomValues(new Uint8Array(16))),
        jwk: await crypto.subtle.exportKey("jwk", pair.privateKey),
        server: opts?.applicationServerKey ? b64(opts.applicationServerKey as ArrayBuffer) : null,
      };
      localStorage.setItem(KEY, JSON.stringify(s));
      return made(s);
    };
    PushManager.prototype.getSubscription = async function () {
      const had = localStorage.getItem(KEY);
      return had ? made(JSON.parse(had)) : null;
    };
  });
}

/** The page's stood-in subscription, with its private key, for reading what the Worker pushed to it. */
export async function pageSubscription(page: Page): Promise<{ endpoint: string; p256dh: string; auth: string; privateKey: CryptoKey; server: string | null }> {
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem("baesian-test:push") ?? "null"));
  if (!s) throw new Error("the page has no push subscription");
  return { ...s, privateKey: await crypto.subtle.importKey("jwk", s.jwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]) };
}

/**
 * What a page does after each tap, in order: the tap, its requests to the service, and the passkey, push and permission
 * calls it makes, so a test can see that a passkey starts from the tap itself (Safari's rule), and that the browser is
 * asked about notifications only after a tap.
 */
export async function recordTaps(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: { what: string; url?: string }[] = [];
    (window as unknown as { __taps: typeof log }).__taps = log;
    addEventListener("click", () => log.push({ what: "tap" }), true);
    const fetch0 = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      log.push({ what: "fetch", url: `${init?.method ?? "GET"} ${typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url}` });
      return fetch0(input, init);
    };
    const creds = navigator.credentials;
    const get0 = creds.get.bind(creds);
    const create0 = creds.create.bind(creds);
    creds.get = (o?: CredentialRequestOptions) => (log.push({ what: "credentials.get" }), get0(o));
    creds.create = (o?: CredentialCreationOptions) => (log.push({ what: "credentials.create" }), create0(o));
    const ask0 = Notification.requestPermission.bind(Notification);
    Notification.requestPermission = ((cb?: NotificationPermissionCallback) => (log.push({ what: "requestPermission" }), ask0(cb))) as typeof Notification.requestPermission;
  });
}

/** Everything the page did, as `recordTaps()` keeps it. */
export async function taps(page: Page): Promise<string[]> {
  const log = await page.evaluate(() => (window as unknown as { __taps: { what: string; url?: string }[] }).__taps);
  return log.map((e) => (e.url ? `${e.what} ${e.url}` : e.what));
}

/** What the page did from its last tap on (the tap first). */
export async function sinceLastTap(page: Page): Promise<string[]> {
  const log = await taps(page);
  return log.slice(log.lastIndexOf("tap"));
}
