import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { type RunningServer, startServer } from "../src/server.js";
import { BODY, cleanup, draft, repo } from "../test/helpers.js";
import { layoutProblems } from "./layout.js";

// M6, P17 §8: a deck's briefing, with the vault notes it links to and each one's summary line, opened from the
// breadcrumbs. A real server over a repo with a vault, and a real browser.

let server: RunningServer | undefined;
test.afterEach(async () => {
  await server?.close();
  server = undefined;
  cleanup();
});

const agent = { agent: "claude-code", force: true };

test("the deck's name opens its briefing, with each context note's summary, and a card ID in it leads to the card", async ({ page }) => {
  const r = repo();
  mkdirSync(join(r.dir, "docs/vault/Design"), { recursive: true });
  r.store.setVault("docs/vault");
  r.store.createDeck({ id: "storage", title: "The storage layer", context_notes: ["[[Storage Design]]", "[[Nowhere]]"] }, "Where runs and their files are kept, and why.\n");
  r.store.fileCard(draft({ deck: "storage", reverse: "cheap" }), BODY, agent);
  const other = r.store.fileCard(draft({ title: "Where run files are kept", question: "Where should run files go?", topic: "storage/run-files", reverse: "cheap" }), BODY, agent).card.meta.id;
  writeFileSync(join(r.dir, "docs/vault/Design/Storage Design.md"), `---\nsummary: "How runs are stored; the open question is ${other}."\n---\n\n# Storage Design\n`);
  server = await startServer(r.store, { reviewer: "tester", writeServerFile: false, debounceMs: 20 });
  await page.goto(server.url);
  await expect(page.getByRole("heading", { name: "Which store should hold run metadata?" })).toBeVisible();

  await page.locator(".crumbs").getByRole("button", { name: "The storage layer" }).click();
  const panel = page.getByRole("complementary", { name: "The storage layer" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Where runs and their files are kept, and why.");
  await expect(panel.locator("li").nth(0)).toContainText(`Storage DesignHow runs are stored; the open question is ${other}.`);
  await expect(panel.locator("li").nth(1)).toContainText("NowhereNot in the vault.");
  expect(await page.evaluate(layoutProblems)).toEqual([]);

  await panel.getByRole("button", { name: other }).click();
  await expect(panel).toBeHidden();
  await expect(page.getByRole("heading", { name: "Where should run files go?" })).toBeVisible();
  // That card's deck has a briefing too (the branch's own), and Esc closes the panel.
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
  await page.goto(server.url);
  await page.locator(".crumbs").getByRole("button", { name: "The storage layer" }).click();
  const panel = page.getByRole("complementary", { name: "The storage layer" });
  await expect(panel).toContainText("It has no briefing.");
  await expect(panel.locator("li")).toHaveText("the storage design");
});
