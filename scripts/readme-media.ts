// The README's media, made from the real thing: `docs/media/demo.gif`, recorded from a run of the demo (scripts/
// demo.ts) in a headless browser, and the figures in `docs/media/*.html`, rendered to PNG. Run it with
// `npm run readme-media`, or `npm run readme-media -- gif` or `-- figures` for one of them. The GIF needs ffmpeg.
//
// The GIF puts two things side by side: the client, as you'd answer in it, and a panel with what's going on and
// what each agent's terminal says. The panel's terminal lines are the demo's own output, so what an agent hears in
// the GIF is what `baesian wait` printed.

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { type Interface, createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { type Page, chromium } from "@playwright/test";

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

// ------------------------------------------------------------------ the GIF

const FPS = 12;
const CLIENT = { width: 1280, height: 800 };
const PANEL = { width: 460, height: 800 };
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
  const demo = spawn(TSX, [join(ROOT, "scripts", "demo.ts"), join(work, "repo"), "--no-open"], { cwd: ROOT, stdio: ["pipe", "pipe", "inherit"] });
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
    await client.waitForSelector("article.card");
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
      await client.waitForTimeout(600);
      if (i === 0) {
        await caption("Your answer joins your path. It goes to the agent once the five seconds to undo it are up.");
        await client.waitForTimeout(3500);
      }
    }
    await caption("When you overrule an agent, it may reply once, with a fact you lacked. Not its pick again.");
    await waitFor(() => panel.agents[1]!.entries[0]!.lines.length > 1, 15_000);
    await client.waitForTimeout(4500);
    await caption("Every answer is stored in git, beside the code it decides.");
    await client.waitForTimeout(3500);
    await stop();
    await encode(work, shots, start, Date.now());
  } finally {
    await browser.close();
    if (demo.exitCode === null) {
      demo.kill("SIGINT");
      await new Promise((done) => demo.once("close", done));
    }
    rmSync(work, { recursive: true, force: true });
  }
}

const LIVE = "article.card:not([data-leaving])";

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
  const width = Math.round((CLIENT.width + PANEL.width) * 0.75);
  const filter = `[0][1]hstack=inputs=2,scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
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
.caption { background: #cbc0cd; color: #2e2343; font: 600 22px/1.3 "Alegreya", Georgia, serif; padding: 26px 28px; min-height: 120px; display: flex; align-items: center; border-left: 1px solid #b6a9ba; }
.term { flex: 1; padding: 20px 22px; font: 13px/1.5 "SF Mono", Menlo, monospace; }
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

const what = process.argv[2];
if (what && what !== "gif" && what !== "figures") {
  console.error("readme-media: say `gif` or `figures`, or nothing for both");
  process.exit(1);
}
if (what !== "gif") await figures();
if (what !== "figures") await gif();
