import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderDoc } from "../src/frontmatter.js";
import { Store } from "../src/store.js";

const made: string[] = [];

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

export const BODY = [
  "## Context",
  "Postgres is available but adds an ops dependency.",
  "",
  "## Recommendation",
  "SQLite in WAL mode.",
  "",
  "## Strongest alternative",
  "Parquet files: the analysis step is all columnar scans.",
  "",
].join("\n");

export function draft(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: "Use SQLite for the run-metadata store?",
    proposal: "SQLite (WAL mode)",
    alternatives: ["Postgres", "Parquet files"],
    topic: "storage/run-metadata",
    touches: ["schema", "dependency"],
    ...overrides,
  };
}

export function draftFile(overrides: Record<string, unknown> = {}, body = BODY): string {
  return renderDoc(draft(overrides), body);
}

export const REVIEWER = { reviewer: "gus" };
