// Screenshots of the prototype (README "Checking it"): node design/explorations/drum/c-spin/shoot.cjs [out-dir]
// with the server running: PORT=4176 node design/explorations/drum/serve.mjs
const { chromium } = require("module").createRequire("/Users/gusellerm/Projects/baesian/package.json")("@playwright/test");
const path = require("path");
const fs = require("fs");

const URL = process.env.URL ?? "http://localhost:4176/design/explorations/drum/c-spin/";
const OUT = path.resolve(process.argv[2] ?? path.join(__dirname, "shots"));
const REDUCED = process.env.REDUCED === "1";
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: REDUCED ? "reduce" : "no-preference" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  // A clock we can stop, so the turn can be taken frame by frame, exactly 50 ms apart.
  await page.clock.install();
  await page.goto(URL);
  await page.evaluate(() => document.fonts.ready);
  await sleep(500);
  // Stop the page's clock a moment from its own now (it runs ahead of ours once it's been paused).
  const pause = async () => page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 500));
  const shot = (name, clip) => page.screenshot({ path: path.join(OUT, `${name}.png`), ...(clip ? { clip } : {}) });
  const reel = await page.locator("#reel").boundingBox();
  const drumClip = { x: reel.x, y: reel.y + 20, width: reel.width + 60, height: reel.height - 20 };
  const cx = reel.x + reel.width / 2 - 20, cy = reel.y + reel.height / 2;

  await shot("1-first-state");

  // A flick on a trackpad, on a stopped clock so the frame is exact: a burst of wheel events, then the OS's momentum
  // dying away; back through your history.
  await page.mouse.move(cx, cy);
  await pause();
  const flick = [-70, -66, -60, -52, -44, -36, -29, -22, -16, -11, -7, -4];
  for (const [k, d] of flick.entries()) {
    await page.mouse.wheel(0, d);
    await page.clock.runFor(16);
    if (k === 4) await shot("2-mid-spin");
  }
  await page.clock.runFor(900);
  await shot("3-spun-at-rest");
  // A drag, flung upward and let go: it coasts through what's next, the detents catch it.
  await page.mouse.move(cx, cy + 60);
  await page.mouse.down();
  for (let k = 1; k <= 7; k++) {
    await page.mouse.move(cx, cy + 60 - k * 26);
    await page.clock.runFor(16);
  }
  await page.mouse.up();
  await page.clock.runFor(90);
  await shot("2b-fling-coasting", drumClip);
  await page.clock.runFor(1200);
  await shot("3c-fling-at-rest", drumClip);
  // Let go: the pointer leaves, and it turns back.
  await page.mouse.move(1300, 850);
  await page.clock.runFor(2600);
  await shot("3b-turned-back", drumClip);
  await page.clock.resume();

  // The first answer, frame by frame: choose (←), then confirm (← again) on a stopped clock.
  await page.keyboard.press("ArrowLeft");
  await sleep(300);
  await pause();
  const frames = [];
  await page.keyboard.down("ArrowLeft");
  for (let k = 0; k <= 14; k++) {
    const buf = await page.screenshot({ clip: drumClip });
    frames.push({ t: k * 50, b64: buf.toString("base64") });
    await page.clock.runFor(50);
  }
  await page.keyboard.up("ArrowLeft");
  await page.clock.resume();
  await sleep(400);

  // Two more: three answers.
  for (const key of ["ArrowRight", "ArrowLeft"]) {
    const mythic = await page.evaluate(() => document.querySelector("#card").classList.contains("rarity-mythic"));
    await page.keyboard.press(key);
    await sleep(150);
    if (mythic) {
      await page.keyboard.down(key);
      await sleep(1100);
      await page.keyboard.up(key);
    } else await page.keyboard.press(key);
    await sleep(1000);
  }
  await shot("4-after-three-answers");

  // Open a row: spin back two with the keys, Enter.
  await page.locator("#reel").focus();
  await page.keyboard.press("ArrowUp");
  await sleep(250);
  await page.keyboard.press("ArrowUp");
  await sleep(500);
  await shot("5-spun-two-back");
  await page.keyboard.press("Enter");
  await sleep(900);
  await shot("6-opened-answer");
  await page.keyboard.press("Escape");
  await sleep(1000);

  // The end stop: drag hard past the first answer, and let go.
  await page.mouse.move(cx, cy - 120);
  await page.mouse.down();
  for (let k = 1; k <= 22; k++) {
    await page.mouse.move(cx, cy - 120 + k * 40);
    await sleep(12);
  }
  await shot("7-against-the-end", drumClip);
  await page.mouse.up();
  await sleep(1400);
  await shot("8-after-the-end", drumClip);

  // The strip: the turn's frames side by side.
  const strip = await browser.newPage({ viewport: { width: 1640, height: 400 }, deviceScaleFactor: 1 });
  await strip.setContent(`<body style="margin:0;background:#cbc0cd;display:flex;flex-wrap:wrap;gap:6px;padding:6px;font:600 13px system-ui;color:#2e2343">${frames
    .map((f) => `<figure style="margin:0;width:400px"><img style="width:400px;display:block" src="data:image/png;base64,${f.b64}"><figcaption>${f.t} ms</figcaption></figure>`)
    .join("")}</body>`);
  await sleep(200);
  await strip.screenshot({ path: path.join(OUT, "turn-strip.png"), fullPage: true });

  // Reduced motion: the drum still drawn; the wheel steps it a row at a time, no momentum, no smear.
  const calm = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  await calm.goto(URL);
  await calm.evaluate(() => document.fonts.ready);
  await sleep(300);
  await calm.mouse.move(cx, cy);
  await calm.mouse.wheel(0, -60);
  await sleep(300);
  await calm.screenshot({ path: path.join(OUT, "9-reduced-motion-one-step.png") });

  console.log(errors.length ? `errors:\n${errors.join("\n")}` : "no errors");
  await browser.close();
})();
