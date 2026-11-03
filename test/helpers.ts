import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "vitest";
import { renderDoc } from "../src/frontmatter.js";
import { MemoryStorage } from "../src/storage.js";
import { Store, type StorageOptions } from "../src/store.js";

// Tests never pop OS notifications, and never read the developer's own ~/.config/baesian.
process.env.BAESIAN_OS_NOTIFY = "0";
process.env.BAESIAN_CONFIG = "/nonexistent/baesian-test-config.json";
// Nor keys pinned in a CI that runs them (D142): a test that wants them sets them itself.
delete process.env.BAESIAN_TRUST;
delete process.env.BAESIAN_TRUST_FILE;

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

/**
 * A store with no repo and no record, over memory (B-0ag7h): the relay's store, with memory standing in for its Durable
 * Object's table. It files on `main`, as `repo()`'s store does.
 */
export function memory(options: Partial<StorageOptions> = {}): { store: Store; storage: MemoryStorage } {
  const storage = new MemoryStorage();
  return { store: Store.over(storage, { branch: "main", ...options }), storage };
}

/** A test in a layer's suite: vitest's own `it`, or one that runs its body where the layer's storage lives. */
export type LayerIt = (name: string, fn: () => unknown) => void;

/**
 * The kinds of storage the store runs over (B-0ag7h), for tests that hold for each: a repo's folder, and memory. Each
 * gives a store, and the `it` its tests run with. The relay's tests run the same suites over its Durable Object's SQLite,
 * in workerd, putting their own layer here (service/test/store-suite.test.ts): a test there runs inside the object.
 */
export const LAYERS: [string, () => { store: Store }, LayerIt][] = [
  ["a repo's folder", () => repo(), it],
  ["memory, with no repo", () => memory(), it],
];

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
