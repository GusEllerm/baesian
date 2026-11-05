import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
import { CONFIG_PATH, type Snapshot, detectFacts } from "../src/facts.js";
import { openRepo } from "../src/git.js";
import { describeVerify, verify } from "../src/verify.js";
import { cleanup, repo, sh } from "./helpers.js";
import { ORIGIN, TestService } from "./service.js";

// B-qkek1: who may change what the commit gate looks for. The stopgap first: a commit that changes any of the gate's own
// settings in the committed config is a gate fact, as linking the repo is (B-w4g6c), so it can't widen what the gate
// ignores and slip a decision past it unseen.

afterEach(cleanup);

async function cli(dir: string, args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const io = { out: (l: string) => out.push(l), err: (l: string) => err.push(l), stdin: () => "", cwd: dir, notify: () => {} };
  const code = await main(["node", "baesian", ...args], io);
  return { code, out: out.join("\n"), err: err.join("\n") };
}

/** Two versions of the config, as a commit changes it. */
function snapshot(before: object | undefined, after: object | undefined): Snapshot {
  const text = (c: object | undefined) => (c === undefined ? undefined : `${JSON.stringify(c, null, 2)}\n`);
  const status = before === undefined ? "A" : after === undefined ? "D" : "M";
  return { changes: () => [{ status, path: CONFIG_PATH }], before: () => text(before), after: () => text(after) };
}

const FACT = `infra:${CONFIG_PATH}`;

/** Edit the worktree's committed config. */
function setConfig(dir: string, change: (c: Record<string, unknown>) => Record<string, unknown>): void {
  const path = join(dir, CONFIG_PATH);
  writeFileSync(path, `${JSON.stringify(change(JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>), null, 2)}\n`);
}

/** A runtime dependency added to package.json. */
function addDependency(dir: string, name = "left-pad"): void {
  writeFileSync(join(dir, "package.json"), `${JSON.stringify({ name: "app", dependencies: { [name]: "1.0.0" } }, null, 2)}\n`);
}

describe("the stopgap: changing the gate's settings in the config is a gate fact (B-qkek1)", () => {
  it("for any gate_* key added, changed or removed, whatever the config ignores; not for its other fields", () => {
    const facts = (before: object | undefined, after: object | undefined, ignore?: string[]) => detectFacts(snapshot(before, after), ignore ? { ignore } : {}).facts;
    const ids = (before: object | undefined, after: object | undefined) => facts(before, after).map((f) => f.id);
    expect(ids({ format: 1 }, { format: 1, gate_ignore: ["**"] })).toEqual([FACT]);
    expect(ids({ format: 1, gate_schema: ["a/**"] }, { format: 1, gate_schema: ["b/**"] })).toEqual([FACT]);
    expect(ids({ format: 1, gate_infra: ["deploy/**"] }, { format: 1 })).toEqual([FACT]);
    expect(ids({ format: 1 }, { format: 1, gate_api: ["src/index.ts"] })).toEqual([FACT]);
    expect(ids(undefined, { format: 1, gate_ignore: ["vendor/**"] })).toEqual([FACT]);
    // The gate's settings kept as they were, beside another change, are no fact.
    expect(ids({ format: 1, gate_schema: ["a", "b"] }, { format: 1, gate_schema: ["a", "b"], vault: "docs" })).toEqual([]);
    expect(ids({ format: 1 }, { format: 1, vault: "docs" })).toEqual([]);
    // Checked before anything is ignored, so a gate_ignore can't hide the change that makes it.
    expect(facts({ format: 1 }, { format: 1, gate_ignore: ["**"] }, ["**"]).map((f) => f.id)).toEqual([FACT]);
    expect(facts({ format: 1 }, { format: 1, gate_ignore: ["**"] })[0]?.detail).toBe(`changed what the gate looks at (gate_ignore) in ${CONFIG_PATH}`);
    const link = { service: "https://baesian.example", project: "p-one" };
    expect(facts({ format: 1 }, { format: 1, ...link, gate_ignore: ["**"] })[0]?.detail).toBe(
      `linked the repo to https://baesian.example as project p-one; and changed what the gate looks at (gate_ignore) in ${CONFIG_PATH}`,
    );
  });

  it("the attack of 2026-11-05: ignoring everything while adding a dependency needs a card or an ack, at the commit gate and in verify", async () => {
    const { dir } = repo();
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", "Set up");
    const base = sh(dir, "rev-parse", "HEAD");
    setConfig(dir, (c) => ({ ...c, gate_ignore: ["**"] }));
    addDependency(dir);
    sh(dir, "add", "-A");
    const blocked = await cli(dir, ["check"]);
    expect(blocked.code).toBe(1);
    expect(blocked.out).toContain(FACT);
    writeFileSync(join(dir, "MSG"), `Ignore everything\n\nBaesian-Ack: ${FACT} the repo's own test fixture\n`);
    expect((await cli(dir, ["check", "--message", "MSG"])).code).toBe(0);
    rmSync(join(dir, "MSG"));
    sh(dir, "commit", "-q", "-m", "Ignore everything, with no card or ack");
    const r = verify(openRepo(dir), base, { merge: false, pinned: null });
    expect(r.ok).toBe(false);
    expect(describeVerify(r).join("\n")).toContain(FACT);
  });

  it("in a hosted repo, with the keys pinned in CI, as the test of 2026-11-05 ran it", () => {
    const { dir, store } = repo();
    const service = new TestService();
    store.setLink({ service: ORIGIN, project: service.project, first_commit: sh(dir, "rev-list", "--max-parents=0", "HEAD") });
    service.link(store);
    store.syncRecord();
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", "Link", "-m", `Baesian-Ack: ${FACT} linked the repo`);
    const base = sh(dir, "rev-parse", "HEAD");
    const commit = (message: string) => {
      sh(dir, "add", "-A");
      sh(dir, "commit", "-q", "-m", message);
      return verify(openRepo(dir), base, { merge: false, pinned: service.pinned() });
    };
    setConfig(dir, (c) => ({ ...c, gate_ignore: ["**"] }));
    addDependency(dir);
    const attack = commit("Ignore everything and add a dependency");
    expect(attack.ok).toBe(false);
    expect(attack.commits.at(-1)?.report.uncovered.map((f) => f.id)).toEqual([FACT]);
    // The control: the dependency alone fails too, as the dependency it is.
    sh(dir, "reset", "-q", "--hard", base);
    addDependency(dir);
    const control = commit("Add a dependency");
    expect(control.commits.at(-1)?.report.uncovered.map((f) => f.id)).toEqual(["dep:left-pad"]);
    // A change to the config's other fields is no fact.
    sh(dir, "reset", "-q", "--hard", base);
    setConfig(dir, (c) => ({ ...c, vault: "docs" }));
    const other = commit("Name the vault");
    expect(other.ok, describeVerify(other).join("\n")).toBe(true);
  });
});
