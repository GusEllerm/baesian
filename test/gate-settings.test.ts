import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cite } from "../src/cite.js";
import { main } from "../src/cli.js";
import { CONFIG_PATH, type Snapshot, detectFacts } from "../src/facts.js";
import { DEFAULT_IGNORE, DEFAULT_INFRA, DEFAULT_SCHEMA, pathSetting, pathsLoosening } from "../src/gate-paths.js";
import { detectStaged } from "../src/gate.js";
import { openRepo } from "../src/git.js";
import { globToRegExp, uncovered } from "../src/globs.js";
import { TODAY, loosening } from "../src/routing.js";
import { Preferences } from "../src/schema.js";
import { Store, ValidationError, proofPath } from "../src/store.js";
import { describeVerify as describeVerifyLines, verify } from "../src/verify.js";
import { cleanup, repo, sh } from "./helpers.js";
import { ORIGIN, TestPasskey, TestService } from "./service.js";
import { plain } from "../src/style.js";

/** What the agent reads, in plain text. */
const describeVerify = (...a: Parameters<typeof describeVerifyLines>) => plain(describeVerifyLines(...a));

// B-qkek1: who may change what the commit gate looks for. The gate's settings (gate_schema, gate_infra, gate_api,
// gate_ignore) moved from the committed config, which agents edit, into the preference files, which only the client
// writes and which, in a hosted repo, count only when the service signed them. A change that makes the gate see less is
// loosening, judged by comparing the globs, and takes the passkey there (D163).

afterEach(cleanup);

async function cli(dir: string, args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const io = { out: (l: string) => out.push(l), err: (l: string) => err.push(l), stdin: () => "", cwd: dir, notify: () => {} };
  const code = await main(["node", "baesian", ...args], io);
  return { code, out: out.join("\n"), err: err.join("\n") };
}

/** One path changed, from nothing to some text. */
function added(path: string, text = "x\n"): Snapshot {
  return { changes: () => [{ status: "A", path }], before: () => undefined, after: () => text };
}

/** Edit the worktree's committed config. */
function setConfig(dir: string, change: (c: Record<string, unknown>) => Record<string, unknown>): void {
  const path = join(dir, CONFIG_PATH);
  writeFileSync(path, `${JSON.stringify(change(JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>), null, 2)}\n`);
}

/** A runtime dependency added to package.json. */
function addDependency(dir: string, name = "left-pad"): void {
  writeFileSync(join(dir, "package.json"), `${JSON.stringify({ name: "app", dependencies: { [name]: "1.0.0" } }, null, 2)}\n`);
}

const WHO = { by: "gus", client: "test" };
const settings = (paths: object) => ({ ...TODAY, paths });

describe("comparing globs (uncovered)", () => {
  it("says which globs match a path the others don't, exactly as the gate reads them", () => {
    expect(uncovered(["**/schema.ts"], ["src/schema.ts", "schema.ts", "a/b/schema.ts"])).toEqual([]);
    expect(uncovered(["src/schema.ts"], ["**/schema.ts"])).toEqual(["**/schema.ts"]);
    expect(uncovered(["**"], ["**/migrations/**", "*.sql", ".github/workflows/**"])).toEqual([]);
    expect(uncovered(["**/*.sql"], ["*.sql", "db/*.sql", "a/**/b.sql"])).toEqual([]);
    expect(uncovered(["*.sql"], ["db/*.sql"])).toEqual(["db/*.sql"]);
    expect(uncovered(["**/migrations/**"], ["db/migrations/**", "migrations/x/*.sql"])).toEqual([]);
    expect(uncovered(["db/migrations/**"], ["**/migrations/**"])).toEqual(["**/migrations/**"]);
    expect(uncovered(["src/**"], ["src/*.ts", "src/a/b.ts"])).toEqual([]);
    expect(uncovered(["src/*.ts"], ["src/**"])).toEqual(["src/**"]);
    expect(uncovered(["a?c"], ["abc"])).toEqual([]);
    expect(uncovered(["abc"], ["a?c"])).toEqual(["a?c"]);
    // Covered only by two together: neither alone matches every path in deploy/**.
    expect(uncovered(["deploy/*", "deploy/*/**"], ["deploy/**"])).toEqual([]);
    expect(uncovered(["deploy/*"], ["deploy/**"])).toEqual(["deploy/**"]);
    // Nothing covers anything but the empty list.
    expect(uncovered([], ["a"])).toEqual(["a"]);
    expect(uncovered(["a"], [])).toEqual([]);
  });

  it("agrees with the gate's own matcher on sample paths", () => {
    const paths = ["a.sql", "db/a.sql", "db/migrations/1.sql", "migrations/1.sql", "src/schema.ts", "x/schema.ts", "schema.ts", ".github/workflows/ci.yml", "deploy/x/y", "deploy/z"];
    const globs = [...DEFAULT_SCHEMA, ...DEFAULT_INFRA, "deploy/*", "deploy/**", "src/*.ts", "*.sql", "**"];
    for (const a of globs) {
      for (const b of globs) {
        // Where uncovered() says b is covered by a, no sample path matches b and not a.
        if (uncovered([a], [b]).length) continue;
        for (const p of paths) if (globToRegExp(b).test(p)) expect(globToRegExp(a).test(p), `${a} should cover ${b} at ${p}`).toBe(true);
      }
    }
  });
});

describe("what makes the gate see less is loosening (D163, B-qkek1)", () => {
  it("a narrower schema, infra or API list, or a wider ignore; not the reverse", () => {
    expect(pathsLoosening({}, {})).toEqual([]);
    // Narrower: the built-in list without one glob, and an API list emptied.
    expect(pathsLoosening({}, { schema: DEFAULT_SCHEMA.filter((g) => g !== "**/*.sql") })).toEqual(['it narrows gate_schema, which no longer covers "**/*.sql"']);
    expect(pathsLoosening({}, { infra: [] })[0]).toMatch(/^it narrows gate_infra, which no longer covers ".github\/workflows\/\*\*", /);
    expect(pathsLoosening({ api: ["src/index.ts"] }, {})).toEqual(['it narrows gate_api, which no longer covers "src/index.ts"']);
    expect(pathsLoosening({ api: ["src/**"] }, { api: ["src/index.ts"] })).toEqual(['it narrows gate_api, which no longer covers "src/**"']);
    expect(pathsLoosening({}, { ignore: ["**"] })).toEqual(['it widens gate_ignore to "**"']);
    expect(pathsLoosening({ ignore: ["docs/**"] }, { ignore: ["docs/**", "test/**"] })).toEqual(['it widens gate_ignore to "test/**"']);
    // Wider, or the same in other words: no loosening.
    expect(pathsLoosening({}, { schema: [...DEFAULT_SCHEMA, "src/formats/**"], infra: ["**"], api: ["src/index.ts"] })).toEqual([]);
    expect(pathsLoosening({ schema: ["src/schema.ts"] }, { schema: ["**/schema.ts"] })).toEqual([]);
    expect(pathsLoosening({ ignore: ["docs/**", "test/**"] }, { ignore: ["docs/**"] })).toEqual([]);
    expect(pathsLoosening({ ignore: ["docs/**"] }, { ignore: ["docs/notes/**"] })).toEqual([]);
    // Ignoring what's ignored anyway sees no less.
    expect(pathsLoosening({}, { ignore: ["node_modules/**", ".baesian/cards/**"] })).toEqual([]);
    // In loosening(), beside the rows: so the store's judgement and the relay's passkey both ask for it.
    expect(loosening(TODAY, settings({ ignore: ["**"] }))).toEqual(['it widens gate_ignore to "**"']);
    expect(loosening(settings({ ignore: ["**"] }), TODAY)).toEqual([]);
  });

  it("keeps a list as a file holds it: trimmed and without repeats, and left out when it's the built-in one", () => {
    expect(pathSetting("schema", [...DEFAULT_SCHEMA].reverse())).toBeUndefined();
    expect(pathSetting("schema", [" src/x.ts ", "", "src/x.ts"])).toEqual(["src/x.ts"]);
    expect(pathSetting("schema", [])).toEqual([]);
    expect(pathSetting("api", [])).toBeUndefined();
    expect(pathSetting("ignore", ["  "])).toBeUndefined();
  });
});

describe("the gate reads what it looks at from the preferences in force (B-qkek1)", () => {
  it("with none, the built-in lists, which count a schema.ts module as a schema", () => {
    const { store } = repo();
    expect(store.inForce().settings.paths).toEqual({});
    expect(detectStaged(store, added("src/schema.ts")).facts.map((f) => f.id)).toEqual(["schema:src/schema.ts"]);
    expect(detectStaged(store, added("db/schema.ts")).facts.map((f) => f.id)).toEqual(["schema:db/schema.ts"]);
    expect(detectStaged(store, added("node_modules/x/schema.ts")).facts).toEqual([]);
    expect(DEFAULT_IGNORE).toContain(".baesian/**");
  });

  it("from the newest file: its schema, infra and API lists and its ignores; and a row change keeps them", () => {
    const { store } = repo();
    const first = store.writePreferences({ gate_schema: ["formats/**"], gate_infra: ["deploy/**"], gate_ignore: ["generated/**"], gate_api: ["src/index.ts"] }, WHO);
    expect(first.file).toMatchObject({ gate_schema: ["formats/**"], gate_infra: ["deploy/**"], gate_ignore: ["generated/**"], gate_api: ["src/index.ts"] });
    expect(store.inForce().settings.paths).toEqual({ schema: ["formats/**"], infra: ["deploy/**"], ignore: ["generated/**"], api: ["src/index.ts"] });
    const ids = (path: string) => detectStaged(store, added(path)).facts.map((f) => f.id);
    expect(ids("formats/card.json")).toEqual(["schema:formats/card.json"]);
    expect(ids("db/0001.sql")).toEqual([]);
    expect(ids("deploy/prod.yml")).toEqual(["infra:deploy/prod.yml"]);
    expect(ids(".github/workflows/ci.yml")).toEqual([]);
    expect(ids("generated/formats/x.json")).toEqual([]);
    // A row moved, with nothing said about the gate's lists: they're kept.
    const second = store.writePreferences({ replaces: first.name, row_infra: "stop-and-ask" }, WHO);
    expect(second.file).toMatchObject({ row_infra: "stop-and-ask", gate_schema: ["formats/**"], gate_ignore: ["generated/**"] });
    // Back to the built-in lists, sent as they are, and the API's turned off: each left out of the file.
    const third = store.writePreferences({ replaces: second.name, gate_schema: [...DEFAULT_SCHEMA], gate_api: [], gate_ignore: [] }, WHO);
    expect(third.file.gate_schema).toBeUndefined();
    expect(third.file.gate_api).toBeUndefined();
    expect(third.file.gate_ignore).toBeUndefined();
    expect(third.file.gate_infra).toEqual(["deploy/**"]);
    // An empty schema list is kept: the gate looks for none.
    const fourth = store.writePreferences({ replaces: third.name, gate_schema: [] }, WHO);
    expect(fourth.file.gate_schema).toEqual([]);
    expect(ids("db/0001.sql")).toEqual([]);
    expect(() => store.writePreferences({ replaces: fourth.name, gate_schema: "src/**" as unknown as string[] }, WHO)).toThrow(ValidationError);
    expect(Preferences.safeParse({ ...fourth.file, gate_ignore: [" spaced "] }).success).toBe(false);
  });

  it("a config that still has the gate's old keys is read no longer: the attack of 2026-11-05 fails as the dependency it is, and both check and verify say so", async () => {
    const { dir } = repo();
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", "Set up");
    const base = sh(dir, "rev-parse", "HEAD");
    setConfig(dir, (c) => ({ ...c, gate_ignore: ["**"], gate_schema: ["nothing/**"] }));
    addDependency(dir);
    sh(dir, "add", "-A");
    const check = await cli(dir, ["check"]);
    expect(check.code).toBe(1);
    expect(check.out).toContain("dep:left-pad");
    expect(check.out).toContain(`warning: ${CONFIG_PATH} still has gate_schema and gate_ignore, which the gate no longer reads:`);
    expect(check.out).toContain('in the client (Your preferences, then "What the gate looks for")');
    // The config's own change is no fact any more: the keys do nothing.
    expect(check.out).not.toContain(`infra:${CONFIG_PATH}`);
    sh(dir, "commit", "-q", "-m", "Ignore everything in the config, and add a dependency");
    const r = verify(openRepo(dir), base, { merge: false, pinned: null });
    expect(r.ok).toBe(false);
    expect(r.commits[0]?.report.uncovered.map((f) => f.id)).toEqual(["dep:left-pad"]);
    // Said once, for HEAD, not with every commit.
    expect(r.warnings?.filter((w) => w.includes("which the gate no longer reads"))).toHaveLength(1);
    expect(r.commits[0]?.report.warnings).toEqual([]);
    expect(describeVerify(r).join("\n")).toContain(`warning: ${CONFIG_PATH} still has gate_schema and gate_ignore`);
  });

  it("a newest file that can't be read: the built-in lists, saying so", () => {
    const { store } = repo();
    const { name } = store.writePreferences({ gate_ignore: ["**"] }, WHO);
    writeFileSync(join(store.live, "preferences", name), "{ not json");
    const d = detectStaged(store, added("db/0001.sql"));
    expect(d.facts.map((f) => f.id)).toEqual(["schema:db/0001.sql"]);
    expect(d.warnings[0]).toMatch(/can't be read .*, so the gate looks where it does by default$/);
  });
});

describe("in a hosted repo, only a signed preference file sets what the gate looks at, and one that makes it see less takes the passkey (D163)", () => {
  /** A repo linked to the service, a passkey enrolled, everything committed; and CI's pin, with the passkey. */
  function linked() {
    const { dir, store } = repo();
    const service = new TestService();
    const passkey = new TestPasskey();
    store.setLink({ service: ORIGIN, project: service.project, first_commit: sh(dir, "rev-list", "--max-parents=0", "HEAD") });
    service.link(store);
    service.enrol(store, passkey);
    store.syncRecord();
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", "Link", "-m", `Baesian-Ack: infra:${CONFIG_PATH} linked the repo`);
    const base = sh(dir, "rev-parse", "HEAD");
    const ci = () => verify(openRepo(dir), base, { merge: false, pinned: service.pinned(passkey) });
    /** Put a preference file, and whatever's beside it, into the record by hand, as a commit could. */
    const intoRecord = (rel: string) => {
      for (const f of [rel, `${rel}.sig`, proofPath(rel)]) {
        if (!existsSync(join(store.live, f))) continue;
        mkdirSync(dirname(join(store.record, f)), { recursive: true });
        copyFileSync(join(store.live, f), join(store.record, f));
      }
    };
    const commit = (message: string) => {
      sh(dir, "add", "-A");
      sh(dir, "commit", "-q", "-m", message);
    };
    const reset = () => {
      sh(dir, "reset", "-q", "--hard", base);
      sh(dir, "clean", "-qfd");
      rmSync(join(store.live, "preferences"), { recursive: true, force: true });
    };
    return { dir, store, service, passkey, ci, intoRecord, commit, reset };
  }

  it("verify refuses a commit that relies on an unsigned loosening, or a signed one without the passkey; it takes one with it", () => {
    const { dir, service, passkey, ci, intoRecord, commit, reset } = linked();
    // The attack, moved to where the settings now live: a preference file nobody signed, ignoring everything.
    intoRecord(service.preferences(Store.open(dir), { gate_ignore: ["**"] }, { unsigned: true }).rel);
    addDependency(dir);
    commit("Ignore everything in an unsigned preference file, and add a dependency");
    const unsigned = ci();
    expect(unsigned.ok).toBe(false);
    expect(unsigned.commits.at(-1)?.report.uncovered.map((f) => f.id)).toEqual(["dep:left-pad"]);
    expect(unsigned.hosted?.skipped).toContainEqual({ file: expect.stringMatching(/^preferences\//), why: `it has no signature, so the service didn't write it${cite("D138")}` });

    // Signed by the service, but without the passkey: it lets more past you, so it doesn't count either.
    reset();
    intoRecord(service.preferences(Store.open(dir), { gate_ignore: ["**"] }).rel);
    addDependency(dir);
    commit("Ignore everything, signed, with no passkey");
    const unproved = ci();
    expect(unproved.ok).toBe(false);
    expect(unproved.hosted?.skipped.map((s) => s.why)).toContainEqual(`it lets more cards past you (it widens gate_ignore to "**"), so it takes your passkey${cite("D163")}, and has no passkey proof`);

    // With the reviewer's passkey it's theirs, and the gate looks where they said.
    reset();
    intoRecord(service.preferences(Store.open(dir), { gate_ignore: ["**"] }, { passkey }).rel);
    addDependency(dir);
    commit("Ignore everything, as the reviewer chose");
    const proved = ci();
    expect(proved.ok, describeVerify(proved).join("\n")).toBe(true);
  });

  it("a signed change that makes the gate see more counts without the passkey, locally and in verify", () => {
    const { dir, store, service, ci, intoRecord, commit } = linked();
    const wider = service.preferences(store, { gate_schema: [...DEFAULT_SCHEMA, "formats/**"] });
    expect(Store.open(dir).inForce().name).toBe(wider.name);
    expect(Store.open(dir).inForce().settings.paths.schema).toContain("formats/**");
    intoRecord(wider.rel);
    writeFileSync(join(dir, "formats.md"), "x\n");
    mkdirSync(join(dir, "formats"));
    writeFileSync(join(dir, "formats", "card.json"), "{}\n");
    commit("A new format");
    const r = ci();
    expect(r.ok).toBe(false);
    expect(r.commits.at(-1)?.report.uncovered.map((f) => f.id)).toEqual(["schema:formats/card.json"]);
    // Locally too, from the live layer.
    expect(detectStaged(Store.open(dir), added("formats/x.json")).facts.map((f) => f.id)).toEqual(["schema:formats/x.json"]);
    // And narrowing it again, signed but without the passkey, doesn't count.
    const narrower = service.preferences(store, { gate_schema: [...DEFAULT_SCHEMA] });
    expect(Store.open(dir).inForce().name).toBe(wider.name);
    expect(Store.open(dir).uncounted()).toContainEqual({ file: narrower.rel, why: `it lets more cards past you (it narrows gate_schema, which no longer covers "formats/**"), so it takes your passkey${cite("D163")}, and has no passkey proof` });
  });
});

describe("the config's other changes stay out of the gate's sight", () => {
  it("whatever the gate's old keys do in it", () => {
    const snap = (before: object, after: object): Snapshot => ({
      changes: () => [{ status: "M", path: CONFIG_PATH }],
      before: () => JSON.stringify(before),
      after: () => JSON.stringify(after),
    });
    expect(detectFacts(snap({ format: 1 }, { format: 1, gate_ignore: ["**"] })).facts).toEqual([]);
    expect(detectFacts(snap({ format: 1 }, { format: 1, vault: "docs" })).facts).toEqual([]);
  });
});
