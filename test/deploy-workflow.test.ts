import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { FIRST_STABLE, VERSION, compareReleases, isRelease } from "../src/version.js";

// The release workflow (.github/workflows/deploy.yml): a tag on main deploys the service (B-bk20v), then publishes the
// command line to npm by trusted publishing (B-xr2fa), from the first npm release on (B-h0vyy), then makes the release's
// page on GitHub Releases from the notes its release commit wrote (B-yj9wc). Its steps' scripts run here as GitHub runs
// them, with bash, so what decides whether a tag publishes is tested, not only read.

const ROOT = join(import.meta.dirname, "..");

interface Step {
  name?: string;
  id?: string;
  uses?: string;
  run?: string;
  if?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
}
interface Job {
  needs?: string | string[];
  if?: string;
  permissions?: Record<string, string>;
  outputs?: Record<string, string>;
  steps: Step[];
}
interface Workflow {
  on: unknown;
  permissions: Record<string, string>;
  env: Record<string, string>;
  jobs: Record<string, Job>;
}

const workflow = parse(readFileSync(join(ROOT, ".github", "workflows", "deploy.yml"), "utf8")) as Workflow;
const deploy = workflow.jobs.deploy!;
const publish = workflow.jobs.publish!;
const release = workflow.jobs.release!;
const step = (job: Job, name: string) => job.steps.find((s) => s.name === name)!;

const folders: string[] = [];
afterAll(() => {
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Run a step's script as GitHub does (`bash --noprofile --norc -eo pipefail`), with a tag, returning its outputs. */
function runStep(s: Step, tag: string, env: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "baesian-workflow-"));
  folders.push(dir);
  const output = join(dir, "output");
  const r = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", s.run!], {
    cwd: ROOT,
    encoding: "utf8",
    env: { PATH: process.env.PATH, ...workflow.env, GITHUB_REF_NAME: tag, GITHUB_OUTPUT: output, ...env },
  });
  let outputs: Record<string, string> = {};
  try {
    outputs = Object.fromEntries(readFileSync(output, "utf8").trim().split("\n").filter(Boolean).map((l) => l.split("=") as [string, string]));
  } catch {
    // the step wrote none
  }
  return { status: r.status, stdout: r.stdout, outputs };
}

describe("the release workflow", () => {
  it("runs on a release tag, lets no job but the publishing one ask GitHub for an identity token, and none but the release one write to the repo", () => {
    expect(workflow.on).toEqual({ push: { tags: ["v*"] } });
    expect(workflow.permissions).toEqual({ "contents": "read" });
    expect(deploy.permissions).toBeUndefined();
    expect(publish.permissions).toEqual({ "contents": "read", "id-token": "write" });
    expect(release.permissions).toEqual({ "contents": "write" });
    for (const [name, job] of Object.entries(workflow.jobs)) if (name !== "publish") expect(job.permissions?.["id-token"], name).toBeUndefined();
    for (const [name, job] of Object.entries(workflow.jobs)) if (name !== "release") expect(job.permissions?.contents ?? "read", name).toBe("read");
  });

  it("checks the tag against package.json, service/package.json and the plugin's manifest, which agree (B-3femd)", () => {
    const check = step(deploy, "The tag matches every version the release commit sets");
    const version = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version as string;
    expect(runStep(check, `v${version}`).status).toBe(0);
    const wrong = runStep(check, "v0.0.1");
    expect(wrong.status).toBe(1);
    expect(wrong.stdout).toContain(`::error::v0.0.1 doesn't match package.json's version (v${version})`);
  });
});

describe("publishing to npm (B-xr2fa)", () => {
  it("comes after the service is deployed, only when the deploy job says this release goes to npm", () => {
    expect(publish.needs).toBe("deploy");
    expect(publish.if).toBe("needs.deploy.outputs.npm == 'true'");
    expect(deploy.outputs).toEqual({ npm: "${{ steps.npm.outputs.publish }}" });
  });

  it("builds afresh on Node 24, with no npm cache and no install scripts, and publishes with npm 11.5.1 or later", () => {
    const node = publish.steps.find((s) => s.uses?.startsWith("actions/setup-node@"))!;
    expect(node.with).toEqual({ "node-version": 24, "registry-url": "https://registry.npmjs.org", "package-manager-cache": false });
    expect(publish.steps.find((s) => s.uses?.startsWith("actions/checkout@"))?.with).toEqual({ "persist-credentials": false });
    const runs = publish.steps.flatMap((s) => (s.run ? [s.run.trim()] : []));
    expect(runs).toContain("npm ci --ignore-scripts");
    expect(runs.at(-1)).toBe("npm publish");
    // No token: npm's trusted publisher for the package names this repo and this file.
    expect(JSON.stringify(publish)).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN|secrets\./);
    const npm = step(publish, "npm publishes by trusted publishing (11.5.1 or later)");
    expect(runStep(npm, "v1.0.0", { PATH: fakeNpm("11.5.1") }).status).toBe(0);
    expect(runStep(npm, "v1.0.0", { PATH: fakeNpm("12.0.0") }).status).toBe(0);
    expect(runStep(npm, "v1.0.0", { PATH: fakeNpm("11.4.2") }).status).toBe(1);
  });

  it("leaves a version npm has already, published by hand or by an earlier run", () => {
    const has = step(publish, "Whether npm has this version already");
    expect(runStep(has, "v1.0.0", { PATH: fakeNpm("11.6.0", 0) }).outputs).toEqual({ already: "true" });
    expect(runStep(has, "v1.0.0", { PATH: fakeNpm("11.6.0", 1) }).outputs).toEqual({ already: "false" });
    for (const s of publish.steps.filter((x) => x.run?.trim().startsWith("npm ci") || x.run?.trim() === "npm publish")) {
      expect(s.if).toBe("steps.published.outputs.already == 'false'");
    }
  });
});

/** A folder on PATH whose `npm` reports a version, and answers `npm view` with an exit status; node and the rest as they are. */
function fakeNpm(version: string, view = 1): string {
  const dir = mkdtempSync(join(tmpdir(), "baesian-npm-"));
  folders.push(dir);
  const script = `#!/bin/sh\nif [ "$1" = "--version" ]; then echo ${version}; exit 0; fi\nif [ "$1" = "view" ]; then exit ${view}; fi\nexit 2\n`;
  spawnSync("sh", ["-c", `cat > "${dir}/npm" && chmod +x "${dir}/npm"`], { input: script });
  return `${dir}:${process.env.PATH}`;
}

describe("which releases go to npm (B-h0vyy)", () => {
  const gate = step(deploy, "Whether npm gets this release");
  const publishes = (tag: string) => runStep(gate, tag).outputs.publish;
  const first = workflow.env.FIRST_NPM_RELEASE!;

  it("is set in one place, the workflow's FIRST_NPM_RELEASE, and the deploy job's step reads it", () => {
    expect(first).toMatch(/^\d+\.\d+\.\d+$/);
    const mentions = readFileSync(join(ROOT, ".github", "workflows", "deploy.yml"), "utf8").match(/FIRST_NPM_RELEASE: /g);
    expect(mentions).toHaveLength(1);
    expect(gate.run).toContain("$FIRST_NPM_RELEASE");
  });

  it("never a 0.1.x tag: those deploy the service only", () => {
    for (let n = 0; n <= 12; n++) {
      const r = runStep(gate, `v0.1.${n}`);
      expect(r.outputs.publish, `v0.1.${n}`).toBe("false");
      expect(r.stdout).toContain(`::notice::v0.1.${n} deploys the service only: npm gets releases from v${first} on`);
    }
  });

  it("each release from the first on, and none before it or a pre-release", () => {
    const [major, minor, patch] = first.split(".").map(Number) as [number, number, number];
    expect(publishes(`v${first}`)).toBe("true");
    expect(publishes(`v${major}.${minor}.${patch + 1}`)).toBe("true");
    expect(publishes(`v${major}.${minor + 10}.0`)).toBe("true");
    expect(publishes(`v${major + 1}.0.0`)).toBe("true");
    if (patch > 0) expect(publishes(`v${major}.${minor}.${patch - 1}`)).toBe("false");
    if (minor > 0) expect(publishes(`v${major}.${minor - 1}.9`)).toBe("false");
    if (major > 0) expect(publishes(`v${major - 1}.99.99`)).toBe("false");
    expect(publishes(`v${major + 1}.0.0-rc.1`)).toBe("false");
  });
});

/**
 * A folder on PATH whose `gh` logs each call's arguments, and answers `gh release view` and `gh release create` with an
 * exit status each; with `calls()`, what it was called with, in order.
 */
function fakeGh(view: number, create = 0) {
  const dir = mkdtempSync(join(tmpdir(), "baesian-gh-"));
  folders.push(dir);
  const log = join(dir, "calls");
  const gh = join(dir, "gh");
  writeFileSync(gh, `#!/bin/sh\nprintf '%s\\n' "$@" "@@" >> "${log}"\nif [ "$1 $2" = "release view" ]; then exit ${view}; fi\nif [ "$1 $2" = "release create" ]; then exit ${create}; fi\nexit 2\n`);
  chmodSync(gh, 0o755);
  return {
    path: `${dir}:${process.env.PATH}`,
    calls: () => (existsSync(log) ? readFileSync(log, "utf8").split("@@\n").filter(Boolean).map((c) => c.trimEnd().split("\n")) : []),
  };
}

describe("the release's page on GitHub Releases (B-yj9wc)", () => {
  const NOTES = join(ROOT, "docs", "release-notes");
  const notes = step(deploy, "The release commit wrote the release's notes");
  const create = step(release, "GitHub Releases gets the release's notes");
  const REPO = { GITHUB_REPOSITORY: "GusEllerm/baesian" };

  it("needs the notes the release commit wrote, before anything is deployed", () => {
    const names = deploy.steps.map((s) => s.name);
    expect(names.indexOf(notes.name)).toBeGreaterThan(-1);
    expect(names.indexOf(notes.name)).toBeLessThan(names.indexOf("Migrate the accounts database"));
    expect(names.indexOf(notes.name)).toBeLessThan(names.indexOf("Deploy the service"));
    for (const file of readdirSync(NOTES)) expect(runStep(notes, `v${file.replace(/\.md$/, "")}`).status, file).toBe(0);
    const missing = runStep(notes, "v9.9.9");
    expect(missing.status).toBe(1);
    expect(missing.stdout).toContain("::error::v9.9.9 has no release notes: write them in docs/release-notes/9.9.9.md in the release commit");
  });

  it("are a file for each release in docs/release-notes, this one's from 1.0.0 on, which the package leaves out", () => {
    const files = readdirSync(NOTES);
    expect(files).toContain(`${FIRST_STABLE}.md`);
    for (const file of files) expect(file.endsWith(".md") && isRelease(file.slice(0, -3)), file).toBe(true);
    // The release commit that sets package.json's version writes its notes too, or this fails before the tag does.
    if (compareReleases(VERSION, FIRST_STABLE) >= 0) expect(files).toContain(`${VERSION}.md`);
    // B-yj9wc: the notes are on GitHub, not in the package people install.
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { files: string[] };
    expect(pkg.files.filter((f) => !f.startsWith("!"))).toEqual(["dist"]);
  });

  it("comes last, once the service is live and the command line is on npm, or once npm isn't due this release", () => {
    expect(release.needs).toEqual(["deploy", "publish"]);
    expect(release.if).toBe("${{ !cancelled() && needs.deploy.result == 'success' && (needs.publish.result == 'success' || needs.publish.result == 'skipped') }}");
    expect(release.steps.find((s) => s.uses?.startsWith("actions/checkout@"))?.with).toEqual({ "persist-credentials": false });
    expect(create.env).toEqual({ GH_TOKEN: "${{ secrets.GITHUB_TOKEN }}" });
  });

  it("is made from the tag, titled with the release and holding its notes, and a pre-release is marked as one", () => {
    const gh = fakeGh(1);
    expect(runStep(create, "v1.0.0", { PATH: gh.path, ...REPO }).status).toBe(0);
    expect(gh.calls()).toEqual([
      ["release", "view", "v1.0.0", "--repo", "GusEllerm/baesian"],
      ["release", "create", "v1.0.0", "--repo", "GusEllerm/baesian", "--verify-tag", "--title", "Baesian 1.0.0", "--notes-file", "docs/release-notes/1.0.0.md"],
    ]);
    const pre = fakeGh(1);
    expect(runStep(create, "v1.1.0-rc.1", { PATH: pre.path, ...REPO }).status).toBe(0);
    expect(pre.calls()[1]).toEqual([
      "release", "create", "v1.1.0-rc.1", "--repo", "GusEllerm/baesian", "--verify-tag", "--title", "Baesian 1.1.0-rc.1",
      "--notes-file", "docs/release-notes/1.1.0-rc.1.md", "--prerelease",
    ]);
  });

  it("leaves a release GitHub has already, from an earlier run, and fails when GitHub won't make one", () => {
    const has = fakeGh(0);
    const r = runStep(create, "v1.0.0", { PATH: has.path, ...REPO });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("::notice::v1.0.0 is on GitHub Releases already: left as it is");
    expect(has.calls()).toHaveLength(1);
    const refused = fakeGh(1, 1);
    expect(runStep(create, "v1.0.0", { PATH: refused.path, ...REPO }).status).toBe(1);
  });
});
