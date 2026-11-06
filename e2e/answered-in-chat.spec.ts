import { type Page, expect, test } from "@playwright/test";
import { type RunningServer, startServer } from "../src/server.js";
import type { Store } from "../src/store.js";
import { BODY, cleanup, draft, repo } from "../test/helpers.js";
import { layoutProblems, smallTargets } from "./layout.js";
import { skipSetup } from "./setup.js";
import { PHONES, phone, shot } from "./touch.js";

// B-hswmx, "File it, marked seen": a choice the reviewer already answered in chat comes to the desk showing what they
// said and the agent's pick, their answer, and one tap confirms it; the other answers are there if it isn't what they
// meant. Its verdict is marked seen, with no blind choice, and calibration leaves it out. A real server over a temp repo,
// a real browser, and Playwright's clock for the undo window (D82). With BAESIAN_SHOTS set to a folder, each screen is
// saved there.

let server: RunningServer | undefined;
test.afterEach(async () => {
  await server?.close();
  server = undefined;
  cleanup();
});

const CARD = "article.card:not([data-leaving])";
const SAID = "“Postgres. Two runners will write at once, so one file won't do.”";
let n = 0;
/** Topics far enough apart that the card offers no merge (D111). */
const TOPICS = ["storage/run-metadata", "auth/tokens", "ui/empty-page", "time/format", "deploy/region", "cache/policy", "search/index", "mail/provider"];
/** A card answered in chat, on its own topic, unless `said` is null. */
const file = (store: Store, over: Record<string, unknown> = {}, said: string | null = SAID) => {
  n += 1;
  const chat = said === null ? {} : { answered_in_chat: said };
  return store.fileCard(
    draft({
      title: `Decision ${n}`, question: `Which store should hold run metadata, ${n}?`, topic: TOPICS[n % TOPICS.length], reverse: "moderate",
      proposal: "Postgres", proposal_then: "runs go to the database server the team already runs",
      alternative: "SQLite (WAL mode)", alternative_then: "runs are recorded in one file next to the repo",
      crux_proposal: "If so", crux_alternative: "If not",
      ...chat, ...over,
    }),
    BODY,
    { agent: "claude-code", force: true },
  ).card.meta.id;
};

async function open(page: Page, setup: (store: Store) => void, opts: { reduced?: boolean } = {}) {
  const r = repo();
  setup(r.store);
  server = await startServer(r.store, { reviewer: "tester", writeServerFile: false, debounceMs: 20 });
  await skipSetup(page, r.dir);
  if (opts.reduced) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await page.goto(server.url);
  await expect(page.locator(CARD)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return r;
}
const option = (page: Page, kind: "proposal" | "alternative") => page.locator(`${CARD} .opt[data-kind="${kind}"]`);
const arrowOf = async (page: Page, kind: "proposal" | "alternative") => ((await option(page, kind).getAttribute("data-side")) === "left" ? "ArrowLeft" : "ArrowRight");

test("shows what you said and the pick, asks no reading first, and one tap confirms it, marked seen, with a rule if asked", async ({ page }) => {
  let id = "";
  const { store } = await open(page, (s) => {
    id = file(s);
  });
  const card = page.locator(CARD);
  await expect(card).toHaveAttribute("data-mode", "seen");
  await expect(card.locator(".said .lbl")).toHaveText("You answered this in chat");
  // The quotation marks the agent put round it go: the card's own are drawn round it.
  await expect(card.locator(".said q")).toHaveText("Postgres. Two runners will write at once, so one file won't do.");
  await expect(card).toContainText("claude-code filed your answer as its pick: Postgres.");
  await expect(option(page, "proposal").locator(".pickof")).toHaveText("Your answer in chat");
  // An uncommon card asks you to read first; one answered in chat doesn't: you chose already.
  await expect(card).toHaveClass(/rarity-uncommon/);
  await expect(card).not.toHaveAttribute("data-locked", /.*/);
  await expect(page.getByTestId("rule")).toHaveText(/^Not what you meant\? Choose the other option \([←→]\), or answer otherwise\.$/);
  await card.getByRole("checkbox", { name: /Make this a rule/ }).check();
  await card.getByRole("button", { name: /Confirm “Postgres”/ }).click();
  await expect(page.getByText(/Sending to claude-code in/)).toBeVisible();
  await page.clock.fastForward(5100);
  await expect.poll(() => store.verdicts(id)).toEqual([expect.objectContaining({ response: "accept", seen: true, make_rule: true, client: "web" })]);
  expect(store.verdicts(id)[0]!.first_choice).toBeUndefined();
  await expect(page.locator(".path")).toContainText("you confirmed “Postgres”, your answer in chat");
  // Not timed for your calibration: it leaves the card out.
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.endsWith(":spent")).flatMap((k) => JSON.parse(localStorage.getItem(k) ?? "[]") as unknown[]))).toEqual([]);
});

test("with the keyboard: the arrow on your answer's side confirms it; the other goes to the reveal and back; ↑ and ↓ answer otherwise", async ({ page }) => {
  let first = "", second = "", third = "";
  const { store } = await open(page, (s) => {
    first = file(s);
    second = file(s);
    third = file(s);
  });
  const order = [first, second, third];

  // The other option: the reveal says it isn't what you said, with no blind choice, and goes back.
  const other = await arrowOf(page, "alternative");
  await page.keyboard.down(other);
  await page.keyboard.up(other);
  await expect(page.locator(CARD)).toHaveAttribute("data-mode", "reveal");
  await expect(page.locator(CARD)).toContainText("You chose SQLite (WAL mode), not your answer in chat, Postgres.");
  await page.locator(CARD).getByRole("button", { name: "Back to your answer in chat" }).click();
  await expect(page.locator(CARD)).toHaveAttribute("data-mode", "seen");
  await page.keyboard.down(other);
  await page.keyboard.up(other);
  await page.keyboard.press("Escape");
  await expect(page.locator(CARD)).toHaveAttribute("data-mode", "seen");
  // ↑ writes, ↓ can't judge; Esc comes back to what you said.
  await page.keyboard.press("ArrowUp");
  await expect(page.locator(CARD)).toHaveAttribute("data-mode", "write");
  await page.keyboard.press("Escape");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(CARD)).toHaveAttribute("data-mode", "pass");
  await page.keyboard.press("Escape");
  await expect(page.locator(CARD)).toHaveAttribute("data-mode", "seen");

  // The arrow on your answer's side confirms it at once.
  const label = await page.locator(CARD).getAttribute("aria-label");
  await page.keyboard.press(await arrowOf(page, "proposal"));
  await expect(page.locator(CARD)).not.toHaveAttribute("aria-label", label!);
  // Not what you meant, on the next: the other option, with a reason.
  await page.keyboard.down(await arrowOf(page, "alternative"));
  await page.keyboard.up(await arrowOf(page, "alternative"));
  await page.locator(CARD).getByPlaceholder("One line").fill("I meant one machine.");
  await page.locator(CARD).getByPlaceholder("One line").press("Enter");
  await page.clock.fastForward(5100);
  await expect.poll(() => order.flatMap((id) => store.verdicts(id)).length).toBe(2);
  const flat = order.flatMap((id) => store.verdicts(id));
  expect(flat).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ response: "accept", seen: true }),
      expect.objectContaining({ response: "alternative", choice: "SQLite (WAL mode)", comment: "I meant one machine.", seen: true }),
    ]),
  );
  expect(flat.every((v) => v.first_choice === undefined)).toBe(true);
});

test("a mythic one is held to confirm, and letting go early doesn't answer (D67)", async ({ page }) => {
  let id = "";
  const { store } = await open(page, (s) => {
    id = file(s, { touches: ["security"], reverse: "one-way", wrong_if: "a page script reads it", check: "the client's scripts" });
  });
  await expect(page.locator(CARD)).toHaveAttribute("data-mode", "seen");
  await expect(page.locator(CARD)).toHaveClass(/rarity-mythic/);
  const key = await arrowOf(page, "proposal");
  await page.keyboard.down(key);
  await page.clock.runFor(300);
  await page.keyboard.up(key);
  await expect(page.getByText("Keep holding until the bar fills.")).toBeVisible();
  expect(store.verdicts(id)).toEqual([]);
  // A click on your answer says how it's confirmed, and answers nothing.
  await option(page, "proposal").click();
  await expect(page.getByText("Hold to confirm, until the bar fills.")).toBeVisible();
  await page.keyboard.down(key);
  await page.clock.runFor(1000);
  await page.keyboard.up(key);
  await expect(page.getByText(/Sending to claude-code in/)).toBeVisible();
  await page.clock.fastForward(5100);
  await expect.poll(() => store.verdicts(id)).toEqual([expect.objectContaining({ response: "accept", seen: true })]);
});

test("your calibration says how many it left out (B-hswmx)", async ({ page }) => {
  await open(page, (s) => {
    const id = file(s, { touches: ["user-facing"] });
    s.addVerdict({ card: id, revision: 1, response: "accept", reviewer: "gus", client: "web" });
    const blind = file(s, { touches: ["user-facing"] }, null);
    s.addVerdict({ card: blind, revision: 1, response: "accept", first_choice: "proposal", reviewer: "gus", client: "web" });
    file(s, { touches: ["user-facing"] }, null);
  });
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Your calibration" }).click();
  const panel = page.locator("#calibration-panel");
  await expect(panel).toContainText("Of 1 card, you chose as the agent did once without seeing its pick, came round to it 0 times after reading its case, and overturned it 0 times. 2 more aren't counted: 1 not answered and 1 answered in chat.");
  await expect(panel).toContainText("Later superseded: none of the decisions you settled here; 1 you answered in chat isn't counted");
});

for (const size of [{ name: "desktop", width: 1440, height: 900 }, { name: "laptop", width: 1280, height: 800 }]) {
  test(`a card answered in chat, and its other answers, pass the layout check (${size.name}, ${size.width}×${size.height})`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await open(
      page,
      (s) => {
        file(s, { rationale: "The team runs Postgres already.", touches: ["dependency"] });
        file(s, { touches: ["security"], reverse: "one-way", wrong_if: "a page script reads it", check: "the client's scripts" });
      },
      { reduced: true },
    );
    const problems: string[] = [];
    const check = async (state: string) => {
      await page.waitForTimeout(80);
      for (const p of await page.evaluate(layoutProblems)) problems.push(`${state}: ${p}`);
    };
    // The mythic one comes first.
    await check("a mythic card answered in chat");
    await shot(page, "chat-mythic", true);
    await page.locator(".path .row.next").first().click();
    await page.clock.runFor(1200);
    await expect(page.locator(CARD)).toHaveAttribute("data-mode", "seen");
    await check("a card answered in chat");
    await shot(page, "chat-seen", true);
    await page.keyboard.down(await arrowOf(page, "alternative"));
    await page.keyboard.up(await arrowOf(page, "alternative"));
    await check("not what you meant: the other option");
    await shot(page, "chat-other", true);
    await page.keyboard.press("Escape");
    await page.keyboard.press("ArrowUp");
    await check("writing to the agent");
    await page.keyboard.press("Escape");
    expect(problems).toEqual([]);
  });
}

for (const size of PHONES) {
  test.describe(`on a phone, ${size.name}, ${size.width}×${size.height}`, () => {
    test.use(phone(size));

    test("a card answered in chat fits the phone, with every target 44 px, and a tap confirms it", async ({ page }) => {
      let id = "";
      const { store } = await open(
        page,
        (s) => {
          id = file(s, { rationale: "The team runs Postgres already." });
        },
        { reduced: true },
      );
      const problems: string[] = [];
      const check = async (state: string) => {
        await page.waitForTimeout(80);
        for (const p of await page.evaluate(layoutProblems)) problems.push(`${state}: ${p}`);
        for (const p of await page.evaluate(smallTargets)) problems.push(`${state}: ${p}`);
      };
      const card = page.locator(CARD);
      await expect(card).toHaveAttribute("data-mode", "seen");
      await expect(page.getByTestId("rule")).toHaveText("Not what you meant? Tap the other option, or answer otherwise.");
      // What you said and the confirm are in view as the card arrives.
      await expect(card.getByRole("button", { name: /Confirm “Postgres”/ })).toBeInViewport();
      await check("a card answered in chat");
      await shot(page, "chat-seen", true);
      await option(page, "alternative").tap();
      await expect(card).toHaveAttribute("data-mode", "reveal");
      await check("not what you meant: the other option");
      await card.getByRole("button", { name: "Back to your answer in chat" }).tap();
      await card.getByRole("button", { name: /Confirm “Postgres”/ }).tap();
      await page.clock.fastForward(5100);
      await expect.poll(() => store.verdicts(id)).toEqual([expect.objectContaining({ response: "accept", seen: true, client: "web" })]);
      expect(problems).toEqual([]);
    });
  });
}
