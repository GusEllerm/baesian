import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Page, expect, test } from "@playwright/test";
import { renderDoc } from "../src/frontmatter.js";
import { type RunningServer, startServer } from "../src/server.js";
import type { Store } from "../src/store.js";
import { BODY, cleanup, draft, repo } from "../test/helpers.js";
import { layoutProblems } from "./layout.js";

// M4 step 5e: what's around the card. The presence heartbeat (D41), notifications (D40), the menu and its panels,
// the empty desk, and the "new" tag. A real server and browser.

let server: RunningServer | undefined;
test.afterEach(async () => {
  await server?.close();
  server = undefined;
  cleanup();
});

const CARD = "article.card:not([data-leaving])";
const agent = { agent: "claude-code", force: true };
const file = (store: Store, over: Record<string, unknown>) => store.fileCard(draft({ reverse: "cheap", ...over }), BODY, agent).card.meta.id;

/**
 * A stand-in for the browser's notifications: Playwright's Chromium can't show real ones. It records what the
 * page shows, grants permission when asked, and lets a test say whether the page has the focus.
 */
const FAKE_NOTIFICATIONS = () => {
  const w = window as unknown as Record<string, unknown>;
  w.__notes = [];
  w.__asked = 0;
  w.__focused = true;
  let permission = "default";
  class FakeNotification {
    title: string;
    body: string;
    onclick: (() => void) | null = null;
    constructor(title: string, opts: { body: string }) {
      this.title = title;
      this.body = opts.body;
      (w.__notes as FakeNotification[]).push(this);
    }
    close() {}
    static get permission() {
      return permission;
    }
    static async requestPermission() {
      w.__asked = (w.__asked as number) + 1;
      permission = "granted";
      return permission;
    }
  }
  w.Notification = FakeNotification;
  document.hasFocus = () => w.__focused as boolean;
};

async function open(page: Page, setup: (store: Store) => void, opts: { empty?: boolean } = {}) {
  const r = repo();
  setup(r.store);
  server = await startServer(r.store, { reviewer: "tester", writeServerFile: false, debounceMs: 20 });
  await page.addInitScript(FAKE_NOTIFICATIONS);
  await page.clock.install();
  await page.goto(server.url);
  await expect(page.locator(opts.empty ? ".empty" : CARD)).toBeVisible();
  return r;
}
async function choose(page: Page, kind: "proposal" | "alternative") {
  await page.locator(`${CARD} .opt[data-kind="${kind}"]`).click();
  await page.locator(CARD).getByRole("button", { name: /Confirm/ }).click();
}
const menu = (page: Page, item: string | RegExp) => page.getByRole("button", { name: "More" }).click().then(() => page.getByRole("menuitem", { name: item }).or(page.getByRole("menuitemcheckbox", { name: item })).click());

test("the open page says you're there, every 30 seconds (D41)", async ({ page }) => {
  const { store } = await open(page, (s) => file(s, { title: "The run store", topic: "alpha/a" }));
  await expect.poll(() => store.presence()?.client).toBe("web");
  rmSync(join(store.live, "presence.json"));
  await page.clock.runFor(30_000);
  await expect.poll(() => store.presence()?.client).toBe("web");
});

test("notifications are asked for on a click, and a card an agent stops for is notified while you're away (D40)", async ({ page }) => {
  const { store } = await open(page, (s) => file(s, { title: "The run store", topic: "alpha/a" }));
  expect(await page.evaluate(() => (window as unknown as { __asked: number }).__asked)).toBe(0); // never on load
  await menu(page, /Notify me when an agent stops/);
  expect(await page.evaluate(() => (window as unknown as { __asked: number }).__asked)).toBe(1);
  await expect(page.getByText("Notifications are on.")).toBeVisible();
  await expect(page.getByRole("button", { name: "More" })).toBeVisible();

  // While you're looking elsewhere, a card an agent stops for is news; a provisional one isn't.
  await page.evaluate(() => ((window as unknown as { __focused: boolean }).__focused = false));
  file(store, { title: "Relative times", question: "How should times show?", topic: "beta/a" });
  await expect(page.locator(".path .row.next", { hasText: "Relative times" })).toBeVisible();
  file(store, { title: "Where the token lives", question: "Where should the token live?", topic: "beta/b", level: "blocking" });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __notes: { title: string; body: string }[] }).__notes.map((n) => `${n.title}: ${n.body}`))).toEqual([
    "claude-code is waiting for you: Where should the token live?",
  ]);
  // Clicking the notification opens its card.
  await page.evaluate(() => (window as unknown as { __notes: { onclick: () => void }[] }).__notes[0]!.onclick());
  await expect(page.locator(CARD)).toHaveAttribute("aria-label", "Where should the token live?");
});

test("the keys and your calibration open from the menu; ? and Esc open and close the keys", async ({ page }) => {
  await open(page, (s) => file(s, { title: "The run store", topic: "alpha/a" }));
  await page.keyboard.press("?");
  await expect(page.getByRole("complementary", { name: "Keyboard shortcuts" })).toContainText("Next or previous card");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Keyboard shortcuts" })).toHaveCount(0);
  await expect(page.locator(CARD)).toBeVisible(); // Esc closed the panel, and nothing else

  // The menu takes the arrow keys while it's open, so they don't move the card.
  await page.getByRole("button", { name: "More" }).click();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: /Keyboard shortcuts/ })).toBeFocused();
  await expect(page.locator(CARD)).toHaveAttribute("data-mode", "live");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);

  await menu(page, "Your calibration");
  const panel = page.getByRole("complementary", { name: "Your calibration" });
  await expect(panel).toContainText("Mythic and rare: none yetUncommon: none yetCommon: none yet");
  await expect(panel).toContainText("None of the decisions you settled here has been superseded.");
});

test("your calibration counts the time you spend, and names a decision you settled that was later superseded", async ({ page }) => {
  await open(page, (s) => {
    const old = file(s, { title: "Keep runs in SQLite", question: "Where do runs go?", topic: "storage/a" });
    s.addVerdict({ card: old, revision: 1, response: "accept", reviewer: "tester", client: "web" });
    const replacement = file(s, { title: "Keep runs in Postgres", question: "Where do runs go now?", topic: "storage/b", supersedes: old });
    s.addVerdict({ card: replacement, revision: 1, response: "accept", reviewer: "tester", client: "cli" });
    file(s, { title: "The run store", topic: "alpha/a" });
  });
  await page.clock.fastForward(4000);
  await choose(page, "proposal");
  await menu(page, "Your calibration");
  const panel = page.getByRole("complementary", { name: "Your calibration" });
  await expect(panel).toContainText(/Uncommon: none yetCommon: \d+\.\d\u00a0s/);
  await expect(panel).toContainText("“Keep runs in SQLite”: settled here, then superseded by a later decision.");
});

test("the empty desk recaps your session, lists what you put aside, and offers notifications", async ({ page }) => {
  await open(page, (s) => {
    const aside = file(s, { title: "The retry policy", question: "How often should runs retry?", topic: "zeta/a" });
    s.addVerdict({ card: aside, revision: 1, response: "not_my_area", reviewer: "tester", client: "web" });
    file(s, { title: "The run store", topic: "alpha/a" });
  });
  await choose(page, "proposal");
  const empty = page.locator(".empty");
  await expect(empty).toContainText("All caught up.");
  await expect(empty).toContainText("You answered 1 card, and took the agent's pick.");
  await expect(empty.getByRole("button", { name: /The retry policy/ })).toContainText("You said it's outside your expertise.");
  await expect(empty.getByRole("button", { name: "Notify me when an agent stops" })).toBeVisible();

  // A card you put aside can be answered after all.
  await empty.getByRole("button", { name: /The retry policy/ }).click();
  await expect(page.locator(CARD)).toHaveAttribute("aria-label", "How often should runs retry?");
});

test("the card in front of you stays there when the queue's order changes (5f)", async ({ page }) => {
  let later = "";
  const { store } = await open(page, (s) => {
    file(s, { title: "Card a", question: "Question a?", topic: "alpha/a" });
    later = file(s, { title: "Card b", question: "Question b?", topic: "beta/b" });
  });
  await page.locator(`${CARD} .opt[data-kind="proposal"]`).click();
  await expect(page.locator(CARD)).toHaveAttribute("data-mode", "reveal");
  // An agent starts waiting on the other card, which puts it at the front of the queue.
  store.startWaiting(later, "codex");
  await expect(page.locator(".path .row.next", { hasText: "Card b" })).toBeVisible();
  await expect(page.getByText("One agent has stopped for you.")).toBeVisible();
  await expect(page.locator(CARD)).toHaveAttribute("aria-label", "Question a?");
  await expect(page.locator(CARD)).toHaveAttribute("data-mode", "reveal");
});

test("an answer against the pick may get one reply, and the card comes back with it (D89, D104)", async ({ page }) => {
  let id = "";
  const { store } = await open(page, (s) => {
    id = file(s, { title: "The run store", question: "Which store?", topic: "alpha/a" });
  });
  await page.locator(`${CARD} .opt[data-kind="alternative"]`).click();
  await expect(page.locator(CARD)).toContainText("It goes to claude-code with your answer, and claude-code may reply once, with a new fact or a check.");
  await page.locator(CARD).getByRole("button", { name: /Confirm/ }).click();
  await page.clock.fastForward(5100);
  await expect.poll(() => store.status(id)).toBe("resolved");

  store.replyToCard(id, "Only the CI runner writes runs.", { agent: "claude-code" });
  const reply = page.locator(`${CARD} .facet.reply`);
  await expect(reply).toHaveText("claude-code repliedYou chose “Postgres”. Only the CI runner writes runs.");
  // It has had its reply: answering against its pick again promises nothing more.
  await page.locator(`${CARD} .opt[data-kind="alternative"]`).click();
  await expect(page.locator(CARD)).toContainText("It goes to claude-code with your answer.");
  await expect(page.locator(CARD)).not.toContainText("may reply once");
});

test("ticking 'make this a rule' brings back a draft, and accepting it saves the rule (D16, D109, D110)", async ({ page }) => {
  let id = "";
  const { store } = await open(page, (s) => {
    id = file(s, { title: "The test runner", question: "Which test runner?", topic: "testing/runner", proposal: "pytest", alternative: "unittest" });
  });
  await page.locator(`${CARD} .opt[data-kind="proposal"]`).click();
  await page.locator(CARD).getByLabel(/Make this a rule/).check();
  // The box leaves the keys to the card: pressing the side again still confirms.
  const side = (await page.locator(`${CARD} .opt[data-kind="proposal"]`).getAttribute("data-side")) === "left" ? "ArrowLeft" : "ArrowRight";
  await page.keyboard.down(side);
  await page.keyboard.up(side);
  await page.clock.fastForward(5100);
  await expect.poll(() => store.verdicts(id).at(-1)?.make_rule).toBe(true);

  const draft = store.draftRule(id, "Use pytest for every Python test suite.", ["dep:pytest*"], { agent: "claude-code" }).meta.id;
  await expect(page.locator(CARD)).toHaveAttribute("aria-label", "Make this a rule: “Use pytest for every Python test suite.”?");
  await expect(page.locator(CARD).getByLabel(/Make this a rule/)).toHaveCount(0); // not on a draft itself
  // The decision is on your trail, joined to the draft that builds on it.
  await expect(page.locator(".path .row.past", { hasText: "The test runner" })).toContainText("this card builds on");
  await page.clock.fastForward(2100); // a rule is costly to undo: the draft asks you to read it first (D91)
  await page.locator(`${CARD} .opt[data-kind="proposal"]`).click();
  await page.locator(CARD).getByRole("button", { name: /Confirm/ }).click();
  await page.clock.fastForward(5100);
  await expect.poll(() => store.rules().map((r) => r.body.trim())).toEqual(["Use pytest for every Python test suite."]);
  expect(store.rules()[0]!.meta).toMatchObject({ covers: ["dep:pytest*"], from_card: id, accepted_by: "tester" });
  expect(store.status(draft)).toBe("resolved");
});

test("choosing an option that breaks one of your rules offers to retire it, and ticking it does (D119)", async ({ page }) => {
  let id = "";
  const { store } = await open(page, (s) => {
    const rule = { type: "rule", id: "R-aaaaa", covers: ["dep:pytest*"], accepted_by: "gus", created: new Date().toISOString() };
    writeFileSync(join(s.live, "rules", "R-aaaaa.md"), renderDoc(rule, "Use pytest for every Python test suite.\n"));
    id = file(s, { title: "The CLI's smoke tests", question: "How should the CLI's smoke tests run?", topic: "testing/smoke", proposal: "A shell script", alternative: "pytest", proposal_breaks: ["R-aaaaa"] });
  });
  // The option that keeps to the rule offers nothing to retire.
  await page.locator(`${CARD} .opt[data-kind="alternative"]`).click();
  await expect(page.locator(CARD).getByLabel(/Retire this rule/)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.locator(`${CARD} .opt[data-kind="proposal"]`).click();
  await page.locator(CARD).getByLabel(/Retire this rule: Use pytest for every Python test suite/).check();
  await page.locator(CARD).getByRole("button", { name: /Confirm/ }).click();
  await page.clock.fastForward(5100);
  await expect.poll(() => store.verdicts(id).at(-1)?.retire_rules).toEqual(["R-aaaaa"]);
  expect(store.rules()[0]!.retired).toMatchObject({ rule: "R-aaaaa", card: id, by: "tester" });
});

test("a card whose topic looks like another offers the merge, and asks once more (D44, D111)", async ({ page }) => {
  const { store } = await open(page, (s) => {
    const earlier = file(s, { title: "Timestamp format", question: "Which timestamp format?", topic: "time/format" });
    s.addVerdict({ card: earlier, revision: 1, response: "accept", reviewer: "gus", client: "web" });
    file(s, { title: "Clock source", question: "Which clock should stamp cards?", topic: "time/formats" });
  });
  const line = page.locator(`${CARD} .topic-merge`);
  await expect(line).toHaveText("Its topic, time/formats, looks like time/format (1 card). Same topic?");
  expect(await page.evaluate(layoutProblems)).toEqual([]);
  await expect(page.locator(".path .row", { hasText: "Timestamp format" })).toHaveCount(0); // two topics: no precedent yet
  await line.getByRole("button", { name: "time/format" }).click();
  await expect(line).toContainText("Merge time/formats into time/format? Decisions on both then count as one topic, and it can't be undone.");
  expect(store.aliases()).toEqual([]);
  await line.getByRole("button", { name: "Merge them" }).click();
  await expect(page.getByText("Merged: “time/formats” now counts as “time/format”.")).toBeVisible();
  await expect.poll(() => store.canonicalTopic("time/formats")).toBe("time/format");
  // Now one topic: no line, and the earlier decision is this card's precedent.
  await expect(page.locator(`${CARD} .topic-merge`)).toHaveCount(0);
  await expect(page.locator(".path .row", { hasText: "Timestamp format" })).toBeVisible();
});

test("a card's body shows with the agent's case, once you've chosen (D92)", async ({ page }) => {
  await open(page, (s) => {
    file(s, { title: "The run store", question: "Which store?", topic: "alpha/a" }); // the agent wrote no case: the body is all of it
  });
  await expect(page.locator(CARD)).not.toContainText("Postgres is available but adds an ops dependency.");
  await page.locator(`${CARD} .opt[data-kind="alternative"]`).click();
  const context = page.locator(`${CARD} details.context`);
  await expect(context.locator("summary")).toHaveText("More from claude-code");
  await expect(context).toHaveAttribute("open", "");
  await expect(context).toContainText("Postgres is available but adds an ops dependency.");
  await expect(page.locator(CARD)).not.toContainText("gave no reasoning beyond the card");
  expect(await page.evaluate(layoutProblems)).toEqual([]);
});

test("a card's body waits behind its summary when the agent gave its case too (D92)", async ({ page }) => {
  await open(page, (s) => {
    file(s, { title: "The run store", question: "Which store?", topic: "alpha/a", rationale: "One writer is enough." });
  });
  await page.locator(`${CARD} .opt[data-kind="proposal"]`).click();
  const context = page.locator(`${CARD} details.context`);
  await expect(page.locator(`${CARD} .reasoning q`)).toHaveText("One writer is enough."); // the quote marks are the stylesheet's
  await expect(context).not.toHaveAttribute("open", "");
  await context.locator("summary").click();
  await expect(context).toContainText("Postgres is available but adds an ops dependency.");
});

test("a card that arrives is tagged new until it's been on the desk", async ({ page }) => {
  const { store } = await open(page, (s) => {
    file(s, { title: "Card a", question: "Question a?", topic: "alpha/a" });
    file(s, { title: "Card b", question: "Question b?", topic: "alpha/b" });
  });
  // What was there the first time you opened the project isn't new.
  await expect(page.locator(".path .row.next", { hasText: "Card b" })).toBeVisible();
  await expect(page.locator(".path .row.next", { hasText: "Card b" }).locator(".new-tag")).toHaveCount(0);
  file(store, { title: "Card c", question: "Question c?", topic: "alpha/c" });
  const c = page.locator(".path .row.next", { hasText: "Card c" });
  await expect(c.locator(".new-tag")).toHaveText("new");
  await c.click();
  await expect(page.locator(CARD)).toHaveAttribute("aria-label", "Question c?");
  await page.keyboard.press("j");
  await expect(page.locator(CARD)).toHaveAttribute("aria-label", "Question a?");
  await expect(page.locator(".path .row.next", { hasText: "Card c" })).toBeVisible();
  await expect(page.locator(".path .row.next", { hasText: "Card c" }).locator(".new-tag")).toHaveCount(0);
});
