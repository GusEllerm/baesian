import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
import { BODY, REVIEWER, cleanup, draft, repo, sh } from "./helpers.js";

// M6's pre-commit hook (D170, D122), through real commits with the hooks live, as hooks.test.ts runs them: the CLI
// from source through the fallback (D48), with a PATH that holds only node and git.

afterEach(cleanup);

const ROOT = process.cwd();
const FALLBACK = [join(ROOT, "node_modules", ".bin", "tsx"), join(ROOT, "src", "bin.ts")];
const BIN_DIR = mkdtempSync(join(tmpdir(), "baesian-test-bin-"));
for (const tool of ["node", "git"]) {
  const real = tool === "node" ? process.execPath : execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  symlinkSync(real, join(BIN_DIR, tool));
}
const PATH = [BIN_DIR, "/usr/bin", "/bin"].join(":");
afterAll(() => rmSync(BIN_DIR, { recursive: true, force: true }));

const AGENT = { agent: "claude-code" };
const VAULT = "docs/vault";

async function init(dir: string, args: string[] = []): Promise<string> {
  const out: string[] = [];
  const io = { out: (l: string) => out.push(l), err: (l: string) => out.push(l), stdin: () => "", cwd: dir, hookFallback: FALLBACK };
  await main(["node", "baesian", "init", "--no-agents", ...args], io);
  return out.join("\n");
}

function commit(dir: string, message: string, path = PATH) {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-F", "-"], {
    cwd: dir,
    input: message,
    encoding: "utf8",
    env: { ...process.env, PATH: path, BAESIAN_OS_NOTIFY: "0", BAESIAN_CONFIG: "/nonexistent" },
  });
  return { code: r.status, err: r.stderr };
}

function put(dir: string, path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
  sh(dir, "add", "--", path);
}

const inHead = (dir: string) => sh(dir, "ls-tree", "-r", "--name-only", "HEAD").split("\n");
const notesInHead = (dir: string) => inHead(dir).filter((p) => p.startsWith(`${VAULT}/Decisions/`) || p.startsWith(`${VAULT}/Rules/`));
const pkg = (deps: Record<string, string>) => JSON.stringify({ name: "x", dependencies: deps }, null, 2);

/** A repo with the gate installed and a vault recorded, committed. */
async function gated() {
  const r = repo();
  put(r.dir, `${VAULT}/Home.md`, "# Home\n");
  await init(r.dir, ["--vault", VAULT]);
  expect(commit(r.dir, "Set up Baesian\n").code).toBe(0);
  return r;
}

describe("the pre-commit hook writes the vault's notes (D170)", { timeout: 120_000 }, () => {
  it("writes and stages a note for each decision the first time, and nothing the next", async () => {
    const { dir, store } = await gated();
    const ids = ["storage/run-metadata", "storage/run-files"].map((topic, i) => {
      const id = store.fileCard(draft({ topic, title: `Decision ${i + 1}` }), BODY, { ...AGENT, force: true }).card.meta.id;
      store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
      return id;
    });
    put(dir, "README.md", "hi\n");
    const first = commit(dir, "Docs\n");
    expect(first.code).toBe(0);
    expect(first.err).toContain(`baesian: staged 2 vault notes (${VAULT}/)`);
    expect(notesInHead(dir)).toEqual(ids.map((id, i) => `${VAULT}/Decisions/${id} Decision ${i + 1}.md`).sort());
    put(dir, "README.md", "hi again\n");
    const next = commit(dir, "More docs\n");
    expect(next.code).toBe(0);
    expect(next.err).not.toContain("vault note");
    expect(sh(dir, "status", "--porcelain", "--", VAULT, ".baesian")).toBe("");
  });

  it("unstages them with the record when the gate blocks the commit, and the next commit takes them (D122)", async () => {
    const { dir, store } = await gated();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    put(dir, "package.json", pkg({ hono: "^4" }));
    const blocked = commit(dir, "Add hono\n");
    expect(blocked.code).toBe(1);
    expect(blocked.err).toContain("baesian: staged 1 vault note");
    expect(sh(dir, "diff", "--cached", "--name-only")).toBe("package.json");
    expect(sh(dir, "status", "--porcelain", "--untracked-files=all", "--", VAULT)).toBe(`?? "${VAULT}/Decisions/${id} The run-metadata store.md"`);
    expect(commit(dir, "Add hono\n\nBaesian-Ack: dep:hono a small router\n").code).toBe(0);
    expect(notesInHead(dir)).toEqual([`${VAULT}/Decisions/${id} The run-metadata store.md`]);

    // A note that changes, unstaged again by a blocked commit, is Baesian's own change: the next commit stages it.
    store.addVerdict({ card: id, revision: 1, response: "alternative", choice: "Postgres", ...REVIEWER });
    put(dir, "package.json", pkg({ hono: "^4", zod: "^4" }));
    expect(commit(dir, "Add zod\n").code).toBe(1);
    expect(sh(dir, "diff", "--cached", "--name-only", "--", VAULT)).toBe("");
    expect(sh(dir, "diff", "--name-only", "--", VAULT)).toBe(`${VAULT}/Decisions/${id} The run-metadata store.md`);
    const ok = commit(dir, "Add zod\n\nBaesian-Ack: dep:zod validation\n");
    expect(ok.code).toBe(0);
    expect(ok.err).toContain("baesian: staged 1 vault note");
    expect(sh(dir, "show", `HEAD:${VAULT}/Decisions/${id} The run-metadata store.md`)).toContain("## Changed on");
    expect(sh(dir, "status", "--porcelain", "--", VAULT, ".baesian")).toBe("");
  });

  it("leaves a note with someone's unstaged edit as it is, and says so", async () => {
    const { dir, store } = await gated();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    put(dir, "README.md", "hi\n");
    expect(commit(dir, "Docs\n").code).toBe(0);
    const path = join(dir, VAULT, "Decisions", `${id} The run-metadata store.md`);
    writeFileSync(path, readFileSync(path, "utf8").replace("## Background", "My own thought, not staged yet.\n\n## Background"));
    store.addVerdict({ card: id, revision: 1, response: "alternative", choice: "Postgres", ...REVIEWER });
    put(dir, "README.md", "hi again\n");
    const r = commit(dir, "More docs\n");
    expect(r.code).toBe(0);
    expect(r.err).toContain(`baesian: left ${VAULT}/Decisions/${id} The run-metadata store.md as it is: it has changes you haven't staged.`);
    expect(sh(dir, "show", `HEAD:${VAULT}/Decisions/${id} The run-metadata store.md`)).not.toContain("My own thought");
    // Once it's staged, the next commit brings it up to date, keeping the edit.
    sh(dir, "add", "--", path);
    put(dir, "README.md", "and again\n");
    expect(commit(dir, "Docs, again\n").code).toBe(0);
    const committed = sh(dir, "show", `HEAD:${VAULT}/Decisions/${id} The run-metadata store.md`);
    expect(committed).toContain("My own thought");
    expect(committed).toContain("## Changed on");
  });

  it("writes nothing without a vault, and warns without blocking when the vault is gone", async () => {
    const plain = repo();
    await init(plain.dir);
    const id = plain.store.fileCard(draft(), BODY, AGENT).card.meta.id;
    plain.store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    put(plain.dir, "README.md", "hi\n");
    const r = commit(plain.dir, "Docs\n");
    expect(r.code).toBe(0);
    expect(r.err).not.toContain("vault");
    expect(existsSync(join(plain.dir, VAULT))).toBe(false);

    const { dir, store } = await gated();
    sh(dir, "rm", "-q", "-r", VAULT);
    const other = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: other, revision: 1, response: "accept", ...REVIEWER });
    const gone = commit(dir, "Drop the vault\n");
    expect(gone.code).toBe(0);
    expect(gone.err).toContain(`baesian: the vault ${VAULT}/ that .baesian/config.json names isn't there; no vault notes written`);
    expect(existsSync(join(dir, VAULT))).toBe(false);
  });
});

let livedocsPath: string | undefined;
try {
  livedocsPath = dirname(execFileSync("which", ["livedocs"], { encoding: "utf8" }).trim());
  execFileSync("livedocs", ["--help"], { stdio: "ignore" });
} catch {
  livedocsPath = undefined; // not installed: the livedocs test is skipped, like M3a's
}

describe.skipIf(!livedocsPath)("with the real livedocs (D175)", { timeout: 120_000 }, () => {
  it("passes a commit carrying the notes, and stamps them as snapshots", async () => {
    const { dir, store } = repo();
    execFileSync("livedocs", ["new-vault", VAULT], { cwd: dir, stdio: "ignore" });
    await init(dir, ["--vault", VAULT]);
    const path = [BIN_DIR, livedocsPath!, ...(process.env.PATH ?? "").split(":").filter((p) => !p.includes(".nvm") && !p.includes("node_modules"))].join(":");
    sh(dir, "add", "-A");
    // Committed hooks run on everyone's machine, so the gate asks about them (D135).
    const acks = ["pre-commit", "commit-msg", "post-commit"].map((h) => `Baesian-Ack: infra:.githooks/${h} the gate's own hooks`).join("\n");
    const setUp = commit(dir, `Set up the vault and Baesian\n\n${acks}\n`, path);
    expect(setUp.err).not.toContain("blocked");
    expect(setUp.code).toBe(0);
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    put(dir, "README.md", "hi\n");
    const r = commit(dir, "Docs\n", path);
    expect(r.code).toBe(0);
    const note = `Decisions/${id} The run-metadata store.md`;
    expect(notesInHead(dir)).toEqual([`${VAULT}/${note}`]);
    const stamps = readFileSync(join(dir, VAULT, ".livedocs", "stamps.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(stamps.filter((s) => s.note === note)).toEqual([expect.objectContaining({ snapshot: true, bindings: {} })]);
    expect(readdirSync(join(dir, VAULT, "Decisions"))).toHaveLength(1);
  });
});
