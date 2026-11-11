import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Browser, type Page, expect, test } from "@playwright/test";
import { Store } from "../src/store.js";
import { cleanup, draftFile, repo, sh } from "../test/helpers.js";
import { layoutProblems, smallTargets } from "./layout.js";
import { type LocalSite, cli, codeIn, siteAvailable, siteShot, signUpOnPage, somebody, standInTurnstile, startLogin, startSite, virtualAuthenticator } from "./site.js";
import { PHONES, phone } from "./touch.js";

// Several reviewers on the website (P20, stage 1, step 3): an owner makes a link on the project's members page and sends
// it; someone opens it, signs up, and joins (B-jsady); their machine signs in to the project; each member's desk leads
// with the cards sent to them and shows the rest, marked with whom they were sent to (B-tzdjn); either answers any card
// (B-r51ts), and the other's desk says so; an answer that comes second isn't recorded, and the desk says who came first
// (B-v43z8); a card passed on waits for the others; only owners change the settings (B-rxbss); a member leaves. Two
// people, each in a browser of their own with a passkey of their own, and each with a machine: the real CLI, signed in
// from two clones of one repo, each with its own sign-in.

let site: LocalSite;
/** Each person's machine keeps its sign-in in a folder of its own, as two laptops would. */
const anasHome = realpathSync(mkdtempSync(join(tmpdir(), "baesian-team-ana-")));
const bensHome = realpathSync(mkdtempSync(join(tmpdir(), "baesian-team-ben-")));
const onMachine = (home: string) => void (process.env.BAESIAN_CONFIG = join(home, "config.json"));
test.beforeAll(async () => {
  onMachine(anasHome);
  if (siteAvailable) site = await startSite();
});
test.afterAll(async () => {
  await site?.dispose();
  for (const home of [anasHome, bensHome]) rmSync(home, { recursive: true, force: true });
});
test.afterEach(() => {
  onMachine(anasHome);
  cleanup();
});
test.skip(!siteAvailable, "needs the service's packages and the site's build (npm run build)");

const CARD = "article.card:not([data-leaving])";
const heading = (page: Page, name: string) => page.getByRole("heading", { name, exact: true });
const next = (page: Page, name: string) => page.locator(".path .row.next", { hasText: name });

/** Make the sign-in's last passkey check old, so what asks for it afresh asks. */
const ageCheck = (handle: string) =>
  site.db.prepare("UPDATE sessions SET verified = ? WHERE account = (SELECT id FROM accounts WHERE handle = ?)").bind(new Date(Date.now() - 10 * 60_000).toISOString(), handle).run();

/** `baesian login` in a repo, on the machine whose sign-ins `home` keeps, approved on the website's /device page. */
async function signInMachine(page: Page, dir: string, home: string, machine: string, name?: string): Promise<{ project: string; said: string }> {
  onMachine(home);
  const login = await startLogin(dir, ["--service", site.url, "--machine", machine]);
  await page.goto(`${site.url}/device?code=${login.code}`);
  await expect(heading(page, "Sign in a machine?")).toBeVisible();
  const said = (await page.getByRole("region", { name: "Sign in a machine?" }).textContent()) ?? "";
  if (name) await page.getByRole("textbox", { name: /^What should it be called\?/ }).fill(name);
  await page.getByRole("button", { name: "Approve with your passkey" }).click();
  await expect(heading(page, "Machine approved")).toBeVisible();
  const r = await login.done;
  expect(r.code, r.err).toBe(0);
  return { project: Store.open(dir).config().project!, said };
}

/** An agent on a machine files a card. */
async function fileOn(home: string, dir: string, title: string, over: Record<string, unknown> = {}): Promise<string> {
  onMachine(home);
  const r = await cli(dir, ["file", "-", "--json"], { stdin: draftFile({ title, question: `${title}?`, topic: `team/${title.toLowerCase().replaceAll(" ", "-")}`, reverse: "cheap", touches: [], ...over }) });
  expect(r.code, r.err).toBe(0);
  return JSON.parse(r.out).card.meta.id as string;
}

/** The project's desk, with its setup survey put off (B-5na1k) and Playwright's clock, to step past the undo window. */
async function openDesk(page: Page, project: string) {
  await page.addInitScript((key) => localStorage.setItem(key, "true"), `baesian:${project}:setup`);
  await page.clock.install();
  await page.goto(`${site.url}/projects/${project}`);
}

/** Choose an option of the card in play and confirm it; the answer then waits in its undo window. */
const answer = async (page: Page, kind: "proposal" | "alternative" = "proposal") => {
  await page.locator(`${CARD} .opt[data-kind="${kind}"]`).click();
  await page.locator(CARD).getByRole("button", { name: /Confirm/ }).click();
};
const pastUndo = (page: Page) => page.clock.fastForward(5100);

/** A second person: a browser of their own, with their own passkey. */
async function anotherPerson(browser: Browser, opts: Parameters<Browser["newContext"]>[0] = {}) {
  const context = await browser.newContext(opts);
  const page = await context.newPage();
  await standInTurnstile(page);
  await virtualAuthenticator(page);
  return { context, page, who: somebody() };
}

/** Ana signs up and links her repo as a new project; returns what the rest needs. */
async function anasProject(page: Page, name: string) {
  await standInTurnstile(page);
  await virtualAuthenticator(page);
  const ana = somebody();
  await signUpOnPage(page, site, ana);
  const { dir } = repo();
  const { project } = await signInMachine(page, dir, anasHome, "anas-laptop", name);
  // The link is in the repo's own config, committed, so a clone of it is the same project.
  sh(dir, "add", "-A");
  sh(dir, "commit", "-q", "-m", "Link the repo");
  return { ana, dir, project };
}

/** An owner makes a link on the members page, the passkey checked afresh, and reads it off the page. */
async function makeLink(page: Page, project: string, handle: string): Promise<string> {
  await ageCheck(handle);
  await page.goto(`${site.url}/projects/${project}/members`);
  await page.getByRole("button", { name: "Make a link with your passkey" }).click();
  const link = (await page.getByLabel("The link", { exact: true }).textContent())!;
  expect(link).toMatch(new RegExp(`^${site.url}/join#[A-Za-z0-9_-]{20,}$`));
  return link;
}

/** Someone with no account opens a link: they sign up, and are brought on to the project it's for. */
async function signUpByLink(page: Page, link: string, who: { email: string; handle: string }) {
  await page.goto(link);
  await expect(heading(page, "Sign in")).toBeVisible();
  await expect(page.getByRole("main")).toContainText("Sign in to join the project you were sent a link to.");
  // The code was after the #, and it's out of the address before anything is asked of the service.
  expect(page.url()).not.toContain("#");
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Email address").fill(who.email);
  const since = Date.now();
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(heading(page, "Check your email")).toBeVisible();
  await page.getByLabel("The code from the email").fill(codeIn(await site.email("finish signing up", since)));
  await page.getByRole("textbox", { name: /^Your handle/ }).fill(who.handle);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Make a passkey" }).click();
  await expect(heading(page, "Save your recovery code")).toBeVisible();
  await page.getByLabel("I've saved my recovery code").check();
  await page.getByRole("button", { name: "Go on to the project you were invited to" }).click();
}

test("an owner's link adds a member, who signs up to use it; each desk leads with its own cards, either answers any, and the other hears", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const { ana, dir, project } = await anasProject(page, "Crumb's shop");

  // The members page: Ana alone, its owner. Nobody's code reaches the service in an address: the link is made by a POST.
  const requested: string[] = [];
  page.on("request", (r) => requested.push(r.url()));
  const link = await makeLink(page, project, ana.handle);
  await expect(heading(page, "Members of Crumb's shop")).toBeVisible();
  const members = page.getByRole("list", { name: "Members" }).getByRole("listitem");
  await expect(members).toHaveCount(1);
  await expect(members.first()).toContainText(`${ana.handle}you`);
  await expect(members.first()).toContainText("Owner, made the project");
  // Whoever made the project can't leave it, so there's nothing to press on their row.
  await expect(members.first().getByRole("button")).toHaveCount(0);
  const add = page.getByRole("region", { name: "Add someone" });
  await expect(add).toContainText("It adds one person, once, and stops working after seven days. Baesian keeps no address for them.");
  await expect(add).toContainText("Copy it now: it's shown once.");
  await expect(add).toContainText("One link hasn't been used yet.");
  await siteShot(page, "members-link");
  const code = link.split("#")[1]!;
  expect(requested.some((u) => u.includes(code))).toBe(false);

  // Ben has no account. He opens the link, signs up, and is asked whether to join, by Ana's handle and the project's name.
  const ben = await anotherPerson(browser);
  const sent: string[] = [];
  ben.page.on("request", (r) => sent.push(r.url()));
  await signUpByLink(ben.page, link, ben.who);
  await expect(heading(ben.page, "Join Crumb's shop?")).toBeVisible();
  const invite = ben.page.getByRole("region", { name: "Join Crumb's shop?" });
  await expect(invite).toContainText(`${ana.handle} sent you a link to join Crumb's shop as a member.`);
  await expect(invite).toContainText(`your answers carry your name, ${ben.who.handle}, to the other members`);
  await siteShot(ben.page, "join");
  await ben.page.getByRole("button", { name: "Join Crumb's shop" }).click();
  // He's on its desk, with nothing to answer yet. The code went to the service only in a request's body.
  await expect(ben.page.locator(".bar .place")).toHaveText("Crumb's shop");
  await expect(ben.page.locator(".bar .summary")).toContainText("Nothing to answer.");
  expect(sent.some((u) => u.includes(code))).toBe(false);
  // The link is used up: opened again, it says so.
  await ben.page.goto(link);
  await expect(heading(ben.page, "This link doesn't work")).toBeVisible();

  // Ana's members page lists him, and no link is waiting.
  await page.reload();
  await expect(members).toHaveCount(2);
  await expect(members.nth(1)).toContainText(ben.who.handle);
  await expect(members.nth(1)).toContainText("Member · joined");
  await expect(add).not.toContainText("hasn't been used yet");

  // Ben's machine: a clone of the repo, signed in to the same project, approved by Ben. The page names the project.
  const bensDir = realpathSync(mkdtempSync(join(tmpdir(), "baesian-team-clone-")));
  sh(tmpdir(), "clone", "-q", dir, bensDir);
  try {
    // A fresh clone: Ben sets Baesian up in it, as anyone does in theirs, and signs his machine in.
    onMachine(bensHome);
    const init = await cli(bensDir, ["init"]);
    expect(init.code, init.err).toBe(0);
    const bens = await signInMachine(ben.page, bensDir, bensHome, "bens-laptop");
    expect(bens.project).toBe(project);
    expect(bens.said).toContain("bens-laptop asks to sign in to Crumb's shop.");
    expect(bens.said).toContain("The cards its agents file are sent to you first.");

    // Each one's agent files a card. Every card waits for both; each inbox says how many were sent to its own person.
    await fileOn(anasHome, dir, "Where runs are kept", { level: "blocking" });
    const cache = await fileOn(bensHome, bensDir, "Which cache");
    const row = (p: Page) => p.getByRole("listitem").filter({ hasText: "Crumb's shop" });
    await page.goto(`${site.url}/`);
    await expect(row(page)).toContainText("2 waiting, 1 sent to you, 1 blocking");
    await expect(row(page).locator(".inbox-count")).toHaveText("2");
    await ben.page.goto(`${site.url}/`);
    await expect(row(ben.page)).toContainText("2 waiting, 1 sent to you, 1 blocking");
    await expect(row(ben.page)).toContainText("You're a member");
    // A project's name is its owners' to change: Ben has its members to open, and nothing to rename.
    await expect(row(ben.page).getByRole("link", { name: "Members of Crumb's shop" })).toBeVisible();
    await expect(row(ben.page).getByRole("button", { name: /Rename/ })).toHaveCount(0);
    await expect(row(page).getByRole("button", { name: "Rename Crumb's shop" })).toBeVisible();
    await siteShot(ben.page, "projects-member");

    // Ana's desk leads with her own card; Ben's follows, marked as sent to him. Ben's desk is the other way about.
    await openDesk(page, project);
    await expect(page.locator(CARD)).toHaveAttribute("aria-label", "Where runs are kept?");
    await expect(page.locator(`${CARD} .sent-to`)).toHaveCount(0);
    await expect(next(page, "Which cache")).toContainText(`sent to ${ben.who.handle}`);
    await openDesk(ben.page, project);
    await expect(ben.page.locator(CARD)).toHaveAttribute("aria-label", "Which cache?");
    await expect(next(ben.page, "Where runs are kept")).toContainText(`sent to ${ana.handle}`);

    // Ben opens Ana's card, which says whom it was sent to, and answers it: any member answers any card (B-r51ts).
    await next(ben.page, "Where runs are kept").click();
    await expect(ben.page.locator(CARD)).toHaveAttribute("aria-label", "Where runs are kept?");
    await expect(ben.page.locator(`${CARD} .sent-to`)).toHaveText(new RegExp(`^Sent to ${ana.handle} (just now|\\d+ minutes? ago)\\.$`));
    await answer(ben.page);
    await pastUndo(ben.page);
    await expect(ben.page.getByText("Sent to claude-code.")).toBeVisible();
    // Ana had it in front of her: it leaves her desk, which says who answered it, and Ben's card comes up, marked.
    await expect(page.getByText(`${ben.who.handle} answered “Where runs are kept”, so it's off your desk.`)).toBeVisible();
    await expect(page.locator(CARD)).toHaveAttribute("aria-label", "Which cache?");
    await expect(page.locator(`${CARD} .sent-to`)).toContainText(`Sent to ${ben.who.handle}`);
    // Ana's agent hears Ben's answer, by his name.
    onMachine(anasHome);
    await expect.poll(async () => (await cli(dir, ["sync"]), Store.open(dir).verdicts(Store.open(dir).cards().find((c) => c.meta.title === "Where runs are kept")!.meta.id).map((v) => v.reviewer))).toEqual([ben.who.handle]);

    // Both answer the last card, differently: Ben's comes first. Ana's, still in its undo window, isn't recorded, and
    // now that she has chosen, her desk says who came first and what he chose (B-v43z8).
    await answer(page, "alternative");
    await answer(ben.page, "proposal");
    await pastUndo(ben.page);
    await expect(ben.page.getByText("Sent to claude-code.")).toBeVisible();
    await expect.poll(async () => (await cli(dir, ["sync"]), Store.open(dir).status(cache))).toBe("resolved");
    await pastUndo(page);
    const proposal = Store.open(dir).card(cache)!.meta.proposal;
    await expect(page.getByText(`${ben.who.handle} had already answered it, and chose “${proposal}”. Your answer wasn't recorded.`)).toBeVisible();
    // The card is decided: it isn't back on her desk.
    await expect(page.locator(`${CARD}[aria-label="Which cache?"]`)).toHaveCount(0);
    await expect(next(page, "Which cache")).toHaveCount(0);
    expect(Store.open(dir).verdicts(cache).map((v) => v.reviewer)).toEqual([ben.who.handle]);
  } finally {
    rmSync(bensDir, { recursive: true, force: true });
  }
});

test("a card passed on waits for the other member; the settings are the owners' to change; a member leaves, and an owner removes one", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const { ana, dir, project } = await anasProject(page, "The bakery");
  const link = await makeLink(page, project, ana.handle);
  // Ben has an account already, and is signed in: the link asks him at once.
  const ben = await anotherPerson(browser);
  await signUpOnPage(ben.page, site, ben.who);
  await ben.page.goto(link);
  await expect(heading(ben.page, "Join The bakery?")).toBeVisible();
  await ben.page.getByRole("button", { name: "Join The bakery" }).click();
  await expect(ben.page.locator(".bar .place")).toHaveText("The bakery");

  // Ana's agent files a card. It's hers: Ben sees it, sent to her. She says it's outside her expertise.
  await fileOn(anasHome, dir, "Which oven", { level: "blocking" });
  await openDesk(page, project);
  await expect(page.locator(CARD)).toHaveAttribute("aria-label", "Which oven?");
  await page.keyboard.press("ArrowDown");
  await page.locator(CARD).getByRole("button", { name: "It's outside my expertise" }).click();
  await page.locator(CARD).getByRole("button", { name: "Pass it on to the other members" }).click();
  await pastUndo(page);
  // It's put aside on her desk, and waits on Ben's, which says she passed it on.
  await expect(page.locator(".bar .summary")).toContainText("Nothing to answer.");
  await page.reload();
  await expect(page.locator(".empty .parked")).toContainText("Put asideWhich oven");
  await openDesk(ben.page, project);
  await expect(ben.page.locator(CARD)).toHaveAttribute("aria-label", "Which oven?");
  await expect(ben.page.locator(`${CARD} .sent-to`)).toHaveText(`Passed on by ${ana.handle}.`);
  // Their inboxes agree with their desks.
  const row = (p: Page) => p.getByRole("listitem").filter({ hasText: "The bakery" });
  await ben.page.locator("a.wordmark").click();
  await expect(row(ben.page)).toContainText("1 waiting, none sent to you, 1 blocking");
  await page.locator("a.wordmark").click();
  await expect(row(page)).toContainText("Nothing waiting");

  // The project's settings are its owners' (B-rxbss): Ben sees them as they are, with nothing to change.
  await row(ben.page).locator("a.open").click();
  await ben.page.getByRole("button", { name: "More" }).click();
  await ben.page.getByRole("menuitem", { name: "The project's preferences" }).click();
  const prefs = ben.page.getByRole("complementary", { name: "The project's preferences" });
  await expect(prefs).toContainText("Only this project's owners change these settings.");
  for (const radio of await prefs.getByRole("radio").all()) await expect(radio).toBeDisabled();
  await expect(prefs.getByRole("button", { name: "Save" })).toBeHidden();
  await siteShot(ben.page, "prefs-member");
  await ben.page.keyboard.press("Escape");

  // Ben leaves: asked first, then gone from it; its address is no longer his.
  await ben.page.goto(`${site.url}/projects/${project}/members`);
  const bensRows = ben.page.getByRole("list", { name: "Members" }).getByRole("listitem");
  await expect(bensRows).toHaveCount(2);
  // A member sees who's there, and can only leave: nothing adds or removes anyone.
  await expect(ben.page.getByRole("region", { name: "Add someone" })).toHaveCount(0);
  await expect(ben.page.getByRole("button", { name: /^(Remove|Make) / })).toHaveCount(0);
  await ben.page.getByRole("button", { name: "Leave this project" }).click();
  await expect(bensRows.nth(1)).toContainText("Leave The bakery? You'll stop seeing its cards");
  await siteShot(ben.page, "members-leave");
  await ben.page.getByRole("button", { name: "Leave the project" }).click();
  await expect(heading(ben.page, "Your projects")).toBeVisible();
  await expect(ben.page.getByRole("main")).toContainText("No projects yet.");
  await ben.page.goto(`${site.url}/projects/${project}`);
  await expect(heading(ben.page, "Not one of your projects")).toBeVisible();

  // Cat joins by a new link. Ana makes her an owner, with her passkey, then a member again, and removes her.
  const cat = await anotherPerson(browser);
  await signUpOnPage(cat.page, site, cat.who);
  await cat.page.goto(await makeLink(page, project, ana.handle));
  await cat.page.getByRole("button", { name: "Join The bakery" }).click();
  await expect(cat.page.locator(".bar .place")).toHaveText("The bakery");
  await ageCheck(ana.handle);
  await page.goto(`${site.url}/projects/${project}/members`);
  const rows = page.getByRole("list", { name: "Members" }).getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await page.getByRole("button", { name: `Make ${cat.who.handle} an owner` }).click();
  await expect(page.getByRole("status")).toHaveText(`${cat.who.handle} is an owner now.`);
  await expect(rows.nth(1)).toContainText("Owner · joined");
  await page.getByRole("button", { name: `Make ${cat.who.handle} a member` }).click();
  await expect(page.getByRole("status")).toHaveText(`${cat.who.handle} is a member now, no longer an owner.`);
  await page.getByRole("button", { name: `Remove ${cat.who.handle}` }).click();
  await expect(rows.nth(1)).toContainText(`Remove ${cat.who.handle}? They'll stop seeing this project's cards`);
  await page.getByRole("button", { name: `Remove ${cat.who.handle}`, exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(`${cat.who.handle} is no longer a member. Their machines are signed out of this project, and their answers stay.`);
  await expect(rows).toHaveCount(1);
  // A link Ana made and didn't send is cancelled from here.
  await page.getByRole("button", { name: /^Make a link/ }).click();
  await expect(page.getByLabel("The link", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel it" }).click();
  await expect(page.getByRole("status")).toHaveText("That link no longer works.");
});

/** A member's desk with a card that was sent to someone else on it, as it stands once it has settled. */
async function deskWithAnothersCard(page: Page, project: string, sentTo: string) {
  await page.addInitScript((key) => localStorage.setItem(key, "true"), `baesian:${project}:setup`);
  await page.goto(`${site.url}/projects/${project}`);
  await expect(page.locator(`${CARD} .sent-to`)).toContainText(`Sent to ${sentTo}`);
  await page.waitForTimeout(700);
}

test("the members page, the page a link opens and a desk with someone else's card fit a desktop's window", async ({ page, browser }) => {
  const { ana, dir, project } = await anasProject(page, "Crumb's shop");
  const link = await makeLink(page, project, ana.handle);
  expect(await page.evaluate(layoutProblems)).toEqual([]);
  const ben = await anotherPerson(browser);
  await signUpOnPage(ben.page, site, ben.who);
  await ben.page.goto(link);
  await expect(heading(ben.page, "Join Crumb's shop?")).toBeVisible();
  expect(await ben.page.evaluate(layoutProblems)).toEqual([]);
  await ben.page.getByRole("button", { name: "Join Crumb's shop" }).click();
  await expect(ben.page.locator(".bar .place")).toHaveText("Crumb's shop");
  await fileOn(anasHome, dir, "Where runs are kept", { level: "blocking" });
  await fileOn(anasHome, dir, "Which cache");
  await deskWithAnothersCard(ben.page, project, ana.handle);
  await siteShot(ben.page, "desk-sent-to");
  expect(await ben.page.evaluate(layoutProblems)).toEqual([]);
});

for (const size of PHONES) {
  test.describe(`${size.name}, ${size.width}×${size.height}`, () => {
    test.use(phone(size));
    test("the members page, the page a link opens, a member's projects and their desk fit the phone, everything you tap 44 px", async ({ page, browser }) => {
      test.setTimeout(90_000);
      const { ana, dir, project } = await anasProject(page, "Crumb's shop");
      const link = await makeLink(page, project, ana.handle);
      await siteShot(page, "members-phone");
      expect(await page.evaluate(layoutProblems)).toEqual([]);
      expect(await page.evaluate(smallTargets)).toEqual([]);
      const ben = await anotherPerson(browser, phone(size));
      await signUpOnPage(ben.page, site, ben.who);
      await ben.page.goto(link);
      await expect(heading(ben.page, "Join Crumb's shop?")).toBeVisible();
      expect(await ben.page.evaluate(layoutProblems)).toEqual([]);
      expect(await ben.page.evaluate(smallTargets)).toEqual([]);
      await ben.page.getByRole("button", { name: "Join Crumb's shop" }).click();
      await expect(ben.page.locator(".bar .place")).toHaveText("Crumb's shop");
      // Back on Ana's page, with a member on it who can be made an owner or removed; and on Ben's projects.
      await page.reload();
      await expect(page.getByRole("list", { name: "Members" }).getByRole("listitem")).toHaveCount(2);
      await siteShot(page, "members-two-phone");
      expect(await page.evaluate(layoutProblems)).toEqual([]);
      expect(await page.evaluate(smallTargets)).toEqual([]);
      await ben.page.goto(`${site.url}/`);
      await expect(ben.page.getByRole("listitem").filter({ hasText: "Crumb's shop" })).toContainText("You're a member");
      await siteShot(ben.page, "projects-member-phone");
      expect(await ben.page.evaluate(layoutProblems)).toEqual([]);
      expect(await ben.page.evaluate(smallTargets)).toEqual([]);
      // And his desk, with a card that was sent to Ana on it.
      await fileOn(anasHome, dir, "Where runs are kept", { level: "blocking" });
      await deskWithAnothersCard(ben.page, project, ana.handle);
      await siteShot(ben.page, "desk-sent-to-phone");
      expect(await ben.page.evaluate(layoutProblems)).toEqual([]);
      expect(await ben.page.evaluate(smallTargets)).toEqual([]);
    });
  });
}
