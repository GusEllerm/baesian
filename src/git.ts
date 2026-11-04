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

/** `feat/run-store` → `feat-run-store`. */
export function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "x"
  );
}
