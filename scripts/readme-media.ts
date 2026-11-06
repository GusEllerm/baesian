// The README's media, made from the real thing, by the built client in a headless browser:
//
//   docs/media/demo.gif      a run of the demo (scripts/demo.ts), answered as you would, ending on the Branches drawer
//   docs/media/branches.png  the Branches drawer over a stretch of this repo's own history, from branches.json
//   docs/media/phone.png     the demo's first card on a phone, held until it lifts
//   docs/media/*.png         each figure drawn by hand in docs/media/*.html (checkpoints.html)
//
// Run it with `npm run readme-media` for all of them, or name one part: `gif`, `figures` (every PNG), `drawer` or
// `phone`. The GIF needs ffmpeg. `drawer-data` makes branches.json again, from this clone's decision record.
//
// The GIF puts two things side by side: the client, as you'd answer in it, and a panel with what's going on and
// what each agent's terminal says. The panel's terminal lines are the demo's own output, so what an agent hears in
// the GIF is what `baesian wait` printed.

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { type Interface, createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { type Page, chromium } from "@playwright/test";
import type { ApiCard, ApiCommit, ApiMerge, ApiState } from "../src/api.js";
import { blankRow } from "../src/report.js";
import { TODAY } from "../src/routing.js";
import type { CardMeta, GateRecord, Verdict } from "../src/schema.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MEDIA = join(ROOT, "docs", "media");
const TSX = join(ROOT, "node_modules", ".bin", "tsx");

// ------------------------------------------------------------------ the figures

/** Each `docs/media/<name>.html` becomes `docs/media/<name>.png`, at twice its size, so it's sharp on any screen. */
async function figures(): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  for (const file of readdirSync(MEDIA).filter((f) => f.endsWith(".html"))) {
    await page.goto(pathToFileURL(join(MEDIA, file)).href);
    await page.evaluate("document.fonts.ready.then(() => true)");
    const out = join(MEDIA, file.replace(/\.html$/, ".png"));
    await page.locator("figure").screenshot({ path: out });
    console.log(`made ${out}`);
  }
  await browser.close();
}

// ------------------------------------------------------------------ the Branches drawer, on Baesian's own history

/**
 * The stretch of this repo's own history that `docs/media/branches.png` shows, by git's clock in UTC, and the time zone
 * it's read in, the one its commits were made in: Thursday 5 November, 8:35 to 11 p.m. in Chicago. In it, v1/next merges
 * into main twice, and four worktrees start from v1/next and merge back, two with a card of their own.
 */
const HISTORY = {
  file: join(MEDIA, "branches.json"),
  from: "2026-11-06T02:35:00.000Z",
  to: "2026-11-06T05:00:00.000Z",
  timeZone: "America/Chicago",
  /** The card the figure opens: one a worktree brought back, with the commits citing it. */
  pick: "B-bf29j",
};

/** A card as the drawer draws it: what `ApiCard` says, less everything it doesn't draw. */
interface HistoryCard {
  /** Its agent and options only on the card the figure opens (`HISTORY.pick`): the rows draw neither. */
  meta: Pick<CardMeta, "id" | "revision" | "title" | "created" | "source_branch" | "level"> & Partial<Pick<CardMeta, "source_agent" | "proposal" | "alternative">>;
  status: ApiCard["status"];
  decision?: string;
  /** Its last answer on its latest revision, without who gave it: what it chose, and how, only on the card opened. */
  verdicts: Pick<Verdict, "revision" | "response" | "first_choice" | "seen" | "choice">[];
  waiting?: { agent: string; at: string }[];
  /** Only a gate record that makes it hard. */
  gate?: Pick<GateRecord, "outcome" | "level">;
}

/** `docs/media/branches.json`: the state the drawer reads (`snapshot()`), trimmed to the window and to what it draws. */
interface History {
  about: string;
  from: string;
  to: string;
  /** The drawer's "now": the window's end. */
  now: string;
  timeZone: string;
  defaultBranch?: string;
  cards: HistoryCard[];
  merges: ApiMerge[];
  commits: ApiCommit[];
}

/** The branches the drawer draws no lane for: Baesian's own cards on the relay, and a detached HEAD's. */
const offLane = (b: string | undefined) => !b || b === "relay" || b.startsWith("detached-");

/**
 * `-- drawer-data`: `docs/media/branches.json` made again from this clone's decision record. A scratch clone of the repo,
 * with a copy of its live layer (`.git/baesian`), is read by the store as `baesian serve` reads it; nothing in the repo,
 * and nothing on the relay, is touched. Then it's trimmed to the window: no card bodies, no reviewer, no accounts.
 */
async function drawerData(): Promise<void> {
  const { Store } = await import("../src/store.js");
  const { snapshot } = await import("../src/state.js");
  const { defaultBranch } = await import("../src/git.js");
  const sh = (...args: string[]) => {
    const r = spawnSync("git", args, { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.trim()}`);
    return r.stdout.trim();
  };
  const work = mkdtempSync(join(tmpdir(), "baesian-history-"));
  try {
    const clone = join(work, "repo");
    sh("-c", "core.hooksPath=/dev/null", "clone", "-q", ROOT, clone);
    cpSync(join(sh("-C", ROOT, "rev-parse", "--path-format=absolute", "--git-common-dir"), "baesian"), join(clone, ".git", "baesian"), { recursive: true });
    const state = snapshot(Store.open(clone), { version: 1, server: { started: HISTORY.to, watch: "poll" }, project: { name: "baesian", branch: "main" }, now: Date.parse(HISTORY.to) });
    // The repo's own default branch, the trunk: the clone's would be whatever this checkout has out.
    const trunk = defaultBranch(ROOT)?.branch;
    const inside = (at: string) => Date.parse(at) >= Date.parse(HISTORY.from) && Date.parse(at) <= Date.parse(HISTORY.to);
    const cards = state.cards
      .filter((c) => inside(c.meta.created) && !offLane(c.meta.source_branch))
      .map((c): HistoryCard => {
        const { id, revision, title, created, source_branch, source_agent, level, proposal, alternative } = c.meta;
        const last = c.verdicts.filter((v) => v.revision === revision).at(-1);
        const chose = last?.response === "accept" || last?.response === "alternative";
        // The card the figure opens says who filed it, what was chosen and how; a row says only its mark.
        const opened = id === HISTORY.pick;
        const how = opened && last ? { ...(last.first_choice ? { first_choice: last.first_choice } : {}), ...(last.seen ? { seen: last.seen } : {}), ...(last.choice && !chose ? { choice: last.choice } : {}) } : {};
        return {
          meta: { id, revision, title, created, source_branch, level, ...(opened ? { source_agent, proposal, alternative } : {}) },
          status: c.status,
          ...(opened && c.decision !== undefined && last && !chose ? { decision: c.decision } : {}),
          verdicts: last ? [{ revision: last.revision, response: last.response, ...how }] : [],
          ...(opened && c.status === "open" && c.waiting.length ? { waiting: c.waiting.map((w) => ({ agent: w.agent, at: w.at })) } : {}),
          ...(c.gate?.outcome === "shown" && c.gate.level === "hard" ? { gate: { outcome: c.gate.outcome, level: c.gate.level } } : {}),
        };
      })
      .sort((a, b) => a.meta.created.localeCompare(b.meta.created));
    const history: History = {
      about: "Baesian's own decision record, as the Branches drawer reads it, for docs/media/branches.png: made by `npm run readme-media -- drawer-data` (scripts/readme-media.ts), drawn by `-- drawer`.",
      from: HISTORY.from,
      to: HISTORY.to,
      now: HISTORY.to,
      timeZone: HISTORY.timeZone,
      ...(trunk ? { defaultBranch: trunk } : {}),
      cards,
      merges: (state.merges ?? []).filter((m) => inside(m.at)),
      commits: (state.commits ?? []).filter((c) => inside(c.at)),
    };
    writeFileSync(HISTORY.file, `${JSON.stringify(history, null, 1)}\n`);
    console.log(`made ${HISTORY.file} (${cards.length} cards, ${history.merges.length} merges, ${history.commits.length} commits)`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** Where the built client is served from to a page, with no server: `serveState()`. */
const ORIGIN = "http://baesian.readme";

/** The built client, served to a page from dist/client, with `state` at /api/state; nothing else answers, or is written. */
async function serveState(page: Page, state: ApiState): Promise<void> {
  const dist = join(ROOT, "dist", "client");
  await page.route(`${ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/state") return route.fulfill({ json: state });
    // The change events, the presence heartbeat: no content, so the page doesn't try again.
    if (path.startsWith("/api/")) return route.fulfill({ status: 204 });
    const file = join(dist, path === "/" ? "index.html" : path);
    return route.fulfill(existsSync(file) ? { path: file } : { status: 404 });
  });
}

/** The state the client reads, from `docs/media/branches.json`: what the drawer doesn't draw, left empty. */
function historyState(h: History): ApiState {
  const cards = h.cards.map(
    (c): ApiCard => ({
      meta: { type: "card", format: 1, question: c.meta.title, doing: "", source_agent: "", proposal: "", alternative: "", topic: "history/q", deck: "history", touches: [], reverse: "moderate", proposal_then: "", alternative_then: "", also_considered: [], crux: "", crux_proposal: "", crux_alternative: "", rules: [], proposal_breaks: [], alternative_breaks: [], depends_on: [], ...c.meta } as unknown as CardMeta,
      body: "",
      revisions: c.meta.revision,
      replied: false,
      status: c.status,
      ...(c.decision !== undefined ? { decision: c.decision } : {}),
      canonicalTopic: "history/q",
      verdicts: c.verdicts.map((v) => ({ type: "verdict", format: 1, card: c.meta.id, reviewer: "you", ...v }) as Verdict),
      dependents: [],
      briefs: [],
      waiting: (c.waiting ?? []).map((w) => ({ ...w, since: w.at, stale: false })),
      fallbacks: [],
      attachments: 0,
      ...(c.gate ? { gate: c.gate as GateRecord } : {}),
    }),
  );
  return {
    version: 1,
    server: { started: h.now, now: h.now, watch: "poll" },
    project: { name: "baesian", branch: h.defaultBranch ?? "main" },
    ...(h.defaultBranch ? { defaultBranch: h.defaultBranch } : {}),
    decks: [],
    rules: [],
    cards,
    routing: { settings: TODAY, history: [], report: { rows: {}, pooled: blankRow(), beforeGate: 0 } },
    problems: [],
    merges: h.merges,
    commits: h.commits,
  };
}

/**
 * `docs/media/branches.png`: the Branches drawer, Wider (880 px, so GitHub shows it at its own size), over the window of
 * this repo's history in `branches.json`, drawn by the built client at the window's end, in its time zone. One card is
 * picked (`HISTORY.pick`), so its detail lists the commits citing it. Cropped to the drawer, less the grip on its edge,
 * which the crop would cut in half; as tall as a laptop's screen shows it.
 */
async function drawer(): Promise<void> {
  const h = JSON.parse(readFileSync(HISTORY.file, "utf8")) as History;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1040 }, deviceScaleFactor: 2, timezoneId: h.timeZone, locale: "en-GB", reducedMotion: "reduce" });
    await page.clock.setFixedTime(new Date(h.now));
    await serveState(page, historyState(h));
    // No preference file, so the client would first offer the setup survey (B-5na1k): this is about the drawer.
    await page.addInitScript(() => localStorage.setItem("baesian:baesian:setup", "true"));
    await page.goto(ORIGIN);
    await page.locator("main.desk").waitFor();
    await page.evaluate("document.fonts.ready.then(() => true)");
    await page.addStyleTag({ content: ".drawer-grip { display: none; }" });
    await page.getByRole("button", { name: /^Branches/ }).click();
    const d = page.getByRole("dialog", { name: "Your decisions, by branch" });
    await d.getByRole("button", { name: "Wider" }).click();
    await d.locator(`[data-row="card:${HISTORY.pick}"]`).click();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    await d.locator(".drawer-scroll").evaluate((el) => el.scrollTo(0, 0));
    await page.waitForTimeout(100);
    const out = join(MEDIA, "branches.png");
    await d.screenshot({ path: out });
    console.log(`made ${out}`);
  } finally {
    await browser.close();
  }
}

// ------------------------------------------------------------------ the GIF

const FPS = 12;
/**
 * The client and the panel, side by side, and the GIF's width over theirs. The client is as narrow as the desk goes with
 * its path beside the card, and as tall as a card's reveal, so the GIF's text still reads when GitHub shows it 880 px
 * wide; the GIF is 1020 px wide, a little more for screens that have the pixels, and about 3 MB.
 */
const CLIENT = { width: 1000, height: 800 };
const PANEL = { width: 360, height: 800 };
const GIF_SCALE = 0.75;
/** The demo's project and decks (scripts/demo.ts), as the client keeps what it has offered in the browser's storage. */
const DEMO = { project: "crumb", decks: ["checkout", "catalog"] };
/** The cards the GIF answers, in order: which option it chooses, and what the panel says before and after. */
const PLAN = [
  {
    title: "Where a signed-in shopper's session lives",
    kind: "proposal",
    before: "You see the question, and what it turns on. Not the agent's pick.",
    reveal: "You choose first. Then you see what the agent picked, and why.",
  },
  {
    title: "How prices are stored",
    kind: "alternative",
    before: "Next, codex has stopped on how the shop stores prices.",
    reveal: "Here you overrule codex: decimals, not whole cents.",
  },
] as const;

interface Entry {
  command: string;
  lines: string[];
  fresh: boolean;
}
interface Panel {
  caption: string;
  agents: { name: string; branch: string; entries: Entry[] }[];
}

async function gif(): Promise<void> {
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) throw new Error("the GIF needs ffmpeg on PATH");
  const work = mkdtempSync(join(tmpdir(), "baesian-media-"));
  const demo = startDemo(work);
  const out = createInterface({ input: demo.stdout! });
  const browser = await chromium.launch();
  try {
    const { url, cards } = await started(demo, out);
    const panel: Panel = {
      caption: "Two agents are building a bakery's online shop. Each has stopped on a decision it shouldn't make alone.",
      agents: [
        { name: "claude-code", branch: "feat/checkout", entries: [] },
        { name: "codex", branch: "feat/catalog", entries: [] },
      ],
    };
    // Each agent starts by waiting on the first card it stopped for, as the demo's table says.
    for (const a of panel.agents) {
      const first = cards.find((c) => c.agent === a.name && c.waiting);
      if (first) a.entries.push({ command: `baesian wait ${first.id}`, lines: ["waiting for your answer…"], fresh: false });
    }

    const client = await (await browser.newContext({ viewport: CLIENT })).newPage();
    await skipOffers(client);
    const side = await (await browser.newContext({ viewport: PANEL })).newPage();
    await side.setContent(panelPage());
    const frames = join(work, "frames");
    mkdirSync(frames);
    const shots: { t: number; file: string; side: boolean }[] = [];
    let n = 0;
    const drawPanel = async () => {
      await side.locator("main").evaluate((el, html) => void (el.innerHTML = html), panelHtml(panel));
      const file = join(frames, `side-${String(n++).padStart(5, "0")}.png`);
      await side.screenshot({ path: file });
      shots.push({ t: Date.now(), file, side: true });
    };
    watchDemo(out, panel, () => void drawPanel());

    await client.goto(url);
    await client.waitForSelector(".opt");
    await client.evaluate("document.fonts.ready.then(() => true)");
    await drawPanel();
    const stop = await screencast(client, frames, shots);
    const start = Date.now();

    const caption = async (text: string) => {
      panel.caption = text;
      await drawPanel();
    };
    await client.waitForTimeout(3500);
    for (const [i, step] of PLAN.entries()) {
      await caption(step.before);
      // The queue's order isn't fixed: if another card is up, go to this one from the path.
      if (!(await isUp(client, step.title))) {
        await client.locator(".row.next", { hasText: step.title }).click();
        await client.waitForTimeout(600);
      }
      await client.waitForSelector(`${LIVE}:not([data-locked])`, { timeout: 20_000 });
      await client.waitForTimeout(i === 0 ? 1500 : 2500);
      const key = (await client.locator(`${LIVE} .opt[data-kind="${step.kind}"]`).getAttribute("data-side")) === "left" ? "ArrowLeft" : "ArrowRight";
      await client.keyboard.down(key);
      await client.waitForTimeout(250);
      await client.keyboard.up(key);
      await caption(step.reveal);
      await client.waitForTimeout(3800);
      const confirm = client.locator(LIVE).getByRole("button", { name: /^Confirm/ });
      if (await confirm.count()) {
        await client.keyboard.press(key);
        await client.waitForTimeout(300);
        if (await confirm.count()) await confirm.click();
      } else {
        await caption("A decision that touches security takes a hold to confirm.");
        await client.waitForTimeout(1200);
        await client.keyboard.down(key);
        await client.waitForTimeout(1300);
        await client.keyboard.up(key);
      }
      if (i === 0) {
        await caption("Your answer joins your path. It goes to the agent once the five seconds to undo it are up.");
        await client.waitForTimeout(3800);
      } else await client.waitForTimeout(600);
    }
    await caption("When you overrule an agent, it may reply once, with a fact you lacked. Not its pick again.");
    await waitFor(() => panel.agents[1]!.entries[0]!.lines.length > 1, 15_000);
    await client.waitForTimeout(4500);
    // The answers by branch, in the Branches drawer (B): each branch's merge is held while a card on it waits.
    await caption("Every answer is stored in git, by branch. A branch's merge is held while a card on it waits for you.");
    await client.waitForTimeout(700);
    await client.keyboard.press("b");
    await client.waitForTimeout(4800);
    await stop();
    await encode(work, shots, start, Date.now());
  } finally {
    await browser.close();
    await stopDemo(demo);
    rmSync(work, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------------ the phone

/**
 * `docs/media/phone.png`: the demo's first card on a phone, 390×844, held until it lifts (B-yfehp), with its four
 * answers named at the screen's edges. The finger is Chromium's own touch events, as the phone's browser tests send them.
 */
async function phone(): Promise<void> {
  const work = mkdtempSync(join(tmpdir(), "baesian-media-"));
  const demo = startDemo(work);
  const browser = await chromium.launch();
  try {
    const { url } = await started(demo, createInterface({ input: demo.stdout! }));
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    await skipOffers(page);
    await page.goto(url);
    // Past its reading time: a card can't be answered, or lifted, before it.
    await page.waitForSelector(`${LIVE}:not([data-locked]) .opt`, { timeout: 20_000 });
    await page.evaluate("document.fonts.ready.then(() => true)");
    const box = (await page.locator(`${LIVE} h1`).boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
    await page.locator(`${LIVE}[data-lift="lifted"]`).waitFor();
    await page.waitForTimeout(700);
    const out = join(MEDIA, "phone.png");
    await page.screenshot({ path: out });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    console.log(`made ${out}`);
  } finally {
    await browser.close();
    await stopDemo(demo);
    rmSync(work, { recursive: true, force: true });
  }
}

const LIVE = "article.card:not([data-leaving])";

/**
 * The demo (scripts/demo.ts), in a folder of `work`, with the client left for us to open. Its reviewer is made up, as
 * the bakery is: `baesian serve` names whoever answers by git's `user.name`, and an agent hears that name, so a recording
 * would otherwise show the name of whoever made it.
 */
function startDemo(work: string): ChildProcess {
  const reviewer = { GIT_CONFIG_COUNT: "2", GIT_CONFIG_KEY_0: "user.name", GIT_CONFIG_VALUE_0: "Robin", GIT_CONFIG_KEY_1: "user.email", GIT_CONFIG_VALUE_1: "robin@crumb.example" };
  return spawn(TSX, [join(ROOT, "scripts", "demo.ts"), join(work, "repo"), "--no-open"], { cwd: ROOT, stdio: ["pipe", "pipe", "inherit"], env: { ...process.env, ...reviewer } });
}

async function stopDemo(demo: ChildProcess): Promise<void> {
  if (demo.exitCode !== null) return;
  demo.kill("SIGINT");
  await new Promise((done) => demo.once("close", done));
}

/**
 * The demo's repo has no preferences and its decks have briefings, so the client would first offer the setup survey
 * (B-5na1k) and each deck's briefing card (B-j6b75): marked offered, as the client keeps them, since this is about cards.
 */
const skipOffers = (page: Page) =>
  page.addInitScript((d) => {
    localStorage.setItem(`baesian:${d.project}:setup`, "true");
    localStorage.setItem(`baesian:${d.project}:briefed`, JSON.stringify(d.decks));
  }, DEMO);

/** Whether the card on the desk is the one with this title: the path's current node sits between the answered rows and "Next". */
async function isUp(page: Page, title: string): Promise<boolean> {
  return !(await page.locator(".row.next", { hasText: title }).count()) && !(await page.locator(".row.past", { hasText: title }).count());
}

async function waitFor(ok: () => boolean, ms: number): Promise<void> {
  const until = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > until) throw new Error("timed out waiting for the demo");
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** The demo's client URL and its table of cards, once it has printed them. */
function started(demo: ChildProcess, lines: Interface): Promise<{ url: string; cards: { id: string; agent: string; waiting: boolean }[] }> {
  return new Promise((done, fail) => {
    const cards: { id: string; agent: string; waiting: boolean }[] = [];
    let agent = "";
    const onLine = (line: string) => {
      const who = line.match(/^ {2}(\S+), on /);
      if (who) agent = who[1]!;
      const card = line.match(/^ {4}(B-\w{5}) .*stopped until you answer$/) ?? line.match(/^ {4}(B-\w{5}) /);
      if (card) cards.push({ id: card[1]!, agent, waiting: line.endsWith("stopped until you answer") });
      const url = line.match(/^Open the client at (\S+)$/)?.[1];
      if (url) {
        lines.off("line", onLine);
        done({ url, cards });
      }
    };
    lines.on("line", onLine);
    demo.once("close", (code) => fail(new Error(`the demo stopped before it started (exit ${code})`)));
  });
}

/** Turn what the demo prints about each agent into the panel's terminal lines. */
function watchDemo(lines: Interface, panel: Panel, changed: () => void): void {
  let hearing: Entry | undefined;
  lines.on("line", (line) => {
    const heard = line.match(/^(\S+) hears, from `baesian wait (B-\w{5})`:$/);
    const next = line.match(/^(\S+) goes on, and stops again for (B-\w{5})/);
    const agent = (name: string) => panel.agents.find((a) => a.name === name);
    if (heard) {
      const entry = agent(heard[1]!)?.entries.find((e) => e.command === `baesian wait ${heard[2]}`);
      if (entry) {
        entry.lines = [];
        entry.fresh = true;
        hearing = entry;
      }
    } else if (hearing && line.startsWith("    ")) {
      hearing.lines.push(line.slice(4));
    } else if (hearing && line.trim() === "") {
      hearing = undefined;
      changed();
    } else if (next) {
      const a = agent(next[1]!);
      for (const e of a?.entries ?? []) e.fresh = false;
      a?.entries.push({ command: `baesian wait ${next[2]}`, lines: ["waiting for your answer…"], fresh: false });
      changed();
    }
  });
}

/** Record the client as it repaints, through the browser's own screencast, with each frame's time. */
async function screencast(page: Page, dir: string, shots: { t: number; file: string; side: boolean }[]): Promise<() => Promise<void>> {
  const cdp = await page.context().newCDPSession(page);
  let n = 0;
  cdp.on("Page.screencastFrame", (f: { data: string; sessionId: number }) => {
    const file = join(dir, `client-${String(n++).padStart(5, "0")}.jpg`);
    writeFileSync(file, Buffer.from(f.data, "base64"));
    shots.push({ t: Date.now(), file, side: false });
    void cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId });
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: CLIENT.width, maxHeight: CLIENT.height, everyNthFrame: 1 });
  // The first frame only comes with a repaint: a full-page screenshot asks for one.
  const first = join(dir, "client-first.jpg");
  await page.screenshot({ path: first, type: "jpeg", quality: 92 });
  shots.push({ t: Date.now(), file: first, side: false });
  return async () => {
    await cdp.send("Page.stopScreencast");
  };
}

/** Lay the frames out at a steady rate, the latest of each side at every tick, and make the GIF. */
async function encode(work: string, shots: { t: number; file: string; side: boolean }[], start: number, end: number): Promise<void> {
  const seq = { client: join(work, "seq-client"), side: join(work, "seq-side") };
  mkdirSync(seq.client);
  mkdirSync(seq.side);
  const latest = (side: boolean, t: number) => shots.filter((s) => s.side === side && s.t <= t).at(-1) ?? shots.find((s) => s.side === side)!;
  const ticks = Math.ceil(((end - start) / 1000) * FPS);
  for (let i = 0; i < ticks; i++) {
    const t = start + (i * 1000) / FPS;
    copyFileSync(latest(false, t).file, join(seq.client, `${String(i).padStart(5, "0")}.jpg`));
    copyFileSync(latest(true, t).file, join(seq.side, `${String(i).padStart(5, "0")}.png`));
  }
  mkdirSync(MEDIA, { recursive: true });
  const out = join(MEDIA, "demo.gif");
  const width = Math.round((CLIENT.width + PANEL.width) * GIF_SCALE);
  const filter = `[0][1]hstack=inputs=2,scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(FPS), "-i", join(seq.client, "%05d.jpg"), "-framerate", String(FPS), "-i", join(seq.side, "%05d.png"), "-filter_complex", filter, "-loop", "0", out], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg couldn't make the GIF");
  console.log(`made ${out} (${ticks} frames, ${(readFileSync(out).length / 1e6).toFixed(1)} MB)`);
}

// ------------------------------------------------------------------ the panel beside the client

const font = (pkg: string, file: string) => `data:font/woff2;base64,${readFileSync(join(ROOT, "node_modules", "@fontsource-variable", pkg, "files", file)).toString("base64")}`;

function panelPage(): string {
  return `<!doctype html><html><head><style>
@font-face { font-family: "Archivo"; src: url(${font("archivo", "archivo-latin-wght-normal.woff2")}) format("woff2"); font-weight: 100 900; }
@font-face { font-family: "Alegreya"; src: url(${font("alegreya", "alegreya-latin-wght-normal.woff2")}) format("woff2"); font-weight: 400 900; }
html, body { margin: 0; height: 100%; }
body { background: #2e2343; color: #f7eed3; display: flex; }
main { display: flex; flex-direction: column; width: 100%; }
.caption { background: #cbc0cd; color: #2e2343; font: 600 22px/1.3 "Alegreya", Georgia, serif; padding: 22px 22px; min-height: 172px; box-sizing: border-box; display: flex; align-items: center; border-left: 1px solid #b6a9ba; }
.term { flex: 1; padding: 18px 22px; font: 13px/1.5 "SF Mono", Menlo, monospace; }
.label { font: 600 12px/1 "Archivo", system-ui, sans-serif; color: #a99cbb; margin: 0 0 18px; }
.agent { margin-bottom: 22px; }
.who { font: 700 13px/1.4 "Archivo", system-ui, sans-serif; color: #f0e4be; }
.who span { font-weight: 500; color: #a99cbb; }
.cmd { color: #a99cbb; margin-top: 6px; }
.cmd b { color: #f7eed3; font-weight: 400; }
.out { white-space: pre-wrap; color: #e8dcc0; padding: 4px 8px; margin: 2px -8px 0; border-radius: 4px; }
.out.waiting { color: #a99cbb; }
.out.fresh { background: rgba(240, 228, 190, 0.12); }
.ok { color: #8fd1a5; }
.against { color: #e7a6c2; }
</style></head><body><main></main></body></html>`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function panelHtml(p: Panel): string {
  const line = (l: string) => {
    if (/^B-\w{5} resolved\b/.test(l)) return `<span class="ok">${esc(l)}</span>`;
    if (l.startsWith("It went against your pick")) return `<span class="against">${esc(l)}</span>`;
    return esc(l);
  };
  const agents = p.agents
    .map((a) => {
      const entries = a.entries
        .map((e) => {
          const waiting = e.lines.length === 1 && e.lines[0] === "waiting for your answer…";
          return `<div class="cmd">$ <b>${esc(e.command)}</b></div><div class="out${waiting ? " waiting" : ""}${e.fresh ? " fresh" : ""}">${e.lines.map(line).join("\n")}</div>`;
        })
        .join("");
      return `<div class="agent"><div class="who">${esc(a.name)} <span>on ${esc(a.branch)}</span></div>${entries}</div>`;
    })
    .join("");
  return `<div class="caption">${esc(p.caption)}</div><div class="term"><p class="label">The agents' terminals</p>${agents}</div>`;
}

// ------------------------------------------------------------------ run

// The parts, by name; `figures` is every PNG, and nothing is everything. `drawer-data` is never run unasked: it reads this
// clone's own decision record, which differs from machine to machine.
const PARTS: Record<string, (() => Promise<void>)[]> = {
  gif: [gif],
  figures: [figures, drawer, phone],
  drawer: [drawer],
  phone: [phone],
  "drawer-data": [drawerData],
};
const what = process.argv[2];
if (what && !PARTS[what]) {
  console.error(`readme-media: say ${Object.keys(PARTS).map((p) => `\`${p}\``).join(", ")}, or nothing for the GIF and every figure`);
  process.exit(1);
}
for (const part of what ? PARTS[what]! : [...PARTS.figures!, gif]) await part();
