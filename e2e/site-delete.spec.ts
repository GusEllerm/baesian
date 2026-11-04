import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Page, expect, test } from "@playwright/test";
import { layoutProblems, smallTargets } from "./layout.js";
import { type LocalSite, siteAvailable, siteShot, signUpOnPage, somebody, standInTurnstile, startSite, virtualAuthenticator } from "./site.js";
import { PHONES, phone } from "./touch.js";

// Deleting an account on the website (M9f), as card B-b46z3 decided, "Closed for 14 days, then deleted": the account
// page's last sheet takes the handle typed out and the passkey (afresh, from the tap, when the last check is old); the
// account is closed at once, and the sign-in page says until when; signing in with the passkey offers to restore it,
// and restoring signs you in. Deleting it for good, 14 days on, is the service's daily job (service/test/deletion.test.ts).

let site: LocalSite;
const home = realpathSync(mkdtempSync(join(tmpdir(), "baesian-delete-home-")));
test.beforeAll(async () => {
  process.env.BAESIAN_CONFIG = join(home, "config.json");
  if (siteAvailable) site = await startSite();
});
test.afterAll(async () => {
  await site?.dispose();
  rmSync(home, { recursive: true, force: true });
});
test.skip(!siteAvailable, "needs the service's packages and the site's build (npm run build)");

const heading = (page: Page, name: string) => page.getByRole("heading", { name, exact: true });
const closedAt = async (handle: string) => (await site.db.prepare("SELECT closed FROM accounts WHERE handle = ?").bind(handle).first<{ closed: string | null }>())!.closed;
/** Make the sign-in's last passkey check old, so deleting asks for it afresh. */
const ageCheck = (handle: string) =>
  site.db.prepare("UPDATE sessions SET verified = ? WHERE account = (SELECT id FROM accounts WHERE handle = ?)").bind(new Date(Date.now() - 10 * 60_000).toISOString(), handle).run();

async function signedUp(page: Page) {
  await standInTurnstile(page);
  await virtualAuthenticator(page);
  const who = somebody();
  await signUpOnPage(page, site, who);
  return who;
}

test("deletes the account: the handle typed out, the passkey afresh; closed at once, then restored with the passkey", async ({ page }) => {
  const who = await signedUp(page);
  await page.goto(`${site.url}/account`);
  const sheet = page.getByRole("region", { name: "Deleting your account" });
  await expect(sheet).toContainText("For 14 days, signing in with your passkey can restore it");
  await expect(sheet.getByRole("link", { name: "What else is kept, and for how long" })).toHaveAttribute("href", "/privacy");
  const go = sheet.getByRole("button", { name: "Delete my account" });
  await expect(go).toBeDisabled();
  await sheet.getByLabel(`Type your handle, ${who.handle}, to confirm`).fill("someone-else");
  await expect(go).toBeDisabled();
  await sheet.getByLabel(`Type your handle, ${who.handle}, to confirm`).fill(who.handle);
  // The last check is old: the tap asks for the passkey first, then deletes.
  await ageCheck(who.handle);
  await page.reload();
  await page.getByRole("region", { name: "Deleting your account" }).getByLabel(`Type your handle, ${who.handle}, to confirm`).fill(who.handle);
  const since = Date.now();
  await page.getByRole("region", { name: "Deleting your account" }).getByRole("button", { name: "Delete my account" }).click();
  await expect(heading(page, "Sign in")).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in\?closed=/);
  await expect(page.getByRole("status")).toContainText("Your account is closed, and you're signed out. It will be deleted on");
  expect(await closedAt(who.handle)).not.toBeNull();
  expect(await site.email(`The Baesian account ${who.handle}`, since)).toContain("To keep it, sign in");
  // Signed out: the account page sends you to sign in.
  await page.goto(`${site.url}/account`);
  await expect(heading(page, "Sign in")).toBeVisible();

  // Signing in with the passkey offers to restore it.
  await page.getByRole("button", { name: "Sign in with your passkey" }).click();
  await expect(heading(page, "This account is closed")).toBeVisible();
  await expect(page.getByText(`The account ${who.handle} will be deleted on`)).toBeVisible();
  // Leaving it closed goes back; signing in again offers it again.
  await page.getByRole("button", { name: "Leave it closed" }).click();
  await expect(heading(page, "Sign in")).toBeVisible();
  await page.getByRole("button", { name: "Sign in with your passkey" }).click();
  await page.getByRole("button", { name: "Restore my account" }).click();
  await expect(heading(page, "Your account")).toBeVisible();
  await expect(page.getByText(`Signed in as ${who.handle}`, { exact: true })).toBeVisible();
  expect(await closedAt(who.handle)).toBeNull();
});

/** The account's last sheet, the closed account's sheet and the sign-in page's notice, through the layout check. */
async function laidOut(page: Page, touch: boolean): Promise<string[]> {
  const problems: string[] = [];
  const check = async (name: string) => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(100);
    for (const p of await page.evaluate(layoutProblems)) problems.push(`${name}: ${p}`);
    if (touch) for (const p of await page.evaluate(smallTargets)) problems.push(`${name}: ${p}`);
    await siteShot(page, name);
  };
  const who = await signedUp(page);
  await page.goto(`${site.url}/account`);
  const sheet = page.getByRole("region", { name: "Deleting your account" });
  await sheet.getByLabel(`Type your handle, ${who.handle}, to confirm`).fill(who.handle);
  await sheet.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await check("account-delete");
  await sheet.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByRole("status")).toContainText("Your account is closed");
  await check("sign-in-closed");
  await page.getByRole("button", { name: "Sign in with your passkey" }).click();
  await expect(heading(page, "This account is closed")).toBeVisible();
  await check("account-closed");
  return problems;
}

test("deleting fits a desktop's window, with nothing clipped or overlapping", async ({ page }) => {
  expect(await laidOut(page, false)).toEqual([]);
});

for (const size of PHONES) {
  test.describe(`${size.name}, ${size.width}×${size.height}`, () => {
    test.use(phone(size));
    test("deleting fits the phone: nothing sideways, nothing clipped, and everything you tap 44 px", async ({ page }) => {
      expect(await laidOut(page, true)).toEqual([]);
    });
  });
}
