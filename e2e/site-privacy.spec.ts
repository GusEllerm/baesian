import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Page, expect, test } from "@playwright/test";
import { layoutProblems, smallTargets } from "./layout.js";
import { type LocalSite, siteAvailable, siteShot, signUpOnPage, somebody, standInTurnstile, startSite, virtualAuthenticator } from "./site.js";
import { PHONES, phone } from "./touch.js";

// The privacy policy (M9f), at /privacy: open to anyone, linked from every page's footer, from signing up, from /counts
// and from the account page; saying who runs the service (B-mkryw), where to write (B-8xxrc), how long things are kept
// (B-9jqt4, B-ec3kj, B-dsqyd) and how deleting an account works (B-b46z3). At a desktop's size and at both phones'.

let site: LocalSite;
const home = realpathSync(mkdtempSync(join(tmpdir(), "baesian-privacy-home-")));
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
const footer = (page: Page) => page.getByRole("navigation", { name: "About the service" });

test("the policy is open to anyone, from every page's footer, sign-up and /counts; it names who runs the service and where to write", async ({ page }) => {
  await standInTurnstile(page);
  await page.goto(site.url);
  await expect(heading(page, "Answer your agents' decisions")).toBeVisible();
  await footer(page).getByRole("link", { name: "Privacy" }).click();
  await expect(heading(page, "Privacy")).toBeVisible();
  await expect(page).toHaveURL(`${site.url}/privacy`);
  // Signed out, nothing sends you to sign in.
  await page.waitForTimeout(200);
  await expect(page).toHaveURL(`${site.url}/privacy`);
  const who = page.getByRole("region", { name: "Who runs it" });
  await expect(who).toContainText("Gus Ellerm runs the service, as an individual");
  await expect(who).toContainText("It isn't a service of the University of Chicago or of Globus");
  await expect(who.getByRole("link", { name: "privacy@baesian.dev" })).toHaveAttribute("href", "mailto:privacy@baesian.dev");
  // B-ew5e8: what your agents file names the model each ran on, beside the agent (B-k0w7d).
  await expect(page.getByRole("region", { name: "What it keeps, and why" })).toContainText("the agent that filed it and the model it ran on, the machine it came from");
  await expect(page.getByText("Last changed 10 November 2026.")).toBeVisible();
  const kept = page.getByRole("region", { name: "How long it's kept" });
  await expect(kept.getByRole("listitem").filter({ hasText: "once answered or withdrawn" })).toContainText("30 days after every machine signed in to the project has the answer or the withdrawal");
  await expect(kept.getByRole("listitem").filter({ hasText: "held back by your settings" })).toContainText("90 days after it arrived");
  await expect(kept.getByRole("listitem").filter({ hasText: "Usage events" })).toContainText("90 days, then only daily totals");
  // D181: the commits that cite cards and the merges, with how long; a commit's subject never reaches the service.
  await expect(kept.getByRole("listitem").filter({ hasText: "A commit's ID, time and branch" })).toContainText("As long as that card's text: removed with it.");
  await expect(kept.getByRole("listitem").filter({ hasText: "A merge: its two branches" })).toContainText("Until the text of every card it brought is removed.");
  // B-15v62: a merge the service can't tie to any card's text is kept while the project exists, and the page says so.
  await expect(kept.getByRole("listitem").filter({ hasText: "A merge: its two branches" })).toContainText("One whose commits the service was never told cite cards (they were made where Baesian isn't signed in to the project), or that brought only a branch's deck: while the project exists");
  await expect(page.getByRole("region", { name: "What it keeps, and why" })).toContainText("A commit's subject and message, and what it changed, never reach the service.");
  await expect(page.getByRole("region", { name: "Deleting your account" })).toContainText("For 14 days, signing in with your passkey can restore it");
  for (const name of ["Cloudflare, Inc.", "Globus"]) await expect(page.getByRole("region", { name: "Who else handles it" }).getByText(name, { exact: true })).toBeVisible();
  await page.getByRole("region", { name: "What it keeps, and why" }).getByRole("link", { name: "Every field is listed" }).click();
  await expect(heading(page, "What the service counts")).toBeVisible();
  // /counts links back, and so does signing up.
  await page.getByRole("link", { name: "the privacy policy" }).click();
  await expect(heading(page, "Privacy")).toBeVisible();
  await page.goto(`${site.url}/sign-up`);
  await expect(heading(page, "Create your account")).toBeVisible();
  await page.getByRole("link", { name: "the privacy policy" }).click();
  await expect(heading(page, "Privacy")).toBeVisible();
  await expect(footer(page).getByRole("link", { name: "What the service counts" })).toBeVisible();
});

test("signed in, the account page links to it, and the policy keeps you signed in", async ({ page }) => {
  await standInTurnstile(page);
  await virtualAuthenticator(page);
  const who = somebody();
  await signUpOnPage(page, site, who);
  await page.goto(`${site.url}/account`);
  await page.getByRole("link", { name: "Everything the service keeps, and why" }).click();
  await expect(heading(page, "Privacy")).toBeVisible();
  await expect(page.getByText(`Signed in as ${who.handle}`)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "The site" }).getByRole("link", { name: "Account" })).toBeVisible();
});

/** The policy, the front door and /counts through the layout check, with the touch targets on a phone. */
async function laidOut(page: Page, touch: boolean): Promise<string[]> {
  const problems: string[] = [];
  for (const [path, name, title] of [["/privacy", "privacy", "Privacy"], ["/", "welcome-footer", "Answer your agents' decisions"], ["/counts", "counts-footer", "What the service counts"]] as const) {
    await page.goto(`${site.url}${path}`);
    await expect(heading(page, title)).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(100);
    for (const p of await page.evaluate(layoutProblems)) problems.push(`${name}: ${p}`);
    if (touch) for (const p of await page.evaluate(smallTargets)) problems.push(`${name}: ${p}`);
    await siteShot(page, name);
    if (path === "/privacy") {
      // The whole policy, top to bottom, for looking at.
      for (const [region, shot] of [["What it keeps, and why", "privacy-keeps"], ["How long it's kept", "privacy-kept"], ["Who else handles it", "privacy-others"], ["Changes", "privacy-end"]] as const) {
        await page.getByRole("region", { name: region }).evaluate((el) => el.scrollIntoView({ block: "start" }));
        await siteShot(page, shot);
      }
    }
  }
  return problems;
}

test("the policy fits a desktop's window, with nothing clipped or overlapping", async ({ page }) => {
  expect(await laidOut(page, false)).toEqual([]);
});

for (const size of PHONES) {
  test.describe(`${size.name}, ${size.width}×${size.height}`, () => {
    test.use(phone(size));
    test("the policy fits the phone: nothing sideways, nothing clipped, and everything you tap 44 px", async ({ page }) => {
      expect(await laidOut(page, true)).toEqual([]);
    });
  });
}
