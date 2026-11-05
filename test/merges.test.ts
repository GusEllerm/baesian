import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runHook } from "../src/hooks.js";
import { LEDGER, RECORD, detectorFor } from "../src/merges.js";
import type { MergeEvent } from "../src/schema.js";
import { snapshot } from "../src/state.js";
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
    // B-w41p7: the tip that landed is feat's newest commit citing a card, and its commits are feat's, by its ancestry.
    expect(only(dir)).toMatchObject({ tip: sh(dir, "rev-parse", "feat"), commits: [sh(dir, "rev-parse", "feat~2"), sh(dir, "rev-parse", "feat")] });
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
    // B-w41p7: the commits the rebased ones were made from, the newest of them the tip that landed.
    expect(only(dir)).toMatchObject({ tip: sh(dir, "rev-parse", "feat"), commits: [sh(dir, "rev-parse", "feat~2"), sh(dir, "rev-parse", "feat")] });
  });

  it("a plain commit isn't looked at, where the record isn't committed", async () => {
    const { dir } = shared({ record: false, cite: true });
    work(dir, "plain.txt");
    await hook(dir, "post-commit");
    expect(merges(dir)).toEqual([]);
  });
});

// B-w41p7: a merge names the tip that landed, and the commits citing cards it brought, checked against git's ancestry as
// it's written (reachable from the tip, not from the target before); a later fast-forward of the same branch is a merge of
// its own. With real git, the hooks run as git runs them.

/** A commit on the branch checked out that cites a card, with `post-commit` run as git would: the ledger records it. */
function citing(dir: string, card: string, name: string, date?: string): string {
  writeFileSync(join(dir, name), `${name}\n`);
  sh(dir, "add", name);
  execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", `${name}\n\nBaesian-Card: ${card}`], { cwd: dir, env: { ...process.env, ...(date ? { GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date } : {}) } });
  void runHook(Store.open(dir), "post-commit", [], quiet);
  return head(dir);
}
/** When the ledger says a commit was recorded. */
const ledgerAt = (dir: string, commit: string) => Store.open(dir).ledgerEntries().find((e) => e.meta.commit === commit)!.meta.at;
/** The state the branches panel reads (`snapshot()`), as `baesian serve` and the relay give it. */
const panel = (dir: string) => snapshot(Store.open(dir), { version: 0, server: { started: new Date().toISOString(), watch: "poll" }, project: { name: "repo", branch: "main" } });

/** A repo with the record committed, and on `feat` a card filed by a commit that cites it, committed at `date` if given. */
function filedOnFeat(date?: string) {
  const { dir } = repo();
  sh(dir, "add", ".baesian");
  sh(dir, "commit", "-q", "-m", "Set up Baesian");
  const before = head(dir);
  sh(dir, "checkout", "-q", "-b", "feat");
  if (date) Object.assign(process.env, { GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date });
  try {
    const id = fileAndCommit(dir, { cite: true });
    return { dir, id, before, filed: head(dir) };
  } finally {
    delete process.env.GIT_COMMITTER_DATE;
    delete process.env.GIT_AUTHOR_DATE;
  }
}

describe("what a merge brought (B-w41p7)", () => {
  it("a fast-forward, then seconds later another of more commits from the same branch: a merge of its own, at its own commit", async () => {
    const { dir, id, filed } = filedOnFeat();
    sh(dir, "checkout", "-q", "main");
    sh(dir, "merge", "-q", "--ff-only", "feat");
    await hook(dir, "post-merge", "0");
    const first = only(dir);
    expect(first).toMatchObject({ format: 1, branch: "feat", into: "main", commit: filed, tip: filed, cards: [id], commits: [filed] });
    // The agent logs the card as answered, citing it, and notes something citing nothing; the branch is fast-forwarded again.
    sh(dir, "checkout", "-q", "feat");
    const log = citing(dir, id, "log.md");
    work(dir, "notes.txt");
    const tip = head(dir);
    sh(dir, "checkout", "-q", "main");
    sh(dir, "merge", "-q", "--ff-only", "feat");
    await hook(dir, "post-merge", "0");
    expect(said.at(-1)).toMatch(/recorded feat merged into main, with 1 commit citing cards/);
    const all = merges(dir);
    expect(all).toHaveLength(2);
    // Its own file, at the commit it landed on: the first is as it was, since nothing is ever rewritten.
    expect(all.find((m) => m.commit === tip)).toMatchObject({ branch: "feat", into: "main", tip, cards: [], commits: [log] });
    expect(all.find((m) => m.commit === filed)).toEqual(first);
    expect(Store.open(dir).storage.read(mergeFile(tip, "feat"))).toBeDefined();
    // The state the panel reads says which merge each commit citing a card came in by: none is left unmerged.
    const state = panel(dir);
    const cited = state.commits!.filter((c) => c.branch === "feat").map((c) => c.commit);
    expect(cited.sort()).toEqual([filed, log].sort());
    for (const c of cited) expect(state.merges!.some((m) => m.commits?.includes(c))).toBe(true);
    // A third fast-forward that brings no card and no commit citing one records nothing.
    sh(dir, "checkout", "-q", "feat");
    work(dir, "more.txt");
    sh(dir, "checkout", "-q", "main");
    sh(dir, "merge", "-q", "--ff-only", "feat");
    await hook(dir, "post-merge", "0");
    expect(merges(dir)).toHaveLength(2);
  });

  it("a merge commit, then the branch takes it, carries on, and is fast-forwarded in: the follow-up brings only what's new", async () => {
    const { dir, id, filed } = filedOnFeat();
    sh(dir, "checkout", "-q", "main");
    work(dir, "main-only.txt");
    sh(dir, "merge", "-q", "--no-ff", "--no-edit", "feat");
    const merged = head(dir);
    await hook(dir, "post-merge", "0");
    expect(only(dir)).toMatchObject({ commit: merged, tip: filed, cards: [id], commits: [filed] });
    sh(dir, "checkout", "-q", "feat");
    sh(dir, "merge", "-q", "--ff-only", "main");
    await hook(dir, "post-merge", "0");
    // main brought no card of its own and no commit citing one into feat: nothing to record.
    expect(merges(dir)).toHaveLength(1);
    const log = citing(dir, id, "log.md");
    sh(dir, "checkout", "-q", "main");
    sh(dir, "merge", "-q", "--ff-only", "feat");
    await hook(dir, "post-merge", "0");
    expect(merges(dir).find((m) => m.commit === log)).toMatchObject({ branch: "feat", into: "main", tip: log, cards: [], commits: [log] });
  });

  it("the case the design loop found: a card's commit and one 25 s later, fast-forwarded together and found at a pull, are one merge with both", async () => {
    // An hour ago, the card's commit; 25 s later, the log entry citing it, as 91e3781 came after f823982. The ledger
    // records each as it's made: here, now.
    const t0 = Date.now() - 3_600_000;
    const { dir, id, before, filed } = filedOnFeat(new Date(t0).toISOString());
    const log = citing(dir, id, "log.md", new Date(t0 + 25_000).toISOString());
    const remote = realpathSync(mkdtempSync(join(tmpdir(), "baesian-remote-")));
    const other = realpathSync(mkdtempSync(join(tmpdir(), "baesian-other-")));
    dirs.push(remote, other);
    sh(remote, "init", "-q", "--bare", "-b", "main");
    sh(dir, "remote", "add", "origin", remote);
    sh(dir, "push", "-q", "origin", "main", "feat");
    sh(dir, "checkout", "-q", "main");
    sh(dir, "branch", "-q", "--set-upstream-to=origin/main", "main");
    // The lead fast-forwards feat into main elsewhere, and the branch is deleted, here and there.
    sh(other, "clone", "-q", remote, ".");
    sh(other, "merge", "-q", "--ff-only", "origin/feat");
    sh(other, "push", "-q", "origin", "main", ":feat");
    sh(dir, "branch", "-q", "-D", "feat");
    sh(dir, "update-ref", "-d", "refs/remotes/origin/feat");
    sh(dir, "pull", "-q", "--ff-only");
    expect(head(dir)).toBe(log);
    await hook(dir, "post-merge", "0");
    // Before B-w41p7 this merge was at the card's commit, dated by it, and the log entry was drawn after it, unmerged.
    const m = only(dir);
    expect(m).toMatchObject({ branch: "feat", into: "main", commit: log, tip: log, cards: [id], commits: [filed, log] });
    expect(sh(dir, "rev-list", "--count", `${before}..${m.tip}`)).toBe("2");
    // git doesn't date a fast-forward: it's no earlier than its last commit, nor than the ledger's entry for it.
    expect(Date.parse(sh(dir, "log", "-1", "--format=%cI", log))).toBe(t0 + 25_000 - ((t0 + 25_000) % 1000));
    expect(m.at).toBe(ledgerAt(dir, log));
    const state = panel(dir);
    for (const c of state.commits!) expect(state.merges![0]!.commits).toContain(c.commit);
  });

  it("a squash: the tip is the branch's that was squashed, and its commits are the squashed branch's that cite cards", async () => {
    const { dir, cards } = shared({ cite: true });
    sh(dir, "merge", "-q", "--squash", "feat");
    await hook(dir, "post-merge", "1");
    sh(dir, "commit", "-q", "-m", "Squashed feat");
    await hook(dir, "post-commit");
    expect(only(dir)).toMatchObject({ branch: "feat", into: "main", commit: head(dir), tip: sh(dir, "rev-parse", "feat"), cards, commits: [sh(dir, "rev-parse", "feat~2"), sh(dir, "rev-parse", "feat")] });
  });

  it("a squash made elsewhere, in shared mode: the record finds the cards, and feat's commits are matched by patch ID for the tip", async () => {
    const { dir, cards } = shared({ cite: true });
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
    sh(dir, "pull", "-q", "--ff-only");
    await hook(dir, "post-merge", "0");
    expect(only(dir)).toMatchObject({ branch: "feat", into: "main", commit: head(dir), tip: sh(dir, "rev-parse", "feat"), cards, commits: [sh(dir, "rev-parse", "feat~2"), sh(dir, "rev-parse", "feat")] });
  });

  it("a rebase onto feat: its commits come in as they are, so they're found by ancestry, the tip feat's", async () => {
    const { dir, cards } = shared({ cite: true });
    work(dir, "main-only.txt");
    sh(dir, "rebase", "-q", "feat");
    await hook(dir, "post-rewrite", "rebase");
    expect(only(dir)).toMatchObject({ branch: "feat", into: "main", commit: sh(dir, "rev-parse", "feat"), tip: sh(dir, "rev-parse", "feat"), cards, commits: [sh(dir, "rev-parse", "feat~2"), sh(dir, "rev-parse", "feat")] });
  });

  it("checks what it records against git's ancestry: a commit citing a card that the tip doesn't reach isn't listed", async () => {
    const { dir, id, filed } = filedOnFeat();
    // A second branch off feat, whose commit cites the card too, isn't merged.
    sh(dir, "checkout", "-q", "-b", "feat-later");
    const elsewhere = citing(dir, id, "elsewhere.md");
    sh(dir, "checkout", "-q", "main");
    sh(dir, "merge", "-q", "--no-ff", "--no-edit", "feat");
    await hook(dir, "post-merge", "0");
    const m = only(dir);
    expect(m.commits).toEqual([filed]);
    expect(m.commits).not.toContain(elsewhere);
    expect(sh(dir, "merge-base", "--is-ancestor", m.tip!, head(dir))).toBe("");
  });

  it("reads a merge recorded before B-w41p7, with no tip and no commits", () => {
    const { dir } = repo();
    const store = Store.open(dir);
    const commit = "a".repeat(40);
    store.storage.create(mergeFile(commit, "feat"), new TextEncoder().encode(`${JSON.stringify({ type: "merge", format: 1, branch: "feat", into: "main", commit, at: new Date().toISOString(), cards: [] })}\n`));
    expect(store.merges()[0]).toMatchObject({ commit, commits: [] });
    expect(store.merges()[0]).not.toHaveProperty("tip");
  });
});
