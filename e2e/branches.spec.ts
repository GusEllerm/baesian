import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Locator, type Page, expect, test } from "@playwright/test";
import { type RunningServer, startServer } from "../src/server.js";
import { Store } from "../src/store.js";
import { cleanup, repo } from "../test/helpers.js";
import { type History, makeHistory } from "./branches.js";
import { layoutProblems, smallTargets } from "./layout.js";
import { skipSetup } from "./setup.js";
import { type LocalSite, siteAvailable, signUpOnPage, somebody, standInTurnstile, startLogin, startSite, virtualAuthenticator } from "./site.js";
import { PHONES, phone } from "./touch.js";

// D181: "Your decisions, by branch", on the local desk and the website's, at a desktop's size and a phone's. A real repo's
// history, made by git and the hooks (e2e/branches.ts): feat/checkout merged into main by a merge commit, fix/typo squashed
// into it, feat/catalog still open with a card waiting, and the commits that cite cards. Locally the server reads them from
// the live layer; on the website they went up through the relay, and commit subjects never did. With BAESIAN_SHOTS set to
// a folder, each screen is saved there.

let server: RunningServer | undefined;
test.afterEach(async () => {
  await server?.close();
  server = undefined;
  cleanup();
});

const panelOf = (page: Page) => page.getByRole("complementary", { name: "Your decisions, by branch" });
const openPanel = async (page: Page, tap = false) => {
  const more = page.getByRole("button", { name: "More" });
  await (tap ? more.tap() : more.click());
  const item = page.getByRole("menuitem", { name: "Your decisions, by branch" });
  await (tap ? item.tap() : item.click());
  await expect(panelOf(page)).toBeVisible();
  return panelOf(page);
};
const laneName = (panel: Locator, name: string) => panel.locator(".lane-name", { has: panel.page().locator("b", { hasText: new RegExp(`^${name.replace("/", "\\/")}$`) }) });
const callout = (panel: Locator) => panel.locator(".lane-callout");

async function shot(page: Page, name: string) {
  const dir = process.env.BAESIAN_SHOTS;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(dir, `branches-${name}-${page.viewportSize()?.width ?? 0}.png`) });
}

async function check(page: Page, phoneSize = false) {
  await page.waitForTimeout(100);
  expect(await page.evaluate(layoutProblems)).toEqual([]);
  if (phoneSize) expect(await page.evaluate(smallTargets)).toEqual([]);
}

/** What the panel must show of the history, wherever it's drawn from. */
async function seesHistory(page: Page, panel: Locator, h: History, opts: { answered: boolean }) {
  await expect(panel.locator(".lane-name b")).toHaveText(["main", "feat/checkout", "fix/typo", "feat/catalog"]);
  await expect(laneName(panel, "feat/checkout").locator(".lane-end")).toHaveText(/^Merged into main on \d{1,2} \w{3}$/);
  await expect(laneName(panel, "fix/typo").locator(".lane-end")).toHaveText(/^Merged into main on /);
  await expect(laneName(panel, "feat/catalog").locator(".lane-end")).toHaveText(opts.answered ? "Merge held: 1 waiting" : "Merge held: 2 waiting");
  await expect(laneName(panel, "feat/catalog")).toContainText("codex · 2 cards");
  // Two merges, each ending its lane in main; six cards; and the commits that cite them, each joined to its card.
  const lanes = panel.locator(".lanes");
  await expect(lanes.locator(".lane-mark.merge")).toHaveCount(2);
  await expect(lanes.locator(".lane-merge:not(.sync)")).toHaveCount(2);
  await expect(lanes.locator(".lane-mark.card")).toHaveCount(6);
  await expect(lanes.locator(".lane-mark.commit")).toHaveCount(h.commits.length);
  await expect(lanes.locator(".lane-cites")).toHaveCount(h.commits.length);
  // feat/catalog isn't merged: its join is the dotted, inferred one; the merged lanes start from main.
  await expect(lanes.locator(".lane-fork.inferred")).toHaveCount(1);
  await expect(lanes.locator(".lane-fork:not(.inferred)")).toHaveCount(2);
  // The lanes scroll in their own box, opening on the latest day.
  const scroll = panel.locator(".lane-scroll");
  await expect.poll(() => scroll.evaluate((s) => s.scrollWidth - s.clientWidth - s.scrollLeft)).toBeLessThan(2);
  // Nothing anywhere says a commit's subject.
  await expect(panel).not.toContainText("Secret subject");
  await expect(panel).not.toContainText("acquisition");
}

test.describe("the local desk", () => {
  async function open(page: Page) {
    const { dir, store } = repo();
    const h = await makeHistory(dir);
    server = await startServer(store, { reviewer: "tester", writeServerFile: false, debounceMs: 20 });
    await skipSetup(page, dir);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(server.url);
    await expect(page.locator("article.card:not([data-leaving])")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    return { dir, h };
  }

  test("draws the lanes from the live layer: merges ending lanes, the commits joined to their cards, a callout by hover and keys", async ({ page }) => {
    const { h } = await open(page);
    const panel = await openPanel(page);
    await seesHistory(page, panel, h, { answered: true });
    await expect(panel.locator(".lanes-summary")).toHaveText("6 cards on 4 branches, cited by 6 commits. You've answered 4, choosing otherwise than the agent on 1. 2 branches merged. 1 branch is held by a card still waiting.");
    // It opens on the latest card, with its callout.
    await expect(callout(panel).locator("h3")).toHaveText("How prices are stored");
    await expect(callout(panel)).toContainText("waiting for you");
    await check(page);
    await shot(page, "local");

    // A card by hover: what you chose, against the agent's pick.
    const deletion = panel.locator(`.lane-mark.card[data-key="card:${h.cards.deletion}"]`);
    await deletion.hover();
    await expect(callout(panel).locator("h3")).toHaveText("What deleting an account removes");
    await expect(callout(panel).locator(".said")).toHaveText("you chose “Postgres”, not the agent's pick");
    await expect(callout(panel)).toContainText(`claude-code on feat/checkout`);
    await check(page);

    // By the keys: from the latest card along its lane to the commit citing it, which says its short ID and time, and
    // never its subject; then up a lane, and Enter on a merge.
    await panel.locator(`.lane-mark.card[data-key="card:${h.cards.prices}"]`).focus();
    await page.keyboard.press("ArrowRight");
    const commit = h.commits.at(-1)!;
    await expect(page.locator(":focus")).toHaveAttribute("data-key", `commit:${commit}:${h.cards.prices}`);
    await expect(callout(panel).locator("h3")).toHaveText(`Commit ${commit.slice(0, 7)}`);
    await expect(callout(panel).locator(".said")).toHaveText("cites “How prices are stored”");
    await expect(callout(panel).locator(".meta")).toHaveText(/^on feat\/catalog · \d{1,2} \w{3}, \d\d:\d\d$/);
    await expect(page.locator(":focus")).toHaveAttribute("aria-label", new RegExp(`^Commit ${commit.slice(0, 7)}, .*: cites How prices are stored$`));
    await callout(panel).getByRole("button", { name: "Show the card" }).click();
    await expect(callout(panel).locator("h3")).toHaveText("How prices are stored");
    await panel.locator(`.lane-mark.merge[data-key="merge:${h.merged}:feat/checkout"]`).focus();
    await expect(callout(panel).locator("h3")).toHaveText("feat/checkout merged into main");
    await expect(callout(panel).locator(".said")).toHaveText(/^with 2 cards: (“The session cookie”, “What deleting an account removes”|“What deleting an account removes”, “The session cookie”)$/);
    await expect(callout(panel).locator(".meta")).toContainText(`commit ${h.merged.slice(0, 7)}`);
    await page.keyboard.press("ArrowDown");
    await expect(page.locator(":focus")).toHaveAttribute("data-key", /^(card|commit):/);
    // Only one mark is in the tab order at a time; the arrows reach the rest.
    await expect(panel.locator('.lane-mark[tabindex="0"]')).toHaveCount(1);
    await check(page);

    // A card still waiting opens on the desk from its callout.
    await panel.locator(`.lane-mark.card[data-key="card:${h.cards.prices}"]`).click();
    await callout(panel).getByRole("button", { name: "Answer it on the desk" }).click();
    await expect(panelOf(page)).toBeHidden();
    await expect(page.locator("article.card:not([data-leaving])")).toHaveAttribute("aria-label", "How should prices be stored?");
  });

  for (const size of PHONES) {
    test.describe(`${size.name}, ${size.width}×${size.height}`, () => {
      test.use(phone(size));
      test("fills the phone, scrolls sideways in its own box, every mark 44 px, a tap shows its callout", async ({ page }) => {
        const { h } = await open(page);
        const panel = await openPanel(page, true);
        await seesHistory(page, panel, h, { answered: true });
        await check(page, true);
        await shot(page, "local-phone");
        const mark = panel.locator(`.lane-mark.commit[data-key="commit:${h.commits.at(-1)}:${h.cards.prices}"]`);
        await mark.scrollIntoViewIfNeeded();
        await mark.tap();
        await expect(callout(panel).locator("h3")).toHaveText(`Commit ${h.commits.at(-1)!.slice(0, 7)}`);
        await check(page, true);
        await shot(page, "local-phone-commit");
      });
    });
  }
});

test.describe("the website", () => {
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

  /** Sign up, make the history, link the repo: its first sync sends the cards, the ledger and the merges. */
  async function linked(page: Page) {
    await standInTurnstile(page);
    await virtualAuthenticator(page);
    await signUpOnPage(page, site, somebody());
    const { dir } = repo();
    const h = await makeHistory(dir);
    const login = await startLogin(dir, ["--service", site.url, "--machine", "laptop"]);
    await page.goto(`${site.url}/device?code=${login.code}`);
    await page.getByRole("textbox", { name: /^What should it be called\?/ }).fill("Crumb's shop");
    await page.getByRole("button", { name: "Approve with your passkey" }).click();
    await expect(page.getByRole("heading", { name: "Machine approved", exact: true })).toBeVisible();
    const r = await login.done;
    expect(r.code, r.err).toBe(0);
    const project = Store.open(dir).config().project!;
    await page.addInitScript((key) => localStorage.setItem(key, "true"), `baesian:${project}:setup`);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${site.url}/projects/${project}`);
    await expect(page.locator("article.card:not([data-leaving])")).toBeVisible();
    return { dir, h, project };
  }

  test("draws the lanes from the relay's state: the merges and the commits went up, the commits' subjects didn't", async ({ page }) => {
    const { h, project } = await linked(page);
    // What the relay keeps: each commit's ID, time, branch and card; each merge's branches, commit, time and cards.
    const state = await page.evaluate(async (p) => (await fetch(`/v1/projects/${p}/state`)).json(), project);
    expect([...state.merges].sort((a: { branch: string }, b: { branch: string }) => a.branch.localeCompare(b.branch))).toEqual([
      expect.objectContaining({ branch: "feat/checkout", into: "main", commit: h.merged, cards: [h.cards.cookie, h.cards.deletion].sort() }),
      expect.objectContaining({ branch: "fix/typo", into: "main", commit: h.squashed, cards: [h.cards.typo] }),
    ]);
    expect(state.commits.map((c: { commit: string }) => c.commit).sort()).toEqual([...h.commits].sort());
    expect(JSON.stringify(state)).not.toMatch(/Secret subject|acquisition/);
    const log = await page.evaluate(async (p) => (await fetch(`/v1/projects/${p}/log?after=0`)).json(), project);
    const ledger = log.entries.filter((e: { path: string }) => e.path.startsWith("ledger/") || e.path.startsWith("merges/"));
    expect(ledger.length).toBe(h.commits.length + 2);
    for (const e of ledger) expect(Buffer.from(e.body, "base64").toString()).not.toMatch(/Secret subject|acquisition/);

    const panel = await openPanel(page);
    // Answered before linking, in the record at the linking commit (main's), counts (B-3zjjx); feat/catalog's answer
    // wasn't in it, so both its cards wait.
    await seesHistory(page, panel, h, { answered: false });
    await check(page);
    await shot(page, "site");
  });

  for (const size of PHONES.slice(0, 1)) {
    test.describe(`${size.name}, ${size.width}×${size.height}`, () => {
      test.use(phone(size));
      test("fits the phone, every mark 44 px", async ({ page }) => {
        const { h } = await linked(page);
        const panel = await openPanel(page, true);
        await seesHistory(page, panel, h, { answered: false });
        await check(page, true);
        await shot(page, "site-phone");
      });
    });
  }
});
