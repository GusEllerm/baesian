import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Page, expect, test } from "@playwright/test";
import { readPush } from "../service/test/push-decrypt.js";
import { Store } from "../src/store.js";
import { BODY, cleanup, draft, draftFile, repo } from "../test/helpers.js";
import { layoutProblems, smallTargets } from "./layout.js";
import {
  type LocalSite,
  cli,
  pageSubscription,
  recordTaps,
  siteAvailable,
  siteShot,
  signUpOnPage,
  sinceLastTap,
  somebody,
  standInGlobus,
  standInPushService,
  standInTurnstile,
  startLogin,
  startSite,
  taps,
  virtualAuthenticator,
} from "./site.js";
import { PHONES, phone } from "./touch.js";

// The website as an app (M9e step 2, D130): installing it (the manifest, the icons, the service worker at scope /, which
// keeps nothing), notifications (turned on only from a tap, a push from the relay when a hard card waits, which the
// service worker shows, each browser listed and removable; on an iPhone, only once it's on the Home Screen), a machine's
// burst said on the project's page, and two fixes to step 1: passkeys started by the tap itself, and the passkey prompt in
// the middle of a desktop's window. The push service is a stand-in: Chromium under test can't reach Google's.

let site: LocalSite;
const home = realpathSync(mkdtempSync(join(tmpdir(), "baesian-site-home-")));
test.beforeAll(async () => {
  process.env.BAESIAN_CONFIG = join(home, "config.json");
  if (siteAvailable) site = await startSite();
});
test.afterAll(async () => {
  await site?.dispose();
  rmSync(home, { recursive: true, force: true });
});
test.afterEach(() => cleanup());
test.skip(!siteAvailable, "needs the service's packages and the site's build (npm run build)");
// Chromium itself, headless, rather than its headless shell, which refuses every notification whatever is granted.
test.use({ channel: "chromium" });

const heading = (page: Page, name: string) => page.getByRole("heading", { name, exact: true });
const AGENT = { agent: "claude-code", force: true };

async function signedUp(page: Page) {
  await standInTurnstile(page);
  const auth = await virtualAuthenticator(page);
  const who = somebody();
  await signUpOnPage(page, site, who);
  return { who, auth };
}

/** Make the sign-in's last passkey check old, so what asks for it afresh asks. */
const ageCheck = (handle: string) =>
  site.db.prepare("UPDATE sessions SET verified = ? WHERE account = (SELECT id FROM accounts WHERE handle = ?)").bind(new Date(Date.now() - 10 * 60_000).toISOString(), handle).run();

/** `baesian login` in a repo, approved on /device, naming the new project. Returns the project's ID. */
async function link(page: Page, dir: string, name: string, machine = "laptop"): Promise<string> {
  const login = await startLogin(dir, ["--service", site.url, "--machine", machine]);
  await page.goto(`${site.url}/device?code=${login.code}`);
  await page.getByRole("textbox", { name: /^What should it be called\?/ }).fill(name);
  await page.getByRole("button", { name: "Approve with your passkey" }).click();
  await expect(heading(page, "Machine approved")).toBeVisible();
  const r = await login.done;
  expect(r.code, r.err).toBe(0);
  return Store.open(dir).config().project!;
}

/** The page's own security policy, broken: anything it refused, as the browser reports it. */
async function watchPolicy(page: Page): Promise<string[]> {
  const refused: string[] = [];
  page.on("console", (m) => /Content Security Policy|Refused to/.test(m.text()) && refused.push(m.text()));
  await page.addInitScript(() => addEventListener("securitypolicyviolation", (e) => console.error(`Refused to load ${e.blockedURI} (${e.violatedDirective})`)));
  return refused;
}

const notifications = (page: Page) => page.getByRole("region", { name: "Notifications" });

test("installs as an app: the page names the manifest and its icons, one maskable; the service worker is at scope / and keeps nothing; the security policy holds", async ({ page }) => {
  const refused = await watchPolicy(page);
  await signedUp(page);
  await page.goto(`${site.url}/account`);
  await expect(heading(page, "Your account")).toBeVisible();
  const head = await page.evaluate(() =>
    [...document.head.querySelectorAll("link[rel], meta[name]")].map((e) => `${e.getAttribute("rel") ?? e.getAttribute("name")} ${e.getAttribute("href") ?? e.getAttribute("content")}`),
  );
  expect(head).toEqual(expect.arrayContaining(["manifest /manifest.webmanifest", "icon /favicon.ico", "icon /icons/icon-192.png", "apple-touch-icon /icons/apple-touch-icon.png", "theme-color #d9d0da"]));

  const m = await page.request.get(`${site.url}/manifest.webmanifest`);
  expect(m.status()).toBe(200);
  const manifest = await m.json();
  expect(manifest).toMatchObject({ name: "Baesian", short_name: "Baesian", start_url: "/", scope: "/", display: "standalone" });
  expect(manifest.icons.map((i: { purpose: string; sizes: string }) => `${i.sizes} ${i.purpose}`)).toEqual(["192x192 any", "512x512 any", "512x512 maskable"]);
  for (const src of [...manifest.icons.map((i: { src: string }) => i.src), "/icons/apple-touch-icon.png", "/icons/badge-96.png", "/favicon.ico"]) {
    const r = await page.request.get(`${site.url}${src}`);
    expect(r.status(), src).toBe(200);
    expect((await r.body()).byteLength, src).toBeGreaterThan(500);
  }

  // The service worker: registered at scope /, its script served with the site's own policy and never cached stale.
  const sw = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    return { scope: r.scope, script: r.active?.scriptURL };
  });
  expect(sw).toEqual({ scope: `${site.url}/`, script: `${site.url}/sw.js` });
  const script = await page.request.get(`${site.url}/sw.js`);
  expect(script.headers()["cache-control"]).toBe("no-cache");
  expect(script.headers()["content-security-policy"]).toContain("default-src 'self'");
  // It keeps nothing: no cache, and the service's replies come from the network, not from it.
  await page.reload();
  await expect(heading(page, "Your account")).toBeVisible();
  const config = await page.waitForResponse((r) => r.url().endsWith("/v1/account"), { timeout: 5000 }).catch(() => undefined);
  if (config) expect(config.fromServiceWorker()).toBe(false);
  const fromWorker = await page.evaluate(async () => {
    const r = await fetch("/v1/config");
    return { caches: await caches.keys(), controlled: !!navigator.serviceWorker.controller, ok: r.ok };
  });
  expect(fromWorker).toEqual({ caches: [], controlled: true, ok: true });
  expect(refused).toEqual([]);
});

test("notifications: turned on only from a tap; the relay pushes when a hard card waits, counts only; the service worker shows it and opens the project; removed again", async ({ page, context }) => {
  await context.grantPermissions(["notifications"], { origin: site.url });
  const refused = await watchPolicy(page);
  await standInPushService(page);
  await recordTaps(page);
  const { who } = await signedUp(page);
  const { dir } = repo();
  const project = await link(page, dir, "Crumb's shop");

  await page.goto(`${site.url}/account`);
  const sheet = notifications(page);
  const turnOn = sheet.getByRole("button", { name: "Turn on notifications" });
  await expect(turnOn).toBeVisible();
  // Nothing asked the browser on any page so far.
  expect((await taps(page)).filter((t) => t === "subscribe" || t === "requestPermission")).toEqual([]);
  await siteShot(page, "account-notifications-off");
  await turnOn.click();
  await expect(sheet.getByRole("status")).toHaveText("This browser gets notifications. To stop them here, remove this browser below.");
  // The tap asked the browser first, then told the service.
  expect((await sinceLastTap(page)).slice(0, 3)).toEqual(["tap", "subscribe", "fetch POST /v1/account/push"]);
  const row = sheet.getByRole("listitem");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("this browser");
  await expect(row).toContainText("last notified not yet");
  const sub = await pageSubscription(page);
  expect(sub.server).toBe((await (await page.request.get(`${site.url}/v1/config`)).json()).vapid_public_key);
  await siteShot(page, "account-notifications-on");

  // A hard card waits, while the page is elsewhere than the project: the relay pushes within seconds.
  const before = site.pushes.length;
  const filed = await cli(dir, ["file", "-", "--json"], { stdin: draftFile({ title: "The signing key", question: "Where should the signing key live?", topic: "keys/signing", reverse: "cheap", touches: [], level: "hard" }) });
  expect(filed.code, filed.err).toBe(0);
  await expect.poll(() => site.pushes.length, { timeout: 25_000 }).toBeGreaterThan(before);
  const sent = site.pushes.at(-1)!;
  expect(sent.endpoint).toBe(sub.endpoint);
  const got = await readPush(sent.endpoint, sent.headers, sent.body, sub);
  expect(got.message).toEqual({ title: "1 card waiting in Crumb's shop (hard)", body: "Tap to open it.", url: `/projects/${project}`, tag: `baesian:${project}` });
  expect(JSON.stringify(got)).not.toContain("signing key");
  expect(got.headers).toMatchObject({ urgency: "high", "content-encoding": "aes128gcm", ttl: "86400" });
  expect(got.vapid).toMatchObject({ verified: true, claims: { aud: "https://push.test", sub: site.url } });

  // The service worker shows it, and a tap on it opens the project's page.
  const cdp = await context.newCDPSession(page);
  const registration = new Promise<string>((resolve) => cdp.on("ServiceWorker.workerRegistrationUpdated", (e) => e.registrations.forEach((r) => r.scopeURL === `${site.url}/` && !r.isDeleted && resolve(r.registrationId))));
  await cdp.send("ServiceWorker.enable");
  await cdp.send("ServiceWorker.deliverPushMessage", { origin: site.url, registrationId: await registration, data: JSON.stringify(got.message) });
  const shown = () => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => ({ title: n.title, body: n.body, tag: n.tag, url: n.data?.url, actions: (n as unknown as { actions: unknown[] }).actions.length })));
  await expect.poll(shown).toEqual([{ title: got.message.title, body: "Tap to open it.", tag: `baesian:${project}`, url: `/projects/${project}`, actions: 0 }]);
  // A push it can't read still shows something, never nothing (Safari would take the permission back).
  await cdp.send("ServiceWorker.deliverPushMessage", { origin: site.url, registrationId: await registration, data: "not json" });
  await expect.poll(async () => (await shown()).map((n) => n.title)).toContain("Cards are waiting in Baesian");
  const worker = context.serviceWorkers().find((w) => w.url().endsWith("/sw.js"))!;
  const opened = await worker.evaluate(async (tag) => {
    const sw = globalThis as unknown as { registration: ServiceWorkerRegistration; clients: Clients; dispatchEvent(e: Event): boolean };
    const [n] = await sw.registration.getNotifications({ tag });
    let opened: string | undefined;
    Object.defineProperty(sw.clients, "matchAll", { value: async () => [] });
    Object.defineProperty(sw.clients, "openWindow", { value: async (u: string) => ((opened = u), null) });
    try {
      sw.dispatchEvent(new (globalThis as unknown as { NotificationEvent: new (t: string, i: { notification: Notification }) => Event }).NotificationEvent("notificationclick", { notification: n! }));
    } catch {
      // a test's event can't extend its lifetime; what it starts still runs
    }
    await new Promise((r) => setTimeout(r, 100));
    return opened;
  }, `baesian:${project}`);
  expect(opened).toBe(`${site.url}/projects/${project}`);
  // Opening it is counted (B-7nq85): minutes since it was shown, nothing more.
  await expect
    .poll(async () => (await site.db.prepare("SELECT e.fields FROM usage_events e JOIN accounts a ON a.usage_id = e.usage_id WHERE a.handle = ? AND e.kind = 'push_opened'").bind(who.handle).all<{ fields: string }>()).results.map((r) => JSON.parse(r.fields)))
    .toEqual([{ minutes_after: 0 }]);

  // The account says when it was last sent to; removing it here stops them, and the browser's subscription ends.
  await page.reload();
  await expect(notifications(page).getByRole("listitem")).toContainText("last notified today");
  await notifications(page).getByRole("button", { name: "Stop notifications to this browser" }).click();
  await expect(notifications(page).getByRole("status")).toHaveText("This browser won't get notifications any more.");
  await expect(notifications(page).getByRole("button", { name: "Turn on notifications" })).toBeVisible();
  const left = await site.db.prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE account = (SELECT id FROM accounts WHERE handle = ?)").bind(who.handle).first<{ n: number }>();
  expect(left!.n).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem("baesian-test:push"))).toBeNull();
  expect(refused).toEqual([]);
});

test("lists every browser that gets notifications, and removes another one from here", async ({ page, browser }) => {
  for (const p of [page]) await standInPushService(p);
  await page.context().grantPermissions(["notifications"], { origin: site.url });
  const { auth } = await signedUp(page);
  // A second browser, signed in with the same passkey, turns them on too.
  const other = await browser.newContext();
  await other.grantPermissions(["notifications"], { origin: site.url });
  const phonePage = await other.newPage();
  await standInPushService(phonePage);
  const auth2 = await virtualAuthenticator(phonePage);
  const { credentials } = await auth.cdp.send("WebAuthn.getCredentials", { authenticatorId: auth.id });
  for (const credential of credentials) await auth2.cdp.send("WebAuthn.addCredential", { authenticatorId: auth2.id, credential });
  await phonePage.goto(`${site.url}/sign-in?next=/account`);
  await phonePage.getByRole("button", { name: "Sign in with your passkey" }).click();
  await expect(heading(phonePage, "Your account")).toBeVisible();
  await notifications(phonePage).getByRole("button", { name: "Turn on notifications" }).click();
  await expect(notifications(phonePage).getByRole("status")).toHaveText("This browser gets notifications. To stop them here, remove this browser below.");

  await page.goto(`${site.url}/account`);
  await notifications(page).getByRole("button", { name: "Turn on notifications" }).click();
  const rows = notifications(page).getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "this browser" })).toHaveCount(1);
  const theirs = rows.filter({ hasNotText: "this browser" });
  const name = (await theirs.locator(".nm").textContent())!;
  await theirs.getByRole("button").click();
  await expect(notifications(page).getByRole("status").filter({ hasText: "any more" })).toHaveText(`${name} won't get notifications any more.`);
  await expect(rows).toHaveCount(1);
  // This browser still gets them.
  await expect(notifications(page)).toContainText("This browser gets notifications.");
  await other.close();
});

test("on an iPhone in Safari, says how to add Baesian to the Home Screen and offers no button; opened from there, it does", async ({ browser }) => {
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
  const tab = await browser.newContext({ ...phone(PHONES[0]!), userAgent: IPHONE });
  const page = await tab.newPage();
  // Safari's tab has no push manager.
  await page.addInitScript(() => delete (window as unknown as { PushManager?: unknown }).PushManager);
  const { auth } = await signedUp(page);
  await page.goto(`${site.url}/account`);
  const sheet = notifications(page);
  await expect(sheet).toContainText("On an iPhone or iPad, notifications come only to Baesian on your Home Screen.");
  await expect(sheet).toContainText("tap the Share button");
  await expect(sheet.getByRole("button", { name: "Turn on notifications" })).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(layoutProblems)).toEqual([]);
  expect(await page.evaluate(smallTargets)).toEqual([]);
  await siteShot(page, "account-iphone-safari");
  const { credentials } = await auth.cdp.send("WebAuthn.getCredentials", { authenticatorId: auth.id });
  await tab.close();

  // The same phone, from the Home Screen: the app has a push manager, and runs standalone.
  const app = await browser.newContext({ ...phone(PHONES[0]!), userAgent: IPHONE });
  const appPage = await app.newPage();
  await appPage.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true }));
  await standInPushService(appPage);
  const a2 = await virtualAuthenticator(appPage);
  for (const credential of credentials) await a2.cdp.send("WebAuthn.addCredential", { authenticatorId: a2.id, credential });
  await appPage.goto(`${site.url}/sign-in?next=/account`);
  await appPage.getByRole("button", { name: "Sign in with your passkey" }).click();
  await expect(heading(appPage, "Your account")).toBeVisible();
  await expect(notifications(appPage).getByRole("button", { name: "Turn on notifications" })).toBeVisible();
  await expect(notifications(appPage)).toContainText("On an iPhone, tap Allow.");
  await app.close();
});

test("an install button uses the browser's own prompt, where it offers one", async ({ page }) => {
  await signedUp(page);
  await page.goto(`${site.url}/account`);
  await expect(notifications(page).getByRole("button", { name: "Install Baesian as an app" })).toHaveCount(0);
  await page.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
    e.prompt = async () => {
      (window as unknown as { prompted: boolean }).prompted = true;
    };
    e.userChoice = Promise.resolve({ outcome: "accepted" });
    dispatchEvent(e);
  });
  await notifications(page).getByRole("button", { name: "Install Baesian as an app" }).click();
  await expect(notifications(page).getByRole("status")).toHaveText("Baesian is installed: open it from your dock, Start menu or Home Screen.");
  expect(await page.evaluate(() => (window as unknown as { prompted?: boolean }).prompted)).toBe(true);
  await expect(notifications(page).getByRole("button", { name: "Install Baesian as an app" })).toHaveCount(0);
});

// ---------------------------------------------------------------- step 1's fixes

test("a passkey starts from the tap itself: signing in, adding one, approving a machine and linking Globus ask the service nothing in between", async ({ page }) => {
  await recordTaps(page);
  const { who, auth } = await signedUp(page);
  const firstAfterTap = async () => (await sinceLastTap(page))[1];

  // Signing in: the options were fetched when the page opened.
  await page.goto(`${site.url}/account`);
  await page.getByRole("button", { name: "Sign out of this browser" }).click();
  await expect(heading(page, "Sign in")).toBeVisible();
  await page.getByRole("button", { name: "Sign in with your passkey" }).click();
  await expect(heading(page, "Your projects")).toBeVisible();
  expect(await firstAfterTap()).toBe("credentials.get");

  // Adding a passkey with the last check old: one tap checks the passkey you have, the next makes the new one.
  await ageCheck(who.handle);
  await page.goto(`${site.url}/account`);
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page.getByRole("status")).toHaveText("That's you. Now make the new passkey.");
  expect(await firstAfterTap()).toBe("credentials.get");
  await auth.cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId: auth.id });
  const second = await virtualAuthenticator(page);
  await page.getByRole("button", { name: "Make the new passkey" }).click();
  await expect(page.getByLabel(/^The line for CI, for /)).toContainText("passkey-key");
  expect(await firstAfterTap()).toBe("credentials.create");
  // With the check recent, one tap makes it.
  await page.reload();
  await second.cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId: second.id });
  await virtualAuthenticator(page);
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page.getByLabel(/^The line for CI, for /)).toContainText("passkey-key");
  expect(await firstAfterTap()).toBe("credentials.create");

  // Approving a machine with the last check old: the check, then the approval, from one tap.
  await ageCheck(who.handle);
  const { dir } = repo();
  const login = await startLogin(dir, ["--service", site.url, "--machine", "laptop"]);
  await page.goto(`${site.url}/device?code=${login.code}`);
  await page.getByRole("textbox", { name: /^What should it be called\?/ }).fill("Crumb's shop");
  await page.getByRole("button", { name: "Approve with your passkey" }).click();
  await expect(heading(page, "Machine approved")).toBeVisible();
  // The next check's options are fetched once the passkey has started, never before it.
  const approved = await sinceLastTap(page);
  expect(approved[1]).toBe("credentials.get");
  expect(approved.filter((t) => /finish|approve/.test(t))).toEqual(["fetch POST /v1/account/reauth/finish", "fetch POST /v1/account/machines/approve"]);
  expect((await login.done).code).toBe(0);

  // Linking Globus with the last check old.
  await ageCheck(who.handle);
  await standInGlobus(page, site, { sub: `globus-${who.handle}`, email: who.email });
  await page.goto(`${site.url}/account`);
  const linkButton = page.getByRole("button", { name: "Link Globus" });
  await linkButton.click();
  await expect(page.getByRole("status")).toHaveText("Globus is linked: you can sign in through it from now on.");
});

test("a passkey whose options have lapsed asks for one more tap, and then works", async ({ page }) => {
  const { who } = await signedUp(page);
  await ageCheck(who.handle);
  await page.clock.install();
  await page.goto(`${site.url}/account`);
  await expect(page.getByRole("button", { name: "Add a passkey" })).toBeEnabled();
  // The device slept past the options' life, and the page's timers with it.
  await page.clock.setSystemTime(Date.now() + 5 * 60_000);
  const fetched = page.waitForResponse((r) => r.url().endsWith("/v1/account/reauth/start"));
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page.getByRole("alert")).toHaveText("Your passkey wasn't ready yet. Tap again to use it.");
  await fetched;
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page.getByRole("status")).toHaveText("That's you. Now make the new passkey.");
});

test("the passkey prompt on a desktop is a dialog in the middle of the window, cutting off no line behind it", async ({ page }) => {
  await signedUp(page);
  const { dir } = repo();
  const project = await link(page, dir, "Crumb's shop");
  const filed = await cli(dir, ["file", "-", "--json"], { stdin: draftFile({ title: "The signing key", question: "Where should the signing key live?", topic: "keys/signing", reverse: "cheap", touches: [], level: "hard" }) });
  expect(filed.code, filed.err).toBe(0);
  await page.addInitScript((key) => localStorage.setItem(key, "true"), `baesian:${project}:setup`);
  await page.clock.install();
  await page.goto(`${site.url}/projects/${project}`);
  const card = page.locator("article.card:not([data-leaving])");
  await card.locator('.opt[data-kind="proposal"]').click();
  await card.getByRole("button", { name: /Confirm/ }).click();
  await page.clock.fastForward(5100);
  const prompt = page.getByRole("dialog", { name: "Confirm with your passkey" });
  await expect(prompt).toBeVisible();
  await expect(page.getByText("All caught up.")).toBeVisible();
  const box = (await prompt.boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - 720)).toBeLessThan(2);
  expect(Math.abs(box.y + box.height / 2 - 450)).toBeLessThan(2);
  // What's behind it is either wholly under it or wholly clear of it, line by line: no line runs under its edge.
  const cut = await page.evaluate((b) => {
    const out: string[] = [];
    for (const el of document.querySelectorAll("p.big, p.recap, .parked-row, .bar .summary, .bar .place, .path .row")) {
      const r = el.getBoundingClientRect();
      const overlapX = Math.min(r.right, b.x + b.width) - Math.max(r.left, b.x);
      const overlapY = Math.min(r.bottom, b.y + b.height) - Math.max(r.top, b.y);
      if (overlapX > 0 && overlapY > 0 && (r.left < b.x || r.right > b.x + b.width)) out.push(el.textContent ?? "");
    }
    return out;
  }, box);
  expect(cut).toEqual([]);
  await siteShot(page, "desk-passkey-centred");
});

// ---------------------------------------------------------------- a burst, said on the project's page

test("a machine that files a burst of cards: the project's page says its cards won't notify for a while", async ({ page }) => {
  await signedUp(page);
  const { dir } = repo();
  const project = await link(page, dir, "Crumb's shop");
  const store = Store.open(dir);
  for (let i = 0; i < 21; i++) store.fileCard(draft({ title: `Decision ${i}`, question: `Question ${i}?`, topic: `area${i}/q`, reverse: "cheap", touches: [] }), BODY, AGENT);
  const synced = await cli(dir, ["sync"]);
  expect(synced.code, synced.err).toBe(0);
  await page.addInitScript((key) => localStorage.setItem(key, "true"), `baesian:${project}:setup`);
  await page.goto(`${site.url}/projects/${project}`);
  const notice = page.getByRole("status").filter({ hasText: "filed" });
  await expect(notice).toHaveText(/^laptop filed 21 cards in 10 minutes, so its cards won't notify you until \d{1,2}:\d{2}( [AP]M)?\. They're all here\.$/);
  await siteShot(page, "desk-burst");
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(layoutProblems)).toEqual([]);
});

// ---------------------------------------------------------------- usage counts (D141, B-7nq85)

test("usage counts: on by default; unticking deletes what was kept for the account; the public page lists every field, signed in or not", async ({ page, browser }) => {
  const { who } = await signedUp(page);
  const usageId = async () => (await site.db.prepare("SELECT usage_id FROM accounts WHERE handle = ?").bind(who.handle).first<{ usage_id: string | null }>())!.usage_id;
  const kept = async () => {
    const id = await usageId();
    return id ? (await site.db.prepare("SELECT COUNT(*) AS n FROM usage_events WHERE usage_id = ?").bind(id).first<{ n: number }>())!.n : 0;
  };
  expect(await kept()).toBe(1); // account_created
  await page.goto(`${site.url}/account`);
  const sheet = page.getByRole("region", { name: "Usage counts" });
  const box = sheet.getByRole("checkbox", { name: "Count my use of the service" });
  await expect(box).toBeChecked();
  await sheet.scrollIntoViewIfNeeded();
  await siteShot(page, "account-usage");
  await box.uncheck();
  await expect(sheet.getByRole("status")).toHaveText("Nothing more is counted for your account, and what was kept for it is deleted.");
  await expect(box).not.toBeChecked();
  expect(await usageId()).toBeNull();
  await box.check();
  await expect(sheet.getByRole("status")).toHaveText("Your use is counted again, under a new ID that isn't linked to before.");

  // The public page: every kind and field, from the list the service checks against.
  await sheet.getByRole("link", { name: "Every field it counts, and what it never does" }).click();
  await expect(heading(page, "What the service counts")).toBeVisible();
  const { USAGE_KINDS, NEVER_COUNTED } = await import("../src/usage-fields.js");
  const list = page.getByRole("region", { name: "Every event" });
  for (const [kind, k] of Object.entries(USAGE_KINDS)) {
    const item = list.getByRole("listitem").filter({ has: page.getByRole("heading", { name: kind, exact: true }) });
    await expect(item, kind).toHaveCount(1);
    for (const f of Object.keys(k.fields)) await expect(item.locator("dt", { hasText: new RegExp(`^${f}$`) }), `${kind}.${f}`).toHaveCount(1);
  }
  await expect(page.getByRole("region", { name: "Never counted" }).getByRole("listitem")).toHaveCount(NEVER_COUNTED.length);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(layoutProblems)).toEqual([]);
  await siteShot(page, "counts");

  // Anyone may read it, signed in or not.
  const nobody = await browser.newPage();
  await nobody.goto(`${site.url}/counts`);
  await expect(heading(nobody, "What the service counts")).toBeVisible();
  await expect(nobody).toHaveURL(`${site.url}/counts`);
  await nobody.close();
});

// ---------------------------------------------------------------- laid out

for (const size of PHONES) {
  test.describe(`${size.name}, ${size.width}×${size.height}`, () => {
    test.use(phone(size));
    test("the account's notifications, on and listed, and the burst on the desk, fit the phone; everything you tap 44 px", async ({ page, context }) => {
      await context.grantPermissions(["notifications"], { origin: site.url });
      await standInPushService(page);
      await signedUp(page);
      await page.goto(`${site.url}/account`);
      await notifications(page).getByRole("button", { name: "Turn on notifications" }).click();
      await expect(notifications(page).getByRole("listitem")).toHaveCount(1);
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(layoutProblems)).toEqual([]);
      expect(await page.evaluate(smallTargets)).toEqual([]);
      await notifications(page).scrollIntoViewIfNeeded();
      await siteShot(page, "account-notifications-on");
      const { dir } = repo();
      const project = await link(page, dir, "Crumb's shop");
      const store = Store.open(dir);
      for (let i = 0; i < 21; i++) store.fileCard(draft({ title: `Decision ${i}`, question: `Question ${i}?`, topic: `area${i}/q`, reverse: "cheap", touches: [] }), BODY, AGENT);
      expect((await cli(dir, ["sync"])).code).toBe(0);
      await page.addInitScript((key) => localStorage.setItem(key, "true"), `baesian:${project}:setup`);
      await page.goto(`${site.url}/projects/${project}`);
      await expect(page.getByRole("status").filter({ hasText: "filed" })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(layoutProblems)).toEqual([]);
      await siteShot(page, "desk-burst");
      // The usage counts on the account, and the public page.
      await page.goto(`${site.url}/account`);
      await page.getByRole("region", { name: "Usage counts" }).scrollIntoViewIfNeeded();
      expect(await page.evaluate(layoutProblems)).toEqual([]);
      expect(await page.evaluate(smallTargets)).toEqual([]);
      await siteShot(page, "account-usage");
      await page.goto(`${site.url}/counts`);
      await expect(heading(page, "What the service counts")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(layoutProblems)).toEqual([]);
      expect(await page.evaluate(smallTargets)).toEqual([]);
      await siteShot(page, "counts");
    });
  });
}
