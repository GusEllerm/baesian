import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { main, selfCommand } from "../src/cli.js";
import { hookBlock, writeHook } from "../src/hooks.js";
import { Store } from "../src/store.js";
import { BODY, REVIEWER, cleanup, draft, repo, sh } from "./helpers.js";

afterEach(cleanup);

// Hooks run the real CLI from source through the fallback (D48). PATH is a private directory holding
// only node and git, so a `baesian` installed or `npm link`ed on this machine is never picked up: the
// tests always exercise the source, not whatever build happens to be installed.
const ROOT = process.cwd();
const FALLBACK = [join(ROOT, "node_modules", ".bin", "tsx"), join(ROOT, "src", "bin.ts")];
const BIN_DIR = mkdtempSync(join(tmpdir(), "baesian-test-bin-"));
for (const tool of ["node", "git"]) {
  const real = tool === "node" ? process.execPath : execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  symlinkSync(real, join(BIN_DIR, tool));
}
const PATH = [BIN_DIR, "/usr/bin", "/bin"].join(":");
const ENV = { ...process.env, PATH, BAESIAN_OS_NOTIFY: "0", BAESIAN_CONFIG: "/nonexistent" };
afterAll(() => rmSync(BIN_DIR, { recursive: true, force: true }));

async function init(dir: string, fallback: readonly string[] = FALLBACK): Promise<string> {
  const out: string[] = [];
  const io = { out: (l: string) => out.push(l), err: (l: string) => out.push(l), stdin: () => "", cwd: dir, hookFallback: fallback };
  await main(["node", "baesian", "init", "--no-agents"], io);
  return out.join("\n");
}

/** `git commit` with the hooks live (unlike `sh`, which disables them). */
function commit(dir: string, message: string) {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-F", "-"], {
    cwd: dir,
    input: message,
    encoding: "utf8",
    env: ENV,
  });
  return { code: r.status, err: r.stderr };
}

function put(dir: string, path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
  sh(dir, "add", "--", path);
}

const pkg = (deps: Record<string, string>) => JSON.stringify({ name: "x", dependencies: deps }, null, 2);

describe("the fallback command (D48)", () => {
  it("resolves the bin symlink npm creates, so a linked or global install gets a fallback", () => {
    const script = join(BIN_DIR, "bin.js");
    writeFileSync(script, "");
    const link = join(BIN_DIR, "baesian-link");
    symlinkSync(script, link);
    expect(selfCommand(link)).toEqual([process.execPath, realpathSync(script)]);
    expect(selfCommand(join(ROOT, "src", "bin.ts"))).toEqual([]); // from source: PATH only
    expect(selfCommand(join(BIN_DIR, "missing.js"))).toEqual([]);
  });
});

describe("installing the gate (D54)", () => {
  it("creates versioned hooks and points git at them", async () => {
    const { dir } = repo();
    const out = await init(dir);
    expect(out).toMatch(/git gate: +\.githooks\/ +pre-commit, commit-msg, post-commit, post-merge, post-rewrite and pre-push; core\.hooksPath points here, so each clone runs `baesian init` once/);
    // Read the real setting: `sh` overrides core.hooksPath for its own commands.
    expect(spawnSync("git", ["config", "core.hooksPath"], { cwd: dir, encoding: "utf8" }).stdout.trim()).toBe(".githooks");
    expect(await init(dir)).not.toMatch(/git gate/); // unchanged the second time
  });

  it("inserts its block after the shebang of an existing hook that ends in exec", () => {
    const { dir } = repo();
    const path = join(dir, "pre-commit");
    writeFileSync(path, "#!/bin/sh\n# livedocs\nexec livedocs hook pre-commit\n");
    expect(writeHook(path, hookBlock("pre-commit"))).toBe("inserted");
    const text = readFileSync(path, "utf8");
    expect(text.indexOf("baesian hook pre-commit")).toBeLessThan(text.indexOf("exec livedocs"));
    expect(text.startsWith("#!/bin/sh\n# >>> baesian >>>")).toBe(true);
    expect(writeHook(path, hookBlock("pre-commit"))).toBe("unchanged");
    writeFileSync(path, text.replace("Managed by", "Hand-edited, managed by"));
    expect(writeHook(path, hookBlock("pre-commit"))).toBe("updated");
    expect(readFileSync(path, "utf8").match(/>>> baesian >>>/g)).toHaveLength(1);
  });

  it("keeps machine paths out of the committed hooks, in the clone's git config instead", async () => {
    const { dir } = repo();
    await init(dir);
    const hooks = ["pre-commit", "commit-msg", "post-commit", "post-merge", "post-rewrite", "pre-push"].map((h) => readFileSync(join(dir, ".githooks", h), "utf8")).join("\n");
    expect(hooks).not.toContain(ROOT);
    expect(hooks).not.toContain(process.execPath);
    const local = spawnSync("git", ["config", "--local", "--get", "baesian.fallback"], { cwd: dir, encoding: "utf8" });
    expect(local.stdout).toContain(join(ROOT, "src", "bin.ts"));
  });
});

describe("the hooks that find merges (D181)", { timeout: 60_000 }, () => {
  it("are added to a hooks folder set up before them: `baesian init` inserts its block in the repo's own post-merge, and pre-commit says to run it", async () => {
    const { dir } = repo();
    await init(dir);
    // As a repo set up before D181 has it: no post-rewrite, and a post-merge of the repo's own.
    rmSync(join(dir, ".githooks", "post-rewrite"));
    writeFileSync(join(dir, ".githooks", "post-merge"), "#!/bin/sh\necho the repo's own post-merge\n");
    put(dir, "README.md", "hi\n");
    const hint = commit(dir, "Docs\n");
    expect(hint.code).toBe(0);
    expect(hint.err).toContain("baesian: warning: this repo's hooks lack post-merge and post-rewrite, which find merges\nbaesian: next: baesian init  # to add them");
    expect(await init(dir)).toMatch(/git gate: +\.githooks\/ +post-merge inserted; post-rewrite created/);
    const merge = readFileSync(join(dir, ".githooks", "post-merge"), "utf8");
    expect(merge.startsWith(`#!/bin/sh\n${hookBlock("post-merge")}\n`)).toBe(true);
    expect(merge).toContain("echo the repo's own post-merge");
    put(dir, "README.md", "hi again\n");
    expect(commit(dir, "Docs again\n").err).not.toContain("lack");
  });

  it("record a real merge as git runs them, and leave post-rewrite's input to the repo's own lines", async () => {
    const { dir } = repo();
    await init(dir);
    put(dir, "README.md", "hi\n");
    expect(commit(dir, "Set up Baesian\n").code).toBe(0);
    sh(dir, "checkout", "-q", "-b", "feat");
    const id = Store.open(dir).fileCard(draft({ touches: [] }), BODY, { agent: "a" }).card.meta.id;
    put(dir, "feature.txt", "a feature\n");
    expect(commit(dir, `A feature\n\nBaesian-Card: ${id}\n`).code).toBe(0);
    sh(dir, "checkout", "-q", "main");
    put(dir, "other.txt", "main moves on\n");
    expect(commit(dir, "Main moves on\n").code).toBe(0);
    const merged = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "merge", "--no-ff", "--no-edit", "feat"], { cwd: dir, encoding: "utf8", env: ENV });
    expect(merged.status).toBe(0);
    expect(merged.stderr).toMatch(/baesian: recorded feat merged into main, with 1 card/);
    expect(Store.open(dir).merges()).toMatchObject([{ branch: "feat", into: "main", commit: sh(dir, "rev-parse", "HEAD"), cards: [id] }]);

    // A rebase gives post-rewrite the commits it rewrote on its standard input; the repo's own lines still read them.
    writeFileSync(join(dir, ".githooks", "post-rewrite"), `${readFileSync(join(dir, ".githooks", "post-rewrite"), "utf8")}cat > rewritten.txt\n`);
    sh(dir, "checkout", "-q", "-b", "topic", "HEAD~1");
    put(dir, "topic.txt", "topic\n");
    expect(commit(dir, "Topic\n").code).toBe(0);
    const rebased = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "rebase", "main"], { cwd: dir, encoding: "utf8", env: ENV });
    expect(rebased.status).toBe(0);
    expect(readFileSync(join(dir, "rewritten.txt"), "utf8")).toMatch(/^[0-9a-f]{40} [0-9a-f]{40}/);
  });
});

describe("pre-push, which records a branch pushed to the remote's default branch (B-h7rsv)", { timeout: 60_000 }, () => {
  /** A repo with the gate, its main pushed to a bare remote, and a branch with a commit citing a card. */
  async function pushing() {
    const { dir } = repo();
    await init(dir);
    put(dir, "README.md", "hi\n");
    expect(commit(dir, "Set up Baesian\n").code).toBe(0);
    const remote = realpathSync(mkdtempSync(join(tmpdir(), "baesian-remote-")));
    sh(remote, "init", "-q", "--bare", "-b", "main");
    sh(dir, "remote", "add", "origin", remote);
    sh(dir, "push", "-q", "-u", "origin", "main");
    sh(dir, "remote", "set-head", "origin", "main");
    sh(dir, "checkout", "-q", "-b", "v1/next");
    const id = Store.open(dir).fileCard(draft({ touches: [] }), BODY, { agent: "a" }).card.meta.id;
    put(dir, "feature.txt", "a feature\n");
    expect(commit(dir, `A feature\n\nBaesian-Card: ${id}\n`).code).toBe(0);
    // The repo's own lines after Baesian's block read the refs being pushed too, as Git LFS's pre-push does.
    writeFileSync(join(dir, ".githooks", "pre-push"), `${readFileSync(join(dir, ".githooks", "pre-push"), "utf8")}cat > "$(git rev-parse --git-common-dir)/pushed.txt"\n`);
    const push = () => spawnSync("git", ["push", "origin", "v1/next:main"], { cwd: dir, encoding: "utf8", env: ENV });
    return { dir, remote, id, push, pushed: () => readFileSync(join(sh(dir, "rev-parse", "--path-format=absolute", "--git-common-dir"), "pushed.txt"), "utf8") };
  }

  it("records the merge as git pushes, and leaves the refs on its input to the repo's own lines", async () => {
    const { dir, remote, id, push, pushed } = await pushing();
    const tip = sh(dir, "rev-parse", "HEAD");
    const r = push();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toContain("baesian: recorded v1/next merged into main, as it's pushed to origin, with 1 card and 1 commit citing cards");
    expect(sh(remote, "rev-parse", "main")).toBe(tip);
    expect(Store.open(dir).merges()).toMatchObject([{ branch: "v1/next", into: "main", commit: tip, tip, cards: [id] }]);
    expect(pushed()).toMatch(new RegExp(`^refs/heads/v1/next ${tip} refs/heads/main [0-9a-f]{40}\n$`));
    rmSync(remote, { recursive: true, force: true });
  });

  it("never stops a push: Baesian failing, or missing, and the push goes on", async () => {
    const { dir, remote, push, pushed } = await pushing();
    sh(dir, "config", "--local", "baesian.fallback", "sh -c 'exit 3'");
    const r = push();
    expect(r.status, r.stderr).toBe(0);
    expect(sh(remote, "rev-parse", "main")).toBe(sh(dir, "rev-parse", "HEAD"));
    expect(pushed()).toMatch(/^refs\/heads\/v1\/next /);
    rmSync(remote, { recursive: true, force: true });
  });
});

describe("the gate on real commits", { timeout: 60_000 }, () => {
  it("blocks an uncovered dependency, and lets an ack through", async () => {
    const { dir } = repo();
    await init(dir);
    put(dir, "package.json", pkg({ hono: "^4" }));
    const blocked = commit(dir, "Add hono\n");
    expect(blocked.code).toBe(1);
    expect(blocked.err).toContain("baesian: commit blocked: 1 decision in it isn't covered by a card or an ack");
    // Every line says it's Baesian's, so git's own can be told apart, but the trailers to paste.
    for (const l of blocked.err.trimEnd().split("\n")) expect(l.startsWith("baesian: ") || l.startsWith("Baesian-"), l).toBe(true);
    expect(blocked.err).toContain("Baesian-Ack: dep:hono <why this is fine>");
    const ok = commit(dir, "Add hono\n\nBaesian-Ack: dep:hono a two-way door: tiny, swappable router\n");
    expect(ok.code).toBe(0);
    expect(ok.err).toContain("baesian: its decision is covered\nbaesian:   dep:hono  ack");
  });

  it("unstages the record files it staged for a commit it blocks, and leaves what you staged (D122)", async () => {
    const { dir, store } = repo();
    await init(dir);
    put(dir, "README.md", "hi\n");
    expect(commit(dir, "Set up Baesian\n").code).toBe(0);
    const first = store.fileCard(draft(), BODY, { agent: "a" }).card.meta.id;
    put(dir, "package.json", pkg({ hono: "^4" }));
    const blocked = commit(dir, "Add hono\n");
    expect(blocked.code).toBe(1);
    expect(blocked.err).toContain("baesian: staged");
    expect(sh(dir, "diff", "--cached", "--name-only")).toBe("package.json");
    expect(sh(dir, "status", "--porcelain", "--untracked-files=all", "--", ".baesian")).toBe(`?? .baesian/cards/${first}/gate-r1-cli.json\n?? .baesian/cards/${first}/r1.md\n?? .baesian/decks/branch-main.md`);

    // A record file you staged yourself stays staged.
    sh(dir, "add", "--", ".baesian");
    const second = store.fileCard(draft({ title: "Where run files are kept", question: "Where should the run files go?", topic: "storage/run-files" }), BODY, { agent: "a" }).card.meta.id;
    expect(commit(dir, "Add hono\n").code).toBe(1);
    expect(sh(dir, "diff", "--cached", "--name-only").split("\n")).toEqual([`.baesian/cards/${first}/gate-r1-cli.json`, `.baesian/cards/${first}/r1.md`, ".baesian/decks/branch-main.md", "package.json"]);
    expect(sh(dir, "status", "--porcelain", "--untracked-files=all", "--", `.baesian/cards/${second}`)).toBe(`?? .baesian/cards/${second}/gate-r1-cli.json\n?? .baesian/cards/${second}/r1.md`);

    // The commit that gets through takes the whole record, as before.
    expect(commit(dir, "Add hono\n\nBaesian-Ack: dep:hono a small router\n").code).toBe(0);
    expect(sh(dir, "ls-tree", "-r", "--name-only", "HEAD")).toContain(`.baesian/cards/${second}/r1.md`);
  });

  it("covers by card, records the ledger, and syncs it into the record on the next commit", async () => {
    const { dir, store } = repo();
    await init(dir);
    const id = store.fileCard(draft({ touches: ["dependency"] }), BODY, { agent: "a" }).card.meta.id;
    put(dir, "package.json", pkg({ "better-sqlite3": "^11" }));
    const r = commit(dir, `Use SQLite\n\nBaesian-Card: ${id}\n`);
    expect(r.err).toContain(`baesian:   dep:better-sqlite3  ${id}`);
    expect(r.code).toBe(0);
    const sha = sh(dir, "rev-parse", "HEAD");
    const ledger = store.ledger(id);
    expect(ledger.map((e) => e.meta.commit)).toEqual([sha]);
    expect(ledger[0]?.body.trim()).toBe(`Commit \`${sha.slice(0, 12)}\` builds on ${id}.`); // just the commit (D120)

    // The card file itself was staged by pre-commit, so it is in that commit.
    expect(sh(dir, "ls-tree", "-r", "--name-only", "HEAD")).toContain(`.baesian/cards/${id}/r1.md`);
    // The ledger entry was written after that commit; the next commit's pre-commit picks it up.
    put(dir, "README.md", "hi\n");
    expect(commit(dir, "Docs\n").code).toBe(0);
    expect(sh(dir, "ls-tree", "-r", "--name-only", "HEAD")).toMatch(new RegExp(`\\.baesian/ledger/${id}-`));
  });

  it("finds the card's commits after a rebase rewrites them, by their trailers (B-9v5xj)", async () => {
    const { dir, store } = repo();
    await init(dir);
    put(dir, "README.md", "hi\n");
    expect(commit(dir, "Set up Baesian\n").code).toBe(0);
    const id = store.fileCard(draft({ touches: ["schema"] }), BODY, { agent: "a" }).card.meta.id;
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    sh(dir, "checkout", "-q", "-b", "feat");
    put(dir, "migrations/1.sql", "create table runs();");
    expect(commit(dir, `Runs table\n\nBaesian-Card: ${id}\n`).code).toBe(0);
    const old = sh(dir, "rev-parse", "HEAD");
    sh(dir, "checkout", "-q", "main");
    put(dir, "notes.txt", "meanwhile\n");
    expect(commit(dir, "Meanwhile on main\n").code).toBe(0);
    // With the hooks live: git runs post-commit for each commit a rebase makes, on a detached HEAD.
    const rebase = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "rebase", "-q", "main", "feat"], { cwd: dir, encoding: "utf8", env: ENV });
    expect(rebase.status).toBe(0);
    const rebased = sh(dir, "rev-parse", "HEAD");
    // HEAD is detached while the rebase runs, but the commit is feat's (D181): the ledger says so.
    expect(store.ledger(id).map((e) => [e.meta.commit, e.meta.branch])).toEqual([[old, "feat"], [rebased, "feat"]]);

    store.addVerdict({ card: id, revision: 1, response: "alternative", choice: "Postgres", ...REVIEWER });
    const brief = store.briefs(id)[0];
    expect(brief).toMatchObject({ kind: "answer-changed", commits: [{ commit: rebased, branch: "feat" }, { commit: old, branch: "feat", rewritten: true }] });
  });

  it("blocks building on a rejected card, and delivers new verdicts", async () => {
    const { dir, store } = repo();
    await init(dir);
    const id = store.fileCard(draft({ touches: ["schema"] }), BODY, { agent: "a" }).card.meta.id;
    put(dir, "migrations/1.sql", "create table runs();");
    expect(commit(dir, `Runs table\n\nBaesian-Card: ${id}\n`).code).toBe(0);
    store.addVerdict({ card: id, revision: 1, response: "reject", comment: "Use Parquet.", ...REVIEWER });
    put(dir, "migrations/2.sql", "alter table runs add x;");
    const r = commit(dir, `More runs\n\nBaesian-Card: ${id}\n`);
    expect(r.code).toBe(1);
    expect(r.err).toContain("baesian: 1 new verdict since this branch's last commit");
    expect(r.err).toContain(`${id} was rejected by gus (a person): "Use Parquet."`);
    expect(r.err).toMatch(/Commits already built on it: [0-9a-f]{7}/);
  });

  it("lets commits through untouched where Baesian isn't set up", async () => {
    const { dir, store } = repo();
    await init(dir);
    // A clone that got the versioned hooks but where nobody ran `baesian init`: no live layer.
    rmSync(store.live, { recursive: true });
    put(dir, "package.json", pkg({ hono: "^4" }));
    const r = commit(dir, "Add hono\n");
    expect(r.code).toBe(0);
    expect(r.err).not.toContain("baesian");
  });

  it("refuses to commit when Baesian can't be found, with how to fix it", async () => {
    const { dir } = repo();
    await init(dir, []); // no fallback, and baesian isn't on PATH
    put(dir, "a.txt", "a");
    const r = commit(dir, "A\n");
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/baesian: not on PATH; install it \(npm i -g baesian\) or commit with --no-verify/);
  });
});
