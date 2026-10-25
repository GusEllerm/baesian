#!/usr/bin/env node
// D84's premise: that Node's own recursive fs.watch reports every new file in the live layer's nested folders, on
// macOS and Linux. Several writer processes create files the way the store does (mkdir -p, then an exclusive
// create), in bursts, into an empty live layer, while one watcher records every path it hears. A file the watcher
// never names is a miss. This is a check to run by hand, not part of the test suite.
//
//   node test/premises/watch.mjs
//   docker run --rm -v "$PWD/test/premises:/check:ro" node:22 node /check/watch.mjs
//
// In Docker, the watcher and the writers share the container's own filesystem: events don't cross a bind mount.
import { fork } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, watch, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const WRITERS = 4, TRIALS = 5, WARMUP_MS = 500, SETTLE_MS = 2000;
const range = (n) => Array.from({ length: n }, (_, i) => i);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Each scenario lists the files one writer creates (or rewrites), relative to the live layer: 1,000 files in all.
const SCENARIOS = {
  "flat: verdicts into an existing folder": { pre: ["verdicts"], files: (w) => range(250).map((i) => `verdicts/V-${w}-${i}.json`) },
  "a new folder per card, two files each": { pre: [], files: (w) => range(125).flatMap((i) => [`cards/B-${w}-${i}/card.md`, `cards/B-${w}-${i}/attach-1.json`]) },
  "new folders three deep": { pre: [], files: (w) => range(250).map((i) => `deep/d${w}/x${i % 10}/y${i}/f.json`) },
  // Cursors and heartbeats are rewritten in place, so a change to an existing file must be heard too.
  "rewrites of existing files": { pre: [], prefill: true, files: (w) => range(250).map((i) => `cursors/c${w}/r${i}.json`) },
};

if (process.argv[2] === "write") {
  const [, , , root, name, w] = process.argv;
  const s = SCENARIOS[name];
  for (const rel of s.files(Number(w))) {
    const path = join(root, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, s.prefill ? `{"n":2}\n` : "{}\n", { flag: s.prefill ? "w" : "wx" });
  }
  process.exit(0);
}

async function trial(name, s) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "baesian-watch-")));
  for (const d of s.pre) mkdirSync(join(root, d), { recursive: true });
  if (s.prefill) for (const rel of range(WRITERS).flatMap((w) => s.files(w))) { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), "{}\n"); }
  const heard = new Set();
  let nulls = 0, last = 0;
  const watcher = watch(root, { recursive: true }, (_type, f) => {
    last = performance.now();
    if (f == null) nulls++;
    else heard.add(String(f).split(sep).join("/"));
  });
  await sleep(WARMUP_MS);
  const start = performance.now();
  await Promise.all(range(WRITERS).map((w) => new Promise((resolve, reject) => {
    fork(SELF, ["write", root, name, String(w)]).on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`writer ${w} exited with ${code}`))));
  })));
  const done = performance.now();
  await sleep(SETTLE_MS);
  watcher.close();
  rmSync(root, { recursive: true, force: true });
  const expected = range(WRITERS).flatMap((w) => s.files(w));
  const missed = expected.filter((f) => !heard.has(f));
  return { files: expected.length, missed: missed.length, sample: missed.slice(0, 3), nulls, writeMs: done - start, tailMs: Math.max(0, last - done) };
}

let limit = "";
try { limit = `, inotify max_user_watches ${readFileSync("/proc/sys/fs/inotify/max_user_watches", "utf8").trim()}`; } catch {}
console.log(`${process.platform} ${process.arch}, Node ${process.version}${limit}; ${WRITERS} writers, ${TRIALS} trials each`);
let total = 0;
for (const [name, s] of Object.entries(SCENARIOS)) {
  const rs = [];
  for (let t = 0; t < TRIALS; t++) rs.push(await trial(name, s));
  const missed = rs.map((r) => r.missed);
  total += missed.reduce((a, b) => a + b, 0);
  console.log(`- ${name}: ${rs[0].files} files a trial; missed ${missed.join(", ")}; null filenames ${rs.reduce((a, r) => a + r.nulls, 0)}; ` +
    `writing took ${Math.round(Math.max(...rs.map((r) => r.writeMs)))} ms at most; last event up to ${Math.round(Math.max(...rs.map((r) => r.tailMs)))} ms after the writes`);
  const sample = rs.flatMap((r) => r.sample).slice(0, 3);
  if (sample.length) console.log(`  for example: ${sample.join(", ")}`);
}
console.log(total ? `MISSED ${total} files: the premise fails here` : "No misses: the premise holds here");
process.exit(total ? 1 : 0);
