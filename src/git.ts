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

export function openRepo(cwd: string = process.cwd()): Repo {
  let toplevel: string;
  try {
    toplevel = git(cwd, ["rev-parse", "--show-toplevel"]);
  } catch {
    throw new Error(`not inside a git repository: ${cwd}`);
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

/** `feat/run-store` → `feat-run-store`. */
export function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "x"
  );
}
