import { execFileSync } from "node:child_process";

export function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export interface Repo {
  /** The worktree's root. */
  toplevel: string;
  /** git's common directory, shared by every worktree of the clone: the live layer lives here (D34). */
  commonDir: string;
  /** The checked-out branch, or `detached-<sha>`. */
  branch: string;
}

/** The directory isn't inside a git repository. */
export class NotARepo extends Error {}

export function openRepo(cwd: string = process.cwd()): Repo {
  let toplevel: string;
  try {
    toplevel = git(cwd, ["rev-parse", "--show-toplevel"]);
  } catch {
    throw new NotARepo(`not inside a git repository: ${cwd}`);
  }
  const commonDir = git(toplevel, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  return { toplevel, commonDir, branch: currentBranch(toplevel) };
}

function currentBranch(toplevel: string): string {
  try {
    // Works on an unborn branch too (a repo with no commits yet).
    return git(toplevel, ["symbolic-ref", "--short", "HEAD"]);
  } catch {
    return `detached-${git(toplevel, ["rev-parse", "--short", "HEAD"])}`;
  }
}

/**
 * The commits HEAD's history starts from (B-5gnea): one, or several where unrelated histories were merged. Undefined
 * before the first commit. A shallow clone's boundary looks like a root: ask `isShallow()` first.
 */
export function rootCommits(toplevel: string): string[] | undefined {
  try {
    return git(toplevel, ["rev-list", "--max-parents=0", "HEAD"]).split("\n").filter(Boolean);
  } catch {
    return undefined;
  }
}

/** Whether this clone is shallow, so its oldest commits aren't the history's first (B-5gnea). */
export function isShallow(toplevel: string): boolean {
  try {
    return git(toplevel, ["rev-parse", "--is-shallow-repository"]) === "true";
  } catch {
    return false;
  }
}

/** Where the default branch was read from (B-jr8mk). */
export type DefaultBranchFrom = "remote" | "init.defaultBranch" | "first-commit";

/**
 * The repo's default branch (B-jr8mk), the trunk the branches panel draws on top, read in this order, the first that
 * names one:
 * 1. **the remote's HEAD**: `refs/remotes/origin/HEAD`, which `git clone` sets (and `git fetch` since git 2.48, where it's
 *    missing), naming the branch the remote calls its default; with no `origin`, the one remote's HEAD, if there's one;
 * 2. **`init.defaultBranch`**, as git's config sets it at any level, if a local branch of that name exists: a setting for
 *    new repos says nothing of an older one that never had the branch;
 * 3. **the branch `git init` ran on**: the local branch whose reflog starts with the repo's first commit,
 *    `commit (initial)`; the oldest, if an orphan branch started another. Reflogs are local and expire (90 days, by
 *    default), so a clone or an old repo may have none, but those have a remote's HEAD.
 * Undefined when none does: the panel then guesses as it did. A few git calls, none of them over the network.
 */
export function defaultBranch(toplevel: string): { branch: string; from: DefaultBranchFrom } | undefined {
  const tryGit = (args: string[]) => {
    try {
      return git(toplevel, args);
    } catch {
      return undefined;
    }
  };
  const heads = (tryGit(["for-each-ref", "--format=%(refname) %(symref)", "refs/remotes/*/HEAD"]) ?? "")
    .split("\n")
    .flatMap((l) => {
      const m = /^refs\/remotes\/([^/]+)\/HEAD refs\/remotes\/\1\/(.+)$/.exec(l);
      return m ? [{ remote: m[1]!, branch: m[2]! }] : [];
    });
  const remote = heads.find((h) => h.remote === "origin") ?? (heads.length === 1 ? heads[0] : undefined);
  if (remote) return { branch: remote.branch, from: "remote" };
  const configured = tryGit(["config", "--get", "init.defaultBranch"]);
  if (configured && tryGit(["show-ref", "--verify", "--quiet", `refs/heads/${configured}`]) !== undefined) return { branch: configured, from: "init.defaultBranch" };
  // `--date=unix` names each entry by when it was written, which is when that first commit was made here.
  const initial = (tryGit(["log", "-g", "--all", "--grep-reflog=commit (initial)", "--date=unix", "--format=%gD"]) ?? "")
    .split("\n")
    .flatMap((l) => {
      const m = /^refs\/heads\/(.+)@\{(\d+)\}$/.exec(l);
      return m ? [{ at: Number(m[2]), branch: m[1]! }] : [];
    })
    // A deleted branch's reflog goes with it, so each of these still exists.
    .sort((a, b) => a.at - b.at);
  return initial[0] ? { branch: initial[0].branch, from: "first-commit" } : undefined;
}

/** `feat/run-store` → `feat-run-store`. */
export function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "x"
  );
}
