import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderDoc } from "../src/frontmatter.js";
import { Store } from "../src/store.js";

// Tests never pop OS notifications, and never read the developer's own ~/.config/baesian.
process.env.BAESIAN_OS_NOTIFY = "0";
process.env.BAESIAN_CONFIG = "/nonexistent/baesian-test-config.json";

const made: string[] = [];

/** A clock for `wait`: `sleep` advances time instantly, and runs `at(ms, fn)` hooks when their time comes. */
export function fakeClock(start = Date.parse("2026-10-23T12:00:00.000Z")) {
  let t = start;
  const hooks: { at: number; fn: () => void; done: boolean }[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
      for (const h of hooks) {
        if (!h.done && t >= h.at) {
          h.done = true;
          h.fn();
        }
      }
    },
    at(offsetMs: number, fn: () => void) {
      hooks.push({ at: start + offsetMs, fn, done: false });
    },
    iso: (offsetMs = 0) => new Date(start + offsetMs).toISOString(),
    elapsed: () => t - start,
  };
}

export function sh(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "user.name=t", "-c", "user.email=t@t", ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** A fresh repository with one commit, and Baesian initialised. */
export function repo(): { dir: string; store: Store } {
  const dir = realpathSync(mkdtempSync(join(process.env.BAESIAN_TEST_TMP ?? tmpdir(), "baesian-test-")));
  made.push(dir);
  sh(dir, "init", "-q", "-b", "main");
  sh(dir, "commit", "-q", "--allow-empty", "-m", "init");
  const store = Store.open(dir);
  store.init();
  return { dir, store };
}

/** A linked worktree of `dir` on a new branch. */
export function worktree(dir: string, branch: string): { dir: string; store: Store } {
  const wt = `${dir}-${branch.replace(/\W+/g, "-")}`;
  made.push(wt);
  sh(dir, "worktree", "add", "-q", "-b", branch, wt);
  return { dir: wt, store: Store.open(wt) };
}

export function cleanup(): void {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
}

/** A card's body is optional context (D92). */
export const BODY = ["Postgres is available but adds an ops dependency.", ""].join("\n");

export function draft(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: "The run-metadata store",
    question: "Which store should hold run metadata?",
    doing: "writing the run-metadata layer",
    topic: "storage/run-metadata",
    touches: ["schema", "dependency"],
    reverse: "moderate",
    proposal: "SQLite (WAL mode)",
    proposal_then: "runs are recorded in one file next to the repo",
    alternative: "Postgres",
    alternative_then: "runs go to a database server that has to be running",
    also_considered: ["Parquet files"],
    crux: "Will more than one machine write runs at once?",
    crux_proposal: "If not",
    crux_alternative: "If so",
    ...overrides,
  };
}

export function draftFile(overrides: Record<string, unknown> = {}, body = BODY): string {
  return renderDoc(draft(overrides), body);
}

export const REVIEWER = { reviewer: "gus", client: "test" };
