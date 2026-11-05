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

// D181 redrawn (B-v8jzy, B-vfdhz, B-tgq5p): "Your decisions, by branch", a list in a drawer beside the desk on a computer,
// and filling the screen on a phone, on the local desk and the website's. A real repo's history, made by git and the hooks
// (e2e/branches.ts): feat/checkout merged into main by a merge commit, fix/typo squashed into it, feat/catalog still open
// with a card waiting, and the commits that cite cards. Locally the server reads them from the live layer; on the website
// they went up through the relay, and commit subjects never did. With BAESIAN_SHOTS set to a folder, each screen is saved.

let server: RunningServer | undefined;
test.afterEach(async () => {
  await server?.close();
  server = undefined;
  cleanup();
});

const CARD = ".stage article.card:not([data-leaving])";
const drawerOf = (page: Page) => page.getByRole("dialog", { name: "Your decisions, by branch" });
const branchesButton = (page: Page) => page.getByRole("button", { name: /^Branches/ });
const row = (d: Locator, key: string) => d.locator(`[data-row="${key}"]`);
const detail = (d: Locator) => d.locator(".br-row.is-detail .br-callout");

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

/** What the list must show of the history, wherever it's drawn from. */
async function seesHistory(d: Locator, h: History, opts: { answered: boolean }) {
  const waiting = opts.answered ? 1 : 2;
  await expect(d.locator(".br-status")).toHaveText(
    `${opts.answered ? "One card is" : "Two cards are"} waiting for you, holding feat/catalog from merging. 6 cards on 4 branches: you chose otherwise than the agent on 1, and 1 was withdrawn. Two branches have merged. Show the oldest`,
  );
  // The branches still open, at the top; main is the trunk, with no end.
  await expect(d.locator(".is-now .br-endtag")).toHaveText([`feat/catalog · No merge recorded · Merge held: ${waiting} waiting`]);
  await expect(d.locator(".br-endtag", { hasText: /^main/ })).toHaveCount(0);
  // A row per card, merge and branch start, newest first.
  await expect(d.locator(".br-row.is-card")).toHaveCount(6);
  // (Git keeps a merge's time to the second, and the history is made in a few: their order within a second isn't fixed.)
  await expect(d.locator(".br-row.is-merge")).toHaveCount(2);
  expect((await d.locator(".br-row.is-merge .br-rs").allTextContents()).sort()).toEqual(["feat/checkout merged into main", "fix/typo merged into main"]);
  await expect(d.locator(".br-row.is-fork")).toHaveCount(3);
  expect((await d.locator(".br-row.is-fork .br-tx").allTextContents()).sort()).toEqual(["feat/catalog began, from main (a guess: nothing records it)", "feat/checkout began, from main", "fix/typo began, from main"]);
  await expect(d.locator(".br-row.is-card .br-rt").first()).toHaveText("How prices are stored");
  await expect(d.locator(".br-row.is-card .br-rt").last()).toHaveText("Where the session lives");
  // Where a branch began is dashed, a guess; a merge is solid, with its arrowhead.
  await expect(d.locator(".is-fork path.fork")).toHaveCount(3);
  await expect(d.locator(".is-merge path.m-merge")).toHaveCount(2);
  // No commit rows until the switch is on, and no lines from commits to cards anywhere.
  await expect(d.locator(".br-row.is-commit")).toHaveCount(0);
  await d.getByRole("switch", { name: "Commits" }).click();
  await expect(d.locator(".br-row.is-commit")).toHaveCount(h.commits.length);
  await d.getByRole("switch", { name: "Commits" }).click();
  await expect(d.locator(".br-row.is-commit")).toHaveCount(0);
  // Nothing anywhere says a commit's subject.
  await expect(d).not.toContainText("Secret subject");
  await expect(d).not.toContainText("acquisition");
}

test.describe("the local desk", () => {
  async function open(page: Page) {
    const { dir, store } = repo();
    const h = await makeHistory(dir);
    server = await startServer(store, { reviewer: "tester", writeServerFile: false, debounceMs: 20 });
    await skipSetup(page, dir);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(server.url);
    await expect(page.locator(CARD)).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    return { dir, h };
  }

  test("opens beside the desk and closes every way, giving focus back; the desk moves aside, whole, under a veil", async ({ page }) => {
    await open(page);
    const d = drawerOf(page);
    await expect(d).toBeHidden();

    // The header's button: focus goes to the list, on the oldest card waiting, opened.
    await branchesButton(page).click();
    await expect(d).toBeVisible();
    await expect(branchesButton(page)).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(":focus")).toHaveAttribute("data-row", /^card:/);
    await expect(page.locator(":focus .br-rt")).toHaveText("How prices are stored");
    await expect(detail(d)).toContainText("Waiting for you");
    // 480 px from the right; the card on the desk is whole, beside it, and the desk takes no keys or clicks.
    const box = (await d.boundingBox())!;
    expect(Math.round(box.width)).toBe(480);
    expect(Math.round(box.x + box.width)).toBe(1440);
    const card = (await page.locator(CARD).boundingBox())!;
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.x + card.width).toBeLessThanOrEqual(box.x);
    await expect(page.locator("main.desk")).toHaveAttribute("inert", "");
    await check(page);
    await shot(page, "local-open");
    // Esc closes it, and focus goes back to the button.
    await page.keyboard.press("Escape");
    await expect(d).toBeHidden();
    await expect(branchesButton(page)).toBeFocused();
    await expect(branchesButton(page)).toHaveAttribute("aria-expanded", "false");

    // B opens it and closes it, from the card.
    await page.locator(CARD).focus();
    await page.keyboard.press("b");
    await expect(d).toBeVisible();
    await page.keyboard.press("b");
    await expect(d).toBeHidden();
    await expect(page.locator(CARD)).toBeFocused();
    await expect(page.locator(CARD)).toHaveAttribute("data-mode", "live");

    // The menu's item, with its key, and the Close button: focus goes back to More.
    await page.getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("menuitem", { name: "Your decisions, by branch B" })).toBeVisible();
    await page.getByRole("menuitem", { name: /^Your decisions, by branch/ }).click();
    await expect(d).toBeVisible();
    await d.getByRole("button", { name: /^Close/ }).click();
    await expect(d).toBeHidden();
    await expect(page.getByRole("button", { name: "More" })).toBeFocused();

    // A click on the desk, under its veil.
    await branchesButton(page).click();
    await expect(d).toBeVisible();
    await page.mouse.click(300, 450);
    await expect(d).toBeHidden();

    // The keys panel names B.
    await page.keyboard.press("?");
    await expect(page.getByRole("complementary", { name: "Keyboard shortcuts" })).toContainText("Your decisions, by branch: opens them beside the desk, and closes them");
  });

  test("lists the history from the live layer, newest first, with one tab stop and the arrow keys between rows", async ({ page }) => {
    const { h } = await open(page);
    await page.keyboard.press("b");
    const d = drawerOf(page);
    await seesHistory(d, h, { answered: true });
    await expect(d.locator(".br-list [tabindex='0']")).toHaveCount(1);
    await check(page);
    await shot(page, "local-list");

    // The arrow keys: down and back up return; along a branch, left is newer and right older; Home and End.
    const focused = () => page.locator(":focus");
    await row(d, `card:${h.cards.prices}`).focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowDown");
    await expect(focused()).toHaveAttribute("data-row", /^(card|merge):/);
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowUp");
    await expect(focused()).toHaveAttribute("data-row", `card:${h.cards.prices}`);
    await page.keyboard.press("ArrowRight");
    await expect(focused()).toHaveAttribute("data-row", `card:${h.cards.kitchen}`);
    await page.keyboard.press("ArrowLeft");
    await expect(focused()).toHaveAttribute("data-row", `card:${h.cards.prices}`);
    await page.keyboard.press("ArrowLeft");
    await expect(focused()).toHaveAttribute("data-row", "lane:feat/catalog");
    await page.keyboard.press("End");
    await expect(focused()).toHaveAttribute("data-row", `card:${h.cards.session}`);
    // Page Up: the day's first row (the history is made in a day).
    await page.keyboard.press("PageUp");
    await expect(focused()).toHaveAttribute("data-row", (await d.locator(".br-dayrows .br-rb").first().getAttribute("data-row"))!);
    await page.keyboard.press("Home");
    await expect(focused()).toHaveAttribute("data-row", "lane:feat/catalog");
    await expect(d.locator(".br-list [tabindex='0']")).toHaveCount(1);
    // The arrow keys stay in the list: the card on the desk didn't lean.
    await expect(page.locator(CARD)).toHaveAttribute("data-mode", "live");

    // Enter opens a row's detail inline; again closes it. A branch's end opens its summary.
    await row(d, `card:${h.cards.deletion}`).focus();
    await page.keyboard.press("Enter");
    await expect(detail(d)).toContainText("You chose “Postgres”, not the agent's pick");
    await expect(detail(d)).toContainText("claude-code on feat/checkout");
    await expect(detail(d)).toContainText("The branch merged into main on");
    await page.keyboard.press("Enter");
    await expect(detail(d)).toHaveCount(0);
    await row(d, "lane:feat/catalog").click();
    await expect(detail(d)).toContainText("Merge held: 1 waiting");
    await expect(detail(d)).toContainText("from main: a guess, nothing records it");
    await check(page);
  });

  test("picking a card lights the commits that cite it, and lists them (B-vfdhz)", async ({ page }) => {
    const { h } = await open(page);
    await page.keyboard.press("b");
    const d = drawerOf(page);
    await d.getByRole("switch", { name: "Commits" }).click();
    await row(d, `card:${h.cards.deletion}`).click();
    const cites = h.commits[2]!;
    const lit = d.locator(".br-row.is-commit.linked");
    await expect(lit).toHaveCount(1);
    await expect(lit.locator(".br-rb")).toHaveAttribute("data-row", `commit:${cites}`);
    await expect(lit).toContainText("↳ cites the selected card");
    await expect(lit.locator(".m-commit.lit")).toHaveCount(1);
    await expect(d.locator(".br-row.linked")).toHaveCount(1);
    // Its detail lists them as buttons; one opens the commit in the card's place, with Back.
    await expect(detail(d).locator(".br-list-h")).toHaveText("Cited by 1 commit:");
    await detail(d).getByRole("button", { name: new RegExp(`^${cites.slice(0, 7)} \\d\\d:\\d\\d · this branch$`) }).click();
    await expect(detail(d).locator(".br-h")).toHaveText(`Commit ${cites.slice(0, 7)}`);
    await expect(detail(d)).toContainText("on feat/checkout");
    await check(page);
    await shot(page, "local-commits");
    await detail(d).getByRole("button", { name: "← Back" }).click();
    await expect(detail(d)).toContainText("You chose “Postgres”");
    // Picking the commit lights its card.
    await row(d, `commit:${cites}`).click();
    await expect(d.locator(".br-row.is-card.linked .br-rb")).toHaveAttribute("data-row", `card:${h.cards.deletion}`);
    await expect(d.locator(".br-row.is-card.linked")).toContainText("↳ cited by the selected commit");
    // With the switch off, the commits have no rows, and the card's detail still lists them.
    await d.getByRole("switch", { name: "Commits" }).click();
    await row(d, `card:${h.cards.cookie}`).click();
    await expect(d.locator(".br-row.is-commit")).toHaveCount(0);
    await expect(detail(d).locator(".br-lnk")).toHaveCount(1);
  });

  test("opens a card on the desk: one to answer as from the path, a settled one to look at, with the way back", async ({ page }) => {
    const { h } = await open(page);
    await page.locator(CARD).focus();
    await page.keyboard.press("b");
    const d = drawerOf(page);
    // A settled card: the drawer closes, and the card is on the desk as it was settled.
    await row(d, `card:${h.cards.deletion}`).click();
    await detail(d).getByRole("button", { name: "Open it on the desk" }).click();
    await expect(d).toBeHidden();
    await expect(page.locator(CARD)).toHaveAttribute("aria-label", "What should deleting an account remove?");
    await expect(page.locator(CARD)).toHaveAttribute("data-mode", "past");
    await expect(page.locator(CARD)).toBeFocused();
    await expect(page.locator(`${CARD} .result`)).toContainText("You chose “Postgres”, not the agent's pick.");
    await expect(page.locator(`${CARD} .opt.chosen h2`)).toHaveText("Postgres");
    await check(page);
    await shot(page, "local-past");
    // B goes back to the list, where it was.
    await page.keyboard.press("b");
    await expect(d).toBeVisible();
    await expect(page.locator(":focus")).toHaveAttribute("data-row", `card:${h.cards.deletion}`);
    await page.keyboard.press("Escape");
    // Esc on the desk goes back to the next card.
    await page.keyboard.press("Escape");
    await expect(page.locator(CARD)).toHaveAttribute("aria-label", "How should prices be stored?");
    await expect(page.locator(CARD)).toHaveAttribute("data-mode", "live");

    // A card to answer opens to answer.
    await branchesButton(page).click();
    await row(d, `card:${h.cards.prices}`).click();
    if (!(await detail(d).count())) await row(d, `card:${h.cards.prices}`).click();
    await detail(d).getByRole("button", { name: "Open it on the desk" }).click();
    await expect(d).toBeHidden();
    await expect(page.locator(CARD)).toHaveAttribute("aria-label", "How should prices be stored?");
    await expect(page.locator(CARD)).toHaveAttribute("data-mode", "live");
  });

  test("Wider puts each row on one line; the handle drags, or takes the arrow keys; the filters fold the rest", async ({ page }) => {
    const { h } = await open(page);
    await page.keyboard.press("b");
    const d = drawerOf(page);
    await d.getByRole("button", { name: "Wider" }).click();
    await expect(d.getByRole("button", { name: "Wider" })).toHaveAttribute("aria-pressed", "true");
    expect(Math.round((await d.boundingBox())!.width)).toBe(880);
    // A card's time, title and what you chose on one line.
    const r = d.locator(`.br-row.is-card:has([data-row="card:${h.cards.kitchen}"])`);
    const [tm, rt, rm] = await Promise.all([r.locator(".br-tm"), r.locator(".br-rt"), r.locator(".br-rm")].map(async (l) => (await l.boundingBox())!));
    expect(Math.abs(tm!.y - rt!.y)).toBeLessThan(8);
    expect(Math.abs(rm!.y - rt!.y)).toBeLessThan(8);
    // The desk keeps its card whole beside it, its path folded away.
    const card = (await page.locator(CARD).boundingBox())!;
    expect(card.x + card.width).toBeLessThanOrEqual((await d.boundingBox())!.x);
    await check(page);
    await shot(page, "local-wide");

    // The handle: the arrow keys, Home and End.
    const grip = d.getByRole("separator", { name: /The drawer's width/ });
    await grip.focus();
    await page.keyboard.press("ArrowRight");
    await expect(grip).toHaveAttribute("aria-valuenow", "840");
    await page.keyboard.press("Home");
    await expect(grip).toHaveAttribute("aria-valuenow", "440");
    await page.keyboard.press("End");
    await expect(grip).toHaveAttribute("aria-valuenow", "920");
    // A drag.
    const g = (await grip.boundingBox())!;
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(1440 - 600, g.y + g.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect(grip).toHaveAttribute("aria-valuenow", "600");
    await d.getByRole("button", { name: "Wider" }).click();
    await expect(grip).toHaveAttribute("aria-valuenow", "880");
    await d.getByRole("button", { name: "Wider" }).click();
    await expect(grip).toHaveAttribute("aria-valuenow", "480");

    // A filter: the cards it matches, and the rest folded into rows that show them.
    await d.getByRole("button", { name: /^You chose otherwise/ }).click();
    await expect(d.locator(".br-row.is-card .br-rt")).toHaveText(["What deleting an account removes"]);
    await expect(d.locator(".br-row.is-more").first()).toContainText(/\d other cards?\. Show them/);
    await check(page);
    await d.locator(".br-row.is-more .br-rb").first().click();
    await expect(d.locator(".br-row.is-card")).toHaveCount(6);
    // Under reduced motion, nothing slides.
    expect(await d.evaluate((el) => getComputedStyle(el).transitionDuration)).toMatch(/^0s/);
  });

  for (const size of PHONES) {
    test.describe(`${size.name}, ${size.width}×${size.height}`, () => {
      test.use(phone(size));
      test("fills the phone: a tap opens a row's detail inline, every target 44 px", async ({ page }) => {
        const { h } = await open(page);
        await branchesButton(page).tap();
        const d = drawerOf(page);
        await expect(d).toBeVisible();
        const box = (await d.boundingBox())!;
        expect([Math.round(box.x), Math.round(box.width)]).toEqual([0, size.width]);
        await seesHistory(d, h, { answered: true });
        // It opens on the card waiting, open.
        await expect(detail(d)).toContainText("Waiting for you");
        await check(page, true);
        await shot(page, "local-phone");
        // A tap opens a row's detail under it; a second closes it.
        await row(d, `card:${h.cards.deletion}`).tap();
        await expect(detail(d)).toContainText("You chose “Postgres”");
        await check(page, true);
        await shot(page, "local-phone-row");
        await row(d, `card:${h.cards.deletion}`).tap();
        await expect(detail(d)).toHaveCount(0);
        // The filter is a select here, and the Commits switch adds the commits' rows.
        await d.getByRole("combobox", { name: "Show" }).selectOption("against");
        await expect(d.locator(".br-row.is-card")).toHaveCount(1);
        await d.getByRole("combobox", { name: "Show" }).selectOption("all");
        await d.getByRole("switch", { name: "Commits" }).tap();
        await expect(d.locator(".br-row.is-commit")).toHaveCount(h.commits.length);
        await check(page, true);
        await shot(page, "local-phone-commits");
        await d.getByRole("button", { name: /^Close/ }).tap();
        await expect(d).toBeHidden();
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
    await expect(page.locator(CARD)).toBeVisible();
    return { dir, h, project };
  }

  test("lists the history from the relay's state in the drawer: the merges and the commits went up, the commits' subjects didn't", async ({ page }) => {
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

    await branchesButton(page).click();
    const d = drawerOf(page);
    await expect(d).toBeVisible();
    // Answered before linking, in the record at the linking commit (main's), counts (B-3zjjx); feat/catalog's answer
    // wasn't in it, so both its cards wait, and the oldest is open.
    await expect(page.locator(":focus .br-rt")).toHaveText("How orders reach the kitchen");
    await seesHistory(d, h, { answered: false });
    // A picked card lights the commit citing it.
    await d.getByRole("switch", { name: "Commits" }).click();
    await row(d, `card:${h.cards.cookie}`).click();
    await expect(d.locator(".br-row.is-commit.linked")).toContainText("↳ cites the selected card");
    await check(page);
    await shot(page, "site");
    await page.keyboard.press("Escape");
    await expect(d).toBeHidden();
    await expect(branchesButton(page)).toBeFocused();
  });

  for (const size of PHONES.slice(0, 1)) {
    test.describe(`${size.name}, ${size.width}×${size.height}`, () => {
      test.use(phone(size));
      test("fills the phone, every target 44 px", async ({ page }) => {
        const { h } = await linked(page);
        await branchesButton(page).tap();
        const d = drawerOf(page);
        await seesHistory(d, h, { answered: false });
        await check(page, true);
        await shot(page, "site-phone");
      });
    });
  }
});
