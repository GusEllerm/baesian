import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Page, expect, test } from "@playwright/test";
import { renderDoc } from "../src/frontmatter.js";
import { type RunningServer, startServer } from "../src/server.js";
import type { Store } from "../src/store.js";
import { BODY, cleanup, draft, repo } from "../test/helpers.js";

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
