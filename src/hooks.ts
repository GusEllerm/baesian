import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { describeReport, detectStaged, evaluate, verdictsSinceLastCommit } from "./gate.js";
import { git } from "./git.js";
import { stagedSnapshot } from "./facts.js";
import { type Store } from "./store.js";
import { parseTrailers } from "./trailers.js";

// D54: Baesian's hooks are a marked block inside whatever hook files the repo already uses, placed
// right after the shebang, because livedocs' pre-commit ends in `exec`.

export const HOOKS = ["pre-commit", "commit-msg", "post-commit"] as const;
export type HookName = (typeof HOOKS)[number];

const BEGIN = "# >>> baesian >>>";
const END = "# <<< baesian <<<";

function sq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** The marked block for one hook. `fallback` is the command line used when `baesian` isn't on PATH (D48). */
export function hookBlock(name: HookName, fallback: readonly string[]): string {
  const args = name === "commit-msg" ? ` ${name} "$1"` : ` ${name}`;
  const fb = fallback.map(sq).join(" ");
  const fbFile = fallback.at(-1) ?? "";
  // post-commit can't stop a commit; it only records the ledger, so a missing binary is skipped quietly.
  const missing =
    name === "post-commit"
      ? "  :"
      : `  echo "baesian: not on PATH; install it (npm i -g baesian) or commit with --no-verify (CI runs the same check)." >&2\n  exit 1`;
  return [
    BEGIN,
    "# Baesian's commit gate (D54). Managed by `baesian init`: edit outside the markers.",
    "if command -v baesian >/dev/null 2>&1; then",
    `  baesian hook${args} || exit $?`,
    ...(fallback.length ? [`elif [ -e ${sq(fbFile)} ]; then`, `  ${fb} hook${args} || exit $?`] : []),
    "else",
    missing,
    "fi",
    END,
  ].join("\n");
}

/** Insert or refresh the block in one hook file. */
export function writeHook(path: string, block: string): "created" | "inserted" | "updated" | "unchanged" {
  if (!existsSync(path)) {
    writeFileSync(path, `#!/bin/sh\n${block}\n`);
    chmodSync(path, 0o755);
    return "created";
  }
  const text = readFileSync(path, "utf8");
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  let next: string;
  let result: "inserted" | "updated";
  if (start >= 0 && end > start) {
    next = text.slice(0, start) + block + text.slice(end + END.length);
    result = "updated";
  } else {
    const lines = text.split("\n");
    if (lines[0]?.startsWith("#!")) next = [lines[0], block, ...lines.slice(1)].join("\n");
    else next = ["#!/bin/sh", block, ...lines].join("\n");
    result = "inserted";
  }
  if (next === text) return "unchanged";
  writeFileSync(path, next);
  chmodSync(path, 0o755);
  return result;
}

export interface InstallResult {
  dir: string;
  versioned: boolean;
  /** Set when Baesian pointed `core.hooksPath` at a new `.githooks/`. */
  setHooksPath: boolean;
  files: Record<HookName, ReturnType<typeof writeHook>>;
}

/**
 * Install into the hooks directory git actually uses. With no `core.hooksPath`, create a versioned
 * `.githooks/` and point git at it, as livedocs does (D14), unless `.git/hooks` already holds real
 * hooks, which switching would silently disable; then install there and say it isn't versioned.
 */
export function installHooks(store: Store, fallback: readonly string[]): InstallResult {
  const top = store.repo.toplevel;
  let dir = git(top, ["rev-parse", "--git-path", "hooks"]);
  if (!isAbsolute(dir)) dir = join(top, dir);
  const inGitDir = !relative(store.repo.commonDir, dir).startsWith("..");
  let setHooksPath = false;
  if (inGitDir) {
    const real = existsSync(dir) ? readdirSync(dir).filter((f) => !f.endsWith(".sample")) : [];
    if (real.length === 0) {
      dir = join(top, ".githooks");
      execFileSync("git", ["config", "core.hooksPath", ".githooks"], { cwd: top });
      setHooksPath = true;
    }
  }
  mkdirSync(dir, { recursive: true });
  const files = {} as InstallResult["files"];
  for (const name of HOOKS) files[name] = writeHook(join(dir, name), hookBlock(name, fallback));
  return { dir, versioned: !relative(top, dir).startsWith(".."), setHooksPath, files };
}

export interface HookIo {
  out: (line: string) => void;
  err: (line: string) => void;
}

function mergeInProgress(store: Store): boolean {
  try {
    git(store.repo.toplevel, ["rev-parse", "-q", "--verify", "MERGE_HEAD"]);
    return true;
  } catch {
    return false;
  }
}

/** Run one hook. Returns the exit code git sees. A repo without Baesian set up is never blocked. */
export function runHook(store: Store, name: string, args: string[], io: HookIo): number {
  if (!store.isInitialised()) return 0;
  const top = store.repo.toplevel;
  switch (name) {
    case "pre-commit": {
      // D37: bring the record up to date, then stage all of it. Staging only what this hook copied
      // would miss the cards `baesian file` wrote into the record when they were filed.
      store.syncRecord();
      if (!existsSync(store.record)) return 0;
      const rel = relative(top, store.record);
      const pending = git(top, ["status", "--porcelain", "--untracked-files=all", "--", rel]).split("\n").filter(Boolean);
      if (pending.length) {
        execFileSync("git", ["add", "--", rel], { cwd: top });
        io.err(`baesian: staged ${pending.length} record file${pending.length === 1 ? "" : "s"} (${rel}/)`);
      }
      return 0;
    }
    case "commit-msg": {
      const file = args[0];
      if (!file) {
        io.err("baesian: the commit-msg hook needs the message file");
        return 1;
      }
      // Merge commits bring in commits that were each checked; CI checks them again (M3b).
      if (mergeInProgress(store)) return 0;
      const trailers = parseTrailers(readFileSync(isAbsolute(file) ? file : join(top, file), "utf8"), top);
      const report = evaluate(store, detectStaged(store, stagedSnapshot(top)), trailers);
      for (const line of describeReport(report, verdictsSinceLastCommit(store))) io.err(line);
      return report.ok ? 0 : 1;
    }
    case "post-commit": {
      // D15: the ledger. Which commits build on which cards.
      const message = git(top, ["log", "-1", "--format=%B", "HEAD"]);
      const sha = git(top, ["rev-parse", "HEAD"]);
      const files = git(top, ["diff-tree", "--no-commit-id", "--name-only", "-r", "--root", "HEAD"])
        .split("\n")
        .filter(Boolean);
      for (const id of parseTrailers(message, top).cards) {
        if (!store.card(id)) continue;
        const body = `Commit \`${sha.slice(0, 12)}\` builds on ${id}.\n\n## Changed\n\n${files.map((f) => `- \`${f}\``).join("\n")}\n`;
        store.writeLedger(id, { commit: sha }, body);
      }
      return 0;
    }
    default:
      io.err(`baesian: unknown hook "${name}"`);
      return 1;
  }
}
