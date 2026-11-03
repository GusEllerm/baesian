import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readHistory } from "../src/trailers.js";
import { describeBrief } from "../src/wait.js";
import { BODY, REVIEWER, cleanup, draft, repo, sh } from "./helpers.js";

// B-9v5xj: a card's commits are found by their `Baesian-Card` trailers in the history, so a rebase, or a squash that
// keeps the trailer, doesn't lose them; ledger entries whose commit is on no branch now are marked rewritten.

afterEach(cleanup);

const AGENT = { agent: "claude-code" };

/** Commit a change to `file` with `message`, with the hooks off; `date` sets the author's date. Returns the commit. */
function commit(dir: string, file: string, message: string, date?: string): string {
  writeFileSync(join(dir, file), `${message}\n`);
  sh(dir, "add", "--", file);
  sh(dir, "commit", "-q", ...(date ? [`--date=${date}`] : []), "-m", message);
  return sh(dir, "rev-parse", "HEAD");
}

/** A card the reviewer accepted, in a repo: its commits are made next, and then the answer changes. */
function accepted() {
  const r = repo();
  const id = r.store.fileCard(draft(), BODY, AGENT).card.meta.id;
  r.store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
  return { ...r, id };
}

/** The answer changes: the brief lists what was built on the old one. */
function changeAnswer(store: ReturnType<typeof repo>["store"], id: string) {
  store.addVerdict({ card: id, revision: 1, response: "alternative", choice: "Postgres", ...REVIEWER });
  const brief = store.briefs(id).find((b) => b.kind === "answer-changed");
  if (brief?.kind !== "answer-changed") throw new Error("no answer-changed brief");
  return brief;
}

describe("reading trailers from the history (B-9v5xj)", () => {
  it("reads them as git does, from the last paragraph only, on local and remote-tracking branches", () => {
    const { dir } = repo();
    const a = commit(dir, "a.txt", "Runs table\n\nSome body.\n\nbaesian-card: B-aaaaa, B-bbbbb\nCo-Authored-By: x <x@x>");
    commit(dir, "b.txt", "Not a trailer\n\nBaesian-Card: B-ccccc\n\nA paragraph after it, so git doesn't read it as one.");
    // A commit only a remote-tracking branch reaches, as after a fetch.
    sh(dir, "checkout", "-q", "-b", "elsewhere");
    const r = commit(dir, "c.txt", "From a remote\n\nBaesian-Card: B-aaaaa");
    sh(dir, "update-ref", "refs/remotes/origin/feat", r);
    sh(dir, "checkout", "-q", "main");
    sh(dir, "branch", "-q", "-D", "elsewhere");
    // A commit on no branch at all.
    sh(dir, "checkout", "-q", "--detach");
    const loose = commit(dir, "d.txt", "Loose\n\nBaesian-Card: B-aaaaa");
    sh(dir, "checkout", "-q", "main");

    const h = readHistory(dir);
    expect(h.citing.get("B-aaaaa")).toEqual([
      { commit: a, branch: "main", authored: expect.any(Number) },
      { commit: r, branch: "origin/feat", authored: expect.any(Number) },
    ]);
    expect(h.citing.get("B-bbbbb")?.map((c) => c.commit)).toEqual([a]);
    expect(h.citing.has("B-ccccc")).toBe(false);
    expect(h.onBranch(a)).toBe(true);
    expect(h.onBranch(sh(dir, "rev-parse", "HEAD~2"))).toBe(true); // on a branch, though it cites nothing
    expect(h.onBranch(loose)).toBe(false);
    expect(h.onBranch("abc1234def5678")).toBe(false); // never existed
  });

  it("is cached while the branches stay put, and read again when they move", () => {
    const { dir } = repo();
    commit(dir, "a.txt", "One\n\nBaesian-Card: B-aaaaa");
    const first = readHistory(dir);
    expect(readHistory(dir)).toBe(first);
    const two = commit(dir, "b.txt", "Two\n\nBaesian-Card: B-aaaaa");
    expect(readHistory(dir).citing.get("B-aaaaa")?.map((c) => c.commit).at(-1)).toBe(two);
  });
});

describe("a changed answer's brief finds the card's commits by their trailers (B-9v5xj)", () => {
  it("after a rebase: the old commit is marked rewritten, and the new one is found by its trailer", () => {
    const { dir, store, id } = accepted();
    sh(dir, "checkout", "-q", "-b", "feat");
    const old = commit(dir, "runs.sql", `Runs table\n\nBaesian-Card: ${id}`);
    store.writeLedger(id, { commit: old, branch: "feat" }, ""); // as the post-commit hook would
    sh(dir, "checkout", "-q", "main");
    commit(dir, "readme.txt", "Meanwhile on main");
    sh(dir, "rebase", "-q", "main", "feat");
    const rebased = sh(dir, "rev-parse", "feat");
    expect(rebased).not.toBe(old);

    const brief = changeAnswer(store, id);
    expect(brief.commits).toEqual([
      { commit: rebased, branch: "feat" },
      { commit: old, branch: "feat", rewritten: true },
    ]);
    const text = describeBrief(brief).join("\n");
    expect(text).toContain(`Commits that cite ${id}, built on the old answer: ${rebased.slice(0, 7)} (feat). Rework them to match.`);
    expect(text).toContain(`Rewritten since, and on no branch now: ${old.slice(0, 7)} (feat). Their work may be in the commits above, or in ones that don't cite ${id}.`);
  });

  it("after a squash whose message keeps the trailer: the squash is found, and the branch's commits are rewritten", () => {
    const { dir, store, id } = accepted();
    sh(dir, "checkout", "-q", "-b", "feat");
    const one = commit(dir, "runs.sql", `Runs table\n\nBaesian-Card: ${id}`);
    const two = commit(dir, "index.sql", `Runs index\n\nBaesian-Card: ${id}`);
    for (const c of [one, two]) store.writeLedger(id, { commit: c, branch: "feat" }, "");
    sh(dir, "checkout", "-q", "main");
    sh(dir, "merge", "-q", "--squash", "feat");
    sh(dir, "commit", "-q", "-m", `The runs table (#12)\n\n* Runs table\n* Runs index\n\nBaesian-Card: ${id}`);
    const squash = sh(dir, "rev-parse", "HEAD");
    sh(dir, "branch", "-q", "-D", "feat");

    const brief = changeAnswer(store, id);
    expect(brief.commits).toEqual([
      { commit: squash, branch: "main" },
      { commit: one, branch: "feat", rewritten: true },
      { commit: two, branch: "feat", rewritten: true },
    ]);
  });

  it("after a squash that drops the trailer: no commit on a branch cites it, and the ledger's are rewritten", () => {
    const { dir, store, id } = accepted();
    sh(dir, "checkout", "-q", "-b", "feat");
    const one = commit(dir, "runs.sql", `Runs table\n\nBaesian-Card: ${id}`);
    store.writeLedger(id, { commit: one, branch: "feat" }, "");
    sh(dir, "checkout", "-q", "main");
    sh(dir, "merge", "-q", "--squash", "feat");
    // GitHub's default squash message lists each commit's message, so the trailer isn't in the last paragraph.
    sh(dir, "commit", "-q", "-m", `The runs table (#12)\n\n* Runs table\n\nBaesian-Card: ${id}\n\nCo-authored-by: x <x@x>`);
    sh(dir, "branch", "-q", "-D", "feat");

    const brief = changeAnswer(store, id);
    expect(brief.commits).toEqual([{ commit: one, branch: "feat", rewritten: true }]);
    const text = describeBrief(brief).join("\n");
    expect(text).toContain(`No commit on a branch cites ${id} now; check for work built on the old answer all the same.`);
    expect(text).toContain(`Their work may be in commits that don't cite ${id}.`);
  });

  it("names a commit by the branch the ledger says it was made on, and leaves out work done after the change", () => {
    const { dir, store, id } = accepted();
    sh(dir, "checkout", "-q", "-b", "feat");
    const built = commit(dir, "runs.sql", `Runs table\n\nBaesian-Card: ${id}`);
    store.writeLedger(id, { commit: built, branch: "feat" }, "");
    sh(dir, "checkout", "-q", "main");
    sh(dir, "merge", "-q", "--ff-only", "feat"); // on both branches now
    // The rework, authored after the answer changes: built on the new answer, so not listed.
    commit(dir, "rework.sql", `Rework for Postgres\n\nBaesian-Card: ${id}`, new Date(Date.now() + 60_000).toISOString());

    expect(changeAnswer(store, id).commits).toEqual([{ commit: built, branch: "feat" }]);
  });

  it("lists commits that cite the card though the ledger never saw them, as when the hooks didn't run", () => {
    const { dir, store, id } = accepted();
    const c = commit(dir, "runs.sql", `Runs table\n\nBaesian-Card: ${id}`);
    const brief = changeAnswer(store, id);
    expect(brief.commits).toEqual([{ commit: c, branch: "main" }]);
    expect(describeBrief(brief).join("\n")).not.toContain("Rewritten");
  });
});
