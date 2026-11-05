import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { git } from "./git.js";
import { RECORD_DIR, type Store } from "./store.js";
import { parseTrailers } from "./trailers.js";

// Personal mode (B-4rwyz): one person uses Baesian in a repo they share with collaborators who don't. Nothing of
// Baesian's is committed: the config is the clone's (`PERSONAL_CONFIG`, in the live layer), the live layer plays the
// record's part, the gate runs from hooks of the clone's own (src/hooks.ts, `installPersonalHooks()`), and AGENTS.md is
// left alone. This module holds what the hooks and `baesian init` need for it that isn't the hooks themselves: keeping
// the trailers out of shared history, and keeping a stray `.baesian/` out of commits.

// ---------------------------------------------------------------- trailers, kept out of shared history

/**
 * The message with its `Baesian-Card` and `Baesian-Ack` trailers taken out (B-4rwyz), where git reads them as trailers:
 * the lines of the message's last paragraph that are Baesian's, with any continuation lines, and the blank lines before
 * that paragraph when nothing else was in it. Comment lines, and anything from a `--verbose` scissors line on, are left
 * as they are: git takes them out itself. A message with no Baesian trailers is returned unchanged.
 */
export function withoutBaesianTrailers(raw: string, cwd: string): string {
  const t = parseTrailers(raw, cwd);
  if (!t.cards.length && !t.acks.size && !t.malformed.length) return raw;
  const lines = raw.split("\n");
  const blank = (i: number) => !lines[i]!.trim();
  // The message as git records it: indexes of the lines that aren't comments, up to a scissors line (`cleanMessage()`).
  const kept: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^# -+ >8 -+\r?$/.test(lines[i]!)) break;
    if (!lines[i]!.startsWith("#")) kept.push(i);
  }
  let end = kept.length;
  while (end > 0 && blank(kept[end - 1]!)) end--;
  let start = end;
  while (start > 0 && !blank(kept[start - 1]!)) start--;
  const drop = new Set<number>();
  let ours = false;
  for (let k = start; k < end; k++) {
    const line = lines[kept[k]!]!;
    if (/^[ \t]/.test(line)) {
      if (ours) drop.add(kept[k]!);
      continue;
    }
    ours = /^baesian-(card|ack)[ \t]*:/i.test(line);
    if (ours) drop.add(kept[k]!);
  }
  if (!drop.size) return raw;
  if (kept.slice(start, end).every((i) => drop.has(i))) {
    for (let k = start - 1; k >= 0 && blank(kept[k]!); k--) drop.add(kept[k]!);
  }
  return lines.filter((_, i) => !drop.has(i)).join("\n");
}

// ---------------------------------------------------------------- the cards a commit cites, from commit-msg to post-commit

/**
 * Where `commit-msg` notes the cards a commit cites once it has taken their trailers out of the message, for
 * `post-commit` to write the ledger from (D15): this worktree's own git directory, beside its index, as
 * `baesian-staged.json` is. With the tree being committed, so a note left by a commit that failed after `commit-msg`
 * is never taken for another's.
 */
function citedPath(top: string): string {
  return git(top, ["rev-parse", "--path-format=absolute", "--git-path", "baesian-cited.json"]);
}

/** Forget what an earlier commit attempt noted: `pre-commit` starts each commit afresh. */
export function clearCited(top: string): void {
  rmSync(citedPath(top), { force: true });
}

/** Note the cards the commit being made cites, with its tree, as the index holds it now (`commit-msg`). */
export function noteCited(top: string, cards: readonly string[]): void {
  const path = citedPath(top);
  if (!cards.length) return rmSync(path, { force: true });
  const tree = execFileSync("git", ["write-tree"], { cwd: top, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  writeFileSync(path, `${JSON.stringify({ tree, cards })}\n`);
}

/** The cards `commit-msg` noted for this commit, if its tree is the one noted; the note is gone after. */
export function takeCited(top: string, commit: string): string[] {
  const path = citedPath(top);
  if (!existsSync(path)) return [];
  try {
    const noted = JSON.parse(readFileSync(path, "utf8")) as { tree?: unknown; cards?: unknown };
    const tree = git(top, ["rev-parse", `${commit}^{tree}`]);
    return noted.tree === tree && Array.isArray(noted.cards) ? noted.cards.filter((c): c is string => typeof c === "string") : [];
  } catch {
    return [];
  } finally {
    rmSync(path, { force: true });
  }
}

/** A post-rewrite hook's input: each rewritten commit, and the commit it became. */
export function rewrites(input: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of input.split("\n")) {
    const [from, to] = line.trim().split(/\s+/);
    if (from && to && /^[0-9a-f]{40,64}$/.test(from) && /^[0-9a-f]{40,64}$/.test(to)) out.set(from, to);
  }
  return out;
}

// ---------------------------------------------------------------- `.baesian/`, never in a personal clone's commits

const EXCLUDE_NOTE = "# Baesian, in personal mode (B-4rwyz): nothing of Baesian's is committed from this clone";
const EXCLUDE_LINE = `/${RECORD_DIR}/`;

/** The clone's own ignore file, `info/exclude` in git's common directory: never committed. */
function excludePath(store: Store): string {
  return git(store.repo.toplevel, ["rev-parse", "--path-format=absolute", "--git-path", "info/exclude"]);
}

/** Add `/.baesian/` to the clone's `info/exclude`, so a stray record is never committed. Returns whether it was added. */
export function excludeRecord(store: Store): boolean {
  const path = excludePath(store);
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (text.split("\n").includes(EXCLUDE_LINE)) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${text}${text && !text.endsWith("\n") ? "\n" : ""}${EXCLUDE_NOTE}\n${EXCLUDE_LINE}\n`);
  return true;
}

/** Take out what `excludeRecord()` added, when the clone switches to shared mode. Returns whether it was there. */
export function includeRecord(store: Store): boolean {
  const path = excludePath(store);
  if (!existsSync(path)) return false;
  const lines = readFileSync(path, "utf8").split("\n");
  const next = lines.filter((l) => l !== EXCLUDE_NOTE && l !== EXCLUDE_LINE);
  if (next.length === lines.length) return false;
  writeFileSync(path, next.join("\n"));
  return true;
}

// ---------------------------------------------------------------- is the repo shared already?

/**
 * Why a clone can't be set up in personal mode, or nothing (B-4rwyz): some branch of the repo has committed a record,
 * so the repo uses Baesian in shared mode already; or this worktree has a `.baesian/`, which `baesian init` wrote for
 * shared mode and nobody committed.
 */
export function sharedAlready(store: Store): string | undefined {
  const commit = recordCommit(store);
  if (commit) {
    return `this repo uses Baesian in shared mode already: its record, ${RECORD_DIR}/, is committed (in ${commit}), so its decisions travel with the code. Personal mode is for a repo whose collaborators don't use Baesian: run \`baesian init\` here instead.`;
  }
  if (existsSync(join(store.repo.toplevel, RECORD_DIR))) {
    return `this worktree has a ${RECORD_DIR}/ that isn't committed, which \`baesian init\` writes for shared mode. Personal mode writes nothing in the repo: delete ${RECORD_DIR}/ (and Baesian's block in the repo's hooks, and in AGENTS.md, if \`baesian init\` added them), then run \`baesian init --personal\` again.`;
  }
  return undefined;
}

/** A commit on any branch that holds the record's config, by its short ID: then the repo is shared. */
export function recordCommit(store: Store): string | undefined {
  try {
    return git(store.repo.toplevel, ["log", "--all", "-1", "--format=%h", "--", `${RECORD_DIR}/config.json`]) || undefined;
  } catch {
    return undefined; // no commits yet
  }
}
