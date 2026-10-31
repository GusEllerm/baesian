import { expect, test } from "@playwright/test";
import { type RunningServer, startServer } from "../src/server.js";
import { BODY, cleanup, draft, repo } from "../test/helpers.js";

// M4 step 5a: the scaffold, end to end. A real server over a fixture repo, a real browser.

const AGENT = { agent: "claude-code" };
let server: RunningServer | undefined;

test.afterEach(async () => {
  await server?.close();
  server = undefined;
  cleanup();
});

async function serveWithOneCard() {
  const r = repo();
  r.store.fileCard(draft(), BODY, AGENT);
  server = await startServer(r.store, { reviewer: "tester", writeServerFile: false, debounceMs: 20 });
  return { ...r, server };
}

test("signs in through the address serve opens, and shows the first card", async ({ page }) => {
  const { server } = await serveWithOneCard();
  await page.goto(server.url);
  await expect(page).toHaveURL(`http://127.0.0.1:${server.port}/`);
  await expect(page.getByRole("heading", { name: "Which store should hold run metadata?" })).toBeVisible();
  await expect(page.getByText("1 to answer.")).toBeVisible();
});

test("refuses a browser that hasn't signed in", async ({ page }) => {
  const { server } = await serveWithOneCard();
  const response = await page.goto(`http://127.0.0.1:${server.port}/`);
  expect(response?.status()).toBe(401);
  await expect(page.getByText("Open the address baesian serve printed")).toBeVisible();
});

test("shows a card an agent files while the page is open", async ({ page }) => {
  const { store, server } = await serveWithOneCard();
  await page.goto(server.url);
  await expect(page.getByText("1 to answer.")).toBeVisible();
  store.fileCard(draft({ title: "Where run files are kept", question: "Where should run files go?", topic: "storage/run-files" }), BODY, AGENT);
  await expect(page.getByText("2 to answer.")).toBeVisible();
});

test("asks nothing of any other server, and breaks none of its own rules", async ({ page }) => {
  const { server } = await serveWithOneCard();
  const elsewhere: string[] = [];
  const fonts: string[] = [];
  const problems: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith(`http://127.0.0.1:${server.port}/`)) elsewhere.push(r.url());
    else if (r.url().endsWith(".woff2")) fonts.push(r.url());
  });
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(m.text());
  });
  await page.goto(server.url);
  await expect(page.getByRole("heading", { name: "Which store should hold run metadata?" })).toBeVisible();
  // The bundled fonts (D99) are in the page's font set, loaded, and came from the server itself.
  // (`document.fonts.check` alone would pass for a family it has never heard of.)
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, ""));
  });
  expect(loaded).toEqual(expect.arrayContaining(["Alegreya Variable", "Archivo Variable"]));
  expect(fonts.length).toBeGreaterThan(0);
  expect(elsewhere).toEqual([]);
  expect(problems).toEqual([]);
});

test("two projects served at once each keep their own sign-in", async ({ context }) => {
  // Browsers don't keep cookies apart by port, so two servers on this machine share one cookie jar.
  const { server: first } = await serveWithOneCard();
  const other = repo();
  other.store.fileCard(draft({ title: "Where run files are kept", question: "Where should run files go?", topic: "storage/run-files" }), BODY, AGENT);
  const second = await startServer(other.store, { reviewer: "tester", writeServerFile: false, debounceMs: 20 });
  try {
    const a = await context.newPage();
    await a.goto(first.url);
    await expect(a.getByRole("heading", { name: "Which store should hold run metadata?" })).toBeVisible();
    const b = await context.newPage();
    await b.goto(second.url);
    await expect(b.getByRole("heading", { name: "Where should run files go?" })).toBeVisible();
    // Signing in to the second didn't sign the first out.
    expect((await a.request.get(`http://127.0.0.1:${first.port}/api/state`)).status()).toBe(200);
    expect((await b.request.get(`http://127.0.0.1:${second.port}/api/state`)).status()).toBe(200);
  } finally {
    await second.close();
  }
});
