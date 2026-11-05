import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Page, expect, test } from "@playwright/test";
import { Store } from "../src/store.js";
import { BODY, cleanup, draft, draftFile, repo, sh } from "../test/helpers.js";
import { layoutProblems, smallTargets } from "./layout.js";
import { type LocalSite, cli, siteAvailable, siteShot, signUpOnPage, somebody, standInTurnstile, startLogin, startSite, virtualAuthenticator } from "./site.js";
import { PHONES, phone } from "./touch.js";

// The website's projects (M9e): approving a machine `baesian login` is signing in, which names a new project (B-zqkwk) and
// asks for the passkey afresh; the projects, by name, renamed; and a project's desk at /projects/{project} (B-7z97x): the
// same desk as `baesian serve`'s (D130), reading the relay's state (B-17wn9), hearing changes over its live socket
// (B-bv49e), answering through the relay with the passkey on a hard card (D139), and showing a card decided before
// linking as such (B-3zjjx). The CLI here is the real one, signing in and syncing against the same local Worker.

let site: LocalSite;
const home = realpathSync(mkdtempSync(join(tmpdir(), "baesian-site-home-")));
test.beforeAll(async () => {
  process.env.BAESIAN_CONFIG = join(home, "config.json");
  if (siteAvailable) site = await startSite();
});
test.afterAll(async () => {
  await site?.dispose();
  rmSync(home, { recursive: true, force: true });
});
test.afterEach(() => cleanup());
test.skip(!siteAvailable, "needs the service's packages and the site's build (npm run build)");

const CARD = "article.card:not([data-leaving])";
const heading = (page: Page, name: string) => page.getByRole("heading", { name, exact: true });
const AGENT = { agent: "claude-code", force: true };

async function signedUp(page: Page) {
  await standInTurnstile(page);
  const auth = await virtualAuthenticator(page);
  const who = somebody();
  await signUpOnPage(page, site, who);
  return { who, auth };
}

/** Make the sign-in's last passkey check old, so what asks for it afresh asks. */
const ageCheck = (handle: string) =>
  site.db.prepare("UPDATE sessions SET verified = ? WHERE account = (SELECT id FROM accounts WHERE handle = ?)").bind(new Date(Date.now() - 10 * 60_000).toISOString(), handle).run();

/** `baesian login` in a repo, approved on the website's /device page, naming the new project. Returns the project's ID. */
async function linkThroughPage(page: Page, dir: string, name: string, machine = "laptop"): Promise<string> {
  const login = await startLogin(dir, ["--service", site.url, "--machine", machine]);
  await page.goto(`${site.url}/device?code=${login.code}`);
  await expect(heading(page, "Sign in a machine?")).toBeVisible();
  await page.getByRole("textbox", { name: /^What should it be called\?/ }).fill(name);
  await page.getByRole("button", { name: "Approve with your passkey" }).click();
  await expect(heading(page, "Machine approved")).toBeVisible();
  const r = await login.done;
  expect(r.code, r.err).toBe(0);
  return Store.open(dir).config().project!;
}

/** The project's desk, with its setup survey put off (B-5na1k) and Playwright's clock, to skip the undo window. */
async function openDesk(page: Page, project: string) {
  await page.addInitScript((key) => localStorage.setItem(key, "true"), `baesian:${project}:setup`);
  await page.clock.install();
  await page.goto(`${site.url}/projects/${project}`);
}

const choose = async (page: Page) => {
  await page.locator(`${CARD} .opt[data-kind="proposal"]`).click();
  await page.locator(CARD).getByRole("button", { name: /Confirm/ }).click();
  await page.clock.fastForward(5100);
};

test("approves a machine: a new project is named, the passkey checked afresh; the projects list it by name, renamed there; the machine ends", async ({ page }) => {
  const { who } = await signedUp(page);
  const { dir } = repo();
  const login = await startLogin(dir, ["--service", site.url, "--machine", "laptop"]);
  await ageCheck(who.handle);
  await page.goto(`${site.url}/device?code=${login.code}`);
  await expect(heading(page, "Sign in a machine?")).toBeVisible();
  const sheet = page.getByRole("region", { name: "Sign in a machine?" });
  await expect(sheet).toContainText("laptop asks to sign in to a new project.");
  await expect(sheet).toContainText(`Check that your terminal shows this code: ${login.code}`);
  await expect(sheet).toContainText("It can never answer them: only you can, here.");
  await expect(sheet).toContainText("Approving makes a new project, owned by you.");
  await expect(sheet).toContainText("your repo's own name is never sent");
  const approve = page.getByRole("button", { name: "Approve with your passkey" });
  await expect(approve).toBeDisabled();
  await page.getByRole("textbox", { name: /^What should it be called\?/ }).fill("Crumb's shop");
  // The last passkey check is old: approving asks for it again, and the authenticator answers.
  await approve.click();
  await expect(heading(page, "Machine approved")).toBeVisible();
  await expect(page.getByRole("main")).toContainText("laptop is signed in to Crumb's shop.");
  const r = await login.done;
  expect(r.code, r.err).toBe(0);
  const project = Store.open(dir).config().project!;
  expect(r.out).toContain(`answer its cards at ${site.url}/projects/${project}`);
  expect(r.out).toContain("It asks you to name the project, then for your passkey.");

  // The projects, by name; renamed.
  await page.getByRole("link", { name: "Projects" }).click();
  const row = page.getByRole("listitem").filter({ hasText: "Crumb's shop" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Rename Crumb's shop" }).click();
  await page.getByRole("textbox", { name: "A new name for Crumb's shop" }).fill("  The   bakery ");
  await page.getByRole("button", { name: "Save the name" }).click();
  await expect(page.getByRole("status")).toHaveText("Renamed: it's “The bakery” now.");
  await expect(page.getByRole("listitem").filter({ hasText: "The bakery" })).toBeVisible();

  // The machine, listed with its project's name, and signed out from here: the CLI hears it's out.
  await page.getByRole("link", { name: "Account" }).click();
  const machine = page.getByRole("region", { name: "Your machines" }).getByRole("listitem");
  await expect(machine).toContainText("laptop");
  await expect(machine).toContainText("The bakery");
  await machine.getByRole("button", { name: "Sign out laptop" }).click();
  await expect(page.getByRole("status")).toHaveText("laptop is signed out of The bakery. It can sign in again with baesian login.");
  await expect(page.getByRole("region", { name: "Your machines" })).toContainText("No machines are signed in.");
  const synced = await cli(dir, ["sync"]);
  expect(synced.err).toContain("Ask the person to run `baesian login` here");
});

test("refuses a machine, and says what to do with a code that's wrong or expired", async ({ page }) => {
  await signedUp(page);
  await page.goto(`${site.url}/device?code=ZZZZ-ZZZZ`);
  await expect(page.getByRole("alert")).toHaveText("No machine is waiting with that code. Codes last 10 minutes: run baesian login again for a new one.");
  const { dir } = repo();
  const login = await startLogin(dir, ["--service", site.url, "--machine", "spark-7"]);
  await page.getByRole("textbox", { name: /^The code/ }).fill(login.code.toLowerCase().replace("-", " "));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("region", { name: "Sign in a machine?" })).toContainText("spark-7 asks to sign in to a new project.");
  await page.getByRole("button", { name: "Refuse" }).click();
  await expect(heading(page, "Machine refused")).toBeVisible();
  const r = await login.done;
  expect(r.code).toBe(1);
  expect(r.err).toContain("the person refused this machine");
  expect(Store.open(dir).config().project).toBeUndefined();
});

test("the project's desk: the CLI's cards answered on the website and heard back, live updates, a hard card's passkey, and what was decided before linking", async ({ page }) => {
  await signedUp(page);
  const { dir, store } = repo();
  // Used locally before linking: one card answered, one open on the same topic, both committed (B-3zjjx).
  const early = store.fileCard(draft({ title: "Where runs are kept", question: "Where should runs be kept?", topic: "storage/runs", reverse: "cheap", touches: [] }), BODY, AGENT).card.meta.id;
  store.addVerdict({ card: early, revision: 1, response: "accept", reviewer: "gus", client: "test" });
  const open = store.fileCard(draft({ title: "How runs are named", question: "How should runs be named?", topic: "storage/runs", reverse: "cheap", touches: [] }), BODY, AGENT).card.meta.id;
  store.syncRecord();
  sh(dir, "add", "-A");
  sh(dir, "commit", "-q", "-m", "Used locally");
  const project = await linkThroughPage(page, dir, "Crumb's shop");

  await openDesk(page, project);
  await expect(page.locator(CARD)).toHaveAttribute("aria-label", "How should runs be named?");
  await expect(page.locator(".bar .place")).toHaveText("Crumb's shop");
  // The card decided before linking is this one's precedent, and says when it was settled.
  await expect(page.locator(".path")).toContainText("Where runs are kept");
  await expect(page.locator(".path")).toContainText("settled before linking");
  await siteShot(page, "desk");

  // Answered on the website: the relay signs it, and the CLI hears it. Two answers alike on one topic: Baesian proposes
  // a convention, as the local server does after an answer (D161).
  await choose(page);
  await expect(page.getByText("Sent to claude-code. Baesian has a proposal from your answers, in your queue.")).toBeVisible();
  await expect.poll(async () => (await cli(dir, ["sync"]), Store.open(dir).status(open))).toBe("resolved");
  expect(Store.open(dir).verdicts(open)).toEqual([expect.objectContaining({ response: "accept", client: "hosted-desktop" })]);

  // An agent files a card: the desk hears of it over the live socket, without a reload.
  const filed = await cli(dir, ["file", "-", "--json"], { stdin: draftFile({ title: "Which cache", question: "Which cache should runs use?", topic: "cache/runs", reverse: "cheap", touches: [] }) });
  expect(filed.code, filed.err).toBe(0);
  const next = (name: string) => page.locator(".path .row.next", { hasText: name });
  await expect(next("Which cache")).toBeVisible();
  await next("Which cache").click();
  await expect(page.locator(CARD)).toHaveAttribute("aria-label", "Which cache should runs use?");
  await choose(page);
  await expect(page.getByText("Sent to claude-code.")).toBeVisible();

  // A hard card's answer waits for the passkey before the relay writes it (D139, B-a6xpc). With no hard card in front of
  // you after it, the desk asks at once. Not now: it waits, on the desk and marked on the path, and nothing is sent.
  const hard = await cli(dir, ["file", "-", "--json"], { stdin: draftFile({ title: "The signing key", question: "Where should the signing key live?", topic: "keys/signing", reverse: "cheap", touches: [], level: "hard" }) });
  expect(hard.code, hard.err).toBe(0);
  const hardId = JSON.parse(hard.out).card.meta.id as string;
  await next("The signing key").click();
  await expect(page.locator(CARD)).toHaveAttribute("aria-label", "Where should the signing key live?");
  await choose(page);
  const prompt = page.getByRole("dialog", { name: "Confirm with your passkey" });
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText("This card is hard, so your answer counts only once your passkey confirms it's yours");
  await expect(prompt.getByRole("list", { name: "The card you answered" })).toHaveText("The signing key");
  await siteShot(page, "desk-passkey");
  await prompt.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByText("Not confirmed: your answer waits for your passkey.")).toBeVisible();
  const strip = page.locator(".passkey-wait");
  await expect(strip).toContainText("One answer waits for your passkey.");
  await expect(page.locator(".path .row.past", { hasText: "The signing key" })).toContainText("waiting for your passkey");
  expect(await cli(dir, ["sync"]).then(() => Store.open(dir).status(hardId))).toBe("open");
  // The button asks again; one tap confirms it.
  await strip.getByRole("button", { name: "Confirm it" }).click();
  await prompt.getByRole("button", { name: "Use your passkey" }).click();
  await expect(page.getByText("Sent to claude-code.")).toBeVisible();
  await expect(strip).toBeHidden();
  await expect.poll(async () => (await cli(dir, ["sync"]), Store.open(dir).status(hardId))).toBe("resolved");
  // The proof is beside the answer, and the answer counts on this machine.
  expect(readdirSync(join(Store.open(dir).live, "verdicts")).some((f) => f.includes(hardId) && f.endsWith(".passkey.json"))).toBe(true);
});

test("hard answers wait for the passkey with no prompt between them; one tap confirms them all, and both reach the CLI with their proofs", async ({ page }) => {
  await signedUp(page);
  const { dir } = repo();
  const file = async (title: string, question: string, topic: string) => {
    const r = await cli(dir, ["file", "-", "--json"], { stdin: draftFile({ title, question, topic, reverse: "cheap", touches: [], level: "hard" }) });
    expect(r.code, r.err).toBe(0);
    return JSON.parse(r.out).card.meta.id as string;
  };
  const keys = await file("The signing key", "Where should the signing key live?", "keys/signing");
  const tokens = await file("Token lifetime", "How long should tokens live?", "keys/tokens");
  sh(dir, "add", "-A");
  sh(dir, "commit", "-q", "-m", "Two hard cards");
  const project = await linkThroughPage(page, dir, "Crumb's shop");
  await openDesk(page, project);
  const prompt = page.getByRole("dialog", { name: "Confirm with your passkey" });
  const strip = page.locator(".passkey-wait");

  // The first hard answer waits; the next card is hard too, so nothing asks.
  const first = await page.locator(CARD).getAttribute("aria-label");
  await choose(page);
  await expect(page.getByText("It waits for your passkey.")).toBeVisible();
  await expect(strip).toContainText("One answer waits for your passkey.");
  await expect(page.locator(CARD)).not.toHaveAttribute("aria-label", first!);
  await page.clock.fastForward(2000);
  await expect(prompt).toBeHidden();
  await siteShot(page, "desk-waiting");

  // Leaving the page while it waits asks first; staying keeps it. Reloaded, it's still waiting.
  const dialogs: string[] = [];
  page.once("dialog", (d) => {
    dialogs.push(d.type());
    void d.dismiss();
  });
  await page.locator(".bar .wordmark").click({ noWaitAfter: true });
  await expect.poll(() => dialogs).toEqual(["beforeunload"]);
  await expect(page).toHaveURL(new RegExp(`/projects/${project}$`));
  page.once("dialog", (d) => void d.accept());
  await page.reload();
  await expect(strip).toContainText("One answer waits for your passkey.");
  await expect(page.locator(".path .row.past")).toContainText("waiting for your passkey");

  // The second: no hard card is left in front of you, so the desk asks, for both, and one tap confirms them.
  await choose(page);
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText("These two answers count only once your passkey confirms they're yours, not an agent's at your keyboard. One tap confirms them all.");
  // Listed in the order you answered them.
  const titles = first === "Where should the signing key live?" ? ["The signing key", "Token lifetime"] : ["Token lifetime", "The signing key"];
  await expect(prompt.getByRole("list", { name: "The cards you answered" }).getByRole("listitem")).toHaveText(titles);
  await siteShot(page, "desk-passkey-two");
  await prompt.getByRole("button", { name: "Use your passkey" }).click();
  await expect(page.getByText("Two answers confirmed and sent.")).toBeVisible();
  await expect(strip).toBeHidden();
  await expect(page.getByText("All caught up.")).toBeVisible();

  // Both reach the CLI as resolved, each with its proof beside it, sharing one signature over the list of both.
  await expect.poll(async () => (await cli(dir, ["sync"]), [keys, tokens].map((id) => Store.open(dir).status(id)))).toEqual(["resolved", "resolved"]);
  const live = join(Store.open(dir).live, "verdicts");
  const proofs = [keys, tokens].map((id) => readdirSync(live).find((f) => f.includes(id) && f.endsWith(".passkey.json"))!);
  expect(proofs.every(Boolean)).toBe(true);
  const [a, b] = proofs.map((f) => JSON.parse(readFileSync(join(live, f), "utf8")) as { batch: string[]; signature: string });
  expect(a!.batch).toHaveLength(2);
  expect(b!.batch).toEqual(a!.batch);
  expect(b!.signature).toBe(a!.signature);
});

test("a change to the preferences that lets more cards past asks for the passkey over the panel, and saves", async ({ page }) => {
  await signedUp(page);
  const { dir } = repo();
  const filed = await cli(dir, ["file", "-", "--json"], { stdin: draftFile({ title: "Which cache", question: "Which cache should runs use?", topic: "cache/runs", reverse: "cheap", touches: [] }) });
  expect(filed.code, filed.err).toBe(0);
  sh(dir, "add", "-A");
  sh(dir, "commit", "-q", "-m", "A card");
  const project = await linkThroughPage(page, dir, "Crumb's shop");
  await openDesk(page, project);
  await expect(page.locator(CARD)).toHaveAttribute("aria-label", "Which cache should runs use?");

  // Turning holding back on lets more cards past you (D163). The prompt sits over the wide panel, not under it: a click
  // on its button reaches it only if nothing covers it.
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Your preferences" }).click();
  const prefs = page.getByRole("complementary", { name: "Your preferences" });
  // On the website, the panel says where the passkey comes in (D180): a hard card's answer, and turning holding back on.
  await expect(prefs.locator(".stops-table tbody tr").first().locator("td").first()).toHaveText("Reaches you. Answering it takes your passkey.");
  await expect(prefs.locator('.pref-row[data-row="security"] .means')).toContainText("the agent stops until you answer, with your passkey.");
  await prefs.getByRole("radiogroup", { name: "Holding back" }).getByRole("radio", { name: "On" }).check();
  await expect(prefs.locator(".pref-hold .more")).toHaveText("Turning it on takes your passkey, because it lets cards past you. Rows at the three upper stops are unchanged.");
  await prefs.getByRole("button", { name: "Save" }).click();
  const prompt = page.getByRole("dialog", { name: "Confirm with your passkey" });
  await expect(prompt).toContainText("This change lets more cards past you without asking");
  await prompt.getByRole("button", { name: "Use your passkey" }).click({ timeout: 5000 });
  await expect(prefs.getByText("Saved.")).toBeVisible();
  await expect(prompt).toBeHidden();
});

test("what the gate looks for, in your preferences: more is used at once, less asks for the passkey, and the CLI's gate reads both (B-qkek1)", async ({ page }) => {
  await signedUp(page);
  const { dir } = repo();
  const filed = await cli(dir, ["file", "-", "--json"], { stdin: draftFile({ title: "Which cache", question: "Which cache should runs use?", topic: "cache/runs", reverse: "cheap", touches: [] }) });
  expect(filed.code, filed.err).toBe(0);
  sh(dir, "add", "-A");
  sh(dir, "commit", "-q", "-m", "A card");
  const project = await linkThroughPage(page, dir, "Crumb's shop");
  await openDesk(page, project);
  await expect(page.locator(CARD)).toHaveAttribute("aria-label", "Which cache should runs use?");
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Your preferences" }).click();
  const prefs = page.getByRole("complementary", { name: "Your preferences" });
  const section = prefs.getByRole("region", { name: "What the gate looks for" });
  await expect(section.getByRole("list", { name: "Always looked for" })).toContainText("Runtime dependencies added to or removed from package.json");
  await expect(section).toContainText("Only you change them, here: anything that makes the gate see less asks for your passkey.");
  const schemas = section.getByRole("textbox", { name: "Schemas and data formats" });
  await expect(schemas).toHaveValue(/\*\*\/schema\.ts/);
  await expect(section.getByText("The built-in list.")).toHaveCount(2);
  const use = section.getByRole("button", { name: "Use these lists" });
  await expect(use).toBeDisabled();
  const prompt = page.getByRole("dialog", { name: "Confirm with your passkey" });
  const live = () => Store.open(dir).inForce().settings.paths;

  // Wider: one more place to look for schemas. Used at once, with no passkey.
  await schemas.fill(`${await schemas.inputValue()}\nformats/**`);
  await expect(section.locator(".gate-less")).toHaveCount(0);
  await expect(section.getByRole("button", { name: "Use the built-in list" })).toBeVisible();
  await siteShot(page, "prefs-gate-wider");
  await use.click();
  await expect(section.getByText("In use.")).toBeVisible();
  await expect(prompt).toBeHidden();
  expect((await cli(dir, ["sync"])).code).toBe(0);
  expect(live().schema).toContain("formats/**");

  // Narrower: back to the built-in schema list, and a folder never looked at. The section says what the gate would stop
  // seeing, and using the lists asks for the passkey (D163).
  await section.getByRole("button", { name: "Use the built-in list" }).click();
  await section.getByRole("textbox", { name: "Never looked at" }).fill("generated/**");
  const less = section.locator(".gate-less");
  await expect(less).toHaveText("With these lists the gate sees less: it would stop looking at formats/** for schemas; and it would never look at generated/**. Using them asks for your passkey.");
  await siteShot(page, "prefs-gate-narrower");
  await use.click();
  await expect(prompt).toContainText("This change lets more cards past you without asking");
  await prompt.getByRole("button", { name: "Use your passkey" }).click({ timeout: 5000 });
  await expect(section.getByText("In use.")).toBeVisible();
  await expect(prompt).toBeHidden();
  expect((await cli(dir, ["sync"])).code).toBe(0);
  expect(live()).toEqual({ ignore: ["generated/**"] });
  const name = Store.open(dir).inForce().name!;
  expect(readdirSync(join(Store.open(dir).live, "preferences"))).toContain(name.replace(/\.json$/, ".passkey.json"));
});

test("a project that isn't yours says so, and where yours are", async ({ page }) => {
  await signedUp(page);
  await page.goto(`${site.url}/projects/p-00000000000000000000`);
  await expect(heading(page, "Not one of your projects")).toBeVisible();
  await page.getByRole("link", { name: "Go to your projects" }).click();
  await expect(heading(page, "Your projects")).toBeVisible();
});

// ---------------------------------------------------------------- laid out

async function check(page: Page, problems: string[], name: string, touch: boolean) {
  await page.waitForTimeout(100);
  for (const p of await page.evaluate(layoutProblems)) problems.push(`${name}: ${p}`);
  if (touch) for (const p of await page.evaluate(smallTargets)) problems.push(`${name}: ${p}`);
  await siteShot(page, name);
}

/** The approval page, the projects and a project's desk with its passkey prompt, through the layout check. */
async function everyPage(page: Page, touch: boolean): Promise<string[]> {
  const problems: string[] = [];
  await signedUp(page);
  const { dir } = repo();
  const login = await startLogin(dir, ["--service", site.url, "--machine", "laptop"]);
  await page.goto(`${site.url}/device?code=${login.code}`);
  await expect(heading(page, "Sign in a machine?")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await check(page, problems, "device-new-project", touch);
  await page.getByRole("textbox", { name: /^What should it be called\?/ }).fill("Crumb's shop");
  await page.getByRole("button", { name: "Approve with your passkey" }).click();
  await expect(heading(page, "Machine approved")).toBeVisible();
  await check(page, problems, "device-approved", touch);
  expect((await login.done).code).toBe(0);
  const project = Store.open(dir).config().project!;
  await page.goto(site.url);
  await expect(page.getByRole("listitem").filter({ hasText: "Crumb's shop" })).toBeVisible();
  await check(page, problems, "projects", touch);
  for (const [title, question, topic] of [
    ["The signing key", "Where should the signing key live?", "keys/signing"],
    ["Token lifetime", "How long should tokens live, before an agent must sign in again?", "keys/tokens"],
  ]) {
    const filed = await cli(dir, ["file", "-", "--json"], { stdin: draftFile({ title, question, topic, reverse: "cheap", touches: [], level: "hard" }) });
    expect(filed.code, filed.err).toBe(0);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openDesk(page, project);
  await expect(page.locator(CARD)).toHaveAttribute("aria-label", /^(Where should the signing key live|How long should tokens live)/);
  await check(page, problems, "desk", touch);
  // The first hard answer waits, over the next hard card (B-a6xpc).
  await choose(page);
  await expect(page.locator(".passkey-wait")).toContainText("One answer waits for your passkey.");
  await check(page, problems, "desk-waiting", touch);
  // The second: the desk asks for both.
  await choose(page);
  const prompt = page.getByRole("dialog", { name: "Confirm with your passkey" });
  await expect(prompt).toContainText("These two answers");
  await check(page, problems, "desk-passkey", touch);
  await prompt.getByRole("button", { name: "Not now" }).click();
  await expect(page.locator(".passkey-wait")).toContainText("Two answers wait for your passkey.");
  await check(page, problems, "desk-waiting-empty", touch);
  // Your projects say so, and the desk has them still when you come back.
  page.once("dialog", (d) => void d.accept());
  await page.locator(".bar .wordmark").click();
  await expect(page.getByRole("listitem").filter({ hasText: "Crumb's shop" })).toContainText("Two answers wait for your passkey.");
  await check(page, problems, "projects-waiting", touch);
  // So does signing out, on the account page.
  await page.getByRole("link", { name: "Account" }).click();
  const signOut = page.getByRole("region", { name: "Signing out" });
  await expect(signOut).toContainText("Two answers wait for your passkey. They're on the desk of Crumb's shop: confirm them there before you sign out.");
  await signOut.scrollIntoViewIfNeeded();
  await check(page, problems, "account-waiting", touch);
  // Back on the desk, with no card left in front of you, it asks by itself.
  await page.goto(`${site.url}/projects/${project}`);
  await prompt.getByRole("button", { name: "Use your passkey" }).click();
  await expect(page.getByText("All caught up.")).toBeVisible();
  await check(page, problems, "desk-empty", touch);
  return problems;
}

test("the approval page, the projects and the desk fit a desktop's window", async ({ page }) => {
  expect(await everyPage(page, false)).toEqual([]);
});

for (const size of PHONES) {
  test.describe(`${size.name}, ${size.width}×${size.height}`, () => {
    test.use(phone(size));
    test("the approval page, the projects and the desk fit the phone, everything you tap 44 px", async ({ page }) => {
      expect(await everyPage(page, true)).toEqual([]);
    });
  });
}

