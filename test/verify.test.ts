import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
import { openRepo } from "../src/git.js";
import { Store } from "../src/store.js";
import { describeVerify, fileConflicts, verify } from "../src/verify.js";
import { BODY, REVIEWER, cleanup, draft, repo, sh } from "./helpers.js";

afterEach(cleanup);

const AGENT = { agent: "claude-code" };

function put(dir: string, path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

/** Commit everything, record included, the way pre-commit would have staged it. Hooks are off. */
function commit(dir: string, store: Store, message: string): string {
  store.syncRecord();
  sh(dir, "add", "-A");
  sh(dir, "commit", "-q", "--allow-empty", "-m", message);
  return sh(dir, "rev-parse", "HEAD");
}

/** A repo with Baesian's record committed on main, and a feature branch checked out. */
function branched() {
  const { dir, store } = repo();
  commit(dir, store, "Set up Baesian");
  sh(dir, "checkout", "-q", "-b", "feat");
  return { dir, store: Store.open(dir), repo: openRepo(dir) };
}

const pkg = (deps: Record<string, string>) => JSON.stringify({ name: "x", dependencies: deps });

describe("per-commit checks against each commit's own record", () => {
  it("fails a commit that skipped the gate, and passes one with an ack", () => {
    const { dir, store, repo } = branched();
    put(dir, "package.json", pkg({ hono: "^4" }));
    const bad = commit(dir, store, "Add hono");
    put(dir, "package.json", pkg({ hono: "^4", zod: "^4" }));
    commit(dir, store, "Add zod\n\nBaesian-Ack: dep:zod schema validation, swappable");
    const r = verify(repo, "main", { merge: false });
    expect(r.ok).toBe(false);
    expect(r.commits.map((c) => c.report.ok)).toEqual([false, true]);
    const text = describeVerify(r).join("\n");
    expect(text).toContain(`FAIL ${bad.slice(0, 10)} Add hono`);
    expect(text).toContain("Baesian-Ack: dep:hono <why this is fine>");
  });

  it("fails a commit that cites a card its record doesn't have", () => {
    const { dir, store, repo } = branched();
    commit(dir, store, "Work\n\nBaesian-Card: B-zzzzz");
    expect(verify(repo, "main", { merge: false }).commits[0]?.report.problems[0]?.problem).toBe("unknown");
  });

  it("judges a hard card by the record at that commit, as the local gate did", () => {
    const { dir, store, repo } = branched();
    const id = store.fileCard(draft({ touches: ["data-loss", "schema"] }), BODY, AGENT).card.meta.id;
    put(dir, "migrations/9.sql", "drop table runs;");
    commit(dir, store, `Drop runs\n\nBaesian-Card: ${id}`); // made with --no-verify: hard and unresolved
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    commit(dir, store, "Sync");
    const r = verify(repo, "main", { merge: false });
    expect(r.commits[0]?.report.problems[0]?.problem).toBe("hard-unresolved");
    expect(r.commits[1]?.report.ok).toBe(true);
  });

  it("checks nothing before Baesian arrived in the history", () => {
    const { dir } = repo();
    sh(dir, "checkout", "-q", "-b", "feat");
    put(dir, "package.json", pkg({ hono: "^4" }));
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", "Before Baesian");
    const r = verify(openRepo(dir), "main", { merge: false });
    // The commit has no record and no config; the default detectors still apply.
    expect(r.commits[0]?.report.uncovered.map((f) => f.id)).toEqual(["dep:hono"]);
  });
});

describe("the merge gate (D31)", () => {
  it("fails while a cited card is unanswered in the record, pointing at sync", () => {
    const { dir, store, repo } = branched();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    commit(dir, store, `Use SQLite\n\nBaesian-Card: ${id}`);
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    // Answered in the live layer, but nobody committed since: the record lags.
    let r = verify(repo, "main", { merge: true });
    expect(r.ok).toBe(false);
    expect(r.merge?.problems[0]?.message).toMatch(/run `baesian sync` and commit/);
    commit(dir, store, "Sync the record");
    r = verify(repo, "main", { merge: true });
    expect(r.ok).toBe(true);
    expect(describeVerify(r).join("\n")).toContain("every cited card is resolved or deferred");
  });

  it("fails on a rejected card, and passes a deferred one with a note", () => {
    const { dir, store, repo } = branched();
    const rejected = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    const deferred = store.fileCard(draft({ title: "Test runner?", topic: "tests/runner" }), BODY, AGENT).card.meta.id;
    commit(dir, store, `Work\n\nBaesian-Card: ${rejected}\nBaesian-Card: ${deferred}`);
    store.addVerdict({ card: rejected, revision: 1, response: "reject", comment: "Use Postgres.", ...REVIEWER });
    store.addVerdict({ card: deferred, revision: 1, response: "defer", comment: "After the benchmark.", ...REVIEWER });
    commit(dir, store, "Sync");
    const r = verify(repo, "main", { merge: true });
    expect(r.merge?.problems).toMatchObject([{ card: rejected, problem: "rejected" }]);
    expect(r.merge?.notes.join("\n")).toContain(`${deferred} is deferred; comment by gus (a person): "After the benchmark."`);
  });
});

describe("conflicting decisions (D35, D38)", () => {
  function conflicted() {
    const { dir, store } = repo();
    const onMain = store.fileCard(draft({ title: "Timestamp format?", topic: "time/format", proposal: "ISO 8601 strings" }), BODY, AGENT)
      .card.meta.id;
    store.addVerdict({ card: onMain, revision: 1, response: "accept", ...REVIEWER });
    commit(dir, store, "Main decides time format");
    sh(dir, "checkout", "-q", "-b", "feat");
    const feat = Store.open(dir);
    // An agent on the branch decides the same question differently (forcing past the filing check).
    const onBranch = feat
      .fileCard(draft({ title: "Epoch ints for time?", topic: "time/format", proposal: "Unix epoch integers" }), BODY, { ...AGENT, force: true })
      .card.meta.id;
    feat.addVerdict({ card: onBranch, revision: 1, response: "accept", ...REVIEWER });
    commit(dir, feat, `Use epoch\n\nBaesian-Card: ${onBranch}`);
    return { dir, store: feat, repo: openRepo(dir), onMain, onBranch };
  }

  it("reports the same topic answered differently", () => {
    const { repo, onMain, onBranch } = conflicted();
    const r = verify(repo, "main", { merge: true });
    expect(r.ok).toBe(false);
    expect(r.merge?.conflicts).toEqual([
      { topic: "time/format", base: { id: onMain, decision: "ISO 8601 strings" }, branch: { id: onBranch, decision: "Unix epoch integers" } },
    ]);
  });

  it("files one conflict card, and resolving it supersedes the loser and clears the gate", () => {
    const { dir, store, repo, onMain, onBranch } = conflicted();
    const first = verify(repo, "main", { merge: true });
    const [card] = fileConflicts(store, first.merge!.conflicts);
    expect(card?.meta).toMatchObject({ level: "blocking", conflict_of: [onMain, onBranch], caught_at: "merge", proposal: "ISO 8601 strings" });
    // Baesian writes it with no model, so the crux is the fixed one (D94); each option names the decision it replaces.
    expect(card?.meta).toMatchObject({
      alternative: "Unix epoch integers",
      crux: "Was the newer decision made with context the older one lacked?",
      crux_proposal: "If it wasn't",
      proposal_breaks: [onBranch],
      alternative_breaks: [onMain],
    });
    expect(fileConflicts(store, first.merge!.conflicts)).toEqual([]); // not twice

    // The reviewer keeps main's decision: the branch's card is superseded.
    store.addVerdict({ card: card!.meta.id, revision: 1, response: "accept", ...REVIEWER });
    expect(store.status(onBranch)).toBe("superseded");
    expect(store.status(onMain)).toBe("resolved");
    commit(dir, store, "Sync the conflict's verdict");
    const after = verify(repo, "main", { merge: true });
    expect(after.merge?.conflicts).toEqual([]);
    expect(after.merge?.notes.join("\n")).toContain(`${onBranch} is superseded`);
    expect(after.ok).toBe(true);
  });

  it("accepts a branch card that explicitly supersedes the base's decision", () => {
    const { dir, store } = repo();
    const onMain = store.fileCard(draft({ title: "Timestamp format?", topic: "time/format", proposal: "ISO 8601" }), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: onMain, revision: 1, response: "accept", ...REVIEWER });
    commit(dir, store, "Main");
    sh(dir, "checkout", "-q", "-b", "feat");
    const feat = Store.open(dir);
    const next = feat.fileCard(draft({ title: "Switch to epoch?", topic: "time/format", proposal: "Epoch", supersedes: onMain }), BODY, {
      ...AGENT,
      force: true,
    }).card.meta.id;
    feat.addVerdict({ card: next, revision: 1, response: "accept", ...REVIEWER });
    commit(dir, feat, `Epoch\n\nBaesian-Card: ${next}`);
    expect(verify(openRepo(dir), "main", { merge: true }).ok).toBe(true);
  });
});

describe("cli: verify", () => {
  async function run(cwd: string, args: string[], env: Record<string, string | undefined> = {}) {
    const out: string[] = [];
    const saved = { ...process.env };
    // process.env stores strings: assigning undefined would set the variable to "undefined".
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      const code = await main(["node", "baesian", ...args], {
        out: (l) => out.push(l),
        err: (l) => out.push(l),
        stdin: () => "",
        cwd,
        notify: () => {},
      });
      return { code, out: out.join("\n") };
    } finally {
      process.env = saved;
    }
  }

  it("needs a base, and reads it from GitHub Actions", async () => {
    const { dir } = branched();
    const missing = await run(dir, ["verify"], { GITHUB_BASE_REF: undefined });
    expect(missing.code).toBe(1);
    expect(missing.out).toMatch(/pass --base/);
    sh(dir, "update-ref", "refs/remotes/origin/main", "main");
    const r = await run(dir, ["verify", "--merge"], { GITHUB_BASE_REF: "main" });
    expect(r.code).toBe(0);
    expect(r.out).toContain("since origin/main");
  });

  it("exits 1 when a commit fails, and files conflict cards on request", async () => {
    const { dir, store } = branched();
    put(dir, "package.json", pkg({ hono: "^4" }));
    commit(dir, store, "Add hono");
    expect((await run(dir, ["verify", "--base", "main"])).code).toBe(1);
    const bad = await run(dir, ["verify", "--base", "nope"]);
    expect(bad.out).toMatch(/unknown base "nope".*fetch-depth: 0/);
  });
});
