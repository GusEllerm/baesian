import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { personalInstructions } from "../src/agents.js";
import { main } from "../src/cli.js";
import { hookBlock } from "../src/hooks.js";
import { MCP_INSTRUCTIONS, MCP_PERSONAL, instructionsFor } from "../src/mcp.js";
import { LEDGER, detectorFor } from "../src/merges.js";
import { withoutBaesianTrailers } from "../src/personal.js";
import { Store } from "../src/store.js";
import { BODY, REVIEWER, draft, sh } from "./helpers.js";

// Personal mode (B-4rwyz): Baesian in a repo shared with collaborators who don't use it, as in the user's case: an
// organisation's repo whose committed `.githooks/` holds a livedocs-style pre-commit that ends in `exec`, and which each
// clone points `core.hooksPath` at. `baesian init --personal` changes nothing anyone else sees; its gate runs from hooks of
// the clone's own, then the repo's. Hooks run the real CLI from source, through the fallback, with a PATH holding only
// node and git (as in test/hooks.test.ts), so an installed `baesian` is never picked up.

const ROOT = process.cwd();
const FALLBACK = [join(ROOT, "node_modules", ".bin", "tsx"), join(ROOT, "src", "bin.ts")];
const BIN_DIR = mkdtempSync(join(tmpdir(), "baesian-test-bin-"));
for (const tool of ["node", "git"]) {
  const real = tool === "node" ? process.execPath : execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  symlinkSync(real, join(BIN_DIR, tool));
}
const ENV = { ...process.env, PATH: [BIN_DIR, "/usr/bin", "/bin"].join(":"), BAESIAN_OS_NOTIFY: "0", BAESIAN_CONFIG: "/nonexistent" };
afterAll(() => rmSync(BIN_DIR, { recursive: true, force: true }));

const made: string[] = [];
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** The team's hooks: a livedocs-style pre-commit that ends in `exec`, a post-checkout, and a post-rewrite that reads its input. */
const TEAM_HOOKS: Record<string, string> = {
  "pre-commit": `#!/bin/sh\n# livedocs\necho "team pre-commit" >> "$(git rev-parse --git-common-dir)/team.log"\nexec true\n`,
  "post-checkout": `#!/bin/sh\necho "team post-checkout $3" >> "$(git rev-parse --git-common-dir)/team.log"\n`,
  "post-rewrite": `#!/bin/sh\ncat > "$(git rev-parse --git-common-dir)/team-rewritten.txt"\n`,
};

/** The organisation's repo, as a clone of it is after its setup script: its hooks committed in `.githooks/`, and used. */
function teamRepo(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "baesian-team-")));
  made.push(dir);
  sh(dir, "init", "-q", "-b", "main");
  for (const [name, text] of Object.entries(TEAM_HOOKS)) {
    mkdirSync(join(dir, ".githooks"), { recursive: true });
    writeFileSync(join(dir, ".githooks", name), text);
    chmodSync(join(dir, ".githooks", name), 0o755);
  }
  writeFileSync(join(dir, "README.md"), "The team's repo\n");
  sh(dir, "add", "-A");
  sh(dir, "commit", "-q", "-m", "The team's repo");
  git(dir, "config", "core.hooksPath", ".githooks");
  return dir;
}

/** git with the hooks live, as a person runs it (unlike `sh`, which turns them off). */
function git(dir: string, ...args: string[]) {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: dir, encoding: "utf8", env: ENV });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr };
}

function commit(dir: string, message: string) {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-F", "-"], { cwd: dir, input: message, encoding: "utf8", env: ENV });
  return { code: r.status, err: r.stderr };
}

function put(dir: string, path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
  sh(dir, "add", "--", path);
}

async function run(dir: string, ...args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const io = { out: (l: string) => out.push(l), err: (l: string) => err.push(l), stdin: () => "", cwd: dir, hookFallback: FALLBACK, notify: () => {} };
  const code = await main(["node", "baesian", ...args], io);
  return { code, out: out.join("\n"), err: err.join("\n") };
}

const status = (dir: string) => sh(dir, "status", "--porcelain", "--untracked-files=all");
const config = (dir: string, key: string) => spawnSync("git", ["config", "--get", key], { cwd: dir, encoding: "utf8" }).stdout.trim();
const commonDir = (dir: string) => sh(dir, "rev-parse", "--path-format=absolute", "--git-common-dir");
const teamLog = (dir: string) => (existsSync(join(commonDir(dir), "team.log")) ? readFileSync(join(commonDir(dir), "team.log"), "utf8") : "");
const fileCard = (dir: string, overrides: Record<string, unknown> = {}) => Store.open(dir).fileCard(draft(overrides), BODY, { agent: "claude-code", force: true }).card.meta.id;

describe("`baesian init --personal` (B-4rwyz)", { timeout: 60_000 }, () => {
  it("changes nothing in the repo: git status stays clean, the committed hooks as they were, no .baesian/ and no AGENTS.md", async () => {
    const dir = teamRepo();
    const r = await run(dir, "init", "--personal");
    expect(r.code, r.err).toBe(0);
    expect(r.out).toContain("personal mode (B-4rwyz)");
    expect(r.out).toMatch(/run Baesian's gate, then the repo's own hooks from \.githooks\//);
    expect(status(dir)).toBe("");
    for (const [name, text] of Object.entries(TEAM_HOOKS)) expect(readFileSync(join(dir, ".githooks", name), "utf8")).toBe(text);
    expect(existsSync(join(dir, ".baesian"))).toBe(false);
    expect(existsSync(join(dir, "AGENTS.md"))).toBe(false);
    // Everything is in the clone: its config, its hooks, and git's own settings for it.
    const store = Store.open(dir);
    expect(store.personal).toBe(true);
    expect(JSON.parse(readFileSync(join(commonDir(dir), "baesian", "config.json"), "utf8"))).toEqual({ format: 1 });
    expect(config(dir, "core.hooksPath")).toBe(join(commonDir(dir), "baesian", "hooks"));
    expect(config(dir, "baesian.repohooks")).toBe(".githooks");
    expect(readFileSync(join(commonDir(dir), "info", "exclude"), "utf8")).toContain("\n/.baesian/\n");
    // Each of Baesian's hooks runs its block, then the repo's own; the team's hooks Baesian doesn't install are passed on.
    const preCommit = readFileSync(join(commonDir(dir), "baesian", "hooks", "pre-commit"), "utf8");
    expect(preCommit).toContain(hookBlock("pre-commit", { restore: "git config core.hooksPath '.githooks'" }));
    expect(preCommit.indexOf("baesian hook pre-commit")).toBeLessThan(preCommit.indexOf("repo_hook='.githooks'/'pre-commit'"));
    expect(readFileSync(join(commonDir(dir), "baesian", "hooks", "post-checkout"), "utf8")).not.toContain("baesian hook");
    // Running it again changes nothing, and says so; plain `init` keeps a personal clone personal.
    expect((await run(dir, "init", "--personal")).out).toContain("personal mode, as before");
    const plain = await run(dir, "init");
    expect(plain.out).toContain("personal mode, as before");
    expect(existsSync(join(dir, ".baesian"))).toBe(false);
    expect(status(dir)).toBe("");
  });

  it("refuses a vault, whose notes are committed, and a repo whose record is committed somewhere: it's shared already", async () => {
    const dir = teamRepo();
    expect((await run(dir, "init", "--personal", "--vault", "docs")).err).toContain("personal mode commits nothing");
    const shared = teamRepo();
    expect((await run(shared, "init")).code).toBe(0);
    sh(shared, "checkout", "-q", "-b", "with-baesian");
    sh(shared, "add", "-A");
    sh(shared, "commit", "-q", "-m", "Use Baesian");
    sh(shared, "checkout", "-q", "main");
    rmSync(join(shared, ".baesian"), { recursive: true, force: true });
    const r = await run(shared, "init", "--personal");
    expect(r.code).toBe(1);
    expect(r.err).toContain("this repo uses Baesian in shared mode already");
  });

  it("runs the repo's own hooks after Baesian's, and the gate blocks an uncovered decision in your commits", async () => {
    const dir = teamRepo();
    await run(dir, "init", "--personal");
    put(dir, "notes.txt", "a note\n");
    expect(commit(dir, "A note\n").code).toBe(0);
    expect(teamLog(dir)).toContain("team pre-commit");
    git(dir, "checkout", "-q", "-b", "feat");
    expect(teamLog(dir)).toContain("team post-checkout 1");

    put(dir, "package.json", JSON.stringify({ name: "x", dependencies: { hono: "^4" } }, null, 2));
    const blocked = commit(dir, "Add hono\n");
    expect(blocked.code).toBe(1);
    expect(blocked.err).toContain("baesian: commit blocked.");
    expect(blocked.err).toContain("dep:hono");

    // A linked worktree of the clone runs the same hooks: the clone's core.hooksPath is absolute, and the repo's own
    // hooks are found in that worktree, as git would find them.
    const wt = `${dir}-wt`;
    made.push(wt);
    sh(dir, "worktree", "add", "-q", "-b", "in-worktree", wt);
    expect(Store.open(wt).personal).toBe(true);
    const runs = teamLog(dir).split("\n").length;
    put(wt, "package.json", JSON.stringify({ name: "x", dependencies: { zod: "^4" } }, null, 2));
    const there = commit(wt, "Add zod\n");
    expect(there.code).toBe(1);
    expect(there.err).toContain("dep:zod");
    expect(teamLog(dir).split("\n").length).toBe(runs + 1);
  });

  it("takes the trailers out of the message once they've covered the commit, into this clone's ledger, leaving the rest", async () => {
    const dir = teamRepo();
    await run(dir, "init", "--personal");
    const id = fileCard(dir, { touches: ["dependency"] });
    put(dir, "package.json", JSON.stringify({ name: "x", dependencies: { hono: "^4" } }, null, 2));
    const r = commit(dir, `Add hono\n\nThe router.\n\nBaesian-Card: ${id}\nCo-Authored-By: Someone <s@example.com>\n`);
    expect(r.code, r.err).toBe(0);
    expect(r.err).toContain(`took the card it cites (${id}) out of the commit message (personal mode, B-4rwyz)`);
    expect(sh(dir, "log", "-1", "--format=%B")).toBe("Add hono\n\nThe router.\n\nCo-Authored-By: Someone <s@example.com>");
    const head = sh(dir, "rev-parse", "HEAD");
    expect(Store.open(dir).ledger(id).map((e) => e.meta.commit)).toEqual([head]);

    put(dir, "package.json", JSON.stringify({ name: "x", dependencies: { hono: "^4", zod: "^4" } }, null, 2));
    expect(commit(dir, "Add zod\n\nBaesian-Ack: dep:zod a small schema library\n").code).toBe(0);
    expect(sh(dir, "log", "-1", "--format=%B")).toBe("Add zod");
    // Nothing of Baesian's in the shared history, and nothing left over in the worktree.
    expect(sh(dir, "log", "--all", "--format=%B")).not.toMatch(/baesian/i);
    expect(sh(dir, "ls-tree", "-r", "--name-only", "HEAD")).not.toMatch(/\.baesian|AGENTS\.md/);
    expect(status(dir)).toBe("");

    // An amend keeps the card's link, in the ledger: the commit it became cites it too.
    put(dir, "notes.txt", "more\n");
    expect(git(dir, "commit", "-q", "--amend", "-m", "Add zod, and a note").code).toBe(0);
    const amended = sh(dir, "rev-parse", "HEAD");
    expect(Store.open(dir).ledger(id).map((e) => e.meta.commit)).toEqual([head]);
    sh(dir, "checkout", "-q", "-b", "side", "HEAD~1");
    expect(git(dir, "commit", "-q", "--amend", "-m", "Add hono, reworded").code).toBe(0);
    const reworded = sh(dir, "rev-parse", "HEAD");
    expect(Store.open(dir).ledger(id).map((e) => e.meta.commit)).toEqual([head, reworded]);
    expect(amended).not.toBe(reworded);
  });

  it("lets a collaborator's clone, with no Baesian, commit freely, through the same committed hooks", async () => {
    const dir = teamRepo();
    await run(dir, "init", "--personal");
    const theirs = `${dir}-theirs`;
    made.push(theirs);
    sh(dir, "clone", "-q", dir, theirs);
    git(theirs, "config", "core.hooksPath", ".githooks");
    put(theirs, "package.json", JSON.stringify({ name: "x", dependencies: { hono: "^4" } }, null, 2));
    const r = commit(theirs, "Add hono\n");
    expect(r.code, r.err).toBe(0);
    expect(r.err).not.toContain("baesian");
    expect(teamLog(theirs)).toContain("team pre-commit");
  });

  it("notices a setup script that points core.hooksPath back at the repo's hooks, and `init --personal` puts the gate back", async () => {
    const dir = teamRepo();
    await run(dir, "init", "--personal");
    // The team's setup script, run again.
    git(dir, "config", "core.hooksPath", ".githooks");
    const listed = await run(dir, "list");
    expect(listed.err).toContain("warning: this clone's commit gate is off: core.hooksPath is `.githooks`");
    expect(listed.err).toContain("Run `baesian init --personal` again");
    // A harness's first look at a session hears it too, after the instructions.
    const hook = await run(dir, "inbox", "--quiet", "--session", "s-1");
    expect(hook.out).toContain(personalInstructions());
    expect(hook.out).toContain("Baesian: this clone's commit gate is off");
    expect((await run(dir, "inbox", "--quiet", "--session", "s-1")).out).toBe("");

    const again = await run(dir, "init", "--personal");
    expect(again.out).toContain("git gate:    on again: something had set core.hooksPath to .githooks");
    expect(config(dir, "core.hooksPath")).toBe(join(commonDir(dir), "baesian", "hooks"));
    expect(config(dir, "baesian.repohooks")).toBe(".githooks");
    expect((await run(dir, "list")).err).toBe("");

    // A hook the team adds later, of a kind not passed on unless the repo has one, is noticed too.
    writeFileSync(join(dir, ".githooks", "reference-transaction"), "#!/bin/sh\n");
    chmodSync(join(dir, ".githooks", "reference-transaction"), 0o755);
    expect((await run(dir, "list")).err).toContain("has reference-transaction, which this clone's own hooks don't run yet");
    await run(dir, "init", "--personal");
    expect((await run(dir, "list")).err).toBe("");
  });

  it("finds merges from the ledger, end to end, as git runs the hooks; and a rebase carries the ledger over", async () => {
    const dir = teamRepo();
    await run(dir, "init", "--personal");
    git(dir, "checkout", "-q", "-b", "feat");
    const id = fileCard(dir, { touches: [] });
    put(dir, "feature.txt", "a feature\n");
    expect(commit(dir, `A feature\n\nBaesian-Card: ${id}\n`).code).toBe(0);
    git(dir, "checkout", "-q", "main");
    put(dir, "other.txt", "main moves on\n");
    expect(commit(dir, "Main moves on\n").code).toBe(0);
    const merged = git(dir, "merge", "--no-ff", "--no-edit", "feat");
    expect(merged.code, merged.err).toBe(0);
    expect(merged.err).toMatch(/baesian: recorded feat merged into main, with 1 card/);
    const head = sh(dir, "rev-parse", "HEAD");
    expect(detectorFor(Store.open(dir), head)).toBe(LEDGER);
    expect(Store.open(dir).merges()).toMatchObject([{ branch: "feat", into: "main", commit: head, cards: [id] }]);

    // A rebase rewrites a commit citing a card: the ledger follows it, and the repo's post-rewrite still reads its input.
    git(dir, "checkout", "-q", "-b", "topic", "HEAD~1");
    const other = fileCard(dir, { title: "A topic", question: "Which topic?", topic: "topics/q", touches: [] });
    put(dir, "topic.txt", "topic\n");
    expect(commit(dir, `Topic\n\nBaesian-Card: ${other}\n`).code).toBe(0);
    const before = sh(dir, "rev-parse", "HEAD");
    const rebased = git(dir, "rebase", "main");
    expect(rebased.code, rebased.err).toBe(0);
    const after = sh(dir, "rev-parse", "HEAD");
    expect(Store.open(dir).ledger(other).map((e) => [e.meta.commit, e.meta.branch])).toEqual([
      [before, "topic"],
      [after, "topic"],
    ]);
    expect(readFileSync(join(commonDir(dir), "team-rewritten.txt"), "utf8")).toContain(`${before} ${after}`);
  });

  it("tells the agent once a session, through the plugin's hook and the MCP server, since AGENTS.md says nothing", async () => {
    const dir = teamRepo();
    await run(dir, "init", "--personal");
    expect(instructionsFor(dir)).toBe(`${MCP_INSTRUCTIONS}\n${MCP_PERSONAL}`);
    const first = await run(dir, "inbox", "--quiet", "--session", "s-1");
    expect(first.out).toBe(personalInstructions());
    expect(first.out).toContain("## Decisions (Baesian)");
    expect(first.out).not.toContain("The decision record is committed with the code");
    expect((await run(dir, "inbox", "--quiet", "--session", "s-1")).out).toBe("");
    // Another session hears it at its own start; a shared repo's hooks never print it.
    expect((await run(dir, "inbox", "--quiet", "--session", "s-2")).out).toBe(personalInstructions());
    const shared = teamRepo();
    await run(shared, "init");
    expect((await run(shared, "inbox", "--quiet", "--session", "s-1")).out).toBe("");
    expect(instructionsFor(shared)).toBe(MCP_INSTRUCTIONS);
  });

  it("can't give CI a pin: nothing is committed for verify to check", async () => {
    const dir = teamRepo();
    await run(dir, "init", "--personal");
    const r = await run(dir, "ci");
    expect(r.code).toBe(1);
    expect(r.err).toContain("personal mode (B-4rwyz): nothing of Baesian's is committed, so CI has no record to verify");
    expect((await run(dir, "sync")).out).toContain("personal mode: nothing to bring into a record");
  });
});

describe("switching a personal clone to shared mode: `baesian init --shared` (B-4rwyz)", { timeout: 60_000 }, () => {
  it("writes this branch's record from the live layer, the hooks' block and AGENTS.md, for the person to commit, which the gate lets through", async () => {
    const dir = teamRepo();
    await run(dir, "init", "--personal");
    const id = fileCard(dir, { touches: [] });
    Store.open(dir).addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    put(dir, "feature.txt", "a feature\n");
    expect(commit(dir, `A feature\n\nBaesian-Card: ${id}\n`).code).toBe(0);
    git(dir, "checkout", "-q", "-b", "elsewhere");
    const elsewhere = fileCard(dir, { title: "Elsewhere", question: "Which way elsewhere?", topic: "elsewhere/q", touches: [] });
    git(dir, "checkout", "-q", "main");

    const r = await run(dir, "init", "--shared");
    expect(r.code, r.err).toBe(0);
    expect(r.out).toContain("shared mode (B-4rwyz)");
    expect(r.out).toContain("note: 1 card filed on another branch (elsewhere) stays in the live layer: run `baesian init --shared` on that branch");
    // The record holds the card, its answer and its ledger entry; the config moved from the clone into it.
    const store = Store.open(dir);
    expect(store.personal).toBe(false);
    expect(existsSync(join(commonDir(dir), "baesian", "config.json"))).toBe(false);
    expect(JSON.parse(readFileSync(join(dir, ".baesian", "config.json"), "utf8"))).toEqual({ format: 1 });
    expect(existsSync(join(dir, ".baesian", "cards", id, "r1.md"))).toBe(true);
    expect(existsSync(join(dir, ".baesian", "cards", elsewhere))).toBe(false);
    expect(sh(dir, "ls-files", "--others", "--exclude-standard", ".baesian")).toMatch(new RegExp(`\\.baesian/verdicts/.*-${id}-r1-`));
    expect(sh(dir, "ls-files", "--others", "--exclude-standard", ".baesian")).toMatch(new RegExp(`\\.baesian/ledger/${id}-`));
    // The block is in the repo's hooks, before the team's lines, which are kept; the clone's own hooks are gone.
    const preCommit = readFileSync(join(dir, ".githooks", "pre-commit"), "utf8");
    expect(preCommit.startsWith(`#!/bin/sh\n${hookBlock("pre-commit")}\n`)).toBe(true);
    expect(preCommit).toContain("exec true");
    expect(config(dir, "core.hooksPath")).toBe(".githooks");
    expect(config(dir, "baesian.repohooks")).toBe("");
    expect(existsSync(join(commonDir(dir), "baesian", "hooks"))).toBe(false);
    expect(readFileSync(join(commonDir(dir), "info", "exclude"), "utf8")).not.toContain("/.baesian/");
    expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toContain("## Decisions (Baesian)");

    // Nothing is committed: the command it prints commits it, and the gate lets it through (B-g6ywj).
    expect(sh(dir, "log", "-1", "--format=%s")).toBe("A feature");
    const command = /^ {2}git add (.+) && git commit -m "([^"]+)"$/m.exec(r.out);
    expect(command, r.out).not.toBeNull();
    sh(dir, "add", ...command![1]!.split(" "));
    const committed = commit(dir, `${command![2]}\n`);
    expect(committed.code, committed.err).toBe(0);
    expect(status(dir)).toBe("");
    expect(sh(dir, "ls-tree", "-r", "--name-only", "HEAD")).toContain(`.baesian/cards/${id}/r1.md`);
    expect(teamLog(dir)).toContain("team pre-commit");

    // Shared now: the reverse refuses, and the record's commits carry trailers again.
    expect((await run(dir, "init", "--personal")).err).toContain("this repo uses Baesian in shared mode already");
    put(dir, "package.json", JSON.stringify({ name: "x", dependencies: { hono: "^4" } }, null, 2));
    expect(commit(dir, "Add hono\n\nBaesian-Ack: dep:hono a small router\n").code).toBe(0);
    expect(sh(dir, "log", "-1", "--format=%B")).toContain("Baesian-Ack: dep:hono");
  });

  it("writes another branch's cards into its record when run there", async () => {
    const dir = teamRepo();
    await run(dir, "init", "--personal");
    git(dir, "checkout", "-q", "-b", "feat");
    const id = fileCard(dir, { touches: [] });
    git(dir, "checkout", "-q", "main");
    await run(dir, "init", "--shared");
    expect(existsSync(join(dir, ".baesian", "cards", id))).toBe(false);
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", "Use Baesian");
    sh(dir, "checkout", "-q", "feat");
    sh(dir, "merge", "-q", "main");
    const r = await run(dir, "init", "--shared");
    expect(r.code, r.err).toBe(0);
    expect(existsSync(join(dir, ".baesian", "cards", id, "r1.md"))).toBe(true);
  });
});

describe("taking Baesian's trailers out of a message (B-4rwyz)", () => {
  const dir = mkdtempSync(join(tmpdir(), "baesian-trailers-"));
  sh(dir, "init", "-q");
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("only from the trailer block, with continuation lines, and the blank line before it when nothing else is left", () => {
    expect(withoutBaesianTrailers("Subject\n\nBody.\n\nBaesian-Card: B-7f3kq\n", dir)).toBe("Subject\n\nBody.\n");
    expect(withoutBaesianTrailers("Subject\n\nBaesian-Ack: dep:zod a small\n  schema library\nSigned-off-by: a <a@a>\n", dir)).toBe("Subject\n\nSigned-off-by: a <a@a>\n");
    // Not a trailer: a line in the body that mentions one, and a message without any.
    expect(withoutBaesianTrailers("Subject\n\nBaesian-Card: B-7f3kq is the card\nand more text here\n", dir)).toBe("Subject\n\nBaesian-Card: B-7f3kq is the card\nand more text here\n");
    expect(withoutBaesianTrailers("Subject\n", dir)).toBe("Subject\n");
    // Comment lines and a --verbose diff are left for git to take out.
    expect(withoutBaesianTrailers("Subject\n\nBaesian-Card: B-7f3kq\n# Please enter the commit message\n# ------------------------ >8 ------------------------\nBaesian-Card: B-aaaaa\n", dir)).toBe(
      "Subject\n# Please enter the commit message\n# ------------------------ >8 ------------------------\nBaesian-Card: B-aaaaa\n",
    );
  });
});
