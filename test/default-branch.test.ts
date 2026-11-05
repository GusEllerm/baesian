import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultBranch } from "../src/git.js";
import { BranchName, DefaultBranch } from "../src/schema.js";
import { serverState } from "../src/server.js";
import { snapshot } from "../src/state.js";
import { DEFAULT_BRANCH, Store } from "../src/store.js";
import { cleanup, memory, repo, sh } from "./helpers.js";

// B-jr8mk: the state the branches panel reads says which branch is the repo's default, the trunk, instead of the panel
// guessing that main is. The command line reads it from git: the remote's HEAD; else `init.defaultBranch`, where that
// branch exists; else the branch the repo's first commit was made on, from its reflog. The relay, which has no git, keeps
// what a machine sent (test/relay.test.ts, and the service's own tests).

const dirs: string[] = [];
afterEach(() => {
  cleanup();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const tmp = (prefix: string) => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  dirs.push(d);
  return d;
};
const ctx = { version: 0, server: { started: new Date().toISOString(), watch: "poll" as const }, project: { name: "repo", branch: "main" } };

describe("reading the default branch (B-jr8mk)", () => {
  it("is the remote's HEAD, as a clone sets it, whatever the branch checked out", () => {
    const origin = tmp("baesian-origin-");
    sh(origin, "init", "-q", "-b", "develop");
    sh(origin, "commit", "-q", "--allow-empty", "-m", "first");
    const clone = join(tmp("baesian-clone-"), "c");
    sh(tmpdir(), "clone", "-q", origin, clone);
    sh(clone, "checkout", "-q", "-b", "feat/x");
    expect(sh(clone, "symbolic-ref", "refs/remotes/origin/HEAD")).toBe("refs/remotes/origin/develop");
    expect(defaultBranch(clone)).toEqual({ branch: "develop", from: "remote" });
    // The remote changes its default, and this clone hears of it.
    sh(clone, "update-ref", "refs/remotes/origin/trunk", "HEAD");
    sh(clone, "remote", "set-head", "origin", "trunk");
    expect(defaultBranch(clone)).toEqual({ branch: "trunk", from: "remote" });
  });

  it("with no origin, is the one remote's HEAD; with several and no origin, none of theirs", () => {
    const { dir } = repo();
    sh(dir, "update-ref", "refs/remotes/upstream/trunk", "HEAD");
    sh(dir, "symbolic-ref", "refs/remotes/upstream/HEAD", "refs/remotes/upstream/trunk");
    expect(defaultBranch(dir)).toEqual({ branch: "trunk", from: "remote" });
    sh(dir, "update-ref", "refs/remotes/fork/other", "HEAD");
    sh(dir, "symbolic-ref", "refs/remotes/fork/HEAD", "refs/remotes/fork/other");
    // Two remotes, neither origin: the branch the first commit was made on, as below.
    expect(defaultBranch(dir)).toEqual({ branch: "main", from: "first-commit" });
  });

  it("else is init.defaultBranch, where a branch of that name exists", () => {
    const { dir } = repo();
    sh(dir, "branch", "-q", "trunk");
    sh(dir, "config", "init.defaultBranch", "trunk");
    expect(defaultBranch(dir)).toEqual({ branch: "trunk", from: "init.defaultBranch" });
    // A setting for new repos says nothing of one that never had the branch.
    sh(dir, "config", "init.defaultBranch", "no-such-branch");
    expect(defaultBranch(dir)).toEqual({ branch: "main", from: "first-commit" });
  });

  it("else is the branch `git init` ran on: the one whose reflog starts with the first commit", () => {
    const dir = tmp("baesian-init-");
    sh(dir, "init", "-q", "-b", "develop-x");
    sh(dir, "config", "init.defaultBranch", "no-such-branch");
    sh(dir, "commit", "-q", "--allow-empty", "-m", "first");
    sh(dir, "checkout", "-q", "-b", "feat");
    sh(dir, "commit", "-q", "--allow-empty", "-m", "on feat");
    expect(defaultBranch(dir)).toEqual({ branch: "develop-x", from: "first-commit" });
    // Renamed, it keeps its reflog. An orphan branch started later has a first commit of its own, but a newer one.
    sh(dir, "branch", "-q", "-m", "develop-x", "trunk");
    sh(dir, "checkout", "-q", "--orphan", "gh-pages");
    // git keeps a reflog entry's time to the second: the orphan's first commit, a second later at least.
    const then = Date.now();
    while (Math.floor(Date.now() / 1000) === Math.floor(then / 1000)) execFileSync("sleep", ["0.1"]);
    sh(dir, "commit", "-q", "--allow-empty", "-m", "pages");
    expect(defaultBranch(dir)).toEqual({ branch: "trunk", from: "first-commit" });
  });

  it("is none when git can't say: no remote, no setting that names a branch, and no reflog", () => {
    const dir = tmp("baesian-none-");
    sh(dir, "init", "-q", "-b", "trunk");
    sh(dir, "config", "init.defaultBranch", "no-such-branch");
    sh(dir, "commit", "-q", "--allow-empty", "-m", "first");
    sh(dir, "reflog", "expire", "--expire=now", "--all");
    expect(defaultBranch(dir)).toBeUndefined();
  });
});

describe("the default branch in the state (B-jr8mk)", () => {
  it("the local server's state carries it as `defaultBranch`, read from git each time", () => {
    const { dir, store } = repo();
    sh(dir, "checkout", "-q", "-b", "feat");
    expect(serverState(store, { version: 1, started: new Date().toISOString(), watch: "poll" }).defaultBranch).toBe("main");
    sh(dir, "update-ref", "refs/remotes/origin/trunk", "HEAD");
    sh(dir, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk");
    expect(snapshot(Store.open(dir), ctx).defaultBranch).toBe("trunk");
  });

  it("left out where git can't say, so the panel guesses as it did", () => {
    const dir = tmp("baesian-none-");
    sh(dir, "init", "-q", "-b", "trunk");
    sh(dir, "config", "init.defaultBranch", "no-such-branch");
    sh(dir, "commit", "-q", "--allow-empty", "-m", "first");
    sh(dir, "reflog", "expire", "--expire=now", "--all");
    const store = Store.open(dir);
    store.init();
    expect(snapshot(store, ctx)).not.toHaveProperty("defaultBranch");
  });

  it("over storage alone, as the relay runs it, is what a machine sent: only a branch's name", () => {
    const { store, storage } = memory();
    expect(snapshot(store, ctx)).not.toHaveProperty("defaultBranch");
    storage.replace(DEFAULT_BRANCH, new TextEncoder().encode(`${JSON.stringify({ type: "default-branch", format: 1, branch: "develop" })}\n`));
    expect(store.defaultBranch()).toBe("develop");
    expect(snapshot(store, ctx).defaultBranch).toBe("develop");
    // Anything else in it is refused, and reported rather than shown.
    storage.replace(DEFAULT_BRANCH, new TextEncoder().encode(`${JSON.stringify({ type: "default-branch", format: 1, branch: "develop", note: "the acquisition talks" })}\n`));
    const s = snapshot(store, ctx);
    expect(s).not.toHaveProperty("defaultBranch");
    expect(s.problems.map((p) => p.path)).toContain(DEFAULT_BRANCH);
  });

  it("is a name git allows, and nothing else", () => {
    for (const ok of ["main", "develop", "release/2026-11", "feat/run-store", "v1/next", "trunk_2"]) expect(BranchName.safeParse(ok).success, ok).toBe(true);
    for (const bad of ["", "has space", "a..b", "-x", "/x", "x/", "x.", "x.lock", "a/.hidden", "a//b", "a@{1}", "@", "a~1", "a^", "a:b", "a?", "a*", "a[b", "a\\b", "line\nbreak", "x".repeat(256)]) {
      expect(BranchName.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    expect(DefaultBranch.safeParse({ type: "default-branch", format: 1, branch: "main" }).success).toBe(true);
    expect(DefaultBranch.safeParse({ type: "default-branch", format: 1, branch: "main", at: new Date().toISOString() }).success).toBe(false);
  });
});
