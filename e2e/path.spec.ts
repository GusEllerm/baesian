import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Page, expect, test } from "@playwright/test";
import { renderDoc } from "../src/frontmatter.js";
import { type RunningServer, startServer } from "../src/server.js";
import type { Store } from "../src/store.js";
import { BODY, cleanup, draft, repo } from "../test/helpers.js";
import { skipSetup } from "./setup.js";

// M4 step 5d: the path beside the card, the pile under it, and changing an answer. A real server and browser.

let server: RunningServer | undefined;
test.afterEach(async () => {
  await server?.close();
  server = undefined;
  cleanup();
});

const CARD = "article.card:not([data-leaving])";
const agent = { agent: "claude-code", force: true };
const file = (store: Store, over: Record<string, unknown>) => store.fileCard(draft({ reverse: "cheap", ...over }), BODY, agent).card.meta.id;

async function open(page: Page, setup: (store: Store) => void) {
  const r = repo();
  setup(r.store);
  server = await startServer(r.store, { reviewer: "tester", writeServerFile: false, debounceMs: 20 });
  await skipSetup(page, r.dir);
  await page.clock.install();
  await page.goto(server.url);
  await expect(page.locator(CARD)).toBeVisible();
  return r;
}
async function choose(page: Page, kind: "proposal" | "alternative") {
  await page.locator(`${CARD} .opt[data-kind="${kind}"]`).click();
  await page.locator(CARD).getByRole("button", { name: /Confirm/ }).click();
}

test("your answers stay on the path, the card's node is joined to the card, and what's next follows", async ({ page }) => {
  await open(page, (s) => {
    file(s, { title: "The run store", question: "Which store?", topic: "alpha/a" });
    file(s, { title: "Run file layout", question: "Where do files go?", topic: "alpha/b" });
  });
  await expect(page.locator(".path .next-h")).toHaveText("Next");
  await expect(page.locator(".path .row.next")).toHaveText(/Run file layout/);
  await choose(page, "proposal");
  await page.clock.runFor(1200);
  await expect(page.locator(".path .row.past")).toHaveText(/The run store.*you chose “SQLite \(WAL mode\)”/);
  await expect(page.locator(".path .row.now")).toHaveCount(1);
  await expect(page.locator(".path-lines .join")).toHaveCount(1);
  await expect(page.locator(".path-lines .spine.done")).toHaveCount(1);
});

test("what the card builds on hangs off its node, and a card that relies on it shows once, in Next", async ({ page }) => {
  await open(page, (s) => {
    const parent = file(s, { title: "Serve with Node's http module", question: "What serves the client?", topic: "server/http" });
    s.addVerdict({ card: parent, revision: 1, response: "accept", reviewer: "gus", client: "web" });
    const subject = file(s, { title: "Where the token lives", question: "Where should the token live?", topic: "client/auth", depends_on: [parent] });
    file(s, { title: "Relative times", question: "How should times show?", topic: "client/time", depends_on: [subject] });
  });
  await page.clock.fastForward(2100); // the card with a dependent is uncommon: it asks you to read first
  const builds = page.locator(".path .row.rel", { hasText: "Serve with Node's http module" });
  await expect(builds).toContainText("this card builds on");
  await expect(builds).toContainText("settled earlier");
  await expect(page.locator(".path .row", { hasText: "Relative times" })).toHaveCount(1);
  await expect(page.locator(".path .row.next", { hasText: "Relative times" })).toContainText("it relies on this card");
});

test("leaning toward an option lights what it would do to a rule (D79)", async ({ page }) => {
  await open(page, (s) => {
    mkdirSync(join(s.live, "rules"), { recursive: true });
    writeFileSync(join(s.live, "rules", "R-7f3kq.md"), renderDoc({ type: "rule", id: "R-7f3kq", covers: [], accepted_by: "gus", created: new Date().toISOString() }, "Never put secrets in URLs.\n"));
    file(s, { title: "Where the token lives", question: "Where should the token live?", topic: "client/auth", proposal: "In the URL fragment", alternative: "In a cookie", proposal_breaks: ["R-7f3kq"] });
  });
  const rule = page.locator(".path .row.rel", { hasText: "Never put secrets in URLs" });
  await expect(rule).toContainText("this card may conflict with");
  await expect(rule).toContainText("“In the URL fragment” may break it");
  await page.locator(`${CARD} .opt[data-kind="proposal"]`).hover();
  await expect(rule).toHaveClass(/fx-bad/);
  await expect(rule).toContainText("✗ May break it");
  await page.locator(`${CARD} .opt[data-kind="alternative"]`).hover();
  await expect(rule).toHaveClass(/fx-good/);
  await expect(rule).toContainText("✓ Keeps to it");
});

/** Where the line into the card ends, and the card's left edge, in the desk's coordinates. */
const joinAndCard = (page: Page) =>
  page.evaluate(() => {
    const desk = document.querySelector(".desk")!.getBoundingClientRect();
    const d = document.querySelector(".path-lines .join")?.getAttribute("d") ?? "";
    const card = document.querySelector("article.card:not([data-leaving])")!.getBoundingClientRect();
    return { end: Number(d.match(/H ([\d.-]+)/)?.[1] ?? NaN), card: card.left - desk.left };
  });
/** Drag the card sideways from its crux by `dx`, in steps, with the clock running. */
async function drag(page: Page, dx: number, release = true) {
  const box = (await page.locator(`${CARD} .crux`).boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(x + (dx * i) / 10, y);
    await page.clock.runFor(16);
  }
  if (release) await page.mouse.up();
}

test("the line into the card follows it as it's dragged, and meets it again once it's back at rest", async ({ page }) => {
  await open(page, (s) => {
    file(s, { title: "The run store", question: "Which store?", topic: "alpha/a" });
  });
  await drag(page, -120, false);
  const held = await joinAndCard(page);
  expect(held.end - held.card).toBeGreaterThan(-8); // the card is turned a little, so its box is wider than its edge
  expect(held.end - held.card).toBeLessThan(8);
  await page.mouse.up();
  await page.clock.runFor(1000);
  const rest = await joinAndCard(page);
  expect(Math.abs(rest.end - rest.card - 2)).toBeLessThan(1.5);

  // Past the threshold the drag chooses, and the card springs back for the reveal: the line comes back with it.
  await drag(page, -900);
  await page.clock.runFor(1000);
  await expect(page.locator(CARD)).toHaveAttribute("data-mode", "reveal");
  const after = await joinAndCard(page);
  expect(Math.abs(after.end - after.card - 2)).toBeLessThan(1.5);
});

test("dragging the card toward an option lights the path as holding an arrow does", async ({ page }) => {
  await open(page, (s) => {
    mkdirSync(join(s.live, "rules"), { recursive: true });
    writeFileSync(join(s.live, "rules", "R-7f3kq.md"), renderDoc({ type: "rule", id: "R-7f3kq", covers: [], accepted_by: "gus", created: new Date().toISOString() }, "Never put secrets in URLs.\n"));
    file(s, { title: "Where the token lives", question: "Where should the token live?", topic: "client/auth", proposal: "In the URL fragment", alternative: "In a cookie", proposal_breaks: ["R-7f3kq"] });
  });
  const rule = page.locator(".path .row.rel", { hasText: "Never put secrets in URLs" });
  const side = await page.locator(`${CARD} .opt[data-kind="proposal"]`).getAttribute("data-side");
  await drag(page, side === "left" ? -100 : 100, false);
  await expect(rule).toHaveClass(/fx-bad/);
  await page.mouse.up();
  await page.clock.runFor(1000);
  await expect(rule).not.toHaveClass(/fx-bad/);
});

/** The animations running in the path's rows (the glide and fades), not the flight or anything on the card. */
const pathAnimations = (page: Page) =>
  page.evaluate(() => document.getAnimations().filter((a) => (a.effect as KeyframeEffect | null)?.target instanceof Element && ((a.effect as KeyframeEffect).target as Element).matches(".path [data-flip]")).length);

test("answering glides the path into its new places, and with reduced motion it changes at once", async ({ page }) => {
  await open(page, (s) => {
    file(s, { title: "The run store", question: "Which store?", topic: "alpha/a" });
    file(s, { title: "Run file layout", question: "Where do files go?", topic: "alpha/b" });
    file(s, { title: "Run retention", question: "How long are runs kept?", topic: "alpha/c" });
  });
  await choose(page, "proposal");
  expect(await pathAnimations(page)).toBeGreaterThan(0);
  await expect.poll(() => pathAnimations(page)).toBe(0); // the glide is over in well under a second
  await expect(page.locator(".path .row.past")).toHaveText(/The run store/);

  // A changed setting takes effect when the page loads again (the flight reads it once, as Motion does).
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Where do files go?" })).toBeVisible();
  await choose(page, "proposal");
  expect(await pathAnimations(page)).toBe(0);
  await expect(page.locator(".path .row.past")).toHaveText(/Run file layout/);
});

/** Where the path's lines are drawn and where its nodes are, down the desk: both from the lines' own origin. */
const linesAndNodes = (page: Page) =>
  page.evaluate(() => {
    const svg = document.querySelector(".path-lines")!.getBoundingClientRect();
    const mid = (el: Element | null) => {
      const r = el?.getBoundingClientRect();
      return r ? r.top + r.height / 2 - svg.top : NaN;
    };
    const join = /M ([\d.-]+) ([\d.-]+)/.exec(document.querySelector(".path-lines .join")?.getAttribute("d") ?? "");
    const ahead = /M ([\d.-]+) ([\d.-]+) V ([\d.-]+)/.exec(document.querySelector(".path-lines .spine.ahead")?.getAttribute("d") ?? "");
    return {
      now: mid(document.querySelector(".path .row.now .node")),
      next: mid(document.querySelector(".path .row.next .node")),
      join: join ? Number(join[2]) : NaN,
      aheadFrom: ahead ? Number(ahead[2]) : NaN,
      aheadTo: ahead ? Number(ahead[3]) : NaN,
    };
  });

test("the lines come to rest on the nodes they join, though the glide itself is held up", async ({ page }) => {
  // The setup offer is on the desk, with both cards under "Next". An agent stops for the first: the offer gives way to
  // it, and the path glides into a new arrangement. Here every animation is held at its start, as in a window that isn't
  // being drawn, for longer than the glide lasts: the lines mustn't stay where the glide began.
  const r = repo();
  const first = file(r.store, { title: "The run store", question: "Which store?", topic: "alpha/a" });
  file(r.store, { title: "Keeping real file names out of a development build", question: "Should real names be kept out?", topic: "alpha/b" });
  server = await startServer(r.store, { reviewer: "tester", writeServerFile: false, debounceMs: 20 });
  await page.goto(server.url);
  await expect(page.getByRole("heading", { name: "How much should reach you?" })).toBeVisible();
  await expect(page.locator(".path .row.next")).toHaveCount(2);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0 });
  r.store.startWaiting(first, "claude-code");
  await expect(page.locator(CARD)).toHaveAttribute("aria-label", "Which store?");
  await page.waitForTimeout(1200);
  const held = await linesAndNodes(page);
  // Let go, the glide runs to its end: the nodes come to where the lines already are.
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
  await expect.poll(() => pathAnimations(page)).toBe(0);
  await page.waitForTimeout(600);
  const rest = await linesAndNodes(page);
  expect(rest.now).toBeGreaterThan(held.now + 40); // it did glide: the card's node has come down to the card's question
  for (const lines of [held, rest]) {
    expect(Math.abs(lines.join - rest.now)).toBeLessThan(1.5);
    expect(Math.abs(lines.aheadFrom - (rest.now + 19))).toBeLessThan(1.5);
    expect(lines.aheadTo).toBeGreaterThan(rest.now + 30);
    expect(lines.aheadTo).toBeLessThan(rest.next);
  }
});

test("the lines stay on their nodes when the desk is scrolled", async ({ page }) => {
  // A short window: the card is taller than the desk, which scrolls. The lines are drawn in the desk's own space, so they
  // move with what they join, and measuring them again while it's scrolled doesn't shift them.
  await page.setViewportSize({ width: 1440, height: 420 });
  await open(page, (s) => {
    file(s, { title: "The run store", question: "Which store?", topic: "alpha/a" });
    file(s, { title: "Run file layout", question: "Where do files go?", topic: "alpha/b" });
  });
  await page.clock.runFor(1000);
  const scrolled = await page.evaluate(() => {
    const desk = document.querySelector(".desk")!;
    desk.scrollTop = 60;
    return desk.scrollTop;
  });
  expect(scrolled).toBeGreaterThan(20);
  // Measured again, as after any change: here, the window's width.
  await page.setViewportSize({ width: 1400, height: 420 });
  await page.clock.runFor(1000);
  // The desk's own change of size is heard a frame later: give it one, then the clock its turn.
  await page.waitForTimeout(300);
  await page.clock.runFor(1000);
  const at = await linesAndNodes(page);
  expect(Math.abs(at.join - at.now)).toBeLessThan(1.5);
  expect(Math.abs(at.aheadFrom - (at.now + 19))).toBeLessThan(1.5);
  // And the line into the card still meets the card.
  const joined = await joinAndCard(page);
  expect(Math.abs(joined.end - joined.card - 2)).toBeLessThan(1.5);
});

test("going to a card from the path moves the focus to it, and the path's rows show a focus ring", async ({ page }) => {
  await open(page, (s) => {
    file(s, { title: "The run store", question: "Which store?", topic: "alpha/a" });
    file(s, { title: "Run file layout", question: "Where do files go?", topic: "alpha/b" });
  });
  const next = page.locator(".path .row.next", { hasText: "Run file layout" });
  await next.focus();
  expect(await next.evaluate((r) => getComputedStyle(r).outlineStyle)).toBe("solid");
  await page.keyboard.press("Enter");
  await page.clock.runFor(100);
  await expect(page.getByRole("heading", { name: "Where do files go?" })).toBeVisible();
  await expect(page.locator(CARD)).toBeFocused();
});

test("an answered card reopens from the path, and a changed answer is recorded with a brief (D81)", async ({ page }) => {
  const { store } = await open(page, (s) => {
    file(s, { title: "The run store", question: "Which store?", topic: "alpha/a" });
    file(s, { title: "Run file layout", question: "Where do files go?", topic: "alpha/b" });
  });
  const id = store.cardIds().find((x) => store.card(x)!.meta.title === "The run store")!;
  await choose(page, "proposal");
  await page.clock.fastForward(5100);
  await expect.poll(() => store.verdicts(id).length).toBe(1);
  await page.locator(".path .row.past", { hasText: "The run store" }).click();
  await expect(page.locator(CARD)).toContainText("It was sent to claude-code.");
  await page.locator(CARD).getByRole("button", { name: "Change your answer" }).click();
  await choose(page, "alternative");
  await page.clock.fastForward(5100);
  await expect.poll(() => store.verdicts(id).length).toBe(2);
  expect(store.briefs(id)).toEqual([expect.objectContaining({ kind: "answer-changed", was: "SQLite (WAL mode)", now: "Postgres" })]);
  // It kept its place on the path, with the new answer.
  await expect(page.locator(".path .row.past", { hasText: "The run store" })).toContainText("you chose “Postgres”");
});

test("the rest of the card's area lies in a pile under it, and the breadcrumbs name the area and the work", async ({ page }) => {
  await open(page, (s) => {
    for (const t of ["a", "b", "c"]) file(s, { title: `Card ${t}`, question: `Question ${t}?`, topic: `storage/${t}` });
    file(s, { title: "Elsewhere", question: "Elsewhere?", topic: "zeta/x" }); // areas that tie sort by name, so this one comes after
  });
  await expect(page.locator(".pile .under")).toHaveCount(2);
  await expect(page.locator(".crumbs")).toHaveText("storage › Decisions on main");
});
