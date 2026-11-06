// The README's media, made from the real thing, by the built client in a headless browser:
//
//   docs/media/demo.gif           a run of the demo (scripts/demo.ts), answered as you would, ending on the Branches drawer
//   docs/media/branches.png       the Branches drawer over a stretch of this repo's own history, from branches.json
//   docs/media/phone.png          the demo's first card on a phone, held until it lifts
//   docs/media/*.png              each figure drawn by hand in docs/media/*.html (checkpoints.html)
//   docs/media/wordmark.png       the client's wordmark, for GitHub's light page; wordmark-dark.png for its dark one
//
// Run it with `npm run readme-media` for all of them, or name one part: `gif`, `figures` (every PNG), `drawer`,
// `phone` or `wordmark`. The GIF needs ffmpeg. `drawer-data` makes branches.json again, from this clone's decision
// record.
//
// Every still is framed alike (`framed()`): rounded corners, a soft shadow and a transparent margin, baked in, since
// GitHub has no CSS for a README's images. The GIF can't be transparent, so it sits on the client's plum: the client
// in a window, cropped to the card, beside a panel with what's going on and what each agent's terminal says. The
// panel's terminal lines are the demo's own output, so what an agent hears in the GIF is what `baesian wait` printed.

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { type Interface, createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { type Browser, type Page, chromium } from "@playwright/test";
import type { ApiCard, ApiCommit, ApiMerge, ApiState } from "../src/api.js";
import { blankRow } from "../src/report.js";
import { TODAY } from "../src/routing.js";
import type { CardMeta, GateRecord, Verdict } from "../src/schema.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MEDIA = join(ROOT, "docs", "media");
const TSX = join(ROOT, "node_modules", ".bin", "tsx");

// ------------------------------------------------------------------ the frame every still gets

/**
 * The frame baked into every still, in the still's own CSS px: a transparent margin round it, rounded corners, and a
 * soft plum shadow with a hairline edge, so a cream or lilac surface floats on GitHub's white page and on its dark one.
 * The margin holds the shadow, which falls downward.
 */
const FRAME = { top: 16, side: 20, bottom: 28, radius: 14 };
const frameShadow = (k: number) => `0 0 0 ${k}px #2e23431f, 0 ${2 * k}px ${5 * k}px #2e234326, 0 ${8 * k}px ${20 * k}px ${-6 * k}px #2e234359`;

/**
 * `png`, a screenshot taken at twice its CSS size, framed and written to `out`, still at twice its size. `scale` sizes
 * the frame for a still the README shows smaller than its own size (the phone), so every frame looks alike there.
 */
async function framed(browser: Browser, png: Buffer, out: string, o: { radius?: number; scale?: number } = {}): Promise<void> {
  const k = o.scale ?? 1;
  const [w, h] = [png.readUInt32BE(16) / 2, png.readUInt32BE(20) / 2];
  // Whole CSS px, so the still lands on whole pixels and isn't resampled.
  const m = { top: Math.round(FRAME.top * k), side: Math.round(FRAME.side * k), bottom: Math.round(FRAME.bottom * k) };
  const page = await browser.newPage({ viewport: { width: Math.ceil(w) + 2 * m.side, height: Math.ceil(h) + m.top + m.bottom }, deviceScaleFactor: 2 });
  try {
    await page.setContent(
      `<style>html, body { margin: 0; background: transparent; } img { display: block; margin: ${m.top}px ${m.side}px; width: ${w}px; height: ${h}px; border-radius: ${o.radius ?? FRAME.radius}px; box-shadow: ${frameShadow(k)}; }</style><img src="data:image/png;base64,${png.toString("base64")}">`,
    );
    await page.locator("img").evaluate((img) => (img as unknown as { decode(): Promise<void> }).decode());
    await page.screenshot({ path: out, omitBackground: true });
  } finally {
    await page.close();
  }
  console.log(`made ${out}`);
}

// ------------------------------------------------------------------ the figures

/** Each `docs/media/<name>.html` becomes `docs/media/<name>.png`, at twice its size, so it's sharp on any screen; framed. */
async function figures(): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 2 });
    for (const file of readdirSync(MEDIA).filter((f) => f.endsWith(".html"))) {
      await page.goto(pathToFileURL(join(MEDIA, file)).href);
      await page.evaluate("document.fonts.ready.then(() => true)");
      await framed(browser, await page.locator("figure").screenshot(), join(MEDIA, file.replace(/\.html$/, ".png")));
    }
  } finally {
    await browser.close();
  }
}

// ------------------------------------------------------------------ the wordmark

/**
 * `docs/media/wordmark.png` and `wordmark-dark.png`: the client's wordmark (`.wordmark` in client/src/style.css), Archivo
 * at weight 800 and 72% width, in the client's plum ink for GitHub's light page and its cream for the dark one, on
 * nothing. Its letters are `WORDMARK.width` px wide, a little under the width the README shows it at, made at twice
 * that; cropped to the ink, with `WORDMARK.pad` round it.
 */
const WORDMARK = { width: 272, pad: 4, light: "#2e2343", dark: "#f7eed3" };

async function wordmark(): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 320 }, deviceScaleFactor: 2 });
    const face = `@font-face { font-family: "Archivo Variable"; src: url(${font("archivo", "archivo-latin-wdth-normal.woff2")}) format("woff2-variations"); font-weight: 100 900; font-stretch: 62% 125%; }`;
    const draw = async (size: number, ink: string) => {
      await page.setContent(`<style>${face} html, body { margin: 0; background: transparent; } b { position: absolute; left: 40px; top: 40px; font: 800 ${size}px/1 "Archivo Variable"; font-stretch: 72%; color: ${ink}; }</style><b>Baesian</b>`);
      await page.evaluate("document.fonts.ready.then(() => true)");
      return inkBox(page, await page.screenshot({ omitBackground: true }));
    };
    // Measured at 100 px, then set at the size that makes its letters `WORDMARK.width` wide.
    const at100 = await draw(100, WORDMARK.light);
    const size = (100 * WORDMARK.width) / at100.width;
    for (const [file, ink] of [["wordmark.png", WORDMARK.light], ["wordmark-dark.png", WORDMARK.dark]] as const) {
      const box = await draw(size, ink);
      const p = WORDMARK.pad;
      const clip = { x: Math.floor(box.x) - p, y: Math.floor(box.y) - p, width: Math.ceil(box.x + box.width) - Math.floor(box.x) + 2 * p, height: Math.ceil(box.y + box.height) - Math.floor(box.y) + 2 * p };
      const out = join(MEDIA, file);
      await page.screenshot({ path: out, omitBackground: true, clip });
      console.log(`made ${out}`);
    }
  } finally {
    await browser.close();
  }
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where the ink is in `png`, a screenshot of `page` on nothing, in the page's CSS px: the box round every pixel not clear. */
function inkBox(page: Page, png: Buffer): Promise<Box> {
  // In the page, as text: this script's own types have no DOM.
  return page.evaluate(`(async (b64) => {
    const bmp = await createImageBitmap(await (await fetch("data:image/png;base64," + b64)).blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height).getContext("2d");
    c.drawImage(bmp, 0, 0);
    const { data, width, height } = c.getImageData(0, 0, bmp.width, bmp.height);
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (data[(y * width + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const k = devicePixelRatio;
    return { x: x0 / k, y: y0 / k, width: (x1 + 1 - x0) / k, height: (y1 + 1 - y0) / k };
  })(${JSON.stringify(png.toString("base64"))})`);
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
 * The drawer's width in `docs/media/branches.png`, as its handle would set it: wide, so each row is on one line, and
 * about 1.55 times as wide as its title and graph down to the opened card are tall. Wider would bring it nearer 1.6, but
 * GitHub's 946 px column would show it smaller than its own size.
 */
const DRAWER_WIDTH = 920;

/**
 * `docs/media/branches.png`: the Branches drawer, `DRAWER_WIDTH` wide, over the window of this repo's history in
 * `branches.json`, drawn by the built client at the window's end, in its time zone. One card is picked
 * (`HISTORY.pick`), so its detail lists the commits citing it. The list is scrolled past the drawer's head (the summary,
 * the filters, Go to and the keys), as you'd scroll it, so the day's heading sticks under the title; cropped to the
 * drawer, less the grip on its edge, from its title down to the opened card's detail, and framed.
 */
async function drawer(): Promise<void> {
  const h = JSON.parse(readFileSync(HISTORY.file, "utf8")) as History;
  const browser = await chromium.launch();
  try {
    // As wide as the drawer can be `DRAWER_WIDTH` wide beside the desk.
    const page = await browser.newPage({ viewport: { width: DRAWER_WIDTH + 520, height: 1040 }, deviceScaleFactor: 2, timezoneId: h.timeZone, locale: "en-GB", reducedMotion: "reduce" });
    await page.clock.setFixedTime(new Date(h.now));
    await serveState(page, historyState(h));
    // No preference file, so the client would first offer the setup survey (B-5na1k): this is about the drawer. Its
    // width is the one its handle keeps.
    await page.addInitScript((w) => {
      localStorage.setItem("baesian:baesian:setup", "true");
      localStorage.setItem("baesian:drawer-width", String(w));
    }, DRAWER_WIDTH);
    await page.goto(ORIGIN);
    await page.locator("main.desk").waitFor();
    await page.evaluate("document.fonts.ready.then(() => true)");
    await page.addStyleTag({ content: ".drawer-grip { display: none; }" });
    await page.getByRole("button", { name: /^Branches/ }).click();
    const d = page.getByRole("dialog", { name: "Your decisions, by branch" });
    await d.locator(`[data-row="card:${HISTORY.pick}"]`).click();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    // The day's heading to the top of the list, where it sticks; the rows run on below it.
    await d.locator(".drawer-scroll").evaluate((el) => {
      const day = el.querySelector(".br-row.is-day");
      if (day) el.scrollTop += day.getBoundingClientRect().top - el.getBoundingClientRect().top;
    });
    await page.waitForTimeout(100);
    const box = (await d.boundingBox())!;
    const detail = (await d.locator(".br-row.is-detail").boundingBox())!;
    const clip = { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(detail.y + detail.height + 10 - box.y) };
    await framed(browser, await page.screenshot({ clip }), join(MEDIA, "branches.png"));
  } finally {
    await browser.close();
  }
}

// ------------------------------------------------------------------ the GIF

const FPS = 10;
/**
 * The GIF as the README shows it, in CSS px: 700 wide, about 74% of GitHub's README column, beside the phone, and as
 * tall as its 1.65:1 makes it. It's made at `GIF_SCALE` times that, so it's sharp on a retina screen.
 */
const SHOWN = { width: 700, height: 424 };
const GIF_SCALE = 2;
/**
 * The client's window in the GIF, in shown px: its inset from the GIF's edges, all round, its corners, and the card's
 * share of the GIF's width. The panel takes the rest, beside it, `gap` from it.
 */
const WINDOW = { inset: 8, gap: 10, radius: 10, card: 0.58 };
/**
 * The client's viewport, in its own px, captured at `scale` times that: as wide as puts a card about 580 px wide beside
 * the desk's path. Its height is set from the card, to the crop's foot: a card's reveal runs below it, and is scrolled to.
 */
const CLIENT = { width: 960, height: 800, scale: 2 };
/** Around the card in the crop, in the client's px: a little of the desk each side, and its deck's name above. */
const AROUND = { side: 12, top: 12 };
/** And around the drawer, at the end: a little of the desk to its left, under its veil. */
const AROUND_DRAWER = 16;
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

/** What the GIF's window shows, in the client's CSS px: the card while you answer, then the drawer from `at` on. */
interface Cut {
  at: number;
  card: Box;
  drawer: Box;
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

    const client = await (await browser.newContext({ viewport: { width: CLIENT.width, height: CLIENT.height }, deviceScaleFactor: CLIENT.scale })).newPage();
    await skipOffers(client);
    await client.goto(url);
    await client.waitForSelector(".opt");
    await client.evaluate("document.fonts.ready.then(() => true)");

    // The window: the card at `WINDOW.card` of the GIF's width, its deck's name above it, a little desk each side; the
    // client's viewport ends at the window's foot, so a reveal that runs below it is scrolled to, as on a short screen.
    const card = (await client.locator(LIVE).boundingBox())!;
    const crumbs = (await client.locator(".crumbs").first().boundingBox())!;
    const shown = (WINDOW.card * SHOWN.width) / card.width;
    const win = { width: Math.round((card.width + 2 * AROUND.side) * shown * GIF_SCALE) / GIF_SCALE, height: SHOWN.height - 2 * WINDOW.inset };
    const ofWindow = (x: number, y: number, width: number): Box => ({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round((width * win.height) / win.width) });
    const cardCrop = ofWindow(card.x - AROUND.side, crumbs.y - AROUND.top, card.width + 2 * AROUND.side);
    await client.setViewportSize({ width: CLIENT.width, height: cardCrop.y + cardCrop.height });

    const side = await (await browser.newContext({ viewport: SHOWN, deviceScaleFactor: GIF_SCALE })).newPage();
    await side.setContent(panelPage(win.width));
    const frames = join(work, "frames");
    mkdirSync(frames);
    const shots: Shot[] = [];
    let n = 0;
    const drawPanel = async () => {
      // A terminal that fills scrolls, as one does: its latest lines stay in view.
      await side.locator("main").evaluate((el, html) => {
        el.innerHTML = html;
        const term = el.querySelector(".term");
        if (term) term.scrollTop = term.scrollHeight;
      }, panelHtml(panel));
      const file = join(frames, `side-${String(n++).padStart(5, "0")}.png`);
      await side.screenshot({ path: file, omitBackground: true });
      shots.push({ t: Date.now(), file, side: true });
    };
    watchDemo(out, panel, () => void drawPanel());

    await drawPanel();
    const stop = await record(client, frames, shots);
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
      await client.waitForTimeout(2200);
      // The reveal runs below the window: down to its foot, where you confirm.
      await scrollDesk(client, "foot");
      await client.waitForTimeout(1600);
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
      await scrollDesk(client, "top");
      if (i === 0) {
        await caption("Your answer goes to the agent once the five seconds to undo it are up.");
        await client.waitForTimeout(3800);
      } else await client.waitForTimeout(600);
    }
    await caption("When you overrule an agent, it may reply once, with a fact you lacked. Not its pick again.");
    await waitFor(() => panel.agents[1]!.entries[0]!.lines.length > 1, 15_000);
    await client.waitForTimeout(4500);
    // The answers by branch, in the Branches drawer (B): each branch's merge is held while a card on it waits. The
    // window cuts to the drawer as it opens.
    await caption("Every answer is stored in git, by branch. A branch's merge is held while a card on it waits for you.");
    await client.waitForTimeout(700);
    const at = Date.now();
    await client.keyboard.press("b");
    await client.waitForTimeout(4800);
    const drawer = (await client.locator(".drawer").boundingBox())!;
    await stop();
    await encode(work, shots, start, Date.now(), { at, card: cardCrop, drawer: ofWindow(drawer.x - AROUND_DRAWER, 0, drawer.width + AROUND_DRAWER) }, win);
  } finally {
    await browser.close();
    await stopDemo(demo);
    rmSync(work, { recursive: true, force: true });
  }
}

/** The desk scrolled, as you'd scroll it on a short screen: down to the card's foot, or back to its top. */
const scrollDesk = (page: Page, to: "foot" | "top") => page.locator(".desk").evaluate((el, foot) => el.scrollTo({ top: foot ? el.scrollHeight : 0, behavior: "smooth" }), to === "foot");

// ------------------------------------------------------------------ the phone

/**
 * `docs/media/phone.png`: the demo's first card on a phone, 390×844, held until it lifts (B-yfehp), with its four
 * answers named at the screen's edges. The finger is Chromium's own touch events, as the phone's browser tests send them.
 * Framed like the other stills, with a phone's rounder corners, and the frame sized up by `PHONE.frame`, since the README
 * shows the phone at about half its size.
 */
const PHONE = { width: 390, height: 844, radius: 36, frame: 1.8 };

async function phone(): Promise<void> {
  const work = mkdtempSync(join(tmpdir(), "baesian-media-"));
  const demo = startDemo(work);
  const browser = await chromium.launch();
  try {
    const { url } = await started(demo, createInterface({ input: demo.stdout! }));
    const page = await browser.newPage({ viewport: { width: PHONE.width, height: PHONE.height }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
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
    const png = await page.screenshot();
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await framed(browser, png, join(MEDIA, "phone.png"), { radius: PHONE.radius, scale: PHONE.frame });
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

/** A frame of the client or of the panel, and when it was made. */
interface Shot {
  t: number;
  file: string;
  side: boolean;
}

/**
 * Record the client, a screenshot every tick, with each one's time, at its full scale: the browser's own screencast
 * sends its frames at the page's CSS size, half as sharp. A screenshot takes well under a tick.
 */
async function record(page: Page, dir: string, shots: Shot[]): Promise<() => Promise<void>> {
  let on = true;
  let n = 0;
  const loop = (async () => {
    while (on) {
      const t = Date.now();
      const file = join(dir, `client-${String(n++).padStart(5, "0")}.jpg`);
      await page.screenshot({ path: file, type: "jpeg", quality: 95 });
      shots.push({ t, file, side: false });
      await new Promise((r) => setTimeout(r, Math.max(0, t + 1000 / FPS - Date.now())));
    }
  })();
  return async () => {
    on = false;
    await loop;
  };
}

/**
 * Lay the frames out at a steady rate, the latest of each side at every tick, and make the GIF: the client cropped to
 * the card, then to the drawer from the moment it's opened, scaled into its window on the plum, and the panel over it.
 */
async function encode(work: string, shots: Shot[], start: number, end: number, cut: Cut, win: { width: number; height: number }): Promise<void> {
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
  const px = (n: number) => Math.round(n * CLIENT.scale);
  const crop = (b: Box) => `crop=${px(b.width)}:${px(b.height)}:${px(b.x)}:${px(b.y)}`;
  const fit = `scale=${win.width * GIF_SCALE}:${win.height * GIF_SCALE}:flags=lanczos,setsar=1,format=rgb24`;
  const at = Math.round(((cut.at - start) / 1000) * FPS);
  const inset = WINDOW.inset * GIF_SCALE;
  const filter = [
    "[0]split[a][b]",
    `[a]trim=end_frame=${at},${crop(cut.card)},${fit}[card]`,
    `[b]trim=start_frame=${at},setpts=PTS-STARTPTS,${crop(cut.drawer)},${fit}[drawer]`,
    `[card][drawer]concat=n=2:v=1:a=0,pad=${SHOWN.width * GIF_SCALE}:${SHOWN.height * GIF_SCALE}:${inset}:${inset}:color=0x2e2343[client]`,
    "[client][1]overlay=0:0:format=rgb,split[a2][b2]",
    `[a2]palettegen=max_colors=${PALETTE.colors}:stats_mode=${PALETTE.stats}[p]`,
    `[b2][p]paletteuse=${PALETTE.dither}:diff_mode=rectangle`,
  ].join(";");
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(FPS), "-i", join(seq.client, "%05d.jpg"), "-framerate", String(FPS), "-i", join(seq.side, "%05d.png"), "-filter_complex", filter, "-loop", "0", out], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg couldn't make the GIF");
  console.log(`made ${out} (${ticks} frames, ${(ticks / FPS).toFixed(1)} s, ${(readFileSync(out).length / 1e6).toFixed(1)} MB)`);
}

/** The GIF's colours: one palette from the whole run, undithered: text stays crisp, frames that don't change cost nothing. */
const PALETTE = { colors: 128, stats: "full", dither: "dither=none" };

// ------------------------------------------------------------------ the panel beside the client

const font = (pkg: string, file: string) => `data:font/woff2;base64,${readFileSync(join(ROOT, "node_modules", "@fontsource-variable", pkg, "files", file)).toString("base64")}`;

/**
 * The GIF's ground, the size it's shown at: the client's plum, with a window in it, `win` wide, where the client shows
 * through, and beside it the panel: the caption in the client's lilac, and the agents' terminals.
 */
function panelPage(win: number): string {
  return `<!doctype html><html><head><style>
@font-face { font-family: "Archivo"; src: url(${font("archivo", "archivo-latin-wdth-normal.woff2")}) format("woff2-variations"); font-weight: 100 900; font-stretch: 62% 125%; }
@font-face { font-family: "Alegreya"; src: url(${font("alegreya", "alegreya-latin-wght-normal.woff2")}) format("woff2"); font-weight: 400 900; }
* { box-sizing: border-box; }
html, body { margin: 0; width: ${SHOWN.width}px; height: ${SHOWN.height}px; overflow: hidden; background: transparent; }
.window { position: absolute; left: ${WINDOW.inset}px; top: ${WINDOW.inset}px; width: ${win}px; height: ${SHOWN.height - 2 * WINDOW.inset}px; border-radius: ${WINDOW.radius}px; box-shadow: 0 0 0 ${SHOWN.width}px #2e2343; }
main { position: absolute; left: ${WINDOW.inset + win + WINDOW.gap}px; right: ${WINDOW.inset}px; top: ${WINDOW.inset}px; bottom: ${WINDOW.inset}px; display: flex; flex-direction: column; gap: 10px; color: #f7eed3; }
.caption { flex: 0 0 auto; min-height: 84px; display: flex; align-items: center; padding: 10px 13px; border-radius: 8px; background: #d9d0da; color: #2e2343; font: 600 15.5px/1.3 "Alegreya", Georgia, serif; }
.term { flex: 1 1 auto; min-height: 0; overflow: hidden; padding: 0 5px; font: 10px/1.36 "SF Mono", Menlo, monospace; }
.label { margin: 0 0 8px; font: 600 10.5px/1 "Archivo", system-ui, sans-serif; font-stretch: 90%; color: #a99cbb; }
.agent + .agent { margin-top: 12px; }
.who { font: 700 11.5px/1.4 "Archivo", system-ui, sans-serif; font-stretch: 90%; color: #f0e4be; }
.who span { font-weight: 500; color: #a99cbb; }
.cmd { color: #a99cbb; margin-top: 4px; }
.cmd b { color: #f7eed3; font-weight: 400; }
.out { white-space: pre-wrap; color: #e8dcc0; padding: 1px 5px; margin: 1px -5px 0; border-radius: 3px; }
.out.waiting { color: #a99cbb; }
.out.fresh { background: rgba(240, 228, 190, 0.12); }
.ok { color: #8fd1a5; }
.against { color: #e7a6c2; }
</style></head><body><div class="window"></div><main></main></body></html>`;
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
  figures: [figures, drawer, phone, wordmark],
  drawer: [drawer],
  phone: [phone],
  wordmark: [wordmark],
  "drawer-data": [drawerData],
};
const what = process.argv[2];
if (what && !PARTS[what]) {
  console.error(`readme-media: say ${Object.keys(PARTS).map((p) => `\`${p}\``).join(", ")}, or nothing for the GIF and every figure`);
  process.exit(1);
}
for (const part of what ? PARTS[what]! : [...PARTS.figures!, gif]) await part();
