import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Browser, type Page, expect, test } from "@playwright/test";
import { layoutProblems, smallTargets } from "./layout.js";
import { codeIn, handOver, type LocalSite, siteAvailable, siteShot, signUpOnPage, somebody, standInGlobus, standInTurnstile, startSite, virtualAuthenticator } from "./site.js";
import { PHONES, phone } from "./touch.js";

// The website's own pages (M9e), against the service's Worker run locally (e2e/site.ts), in a real Chromium with a
// virtual passkey authenticator: signing up (an emailed code, Turnstile, a handle, a passkey), the recovery code shown
// once, signing in with a passkey or through Globus, getting back in with the recovery code, the account (passkeys, each
// with its line for CI on request, sign-ins, machines, Globus, signing out), at a desktop's size and at both phones'. The machines' approval
// page, the projects and the project's desk are in site-desk.spec.ts.

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
test.skip(!siteAvailable, "needs the service's packages and the site's build (npm run build)");

/** Someone signed up in this page: Turnstile stood in for, and a passkey on this page's authenticator. */
async function signedUp(page: Page) {
  await standInTurnstile(page);
  const auth = await virtualAuthenticator(page);
  const who = somebody();
  const once = await signUpOnPage(page, site, who);
  return { who, auth, ...once };
}

/** Another browser, with the same passkey: what a passkey synced to a second device does. */
async function secondBrowser(browser: Browser, from: Awaited<ReturnType<typeof virtualAuthenticator>>) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const auth = await virtualAuthenticator(page);
  const { credentials } = await from.cdp.send("WebAuthn.getCredentials", { authenticatorId: from.id });
  for (const credential of credentials) await auth.cdp.send("WebAuthn.addCredential", { authenticatorId: auth.id, credential });
  return { context, page, auth };
}

const heading = (page: Page, name: string) => page.getByRole("heading", { name, exact: true });

test("signs up: an emailed code behind Turnstile, a handle, then a passkey; only the recovery code, shown once, and the passkey's line for CI on the account any time", async ({ page }) => {
  await standInTurnstile(page);
  await virtualAuthenticator(page);
  const who = somebody();
  await page.goto(site.url);
  await expect(heading(page, "Answer your agents' decisions")).toBeVisible();
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(heading(page, "Create your account")).toBeVisible();
  const send = page.getByRole("button", { name: "Email me a code" });
  await expect(send).toBeDisabled();
  await page.getByLabel("Email address").fill(who.email);
  await expect(page.getByText("Bot check passed (test)")).toBeVisible();
  await expect(send).toBeEnabled();
  const since = Date.now();
  await send.click();
  await expect(heading(page, "Check your email")).toBeVisible();
  await expect(page.getByText(who.email)).toBeVisible();
  // A wrong code says so, and how many tries are left.
  await page.getByLabel("The code from the email").fill("000000");
  await page.getByRole("textbox", { name: /^Your handle/ }).fill(who.handle);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toHaveText("That code isn't right: 4 tries left.");
  await page.getByLabel("The code from the email").fill(codeIn(await site.email("finish signing up", since)));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(heading(page, "Make your passkey")).toBeVisible();
  await page.getByRole("button", { name: "Make a passkey" }).click();
  await expect(heading(page, "Save your recovery code")).toBeVisible();
  const recovery = await page.getByLabel("Your recovery code", { exact: true }).textContent();
  expect(recovery).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);
  // Only the recovery code is there to keep (B-yj5d5).
  await expect(page.locator("main")).not.toContainText("line for CI");
  await expect(page.locator("code")).toHaveCount(1);
  const go = page.getByRole("button", { name: "Go to your projects" });
  await expect(go).toBeDisabled();
  await page.getByLabel("I've saved my recovery code").check();
  await go.click();
  await expect(heading(page, "Your projects")).toBeVisible();
  await expect(page.getByText("No projects yet.")).toBeVisible();
  await expect(page.getByText(`Signed in as ${who.handle}`)).toBeVisible();
  // Shown once: the recovery code doesn't appear again.
  await page.goto(`${site.url}/account`);
  const passkey = page.getByRole("region", { name: "Your passkeys" }).getByRole("listitem");
  await expect(passkey).toHaveCount(1);
  expect(await page.locator("main").innerText()).not.toContain(recovery!);
  // The passkey's line for CI is beside it, on request, whenever you come for it (B-yj5d5): its key file on one line.
  const open = passkey.getByRole("button", { name: /^Line for CI, for / });
  await expect(open).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel(/^The line for CI, for /)).toHaveCount(0);
  await open.click();
  await expect(open).toHaveAttribute("aria-expanded", "true");
  const line = passkey.getByLabel(/^The line for CI, for /);
  await expect(line).toBeVisible();
  await expect(passkey).toContainText("BAESIAN_TRUST");
  await expect(passkey).toContainText("baesian ci");
  const pin = (await line.textContent())!;
  expect(pin).not.toContain("\n");
  expect(JSON.parse(pin)).toMatchObject({ type: "passkey-key", format: 1, handle: who.handle, alg: expect.any(Number) });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await passkey.getByRole("button", { name: "Copy" }).click();
  await expect(passkey.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(pin);
  await open.click();
  await expect(page.getByLabel(/^The line for CI, for /)).toHaveCount(0);
  // Any time: the same line, after the page is read again.
  await page.reload();
  await passkey.getByRole("button", { name: /^Line for CI, for / }).click();
  await expect(passkey.getByLabel(/^The line for CI, for /)).toHaveText(pin);
});

test("signs in with a passkey; each sign-in is listed and can be ended; signing out here, or everywhere", async ({ page, browser }) => {
  const { who, auth } = await signedUp(page);
  const other = await secondBrowser(browser, auth);
  // Signed out, a page that needs you sends you to sign in, then back.
  await other.page.goto(`${site.url}/account`);
  await expect(other.page).toHaveURL(/\/sign-in\?next=%2Faccount$/);
  await expect(heading(other.page, "Sign in")).toBeVisible();
  await other.page.getByRole("button", { name: "Sign in with your passkey" }).click();
  await expect(heading(other.page, "Your account")).toBeVisible();
  await expect(other.page.getByText(`Signed in as ${who.handle}`).first()).toBeVisible();

  // The first browser sees both, its own marked, and ends the other's.
  await page.goto(`${site.url}/account`);
  const signIns = page.getByRole("region", { name: "Your sign-ins" }).getByRole("listitem");
  await expect(signIns).toHaveCount(2);
  await expect(signIns.filter({ hasText: "this browser" })).toHaveCount(1);
  await signIns.filter({ hasNotText: "this browser" }).getByRole("button", { name: /^Sign out/ }).click();
  await expect(page.getByRole("status")).toContainText("Signed out of");
  await expect(signIns).toHaveCount(1);
  await other.page.reload();
  await expect(heading(other.page, "Sign in")).toBeVisible();

  // Signed in again over there; signing out everywhere ends both.
  await other.page.getByRole("button", { name: "Sign in with your passkey" }).click();
  await expect(heading(other.page, "Your account")).toBeVisible();
  await page.reload();
  await expect(signIns).toHaveCount(2);
  await page.getByRole("button", { name: "Sign out everywhere" }).click();
  await expect(heading(page, "Sign in")).toBeVisible();
  await other.page.reload();
  await expect(heading(other.page, "Sign in")).toBeVisible();

  // And here only: the other stays in.
  await handOver(other.auth, auth);
  await page.getByRole("button", { name: "Sign in with your passkey" }).click();
  await expect(heading(page, "Your projects")).toBeVisible();
  await handOver(auth, other.auth);
  await other.page.getByRole("button", { name: "Sign in with your passkey" }).click();
  await expect(heading(other.page, "Your account")).toBeVisible();
  await page.goto(`${site.url}/account`);
  await page.getByRole("button", { name: "Sign out of this browser" }).click();
  await expect(heading(page, "Sign in")).toBeVisible();
  await other.page.reload();
  await expect(heading(other.page, "Your account")).toBeVisible();
  await other.context.close();
});

test("gets back in with an emailed code and the recovery code: a new passkey, a new recovery code, and other sign-ins ended", async ({ page, browser }) => {
  const { who, recovery } = await signedUp(page);
  // Every passkey lost: a new browser, with an authenticator that has none.
  const context = await browser.newContext();
  const lost = await context.newPage();
  await standInTurnstile(lost);
  await virtualAuthenticator(lost);
  await lost.goto(`${site.url}/sign-in`);
  await lost.getByRole("link", { name: "Get back in with your recovery code" }).click();
  await expect(heading(lost, "Get back in")).toBeVisible();
  await lost.getByLabel("Your account's email address").fill(who.email);
  await expect(lost.getByText("Bot check passed (test)")).toBeVisible();
  const since = Date.now();
  await lost.getByRole("button", { name: "Email me a code" }).click();
  await expect(heading(lost, "Enter both codes")).toBeVisible();
  const code = codeIn(await site.email("get back into your Baesian account", since));
  // Both codes count only together, and a wrong one says how many tries are left, not which was wrong.
  await lost.getByLabel("The code from the email").fill(code);
  await lost.getByLabel("Your recovery code").fill("AAAAA-AAAAA-AAAAA-AAAAA");
  await lost.getByRole("button", { name: "Continue" }).click();
  await expect(lost.getByRole("alert")).toHaveText("Those codes don't match: 4 tries left.");
  await lost.getByLabel("Your recovery code").fill(recovery.toLowerCase().replace(/-/g, " "));
  await lost.getByRole("button", { name: "Continue" }).click();
  await expect(heading(lost, "Make a new passkey")).toBeVisible();
  await lost.getByRole("button", { name: "Make a passkey" }).click();
  await expect(heading(lost, "You're back in")).toBeVisible();
  const fresh = await lost.getByLabel("Your new recovery code", { exact: true }).textContent();
  expect(fresh).not.toBe(recovery);
  // Only the new recovery code is shown; the new passkey's line for CI is on the account page (B-yj5d5).
  await expect(lost.getByLabel(/line for CI/i)).toHaveCount(0);
  await expect(lost.getByText("Your account page has it, beside the passkey.")).toBeVisible();
  await siteShot(lost, "recover-done");
  await lost.getByLabel("I've saved my new recovery code").check();
  await lost.getByRole("button", { name: "Go to your projects" }).click();
  await expect(heading(lost, "Your projects")).toBeVisible();
  // The first browser was signed out, and a notice went to the address.
  await page.reload();
  await expect(heading(page, "Answer your agents' decisions")).toBeVisible();
  await site.email("got back into the Baesian account", since);
  await lost.goto(`${site.url}/account`);
  const passkeys = lost.getByRole("region", { name: "Your passkeys" }).getByRole("listitem");
  await expect(passkeys).toHaveCount(2);
  await passkeys.nth(1).getByRole("button", { name: /^Line for CI, for / }).click();
  await expect(passkeys.nth(1).getByLabel(/^The line for CI, for /)).toContainText("passkey-key");
  await context.close();
});

test("the account: another passkey, its line for CI opened for you, and each passkey's on request; Globus linked and unlinked", async ({ page }) => {
  const { who, auth } = await signedUp(page);
  await page.goto(`${site.url}/account`);
  await expect(heading(page, "Your account")).toBeVisible();
  // Another device: a second authenticator, the first set aside, as on a new phone or a security key.
  await auth.cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId: auth.id });
  await virtualAuthenticator(page);
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page.getByRole("status")).toHaveText("The new passkey is added, with its line for CI open in the list below.");
  const passkeys = page.getByRole("region", { name: "Your passkeys" }).getByRole("listitem");
  await expect(passkeys).toHaveCount(2);
  // The new one's line is open, under it; the first's isn't.
  await expect(page.getByLabel(/^The line for CI, for /)).toHaveCount(1);
  const second = (await passkeys.nth(1).getByLabel(/^The line for CI, for /).textContent())!;
  expect(JSON.parse(second)).toMatchObject({ type: "passkey-key", handle: who.handle });
  await page.getByRole("region", { name: "Your passkeys" }).scrollIntoViewIfNeeded();
  await siteShot(page, "account-added");
  // Read again, every line is closed, and each opens on request: two passkeys, two lines.
  await page.reload();
  await expect(page.getByLabel(/^The line for CI, for /)).toHaveCount(0);
  for (const i of [0, 1]) await passkeys.nth(i).getByRole("button", { name: /^Line for CI, for / }).click();
  await expect(passkeys.nth(1).getByLabel(/^The line for CI, for /)).toHaveText(second);
  const first = (await passkeys.nth(0).getByLabel(/^The line for CI, for /).textContent())!;
  expect(JSON.parse(first).credential).not.toBe(JSON.parse(second).credential);
  await page.getByRole("region", { name: "Your passkeys" }).scrollIntoViewIfNeeded();
  await siteShot(page, "account-lines");

  // Globus: linking goes there, and comes back linked (a recent passkey check covers it).
  await standInGlobus(page, site, { sub: `globus-${who.handle}`, email: who.email });
  await page.getByRole("button", { name: "Link Globus" }).click();
  await expect(page.getByRole("status")).toHaveText("Globus is linked: you can sign in through it from now on.");
  await expect(page.getByRole("region", { name: "Globus" })).toContainText("Linked");
  await page.getByRole("button", { name: "Unlink Globus" }).click();
  await expect(page.getByRole("status")).toHaveText("Globus is unlinked: sign in with your passkey.");
  await expect(page.getByRole("button", { name: "Link Globus" })).toBeVisible();
});

test("signs up and in through Globus: a handle and a passkey, then Globus alone signs you in", async ({ page }) => {
  await virtualAuthenticator(page);
  const who = somebody();
  await standInGlobus(page, site, { sub: `globus-${who.handle}`, email: who.email });
  await page.goto(`${site.url}/sign-in`);
  await page.getByRole("link", { name: "Sign in through Globus" }).click();
  // Nobody has this identity: it's a sign-up, which still makes a passkey (D153).
  await expect(heading(page, "Choose your handle")).toBeVisible();
  await expect(page.getByLabel("The code from the email")).toHaveCount(0);
  await page.getByRole("textbox", { name: /^Your handle/ }).fill(who.handle);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Make a passkey" }).click();
  await expect(heading(page, "Save your recovery code")).toBeVisible();
  await page.getByLabel("I've saved my recovery code").check();
  await page.getByRole("button", { name: "Go to your projects" }).click();
  await page.goto(`${site.url}/account`);
  await page.getByRole("button", { name: "Sign out of this browser" }).click();
  await expect(heading(page, "Sign in")).toBeVisible();
  await page.getByRole("link", { name: "Sign in through Globus" }).click();
  await expect(heading(page, "Your projects")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(`Signed in through Globus as ${who.handle}.`);

  // A Globus round trip that went wrong comes back to the sign-in page, saying what to do.
  await page.goto(`${site.url}/sign-in#error=globus-flow&message=${encodeURIComponent("this sign-in through Globus didn't start in this browser, or it expired: start again")}`);
  await expect(page.getByRole("alert")).toHaveText("This sign-in through Globus didn't start in this browser, or it expired: start again.");
});

// ---------------------------------------------------------------- every page, laid out

/** The layout check and, on a phone, the touch targets: as lines to collect. */
async function check(page: Page, problems: string[], name: string, touch: boolean) {
  await page.waitForTimeout(100);
  for (const p of await page.evaluate(layoutProblems)) problems.push(`${name}: ${p}`);
  if (touch) for (const p of await page.evaluate(smallTargets)) problems.push(`${name}: ${p}`);
  await siteShot(page, name);
}

/** Every page of the account, through the layout check. */
async function everyPage(page: Page, touch: boolean): Promise<string[]> {
  const problems: string[] = [];
  await standInTurnstile(page);
  await virtualAuthenticator(page);
  const who = somebody();
  await page.goto(site.url);
  await expect(heading(page, "Answer your agents' decisions")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await check(page, problems, "welcome", touch);
  await page.goto(`${site.url}/sign-in`);
  await expect(heading(page, "Sign in")).toBeVisible();
  await check(page, problems, "sign-in", touch);
  await page.goto(`${site.url}/sign-up`);
  await page.getByLabel("Email address").fill(who.email);
  await expect(page.getByText("Bot check passed (test)")).toBeVisible();
  await check(page, problems, "sign-up", touch);
  const since = Date.now();
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(heading(page, "Check your email")).toBeVisible();
  await page.getByLabel("The code from the email").fill("000000");
  await page.getByRole("textbox", { name: /^Your handle/ }).fill(who.handle);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await check(page, problems, "sign-up-code", touch);
  await page.getByLabel("The code from the email").fill(codeIn(await site.email("finish signing up", since)));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(heading(page, "Make your passkey")).toBeVisible();
  await check(page, problems, "sign-up-passkey", touch);
  await page.getByRole("button", { name: "Make a passkey" }).click();
  await expect(heading(page, "Save your recovery code")).toBeVisible();
  await check(page, problems, "sign-up-done", touch);
  await page.getByLabel("I've saved my recovery code").check();
  await page.getByRole("button", { name: "Go to your projects" }).click();
  await expect(heading(page, "Your projects")).toBeVisible();
  await check(page, problems, "projects-empty", touch);
  await page.goto(`${site.url}/account`);
  await expect(page.getByRole("region", { name: "Your sign-ins" }).getByRole("listitem")).toHaveCount(1);
  await check(page, problems, "account", touch);
  // A passkey's line for CI, open under its row (B-yj5d5).
  await page.getByRole("button", { name: /^Line for CI, for / }).click();
  await expect(page.getByLabel(/^The line for CI, for /)).toBeVisible();
  await page.getByRole("region", { name: "Your passkeys" }).scrollIntoViewIfNeeded();
  await check(page, problems, "account-line", touch);
  await page.goto(`${site.url}/device`);
  await expect(heading(page, "Approve a machine")).toBeVisible();
  await check(page, problems, "device-code", touch);
  await page.goto(`${site.url}/recover`);
  await expect(heading(page, "Get back in")).toBeVisible();
  await expect(page.getByText("Bot check passed (test)")).toBeVisible();
  await check(page, problems, "recover", touch);
  await page.getByLabel("Your account's email address").fill(who.email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(heading(page, "Enter both codes")).toBeVisible();
  await check(page, problems, "recover-codes", touch);
  return problems;
}

test("every page fits a desktop's window, with nothing clipped or overlapping", async ({ page }) => {
  expect(await everyPage(page, false)).toEqual([]);
});

for (const size of PHONES) {
  test.describe(`${size.name}, ${size.width}×${size.height}`, () => {
    test.use(phone(size));
    test("every page fits the phone: nothing sideways, nothing clipped, and everything you tap 44 px", async ({ page }) => {
      expect(await everyPage(page, true)).toEqual([]);
    });
  });
}
