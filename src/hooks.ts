import { execFileSync } from "node:child_process";
import { chmodSync, closeSync, existsSync, fchmodSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { citeIn } from "./cite.js";
import { type Line, PLAIN, type Render, failed, next, note, render, text, warning } from "./style.js";
import { describeReport, detectStaged, evaluate, verdictsSinceLastCommit } from "./gate.js";
import { git } from "./git.js";
import { stagedSnapshot } from "./facts.js";
import { BEGIN, END, FALLBACK_KEY, HOOKS, type HookName, NEW_HOOK, hookBlock } from "./hookblock.js";
import type { Http } from "./login.js";
import { LIVE_DIR, RECORD_DIR, type Store, ValidationError } from "./store.js";
import { syncRelay } from "./sync.js";
import { type Trailers, parseTrailers } from "./trailers.js";
import { DECISIONS, type PlannedNote, RULES, vaultOf, writeNotes } from "./vault.js";
import { type Found, findMerges, noteSquash, rebasing, recordCommitted, takeSquash } from "./merges.js";
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
 * Personal mode: a git config file of Baesian's own, in the live layer (`.git/baesian/git.config`), that sets
 * `core.hooksPath` to the clone's own hooks. The clone's `.git/config` includes it at its end (`PERSONAL_INCLUDE`), and git
 * reads an include where it appears, the last value of a key winning: so Baesian's value wins over the clone's own
 * `core.hooksPath`, which a team's setup script sets at will, and which names the repo's hooks, run after Baesian's.
 */
export const PERSONAL_GIT_CONFIG = "git.config";

/** The `include.path` in the clone's `.git/config` that reads `PERSONAL_GIT_CONFIG`: relative, so to the config's own folder. */
export const PERSONAL_INCLUDE = `${LIVE_DIR}/${PERSONAL_GIT_CONFIG}`;

/** The first words of each of the clone's own hooks: a repo's hook that has them is one of these, never run again from one. */
const PERSONAL_MARK = "# Baesian, in personal mode (B-4rwyz): this clone's own";

/** The command that stops this clone's git running Baesian's hooks: its `.git/config` no longer includes Baesian's setting. */
export const PERSONAL_STOP = `git config --unset-all include.path ${PERSONAL_INCLUDE}`;

/**
 * Per-clone git config an older `baesian init --personal` wrote, when it set the clone's `core.hooksPath` itself: the
 * folder that named before. Read only to put it back (`restoreRepoSetting()`), then unset.
 */
const OLD_REPO_HOOKS_KEY = "baesian.repohooks";

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

/** The config file that names it as `core.hooksPath`, which the clone's `.git/config` includes. */
export function personalGitConfig(store: Store): string {
  return join(store.live, PERSONAL_GIT_CONFIG);
}

/** The clone's own git config, `config` in its common directory: every worktree of the clone reads it. */
function cloneConfig(store: Store): string {
  return join(store.repo.commonDir, "config");
}

/** A git config value, as git reads it from every level and include, or from one file alone; undefined when it isn't set. */
function gitConfig(top: string, key: string, file?: string): string | undefined {
  try {
    return execFileSync("git", ["config", ...(file ? ["--file", file] : []), "--get", key], { cwd: top, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).replace(/\n$/, "");
  } catch {
    return undefined;
  }
}

/** One config file's entries, in the order git reads them, its includes not followed: lower-case keys, and values. */
function configEntries(top: string, file: string): [string, string][] {
  let out: string;
  try {
    out = execFileSync("git", ["config", "--file", file, "--no-includes", "--list", "-z"], { cwd: top, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return [];
  }
  return out
    .split("\0")
    .filter(Boolean)
    .map((e): [string, string] => {
      const i = e.indexOf("\n");
      return i < 0 ? [e, ""] : [e.slice(0, i), e.slice(i + 1)];
    });
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

/**
 * Whether a `core.hooksPath` names the clone's own hooks folder: as an older `baesian init --personal` set it (absolute,
 * and where the clone was, if it has moved since), or as anything naming the same folder.
 */
function namesPersonal(store: Store, value: string): boolean {
  if (isAbsolute(value) && /[\\/]baesian[\\/]hooks[\\/]?$/.test(value)) return true;
  return samePath(isAbsolute(value) ? value : join(store.repo.toplevel, value), personalHooksDir(store));
}

/** The repo's own hooks folder, as git would find it without Baesian's setting: the setting, the folder for this worktree, and as people read it. */
export interface RepoHooks {
  /** `core.hooksPath` without Baesian's; undefined for git's own folder. */
  configured: string | undefined;
  /** The folder, for this worktree. */
  dir: string;
  /** As people read it. */
  shown: string;
}

/**
 * The repo's own hooks folder (B-4rwyz), found as the clone's hooks find it each time they run (`personalHook()`): the
 * last `core.hooksPath` git reads, at any level and through any include, other than the value Baesian's own file sets;
 * else git's own, `hooks/` in the common directory. So it's whatever the clone's `.git/config` names now (where a team's
 * setup script sets it), or a global setting, as git would have used without Baesian.
 */
export function repoHooks(store: Store): RepoHooks {
  const top = store.repo.toplevel;
  const ours = gitConfig(top, "core.hooksPath", personalGitConfig(store)) ?? personalHooksDir(store);
  let values: string[] = [];
  try {
    values = execFileSync("git", ["config", "--type=path", "--get-all", "core.hooksPath"], { cwd: top, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n");
  } catch {
    // none set
  }
  const configured = values.filter((v) => v && v !== ours).at(-1);
  if (!configured) {
    const dir = join(store.repo.commonDir, "hooks");
    return { configured: undefined, dir, shown: shownPath(top, dir) };
  }
  return { configured, dir: isAbsolute(configured) ? configured : join(top, configured), shown: configured };
}

/** The hooks a folder has that git would run: files named for a hook. */
function hookNames(dir: string): string[] {
  try {
    return readdirSync(dir).filter((f) => GIT_HOOKS.has(f) && statSync(join(dir, f)).isFile());
  } catch {
    return [];
  }
}

/**
 * One of this clone's hooks in personal mode (B-4rwyz): Baesian's block, for the hooks Baesian installs, then the repo's
 * own hook of that name, if it has one git would run, with the same arguments and standard input, exiting as it does.
 * The repo's folder is found as the hook runs, as `repoHooks()` finds it (the last `core.hooksPath` git reads other than
 * `at.hooks`, Baesian's own, else `at.gitHooks`, git's own), so when a team points `core.hooksPath` somewhere new, its
 * hooks run from there. A hook that is one of these (`PERSONAL_MARK`: from Baesian's own folder, however it's named, or
 * a copy or a link of one) is never run from here, so the chain can't loop. `post-rewrite`'s and `pre-push`'s input is
 * read first, so Baesian and the repo's hook each get it.
 */
export function personalHook(name: string, at: { hooks: string; gitHooks: string }): string {
  const gate = (HOOKS as readonly string[]).includes(name);
  const rewrite = name === "post-rewrite" || name === "pre-push";
  const lines = [
    "#!/bin/sh",
    `${PERSONAL_MARK} ${name} hook, written by \`baesian init --personal\`, never`,
    `# committed. ${gate ? "It runs Baesian's gate, then" : "It runs"} the repo's own ${name}, with the same arguments and input, from the`,
    "# folder core.hooksPath names apart from Baesian's own setting (git's own hooks folder where it names none).",
  ];
  if (rewrite) lines.push(`baesian_input="$(cat; echo .)"; baesian_input="\${baesian_input%.}"`);
  if (gate) lines.push(hookBlock(name as HookName, { restore: PERSONAL_STOP }));
  const runs = `[ -f "$repo_hook" ] && [ -x "$repo_hook" ] && ! grep -qF ${sq(PERSONAL_MARK)} "$repo_hook" 2>/dev/null`;
  lines.push(
    `repo_hooks="$(git config --type=path --get-all core.hooksPath 2>/dev/null | grep -vxF ${sq(at.hooks)} | tail -n 1)"`,
    `[ -n "$repo_hooks" ] || repo_hooks=${sq(at.gitHooks)}`,
    `repo_hook="$repo_hooks"/${sq(name)}`,
    rewrite ? `if ${runs}; then printf '%s' "$baesian_input" | "$repo_hook" "$@"; exit $?; fi` : `if ${runs}; then exec "$repo_hook" "$@"; fi`,
  );
  return `${lines.join("\n")}\n`;
}

/**
 * Put the repo's own `core.hooksPath` back in the clone's `.git/config` (B-4rwyz), where an older `baesian init
 * --personal` had set it to the clone's own hooks and kept the repo's in `baesian.repohooks` (unset where it had none):
 * Baesian's setting is in a file of its own now. A `core.hooksPath` there that names Baesian's folder some other way is
 * taken out the same way, since the repo's hooks never run from it. Returns whether it changed anything.
 */
function restoreRepoSetting(store: Store): boolean {
  const top = store.repo.toplevel;
  const file = cloneConfig(store);
  const kept = gitConfig(top, OLD_REPO_HOOKS_KEY, file);
  const set = gitConfig(top, "core.hooksPath", file);
  let changed = false;
  if (set !== undefined && namesPersonal(store, set)) {
    if (kept) execFileSync("git", ["config", "--file", file, "--replace-all", "core.hooksPath", kept], { cwd: top });
    else execFileSync("git", ["config", "--file", file, "--unset-all", "core.hooksPath"], { cwd: top });
    changed = true;
  }
  if (kept !== undefined) {
    execFileSync("git", ["config", "--file", file, "--unset-all", OLD_REPO_HOOKS_KEY], { cwd: top });
    changed = true;
  }
  return changed;
}

/** Write Baesian's own config file: `core.hooksPath`, absolute, since the clone's linked worktrees read it too. */
function writePersonalGitConfig(store: Store): void {
  const file = personalGitConfig(store);
  writeFileSync(
    file,
    [
      "# Baesian, in personal mode (B-4rwyz): written by `baesian init --personal`, never committed. The clone's .git/config",
      "# includes it at its end, so this core.hooksPath wins over the one there, which names the repo's own hooks: they run",
      "# after Baesian's. `baesian init --shared` takes it out.",
      "",
    ].join("\n"),
  );
  execFileSync("git", ["config", "--file", file, "core.hooksPath", personalHooksDir(store)], { cwd: store.repo.toplevel });
}

/** Take the include of Baesian's setting out of the clone's `.git/config` (and its section, when nothing else is in it). */
function removeInclude(store: Store): void {
  try {
    execFileSync("git", ["config", "--file", cloneConfig(store), "--unset-all", "include.path", `^${PERSONAL_INCLUDE.replace(/\./g, "\\.")}$`], { cwd: store.repo.toplevel, stdio: "ignore" });
  } catch {
    // wasn't there
  }
}

/** Append text to a git config file, holding git's own lock on it (`config.lock`), as git does when it writes one. */
function appendToGitConfig(file: string, text: string): void {
  const lock = `${file}.lock`;
  let fd: number;
  try {
    fd = openSync(lock, "wx");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") {
      throw new ValidationError(`${lock} exists: a git command is changing this clone's config. Run \`baesian init --personal\` again once it's done (or, if no git command is running, delete the lock first).`);
    }
    throw e;
  }
  try {
    const before = readFileSync(file, "utf8");
    writeSync(fd, `${before}${before && !before.endsWith("\n") ? "\n" : ""}${text}`);
    fchmodSync(fd, statSync(file).mode & 0o7777);
    closeSync(fd);
    renameSync(lock, file);
  } catch (e) {
    try {
      closeSync(fd);
    } catch {
      // closed already
    }
    rmSync(lock, { force: true });
    throw e;
  }
}

/**
 * Have the clone's `.git/config` include Baesian's setting at its end, once (B-4rwyz). `git config core.hooksPath …`, as a
 * team's setup script runs it, edits the `[core]` section above, so Baesian's value is still read last. An include that
 * something able to set `core.hooksPath` again has come after (that setting itself, or another include) is moved to the
 * end. Returns whether it changed anything.
 */
function includeLast(store: Store): boolean {
  const top = store.repo.toplevel;
  const file = cloneConfig(store);
  const entries = configEntries(top, file);
  const at = entries.findLastIndex(([k, v]) => k === "include.path" && v === PERSONAL_INCLUDE);
  const overriding = (k: string) => k === "core.hookspath" || k === "include.path" || /^includeif\..+\.path$/.test(k);
  if (at >= 0 && !entries.slice(at + 1).some(([k]) => overriding(k))) return false;
  if (at >= 0) removeInclude(store);
  appendToGitConfig(file, `[include]\n\tpath = ${PERSONAL_INCLUDE}\n`);
  return true;
}

/** Whether the clone's `.git/config` includes Baesian's setting. */
function included(store: Store): boolean {
  return configEntries(store.repo.toplevel, cloneConfig(store)).some(([k, v]) => k === "include.path" && v === PERSONAL_INCLUDE);
}

/** A path as people read it: relative to the worktree when it's inside it. */
function shownPath(top: string, path: string): string {
  const rel = relative(top, path);
  return rel && !rel.startsWith("..") ? rel : path;
}

/**
 * Why git doesn't run this clone's own hooks, when it doesn't (B-4rwyz), for a warning: the setting an older `init
 * --personal` made was replaced; the clone's `.git/config` no longer includes Baesian's; Baesian's file is missing or
 * names another folder (the clone moved); or something read after the include sets `core.hooksPath` again (a
 * worktree's own config, or `git -c`), which only taking it out puts right.
 */
function gateOff(store: Store): string {
  const top = store.repo.toplevel;
  const file = cloneConfig(store);
  const now = gitConfig(top, "core.hooksPath");
  const is = now === undefined ? "unset" : `\`${now}\``;
  if (gitConfig(top, OLD_REPO_HOOKS_KEY, file) !== undefined) return `core.hooksPath is ${is}, not this clone's own hooks`;
  if (!included(store)) {
    return `the clone's .git/config no longer includes Baesian's setting (\`[include] path = ${PERSONAL_INCLUDE}\`), so core.hooksPath is ${is}`;
  }
  const own = personalGitConfig(store);
  const set = gitConfig(top, "core.hooksPath", own);
  if (set === undefined) return `Baesian's setting, ${shownPath(top, own)}, is missing, so core.hooksPath is ${is}`;
  if (!samePath(set, personalHooksDir(store))) return `Baesian's setting, ${shownPath(top, own)}, names \`${set}\`, not this clone's own hooks (did the clone move?)`;
  let origin = "";
  try {
    origin = execFileSync("git", ["config", "--show-origin", "--get", "core.hooksPath"], { cwd: top, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\t")[0] ?? "";
  } catch {
    // unset
  }
  const where = origin.startsWith("file:") ? `in ${origin.slice("file:".length)}` : origin ? `on ${origin.replace(/:$/, "")}` : "somewhere";
  return `core.hooksPath is ${is}, set ${where}, which git reads after Baesian's setting`;
}

export interface PersonalInstall {
  /** This clone's hooks folder. */
  dir: string;
  /** Baesian's own config file, which names it, and which the clone's `.git/config` includes. */
  config: string;
  /** The repo's own, whose hooks run after Baesian's, as it is now. */
  repo: RepoHooks;
  /** Whether git didn't run this clone's hooks before: a first install, or one after something turned the gate off. */
  pointed: boolean;
  /** Why the gate was off, when it had been installed and something turned it off since. */
  wasOff: string | undefined;
  /** Whether an older `init --personal`'s setting, `core.hooksPath` itself, gave way to the included file. */
  moved: boolean;
  /** Why git still doesn't run the clone's hooks here, when something read after the include sets `core.hooksPath`. */
  stillOff: string | undefined;
  /** The hooks in the folder. */
  hooks: string[];
}

/**
 * Personal mode's gate (B-4rwyz): this clone's own hooks, in the live layer, each running Baesian's block and then the
 * repo's own hook, from whichever folder the repo's setting names when it runs. Git finds them through Baesian's own
 * config file, which the clone's `.git/config` includes at its end, so a team's setup script that sets `core.hooksPath`
 * leaves the gate on. Nothing in the repo's hook files changes. Safe to run again, and it moves a clone an older
 * `init --personal` set up (`core.hooksPath` itself naming the clone's hooks) to the included file.
 */
export function installPersonalHooks(store: Store, fallback: readonly string[]): PersonalInstall {
  const dir = personalHooksDir(store);
  const was = pointsAtPersonal(store);
  const wasOff = !was && existsSync(dir) ? gateOff(store) : undefined;
  const moved = restoreRepoSetting(store);
  mkdirSync(dir, { recursive: true });
  writePersonalGitConfig(store);
  // The fallback first: a first `[baesian]` section goes at the end of the clone's .git/config, and the include after it.
  setFallback(store, fallback);
  includeLast(store);
  const repo = repoHooks(store);
  const hooks = [...new Set([...PASSED_ON, ...hookNames(repo.dir)])];
  for (const f of readdirSync(dir)) if (!hooks.includes(f)) rmSync(join(dir, f), { recursive: true, force: true });
  const at = { hooks: dir, gitHooks: join(store.repo.commonDir, "hooks") };
  for (const name of hooks) {
    writeFileSync(join(dir, name), personalHook(name, at));
    chmodSync(join(dir, name), 0o755);
  }
  return { dir, config: personalGitConfig(store), repo, pointed: !was, wasOff, moved, stillOff: pointsAtPersonal(store) ? undefined : gateOff(store), hooks };
}

/**
 * Take personal mode's hooks out (B-4rwyz), when the clone switches to shared mode: the clone's `.git/config` no longer
 * includes Baesian's setting, whose file goes, as does the folder. The repo's own `core.hooksPath` was never changed
 * (an older `init --personal`'s is put back first), so git runs the repo's hooks again.
 */
export function uninstallPersonalHooks(store: Store): void {
  restoreRepoSetting(store);
  removeInclude(store);
  rmSync(personalGitConfig(store), { force: true });
  rmSync(personalHooksDir(store), { recursive: true, force: true });
}

/**
 * What's wrong with a personal-mode clone's setup, for any command to say (B-4rwyz): its gate is off (`gateOff()`: the
 * clone's `.git/config` no longer includes Baesian's setting, say); its gate is set as an older `init --personal` set
 * it, where a team's setup script turns it off; the repo's hooks folder has a hook this clone's don't pass on; or a
 * `.baesian/` turned up in the worktree. A clone set up with `--no-hooks` has no gate to be off.
 */
export function personalProblems(store: Store): string[] {
  if (!store.personal) return [];
  const top = store.repo.toplevel;
  const dir = personalHooksDir(store);
  const out: string[] = [];
  if (existsSync(dir)) {
    const set = gitConfig(top, "core.hooksPath", cloneConfig(store));
    if (!pointsAtPersonal(store)) {
      out.push(
        `this clone's commit gate is off: ${gateOff(store)}, so git runs the repo's hooks without Baesian's (personal mode${citeIn("B-4rwyz")}). Run \`baesian init --personal\` again: the repo's hooks still run, after Baesian's.`,
      );
    } else if (set !== undefined && namesPersonal(store, set)) {
      out.push(
        included(store)
          ? `this clone's core.hooksPath, in its .git/config, names Baesian's own hooks, so the repo's own hooks don't run after Baesian's (personal mode${citeIn("B-4rwyz")}). Set it to the repo's hooks folder, or run \`baesian init --personal\` again, which takes it out.`
          : `this clone's core.hooksPath, in its .git/config, names its own hooks, as an older \`baesian init --personal\` set it, so a setup script that sets core.hooksPath turns the commit gate off (personal mode${citeIn("B-4rwyz")}). Run \`baesian init --personal\` again: it puts the repo's setting back, and Baesian's in a file of its own that .git/config includes.`,
      );
    } else {
      const repo = repoHooks(store);
      const missing = samePath(repo.dir, dir) ? [] : hookNames(repo.dir).filter((n) => !existsSync(join(dir, n)));
      if (missing.length) out.push(`the repo's hooks folder, ${repo.shown}, has ${missing.join(" and ")}, which this clone's own hooks don't run yet (personal mode${citeIn("B-4rwyz")}): run \`baesian init --personal\` again`);
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
  /** How standard error gets its lines: plain, unless git runs the hook at a terminal (src/style.ts). */
  how?: Render;
}

/** What a hook says, on standard error, each line after `baesian: ` but the trailers to paste, so git's own lines can be told apart. */
function say(io: HookIo, lines: Line | readonly Line[]): void {
  const all = Array.isArray(lines) ? lines : [lines as Line];
  for (const l of render(all, { ...(io.how ?? PLAIN), prefix: "baesian: " })) io.err(l);
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
  for (const w of r.warnings) say(io, warning(w));
  for (const path of r.skipped) say(io, note(`left ${path} as it is: it has changes you haven't staged. Stage them, and the next commit brings it up to date.`));
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
    say(io, warning(`couldn't stage the vault's notes (${e instanceof Error ? e.message.split("\n")[0] : String(e)}); they're written, so add them yourself`));
    return [];
  }
  say(io, text(`staged ${toStage.length} vault note${toStage.length === 1 ? "" : "s"} (${v.rel}/)`));
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
 * so it isn't looked at. A later fast-forward of a branch merged before is found as any movement is, and recorded at its
 * own commit (B-w41p7). Never fails the hook. Returns how many it recorded.
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
      say(io, recordedLine(f));
    }
    return n;
  } catch (e) {
    say(io, warning(`couldn't look for merges (${e instanceof Error ? e.message.split("\n")[0] : String(e)})`));
    return 0;
  }
}

/** What a hook says of a merge it recorded: the branches, what it brought, and its commit. */
function recordedLine(f: Found, how = ""): Line {
  const what = [f.cards.length ? `${f.cards.length} card${f.cards.length === 1 ? "" : "s"}` : "", f.commits.length ? `${f.commits.length} commit${f.commits.length === 1 ? "" : "s"} citing cards` : ""].filter(Boolean).join(" and ");
  return text(`recorded ${f.branch} merged into ${f.into}${how}${what ? `, with ${what}` : ""} (${f.commit.slice(0, 7)})`);
}

/** An object name of all zeros: in a push's input, a ref created (the remote's) or deleted (the local). */
const NONE = /^0+$/;

/** A ref update a push sends, as git hands `pre-push` each one on its standard input. */
interface Pushed {
  localRef: string;
  local: string;
  remoteRef: string;
  remote: string;
}

/** `pre-push`'s standard input: a line per ref update, `<local ref> <local object> <remote ref> <remote object>`. */
export function pushedRefs(input: string): Pushed[] {
  return input.split("\n").flatMap((line) => {
    const [localRef, local, remoteRef, remote] = line.trim().split(/\s+/);
    return localRef && local && remoteRef && remote ? [{ localRef, local, remoteRef, remote }] : [];
  });
}

/** The remote's default branch (B-jr8mk): its HEAD, as the last fetch saw it, else the repo's own, as git says it. */
function remoteDefault(store: Store, remote: string | undefined): string | undefined {
  if (remote) {
    try {
      const ref = git(store.repo.toplevel, ["symbolic-ref", "-q", `refs/remotes/${remote}/HEAD`]);
      if (ref.startsWith(`refs/remotes/${remote}/`)) return ref.slice(`refs/remotes/${remote}/`.length);
    } catch {
      // a URL, or a remote whose HEAD isn't known here
    }
  }
  return store.defaultBranch();
}

/** The branch a push sent: its local ref's, HEAD's when that's what was pushed, or the one local branch at the object. */
function pushedBranch(store: Store, u: Pushed, target: string): string | undefined {
  const top = store.repo.toplevel;
  if (u.localRef.startsWith("refs/heads/")) return u.localRef.slice("refs/heads/".length);
  if (u.localRef === "HEAD") {
    try {
      return git(top, ["symbolic-ref", "-q", "--short", "HEAD"]);
    } catch {
      // detached: look for the branch at the object
    }
  }
  const at = git(top, ["for-each-ref", "--points-at", u.local, "--format=%(refname:short)", "refs/heads"])
    .split("\n")
    .filter((b) => b && b !== target);
  return at.length === 1 ? at[0] : undefined;
}

/**
 * B-h7rsv ("Record it at the push"): a push that moves the remote's default branch to a branch's tip, as
 * `git push origin v1/next:main` does, records that branch merged into it, at the push, as a fast-forward of the default
 * branch here is recorded (`findMerges()`). Only a fast-forward of the remote's branch, from a tip this clone has: a
 * forced push isn't a merge, and one the remote would refuse isn't recorded. Pushing the default branch itself records
 * nothing: its own movement here was recorded when it moved. Nothing goes to the relay here, so the push never waits on
 * it: the merge goes up at the next sync. Never fails, and says nothing when it couldn't look. Returns how many it
 * recorded.
 */
function recordPush(store: Store, remote: string | undefined, input: string, io: HookIo): number {
  try {
    const top = store.repo.toplevel;
    const updates = pushedRefs(input);
    if (!updates.length) return 0;
    const target = remoteDefault(store, remote);
    if (!target) return 0;
    let n = 0;
    for (const u of updates) {
      if (u.remoteRef !== `refs/heads/${target}` || NONE.test(u.local) || NONE.test(u.remote) || u.local === u.remote) continue;
      const branch = pushedBranch(store, u, target);
      if (!branch || branch === target) continue;
      try {
        git(top, ["merge-base", "--is-ancestor", u.remote, u.local]);
      } catch {
        continue; // not a fast-forward, or the remote's tip isn't here
      }
      for (const f of findMerges(store, { into: target, from: u.remote, to: u.local, moved: true })) {
        if (f.branch !== branch || !store.writeMerge(f)) continue;
        n += 1;
        say(io, recordedLine(f, `, as it's pushed to ${remote ?? "the remote"}`));
      }
    }
    return n;
  } catch {
    return 0;
  }
}

/** Send new merges to the relay, in a linked repo, as briefly as `pre-commit` pulls; offline, they go at the next sync. */
async function sendMerges(store: Store, io: HookIo, http: Http): Promise<void> {
  const r = await syncRelay(store, { ...http, signal: http.signal ?? AbortSignal.timeout(PRE_COMMIT_PULL_MS) });
  if (r.state === "synced") say(io, r.notes.map((n) => text(n)));
}

/**
 * The hooks Baesian installs that this repo's hooks folder lacks, its block included (D181 added two, and B-h7rsv
 * `pre-push`): a repo set up before them gets them by running `baesian init` again, which `pre-commit` says. A clone in
 * personal mode has a `pre-push` of its own already, which passes the push on to the repo's: it lacks the block, so it's
 * listed too, and `baesian init`, which keeps a personal clone personal, writes it again.
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
  say(io, text(`took ${what || "Baesian's trailers"} out of the commit message (personal mode${citeIn("B-4rwyz")}): the shared history doesn't show them${cards.length ? ", and this clone's ledger records the cards" : ""}`));
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
 * standard input, which `pre-push` reads (the refs being pushed, B-h7rsv), as personal mode's `post-rewrite` does
 * (B-4rwyz).
 */
export async function runHook(store: Store, name: string, args: string[], io: HookIo, http: Http = {}, input = ""): Promise<number> {
  if (!store.isInitialised()) return 0;
  const top = store.repo.toplevel;
  switch (name) {
    case "pre-commit": {
      // M9d: in a linked repo, pull first, so answers given since come into the record with this commit. Briefly, and
      // never failing the commit: offline, it commits what's here.
      const pulled = await syncRelay(store, { ...http, push: false, signal: http.signal ?? AbortSignal.timeout(PRE_COMMIT_PULL_MS) });
      say(io, pulled.notes.map((n) => text(n)));
      // A repo set up before D181 lacks the hooks that find merges until `baesian init` runs again.
      const missing = missingHooks(store);
      const lacking = missing.length < 2 ? missing.join("") : `${missing.slice(0, -1).join(", ")} and ${missing.at(-1)}`;
      if (missing.length) say(io, [warning(`this repo's hooks lack ${lacking}, which find merges`), next("baesian init", `to add ${missing.length === 1 ? "it" : "them"}`)]);
      // Personal mode (B-4rwyz) commits no record and no notes: the live layer is the record. Each commit starts afresh.
      if (store.personal) {
        clearCited(top);
        say(io, personalProblems(store).map((p) => warning(p)));
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
        say(io, text(`staged ${pending.length} record file${pending.length === 1 ? "" : "s"} (${rel}/)`));
      }
      // M6 (D170): then the vault's notes, from the record just updated, staged with it.
      ours.push(...stageNotes(store, io));
      writeStaged(top, ours);
      return 0;
    }
    case "commit-msg": {
      const file = args[0];
      if (!file) {
        say(io, failed("the commit-msg hook needs the message file"));
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
      say(io, describeReport(report, { news: verdictsSinceLastCommit(store), for: "commit" }));
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
    case "pre-push":
      // B-h7rsv: a branch pushed to the remote's default branch merged into it. Never stops the push.
      recordPush(store, args[0], input, io);
      return 0;
    default:
      say(io, failed(`unknown hook "${name}"`));
      return 1;
  }
}
