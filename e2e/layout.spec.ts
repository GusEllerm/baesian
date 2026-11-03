import { type Page, expect, test } from "@playwright/test";
import { type RunningServer, startServer } from "../src/server.js";
import { cleanup, repo } from "../test/helpers.js";
import { layoutProblems } from "./layout.js";
import { fileRound5 } from "./round5.js";
import { skipSetup } from "./setup.js";

// M4 step 5f: the layout check over every state of the desk, at desktop and laptop sizes, on round 5's cards.
// The check itself is e2e/layout.ts.

let server: RunningServer | undefined;
test.afterEach(async () => {
  await server?.close();
  server = undefined;
  cleanup();
});

const CARD = "article.card:not([data-leaving])";
const SIZES = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "laptop", width: 1280, height: 800 },
];

for (const size of SIZES) {
  test(`nothing is clipped, overlapping or off the window, in any state (${size.name}, ${size.width}×${size.height})`, async ({ page }) => {
    const { store, dir } = repo();
    const r5 = fileRound5(store);
    server = await startServer(store, { reviewer: "gus", writeServerFile: false, debounceMs: 20 });
    await page.setViewportSize({ width: size.width, height: size.height });
    // Still states only: with reduced motion the client moves nothing, so no card is caught halfway. (Motion's
    // exits also stall under Playwright's fake clock, which leaves leaving cards on the page.)
    await page.emulateMedia({ reducedMotion: "reduce" });
    await skipSetup(page, dir);
    await page.clock.install();
    await page.goto(server.url);
    await expect(page.locator(CARD)).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const problems: string[] = [];
    const settle = () => page.clock.runFor(1200);
    const check = async (state: string) => {
      await page.waitForTimeout(80); // the path's lines are measured after layout
      for (const p of await page.evaluate(layoutProblems)) problems.push(`${state}: ${p}`);
    };
    const opt = (kind: "proposal" | "alternative") => page.locator(`${CARD} .opt[data-kind="${kind}"]`);
    const sideOf = async (kind: "proposal" | "alternative") => ((await opt(kind).getAttribute("data-side")) === "left" ? "ArrowLeft" : "ArrowRight");
    const holdToConfirm = async (key: string) => {
      await page.keyboard.down(key);
      await page.clock.runFor(1000);
      await page.keyboard.up(key);
    };
    const choose = async (kind: "proposal" | "alternative", mythic = false) => {
      const key = await sideOf(kind);
      await page.keyboard.down(key);
      await page.keyboard.up(key);
      if (mythic) await holdToConfirm(key);
      else await page.locator(CARD).getByRole("button", { name: /Confirm/ }).click();
      await settle();
    };

    // The first card: mythic, blocking, with a rule it may break and a decision it builds on.
    await check("first card, reading");
    await page.clock.fastForward(3100);
    await check("first card");
    const key = await sideOf("proposal");
    await page.keyboard.down(key);
    await page.clock.runFor(300);
    await check("leaning");
    await page.keyboard.up(key);
    await check("the reveal, agreeing");
    await page.keyboard.press("Escape");
    await opt("alternative").click();
    await check("the reveal, disagreeing");
    await page.keyboard.press("Escape");
    await page.keyboard.press("ArrowUp");
    await check("writing an answer");
    await page.keyboard.press("Escape");
    await page.keyboard.press("ArrowDown");
    await check("can't judge");
    await page.keyboard.press("Escape");

    // Answer it: the path gets its first step, and the toast offers undo. An agent is waiting on the conflict card,
    // so it comes next, as in round 5; the test goes there whatever the queue's order.
    await choose("alternative", true);
    await check("second card, with an answer on the path");
    const conflict = page.locator(".path .row.next", { hasText: "Which time format the record uses" });
    if (await conflict.count()) await conflict.click();
    await settle();
    await page.clock.fastForward(3100);
    await expect(page.locator(CARD)).toHaveAttribute("aria-label", "Which time format should the record use?");
    await check("the conflict card");
    const leanKey = await sideOf("alternative");
    await page.keyboard.down(leanKey);
    await page.clock.runFor(300);
    await check("the conflict card, leaning");
    await page.keyboard.up(leanKey);
    await page.keyboard.press("Escape");

    // A card arrives while you answer, tagged new: it builds on the conflict card, so it's next in its area.
    r5.fileRelativeTimes();
    await expect(page.locator(".path .new-tag")).toBeVisible();
    await check("a card arrives");
    await choose("proposal");
    await check("third card, with two answers on the path");

    // Reopening an answer from the path.
    await page.locator(".path .row.past").first().click();
    await settle();
    await check("reviewing an answer");
    await page.keyboard.press("Escape");
    await settle();

    // The menu and the panels lie over the desk.
    await page.getByRole("button", { name: "More" }).click();
    await check("the menu");
    await page.keyboard.press("Escape");
    await page.keyboard.press("?");
    await check("keyboard shortcuts");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Your calibration" }).click();
    await check("your calibration");
    await page.keyboard.press("Escape");

    // Answer the rest: the path folds its oldest answers, and the desk empties.
    for (let i = 0; i < 6 && (await page.locator(CARD).count()); i++) {
      await page.clock.fastForward(3100);
      const mythic = (await page.locator(`${CARD}.rarity-mythic`).count()) > 0;
      await choose("proposal", mythic);
      if (i === 1) await check(`after ${i + 3} answers`);
    }
    await page.clock.fastForward(5100);
    await expect(page.locator(".empty")).toBeVisible();
    await expect(page.locator(".empty")).toHaveCSS("opacity", "1"); // its fade in, or the check sees nothing
    await check("the empty desk");

    expect(problems).toEqual([]);
  });
}
