import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { type Locator, type Page, expect, test } from "@playwright/test";
import { type RunningServer, startServer } from "../src/server.js";
import type { Store } from "../src/store.js";
import { BODY, cleanup, draft, repo } from "../test/helpers.js";
import { fileAnswered } from "./answers.js";
import { layoutProblems } from "./layout.js";
import { skipSetup } from "./setup.js";

// M8b, the client's half of routing and preferences (P14, D146–D151, B-5na1k, B-y6jn6): the held-back list, audits in
// the queue, answered blind first; Baesian's slider and convention cards; your preferences; the record row by row; and
// the setup survey. A real server over a temp repo, and a real browser. With BAESIAN_SHOTS set to a folder, each new
// screen is saved there as a screenshot.

let server: RunningServer | undefined;
test.afterEach(async () => {
  await server?.close();
  server = undefined;
  cleanup();
});

const CARD = "article.card:not([data-leaving])";
const WHO = { by: "gus", client: "test" };
let n = 0;
/** A card on its own topic, so none is a possible duplicate of another. */
const file = (store: Store, over: Record<string, unknown> = {}) => {
  n += 1;
  return store.fileCard(draft({ title: `Decision ${n}`, question: `Which way for decision ${n}?`, topic: `area${n}/q`, reverse: "cheap", ...over }), BODY, { agent: "claude-code", force: true }).card.meta.id;
};
const answer = (store: Store, id: string, over: Record<string, unknown> = {}) =>
  store.addVerdict({ card: id, revision: store.card(id)!.meta.revision, response: "accept", reviewer: "gus", client: "web", ...over } as Parameters<Store["addVerdict"]>[0]);
/** Hands-off, enforcing, with product behaviour shown, so a card can reach the queue beside held ones. */
const handsOff = (store: Store, over: Record<string, unknown> = {}) =>
  store.writePreferences({ preset: "hands-off", mode: "enforce", row_user_facing: "tell-me", ...over }, WHO);

async function open(page: Page, setup: (store: Store) => void, opts: { survey?: boolean } = {}) {
  const r = repo();
  setup(r.store);
  server = await startServer(r.store, { reviewer: "tester", writeServerFile: false, debounceMs: 20 });
  if (!opts.survey) await skipSetup(page, r.dir);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await page.goto(server.url);
  await expect(page.locator(CARD)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return r;
}
const menu = (page: Page, item: string | RegExp) => page.getByRole("button", { name: "More" }).click().then(() => page.getByRole("menuitem", { name: item }).click());
const layout = async (page: Page) => {
  await page.waitForTimeout(80);
  expect(await page.evaluate(layoutProblems)).toEqual([]);
};
/**
 * Goes to the card asking `question`: from the path's Next row naming it, past its deck's briefing card, which comes
 * once, before a deck's first card (B-j6b75). Baesian's own decks have briefings.
 */
async function reach(page: Page, question: string, row: string) {
  for (let i = 0; i < 4; i++) {
    const label = await page.locator(CARD).getAttribute("aria-label");
    if (label === question) return;
    if (label?.startsWith("The briefing for")) await page.locator(CARD).getByRole("button", { name: /Go to its cards/ }).click();
    else await page.locator(".path .row.next", { hasText: row }).click();
    await page.waitForTimeout(60);
  }
  await expect(page.locator(CARD)).toHaveAttribute("aria-label", question);
}
async function shot(page: Page, name: string) {
  const dir = process.env.BAESIAN_SHOTS;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.clock.runFor(600); // fades that the fake clock holds
  await page.screenshot({ path: join(dir, `${name}.png`) });
}

test("held cards wait in their own list; one opens, is answered blind first, then overturned, and asked to be shown (D150, D151)", async ({ page }) => {
  let held = "";
  const { store } = await open(page, (s) => {
    handsOff(s, { rate_agent_decides: 0, rate_sample: 0, burn_in: 0 });
    held = file(s, { touches: ["dependency"], title: "The date library", question: "Which library should parse dates?", acted: "it added SQLite to package.json", acted_option: "proposal", rationale: "One file is enough." });
    file(s, { touches: ["user-facing"], title: "The empty page", question: "What should an empty page say?" });
  });
  expect(store.status(held)).toBe("held");
  // Out of the queue: only the shown card is to answer.
  await expect(page.locator(".summary")).toHaveText("1 to answer.");
  await expect(page.locator(CARD)).toHaveAttribute("aria-label", "What should an empty page say?");

  await menu(page, /Held back/);
  const panel = page.getByRole("complementary", { name: "Held back" });
  await expect(panel).toContainText("Your settings held these back, and their agents went ahead.");
  await expect(panel.getByRole("button", { name: /The date library/ })).toContainText("claude-code went ahead, on runtime dependencies.");
  await layout(page);
  await shot(page, "held-panel");

  // Blind first: nothing says which option the agent took, or what it built.
  await panel.getByRole("button", { name: /The date library/ }).click();
  await expect(page.locator(CARD)).toHaveAttribute("aria-label", "Which library should parse dates?");
  for (const hidden of [".facet.acted", ".facet.held", ".pickof", ".stopped", ".gone"]) await expect(page.locator(`${CARD} ${hidden}`)).toHaveCount(0);
  await expect(page.locator(CARD)).not.toContainText("One file is enough.");
  await layout(page);
  await shot(page, "held-blind");

  // Then what it went ahead with, and what's built; you keep it or overturn it.
  await page.locator(`${CARD} .opt[data-kind="alternative"]`).click();
  await expect(page.locator(CARD)).toContainText("You chose Postgres. claude-code went ahead with SQLite (WAL mode).");
  await expect(page.locator(`${CARD} .facet.held`)).toHaveText("Held back Your setting for runtime dependencies is “let the agent decide”, so claude-code went ahead without asking.");
  await expect(page.locator(`${CARD} .facet.acted`)).toContainText("claude-code has done “SQLite (WAL mode)”");
  await expect(page.locator(`${CARD} .pickof`)).toHaveText("claude-code went ahead with this");
  await page.locator(CARD).getByLabel(/You should have asked me/).check();
  await layout(page);
  await shot(page, "held-reveal");
  await page.locator(CARD).getByRole("button", { name: /Overturn it: “Postgres”/ }).click();
  await page.clock.fastForward(5100);
  await expect.poll(() => store.verdicts(held)).toEqual([expect.objectContaining({ response: "alternative", choice: "Postgres", first_choice: "alternative", should_have_asked: true })]);
  // A miss on the row: Baesian proposes showing more of them (B-y6jn6).
  await expect(page.getByRole("status")).toContainText("Baesian has a proposal from your answers, in your queue.");
  await page.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("menuitem", { name: /Held back/ })).toHaveText("Held back none");
});

test("the empty desk lists what's held back beside what's put aside", async ({ page }) => {
  await open(page, (s) => {
    handsOff(s, { rate_agent_decides: 0, rate_sample: 0, burn_in: 0 });
    file(s, { touches: ["dependency"], title: "The date library", question: "Which library should parse dates?" });
    const aside = file(s, { touches: ["user-facing"], title: "The empty page" });
    answer(s, aside, { response: "defer", comment: "Later." });
    file(s, { touches: ["user-facing"], title: "The search box" });
  });
  await page.locator(`${CARD} .opt[data-kind="proposal"]`).click();
  await page.locator(CARD).getByRole("button", { name: /Confirm/ }).click();
  await page.clock.fastForward(5100);
  await expect(page.getByText("All caught up.")).toBeVisible();
  const lists = page.locator(".empty .parked");
  await expect(lists.nth(0)).toContainText("Put asideThe empty page");
  await expect(lists.nth(1)).toContainText("Held backThe date libraryclaude-code went ahead, on runtime dependencies.Answer it");
  await layout(page);
  await shot(page, "empty-desk-held");
  await lists.nth(1).getByRole("button", { name: /The date library/ }).click();
  await expect(page.locator(CARD)).toHaveAttribute("aria-label", "Which library should parse dates?");
});

test("an audit comes through the queue between other cards, blind first; keeping the pick after choosing otherwise keeps both answers", async ({ page }) => {
  let audit = "";
  const { store } = await open(page, (s) => {
    handsOff(s);
    file(s, { touches: ["user-facing"], topic: "a1/q", title: "First shown" });
    file(s, { touches: ["user-facing"], topic: "a2/q", title: "Second shown" });
    file(s, { touches: ["user-facing"], topic: "a3/q", title: "Third shown" });
    audit = file(s, { touches: ["dependency"], topic: "a0/q", title: "The audited one", question: "Which library for the audit?", acted: "it added SQLite", acted_option: "proposal" });
  });
  expect(store.status(audit)).toBe("held");
  await expect(page.locator(".summary")).toHaveText("4 to answer.");
  // Spaced out: never first, after two others.
  const next = page.locator(".path .row.next .nm");
  await expect(next).toHaveText(["Second shown", "The audited one", "Third shown"]);
  for (let i = 0; i < 2; i++) {
    await page.locator(`${CARD} .opt[data-kind="proposal"]`).click();
    await page.locator(CARD).getByRole("button", { name: /Confirm/ }).click();
  }
  await expect(page.locator(CARD)).toHaveAttribute("aria-label", "Which library for the audit?");
  await expect(page.locator(`${CARD} .facet.acted`)).toHaveCount(0);
  await page.locator(`${CARD} .opt[data-kind="alternative"]`).click();
  await expect(page.locator(`${CARD} .facet.held`)).toContainText("This one came back to you as a sample.");
  await page.locator(CARD).getByRole("button", { name: "Keep claude-code's pick" }).click();
  await expect(page.locator(CARD)).toContainText("You're keeping SQLite (WAL mode), what claude-code went ahead with.");
  await page.locator(CARD).getByRole("button", { name: /Keep “SQLite \(WAL mode\)”/ }).click();
  await page.clock.fastForward(5100);
  await expect.poll(() => store.verdicts(audit)).toEqual([expect.objectContaining({ response: "accept", first_choice: "alternative" })]);
  expect(store.verdicts(audit)[0]?.should_have_asked).toBeUndefined();
});

test("Baesian's own cards say what they propose, with no card IDs; accepting a slider proposal moves its row (B-y6jn6, D161)", async ({ page }) => {
  let first = "";
  const { store } = await open(page, (s) => {
    first = file(s, { touches: ["dependency"], title: "The date library", question: "Which library should parse dates?" });
  });
  // Overturning the agent is a miss on the row, and "always" in the comment states a rule: Baesian files both.
  await page.locator(`${CARD} .opt[data-kind="alternative"]`).click();
  await page.locator(CARD).getByPlaceholder("One line").fill("Always the platform's own.");
  await page.locator(CARD).getByRole("button", { name: /Confirm/ }).click();
  await page.clock.fastForward(5100);
  await expect.poll(() => store.verdicts(first).length).toBe(1);
  await expect(page.locator(".summary")).toHaveText("2 to answer.");

  await reach(page, "Where should the setting for runtime dependencies be now?", "The setting for runtime dependencies");
  const slider = page.locator(CARD);
  await expect(slider.locator(".doing")).toHaveText("Baesian is reading the record of your answers, row by row");
  await expect(slider.locator(".stakes")).toContainText("Easy to undo, a change to your preferences");
  await expect(slider.locator(".crux .fact")).toHaveText(
    "“Runtime dependencies” is at “tell me but carry on”. On “The date library”, your final answer went against the agent's pick. Misses on this row at “tell me but carry on”: 1 in 1 final answer.",
  );
  await expect(slider).not.toContainText(/B-[0-9a-z]{5}/);
  await expect(slider.locator('.opt[data-kind="proposal"] h2')).toHaveText("Move it to “stop and ask”");
  await layout(page);
  await shot(page, "slider-proposal");
  await slider.locator('.opt[data-kind="proposal"]').click();
  await expect(page.locator(CARD)).toContainText("Baesian picked the same.");
  await expect(page.locator(CARD).getByLabel(/Make this a rule/)).toHaveCount(0);
  await page.locator(CARD).getByRole("button", { name: /Confirm/ }).click();
  await expect(page.getByRole("status")).toContainText("Recording it in");
  await page.clock.fastForward(5100);
  await expect(page.getByRole("status")).toContainText("Saved: Runtime dependencies is at “stop and ask” now.");
  await expect.poll(() => store.inForce().file?.row_dependency).toBe("stop-and-ask");

  // The convention card, from the comment's rule words: its evidence, by name.
  await reach(page, "Should this decision become a rule?", "A pattern in your answers");
  const convention = page.locator(CARD);
  await expect(convention.locator(".crux .fact")).toHaveText("On “The date library”, you chose “Postgres”, and wrote: “Always the platform's own.”");
  await shot(page, "convention-card");
});

test("your preferences: five stops a row, fixed rows locked, floors kept, presets with what each would have held; saving, and a stale save refused plainly (D146, D147)", async ({ page }) => {
  const { store } = await open(page, (s) => {
    answer(s, file(s, { touches: ["dependency"] }));
    answer(s, file(s, { touches: ["dependency"] }), { response: "alternative", choice: "Postgres" });
    answer(s, file(s, { touches: ["user-facing"] }));
    file(s, { touches: ["schema"] });
  });
  await menu(page, "Your preferences");
  const panel = page.getByRole("complementary", { name: "Your preferences" });
  await expect(panel).toContainText("None saved yet, so “Today” applies, in shadow.");
  const row = (name: string) => panel.getByRole("radiogroup", { name });
  await expect(row("Runtime dependencies").getByRole("radio")).toHaveCount(5);
  await expect(row("Runtime dependencies").getByRole("radio", { name: "Tell me, carry on" })).toBeChecked();
  for (const fixed of ["Publishing", "Spending", "Destroying data"]) {
    await expect(row(fixed).getByRole("radio", { name: "never without me" })).toBeChecked();
    for (const r of await row(fixed).getByRole("radio").all()) await expect(r).toBeDisabled();
  }
  for (const floor of ["Security", "Privacy"]) {
    await expect(row(floor).getByRole("radio", { name: "Agent decides" })).toBeDisabled();
    await expect(row(floor).getByRole("radio", { name: "Sample after" })).toBeDisabled();
    await expect(row(floor).getByRole("radio", { name: "Tell me, carry on" })).toBeEnabled();
  }
  // Each preset, with what it would have held of the four past cards; picking one shows the same of the draft.
  const fewer = panel.getByRole("button", { name: /^Fewer interruptions/ });
  await expect(fewer).toContainText("Would have held back 2 of your 4 past cards. You answered 1 of those against the agent.");
  await expect(panel.getByRole("button", { name: /^Today/ })).toHaveAttribute("aria-pressed", "true");
  await fewer.click();
  await expect(fewer).toHaveAttribute("aria-pressed", "true");
  await expect(panel.locator(".pref-total")).toHaveText("These settings would have held back 2 of your 4 past cards. You answered 1 of those against the agent.");
  await expect(row("Runtime dependencies").getByRole("radio", { name: "Sample after" })).toBeChecked();
  await panel.getByRole("radiogroup", { name: "Holding back" }).getByRole("radio", { name: "On" }).check();
  await panel.getByPlaceholder("One line").fill("Trying it.");
  // A long panel scrolls: checked, and seen, at its top and at its foot.
  await layout(page);
  await panel.evaluate((el) => el.scrollTo(0, 0));
  await layout(page);
  await shot(page, "preferences");
  await panel.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await layout(page);
  await shot(page, "preferences-foot");
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Your preferences are saved" })).toHaveText("Your preferences are saved. They apply to the next cards agents file.");
  const saved = store.inForce();
  expect(saved.file).toMatchObject({ mode: "enforce", profile: "fewer-interruptions", row_dependency: "sample", row_infra: "sample", row_other: "sample", reason: "Trying it.", by: "tester", client: "web" });
  expect(saved.file?.replaces).toBeUndefined();
  await expect(panel).toContainText("Last changed by tester");

  // Another change lands while you edit (another tab, or a slider proposal accepted): saving is refused, plainly.
  await row("Data formats").getByRole("radio", { name: "stop and ask" }).check();
  store.writePreferences({ replaces: saved.name, row_infra: "tell-me" }, WHO);
  await expect.poll(() => store.preferenceNames().length).toBe(2);
  await page.clock.runFor(200);
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(panel.getByRole("alert")).toHaveText("Your preferences changed while this was open, so nothing was saved. They're shown as they are now: make your change again.");
  expect(store.preferenceNames()).toHaveLength(2);
  await expect(row("Delivery and infrastructure").getByRole("radio", { name: "Tell me, carry on" })).toBeChecked();
  await expect(row("Data formats").getByRole("radio", { name: "Tell me, carry on" })).toBeChecked();
  await layout(page);
});

const width = (l: Locator) => l.evaluate((e) => e.getBoundingClientRect().width);

test("your calibration: a stacked bar per row at its true length, on one scale, with the mark at 29, faded rows, tooltips and the table (D180)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, (s) => {
    fileAnswered(s);
    file(s, { touches: ["schema"] }); // waiting: left out of the bar, and said beside it
  });
  await menu(page, "Your calibration");
  const panel = page.getByRole("complementary", { name: "Your calibration" });
  await expect(panel.locator(".cal-summary")).toHaveText(
    "Of 129 cards, you chose as the agent did 75 times without seeing its pick and came round to it 46 times after reading its case; 8 were misses. 1 more isn't counted: 1 not answered.",
  );
  await expect(panel.locator(".cal-legend span")).toHaveText(["Chose as the agent did, without seeing its pick", "Came round to its pick, after reading its case", "A miss: you overturned it or should have been asked, or chose otherwise blind on what you value"]);
  const row = (r: string) => panel.locator(`.cal-row[data-row="${r}"]`);
  await expect(panel.locator(".cal-row")).toHaveCount(12);

  // The segments are the report's counts, in order, and the row's stop is under its name.
  const security = row("security");
  await expect(security.locator(".nm")).toHaveText("Securitynever without me");
  expect(await security.locator(".seg").evaluateAll((els) => els.map((e) => [(e as HTMLElement).dataset.kind, Number((e as HTMLElement).dataset.count)]))).toEqual([
    ["agreed", 23],
    ["cameRound", 19],
    ["missed", 1],
  ]);
  await expect(security.locator(".num")).toHaveText("1 miss in 43");
  await expect(row("infra").locator(".seg")).toHaveCount(1);

  // True lengths: the longest row fills the track, the rest in proportion; the segments share a bar by their counts.
  const track = await width(security.locator(".cal-track"));
  expect(await width(security.locator(".cal-bar"))).toBeCloseTo(track, 0);
  expect((await width(row("schema").locator(".cal-bar"))) / track).toBeCloseTo(23 / 43, 2);
  expect((await width(row("dependency").locator(".cal-bar"))) / track).toBeCloseTo(2 / 43, 2);
  const segs = await security.locator(".seg").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
  expect(segs[0]! / segs[1]!).toBeCloseTo(23 / 19, 1);
  // "All rows" is scaled to its own width.
  const all = row("all");
  expect(await width(all.locator(".cal-bar"))).toBeCloseTo(await width(all.locator(".cal-track")), 0);
  await expect(all.locator(".nm")).toHaveText("All rowsscaled to its own width");
  await expect(all.locator(".num")).toHaveText("8 misses in 129and 1 not answered");

  // The mark at 29 answers, on every row's track, labelled once.
  const at = await security.locator(".cal-enough").evaluate((e) => e.getBoundingClientRect().left - e.parentElement!.getBoundingClientRect().left);
  expect(at / track).toBeCloseTo(29 / 43, 2);
  await expect(panel.locator(".cal-enough")).toHaveCount(11);
  await expect(panel.locator(".cal-axis")).toHaveText(["29: enough to judge"]);

  // Fewer than 10 answers: faded. What the bar leaves out is said beside it.
  await expect(row("privacy")).toHaveClass(/\bthin\b/);
  await expect(row("security")).not.toHaveClass(/\bthin\b/);
  await expect(row("schema").locator(".num")).toHaveText("1 miss in 23and 1 not answered");

  // A tooltip names a segment's count: on hover, and on focus, where the arrows step through them.
  const tip = page.getByRole("tooltip");
  await security.locator(".seg.r").hover();
  await expect(tip).toHaveText("Security: you came round to its pick, on 19 of 43 cards");
  await page.mouse.move(5, 5);
  await expect(tip).toHaveCount(0);
  await row("schema").focus();
  await expect(tip).toHaveText("Data formats: you chose as the agent did, blind, on 16 of 23 cards");
  await page.keyboard.press("ArrowRight");
  await expect(tip).toHaveText("Data formats: you came round to its pick, on 6 of 23 cards");
  await page.keyboard.press("ArrowRight");
  await expect(tip).toHaveText("Data formats: a miss, on 1 of 23 cards");
  await shot(page, "calibration-tooltip");
  await panel.locator("h4").click();
  await expect(tip).toHaveCount(0);
  await expect(panel.locator(".cal-reading")).toContainText("Baesian will suggest a lower stop after 29 answers in a row with no miss, where the row can go lower.");
  await expect(panel.locator(".cal-time")).toContainText("Later superseded: none of the decisions you settled here");
  await layout(page);
  await shot(page, "calibration");

  // The same numbers as a table.
  await panel.getByText("Show the numbers as a table").click();
  const table = panel.locator(".cal-table table");
  await expect(table.locator("thead th")).toHaveText(["Row", "Stop", "As the agent", "Came round", "Misses", "Cards", "Not counted"]);
  await expect(table.locator("tbody tr", { hasText: "Security" }).locator("td")).toHaveText(["never without me", "23", "19", "1", "43", "0"]);
  await expect(table.locator("tbody tr.all td")).toHaveText(["", "75", "46", "8", "129", "1"]);
  await panel.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await layout(page);
  await shot(page, "calibration-table");
});

test("your calibration says what's held back and the audits waiting beside a row's bar, and doesn't count them in it (D180)", async ({ page }) => {
  await open(page, (s) => {
    handsOff(s, { rate_agent_decides: 1, rate_sample: 0, burn_in: 0 });
    answer(s, file(s, { touches: ["dependency"] }), { first_choice: "proposal" }); // an audit, answered blind
    file(s, { touches: ["dependency"] }); // an audit, waiting
    file(s, { touches: ["infra"] }); // held back, and not drawn
    file(s, { touches: ["user-facing"] }); // reaches you, not answered yet
  });
  await menu(page, "Your calibration");
  const panel = page.getByRole("complementary", { name: "Your calibration" });
  await expect(panel.locator(".cal-summary")).toHaveText(
    "Of 1 card, you chose as the agent did once without seeing its pick and came round to it 0 times after reading its case; 0 were misses. 3 more aren't counted: 1 not answered, 1 held back and 1 audit waiting.",
  );
  const row = (r: string) => panel.locator(`.cal-row[data-row="${r}"]`);
  await expect(row("dependency").locator(".num")).toHaveText("0 misses in 1and 1 audit waiting");
  await expect(row("dependency").locator(".nm span")).toHaveText("let the agent decide");
  await expect(row("infra").locator(".num")).toHaveText("1 held back");
  await expect(row("infra").locator(".seg")).toHaveCount(0);
  await expect(row("user_facing").locator(".num")).toHaveText("1 not answered");
  await expect(row("money").locator(".num")).toHaveText("no cards");
  await layout(page);
});

test("your preferences say what each stop does, and what each row's stop means now, by the mode and the stop (D180)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, (s) => {
    fileAnswered(s);
    s.writePreferences({ rate_sample: 0.5 }, WHO);
    file(s, { touches: ["schema"] });
  });
  await menu(page, "Your preferences");
  const panel = page.getByRole("complementary", { name: "Your preferences" });
  await expect(panel.locator(".lede")).toHaveText(
    "Agents file a card for each decision that's hard to undo, and each card falls in a row by what it changes. A row's stop decides two things: whether its cards reach you, and what the agent does while it waits for your answer.",
  );

  // What each stop does, top to bottom, with a cut above the two that hold back, and the audit rates in force.
  const stops = panel.locator(".stops-table tbody tr");
  await expect(stops.locator(".stop-name")).toHaveText(["Never without me", "Stop and ask", "Tell me but carry on", "Check a sample afterwards", "Let the agent decide"]);
  await expect(stops.locator(".lvl")).toHaveText(["hard", "blocking", "provisional", "held", "held"]);
  await expect(stops.nth(3)).toHaveClass("cut");
  await expect(stops.nth(3).locator(".cut-label")).toHaveText("Held back, when holding back is on");
  await expect(stops.nth(0).locator("td")).toHaveText(["Reaches you.", "Stops. It never goes ahead without your answer."]);
  await expect(stops.nth(1).locator("td").nth(1)).toHaveText("Waits for you while you're here, up to about 9 minutes, then goes ahead with its pick until you answer.");
  await expect(stops.nth(3).locator("td")).toHaveText([
    "Goes to your Held back list, not your queue. About 1 in 2 comes to you anyway, at random, to check; so does each of a row's first 10.",
    "Goes ahead with its pick. Its branch can merge without your answer, and you can still answer it later.",
  ]);
  await expect(stops.nth(4).locator("td").first()).toHaveText("Goes to your Held back list. About 1 in 10 comes to you anyway, at random, to check; so does each of a row's first 10.");

  // Each row: what falls in it, its floor or "always", five stops, what its stop means, and its evidence.
  const row = (r: string) => panel.locator(`.pref-row[data-row="${r}"]`);
  await expect(panel.locator(".pref-row")).toHaveCount(11);
  const product = row("user_facing");
  await expect(product.locator(".what")).toHaveText("Anything the product's users see or do.");
  await expect(product.getByRole("radio")).toHaveCount(5);
  await expect(product.getByRole("radio", { name: "Tell me, carry on" })).toHaveAttribute("title", "Tell me but carry on");
  await expect(product.locator(".means")).toHaveText(
    "These cards reach you, and the agent carries on with its pick meanwhile, so you never hold it up. It hears your answer at its next stopping point.23 cards so far: 2 misses.",
  );
  await expect(row("security").locator(".limit")).toHaveText("No lower than “tell me but carry on”.");
  await expect(row("security").locator(".means")).toHaveText("These cards reach you, and the agent stops until you answer.43 cards so far: 1 miss.");
  await expect(row("money").locator(".limit")).toHaveText("Always “never without me”.");
  await expect(row("dependency").locator(".evidence")).toHaveText("2 cards so far: no misses.");
  await layout(page);
  await shot(page, "preferences-stops");

  // The sentence follows the row's stop, and for the two that hold back, the mode.
  const hold = panel.locator(".pref-hold");
  await expect(hold.locator(".now")).toHaveText("Shadow: your settings are tried out, not applied. Every card still reaches you.");
  await product.getByRole("radio", { name: "Sample after" }).check();
  await expect(product.locator(".means")).toHaveText(
    "In shadow, these cards still reach you. With holding back on, they'd go to your Held back list and the agent would carry on with its pick; the row's first 10 would come back to you, then about 1 in 2." +
      "23 cards so far: 2 misses. At this stop, all of them would have been held back, including 2 misses.",
  );
  await hold.getByRole("radio", { name: "On" }).check();
  await expect(hold.locator(".now")).toHaveText("On: cards on rows at the two lowest stops skip your queue. Their agents carry on, and a random sample comes back to you.");
  await expect(hold.locator(".more")).toHaveText("Rows at the three upper stops are unchanged.");
  await expect(product.locator(".means")).toContainText(
    "These cards skip your queue: the agent carries on with its pick, and the card waits on your Held back list. The row's first 10 come back to you, then about 1 in 2, at random.",
  );
  await product.getByRole("radio", { name: "Agent decides" }).check();
  await expect(product.locator(".means")).toContainText("The row's first 10 come back to you, then about 1 in 10, at random.");
  await product.getByRole("radio", { name: "Stop and ask" }).check();
  await expect(product.locator(".means")).toContainText("These cards reach you, and the agent waits for your answer while you're here, up to about 9 minutes, before going ahead with its pick.");
  await product.scrollIntoViewIfNeeded();
  await layout(page);
  await shot(page, "preferences-rows");
});

test("with no preference file, the setup survey is offered once, as cards answered with the card's gestures, and its suggestion is used (B-5na1k)", async ({ page }) => {
  const { store } = await open(page, (s) => {
    answer(s, file(s, { touches: ["dependency"] }));
    file(s, { touches: ["user-facing"], title: "The empty page", question: "What should an empty page say?" });
  }, { survey: true });
  const offer = page.getByRole("article", { name: "Setting up your preferences" });
  await expect(offer).toContainText("How much should reach you?");
  await expect(offer).toContainText("Six example decisions, one for each kind your settings can hold back.");
  await layout(page);
  await shot(page, "setup-offer");

  await page.keyboard.press("ArrowRight");
  const example = page.locator(CARD);
  await expect(example).toHaveAttribute("aria-label", "Which library should parse dates in the import step?");
  await expect(example.locator(".stakes")).toContainText("Example 1 of 6: Runtime dependencies");
  await expect(example.locator('.opt[data-side="left"] h2')).toHaveText("Show me ones like it");
  await expect(example.locator('.opt[data-side="right"] h2')).toHaveText("Fine not seeing it");
  await layout(page);
  await shot(page, "setup-example");
  // Fine not seeing dependencies, infrastructure and anything else; see product behaviour and data formats; not sure of the API.
  await page.keyboard.press("ArrowRight");
  await expect(example).toHaveAttribute("aria-label", "Should the CI workflow cache installed packages between runs?");
  await example.getByRole("button", { name: /Fine not seeing it/ }).click();
  const box = (await example.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + 60, { steps: 4 });
  await page.mouse.move(box.x + box.width / 2 + 240, box.y + 60, { steps: 4 });
  await page.mouse.up();
  await expect(example).toHaveAttribute("aria-label", "What should search show when nothing matches?");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(example).toHaveAttribute("aria-label", "How should the runs endpoint page its results?");
  await page.keyboard.press("ArrowDown");

  const result = page.getByRole("article", { name: "The preset your answers suggest" });
  await expect(result.locator("h1")).toHaveText("Fewer interruptions");
  await expect(result).toContainText("Checked by sample afterwards: runtime dependencies, delivery and infrastructure, and anything else that's hard to undo.");
  await expect(result).toContainText("It would have held back 1 of your 2 past cards.");
  await expect(result).toContainText("It starts in shadow");
  await layout(page);
  await shot(page, "setup-result");
  await result.getByRole("button", { name: /Use it/ }).click();
  await expect(page.getByRole("status")).toContainText("Saved: “Fewer interruptions”, in shadow. Nothing is held back yet.");
  expect(store.inForce().file).toMatchObject({
    mode: "shadow",
    profile: "fewer-interruptions",
    survey_see: ["schema", "user_facing"],
    survey_fine: ["dependency", "infra", "other"],
    row_dependency: "sample",
    by: "tester",
    client: "web",
  });
  await expect(page.locator(CARD)).toHaveAttribute("aria-label", "What should an empty page say?");
  await page.reload();
  await expect(page.locator(CARD)).toHaveAttribute("aria-label", "What should an empty page say?");
});

test("the survey can be put off, isn't offered again, and starts again from your preferences, where its suggestion can be adjusted", async ({ page }) => {
  const { store } = await open(page, (s) => void file(s, { touches: ["user-facing"], title: "The empty page", question: "What should an empty page say?" }), { survey: true });
  await page.getByRole("article", { name: "Setting up your preferences" }).getByRole("button", { name: /Not now/ }).click();
  await expect(page.locator(CARD)).toHaveAttribute("aria-label", "What should an empty page say?");
  await page.reload();
  await expect(page.locator(CARD)).toHaveAttribute("aria-label", "What should an empty page say?");

  await menu(page, "Your preferences");
  await page.getByRole("complementary", { name: "Your preferences" }).getByRole("button", { name: "Find a preset from example decisions" }).click();
  await expect(page.locator(CARD)).toHaveAttribute("aria-label", "Which library should parse dates in the import step?");
  // Back goes to the example before.
  await page.keyboard.press("ArrowLeft");
  await page.locator(CARD).getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.locator(CARD)).toHaveAttribute("aria-label", "Which library should parse dates in the import step?");
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowLeft");
  const result = page.getByRole("article", { name: "The preset your answers suggest" });
  await expect(result.locator("h1")).toHaveText("Today");
  await expect(result).toContainText("Every kind reaches you");
  await result.getByRole("button", { name: "Adjust it first" }).click();
  const panel = page.getByRole("complementary", { name: "Your preferences" });
  await expect(panel.getByRole("button", { name: /^Today/ })).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByRole("status")).toHaveText("Not saved yet.");
  await panel.getByRole("radiogroup", { name: "Product behaviour" }).getByRole("radio", { name: "stop and ask" }).check();
  await panel.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => store.inForce().file).toMatchObject({ profile: "today", row_user_facing: "stop-and-ask", survey_see: ["public_api", "schema", "dependency", "infra", "user_facing", "other"] });
});

test("in shadow, a card your settings would have held reaches you as usual, and can be marked as one you'd want asked about (D148, B-87tkc)", async ({ page }) => {
  let id = "";
  const { store } = await open(page, (s) => {
    s.writePreferences({ preset: "hands-off" }, WHO);
    id = file(s, { touches: ["dependency"], title: "The date library", question: "Which library should parse dates?" });
  });
  expect(store.status(id)).toBe("open");
  expect(store.gateRecord(id)).toMatchObject({ mode: "shadow", outcome: "held" });
  await expect(page.locator(".summary")).toHaveText("1 to answer.");
  await page.locator(`${CARD} .opt[data-kind="proposal"]`).click();
  await expect(page.locator(CARD)).toContainText("claude-code picked the same.");
  await expect(page.locator(`${CARD} .facet.held`)).toHaveCount(0);
  await expect(page.locator(CARD)).toContainText("In shadow, your setting for runtime dependencies, “let the agent decide”, would have held this back.");
  await page.locator(CARD).getByLabel(/I'd have wanted to be asked/).check();
  await page.locator(CARD).getByRole("button", { name: /Confirm/ }).click();
  await page.clock.fastForward(5100);
  await expect.poll(() => store.verdicts(id)).toEqual([expect.objectContaining({ response: "accept", should_have_asked: true })]);
});

test("the new screens fit at laptop size: the survey, your preferences and the record (1280×800)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, (s) => {
    answer(s, file(s, { touches: ["dependency"] }));
    file(s, { touches: ["user-facing"], title: "The empty page", question: "What should an empty page say?" });
  }, { survey: true });
  await layout(page);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(CARD)).toHaveAttribute("aria-label", "Which library should parse dates in the import step?");
  await layout(page);
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("article", { name: "The preset your answers suggest" }).locator("h1")).toHaveText("Hands-off");
  await layout(page);
  await page.keyboard.press("Enter");
  await expect(page.locator(CARD)).toHaveAttribute("aria-label", "What should an empty page say?");

  await menu(page, "Your preferences");
  const prefs = page.getByRole("complementary", { name: "Your preferences" });
  await expect(prefs.getByRole("button", { name: /^Hands-off/ })).toHaveAttribute("aria-pressed", "true");
  await layout(page);
  await prefs.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await layout(page);
  await page.keyboard.press("Escape");
  await menu(page, "Your calibration");
  await layout(page);
});
