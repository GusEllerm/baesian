import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runHook } from "../src/hooks.js";
import { LEDGER, RECORD, detectorFor } from "../src/merges.js";
import type { MergeEvent } from "../src/schema.js";
import { Store, mergeFile } from "../src/store.js";
import { BODY, cleanup, draft, repo, sh } from "./helpers.js";

// D181: merges found by the hooks. In shared mode, from the committed record: a commit that brings another branch's
// cards into this branch's record merged that branch, whether by a merge commit, a squash, a fast-forward or a rebase.
// Where the record isn't committed (personal mode, B-4rwyz), from the ledger: a commit citing a card, made on a branch,
// becoming reachable; and for a squash or a rebase made elsewhere, by patch ID. `sh` runs git with hooks off, so each
// test runs the hook git would have run, as git would have run it.

const dirs: string[] = [];
afterEach(() => {
  cleanup();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const quiet = { out: () => {}, err: () => {} };
const said: string[] = [];
const io = { out: () => {}, err: (l: string) => said.push(l) };
/** A hook, as git runs it in `dir`, with the branch checked out now. */
const hook = (dir: string, name: string, ...args: string[]) => runHook(Store.open(dir), name, args, io);

let n = 0;
/** File a card on the branch checked out in `dir`, and commit it with the record, as an agent would. */
function fileAndCommit(dir: string, opts: { record?: boolean; cite?: boolean } = {}): string {
  n += 1;
  const store = Store.open(dir);
  const id = store.fileCard(draft({ title: `Decision ${n}`, question: `Which way for decision ${n}?`, topic: `merges${n}/q` }), BODY, { agent: "claude-code", force: true }).card.meta.id;
  writeFileSync(join(dir, `work-${n}.txt`), `work ${n}\n`);
  sh(dir, "add", `work-${n}.txt`);
  if (opts.record ?? true) sh(dir, "add", ".baesian");
  sh(dir, "commit", "-q", "-m", `Work ${n}${opts.cite ? `\n\nBaesian-Card: ${id}` : ""}`);
  if (opts.cite) void runHook(store, "post-commit", [], quiet);
  return id;
}
/** A commit on the branch checked out, with no card. */
function work(dir: string, name: string): void {
  writeFileSync(join(dir, name), `${name}\n`);
  sh(dir, "add", name);
  sh(dir, "commit", "-q", "-m", name);
}
const head = (dir: string) => sh(dir, "rev-parse", "HEAD");
const merges = (dir: string) => Store.open(dir).merges();
const only = (dir: string): MergeEvent => {
  const m = merges(dir);
  expect(m).toHaveLength(1);
  return m[0]!;
};

/** A repo whose `feat` branch filed two cards on top of `main`, which has one of its own, all committed with the record. */
function shared(opts: { record?: boolean; cite?: boolean } = {}) {
  const { dir } = repo();
  if (opts.record ?? true) {
    sh(dir, "add", ".baesian");
    sh(dir, "commit", "-q", "-m", "Set up Baesian");
  } else writeFileSync(join(dir, ".gitignore"), ".baesian/\n");
  const mine = fileAndCommit(dir, opts);
  sh(dir, "checkout", "-q", "-b", "feat");
  const a = fileAndCommit(dir, opts);
  work(dir, "between.txt");
  const b = fileAndCommit(dir, opts);
  sh(dir, "checkout", "-q", "main");
  return { dir, mine, cards: [a, b].sort() };
}

describe("finding merges in the committed record (D181, shared mode)", () => {
  it("a merge commit: feat's cards come into main's record, at the merge commit, when it was made", async () => {
    const { dir, cards } = shared();
    work(dir, "main-only.txt");
    sh(dir, "merge", "-q", "--no-ff", "--no-edit", "feat");
    expect(detectorFor(Store.open(dir), head(dir))).toBe(RECORD);
    expect(await hook(dir, "post-merge", "0")).toBe(0);
    const m = only(dir);
    expect(m).toMatchObject({ type: "merge", format: 1, branch: "feat", into: "main", commit: head(dir), cards });
    expect(m.at).toBe(new Date(sh(dir, "log", "-1", "--format=%cI")).toISOString());
    // Named by the commit and the branch merged, so finding it again writes nothing.
    expect(Store.open(dir).storage.read(mergeFile(head(dir), "feat"))).toBeDefined();
    expect(await hook(dir, "post-merge", "0")).toBe(0);
    expect(merges(dir)).toHaveLength(1);
    // The message says what was found, and never a commit's subject.
    expect(said.at(-1)).toMatch(/recorded feat merged into main, with 2 cards/);
  });

  it("a squash: `git merge --squash`, then its commit, which brings feat's cards; nothing at the squash itself", async () => {
    const { dir, cards } = shared();
    work(dir, "main-only.txt");
    const before = head(dir);
    sh(dir, "merge", "-q", "--squash", "feat");
    expect(await hook(dir, "post-merge", "1")).toBe(0);
    expect(merges(dir)).toEqual([]);
    sh(dir, "commit", "-q", "-m", "Squashed feat");
    expect(await hook(dir, "post-commit")).toBe(0);
    expect(only(dir)).toMatchObject({ branch: "feat", into: "main", commit: head(dir), cards });
    expect(sh(dir, "rev-parse", "HEAD^")).toBe(before);
  });

  it("a fast-forward: main moves to feat's tip, which is the merge's commit, at the time it happened", async () => {
    const { dir, cards } = shared();
    const tip = sh(dir, "rev-parse", "feat");
    sh(dir, "merge", "-q", "--ff-only", "feat");
    const now = Date.now();
    await hook(dir, "post-merge", "0");
    const m = only(dir);
    expect(m).toMatchObject({ branch: "feat", into: "main", commit: tip, cards });
    expect(Math.abs(Date.parse(m.at) - now)).toBeLessThan(10_000);
  });

  it("a rebase, then a fast-forward: the rebased tip is the merge; and the rebase itself merged main into feat", async () => {
    const { dir, mine, cards } = shared();
    // main moves on with a card of its own, so the rebase brings it into feat.
    const later = fileAndCommit(dir);
    sh(dir, "checkout", "-q", "feat");
    sh(dir, "rebase", "-q", "main");
    await hook(dir, "post-rewrite", "rebase");
    expect(only(dir)).toMatchObject({ branch: "main", into: "feat", commit: sh(dir, "rev-parse", "main"), cards: [later] });
    expect(only(dir).cards).not.toContain(mine);
    sh(dir, "checkout", "-q", "main");
    sh(dir, "merge", "-q", "--ff-only", "feat");
    await hook(dir, "post-merge", "0");
    const intoMain = merges(dir).find((m) => m.into === "main")!;
    expect(intoMain).toMatchObject({ branch: "feat", commit: head(dir), cards });
  });

  it("a merge whose conflicts were resolved and committed: post-commit finds it, as post-merge never runs", async () => {
    const { dir, cards } = shared();
    writeFileSync(join(dir, "between.txt"), "main's own\n");
    sh(dir, "add", "between.txt");
    sh(dir, "commit", "-q", "-m", "main's between");
    expect(() => sh(dir, "merge", "-q", "feat")).toThrow();
    writeFileSync(join(dir, "between.txt"), "resolved\n");
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "--no-edit");
    await hook(dir, "post-commit");
    expect(only(dir)).toMatchObject({ branch: "feat", into: "main", commit: head(dir), cards });
  });

  it("a pull of main's own upstream brings a merge made elsewhere, at its merge commit; a plain commit brings none", async () => {
    const { dir, cards } = shared();
    const remote = realpathSync(mkdtempSync(join(tmpdir(), "baesian-remote-")));
    const other = realpathSync(mkdtempSync(join(tmpdir(), "baesian-other-")));
    dirs.push(remote, other);
    sh(remote, "init", "-q", "--bare", "-b", "main");
    sh(dir, "remote", "add", "origin", remote);
    sh(dir, "push", "-q", "origin", "main", "feat");
    sh(dir, "branch", "-q", "--set-upstream-to=origin/main", "main");
    // Someone merges feat on the forge, without Baesian.
    sh(other, "clone", "-q", remote, ".");
    sh(other, "merge", "-q", "--no-ff", "--no-edit", "origin/feat");
    sh(other, "push", "-q", "origin", "main");
    const merged = sh(other, "rev-parse", "HEAD");
    work(dir, "unrelated.txt");
    await hook(dir, "post-commit");
    expect(merges(dir)).toEqual([]);
    sh(dir, "pull", "-q", "--no-rebase", "--no-edit");
    await hook(dir, "post-merge", "0");
    expect(merges(dir).find((m) => m.commit === merged)).toMatchObject({ branch: "feat", into: "main", cards });
  });

  it("a card attached to on main came by `baesian attach`, not a merge", async () => {
    const { dir } = shared();
    const feat = Store.open(dir).cards().find((c) => c.meta.source_branch === "feat")!.meta.id;
    Store.open(dir).attach(feat, "claude-code");
    sh(dir, "add", ".baesian");
    sh(dir, "commit", "-q", "-m", "Attach");
    await hook(dir, "post-commit");
    expect(merges(dir)).toEqual([]);
  });
});

describe("finding merges from the ledger (D181, where the record isn't committed: personal mode, B-4rwyz)", () => {
  it("a commit citing feat's card becomes reachable from main: feat merged, by a merge commit or a fast-forward", async () => {
    const { dir, cards } = shared({ record: false, cite: true });
    expect(sh(dir, "ls-tree", "-r", "--name-only", "HEAD")).not.toMatch(/\.baesian/);
    expect(detectorFor(Store.open(dir), head(dir))).toBe(LEDGER);
    work(dir, "main-only.txt");
    sh(dir, "merge", "-q", "--no-ff", "--no-edit", "feat");
    await hook(dir, "post-merge", "0");
    expect(only(dir)).toMatchObject({ branch: "feat", into: "main", commit: head(dir), cards });
  });

  it("a fast-forward, in the ledger", async () => {
    const { dir, cards } = shared({ record: false, cite: true });
    sh(dir, "merge", "-q", "--ff-only", "feat");
    await hook(dir, "post-merge", "0");
    expect(only(dir)).toMatchObject({ branch: "feat", into: "main", commit: head(dir), cards });
  });

  it("a squash made here: the marker post-merge leaves names the commits it squashed", async () => {
    const { dir, cards } = shared({ record: false, cite: true });
    sh(dir, "merge", "-q", "--squash", "feat");
    await hook(dir, "post-merge", "1");
    sh(dir, "commit", "-q", "-m", "Squashed feat");
    await hook(dir, "post-commit");
    expect(only(dir)).toMatchObject({ branch: "feat", into: "main", commit: head(dir), cards });
  });

  it("a squash made elsewhere, seen at the next pull: matched by patch ID against feat's whole change", async () => {
    const { dir, cards } = shared({ record: false, cite: true });
    const remote = realpathSync(mkdtempSync(join(tmpdir(), "baesian-remote-")));
    const other = realpathSync(mkdtempSync(join(tmpdir(), "baesian-other-")));
    dirs.push(remote, other);
    sh(remote, "init", "-q", "--bare", "-b", "main");
    sh(dir, "remote", "add", "origin", remote);
    sh(dir, "push", "-q", "origin", "main", "feat");
    sh(dir, "branch", "-q", "--set-upstream-to=origin/main", "main");
    sh(other, "clone", "-q", remote, ".");
    sh(other, "merge", "-q", "--squash", "origin/feat");
    sh(other, "commit", "-q", "-m", "Squash and merge");
    sh(other, "push", "-q", "origin", "main");
    // The forge deletes the branch; this machine still has its own feat.
    sh(dir, "pull", "-q", "--ff-only");
    await hook(dir, "post-merge", "0");
    expect(only(dir)).toMatchObject({ branch: "feat", into: "main", commit: head(dir), cards });
  });

  it("a rebase made elsewhere (GitHub's rebase and merge): each new commit matched by patch ID", async () => {
    const { dir, cards } = shared({ record: false, cite: true });
    const remote = realpathSync(mkdtempSync(join(tmpdir(), "baesian-remote-")));
    const other = realpathSync(mkdtempSync(join(tmpdir(), "baesian-other-")));
    dirs.push(remote, other);
    sh(remote, "init", "-q", "--bare", "-b", "main");
    sh(dir, "remote", "add", "origin", remote);
    sh(dir, "push", "-q", "origin", "main", "feat");
    sh(dir, "branch", "-q", "--set-upstream-to=origin/main", "main");
    sh(other, "clone", "-q", remote, ".");
    work(other, "upstream-first.txt");
    sh(other, "cherry-pick", "origin/main..origin/feat");
    sh(other, "push", "-q", "origin", "main");
    sh(dir, "pull", "-q", "--ff-only");
    await hook(dir, "post-merge", "0");
    expect(only(dir)).toMatchObject({ branch: "feat", into: "main", cards });
    expect(sh(dir, "merge-base", "--is-ancestor", only(dir).commit, "HEAD")).toBe("");
  });

  it("a plain commit isn't looked at, where the record isn't committed", async () => {
    const { dir } = shared({ record: false, cite: true });
    work(dir, "plain.txt");
    await hook(dir, "post-commit");
    expect(merges(dir)).toEqual([]);
  });
});
