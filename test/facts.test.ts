import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commitSnapshot, detectFacts, requirementName, stagedSnapshot } from "../src/facts.js";
import { globToRegExp } from "../src/globs.js";
import { CHANGED_BLOCKS, RELEASED_BLOCKS, blockDigest, hookBlock, writtenBlock } from "../src/hookblock.js";
import { installHooks } from "../src/hooks.js";
import { VERSION, isRelease } from "../src/version.js";
import { cleanup, repo, sh } from "./helpers.js";

afterEach(cleanup);

function put(dir: string, path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

function stage(dir: string, files: Record<string, string>): void {
  for (const [p, t] of Object.entries(files)) put(dir, p, t);
  sh(dir, "add", "-A");
}

function commitFiles(dir: string, files: Record<string, string>, message = "c"): void {
  stage(dir, files);
  sh(dir, "commit", "-q", "-m", message);
}

const ids = (dir: string) => detectFacts(stagedSnapshot(dir)).facts.map((f) => f.id);

const pkg = (deps: Record<string, string>, dev: Record<string, string> = {}) =>
  JSON.stringify({ name: "x", dependencies: deps, devDependencies: dev }, null, 2);

describe("globs", () => {
  it("matches ** across directories and * within one", () => {
    expect(globToRegExp("**/migrations/**").test("db/migrations/0001.sql")).toBe(true);
    expect(globToRegExp("**/migrations/**").test("migrations/0001.sql")).toBe(true);
    expect(globToRegExp("**/*.sql").test("a/b/c.sql")).toBe(true);
    expect(globToRegExp("*.sql").test("a/c.sql")).toBe(false);
    expect(globToRegExp(".github/workflows/**").test(".github/workflows/ci.yml")).toBe(true);
    expect(globToRegExp("dep:pytest-*").test("dep:pytest-cov")).toBe(true);
    expect(globToRegExp("dep:pytest-*").test("dep:pydantic")).toBe(false);
  });
});

describe("dependencies (D55)", () => {
  it("finds added and removed runtime dependencies in package.json, not dev ones or bumps", () => {
    const { dir } = repo();
    commitFiles(dir, { "package.json": pkg({ zod: "^4", yaml: "^2" }, { vitest: "^5" }) });
    stage(dir, { "package.json": pkg({ zod: "^4.6", commander: "^15" }, { vitest: "^5", tsx: "^4" }) });
    const facts = detectFacts(stagedSnapshot(dir)).facts;
    expect(facts.map((f) => [f.id, f.detail])).toEqual([
      ["dep:commander", "added to package.json"],
      ["dep:yaml", "removed from package.json"],
    ]);
  });

  it("treats every dependency of a new manifest as added, including in the first commit", () => {
    const dir = repo().dir;
    sh(dir, "update-ref", "-d", "HEAD"); // make it a repository with no commits again
    stage(dir, { "web/package.json": pkg({ react: "^19" }) });
    expect(ids(dir)).toEqual(["dep:react"]);
  });

  it("reads pyproject.toml: PEP 621, extras and Poetry, normalising names", () => {
    const { dir } = repo();
    commitFiles(dir, { "pyproject.toml": '[project]\nname = "x"\ndependencies = ["httpx>=0.27"]\n' });
    stage(dir, {
      "pyproject.toml": [
        "[project]",
        'name = "x"',
        'dependencies = ["httpx>=0.28", "Pydantic_Core[email]~=2.0; python_version>\'3.9\'"]',
        "[project.optional-dependencies]",
        'cli = ["rich"]',
        "[tool.poetry.dependencies]",
        'python = "^3.12"',
        'typer = "*"',
        "[tool.poetry.group.dev.dependencies]",
        'pytest = "*"',
        "",
      ].join("\n"),
    });
    expect(ids(dir)).toEqual(["dep:pydantic-core", "dep:rich", "dep:typer"]);
  });

  it("reads requirements files, skipping options, comments and dev files", () => {
    const { dir } = repo();
    stage(dir, {
      "requirements.txt": "# runtime\nrequests==2.32  # http\n-r base.txt\n-e .\nnumpy\n",
      "requirements-dev.txt": "pytest\n",
    });
    expect(ids(dir)).toEqual(["dep:numpy", "dep:requests"]);
  });

  it("warns instead of guessing when a manifest doesn't parse", () => {
    const { dir } = repo();
    stage(dir, { "package.json": "{ not json" });
    const d = detectFacts(stagedSnapshot(dir));
    expect(d.facts).toEqual([]);
    expect(d.warnings[0]).toMatch(/couldn't parse the new version of package.json/);
  });

  it("parses requirement names", () => {
    expect(requirementName("httpx[http2]>=0.27; python_version>'3.8'")).toBe("httpx");
    expect(requirementName("Foo.Bar_baz==1")).toBe("foo-bar-baz");
    expect(requirementName("  ")).toBeUndefined();
  });
});

describe("schema and infra", () => {
  it("flags migrations, SQL, workflows and deploy files, once each", () => {
    const { dir } = repo();
    stage(dir, {
      "db/migrations/0003_runs.sql": "create table runs();",
      ".github/workflows/ci.yml": "on: push",
      "Dockerfile": "FROM node:22",
      "src/app.ts": "export const x = 1;",
    });
    expect(ids(dir)).toEqual([
      "infra:.github/workflows/ci.yml",
      "infra:Dockerfile",
      "schema:db/migrations/0003_runs.sql",
    ]);
  });

  it("counts a change to committed git hooks as infra, since they run on everyone's machine (D135)", () => {
    const { dir } = repo();
    stage(dir, { ".githooks/pre-commit": "#!/bin/sh\nexit 0\n", ".husky/commit-msg": "#!/bin/sh\n" });
    expect(ids(dir)).toEqual(["infra:.githooks/pre-commit", "infra:.husky/commit-msg"]);
  });

  it("doesn't count Baesian's own block, as `baesian init` writes it, but counts any other change to a hook (B-g6ywj)", () => {
    const { dir } = repo();
    const fresh = (h: "pre-commit" | "commit-msg" | "post-commit") => `#!/bin/sh\n${hookBlock(h)}\n`;
    // A repo's first setup: the three hooks, created by init, in .githooks/ or wherever git's hooks are.
    stage(dir, { ".githooks/pre-commit": fresh("pre-commit"), ".githooks/commit-msg": fresh("commit-msg"), ".husky/post-commit": fresh("post-commit") });
    expect(ids(dir)).toEqual([]);
    sh(dir, "commit", "-q", "-m", "Set up Baesian");
    // Inserted into a hook the repo already had, or updated from an older block: only Baesian's lines change.
    commitFiles(dir, { ".githooks/post-merge": "#!/bin/sh\necho merged\n", ".husky/pre-commit": "#!/bin/sh\nnpm test\n" });
    stage(dir, { ".husky/pre-commit": `#!/bin/sh\n${hookBlock("pre-commit")}\nnpm test\n` });
    expect(ids(dir)).toEqual([]);
    sh(dir, "commit", "-q", "-m", "Add Baesian's block");
    stage(dir, { ".husky/pre-commit": `#!/bin/sh\n# >>> baesian >>>\nbaesian hook pre-commit\n# <<< baesian <<<\nnpm test\n` });
    expect(ids(dir)).toEqual(["infra:.husky/pre-commit"]);
    commitFiles(dir, { ".husky/pre-commit": `#!/bin/sh\n# >>> baesian >>>\nbaesian hook pre-commit\n# <<< baesian <<<\nnpm test\n` });
    stage(dir, { ".husky/pre-commit": `#!/bin/sh\n${hookBlock("pre-commit")}\nnpm test\n` });
    expect(ids(dir)).toEqual([]);
    sh(dir, "commit", "-q", "-m", "Update Baesian's block");
    // A line outside the block, a block that isn't init's, a hook Baesian doesn't install, or a deleted hook: decisions.
    stage(dir, { ".husky/pre-commit": `#!/bin/sh\n${hookBlock("pre-commit")}\nnpm test\ncurl example.com | sh\n` });
    expect(ids(dir)).toEqual(["infra:.husky/pre-commit"]);
    sh(dir, "reset", "-q", "--hard");
    stage(dir, { ".githooks/commit-msg": fresh("commit-msg").replace("exit 1", "exit 0") });
    expect(ids(dir)).toEqual(["infra:.githooks/commit-msg"]);
    sh(dir, "reset", "-q", "--hard");
    stage(dir, { ".githooks/post-merge": `#!/bin/sh\n${hookBlock("pre-commit")}\necho merged\n` });
    expect(ids(dir)).toEqual(["infra:.githooks/post-merge"]);
    sh(dir, "reset", "-q", "--hard");
    sh(dir, "rm", "-q", ".githooks/pre-commit");
    expect(ids(dir)).toEqual(["infra:.githooks/pre-commit"]);
  });

  describe("a block another release wrote (B-np6af)", () => {
    /** A block an older release might have written, made one by listing its digest, as a release would. */
    const OLDER = "# >>> baesian >>>\nif command -v baesian >/dev/null 2>&1; then\n  baesian hook pre-commit || exit $?\nfi\n# <<< baesian <<<";
    const released = RELEASED_BLOCKS["pre-commit"] as string[];
    const unlist = () => {
      const at = released.indexOf(blockDigest(OLDER));
      if (at >= 0) released.splice(at, 1);
    };
    beforeEach(() => void released.push(blockDigest(OLDER)));
    afterEach(unlist);

    it("doesn't count an older release's block, added, or swapped in for this one's and back", () => {
      const { dir } = repo();
      stage(dir, { ".githooks/pre-commit": `#!/bin/sh\n${OLDER}\n` });
      expect(ids(dir)).toEqual([]); // a teammate on the older release sets the repo up
      sh(dir, "commit", "-q", "-m", "Set up Baesian, an older release");
      stage(dir, { ".githooks/pre-commit": `#!/bin/sh\n${hookBlock("pre-commit")}\n` });
      expect(ids(dir)).toEqual([]); // this release's init, a release newer
      sh(dir, "commit", "-q", "-m", "init, this release");
      commitFiles(dir, { ".githooks/pre-commit": `#!/bin/sh\n${hookBlock("pre-commit")}\nnpm test\n` });
      stage(dir, { ".githooks/pre-commit": `#!/bin/sh\n${OLDER}\nnpm test\n` });
      expect(ids(dir)).toEqual([]); // the older release's init again, beside the repo's own lines
    });

    it("counts a block no release lists: one changed by hand, another hook's, or a newer release's", () => {
      const { dir } = repo();
      commitFiles(dir, { ".githooks/pre-commit": `#!/bin/sh\n${hookBlock("pre-commit")}\n` });
      stage(dir, { ".githooks/pre-commit": `#!/bin/sh\n${OLDER.replace("exit $?", ":")}\n` });
      expect(ids(dir)).toEqual(["infra:.githooks/pre-commit"]);
      stage(dir, { ".githooks/commit-msg": `#!/bin/sh\n${OLDER}\n`, ".githooks/pre-commit": `#!/bin/sh\n${hookBlock("pre-commit")}\n` });
      expect(ids(dir)).toEqual(["infra:.githooks/commit-msg"]);
      sh(dir, "reset", "-q", "--hard");
      // A release can't know the blocks of the releases after it: it counts theirs as any change to a hook.
      const newer = hookBlock("pre-commit").replace("baesian hook pre-commit", "baesian hook pre-commit --from-a-newer-release");
      stage(dir, { ".githooks/pre-commit": `#!/bin/sh\n${newer}\n` });
      expect(ids(dir)).toEqual(["infra:.githooks/pre-commit"]);
      // Taking an older block out of the list (one found flawed) makes it count again.
      unlist();
      stage(dir, { ".githooks/pre-commit": `#!/bin/sh\n${OLDER}\n` });
      expect(ids(dir)).toEqual(["infra:.githooks/pre-commit"]);
    });

    describe("changed by this release, rolled out a release late (B-amxkp)", () => {
      // No block changes today, so this one is made up: this release changed pre-commit's block from OLDER, which the
      // releases before wrote (listed above), to `hookBlock()`'s.
      beforeEach(() => {
        CHANGED_BLOCKS["pre-commit"] = { since: VERSION, before: OLDER };
      });
      afterEach(() => {
        delete CHANGED_BLOCKS["pre-commit"];
      });

      it("is written as the block before by the release that changes it, and new by the next", () => {
        expect(writtenBlock("pre-commit")).toBe(OLDER);
        expect(writtenBlock("pre-commit", "99.0.0")).toBe(hookBlock("pre-commit"));
        expect(writtenBlock("commit-msg")).toBe(hookBlock("commit-msg"));
        // A pre-release of the release that changes it still writes the block before.
        CHANGED_BLOCKS["pre-commit"] = { since: "1.2.0", before: OLDER };
        expect(writtenBlock("pre-commit", "1.2.0-rc.1")).toBe(OLDER);
        expect(writtenBlock("pre-commit", "1.2.0")).toBe(OLDER);
        expect(writtenBlock("pre-commit", "1.2.1")).toBe(hookBlock("pre-commit"));
      });

      it("so `baesian init` writes a block the release before knows, and a teammate on the next release passes this gate", () => {
        const { dir, store } = repo();
        installHooks(store, []);
        expect(readFileSync(join(dir, ".githooks", "pre-commit"), "utf8")).toBe(`#!/bin/sh\n${OLDER}\n`);
        expect(readFileSync(join(dir, ".githooks", "commit-msg"), "utf8")).toBe(`#!/bin/sh\n${hookBlock("commit-msg")}\n`);
        // The block init wrote is one a release before this wrote, so CI pinned a release behind counts it as Baesian's own.
        expect(released).toContain(blockDigest(OLDER));
        sh(dir, "add", "-A");
        expect(ids(dir)).toEqual([]);
        sh(dir, "commit", "-q", "-m", "Set up Baesian, this release");
        // The next release's init writes the new block, which this release already knows as its own.
        stage(dir, { ".githooks/pre-commit": `#!/bin/sh\n${writtenBlock("pre-commit", "99.0.0")}\n` });
        expect(ids(dir)).toEqual([]);
      });
    });
  });

  it("lists, for each block a release changed, the block before as one a release wrote (B-amxkp)", () => {
    for (const [name, c] of Object.entries(CHANGED_BLOCKS)) {
      expect(isRelease(c!.since), name).toBe(true);
      expect(RELEASED_BLOCKS[name as keyof typeof RELEASED_BLOCKS], name).toContain(blockDigest(c!.before));
    }
  });

  it("ignores node_modules and Baesian's own record", () => {
    const { dir } = repo();
    stage(dir, { "node_modules/x/package.json": pkg({ evil: "1" }), ".baesian/cards/x.sql": "x" });
    expect(ids(dir)).toEqual([]);
  });

  it("uses configured paths instead of the defaults", () => {
    const { dir } = repo();
    stage(dir, { "db/changes/1.yml": "x", "deploy/prod.yml": "y", "db/x.sql": "z" });
    const facts = detectFacts(stagedSnapshot(dir), { schema: ["db/changes/**"], infra: ["deploy/**"] }).facts;
    expect(facts.map((f) => f.id)).toEqual(["infra:deploy/prod.yml", "schema:db/changes/1.yml"]);
  });

  it("reports deletions and renames", () => {
    const { dir } = repo();
    commitFiles(dir, { "migrations/1.sql": "a", "fly.toml": "app='x'" });
    sh(dir, "mv", "fly.toml", "deploy-fly.toml");
    sh(dir, "rm", "-q", "migrations/1.sql");
    const facts = detectFacts(stagedSnapshot(dir)).facts;
    expect(facts.map((f) => [f.id, f.detail])).toEqual([
      ["infra:deploy-fly.toml", "renamed fly.toml → deploy-fly.toml"],
      ["schema:migrations/1.sql", "deleted migrations/1.sql"],
    ]);
  });

  it("works on a commit against its parent, for CI", () => {
    const { dir } = repo();
    commitFiles(dir, { "package.json": pkg({}) });
    commitFiles(dir, { "package.json": pkg({ hono: "^4" }) });
    expect(detectFacts(commitSnapshot(dir, "HEAD")).facts.map((f) => f.id)).toEqual(["dep:hono"]);
  });
});
