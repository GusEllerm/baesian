import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { describeReport, detectStaged, evaluate, verdictsSinceLastCommit } from "./gate.js";
import { git } from "./git.js";
import { stagedSnapshot } from "./facts.js";
import { BEGIN, END, FALLBACK_KEY, HOOKS, type HookName, NEW_HOOK, hookBlock } from "./hookblock.js";
import { type Store } from "./store.js";
import { parseTrailers } from "./trailers.js";
import { DECISIONS, type PlannedNote, RULES, vaultOf, writeNotes } from "./vault.js";

// Baesian's hooks (D54) are installed here; their block's text is in src/hookblock.ts.

export { FALLBACK_KEY, HOOKS, type HookName, hookBlock } from "./hookblock.js";

function sq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Record (or clear) this clone's fallback command. Local config: shared by its worktrees, never committed. */
export function setFallback(store: Store, fallback: readonly string[]): void {
  const top = store.repo.toplevel;
  if (fallback.length) {
    execFileSync("git", ["config", "--local", FALLBACK_KEY, fallback.map(sq).join(" ")], { cwd: top });
  } else {
    try {
      execFileSync("git", ["config", "--local", "--unset", FALLBACK_KEY], { cwd: top, stdio: "ignore" });
    } catch {
      // wasn't set
    }
  }
}

/** Insert or refresh the block in one hook file. */
export function writeHook(path: string, block: string): "created" | "inserted" | "updated" | "unchanged" {
  if (!existsSync(path)) {
    writeFileSync(path, NEW_HOOK(block));
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
  for (const name of HOOKS) files[name] = writeHook(join(dir, name), hookBlock(name));
  setFallback(store, fallback);
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

/** The entries in `git status` under some paths: each path, its index column (`X`; `?` when untracked) and its worktree column (`Y`). */
function recordStatus(top: string, rel: string | string[]): { x: string; y: string; path: string }[] {
  const out = execFileSync("git", ["status", "--porcelain", "-z", "--untracked-files=all", "--", ...[rel].flat()], { cwd: top, encoding: "utf8" });
  const parts = out.split("\0");
  const entries: { x: string; y: string; path: string }[] = [];
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i]!;
    if (e.length < 4) continue;
    entries.push({ x: e[0]!, y: e[1]!, path: e.slice(3) });
    if (e[0] === "R" || e[0] === "C") i++; // the old path of a rename or copy comes next
  }
  return entries;
}

/** Where pre-commit notes what it staged: this worktree's own git directory, beside its index. */
function stagedListPath(top: string): string {
  return git(top, ["rev-parse", "--path-format=absolute", "--git-path", "baesian-staged.json"]);
}

function writeStaged(top: string, paths: string[]): void {
  const path = stagedListPath(top);
  if (paths.length) writeFileSync(path, `${JSON.stringify(paths)}\n`);
  else rmSync(path, { force: true });
}

/** Unstage what pre-commit staged for a commit the gate blocked: back to the last commit's version, or out of the index. */
function unstageOurs(top: string): void {
  const path = stagedListPath(top);
  if (!existsSync(path)) return;
  const paths: string[] = JSON.parse(readFileSync(path, "utf8"));
  if (!paths.length) return;
  try {
    git(top, ["rev-parse", "-q", "--verify", "HEAD"]);
  } catch {
    // The first commit: nothing to go back to.
    git(top, ["rm", "-q", "--cached", "--ignore-unmatch", "--", ...paths]);
    return;
  }
  git(top, ["reset", "-q", "--", ...paths]);
}

/**
 * Write the vault's notes for the commit and stage them (D170). A note with changes nobody has staged is left as it
 * is: staging it would commit someone's unfinished edit. Returns the notes it staged that nobody had staged before,
 * for a blocked commit to unstage (D122). A missing vault is a warning, never a block.
 */
function stageNotes(store: Store, io: HookIo): string[] {
  const top = store.repo.toplevel;
  const v = vaultOf(store);
  if (!v) return [];
  const folders = "problem" in v ? [] : [DECISIONS, RULES].map((f) => relative(top, join(v.dir, f))).filter((f) => existsSync(join(top, f)));
  const before = new Map(folders.length ? recordStatus(top, folders).map((e) => [e.path, e]) : []);
  const unstaged = (n: PlannedNote) => {
    const e = before.get(n.path);
    return e !== undefined && e.x !== "?" && (e.y === "M" || e.y === "T");
  };
  // A note's unstaged change is Baesian's own when bringing the index's version up to date gives the same note: as
  // after a blocked commit unstaged it, or `baesian sync` extended it. Otherwise it's someone's edit.
  const ours = new Map<string, boolean>();
  const onlyOurs = (n: PlannedNote): boolean => {
    let same = ours.get(n.path);
    if (same === undefined) {
      try {
        const index = execFileSync("git", ["show", `:${n.path}`], { cwd: top, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        same = n.update(index) === n.next;
      } catch {
        same = false;
      }
      ours.set(n.path, same);
    }
    return same;
  };
  const r = writeNotes(store, { mayWrite: (n) => !unstaged(n) || onlyOurs(n) });
  for (const w of r.warnings) io.err(`baesian: ${w}`);
  for (const path of r.skipped) io.err(`baesian: left ${path} as it is: it has changes you haven't staged. Stage them, and the next commit brings it up to date.`);
  const written = new Set(r.written);
  const planned = new Map(r.planned.map((n) => [n.path, n]));
  // What this commit should carry: the notes written now, any written earlier (by `baesian sync`) and never added, and
  // those whose only unstaged change is Baesian's.
  const toStage = r.notes.filter((p) => {
    const n = planned.get(p);
    return written.has(p) || before.get(p)?.x === "?" || (n !== undefined && unstaged(n) && onlyOurs(n));
  });
  if (!toStage.length) return [];
  try {
    execFileSync("git", ["add", "--", ...toStage], { cwd: top, stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    io.err(`baesian: couldn't stage the vault's notes (${e instanceof Error ? e.message.split("\n")[0] : String(e)}); they're written, so add them yourself`);
    return [];
  }
  io.err(`baesian: staged ${toStage.length} vault note${toStage.length === 1 ? "" : "s"} (${v.rel}/)`);
  return toStage.filter((p) => {
    const e = before.get(p);
    return !e || e.x === " " || e.x === "?";
  });
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
      if (!existsSync(store.record)) {
        writeStaged(top, []);
        return 0;
      }
      const rel = relative(top, store.record);
      const pending = recordStatus(top, rel);
      // What this hook stages that nobody had staged, so a blocked commit can unstage it again (D122).
      const ours = pending.filter((p) => p.x === " " || p.x === "?").map((p) => p.path);
      if (pending.length) {
        execFileSync("git", ["add", "--", rel], { cwd: top });
        io.err(`baesian: staged ${pending.length} record file${pending.length === 1 ? "" : "s"} (${rel}/)`);
      }
      // M6 (D170): then the vault's notes, from the record just updated, staged with it.
      ours.push(...stageNotes(store, io));
      writeStaged(top, ours);
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
      if (!report.ok) unstageOurs(top);
      writeStaged(top, []);
      return report.ok ? 0 : 1;
    }
    case "post-commit": {
      // D15: the ledger. Which commits build on which cards. Just the commit (D120): what it changed is git's to say.
      const message = git(top, ["log", "-1", "--format=%B", "HEAD"]);
      const sha = git(top, ["rev-parse", "HEAD"]);
      for (const id of parseTrailers(message, top).cards) {
        if (!store.card(id)) continue;
        store.writeLedger(id, { commit: sha }, `Commit \`${sha.slice(0, 12)}\` builds on ${id}.\n`);
      }
      return 0;
    }
    default:
      io.err(`baesian: unknown hook "${name}"`);
      return 1;
  }
}
