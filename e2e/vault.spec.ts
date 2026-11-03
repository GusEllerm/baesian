import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { type RunningServer, startServer } from "../src/server.js";
import { BODY, cleanup, draft, repo } from "../test/helpers.js";
import { layoutProblems } from "./layout.js";
import { skipSetup } from "./setup.js";

// M6, P17 §8: a deck's briefing, with the vault notes it links to and each one's summary line: on a briefing card
// before the deck's first card, once (B-j6b75), and from the breadcrumbs. A real server over a repo with a vault,
// and a real browser.

let server: RunningServer | undefined;
test.afterEach(async () => {
  await server?.close();
  server = undefined;
  cleanup();
});

const agent = { agent: "claude-code", force: true };

test("a deck's briefing comes before its first card, once; its name opens it again, and a card ID in it leads to the card", async ({ page }) => {
  const r = repo();
  mkdirSync(join(r.dir, "docs/vault/Design"), { recursive: true });
  r.store.setVault("docs/vault");
  r.store.createDeck({ id: "storage", title: "The storage layer", context_notes: ["[[Storage Design]]", "[[Nowhere]]"] }, "Where runs and their files are kept, and why.\n");
  r.store.fileCard(draft({ deck: "storage", reverse: "cheap" }), BODY, agent);
  const other = r.store.fileCard(draft({ title: "Where run files are kept", question: "Where should run files go?", topic: "storage/run-files", reverse: "cheap" }), BODY, agent).card.meta.id;
  writeFileSync(join(r.dir, "docs/vault/Design/Storage Design.md"), `---\nsummary: "How runs are stored; the open question is ${other}."\n---\n\n# Storage Design\n`);
  server = await startServer(r.store, { reviewer: "tester", writeServerFile: false, debounceMs: 20 });
  await skipSetup(page, r.dir);
  await page.goto(server.url);
  const card = page.getByRole("article", { name: "The briefing for The storage layer" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("1 card in this work is waiting for you.");
  await expect(card).toContainText("Where runs and their files are kept, and why.");
  await expect(card.locator("li").nth(0)).toContainText(`Storage DesignHow runs are stored; the open question is ${other}.`);
  expect(await page.evaluate(layoutProblems)).toEqual([]);
  // Any arrow goes on to the card, and chooses nothing.
  await page.keyboard.press("ArrowRight");
  await expect(card).toBeHidden();
  await expect(page.getByRole("heading", { name: "Which store should hold run metadata?" })).toBeVisible();
  await expect(page.locator(".card[data-mode='live']")).toBeVisible();
  // Once per deck: coming back doesn't show it again.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Which store should hold run metadata?" })).toBeVisible();
  await expect(card).toHaveCount(0);

  await page.locator(".crumbs").getByRole("button", { name: "The storage layer" }).click();
  const panel = page.getByRole("complementary", { name: "The storage layer" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Where runs and their files are kept, and why.");
  await expect(panel.locator("li").nth(0)).toContainText(`Storage DesignHow runs are stored; the open question is ${other}.`);
  await expect(panel.locator("li").nth(1)).toContainText("NowhereNot in the vault.");
  expect(await page.evaluate(layoutProblems)).toEqual([]);

  await panel.getByRole("button", { name: other }).click();
  await expect(panel).toBeHidden();
  // A branch's own deck has no briefing card: its briefing is one generated line (D29).
  await expect(page.getByRole("heading", { name: "Where should run files go?" })).toBeVisible();
  await expect(page.locator(".briefing-card")).toHaveCount(0);
  // Its panel still opens from its name, and Esc closes it.
  await page.locator(".crumbs").getByRole("button").click();
  await expect(page.getByRole("complementary", { name: "Decisions on main" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Decisions on main" })).toBeHidden();
});

test("without a vault, the context notes are plain text", async ({ page }) => {
  const r = repo();
  r.store.createDeck({ id: "storage", title: "The storage layer", context_notes: ["[[Design/Storage Design#Runs|the storage design]]"] }, "");
  r.store.fileCard(draft({ deck: "storage", reverse: "cheap" }), BODY, agent);
  server = await startServer(r.store, { reviewer: "tester", writeServerFile: false, debounceMs: 20 });
  await skipSetup(page, r.dir);
  await page.goto(server.url);
  // Context notes alone earn a briefing card, and its button goes on.
  const card = page.getByRole("article", { name: "The briefing for The storage layer" });
  await expect(card.locator("li")).toHaveText("the storage design");
  await card.getByRole("button", { name: "Go to its cards" }).click();
  await expect(card).toBeHidden();
  await page.locator(".crumbs").getByRole("button", { name: "The storage layer" }).click();
  const panel = page.getByRole("complementary", { name: "The storage layer" });
  await expect(panel).toContainText("It has no briefing.");
  await expect(panel.locator("li")).toHaveText("the storage design");
});
