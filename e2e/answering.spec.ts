import { type Page, expect, test } from "@playwright/test";
import { type RunningServer, startServer } from "../src/server.js";
import { BODY, cleanup, draft, repo } from "../test/helpers.js";

// M4 step 5c: answering, end to end. Round 5's self-test (#selftest), ported: a real server over a fixture repo,
// a real browser, and Playwright's clock to skip the reading time (D91) and the undo window (D82).

let server: RunningServer | undefined;
test.afterEach(async () => {
  await server?.close();
  server = undefined;
  cleanup();
});

/** A fixture repo with these cards, a server, and the page signed in on the first card. */
async function open(page: Page, cards: Record<string, unknown>[]) {
  const r = repo();
  const ids = cards.map((over, i) =>
    r.store.fileCard(draft({ title: `Card ${i}`, question: `Question ${i}?`, topic: `area${i}/x`, reverse: "cheap", ...over }), BODY, { agent: "claude-code", force: true }).card.meta.id,
  );
  server = await startServer(r.store, { reviewer: "tester", writeServerFile: false, debounceMs: 20 });
  await page.clock.install();
  await page.goto(server.url);
  await expect(page.locator("article.card")).toBeVisible();
  return { ...r, ids };
}
/** The card in play: a card that's leaving is still in the page for its exit, inert. */
const CARD = "article.card:not([data-leaving])";
const option = (page: Page, kind: "proposal" | "alternative") => page.locator(`${CARD} .opt[data-kind="${kind}"]`);
const mode = (page: Page) => page.locator(CARD).getAttribute("data-mode");

test("every card goes through the reveal, and the verdict is recorded once the undo window closes (D82, D86, D88)", async ({ page }) => {
  const { store, ids } = await open(page, [{}]);
  await expect(page.locator(".pickof")).toHaveCount(0); // the agent's pick is hidden until you choose
  await option(page, "proposal").click();
  await expect(page.getByText("claude-code picked the same.")).toBeVisible();
  await expect(page.locator(".pickof")).toHaveText("claude-code's pick");
  await page.locator(CARD).getByRole("button", { name: /Confirm/ }).click();
  await expect(page.getByText(/Sending to claude-code in/)).toBeVisible();
  expect(store.verdicts(ids[0]!)).toEqual([]);
  await page.clock.fastForward(5100);
  await expect.poll(() => store.verdicts(ids[0]!)).toEqual([expect.objectContaining({ response: "accept", first_choice: "proposal", client: "web", reviewer: "tester" })]);
  await expect(page.getByText("All caught up.")).toBeVisible();
});

test("disagreeing asks why, optionally, and a switch keeps the first choice (D87, D88)", async ({ page }) => {
  const { store, ids } = await open(page, [{}, {}]);
  await option(page, "alternative").click();
  await page.locator(CARD).getByPlaceholder("One line").fill("Two machines will write runs.");
  await page.locator(CARD).getByPlaceholder("One line").press("Enter");
  await page.clock.fastForward(5100);
  await expect.poll(() => store.verdicts(ids[0]!)).toEqual([
    expect.objectContaining({ response: "alternative", choice: "Postgres", first_choice: "alternative", comment: "Two machines will write runs." }),
  ]);

  await expect(page.getByRole("heading", { name: "Question 1?" })).toBeVisible();
  await option(page, "alternative").click();
  await page.locator(CARD).getByRole("button", { name: "Switch to claude-code's pick" }).click();
  await expect(page.getByText(/You switched to/)).toBeVisible();
  await page.locator(CARD).getByRole("button", { name: /Confirm/ }).click();
  await page.clock.fastForward(5100);
  await expect.poll(() => store.verdicts(ids[1]!)).toEqual([expect.objectContaining({ response: "accept", first_choice: "alternative" })]);
});

test("an uncommon card asks you to read first (D91)", async ({ page }) => {
  await open(page, [{ reverse: "moderate" }]);
  await option(page, "proposal").click();
  expect(await mode(page)).toBe("live");
  await expect(page.getByTestId("rule")).toContainText("Read it first");
  await page.clock.fastForward(2100);
  await option(page, "proposal").click();
  expect(await mode(page)).toBe("reveal");
});

test("undo takes the answer back, and nothing is sent", async ({ page }) => {
  const { store, ids } = await open(page, [{}]);
  await option(page, "proposal").click();
  await page.locator(CARD).getByRole("button", { name: /Confirm/ }).click();
  await page.keyboard.press("z");
  await expect(page.getByText("Undone. The card is back.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Question 0?" })).toBeVisible();
  await page.clock.fastForward(6000);
  expect(store.verdicts(ids[0]!)).toEqual([]);
});

test("closing the page inside the undo window still sends the answer (D82)", async ({ page }) => {
  const { store, ids } = await open(page, [{}]);
  await option(page, "proposal").click();
  await page.locator(CARD).getByRole("button", { name: /Confirm/ }).click();
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => store.verdicts(ids[0]!).length, { timeout: 5000 }).toBe(1);
});

test("a mythic card is held to confirm, and letting go early doesn't answer (D67)", async ({ page }) => {
  const { store, ids } = await open(page, [{ touches: ["security"], reverse: "one-way", wrong_if: "a page script reads it", check: "the client's scripts" }]);
  await page.clock.fastForward(3100);
  await page.keyboard.down("ArrowRight");
  await page.keyboard.up("ArrowRight");
  expect(await mode(page)).toBe("reveal");
  await expect(page.getByText(/Its pick is wrong if a page script reads it/)).toBeVisible();
  await page.keyboard.down("ArrowRight");
  await page.clock.runFor(300);
  await page.keyboard.up("ArrowRight");
  await expect(page.getByText("Keep holding until the bar fills.")).toBeVisible();
  expect(store.verdicts(ids[0]!)).toEqual([]);
  await page.keyboard.down("ArrowRight");
  await page.clock.runFor(1000);
  await page.keyboard.up("ArrowRight");
  await expect(page.getByText(/Sending to claude-code in/)).toBeVisible();
  await page.clock.fastForward(5100);
  await expect.poll(() => store.verdicts(ids[0]!).length).toBe(1);
});

test("↑ writes to the agent, and a question needs its words", async ({ page }) => {
  const { store, ids } = await open(page, [{}]);
  await page.keyboard.press("ArrowUp");
  await expect(page.locator(CARD)).toContainText("What you write is committed with the code.");
  await page.locator(CARD).getByRole("button", { name: "Ask a question" }).click();
  await page.locator(CARD).getByRole("button", { name: "Send to claude-code" }).click();
  await expect(page.getByRole("alert")).toHaveText("Write your question first.");
  await page.locator(CARD).getByLabel("Your answer").fill("Will two machines ever write runs?");
  await page.locator(CARD).getByLabel("Your answer").press("ControlOrMeta+Enter");
  await page.clock.fastForward(5100);
  await expect.poll(() => store.verdicts(ids[0]!)).toEqual([expect.objectContaining({ response: "question", comment: "Will two machines ever write runs?" })]);
});

test("↓ \"I need to see it run\" returns the card to its agent (D85)", async ({ page }) => {
  const { store, ids } = await open(page, [{}]);
  await page.keyboard.press("ArrowDown");
  await page.locator(CARD).getByRole("button", { name: "I need to see it run" }).click();
  await page.locator(CARD).getByRole("button", { name: "Send to claude-code" }).click();
  await page.clock.fastForward(5100);
  await expect.poll(() => store.status(ids[0]!)).toBe("returned");
  expect(store.verdicts(ids[0]!)).toEqual([expect.objectContaining({ response: "see_it_run" })]);
});

test("an answer the server refuses comes back, with the server's reason", async ({ page }) => {
  await open(page, [{}]);
  await page.route("**/api/verdicts", (r) => r.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "B-xxxxx is at revision 2; a verdict on r1 is stale" }) }));
  await option(page, "proposal").click();
  await page.locator(CARD).getByRole("button", { name: /Confirm/ }).click();
  await page.clock.fastForward(5100);
  await expect(page.getByText(/That answer wasn't recorded: .*stale\. The card is back\./)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Question 0?" })).toBeVisible();
});

test("holding an arrow leans the card that way, and letting go chooses that side", async ({ page }) => {
  await open(page, [{}]);
  await page.keyboard.down("ArrowLeft");
  await page.clock.runFor(400);
  const lean = await page.locator(CARD).evaluate((el) => Number(getComputedStyle(el).getPropertyValue("--pl")));
  expect(lean).toBeGreaterThan(0.3);
  await page.keyboard.up("ArrowLeft");
  expect(await mode(page)).toBe("reveal");
  await expect(page.locator(`${CARD} .opt[data-side="left"]`)).toHaveClass(/chosen/);
});

test("a card that leaves never pushes the next one down, and nothing breaks the page's policy", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await open(page, [{}, {}]);
  const top = (await page.locator(CARD).boundingBox())!.y;
  await option(page, "proposal").click();
  await page.locator(CARD).getByRole("button", { name: /Confirm/ }).click();
  await expect(page.getByRole("heading", { name: "Question 1?" })).toBeVisible();
  await page.clock.runFor(1200); // let your choice fly into the path, and the next card's entrance finish
  expect(Math.round((await page.locator(CARD).boundingBox())!.y)).toBe(Math.round(top));
  await page.keyboard.press("j");
  await page.clock.runFor(500);
  expect(Math.round((await page.locator(CARD).boundingBox())!.y)).toBe(Math.round(top));
  expect(errors).toEqual([]);
});

test("dragging the card past the threshold chooses that side", async ({ page }) => {
  await open(page, [{}]);
  const box = (await page.locator(`${CARD} .crux`).boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(x + i * 20, y);
    await page.clock.runFor(16);
  }
  // Past the threshold, the option letting go would choose is filled in (round 5).
  await expect(page.locator(`${CARD} .opt[data-side="right"]`)).toHaveClass(/armed/);
  await page.mouse.up();
  await page.clock.runFor(100);
  expect(await mode(page)).toBe("reveal");
  await expect(page.locator(`${CARD} .opt[data-side="right"]`)).toHaveClass(/chosen/);
});

test("a two-finger swipe chooses as a drag does, once it stops; a short one doesn't (round 5)", async ({ page }) => {
  await open(page, [{}]);
  const box = (await page.locator(`${CARD} .crux`).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const swipe = async (dx: number, dy: number, steps = 4) => {
    for (let i = 0; i < steps; i++) await page.mouse.wheel(dx / steps, dy / steps);
    if (Math.abs(dx) >= 150) await expect(page.locator(`${CARD} .opt[data-side="${dx > 0 ? "left" : "right"}"]`)).toHaveClass(/armed/);
    await page.clock.runFor(200); // the swipe ends when the wheel goes quiet
  };
  await swipe(80, 0);
  expect(await mode(page)).toBe("live");
  await page.clock.runFor(700); // the cooldown after a swipe
  // Fingers moving left scroll the page right: the card goes left, as in round 5.
  await swipe(200, 0);
  expect(await mode(page)).toBe("reveal");
  await expect(page.locator(`${CARD} .opt[data-side="left"]`)).toHaveClass(/chosen/);
  await page.keyboard.press("Escape");
  await page.clock.runFor(700);
  await swipe(0, 160);
  expect(await mode(page)).toBe("write");
});
