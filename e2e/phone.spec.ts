import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Page, expect, test } from "@playwright/test";
import { type RunningServer, startServer } from "../src/server.js";
import type { Store } from "../src/store.js";
import { BODY, cleanup, draft, repo } from "../test/helpers.js";
import { layoutProblems, smallTargets } from "./layout.js";
import { fileRound5 } from "./round5.js";
import { skipSetup } from "./setup.js";
import { Finger, PHONES, phone, shot } from "./touch.js";

// The phone layout (D130): every screen at 390×844 and 360×740, portrait, with touch. The layout check (e2e/layout.ts)
// and the 44 px touch targets on every screen; the card full width, the path folded into a sheet you pull up; answering
// by tap, swipe and press-and-hold; writing with the keyboard open; nothing sideways; the notch's safe areas; reduced
// motion. With BAESIAN_SHOTS set to a folder, each screen at 390×844 is saved there as a screenshot.

let server: RunningServer | undefined;
test.afterEach(async () => {
  await server?.close();
  server = undefined;
  cleanup();
});

const CARD = "article.card:not([data-leaving])";

/** The layout check and the touch targets, now, as lines to collect. */
async function check(page: Page, problems: string[], state: string) {
  await page.waitForTimeout(80); // the path's lines are measured after layout
  for (const p of await page.evaluate(layoutProblems)) problems.push(`${state}: ${p}`);
  for (const p of await page.evaluate(smallTargets)) problems.push(`${state}: ${p}`);
}

const WHO = { by: "gus", client: "test" };
let n = 0;
/** A card on its own topic, so none is a possible duplicate of another. */
const file = (store: Store, over: Record<string, unknown> = {}) => {
  n += 1;
  return store.fileCard(draft({ title: `Decision ${n}`, question: `Which way for decision ${n}?`, topic: `area${n}/q`, reverse: "cheap", ...over }), BODY, { agent: "claude-code", force: true }).card.meta.id;
};
const answer = (store: Store, id: string, over: Record<string, unknown> = {}) =>
  store.addVerdict({ card: id, revision: store.card(id)!.meta.revision, response: "accept", reviewer: "gus", client: "web", ...over } as Parameters<Store["addVerdict"]>[0]);

/** A temp repo set up by `setup`, its server, and the page on it: the setup survey put off unless it's wanted. */
async function open(page: Page, setup: (store: Store, dir: string) => void, opts: { survey?: boolean; clock?: boolean; reduced?: boolean } = {}) {
  const r = repo();
  setup(r.store, r.dir);
  server = await startServer(r.store, { reviewer: "tester", writeServerFile: false, debounceMs: 20 });
  if (!opts.survey) await skipSetup(page, r.dir);
  if (opts.reduced !== false) await page.emulateMedia({ reducedMotion: "reduce" });
  if (opts.clock !== false) await page.clock.install();
  await page.goto(server.url);
  await expect(page.locator(CARD)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return r;
}
const menu = async (page: Page, item: string | RegExp) => {
  await page.getByRole("button", { name: "More" }).tap();
  await page.getByRole("menuitem", { name: item }).tap();
};
/** Goes to the card asking `question`, from its row in the path's sheet, past its deck's briefing card. */
async function reach(page: Page, question: string, row: string) {
  for (let i = 0; i < 4; i++) {
    const label = await page.locator(CARD).getAttribute("aria-label");
    if (label === question) return;
    if (label?.startsWith("The briefing for")) await page.locator(CARD).getByRole("button", { name: /Go to its cards/ }).tap();
    else {
      await page.locator(".sheet-peek").tap();
      await page.getByRole("dialog", { name: "Your path" }).locator(".row.next", { hasText: row }).tap();
    }
    await page.waitForTimeout(60);
  }
  await expect(page.locator(CARD)).toHaveAttribute("aria-label", question);
}

for (const size of PHONES) {
  test.describe(`${size.name}, ${size.width}×${size.height}`, () => {
    test.use(phone(size));

    test("every state of the desk fits the phone: the card full width, the path in its sheet, answering by touch", async ({ page }) => {
      const { store, dir } = repo();
      const r5 = fileRound5(store);
      server = await startServer(store, { reviewer: "gus", writeServerFile: false, debounceMs: 20 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await skipSetup(page, dir);
      await page.clock.install();
      await page.goto(server.url);
      await expect(page.locator(CARD)).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const finger = await Finger.on(page);
      const problems: string[] = [];
      const settle = () => page.clock.runFor(1200);
      const opt = (kind: "proposal" | "alternative") => page.locator(`${CARD} .opt[data-kind="${kind}"]`);
      const bar = page.locator(".sheet-peek");
      const sheet = page.getByRole("dialog", { name: "Your path" });

      // The first card: mythic, blocking, with a rule it may break and a decision it builds on. Full width, no path.
      await check(page, problems, "first card, reading");
      await shot(page, "01-first-card-reading");
      await page.clock.fastForward(3100);
      const card = (await page.locator(CARD).boundingBox())!;
      expect(card.width).toBeGreaterThan(size.width - 32);
      await expect(page.locator(".desk .hood")).toHaveCount(0);
      await expect(bar).toContainText("Your path");
      await check(page, problems, "first card");
      await shot(page, "02-first-card");
      await page.locator(".desk").evaluate((d) => d.scrollTo(0, d.scrollHeight));
      await check(page, problems, "first card, scrolled to its foot");
      await shot(page, "03-first-card-foot");

      await opt("proposal").tap();
      await expect(page.locator(CARD)).toHaveAttribute("data-mode", "reveal");
      await check(page, problems, "the reveal, agreeing");
      await shot(page, "04-reveal-agreeing");
      await page.locator(CARD).getByRole("button", { name: "Back to the choice" }).tap();
      await opt("alternative").tap();
      await check(page, problems, "the reveal, disagreeing");
      await shot(page, "05-reveal-disagreeing");
      await page.locator(CARD).getByRole("button", { name: "Back to the choice" }).tap();
      await page.locator(CARD).getByRole("button", { name: /Other answer/ }).tap();
      await check(page, problems, "writing an answer");
      await shot(page, "06-writing");
      await page.locator(CARD).getByRole("button", { name: "Cancel" }).tap();
      await page.locator(CARD).getByRole("button", { name: /Can't judge/ }).tap();
      await check(page, problems, "can't judge");
      await shot(page, "07-cant-judge");
      await page.locator(CARD).getByRole("button", { name: "Cancel" }).tap();

      // Answer it, held to confirm: the toast offers undo, above the path's bar.
      await opt("alternative").tap();
      await finger.press(await finger.at(page.locator(`${CARD} .hold`)), 1000);
      await expect(page.getByRole("status")).toContainText("Sending to claude-code in");
      await check(page, problems, "the toast, after answering");
      await shot(page, "08-toast");
      await settle();

      // The path's sheet: your answer, the card's connections, what's next.
      await expect(bar).toContainText("1 answered");
      await bar.tap();
      await expect(sheet).toBeVisible();
      // The undo toast waits above the sheet, not over its rows.
      const toast = (await page.getByRole("status").boundingBox())!;
      expect(toast.y + toast.height).toBeLessThanOrEqual((await sheet.boundingBox())!.y);
      await check(page, problems, "the path's sheet");
      await shot(page, "09-sheet");
      const conflict = sheet.locator(".row.next", { hasText: "Which time format the record uses" });
      if (await conflict.count()) await conflict.tap();
      else await sheet.getByRole("button", { name: /Your path/ }).tap();
      await expect(sheet).toBeHidden();
      await settle();
      await page.clock.fastForward(3100);
      await expect(page.locator(CARD)).toHaveAttribute("aria-label", "Which time format should the record use?");
      await check(page, problems, "the conflict card");
      await shot(page, "10-conflict-card");

      // A card arrives while you answer.
      r5.fileRelativeTimes();
      await expect(page.locator(".summary")).toContainText("5 to answer");
      await opt("proposal").tap();
      await page.locator(CARD).getByRole("button", { name: /Confirm/ }).tap();
      await settle();
      await check(page, problems, "third card, two answers in the path");

      // Reopening an answer from the sheet.
      await bar.tap();
      await sheet.locator(".row.past").first().tap();
      await settle();
      await expect(page.locator(CARD)).toHaveAttribute("data-mode", "review");
      await check(page, problems, "reviewing an answer");
      await shot(page, "11-review");
      await page.locator(CARD).getByRole("button", { name: /Back to the next card/ }).tap();
      await settle();

      // The menu and its panels.
      await page.getByRole("button", { name: "More" }).tap();
      await check(page, problems, "the menu");
      await shot(page, "12-menu");
      await page.getByRole("menuitem", { name: "Gestures" }).tap();
      await check(page, problems, "gestures");
      await shot(page, "13-gestures");
      await page.getByRole("button", { name: "Close" }).tap();
      await page.getByRole("button", { name: "More" }).tap();
      await page.getByRole("menuitem", { name: "Your calibration" }).tap();
      await check(page, problems, "your calibration");
      await shot(page, "14-calibration");
      await page.getByRole("button", { name: "Close" }).tap();

      // Answer the rest, and the desk empties.
      for (let i = 0; i < 6 && (await page.locator(CARD).count()); i++) {
        await page.clock.fastForward(3100);
        await opt("proposal").tap();
        if (await page.locator(`${CARD}.rarity-mythic`).count()) await finger.press(await finger.at(page.locator(`${CARD} .hold`)), 1000);
        else await page.locator(CARD).getByRole("button", { name: /Confirm/ }).tap();
        await settle();
      }
      await page.clock.fastForward(5100);
      await expect(page.locator(".empty")).toBeVisible();
      await expect(page.locator(".empty")).toHaveCSS("opacity", "1"); // its fade in, or the check sees nothing
      await check(page, problems, "the empty desk");
      await shot(page, "15-empty-desk");

      expect(problems).toEqual([]);
    });

    test("the setup survey, your preferences with their five-stop rows, and the record fit the phone", async ({ page }) => {
      const { store } = await open(page, (s) => {
        answer(s, file(s, { touches: ["dependency"] }));
        answer(s, file(s, { touches: ["dependency"] }), { response: "alternative", choice: "Postgres", first_choice: "alternative" });
        file(s, { touches: ["user-facing"], title: "The empty page", question: "What should an empty page say?" });
      }, { survey: true });
      const finger = await Finger.on(page);
      const problems: string[] = [];
      await expect(page.locator(CARD)).toHaveAttribute("aria-label", "Setting up your preferences");
      await check(page, problems, "the survey's offer");
      await shot(page, "16-setup-offer");
      await page.locator(CARD).getByRole("button", { name: /Start/ }).tap();
      await expect(page.locator(CARD)).toHaveAttribute("aria-label", "Which library should parse dates in the import step?");
      await check(page, problems, "an example decision");
      await shot(page, "17-setup-example");
      // Answered by swiping the card, as a decision is, and by tapping.
      await finger.swipe(await finger.at(page.locator(`${CARD} h1`)), 220, 0);
      await expect(page.locator(CARD)).toHaveAttribute("aria-label", "Should the CI workflow cache installed packages between runs?");
      for (let i = 0; i < 5; i++) await page.locator(`${CARD} .opt[data-side="right"]`).tap();
      const result = page.getByRole("article", { name: "The preset your answers suggest" });
      await expect(result.locator("h1")).toHaveText("Hands-off");
      await check(page, problems, "the survey's suggestion");
      await shot(page, "18-setup-result");

      await result.getByRole("button", { name: "Adjust it first" }).tap();
      const prefs = page.getByRole("complementary", { name: "Your preferences" });
      await expect(prefs.getByRole("button", { name: /^Hands-off/ })).toHaveAttribute("aria-pressed", "true");
      await check(page, problems, "your preferences");
      await shot(page, "19-preferences");
      // A stop is tapped by its words.
      const row = prefs.getByRole("radiogroup", { name: "Product behaviour" });
      await row.locator("label", { hasText: "stop and ask" }).tap();
      await expect(row.getByRole("radio", { name: "stop and ask" })).toBeChecked();
      await prefs.locator(".pref-rows").scrollIntoViewIfNeeded();
      await check(page, problems, "your preferences, row by row");
      await shot(page, "20-preferences-rows");
      await prefs.evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await check(page, problems, "your preferences, at their foot");
      await shot(page, "21-preferences-foot");
      await prefs.getByRole("button", { name: "Save" }).tap();
      await expect.poll(() => store.inForce().file?.row_user_facing).toBe("stop-and-ask");
      await prefs.getByRole("button", { name: "Close" }).tap();

      await menu(page, "Your calibration");
      const calibration = page.getByRole("complementary", { name: "Your calibration" });
      await expect(calibration.locator(".record h5")).toHaveText("What reached you, row by row");
      await check(page, problems, "your calibration and the record");
      await calibration.locator(".record").scrollIntoViewIfNeeded();
      await check(page, problems, "the record, row by row");
      await shot(page, "22-record");
      expect(problems).toEqual([]);
    });

    test("held back, a held card answered blind, and Baesian's own cards fit the phone", async ({ page }) => {
      let first = "";
      const { store } = await open(page, (s) => {
        s.writePreferences({ preset: "hands-off", mode: "enforce", row_user_facing: "tell-me", rate_agent_decides: 0, rate_sample: 0, burn_in: 0 }, WHO);
        file(s, { touches: ["dependency"], title: "The date library", question: "Which library should parse dates?", acted: "it added SQLite to package.json", acted_option: "proposal", rationale: "One file is enough." });
        first = file(s, { touches: ["user-facing"], title: "The empty page", question: "What should an empty page say?" });
      });
      const problems: string[] = [];
      await menu(page, /Held back/);
      const panel = page.getByRole("complementary", { name: "Held back" });
      await expect(panel).toContainText("Your settings held these back");
      await check(page, problems, "held back");
      await shot(page, "23-held-panel");
      await panel.getByRole("button", { name: /The date library/ }).tap();
      await expect(page.locator(CARD)).toHaveAttribute("aria-label", "Which library should parse dates?");
      await check(page, problems, "a held card, blind");
      await page.locator(`${CARD} .opt[data-kind="alternative"]`).tap();
      await expect(page.locator(`${CARD} .facet.held`)).toBeVisible();
      await check(page, problems, "a held card, what was done");
      await shot(page, "24-held-reveal");
      await page.locator(CARD).getByRole("button", { name: /Overturn it/ }).tap();
      await page.clock.fastForward(5100);

      // The empty page, overturned with a rule in its reason: Baesian proposes a setting and a rule.
      await expect(page.locator(CARD)).toHaveAttribute("aria-label", "What should an empty page say?");
      await page.locator(`${CARD} .opt[data-kind="alternative"]`).tap();
      await page.locator(CARD).getByPlaceholder("One line").fill("Always the platform's own.");
      await page.locator(CARD).getByRole("button", { name: /Confirm/ }).tap();
      await page.clock.fastForward(5100);
      await expect.poll(() => store.verdicts(first).length).toBe(1);
      await reach(page, "Should this decision become a rule?", "A pattern in your answers");
      await check(page, problems, "a convention card");
      await shot(page, "25-convention-card");
      const slider = page.locator(".summary");
      await expect(slider).toContainText("to answer");
      await reach(page, "Where should the setting for product behaviour be now?", "The setting for product behaviour");
      await expect(page.locator(CARD)).not.toContainText(/B-[0-9a-z]{5}/);
      await check(page, problems, "a slider proposal");
      await shot(page, "26-slider-proposal");
      expect(problems).toEqual([]);
    });

    test("a deck's briefing card and its panel, and the empty desk with what's put aside, fit the phone", async ({ page }) => {
      let other = "";
      await open(page, (s, dir) => {
        mkdirSync(join(dir, "docs/vault/Design"), { recursive: true });
        s.setVault("docs/vault");
        s.createDeck({ id: "storage", title: "The storage layer", context_notes: ["[[Storage Design]]", "[[Nowhere]]"] }, "Where runs and their files are kept, and why. Runs outlive the machine that made them.\n");
        s.fileCard(draft({ deck: "storage", reverse: "cheap" }), BODY, { agent: "claude-code", force: true });
        // In an area of its own: two decisions in one area answered alike would bring Baesian's convention card.
        other = s.fileCard(draft({ title: "Where run files are kept", question: "Where should run files go?", topic: "storage-files/where", reverse: "cheap" }), BODY, { agent: "claude-code", force: true }).card.meta.id;
        writeFileSync(join(dir, "docs/vault/Design/Storage Design.md"), `---\nsummary: "How runs are stored; the open question is ${other}."\n---\n\n# Storage Design\n`);
        const aside = file(s, { title: "The empty page" });
        answer(s, aside, { response: "defer", comment: "Later." });
      });
      const problems: string[] = [];
      const briefing = page.getByRole("article", { name: "The briefing for The storage layer" });
      await expect(briefing).toBeVisible();
      await check(page, problems, "a deck's briefing card");
      await shot(page, "27-briefing-card");
      await briefing.getByRole("button", { name: /Go to its cards/ }).tap();
      await expect(page.getByRole("heading", { name: "Which store should hold run metadata?" })).toBeVisible();
      await page.locator(".crumbs").getByRole("button", { name: "The storage layer" }).tap();
      const deck = page.getByRole("complementary", { name: "The storage layer" });
      await check(page, problems, "a deck's panel");
      await shot(page, "28-deck-panel");
      await deck.getByRole("button", { name: "Where run files are kept" }).tap();
      await expect(page.getByRole("heading", { name: "Where should run files go?" })).toBeVisible();
      for (let i = 0; i < 2; i++) {
        await page.locator(`${CARD} .opt[data-kind="proposal"]`).tap();
        await page.locator(CARD).getByRole("button", { name: /Confirm/ }).tap();
      }
      await page.clock.fastForward(5100);
      await expect(page.getByText("All caught up.")).toBeVisible();
      await expect(page.locator(".empty")).toHaveCSS("opacity", "1");
      await expect(page.locator(".empty .parked")).toContainText("Put asideThe empty page");
      await check(page, problems, "the empty desk, with what's put aside");
      await shot(page, "29-empty-desk-put-aside");
      expect(problems).toEqual([]);
    });
  });
}

/** A card too long for a phone's screen: a premise, what's built, a fact on the crux, and long options. */
const LONG = {
  title: "The long one",
  question: "Where should the run's log files be kept, once a run has finished and its machine has gone?",
  crux_fact: "Runs are kept for a year; most are read in their first week, and a few are read again at the end of the quarter.",
  proposal_then: "the logs stay in the repo's own folder, next to the run's metadata, where every clone carries them",
  alternative_then: "the logs go to a bucket that has to be configured, paid for, and reached over the network",
  premise: "is only safe if the logs stay small enough for a git checkout",
  premise_option: "proposal",
  premise_check: "the size of last month's logs",
  wrong_if: "a month of logs is more than a few megabytes",
  check: "the size of last month's logs",
  acted: "2 commits, “Write logs next to the run” and “Rotate logs weekly”",
  acted_option: "proposal",
};

test.describe("touch, 390×844", () => {
  test.use(phone({ width: 390, height: 844 }));

  test("a swipe chooses sideways on any card; up and down answer a card that fits, and scroll one that doesn't", async ({ page }) => {
    await open(page, (s) => {
      file(s, { topic: "a1/q", question: "The short one?" });
      file(s, { topic: "a2/q", ...LONG });
    });
    const finger = await Finger.on(page);
    const card = page.locator(CARD);
    const desk = page.locator(".desk");
    const scrolls = () => desk.evaluate((d) => d.scrollHeight > d.clientHeight + 1);
    await expect(card).toHaveAttribute("aria-label", "The short one?");
    expect(await scrolls()).toBe(false);
    // Past the threshold, the option letting go would choose is filled in, and letting go chooses it.
    await finger.swipe(await finger.at(card.locator(".crux")), 200, 0, { hold: true });
    await expect(card.locator('.opt[data-side="right"]')).toHaveClass(/armed/);
    await finger.lift();
    await expect(card).toHaveAttribute("data-mode", "reveal");
    await expect(card.locator('.opt[data-side="right"]')).toHaveClass(/chosen/);
    await card.getByRole("button", { name: "Back to the choice" }).tap();
    await finger.swipe(await finger.at(card.locator(".crux")), 0, -160);
    await expect(card).toHaveAttribute("data-mode", "write");
    await card.getByRole("button", { name: "Cancel" }).tap();
    await finger.swipe(await finger.at(card.locator(".crux")), 0, 160);
    await expect(card).toHaveAttribute("data-mode", "pass");
    await card.getByRole("button", { name: "Cancel" }).tap();
    // A short swipe answers nothing.
    await finger.swipe(await finger.at(card.locator(".crux")), 60, 0);
    await expect(card).toHaveAttribute("data-mode", "live");

    await reach(page, LONG.question, "The long one");
    await expect.poll(scrolls).toBe(true);
    await finger.swipe(await finger.at(card.locator("h1")), 0, -300, { clock: false });
    await expect.poll(() => desk.evaluate((d) => d.scrollTop)).toBeGreaterThan(100);
    await expect(card).toHaveAttribute("data-mode", "live");
    await finger.swipe(await finger.at(card.locator(".options")), -200, 0);
    await expect(card).toHaveAttribute("data-mode", "reveal");
    await expect(card.locator('.opt[data-side="left"]')).toHaveClass(/chosen/);
  });

  test("a mythic card is pressed and held to confirm, letting go early doesn't answer, and undo is a tap (D67, D82)", async ({ page }) => {
    let id = "";
    const { store } = await open(page, (s) => {
      id = file(s, { touches: ["security"], reverse: "one-way", wrong_if: "a page script reads it", check: "the client's scripts" });
    });
    const finger = await Finger.on(page);
    await page.clock.fastForward(3100);
    await page.locator(`${CARD} .opt[data-kind="proposal"]`).tap();
    const hold = page.locator(CARD).getByRole("button", { name: "Press and hold to confirm" });
    await finger.press(await finger.at(hold), 300);
    await expect(page.getByText("Keep holding until the bar fills.")).toBeVisible();
    expect(store.verdicts(id)).toEqual([]);
    await finger.press(await finger.at(hold), 1000);
    await expect(page.getByRole("status")).toContainText("Sending to claude-code in");
    await page.getByRole("button", { name: "Undo" }).tap();
    await expect(page.getByText("Undone. The card is back.")).toBeVisible();
    await page.clock.fastForward(6000);
    expect(store.verdicts(id)).toEqual([]);
  });

  test("the path's sheet: pulled up from its bar, pulled down by its head, closed by Esc or a tap outside; its rows open their cards; leaning says what an option does", async ({ page }) => {
    const { store, dir } = repo();
    fileRound5(store);
    server = await startServer(store, { reviewer: "gus", writeServerFile: false, debounceMs: 20 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await skipSetup(page, dir);
    await page.clock.install();
    await page.goto(server.url);
    await expect(page.locator(CARD)).toHaveAttribute("aria-label", "Where should the client's access token live?");
    const finger = await Finger.on(page);
    const bar = page.locator(".sheet-peek");
    const sheet = page.getByRole("dialog", { name: "Your path" });
    await expect(bar).toHaveText(/Your path\s*2 connected · 4 next/);

    // Leaning toward the agent's pick names the rule it may break; the other option keeps to it.
    await page.clock.fastForward(3100);
    const pick = (await page.locator(`${CARD} .opt[data-kind="proposal"]`).getAttribute("data-side")) === "left" ? -1 : 1;
    await finger.swipe(await finger.at(page.locator(`${CARD} .crux`)), pick * 70, 0, { hold: true });
    await expect(bar).toHaveText("✗ May break it: Never put secrets in URLs");
    await finger.lift();
    await expect(bar).toContainText("Your path");
    await finger.swipe(await finger.at(page.locator(`${CARD} .crux`)), -pick * 70, 0, { hold: true });
    await expect(bar).toHaveText("✓ Keeps to it: Never put secrets in URLs");
    await finger.lift();

    await finger.swipe(await finger.at(bar), 0, -80);
    await expect(sheet).toBeVisible();
    await expect(sheet.locator(".row.now")).toContainText("Where the access token livesthe card you're on");
    await expect(sheet.locator(".row.rel")).toHaveCount(2);
    await expect(sheet.locator(".row.next")).toHaveCount(3);
    await expect(sheet.getByRole("button", { name: /Your path/ })).toBeFocused();
    await finger.swipe(await finger.at(sheet.getByRole("button", { name: /Your path/ })), 0, 140);
    await expect(sheet).toBeHidden();
    await bar.tap();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(bar).toBeFocused();
    await bar.tap();
    await page.touchscreen.tap(195, 100);
    await expect(sheet).toBeHidden();
    // Behind the sheet, the desk can't be reached.
    await bar.tap();
    await expect(page.locator(".desk")).toHaveAttribute("inert", "");
    await sheet.locator(".row.next", { hasText: "How live updates reach the browser" }).tap();
    await expect(sheet).toBeHidden();
    await expect(page.locator(CARD)).toHaveAttribute("aria-label", "WebSockets or server‑sent events for live updates?");
  });

  test("writing an answer with the keyboard open: it comes up once a reason needs words, and the field and Send stay in reach", async ({ page }) => {
    let id = "";
    const { store } = await open(page, (s) => {
      id = file(s, LONG);
    });
    const card = page.locator(CARD);
    await card.getByRole("button", { name: /Other answer/ }).tap();
    const field = card.getByLabel("Your answer");
    // Not before a reason is chosen: the keyboard would cover the reasons.
    await expect(field).not.toBeFocused();
    await card.getByRole("button", { name: "Ask a question" }).tap();
    await expect(field).toBeFocused();
    // The keyboard takes the bottom of the screen; the page shrinks to what's left (interactive-widget=resizes-content).
    await page.setViewportSize({ width: 390, height: 470 });
    await page.waitForTimeout(80);
    const box = (await field.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(52);
    expect(box.y + box.height).toBeLessThanOrEqual(470);
    await expect(page.locator(".sheet-bar")).toBeHidden();
    const problems: string[] = [];
    await check(page, problems, "writing, with the keyboard open");
    await shot(page, "30-keyboard-open");
    expect(problems).toEqual([]);
    await page.keyboard.type("Will two machines ever write runs?");
    await card.getByRole("button", { name: "Send to claude-code" }).tap();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.fastForward(5100);
    await expect.poll(() => store.verdicts(id)).toEqual([expect.objectContaining({ response: "question", comment: "Will two machines ever write runs?" })]);
  });

  test("on a phone with a notch, nothing sits under it or under the home indicator", async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 47, bottom: 34, left: 0, right: 0 } });
    await open(page, (s) => {
      file(s, { ...LONG, topic: "a/q" });
      file(s);
    });
    const problems: string[] = [];
    const top = async (sel: string) => (await page.locator(sel).first().boundingBox())!.y;
    expect(await top(".wordmark")).toBeGreaterThanOrEqual(47);
    const peek = (await page.locator(".peek-text").boundingBox())!;
    expect(peek.y + peek.height).toBeLessThanOrEqual(844 - 34);
    await check(page, problems, "the desk, with a notch");
    await shot(page, "31-notch");
    await page.locator(".sheet-peek").tap();
    const body = page.getByRole("dialog", { name: "Your path" });
    const last = (await body.locator(".row").last().boundingBox())!;
    expect(last.y + last.height).toBeLessThanOrEqual(844 - 34);
    await check(page, problems, "the sheet, with a notch");
    await page.keyboard.press("Escape");
    await menu(page, "Your calibration");
    expect(await top(".panel h4")).toBeGreaterThanOrEqual(47);
    expect(await top(".panel-close")).toBeGreaterThanOrEqual(47);
    await check(page, problems, "a panel, with a notch");
    expect(problems).toEqual([]);
  });

  test("with motion, your choice flies into the path's bar and the sheet slides up; with reduced motion, neither moves", async ({ page }) => {
    await open(page, (s) => {
      for (let i = 0; i < 3; i++) file(s);
    }, { clock: false, reduced: false });
    await page.locator(`${CARD} .opt[data-kind="proposal"]`).tap();
    await page.locator(CARD).getByRole("button", { name: /Confirm/ }).tap();
    await expect(page.locator(".fly")).toHaveCount(1);
    await page.locator(".sheet-peek").tap();
    await expect(page.locator(".sheet")).toHaveCSS("animation-name", "sheet-in");
    await page.keyboard.press("Escape");

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await expect(page.locator(CARD)).toBeVisible();
    await page.locator(`${CARD} .opt[data-kind="proposal"]`).tap();
    await page.locator(CARD).getByRole("button", { name: /Confirm/ }).tap();
    await expect(page.getByRole("status")).toContainText("Sending to claude-code in");
    await expect(page.locator(".fly")).toHaveCount(0);
    await page.locator(".sheet-peek").tap();
    await expect(page.locator(".sheet")).toHaveCSS("animation-name", "none");
  });
});

test("above the phone's width, the desktop layout: the path beside the card, and no sheet", async ({ page }) => {
  await page.setViewportSize({ width: 761, height: 900 });
  await open(page, (s) => void file(s));
  await expect(page.locator(".desk > .hood")).toBeVisible();
  await expect(page.locator(".sheet-bar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "More" })).toBeVisible();
  await page.setViewportSize({ width: 760, height: 900 });
  await expect(page.locator(".sheet-bar")).toBeVisible();
  await expect(page.locator(".desk > .hood")).toHaveCount(0);
});
