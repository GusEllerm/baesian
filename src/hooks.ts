import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { describeReport, detectStaged, evaluate, verdictsSinceLastCommit } from "./gate.js";
import { git } from "./git.js";
import { stagedSnapshot } from "./facts.js";
import { BEGIN, END, FALLBACK_KEY, HOOKS, type HookName, NEW_HOOK, hookBlock } from "./hookblock.js";
import type { Http } from "./login.js";
import { RECORD_DIR, type Store } from "./store.js";
import { syncRelay } from "./sync.js";
import { type Trailers, parseTrailers } from "./trailers.js";
import { DECISIONS, type PlannedNote, RULES, vaultOf, writeNotes } from "./vault.js";
import { findMerges, noteSquash, rebasing, recordCommitted, takeSquash } from "./merges.js";
import { clearCited, noteCited, rewrites, takeCited, withoutBaesianTrailers } from "./personal.js";
import { ledgerBody } from "./schema.js";

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

// ---------------------------------------------------------------- personal mode's hooks (B-4rwyz)

/** Personal mode: the clone's own hooks folder, in the live layer (`.git/baesian/hooks/`), which `core.hooksPath` names. */
export const PERSONAL_HOOKS = "hooks";

/**
 * Per-clone git config: the hooks folder this clone's git used before personal mode (`core.hooksPath` as it was), whose
 * hooks still run after Baesian's. Unset: git's own, `hooks/` in the common directory.
 */
export const REPO_HOOKS_KEY = "baesian.repohooks";

/** Every hook git runs from a hooks folder (githooks(5), git 2.56). */
const GIT_HOOKS = new Set([
  "applypatch-msg", "pre-applypatch", "post-applypatch", "pre-commit", "pre-merge-commit", "prepare-commit-msg", "commit-msg",
  "post-commit", "pre-rebase", "post-checkout", "post-merge", "pre-push", "pre-receive", "update", "proc-receive", "post-receive",
  "post-update", "reference-transaction", "push-to-checkout", "pre-auto-gc", "post-rewrite", "sendemail-validate",
  "fsmonitor-watchman", "p4-changelist", "p4-prepare-changelist", "p4-post-changelist", "p4-pre-submit", "post-index-change",
]);

/**
 * The hooks a working clone runs, each passed on to the repo's own whether or not it has one yet, so a hook the team adds
 * later still runs. Others the repo has (`reference-transaction`, say) are passed on too, from when `baesian init
 * --personal` sees them: one runs on every ref update, so it isn't there unless the repo has it.
 */
const PASSED_ON = [
  "applypatch-msg", "pre-applypatch", "post-applypatch", "pre-commit", "pre-merge-commit", "prepare-commit-msg", "commit-msg",
  "post-commit", "pre-rebase", "post-checkout", "post-merge", "pre-push", "post-rewrite", "pre-auto-gc", "sendemail-validate",
];

/** This clone's hooks folder in personal mode. */
export function personalHooksDir(store: Store): string {
  return join(store.live, PERSONAL_HOOKS);
}

/** A git config value, as git reads it from every level; undefined when it isn't set. */
function gitConfig(top: string, key: string, level?: "--local"): string | undefined {
  try {
    return execFileSync("git", ["config", ...(level ? [level] : []), "--get", key], { cwd: top, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).replace(/\n$/, "");
  } catch {
    return undefined;
  }
}

/** Whether two paths name the same folder. */
function samePath(a: string, b: string): boolean {
  const real = (p: string) => {
    try {
      return realpathSync(p);
    } catch {
      return p;
    }
  };
  return real(a) === real(b);
}

/** Whether git runs this clone's hooks from its personal-mode folder. */
function pointsAtPersonal(store: Store): boolean {
  try {
    return samePath(git(store.repo.toplevel, ["rev-parse", "--path-format=absolute", "--git-path", "hooks"]), personalHooksDir(store));
  } catch {
    return false;
  }
}

/** The repo's own hooks folder, as this clone's git had it: its setting, the folder for this worktree, and as a hook names it. */
export interface RepoHooks {
  /** `core.hooksPath` as it was; undefined for git's own folder. */
  configured: string | undefined;
  /** The folder, for this worktree. */
  dir: string;
  /** The folder as a shell word, relative where git's setting is (git runs a hook from the worktree's root). */
  shell: string;
  /** As people read it. */
  shown: string;
}

function repoHooks(store: Store, configured: string | undefined): RepoHooks {
  const top = store.repo.toplevel;
  const shown = (dir: string) => (relative(top, dir).startsWith("..") ? dir : relative(top, dir));
  if (!configured) {
    const dir = join(store.repo.commonDir, "hooks");
    return { configured: undefined, dir, shell: sq(dir), shown: shown(dir) };
  }
  if (configured.startsWith("~/")) return { configured, dir: join(homedir(), configured.slice(2)), shell: `"$HOME"/${sq(configured.slice(2))}`, shown: configured };
  return { configured, dir: isAbsolute(configured) ? configured : join(top, configured), shell: sq(configured), shown: configured };
}

/** The hooks a folder has that git would run: files named for a hook. */
function hookNames(dir: string): string[] {
  try {
    return readdirSync(dir).filter((f) => GIT_HOOKS.has(f) && statSync(join(dir, f)).isFile());
  } catch {
    return [];
  }
}

/** The command that points this clone's git back at the repo's own hooks. */
function restoreCommand(repo: RepoHooks): string {
  return repo.configured === undefined ? "git config --unset core.hooksPath" : `git config core.hooksPath ${sq(repo.configured)}`;
}

/**
 * One of this clone's hooks in personal mode (B-4rwyz): Baesian's block, for the hooks Baesian installs, then the repo's
 * own hook of that name, if it has one git would run, with the same arguments and standard input, exiting as it does.
 * `post-rewrite`'s input is read first, so Baesian and the repo's hook each get it.
 */
export function personalHook(name: string, repo: RepoHooks): string {
  const gate = (HOOKS as readonly string[]).includes(name);
  const rewrite = name === "post-rewrite";
  const lines = [
    "#!/bin/sh",
    `# Baesian, in personal mode (B-4rwyz): this clone's own ${name} hook, written by \`baesian init --personal\`, never`,
    `# committed. ${gate ? "It runs Baesian's gate, then" : "It runs"} the repo's own ${name}, from ${repo.shown}, with the same arguments and input.`,
  ];
  if (rewrite) lines.push(`baesian_input="$(cat; echo .)"; baesian_input="\${baesian_input%.}"`);
  if (gate) lines.push(hookBlock(name as HookName, { restore: restoreCommand(repo) }));
  lines.push(`repo_hook=${repo.shell}/${sq(name)}`);
  lines.push(
    rewrite
      ? `if [ -f "$repo_hook" ] && [ -x "$repo_hook" ]; then printf '%s' "$baesian_input" | "$repo_hook" "$@"; exit $?; fi`
      : `if [ -f "$repo_hook" ] && [ -x "$repo_hook" ]; then exec "$repo_hook" "$@"; fi`,
  );
  return `${lines.join("\n")}\n`;
}

export interface PersonalInstall {
  /** This clone's hooks folder. */
  dir: string;
  /** The repo's own, whose hooks run after Baesian's. */
  repo: RepoHooks;
  /** Whether `core.hooksPath` pointed elsewhere before: a first install, or one after something reset it. */
  pointed: boolean;
  /** Whether it had been installed, and something had pointed `core.hooksPath` elsewhere since (a setup script, say). */
  wasReset: boolean;
  /** The hooks in the folder. */
  hooks: string[];
}

/**
 * Personal mode's gate (B-4rwyz): this clone's own hooks, in the live layer, set as its `core.hooksPath`, each running
 * Baesian's block and then the repo's own hook from the folder the clone used before. Nothing in the repo's hook files
 * changes. Safe to run again: after something reset `core.hooksPath`, the folder it names now is the repo's.
 */
export function installPersonalHooks(store: Store, fallback: readonly string[]): PersonalInstall {
  const top = store.repo.toplevel;
  const dir = personalHooksDir(store);
  const ours = pointsAtPersonal(store);
  let configured = ours ? gitConfig(top, REPO_HOOKS_KEY, "--local") : gitConfig(top, "core.hooksPath");
  // A personal hooks folder somewhere else: the clone moved, and its setting names where it was.
  if (!ours && configured !== undefined && /[\\/]baesian[\\/]hooks[\\/]?$/.test(configured)) configured = gitConfig(top, REPO_HOOKS_KEY, "--local");
  const repo = repoHooks(store, configured || undefined);
  const hooks = [...new Set([...PASSED_ON, ...hookNames(repo.dir)])];
  const wasReset = !ours && existsSync(dir);
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (!hooks.includes(f)) rmSync(join(dir, f), { recursive: true, force: true });
  for (const name of hooks) {
    writeFileSync(join(dir, name), personalHook(name, repo));
    chmodSync(join(dir, name), 0o755);
  }
  // Absolute, since `.git` is a file in a linked worktree; shared by the clone's worktrees, never committed.
  execFileSync("git", ["config", "--local", "core.hooksPath", dir], { cwd: top });
  if (repo.configured !== undefined) execFileSync("git", ["config", "--local", REPO_HOOKS_KEY, repo.configured], { cwd: top });
  else unsetRepoHooks(top);
  setFallback(store, fallback);
  return { dir, repo, pointed: !ours, wasReset, hooks };
}

function unsetRepoHooks(top: string): void {
  try {
    execFileSync("git", ["config", "--local", "--unset-all", REPO_HOOKS_KEY], { cwd: top, stdio: "ignore" });
  } catch {
    // wasn't set
  }
}

/**
 * Take personal mode's hooks out (B-4rwyz), when the clone switches to shared mode: `core.hooksPath` goes back to what it
 * was, unless something set it elsewhere since, and the folder goes. Returns the setting it went back to.
 */
export function uninstallPersonalHooks(store: Store): string | undefined {
  const top = store.repo.toplevel;
  const dir = personalHooksDir(store);
  const configured = gitConfig(top, REPO_HOOKS_KEY, "--local") || undefined;
  const local = gitConfig(top, "core.hooksPath", "--local");
  if (local !== undefined && samePath(local, dir)) {
    execFileSync("git", ["config", "--local", "--unset-all", "core.hooksPath"], { cwd: top });
    if (configured !== undefined && gitConfig(top, "core.hooksPath") !== configured) execFileSync("git", ["config", "--local", "core.hooksPath", configured], { cwd: top });
  }
  unsetRepoHooks(top);
  rmSync(dir, { recursive: true, force: true });
  return configured;
}

/**
 * What's wrong with a personal-mode clone's setup, for any command to say (B-4rwyz): its gate is off because something
 * pointed `core.hooksPath` elsewhere (a team's setup script, say); the repo's hooks folder has a hook this clone's don't
 * pass on; or a `.baesian/` turned up in the worktree. A clone set up with `--no-hooks` has no gate to be off.
 */
export function personalProblems(store: Store): string[] {
  if (!store.personal) return [];
  const top = store.repo.toplevel;
  const dir = personalHooksDir(store);
  const out: string[] = [];
  if (existsSync(dir)) {
    if (!pointsAtPersonal(store)) {
      const now = gitConfig(top, "core.hooksPath");
      out.push(
        `this clone's commit gate is off: core.hooksPath is ${now === undefined ? "unset" : `\`${now}\``}, not this clone's own hooks (personal mode, B-4rwyz), so git runs the repo's hooks without Baesian's. Something set it, such as the repo's setup script. Run \`baesian init --personal\` again: the repo's hooks still run, after Baesian's.`,
      );
    } else {
      const repo = repoHooks(store, gitConfig(top, REPO_HOOKS_KEY, "--local") || undefined);
      const missing = hookNames(repo.dir).filter((n) => !existsSync(join(dir, n)));
      if (missing.length) out.push(`the repo's hooks folder, ${repo.shown}, has ${missing.join(" and ")}, which this clone's own hooks don't run yet (personal mode, B-4rwyz): run \`baesian init --personal\` again`);
    }
  }
  if (existsSync(join(top, RECORD_DIR))) {
    out.push(`this worktree has a ${RECORD_DIR}/, though this clone uses Baesian in personal mode, which writes none: git ignores it here (.git/info/exclude), so it won't be committed. Delete it.`);
  }
  return out;
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

/** How long `pre-commit` waits for the relay's log in a linked repo (Hosted Service section 1): a commit never waits long. */
export const PRE_COMMIT_PULL_MS = 3000;

/**
 * Find the merges a hook's movement of the branch made, and record each (D181): `post-merge` and `post-rewrite` from
 * where the branch was (`ORIG_HEAD`), `post-commit` from the commit's first parent, for a squash commit or a merge
 * whose conflicts were committed. Where the record isn't committed (personal mode), a plain commit can't merge anything,
 * so it isn't looked at. Never fails the hook. Returns how many it recorded.
 */
function recordMerges(store: Store, hook: "post-commit" | "post-merge" | "post-rewrite", io: HookIo): number {
  const top = store.repo.toplevel;
  const into = store.repo.branch;
  if (into.startsWith("detached-")) return 0;
  try {
    const to = git(top, ["rev-parse", "HEAD"]);
    let from: string;
    let squashed: ReturnType<typeof takeSquash>;
    if (hook === "post-commit") {
      const parents = git(top, ["rev-list", "--parents", "-n", "1", "HEAD"]).split(" ").slice(1);
      if (!parents.length) return 0;
      from = parents[0]!;
      squashed = takeSquash(store, from);
      if (parents.length < 2 && !squashed && !recordCommitted(store, to)) return 0;
    } else {
      try {
        from = git(top, ["rev-parse", "-q", "--verify", "ORIG_HEAD^{commit}"]);
      } catch {
        return 0;
      }
      if (from === to) return 0;
    }
    let n = 0;
    for (const f of findMerges(store, { into, from, to, ...(squashed ? { squashed } : {}), deep: hook !== "post-commit" })) {
      if (!store.writeMerge(f)) continue;
      n += 1;
      io.err(`baesian: recorded ${f.branch} merged into ${f.into}${f.cards.length ? `, with ${f.cards.length} card${f.cards.length === 1 ? "" : "s"}` : ""} (${f.commit.slice(0, 7)})`);
    }
    return n;
  } catch (e) {
    io.err(`baesian: couldn't look for merges (${e instanceof Error ? e.message.split("\n")[0] : String(e)})`);
    return 0;
  }
}

/** Send new merges to the relay, in a linked repo, as briefly as `pre-commit` pulls; offline, they go at the next sync. */
async function sendMerges(store: Store, io: HookIo, http: Http): Promise<void> {
  const r = await syncRelay(store, { ...http, signal: http.signal ?? AbortSignal.timeout(PRE_COMMIT_PULL_MS) });
  if (r.state === "synced") for (const n of r.notes) io.err(`baesian: ${n}`);
}

/**
 * The hooks Baesian installs that this repo's hooks folder lacks, its block included (D181 added two): a repo set up
 * before them gets them by running `baesian init` again, which `pre-commit` says.
 */
export function missingHooks(store: Store): HookName[] {
  let dir: string;
  try {
    dir = git(store.repo.toplevel, ["rev-parse", "--path-format=absolute", "--git-path", "hooks"]);
  } catch {
    return [];
  }
  return HOOKS.filter((name) => {
    const path = join(dir, name);
    return !existsSync(path) || !readFileSync(path, "utf8").includes(BEGIN);
  });
}

/**
 * Personal mode (B-4rwyz): take the Baesian trailers out of the commit message, so the shared history never shows them,
 * and note the cards it cites for `post-commit` to write the ledger from, as it reads the trailers in shared mode. Acks
 * cover the commit's gate facts, and are checked here: nothing keeps them after.
 */
function moveTrailers(store: Store, path: string, raw: string, trailers: Trailers, io: HookIo): void {
  const top = store.repo.toplevel;
  const cards = trailers.cards.filter((id) => store.card(id));
  noteCited(top, cards);
  const next = withoutBaesianTrailers(raw, top);
  if (next === raw) return;
  writeFileSync(path, next);
  const what = [cards.length ? `the card${cards.length === 1 ? "" : "s"} it cites (${cards.join(", ")})` : "", trailers.acks.size ? `its ack${trailers.acks.size === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ");
  io.err(`baesian: took ${what || "Baesian's trailers"} out of the commit message (personal mode, B-4rwyz): the shared history doesn't show them${cards.length ? ", and this clone's ledger records the cards" : ""}`);
}

/** Write a ledger entry for each card a commit cites (D15), on the branch it was made on. */
function ledgerFor(store: Store, sha: string, cards: Iterable<string>): void {
  const branch = store.repo.branch.startsWith("detached-") ? rebasing(store) : undefined;
  for (const id of new Set(cards)) {
    if (!store.card(id)) continue;
    store.writeLedger(id, { commit: sha, ...(branch ? { branch } : {}) }, ledgerBody(sha, id));
  }
}

/**
 * Personal mode (B-4rwyz): commits an amend or a rebase rewrote keep the cards they cited, as their trailers would in
 * shared mode (B-9v5xj): each ledger entry for a rewritten commit gets one for the commit it became, on the same branch.
 * Returns how many it wrote.
 */
function carryLedger(store: Store, input: string): number {
  const map = rewrites(input);
  if (!map.size) return 0;
  const entries = store.ledgerEntries();
  const have = new Set(entries.map((e) => `${e.meta.card} ${e.meta.commit}`));
  let n = 0;
  for (const e of entries) {
    const to = e.meta.commit ? map.get(e.meta.commit) : undefined;
    if (!to || have.has(`${e.meta.card} ${to}`) || !store.card(e.meta.card)) continue;
    store.writeLedger(e.meta.card, { commit: to, branch: e.meta.branch }, ledgerBody(to, e.meta.card));
    have.add(`${e.meta.card} ${to}`);
    n += 1;
  }
  return n;
}

/**
 * Run one hook. Returns the exit code git sees. A repo without Baesian set up is never blocked. `input` is the hook's
 * standard input, which only personal mode's `post-rewrite` reads (B-4rwyz).
 */
export async function runHook(store: Store, name: string, args: string[], io: HookIo, http: Http = {}, input = ""): Promise<number> {
  if (!store.isInitialised()) return 0;
  const top = store.repo.toplevel;
  switch (name) {
    case "pre-commit": {
      // M9d: in a linked repo, pull first, so answers given since come into the record with this commit. Briefly, and
      // never failing the commit: offline, it commits what's here.
      const pulled = await syncRelay(store, { ...http, push: false, signal: http.signal ?? AbortSignal.timeout(PRE_COMMIT_PULL_MS) });
      for (const n of pulled.notes) io.err(`baesian: ${n}`);
      // A repo set up before D181 lacks the hooks that find merges until `baesian init` runs again.
      const missing = missingHooks(store);
      if (missing.length) io.err(`baesian: this repo's hooks lack ${missing.join(" and ")}, which find merges: run \`baesian init\` to add ${missing.length === 1 ? "it" : "them"}`);
      // Personal mode (B-4rwyz) commits no record and no notes: the live layer is the record. Each commit starts afresh.
      if (store.personal) {
        clearCited(top);
        for (const p of personalProblems(store)) io.err(`baesian: ${p}`);
        writeStaged(top, []);
        return 0;
      }
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
      const path = isAbsolute(file) ? file : join(top, file);
      const raw = readFileSync(path, "utf8");
      const trailers = parseTrailers(raw, top);
      // Merge commits bring in commits that were each checked; CI checks them again (M3b).
      if (mergeInProgress(store)) {
        if (store.personal) moveTrailers(store, path, raw, trailers, io);
        return 0;
      }
      const report = evaluate(store, detectStaged(store, stagedSnapshot(top)), trailers);
      for (const line of describeReport(report, verdictsSinceLastCommit(store))) io.err(line);
      if (!report.ok) unstageOurs(top);
      writeStaged(top, []);
      // Personal mode (B-4rwyz): the trailers did their work here, and go to this clone's ledger, not the shared history.
      if (report.ok && store.personal) moveTrailers(store, path, raw, trailers, io);
      return report.ok ? 0 : 1;
    }
    case "post-commit": {
      // D15: the ledger. Which commits build on which cards. Just the commit (D120): what it changed is git's to say, and
      // its subject and message never leave the machine (D181). A commit a rebase makes is its branch's, though HEAD is
      // detached while it runs. In personal mode (B-4rwyz), the cards commit-msg took out of the message, too.
      const message = git(top, ["log", "-1", "--format=%B", "HEAD"]);
      const sha = git(top, ["rev-parse", "HEAD"]);
      ledgerFor(store, sha, [...parseTrailers(message, top).cards, ...(store.personal ? takeCited(top, sha) : [])]);
      // D181: a squash commit, or a merge whose conflicts were resolved and committed, merges a branch.
      recordMerges(store, "post-commit", io);
      return 0;
    }
    case "post-merge":
      // A merge commit's own trailers, in personal mode, which commit-msg took out of its message (B-4rwyz).
      if (store.personal && args[0] !== "1") ledgerFor(store, git(top, ["rev-parse", "HEAD"]), takeCited(top, "HEAD"));
      // D181: a merge or a fast-forward, `git pull` included. A squash (`$1` is 1) moved nothing yet: noted for its commit.
      if (args[0] === "1") noteSquash(store);
      else if (recordMerges(store, "post-merge", io)) await sendMerges(store, io, http);
      return 0;
    case "post-rewrite":
      // Personal mode (B-4rwyz): the ledger follows the commits an amend or a rebase rewrote.
      if (store.personal) carryLedger(store, input);
      // D181: a rebase, `git pull --rebase` included, may bring in merges made upstream. An amend brings nothing.
      if (args[0] === "rebase" && recordMerges(store, "post-rewrite", io)) await sendMerges(store, io, http);
      return 0;
    default:
      io.err(`baesian: unknown hook "${name}"`);
      return 1;
  }
}
