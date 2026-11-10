import { type Page, expect, test } from "@playwright/test";
import { type RunningServer, readPractice, startServer, writePractice } from "../src/server.js";
import type { PracticeEntry, PracticeMark } from "../src/schema.js";
import type { Store } from "../src/store.js";
import { BODY, cleanup, draft, repo } from "../test/helpers.js";
import { layoutProblems, smallTargets } from "./layout.js";
import { skipSetup } from "./setup.js";
import { PHONES, phone, shot } from "./touch.js";

// Practice cards with planted picks (B-kb5yt, docs/vault/Design/Practice Cards.md): a past card comes back with the option
// its agent didn't pick shown as the pick, and the case the agent wrote for it (B-sy0kz). First a blind test, started from
// your calibration, mixed into your cards about 1 in 4, with your guess about every card you answer on a card of its own
// after it (B-xx49m, B-9prve) and every toast saying only "Recorded" (B-wcb9d), spotted only if your guesses beat chance
// (B-bb7ga); then about 1 in 20, saying it was practice once answered. A practice card says an
// agent has stopped when the card before it did (B-zw55w). Its answers go to their own address (B-rehdw), never to an
// agent. A real server over a temp repo, a real browser, Playwright's clock for the undo window, and Math.random held at
// 0 so a practice card comes whenever one may. With BAESIAN_SHOTS set to a folder, each screen is saved there.

let server: RunningServer | undefined;
test.afterEach(async () => {
  await server?.close();
  server = undefined;
  cleanup();
});

const DAY = 86_400_000;
const CARD = "article.card:not([data-leaving])";
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
/** Topics far apart, so no card offers a topic merge (D111). */
const WORDS = ["auth", "billing", "cache", "deploy", "export", "fonts", "gzip", "hosting", "imports", "jobs", "keys", "locale", "mail", "notes", "orders", "payments", "queues", "reports", "search", "themes", "uploads", "video", "webhooks", "xml", "yaml", "zones"];
let n = 0;
const topic = (area: string) => `${area}/${WORDS[n % WORDS.length]}-${["red", "green", "blue", "amber", "violet"][n % 5]}`;

const CASE = "Postgres already runs for the team, and the CI runners will write runs too.";
const RATIONALE = "One file next to the repo is enough while one laptop writes runs.";

/** A settled card that can come back as practice: answered `days` ago, blind first against the pick, with a case for its alternative. */
function past(store: Store, days: number, over: Record<string, unknown> = {}): { id: string; question: string } {
  n += 1;
  const question = `Where should run metadata number ${n} live?`;
  const id = store.fileCard(
    draft({
      title: `Run store ${n}`, question, topic: topic(`past${String.fromCharCode(97 + (n % 26))}`), touches: [], reverse: "cheap",
      crux_fact: "Today one laptop writes runs.", rationale: RATIONALE, alternative_rationale: CASE, ...over,
    }),
    BODY,
    { agent: "claude-code", force: true },
  ).card.meta.id;
  store.addVerdict({ card: id, revision: 1, response: "accept", first_choice: "alternative", reviewer: "tester", client: "web", at: ago(days) });
  return { id, question };
}

/** A card waiting for you, in an area of its own, first in the queue by its area's name. */
function open(store: Store, area: string, over: Record<string, unknown> = {}): string {
  n += 1;
  return store.fileCard(
    draft({ title: `Waiting ${n}`, question: `Which way for the ${area} work, ${n}?`, topic: topic(area), touches: [], reverse: "cheap", proposal: "The small way", proposal_then: "it stays small", alternative: "The big way", alternative_then: "it grows", ...over }),
    BODY,
    { agent: "claude-code", force: true },
  ).card.meta.id;
}

const who = { type: "practice" as const, format: 1 as const, reviewer: "tester", client: "web" };
let tick = 0;
const at = () => new Date(Date.now() - 3 * DAY + ++tick * 1000).toISOString();
const started = (): PracticeEntry => ({ ...who, kind: "test-start", at: at() });
/** A rebuilt card answered in the test, and then the guess about it, an entry of its own (B-9prve). */
const rebuiltIn = (card: string, mark: PracticeMark): PracticeEntry[] => [
  { ...who, kind: "answer", card, revision: 1, answered: ago(10), blind: "other", final: "planted", test: true, at: at() },
  { ...who, kind: "mark", card, revision: 1, mark, practice: true, at: at() },
];
const markOn = (i: number, mark: PracticeMark): PracticeEntry => ({ ...who, kind: "mark", card: `B-${String(90000 + i)}`, revision: 1, mark, at: at() });

/** Seed the practice answers: a test begun, with these rebuilt cards and real cards marked. */
function seed(store: Store, rebuilt: [string, PracticeMark][], real: PracticeMark[]) {
  writePractice(store.live, started());
  real.forEach((m, i) => writePractice(store.live, markOn(i, m)));
  for (const [id, m] of rebuilt) for (const e of rebuiltIn(id, m)) writePractice(store.live, e);
}

/** The card that asks your guess in the blind test, after each answer (B-9prve). */
const guessCard = (page: Page) => page.locator("article.card.mark-card:not([data-leaving])");
/** A card to answer, not the guess. */
const liveCard = (page: Page) => page.locator("article.card:not(.mark-card):not([data-leaving])");

async function desk(page: Page, setup: (store: Store) => void, opts: { reduced?: boolean } = {}) {
  const r = repo();
  setup(r.store);
  server = await startServer(r.store, { reviewer: "tester", writeServerFile: false, debounceMs: 20, proposals: false });
  await skipSetup(page, r.dir);
  // A practice card comes whenever one may, and it's the first card that can come back.
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  if (opts.reduced) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await page.goto(server.url);
  await expect(page.locator(CARD)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return r;
}

const option = (page: Page, kind: "proposal" | "alternative") => page.locator(`${CARD} .opt[data-kind="${kind}"]`);
const question = (page: Page) => page.locator(`${CARD} h1`);
async function choose(page: Page, kind: "proposal" | "alternative") {
  await option(page, kind).click();
  await expect(page.locator(CARD)).toHaveAttribute("data-mode", "reveal");
}
const confirm = (page: Page) => page.locator(CARD).getByRole("button", { name: /^Confirm/ }).click();
const panel = (page: Page, name: string) => page.getByRole("complementary", { name });
async function openCalibration(page: Page) {
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Your calibration" }).click();
  return panel(page, "Your calibration");
}

test("the blind test: started from your calibration; every card you answer marked; a rebuilt card is a past one with its options swapped, and says nothing", async ({ page }) => {
  const pasts: { id: string; question: string }[] = [];
  const { store } = await desk(page, (s) => {
    for (let i = 0; i < 12; i++) pasts.push(past(s, 20 - i));
    open(s, "auth");
    open(s, "billing");
    open(s, "cache");
  });
  // Before the test, no practice card comes: the first real answer is followed by a real card.
  const cal = await openCalibration(page);
  const section = cal.getByRole("region", { name: "Practice cards" });
  await expect(section).toContainText("A blind test comes first.");
  await expect(section).toContainText("12 cards can now.");
  await section.scrollIntoViewIfNeeded();
  await shot(page, "practice-calibration-before", true);
  await section.getByRole("button", { name: "Start the blind test" }).click();
  await expect(page.getByText("The blind test is on. Mark each card you answer.")).toBeVisible();
  await expect(cal).toBeHidden();
  expect(readPractice(store.live).map((e) => e.kind)).toEqual(["test-start"]);

  // A real card: answered as any card is; the reveal asks nothing more (B-9prve).
  const first = (await question(page).textContent())!;
  await choose(page, "proposal");
  await expect(page.locator(CARD)).not.toContainText(/rebuilt/i);
  await confirm(page);
  // Every card's toast says the same in the test: recorded, never sent (B-wcb9d).
  await expect(page.getByText(/^Recording it in/)).toBeVisible();
  // Then, before the next card, a card of its own asks your guess about it; the answer is already on its way.
  const guess = guessCard(page);
  await expect(guess.getByRole("heading", { name: "Was that card rebuilt from a past one?" })).toBeVisible();
  await expect(guess).toContainText(`“${first.replace(/^Which way for the auth work, (\d+)\?$/, "Waiting $1")}”, the card you just answered.`);
  await expect(guess).toContainText("Blind test: your answer is on its way.");
  await expect(liveCard(page)).toHaveCount(0);
  await expect(page.locator(".crumbs")).toHaveText("blind test › Your guess");
  // Nothing skips it: not Esc, not an arrow. Z takes the answer back, and the card with it.
  await page.keyboard.press("Escape");
  await page.keyboard.press("ArrowRight");
  await expect(guess).toBeVisible();
  await shot(page, "practice-guess", true);
  await page.keyboard.press("z");
  await expect(guessCard(page)).toHaveCount(0);
  await expect(question(page)).toHaveText(first);
  await choose(page, "proposal");
  await confirm(page);
  await expect(guessCard(page)).toBeVisible();
  // 1, 2 or 3 give it: No.
  await page.keyboard.press("1");
  await expect(guessCard(page)).toHaveCount(0);
  await expect.poll(() => readPractice(store.live).filter((e) => e.kind === "mark")).toEqual([expect.objectContaining({ kind: "mark", mark: "no", revision: 1 })]);

  // The next is a rebuilt card: the oldest past card's question, its options swapped, each with its own crux answer.
  const oldest = pasts[0]!;
  await expect(question(page)).toHaveText(oldest.question);
  expect(await question(page).textContent()).not.toBe(first);
  await expect(option(page, "proposal").locator("h2")).toHaveText("Postgres");
  await expect(option(page, "proposal").locator(".ifans")).toHaveText("If so");
  await expect(option(page, "alternative").locator("h2")).toHaveText("SQLite (WAL mode)");
  await expect(option(page, "alternative").locator(".ifans")).toHaveText("If not");
  await expect(page.locator(CARD)).not.toContainText(/practice|rebuilt/i);
  await expect(page.locator(".summary")).toContainText("3 to answer.");
  await page.clock.runFor(1500);
  await page.waitForTimeout(800);
  await shot(page, "practice-test-card", true);
  // Chosen blind against the planted pick: the reveal names it as claude-code's, with the case it wrote for it.
  await choose(page, "alternative");
  await expect(page.locator(CARD)).toContainText("You chose SQLite (WAL mode). claude-code picked Postgres.");
  await expect(page.locator(`${CARD} .reasoning`)).toContainText(CASE);
  await expect(page.locator(`${CARD} .reasoning`)).not.toContainText(RATIONALE);
  await page.locator(CARD).getByRole("textbox").fill("Postgres is overkill here");
  await shot(page, "practice-test-reveal", true);
  await confirm(page);
  await expect(page.getByText(/^Recording it in/)).toBeVisible();
  // Its guess, by a click, names the card as it was shown, as any card's does.
  await expect(guessCard(page)).toContainText(`“Run store`);
  await guessCard(page).getByRole("button", { name: /^Maybe/ }).click();
  await expect(guessCard(page)).toHaveCount(0);
  // On the path it reads as a real card's would, until the test ends.
  await expect(page.locator(".path")).toContainText("you chose “SQLite (WAL mode)”, not claude-code's pick");
  await expect(page.locator(".path")).not.toContainText("practice:");
  await page.clock.fastForward(5100);
  await expect(page.getByText("Recorded.", { exact: true })).toBeVisible();
  // Kept as practice answers, apart from the record: nothing you typed, and nothing sent to an agent. Each guess is an
  // entry of its own, a rebuilt card's naming the card it came from, and that it was practice.
  await expect.poll(() => readPractice(store.live).map((e) => e.kind).sort()).toEqual(["answer", "mark", "mark", "test-start"]);
  const entries = readPractice(store.live);
  expect(entries.find((e) => e.kind === "answer")).toMatchObject({ card: oldest.id, revision: 1, blind: "other", final: "other", test: true });
  expect(entries.filter((e) => e.kind === "mark")).toEqual([expect.objectContaining({ mark: "no" }), expect.objectContaining({ card: oldest.id, mark: "maybe", practice: true })]);
  expect(entries.filter((e) => e.kind === "mark")[0]).not.toHaveProperty("practice");
  expect(JSON.stringify(entries)).not.toContain("overkill");
  expect(store.verdicts(oldest.id)).toHaveLength(1);
});

test("the tenth rebuilt card ends the test: its result opens, saves as a note, and the path then says which were practice", async ({ page }) => {
  const pasts: { id: string; question: string }[] = [];
  const { store } = await desk(page, (s) => {
    for (let i = 0; i < 11; i++) pasts.push(past(s, 20 - i));
    seed(s, pasts.slice(0, 9).map((p) => [p.id, "no"]), Array.from({ length: 25 }, (_, i) => (i < 3 ? "maybe" : "no")));
    open(s, "auth");
    open(s, "billing");
  });
  await choose(page, "proposal");
  await confirm(page);
  await page.keyboard.press("1");
  // The rebuilt card: the first past card that hasn't come back.
  await expect(question(page)).toHaveText(pasts[9]!.question);
  await choose(page, "proposal");
  await confirm(page);
  await page.keyboard.press("3");
  await page.clock.fastForward(5100);
  const result = panel(page, "The blind test's result");
  await expect(result).toBeVisible();
  await expect(result.locator(".lede")).toHaveText(/^You marked 4 of the 36 cards in the test as maybe or sure, and 1 of those was rebuilt, of 10 rebuilt in all\. Guessing would do that well \d+% of the time\. That doesn't beat guessing, so practice cards aren't spotted: they now come about 1 in 20 cards\.$/);
  await expect(result.locator(".practice-list li")).toHaveCount(10);
  await expect(result.locator(".practice-list li").last()).toContainText(`Run store`);
  await expect(result.locator(".practice-list li").last()).toContainText("You marked it sure. You'd answered it");
  await expect(result).toContainText("None went to an agent, and no agent was waiting on any of them.");
  await page.clock.runFor(1500);
  await page.waitForTimeout(800);
  await shot(page, "practice-result", true);
  const download = page.waitForEvent("download");
  await result.getByRole("button", { name: "Save the result as a note" }).click();
  const note = await download;
  expect(note.suggestedFilename()).toMatch(/^\d{4}-\d{2}-\d{2} Practice Cards Blind Test\.md$/);
  await result.getByRole("button", { name: /Close/ }).click();
  // The test is over: the rebuilt card says so on the path now; the real one as before.
  await expect(page.locator(".path")).toContainText("practice: you chose “Postgres”");
  expect(readPractice(store.live).filter((e) => e.kind === "answer")).toHaveLength(10);
  const cal = await openCalibration(page);
  await expect(cal.getByRole("region", { name: "Practice cards" })).toContainText("Practice cards passed the blind test, so about 1 in 20 of your cards is one.");
});

test("after the test, a practice card comes among your cards, says an agent stopped when the card before it did, and says it was practice once answered", async ({ page }) => {
  const pasts: { id: string; question: string }[] = [];
  let waited = "";
  const { store } = await desk(page, (s) => {
    for (let i = 0; i < 12; i++) pasts.push(past(s, 20 - i));
    seed(s, pasts.slice(0, 10).map((p) => [p.id, "no"]), Array.from({ length: 30 }, () => "no"));
    waited = open(s, "auth");
    open(s, "billing");
    s.startWaiting(waited, "claude-code");
  });
  await expect(page.locator(`${CARD} .stopped`)).toHaveText("claude-code stopped");
  await choose(page, "proposal");
  await confirm(page);
  await expect(page.getByText(/^Sending to claude-code in/)).toBeVisible();
  // No guess after the test: the next card comes at once.
  await expect(guessCard(page)).toHaveCount(0);
  // The practice card: the first past card that hasn't come back, saying its agent stopped, as the card before it did.
  await expect(question(page)).toHaveText(pasts[10]!.question);
  await expect(page.locator(`${CARD} .stopped`)).toHaveText("claude-code stopped");
  await expect(page.locator(".summary")).toContainText("2 to answer.");
  await page.clock.runFor(1500);
  await page.waitForTimeout(800);
  await shot(page, "practice-on-card", true);
  await choose(page, "alternative");
  await page.locator(CARD).getByRole("textbox").fill("not convinced");
  await confirm(page);
  await expect(page.getByText(/^That was practice\. Recording it in/)).toBeVisible();
  await expect(page.locator(".path")).toContainText("practice: you chose “SQLite (WAL mode)”");
  await page.clock.fastForward(5100);
  const note = page.getByRole("status").filter({ hasText: "That was a practice card" });
  await expect(note).toHaveText(/^That was a practice card, rebuilt from one you answered on .+\. The pick it showed was the option claude-code didn't pick, and no agent was waiting on it\. Nothing went to an agent, and anything you wrote wasn't kept\.Got it$/);
  await shot(page, "practice-on-after", true);
  await note.getByRole("button", { name: "Got it" }).click();
  await expect(note).toBeHidden();
  // Reopened from the path, it says it was practice, with nothing to change.
  await page.locator(".path").getByText("practice: you chose “SQLite (WAL mode)”").click();
  await expect(page.locator(CARD)).toHaveAttribute("data-mode", "review");
  await expect(page.locator(CARD)).toContainText("That was a practice card");
  await expect(page.locator(CARD).getByRole("button", { name: "Change your answer" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  // Nothing went to an agent: the real card has its verdict, the practice card's original no new one.
  expect(store.verdicts(waited)).toHaveLength(1);
  expect(store.verdicts(pasts[10]!.id)).toHaveLength(1);
  const last = readPractice(store.live).at(-1)!;
  expect(last).toEqual(expect.objectContaining({ kind: "answer", card: pasts[10]!.id, blind: "other", final: "other" }));
  expect(last).not.toHaveProperty("test");
  // Your calibration has its row.
  const cal = await openCalibration(page);
  const row = cal.getByRole("group", { name: /^Practice cards:/ });
  await expect(row).toHaveAttribute("aria-label", "Practice cards: 0 chose the planted pick blind, 0 came round to it, 1 kept to the other option, of 1.");
  await expect(row).toHaveClass(/thin/);
  // Kept against the planted pick, after choosing otherwise blind; every past card here came round to its agent's real pick.
  await expect(cal.getByRole("region", { name: "Practice cards" })).toContainText("You came round to a planted pick on 0 of 1 practice card where you chose otherwise blind, and to an agent's real pick on 12 of 12.");
  await cal.getByRole("region", { name: "Practice cards" }).scrollIntoViewIfNeeded();
  await shot(page, "practice-calibration-on", true);
  // The time you spend per card is about real cards: the practice card wasn't timed.
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.endsWith(":spent")).flatMap((k) => JSON.parse(localStorage.getItem(k) ?? "[]") as unknown[]).length)).toBe(1);
});

test("no practice card comes before the blind test, nor once it spotted them", async ({ page }) => {
  const pasts: { id: string; question: string }[] = [];
  const { store } = await desk(page, (s) => {
    for (let i = 0; i < 12; i++) pasts.push(past(s, 20 - i));
    open(s, "auth");
    open(s, "billing");
    open(s, "cache");
  });
  const questions = [...pasts.map((p) => p.question)];
  await choose(page, "proposal");
  await confirm(page);
  await expect(question(page)).not.toHaveText(new RegExp(questions.map((q) => q.replace(/[?]/g, "\\?")).join("|")));
  // Spotted: four of five marked right, as many marked wrong as guessing allows.
  seed(store, pasts.slice(0, 10).map((p, i) => [p.id, i < 4 ? "sure" : "no"]), Array.from({ length: 30 }, (_, i) => (i < 1 ? "maybe" : "no")));
  await page.reload();
  await expect(page.locator(CARD)).toBeVisible();
  const cal = await openCalibration(page);
  await expect(cal.getByRole("region", { name: "Practice cards" })).toContainText("You could tell rebuilt cards from real ones in the blind test, so practice cards are off.");
  await cal.getByRole("button", { name: /Close/ }).click();
  for (let i = 0; i < 2; i++) {
    await choose(page, "proposal");
    await confirm(page);
    await page.clock.fastForward(5100);
    if (await page.locator(CARD).count()) await expect(question(page)).not.toHaveText(new RegExp(questions.map((q) => q.replace(/[?]/g, "\\?")).join("|")));
  }
});

/**
 * The card's shape: every element's tag, classes, role and pressed state, in order, without its text; the two options
 * each under its kind, since which side each is on is drawn per card (D86).
 */
function skeleton(): string[] {
  const card = document.querySelector("article.card:not([data-leaving])")!;
  const shape = (el: Element) => [el.tagName, [...el.classList].sort().join("."), el.getAttribute("role") ?? "", el.getAttribute("aria-pressed") ?? ""].join("|");
  const outside = [card, ...card.querySelectorAll("*")].filter((el) => !el.closest(".opt"));
  const options = ["proposal", "alternative"].flatMap((kind) => {
    const opt = card.querySelector(`.opt[data-kind="${kind}"]`);
    return opt ? [`${kind}:`, ...[opt, ...opt.querySelectorAll("*")].map(shape)] : [];
  });
  return [...outside.map(shape), ...options];
}

for (const size of [{ name: "desktop", width: 1440, height: 900 }, ...PHONES.map((p) => ({ ...p, phone: true }))]) {
  test.describe(`${size.name}, ${size.width}×${size.height}`, () => {
    if ("phone" in size) test.use(phone(size));
    else test.use({ viewport: { width: size.width, height: size.height } });

    test("the card asking your guess in the blind test passes the layout check, and a click or a tap gives it (B-9prve)", async ({ page }) => {
      const pasts: { id: string; question: string }[] = [];
      await desk(
        page,
        (s) => {
          for (let i = 0; i < 12; i++) pasts.push(past(s, 20 - i));
          writePractice(s.live, started());
          open(s, "auth");
          open(s, "billing");
        },
        { reduced: true },
      );
      const problems: string[] = [];
      await ("phone" in size ? option(page, "proposal").tap() : option(page, "proposal").click());
      await confirm(page);
      await expect(guessCard(page)).toBeVisible();
      await page.waitForTimeout(80);
      for (const p of await page.evaluate(layoutProblems)) problems.push(`the guess: ${p}`);
      if ("phone" in size) for (const p of await page.evaluate(smallTargets)) problems.push(`the guess: ${p}`);
      // Its three answers are named without the keys on a screen you only touch.
      await expect(guessCard(page).getByRole("button", { name: /^Sure/ }).locator("kbd")).toHaveCount("phone" in size ? 0 : 1);
      await shot(page, "practice-guess-size", true);
      const sure = guessCard(page).getByRole("button", { name: /^Sure/ });
      await ("phone" in size ? sure.tap() : sure.click());
      await expect(guessCard(page)).toHaveCount(0);
      await expect(question(page)).toHaveText(pasts[0]!.question);
      expect(problems).toEqual([]);
    });

    test("a practice card can't be told from a real one by its layout, and passes the layout check", async ({ page }) => {
      let twin = "";
      const pasts: { id: string; question: string }[] = [];
      await desk(
        page,
        (s) => {
          for (let i = 0; i < 11; i++) pasts.push(past(s, 20 - i));
          seed(s, pasts.slice(0, 10).map((p) => [p.id, "no"]), Array.from({ length: 30 }, () => "no"));
          open(s, "auth");
          // A real card with what the practice card has: a fact, a case without "wrong if", a background.
          twin = open(s, "billing", { crux_fact: "Today one laptop writes runs.", rationale: RATIONALE, proposal: "Postgres", alternative: "SQLite (WAL mode)", crux_proposal: "If so", crux_alternative: "If not" });
        },
        { reduced: true },
      );
      const problems: string[] = [];
      const check = async (state: string) => {
        await page.waitForTimeout(80);
        for (const p of await page.evaluate(layoutProblems)) problems.push(`${state}: ${p}`);
        if ("phone" in size) for (const p of await page.evaluate(smallTargets)) problems.push(`${state}: ${p}`);
      };
      const tap = (kind: "proposal" | "alternative") => ("phone" in size ? option(page, kind).tap() : option(page, kind).click());
      await tap("proposal");
      await confirm(page);
      await expect(question(page)).toHaveText(pasts[10]!.question);
      await check("a practice card");
      const live = await page.evaluate(skeleton);
      await shot(page, "practice-live", true);
      await tap("alternative");
      await expect(page.locator(CARD)).toHaveAttribute("data-mode", "reveal");
      await check("a practice card's reveal");
      const reveal = await page.evaluate(skeleton);
      await confirm(page);
      await page.clock.fastForward(5100);
      await expect(page.getByRole("status").filter({ hasText: "That was a practice card" })).toBeVisible();
      await check("a practice card, answered");
      await shot(page, "practice-answered", true);
      // The real card with the same parts, the next in the queue.
      await page.getByRole("status").filter({ hasText: "That was a practice card" }).getByRole("button", { name: "Got it" }).click();
      await expect(page.locator(`${CARD} h1`)).toContainText("Which way for the billing work");
      expect(await page.locator(CARD).getAttribute("aria-label")).toContain("billing");
      expect(await page.evaluate(skeleton)).toEqual(live);
      await tap("alternative");
      await expect(page.locator(CARD)).toHaveAttribute("data-mode", "reveal");
      expect(await page.evaluate(skeleton)).toEqual(reveal);
      void twin;
      expect(problems).toEqual([]);
    });
  });
}
