import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Locator, type Page, expect, test } from "@playwright/test";
import type { ApiState } from "../src/api.js";
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

  test("a day's header sticks flush to the top of the list as it scrolls, with nothing showing above it", async ({ page }) => {
    await open(page);
    await page.setViewportSize({ width: 1440, height: 420 });
    await page.keyboard.press("b");
    const d = drawerOf(page);
    await expect(d.locator(".br-row.is-day").first()).toBeVisible();
    // Scrolled past the opening, the first day's header is stuck: its top is the scroller's, with no band between.
    const gap = await d.evaluate((el) => {
      const sc = el.querySelector(".drawer-scroll")!;
      sc.scrollTop = sc.scrollHeight;
      const top = sc.getBoundingClientRect().top;
      const stuck = [...sc.querySelectorAll(".br-row.is-day")].map((h) => h.getBoundingClientRect().top).filter((t) => t <= top + 40);
      return stuck.length ? Math.min(...stuck.map((t) => Math.abs(t - top))) : null;
    });
    expect(gap).not.toBeNull();
    expect(gap!).toBeLessThan(1);
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

  // ---------------------------------------------------------------------------------------- the bug sweep (2026-11-05)

  /** The history's state, as the server gives it, changed by `patch`, and served in its place: a fixture of its own. */
  async function openPatched(page: Page, patch: (s: ApiState, h: History) => void) {
    const { dir, h } = await open(page);
    const state = (await (await page.request.get(new URL("/api/state", server!.url).toString())).json()) as ApiState;
    patch(state, h);
    await page.route(/\/api\/state(\?|$)/, (r) => r.fulfill({ json: state }));
    await page.reload();
    await expect(page.locator("main.desk")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    return { dir, h, state };
  }
  const NOON = (days: number, now: number) => {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    return d.getTime() - days * 86_400_000;
  };
  /**
   * The history spread over four days, at noon, in its own order: main's card three days back, feat/checkout and its merge
   * two, fix/typo and its squash one, feat/catalog today; and `extra` days with nothing but commits after (IF-11).
   */
  function overDays(s: ApiState, o: { now?: number } = {}) {
    const now = Date.parse(s.server.now);
    const days: Record<string, number> = { main: 3, "feat/checkout": 2, "fix/typo": 1, "feat/catalog": 0 };
    const t0 = Math.min(...s.cards.map((c) => Date.parse(c.meta.created)));
    const move = (at: string, branch: string) => new Date(NOON(days[branch] ?? 0, now) + (Date.parse(at) - t0)).toISOString();
    for (const c of s.cards) {
      const b = c.meta.source_branch;
      c.meta.created = move(c.meta.created, b);
      for (const v of c.verdicts) v.at = move(v.at, b);
    }
    for (const c of s.commits ?? []) c.at = move(c.at, c.branch);
    for (const m of s.merges ?? []) m.at = move(m.at, m.branch);
    s.server.now = new Date(o.now ?? NOON(0, now) + 3_600_000).toISOString();
  }
  /** Open every folded day, one at a time: each fold goes as its day opens. */
  async function unfoldAll(d: Locator) {
    for (let i = 0; i < 20 && (await d.locator(".br-row.is-fold .br-rb").count()); i++) await d.locator(".br-row.is-fold .br-rb").first().click();
    await expect(d.locator(".br-row.is-fold")).toHaveCount(0);
  }
  /** Every line a row's gutter draws to its bottom edge goes on at the top of the next row, by its x (G-2, G-3). */
  const gutterBreaks = (d: Locator) =>
    d.evaluate((el) => {
      const rows = [...el.querySelectorAll<HTMLElement>("li.br-row")];
      const at = (li: HTMLElement, edge: "top" | "bottom") =>
        new Set(
          [...li.querySelectorAll<SVGLineElement>(":scope > svg.br-g > line:not(.cap)")]
            .filter((l) => (edge === "top" ? l.getAttribute("y1") === "0" : l.getAttribute("y2") === "100%"))
            .map((l) => l.getAttribute("x1")),
        );
      const out: string[] = [];
      for (let i = 0; i + 1 < rows.length; i++) {
        const a = at(rows[i]!, "bottom");
        const b = at(rows[i + 1]!, "top");
        const name = (li: HTMLElement) => li.querySelector("[data-row]")?.getAttribute("data-row") ?? li.className;
        for (const x of a) if (!b.has(x)) out.push(`x=${x} stops at the bottom of ${name(rows[i]!)}`);
        for (const x of b) if (!a.has(x)) out.push(`x=${x} starts at the top of ${name(rows[i + 1]!)}`);
      }
      return out;
    });

  test("draws every branch's line whole, from its fork to its merge, every way the list is drawn (G-2, G-3)", async ({ page }) => {
    await openPatched(page, (s) => overDays(s));
    await page.keyboard.press("b");
    const d = drawerOf(page);
    await unfoldAll(d);
    expect(await gutterBreaks(d)).toEqual([]);
    await d.getByRole("switch", { name: "Commits" }).click();
    expect(await gutterBreaks(d)).toEqual([]);
    await d.getByRole("button", { name: /^You chose otherwise/ }).click();
    expect(await gutterBreaks(d)).toEqual([]);
  });

  test("Go to: the day picked starts at the top of the list, above or below, its first row focused; the same day again goes again (IF-1, IF-8, IF-12)", async ({ page }) => {
    await openPatched(page, (s) => overDays(s));
    await page.setViewportSize({ width: 1440, height: 560 });
    await page.keyboard.press("b");
    const d = drawerOf(page);
    const go = d.getByRole("combobox", { name: "Go to" });
    const days = (await go.locator("option:not([disabled])").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))).filter(Boolean);
    expect(days).toHaveLength(4);
    /** Where the day's header and first row are, against the top of the list's scroller. */
    const placed = (dk: string) =>
      d.evaluate((el, dk) => {
        const top = el.querySelector(".drawer-scroll")!.getBoundingClientRect().top;
        const group = el.querySelector(`.is-day[data-day="${dk}"]`)!.closest(".br-day")!;
        const head = group.querySelector(".is-day")!.getBoundingClientRect();
        const first = group.querySelector(".br-rb")!.getBoundingClientRect();
        return { head: Math.round(head.top - top) || 0, first: Math.round(first.top - head.bottom) || 0 };
      }, dk);
    const firstRow = async (dk: string) => (await d.locator(`.br-day:has(.is-day[data-day="${dk}"]) .br-rb`).first().getAttribute("data-row"))!;
    // The oldest day, below (at the list's end, so it can't come all the way up); then two newer ones, above it.
    await go.selectOption(days.at(-1)!);
    await expect(page.locator(":focus")).toHaveAttribute("data-row", await firstRow(days.at(-1)!));
    for (const dk of [days[0]!, days[1]!]) {
      await go.selectOption(dk);
      await expect.poll(() => placed(dk)).toEqual({ head: 0, first: 0 });
      // Its first row has the tab stop and focus: the keyboard is where it asked to go.
      await expect(page.locator(":focus")).toHaveAttribute("data-row", await firstRow(dk));
      await expect(d.locator(".br-list [tabindex='0']")).toHaveCount(1);
      // It names no day of its own afterwards, so picking the same day again goes there again.
      await expect(go).toHaveValue("");
    }
    await d.locator(".drawer-scroll").evaluate((el) => (el.scrollTop = 0));
    await go.selectOption(days[1]!);
    await expect.poll(() => placed(days[1]!)).toEqual({ head: 0, first: 0 });
    await check(page);
  });

  test("keeps focus in the list when a button replaces itself, and Page Up from Now stays (IF-2, IF-10)", async ({ page }) => {
    const { h } = await openPatched(page, (s, h) => {
      overDays(s);
      // Six more cards that feat/checkout's merge brought, so its detail shows six, then "and N more".
      const cookie = s.cards.find((c) => c.meta.id === h.cards.cookie)!;
      const merged = s.merges!.find((m) => m.branch === "feat/checkout")!;
      for (let k = 0; k < 6; k++) {
        const c = structuredClone(cookie);
        c.meta.id = `B-zz${k}x${k}`;
        c.meta.title = `Another decision ${k}`;
        c.meta.created = new Date(Date.parse(cookie.meta.created) + (k + 1) * 1000).toISOString();
        s.cards.push(c);
        merged.cards.push(c.meta.id);
      }
    });
    await page.keyboard.press("b");
    const d = drawerOf(page);
    const focused = () => page.locator(":focus");
    // "Show the day": the day opens, and its first row has focus and the tab stop.
    const fold = d.locator(".br-row.is-fold .br-rb").first();
    await fold.focus();
    await page.keyboard.press("Enter");
    await expect(focused()).toHaveAttribute("data-row", /^(card|merge|lane|commit):/);
    await expect(d.locator(".br-list [tabindex='0']")).toHaveAttribute("data-row", (await focused().getAttribute("data-row"))!);
    await page.keyboard.press("ArrowDown");
    await expect(focused()).toHaveAttribute("data-row", /./);
    // A card's commit, or its branch, opened in its place: focus on "← Back".
    await unfoldAll(d);
    await row(d, `card:${h.cards.deletion}`).click();
    await detail(d).getByRole("button", { name: "About this branch" }).click();
    await expect(focused()).toHaveText("← Back");
    await page.keyboard.press("Enter");
    await expect(focused()).toHaveAttribute("data-row", `card:${h.cards.deletion}`);
    await detail(d).locator(".br-links .br-lnk").first().click();
    await expect(focused()).toHaveText("← Back");
    // A merge's "and 2 more": focus on the first card it showed.
    const merge = d.locator(".br-row.is-merge .br-rb", { hasText: "feat/checkout merged into main" });
    await merge.click();
    await detail(d).getByRole("button", { name: "and 2 more" }).click();
    await expect(focused()).toHaveAttribute("data-more-first", "true");
    // "Close this" in a branch's summary: focus back on its end, where it was opened.
    await row(d, "lane:feat/catalog").first().click();
    await detail(d).getByRole("button", { name: "Close this" }).click();
    await expect(focused()).toHaveAttribute("data-row", "lane:feat/catalog");
    // Page Up on the Now row: nothing is newer, so focus stays.
    await page.keyboard.press("Home");
    await page.keyboard.press("PageUp");
    await expect(focused()).toHaveAttribute("data-row", "lane:feat/catalog");
  });

  test("a merge's detail lists what it brought, commits too; the rows name what their detail controls (IF-7, IF-15)", async ({ page }) => {
    const { h } = await open(page);
    await page.keyboard.press("b");
    const d = drawerOf(page);
    // The dialog's description is the opening words, without the button beside them; the close button is "Close".
    const described = await d.evaluate((el) => document.getElementById(el.getAttribute("aria-describedby")!)!.textContent!.trim());
    expect(described).toMatch(/^One card is waiting for you.*Two branches have merged\.$/);
    await expect(d.getByRole("button", { name: "Close", exact: true })).toBeVisible();
    const merge = d.locator(".br-row.is-merge .br-rb", { hasText: "feat/checkout merged into main" });
    await merge.click();
    await expect(detail(d)).toContainText("2 cards and 2 commits citing cards it brought");
    await expect(detail(d).getByRole("button", { name: new RegExp(`^${h.commits[1]!.slice(0, 7)} `) })).toBeVisible();
    await expect(detail(d).getByRole("button", { name: new RegExp(`^${h.commits[2]!.slice(0, 7)} `) })).toBeVisible();
    await expect(merge).toHaveAttribute("aria-controls", "br-detail");
    await expect(d.locator("#br-detail")).toBeVisible();
    await check(page);
  });

  test("two merges of one branch at one commit, into two branches, are two rows: one picked is one open (IF-4)", async ({ page }) => {
    await openPatched(page, (s) => {
      const m = s.merges!.find((x) => x.branch === "feat/checkout")!;
      s.merges!.push({ ...m, into: "feat/catalog", at: new Date(Date.parse(m.at) + 60_000).toISOString() });
    });
    await page.keyboard.press("b");
    const d = drawerOf(page);
    const rows = d.locator(".br-row.is-merge .br-rb", { hasText: "feat/checkout merged into" });
    await expect(rows).toHaveCount(2);
    await rows.filter({ hasText: "into feat/catalog" }).click();
    await expect(d.locator(".br-row.is-merge.sel")).toHaveCount(1);
    await expect(detail(d)).toHaveCount(1);
    await expect(d.locator(".br-list [tabindex='0']")).toHaveCount(1);
  });

  test("a card returned to its agent holds its branch's merge, but isn't waiting for you (IF-6)", async ({ page }) => {
    await openPatched(page, (s, h) => {
      const c = s.cards.find((x) => x.meta.id === h.cards.prices)!;
      c.status = "returned";
      c.verdicts.push({ type: "verdict", format: 1, card: c.meta.id, revision: 1, response: "reject", reviewer: "tester", client: "test", at: new Date().toISOString() } as (typeof c.verdicts)[number]);
    });
    await page.keyboard.press("b");
    const d = drawerOf(page);
    await expect(d.locator(".br-status")).toContainText("Nothing is waiting for you.");
    await expect(d.locator(".br-go")).toHaveCount(0);
    await expect(d.getByRole("button", { name: /^Waiting for you/ })).toBeDisabled();
    await expect(d.locator(".is-now .br-endtag")).toHaveText(["feat/catalog · No merge recorded · Merge held: 1 waiting"]);
    await expect(d.locator(".br-row.is-day h3").first()).not.toContainText("waiting");
  });

  test("an idle branch keeps its end, and a day of commits alone shows nothing, with the Commits switch off (IF-5, G-9, IF-11)", async ({ page }) => {
    await openPatched(page, (s, h) => {
      overDays(s);
      // Three days on, and a commit of main's alone the day before.
      const now = Date.parse(s.server.now) + 3 * 86_400_000;
      s.server.now = new Date(now).toISOString();
      s.commits!.push({ commit: "f".repeat(40), branch: "main", card: h.cards.session, at: new Date(now - 86_400_000).toISOString() });
    });
    await page.keyboard.press("b");
    const d = drawerOf(page);
    // feat/catalog is idle, its last event a commit: its end, with its words, whatever the switch.
    const end = d.locator(".br-row.is-end [data-row='lane:feat/catalog']");
    await expect(end).toContainText("Merge held: 1 waiting · idle since");
    await expect(d.locator(".br-row.is-day")).toHaveCount(4);
    await expect(d.getByRole("combobox", { name: "Go to" }).locator("option:not([disabled])")).toHaveCount(4);
    await d.getByRole("switch", { name: "Commits" }).click();
    await expect(end).toHaveCount(1);
    await expect(d.locator(".br-row.is-day")).toHaveCount(5);
    await expect(d.getByRole("combobox", { name: "Go to" }).locator("option:not([disabled])")).toHaveCount(5);
    expect(await gutterBreaks(d)).toEqual([]);
  });

  test("each row's gutter reaches into the next, so a line has no hairline seam where rows meet (IF-14)", async ({ page }) => {
    await open(page);
    await page.keyboard.press("b");
    const d = drawerOf(page);
    const short = await d.evaluate((el) => [...el.querySelectorAll<HTMLElement>("li.br-row")].filter((li) => li.querySelector(":scope > svg.br-g")!.getBoundingClientRect().bottom < li.getBoundingClientRect().bottom + 0.9).length);
    expect(short).toBe(0);
  });

  for (const size of PHONES) {
    test.describe(`${size.name}, ${size.width}×${size.height}`, () => {
      test.use(phone(size));
      test("nothing behind the full-screen drawer takes focus (IF-3)", async ({ page }) => {
        await open(page);
        await branchesButton(page).tap();
        const d = drawerOf(page);
        await expect(d).toBeVisible();
        await expect(page.locator(".sheet-bar")).toHaveAttribute("inert", "");
        await page.keyboard.press("Tab");
        await expect(page.locator(".sheet-peek")).not.toBeFocused();
        await expect(d).toBeVisible();
      });
    });
  }

  test.describe("small Android, 360×740: a day's header on two lines", () => {
    test.use(phone(PHONES[1]));
    test("a row the arrow keys reach is never under its day's header, however tall it is (IF-13)", async ({ page }) => {
      await openPatched(page, (s, h) => {
        // Twenty more of main's cards that day: a list taller than the screen, and a header whose counts wrap.
        const session = s.cards.find((c) => c.meta.id === h.cards.session)!;
        for (let k = 0; k < 20; k++) {
          const c = structuredClone(session);
          c.meta.id = `B-yy${String(k).padStart(2, "0")}y`;
          c.meta.title = `Another of main's decisions, ${k}`;
          c.meta.created = new Date(Date.parse(session.meta.created) + (k + 1) * 100).toISOString();
          s.cards.push(c);
        }
      });
      await branchesButton(page).tap();
      const d = drawerOf(page);
      const head = d.locator(".br-row.is-day").first();
      expect((await head.boundingBox())!.height).toBeGreaterThan(45);
      // Up through every row from the last: each lands below its day's sticky header.
      await d.locator(".br-list [tabindex='0']").focus();
      await page.keyboard.press("End");
      const covered: string[] = [];
      for (let i = 0; i < 30; i++) {
        await page.keyboard.press("ArrowUp");
        const gap = await page.evaluate(() => {
          const f = document.activeElement as HTMLElement;
          const top = f.closest(".br-day")?.querySelector(".br-row.is-day");
          return top ? Math.round(f.getBoundingClientRect().top - top.getBoundingClientRect().bottom) : 0;
        });
        if (gap < 0) covered.push(`${await page.locator(":focus").getAttribute("data-row")}: ${gap}px`);
      }
      expect(covered).toEqual([]);
    });
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
