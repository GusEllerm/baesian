import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
import { hookBlock, writeHook } from "../src/hooks.js";
import { BODY, REVIEWER, cleanup, draft, repo, sh } from "./helpers.js";

afterEach(cleanup);

// Hooks run the real CLI from source. `baesian` isn't on PATH, so they use the fallback (D48).
const ROOT = process.cwd();
const FALLBACK = [join(ROOT, "node_modules", ".bin", "tsx"), join(ROOT, "src", "bin.ts")];
const PATH = [dirname(process.execPath), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"].join(":");
const ENV = { ...process.env, PATH, BAESIAN_OS_NOTIFY: "0", BAESIAN_CONFIG: "/nonexistent" };

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

describe("installing the gate (D54)", () => {
  it("creates versioned hooks and points git at them", async () => {
    const { dir } = repo();
    const out = await init(dir);
    expect(out).toMatch(/pre-commit created, commit-msg created, post-commit created in \.githooks\//);
    // Read the real setting: `sh` overrides core.hooksPath for its own commands.
    expect(spawnSync("git", ["config", "core.hooksPath"], { cwd: dir, encoding: "utf8" }).stdout.trim()).toBe(".githooks");
    expect(await init(dir)).not.toMatch(/git gate/); // unchanged the second time
  });

  it("inserts its block after the shebang of an existing hook that ends in exec", () => {
    const { dir } = repo();
    const path = join(dir, "pre-commit");
    writeFileSync(path, "#!/bin/sh\n# livedocs\nexec livedocs hook pre-commit\n");
    expect(writeHook(path, hookBlock("pre-commit", FALLBACK))).toBe("inserted");
    const text = readFileSync(path, "utf8");
    expect(text.indexOf("baesian hook pre-commit")).toBeLessThan(text.indexOf("exec livedocs"));
    expect(text.startsWith("#!/bin/sh\n# >>> baesian >>>")).toBe(true);
    expect(writeHook(path, hookBlock("pre-commit", FALLBACK))).toBe("unchanged");
    expect(writeHook(path, hookBlock("pre-commit", ["/other/node", "/other/bin.js"]))).toBe("updated");
    expect(readFileSync(path, "utf8").match(/>>> baesian >>>/g)).toHaveLength(1);
  });
});

describe("the gate on real commits", { timeout: 60_000 }, () => {
  it("blocks an uncovered dependency, and lets an ack through", async () => {
    const { dir } = repo();
    await init(dir);
    put(dir, "package.json", pkg({ hono: "^4" }));
    const blocked = commit(dir, "Add hono\n");
    expect(blocked.code).toBe(1);
    expect(blocked.err).toContain("baesian: commit blocked.");
    expect(blocked.err).toContain("Baesian-Ack: dep:hono <why this is fine>");
    const ok = commit(dir, "Add hono\n\nBaesian-Ack: dep:hono a two-way door: tiny, swappable router\n");
    expect(ok.code).toBe(0);
    expect(ok.err).toContain("decisions covered: dep:hono (ack)");
  });

  it("covers by card, records the ledger, and syncs it into the record on the next commit", async () => {
    const { dir, store } = repo();
    await init(dir);
    const id = store.fileCard(draft({ touches: ["dependency"] }), BODY, { agent: "a" }).card.meta.id;
    put(dir, "package.json", pkg({ "better-sqlite3": "^11" }));
    const r = commit(dir, `Use SQLite\n\nBaesian-Card: ${id}\n`);
    expect(r.err).toContain(`dep:better-sqlite3 (${id})`);
    expect(r.code).toBe(0);
    const sha = sh(dir, "rev-parse", "HEAD");
    const ledger = store.ledger(id);
    expect(ledger.map((e) => e.meta.commit)).toEqual([sha]);
    expect(ledger[0]?.body).toContain("`package.json`");

    // The card file itself was staged by pre-commit, so it is in that commit.
    expect(sh(dir, "ls-tree", "-r", "--name-only", "HEAD")).toContain(`.baesian/cards/${id}/r1.md`);
    // The ledger entry was written after that commit; the next commit's pre-commit picks it up.
    put(dir, "README.md", "hi\n");
    expect(commit(dir, "Docs\n").code).toBe(0);
    expect(sh(dir, "ls-tree", "-r", "--name-only", "HEAD")).toMatch(new RegExp(`\\.baesian/ledger/${id}-`));
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
    expect(r.err).toContain("new verdicts since this branch's last commit");
    expect(r.err).toContain(`${id} was rejected: Use Parquet.`);
    expect(r.err).toMatch(/Commits already built on it: [0-9a-f]{10}/);
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
