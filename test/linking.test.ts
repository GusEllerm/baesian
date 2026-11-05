import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
import { CONFIG_PATH, type Snapshot, detectFacts } from "../src/facts.js";
import { openRepo } from "../src/git.js";
import { DEFAULT_SERVICE } from "../src/login.js";
import { Config } from "../src/schema.js";
import { SHALLOW_HISTORY, Store, recordAtLinking } from "../src/store.js";
import { describeVerify, verify } from "../src/verify.js";
import { REVIEWER, cleanup, draft, repo, sh } from "./helpers.js";
import { ORIGIN, TestService } from "./service.js";

// M9d: what linking a repo changes on the repo's side. Changing the config's service, project or first commit is a gate
// fact (B-w4g6c), and answers already in the record when the repo was linked count as they are (B-45xz8).

afterEach(cleanup);

const AGENT = { agent: "claude-code" };

async function cli(dir: string, args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const io = { out: (l: string) => out.push(l), err: (l: string) => err.push(l), stdin: () => "", cwd: dir, notify: () => {} };
  const code = await main(["node", "baesian", ...args], io);
  return { code, out: out.join("\n"), err: err.join("\n") };
}

/** Two versions of the config, as a commit changes it. */
function snapshot(before: object | undefined, after: object | undefined, path = CONFIG_PATH): Snapshot {
  const text = (c: object | undefined) => (c === undefined ? undefined : `${JSON.stringify(c, null, 2)}\n`);
  const status = before === undefined ? "A" : after === undefined ? "D" : "M";
  return { changes: () => [{ status, path }], before: () => text(before), after: () => text(after) };
}

const LINK = { service: "https://baesian.example", project: "p-one", first_commit: "a".repeat(40) };

describe("changing where a repo's cards go is a gate fact (B-w4g6c)", () => {
  it("when the config's service, project or first commit changes, linking first included; not for the rest of .baesian/", () => {
    const fact = (before: object | undefined, after: object | undefined) => detectFacts(snapshot(before, after)).facts.map((f) => f.id);
    expect(fact({ format: 1 }, { format: 1, ...LINK })).toEqual([`infra:${CONFIG_PATH}`]);
    expect(fact({ format: 1, ...LINK }, { format: 1, ...LINK, project: "p-two" })).toEqual([`infra:${CONFIG_PATH}`]);
    expect(fact({ format: 1, ...LINK }, { format: 1, ...LINK, service: "https://elsewhere.example" })).toEqual([`infra:${CONFIG_PATH}`]);
    expect(fact({ format: 1, ...LINK }, { format: 1, ...LINK, first_commit: "b".repeat(40) })).toEqual([`infra:${CONFIG_PATH}`]);
    expect(fact({ format: 1, ...LINK }, { format: 1 })).toEqual([`infra:${CONFIG_PATH}`]);
    expect(fact(undefined, { format: 1, ...LINK })).toEqual([`infra:${CONFIG_PATH}`]);
    expect(fact({ format: 1 }, { format: 1, vault: "docs" })).toEqual([]);
    expect(fact({ format: 1, ...LINK }, { format: 1, ...LINK, vault: "docs" })).toEqual([]);
    expect(detectFacts(snapshot({}, {}, ".baesian/cards/B-7f3kq/r1.md")).facts).toEqual([]);
    // A repo's own gate_ignore can't hide it.
    expect(detectFacts(snapshot({ format: 1 }, { format: 1, ...LINK }), { ignore: [".baesian/config.json", "**"] }).facts.map((f) => f.id)).toEqual([`infra:${CONFIG_PATH}`]);
    expect(detectFacts(snapshot({ format: 1 }, { format: 1, ...LINK })).facts[0]?.detail).toBe("linked the repo to https://baesian.example as project p-one");
  });

  it("blocks the commit that links a repo until the ack `baesian login` prints covers it, at the commit gate and in verify", async () => {
    const { dir, store } = repo();
    const base = sh(dir, "rev-parse", "HEAD");
    store.setLink({ ...LINK, first_commit: base });
    sh(dir, "add", "-A");
    const blocked = await cli(dir, ["check"]);
    expect(blocked.code).toBe(1);
    expect(blocked.out).toContain(`infra:${CONFIG_PATH}`);
    const message = join(dir, "MSG");
    writeFileSync(message, `Link the repo\n\nBaesian-Ack: infra:${CONFIG_PATH} linked this repo to ${LINK.service} as project p-one (baesian login, B-62qnz)\n`);
    expect((await cli(dir, ["check", "--message", "MSG"])).code).toBe(0);
    rmSync(message);
    sh(dir, "commit", "-q", "-m", "Link the repo without an ack");
    const r = verify(openRepo(dir), base, { merge: false, pinned: null });
    expect(r.ok).toBe(false);
    expect(describeVerify(r).join("\n")).toContain(`infra:${CONFIG_PATH}`);
  });

  it("is a config field set only in a linked repo", () => {
    expect(Config.safeParse({ first_commit: "a".repeat(40) }).success).toBe(false);
    expect(Config.safeParse({ ...LINK }).success).toBe(true);
    expect(Config.safeParse({ ...LINK, first_commit: "abc" }).success).toBe(false);
  });
});

describe("answers already in the record when the repo was linked count as they are (B-45xz8)", () => {
  /** A repo used locally, its answers committed, then linked to the service, and the service's key pulled. */
  function linkedLater() {
    const { dir, store } = repo();
    const before = store.fileCard(draft({ title: "Answered before linking" }), "", AGENT).card.meta.id;
    store.addVerdict({ card: before, revision: 1, response: "accept", ...REVIEWER });
    store.syncRecord();
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", "Used locally");
    const service = new TestService();
    store.setLink({ service: ORIGIN, project: service.project, first_commit: sh(dir, "rev-list", "--max-parents=0", "HEAD") });
    service.link(store);
    return { dir, store, service, before };
  }

  it("before the link is committed, and after; anything answered later needs the service's signature", () => {
    const { dir, store, before } = linkedLater();
    expect(store.hosted()).toBeDefined();
    // Linked in the worktree, not yet committed: the record at HEAD stands in for the linking commit.
    expect(Store.open(dir).view(() => Store.open(dir).status(before))).toBe("resolved");
    store.syncRecord();
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", "Link");
    const after = Store.open(dir);
    expect(after.status(before)).toBe("resolved");
    expect(after.uncounted()).toEqual([]);
    // An answer written on the machine after linking doesn't count (D138).
    const later = after.fileCard(draft({ title: "Answered after", topic: "storage/later" }), "", AGENT).card.meta.id;
    after.addVerdict({ card: later, revision: 1, response: "accept", ...REVIEWER });
    const again = Store.open(dir);
    expect(again.status(later)).toBe("open");
    expect(again.uncounted().map((u) => u.why)).toEqual(["it has no signature, so the service didn't write it (D138)"]);
    // A file edited since it was committed isn't the one that was trusted.
    const rel = again.uncounted()[0]!.file;
    expect(rel).toMatch(/^verdicts\//);
  });

  it("in CI, with the keys pinned, verify counts them; in a shallow clone it fails, saying to fetch the full history", () => {
    const { dir, store, service, before } = linkedLater();
    store.syncRecord();
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", "Link");
    sh(dir, "commit", "-q", "--allow-empty", "-m", "Later work");
    const base = sh(dir, "rev-parse", "HEAD~1");
    const full = verify(openRepo(dir), base, { merge: false, pinned: service.pinned() });
    expect(full.ok, describeVerify(full).join("\n")).toBe(true);
    expect(full.hosted?.skipped).toEqual([]);
    const ci = Store.overRecord(openRepo(dir), join(dir, ".baesian"), { pinned: service.pinned() });
    expect(ci.status(before)).toBe("resolved");
    // A shallow checkout, as CI's is by default: the commit that linked the repo is beyond its history.
    const shallow = `${dir}-shallow`;
    sh(tmpdir(), "clone", "-q", "--depth", "1", `file://${dir}`, shallow);
    try {
      const r = verify(openRepo(shallow), "HEAD", { merge: false, pinned: service.pinned() });
      expect(r.ok).toBe(false);
      expect(r.hosted?.skipped.map((s) => s.why)).toContain(SHALLOW_HISTORY);
      expect(describeVerify(r).join("\n")).toContain("can't be checked in a shallow clone (B-45xz8): fetch the full history (in CI, fetch-depth: 0)");
    } finally {
      rmSync(shallow, { recursive: true, force: true });
    }
  });

  it("only with the bytes the record held: a copy with other bytes under the same name doesn't count", () => {
    const { dir, store, before } = linkedLater();
    store.syncRecord();
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", "Link");
    const name = store.storage.list("verdicts").find((f) => f.includes(before))!;
    const rel = `verdicts/${name}`;
    const text = readFileSync(join(store.live, rel), "utf8").replace('"accept"', '"reject"');
    store.storage.replace(rel, Buffer.from(text));
    expect(Store.open(dir).judge(rel).ok).toBe(false);
    expect(Store.open(dir).status(before)).toBe("open");
  });
});

describe("`baesian login` links a repo to https://baesian.dev when no service is named (B-f2mfb)", () => {
  it("with neither --service nor $BAESIAN_SERVICE; either names another, and nothing is linked until it's approved", async () => {
    const { dir, store } = repo();
    /** Login, offline: the address it asks is all it reaches, so nothing ever leaves for a real service. */
    const login = async (args: string[], env: NodeJS.ProcessEnv = {}) => {
      const asked: string[] = [];
      const out: string[] = [];
      const err: string[] = [];
      const fetch = async (url: string | URL | Request) => {
        asked.push(String(url));
        throw new TypeError("fetch failed");
      };
      const io = { out: (l: string) => out.push(l), err: (l: string) => err.push(l), stdin: () => "", cwd: dir, notify: () => {}, env, http: { fetch: fetch as typeof globalThis.fetch } };
      const code = await main(["node", "baesian", "login", ...args], io);
      return { code, asked, out: out.join("\n"), err: err.join("\n") };
    };
    const plain = await login([]);
    expect(DEFAULT_SERVICE).toBe("https://baesian.dev");
    expect(plain.out).toContain("linking this repo to https://baesian.dev, the hosted service: to use another, run `baesian login --service <url>` instead");
    expect(plain.asked[0]).toMatch(/^https:\/\/baesian\.dev\//);
    expect(plain.code).toBe(1);
    expect(store.config().project).toBeUndefined();
    const fromEnv = await login([], { BAESIAN_SERVICE: "https://own.example" });
    expect(fromEnv.asked[0]).toMatch(/^https:\/\/own\.example\//);
    expect(fromEnv.out).not.toContain("baesian.dev");
    const fromFlag = await login(["--service", "https://flag.example"], { BAESIAN_SERVICE: "https://own.example" });
    expect(fromFlag.asked[0]).toMatch(/^https:\/\/flag\.example\//);
  });
});

describe("CI pins the project beside the keys, and finds the linking commit once, by ancestry (B-mar8x)", () => {
  /** A hard card: one that touches security, with what would show the pick wrong (D77). */
  const hard = (over: Record<string, unknown> = {}) => draft({ touches: ["security"], wrong_if: "tokens leak", check: "the audit log", ...over });

  /** Commit everything, at a date of the test's choosing: a commit's dates are whatever its author sets. */
  function commitAt(dir: string, message: string, date?: string): string {
    sh(dir, "add", "-A");
    const env = { ...process.env, ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}) };
    execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", message], { cwd: dir, env });
    return sh(dir, "rev-parse", "HEAD");
  }

  /** Answer a card on this machine, unsigned, and put the answer in the record by hand, as the test of 2026-11-05 did. */
  function answerByHand(store: Store, id: string): void {
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    store.syncRecord();
    const name = store.storage.list("verdicts").find((f) => f.includes(`-${id}-`))!;
    mkdirSync(join(store.record, "verdicts"), { recursive: true });
    writeFileSync(join(store.record, "verdicts", name), store.bytes(`verdicts/${name}`));
  }

  /**
   * A repo used locally, then linked on main: `answered`, a hard card answered on the machine and committed before linking,
   * so it's in the record at the linking commit (B-45xz8); then the link, with the ack `baesian login` prints.
   */
  function linkedOnMain() {
    const { dir, store } = repo();
    const answered = store.fileCard(hard({ title: "Answered before linking" }), "", AGENT).card.meta.id;
    store.addVerdict({ card: answered, revision: 1, response: "accept", ...REVIEWER });
    store.syncRecord();
    const before = commitAt(dir, "Used locally");
    const service = new TestService();
    const first = sh(dir, "rev-list", "--max-parents=0", "HEAD");
    store.setLink({ service: ORIGIN, project: service.project, first_commit: first });
    service.link(store);
    store.syncRecord();
    const linked = commitAt(dir, `Link this repo to Baesian\n\nBaesian-Ack: infra:${CONFIG_PATH} linked this repo (baesian login, B-62qnz)`);
    return { dir, store, service, answered, before, linked, first };
  }

  it("fails a commit that links the repo to a project of its own making, and the answer it wrote by hand doesn't count", () => {
    const { dir, store, service, linked, first } = linkedOnMain();
    store.setLink({ service: ORIGIN, project: "p-0000000000000000000a", first_commit: first });
    const forged = store.fileCard(hard({ title: "Drop the session check", topic: "security/sessions" }), "", AGENT).card.meta.id;
    answerByHand(store, forged);
    commitAt(dir, `Move the repo\n\nBaesian-Ack: infra:${CONFIG_PATH} moved to another project`);
    commitAt(dir, `Drop the session check\n\nBaesian-Card: ${forged}`);
    for (const merge of [false, true]) {
      const r = verify(openRepo(dir), linked, { merge, pinned: service.pinned() });
      expect(r.ok).toBe(false);
      expect(r.commits.map((c) => c.ok)).toEqual([false, false]);
      expect(r.commits[0]?.trust).toEqual([expect.stringContaining(".baesian/config.json names project p-0000000000000000000a, but CI pins project proj-test (B-mar8x)")]);
      expect(r.commits[1]?.report.problems.map((p) => p.problem)).toContain("hard-unresolved");
      expect(r.hosted).toMatchObject({ project: "proj-test", linked });
      if (merge) expect(r.merge?.problems[0]).toMatchObject({ card: forged, problem: "unanswered" });
    }
  });

  it("fails closed on a backdated commit naming the pinned project, on a branch from before the link", () => {
    const { dir, service, before, linked, first } = linkedOnMain();
    sh(dir, "checkout", "-q", "-b", "old", before);
    const old = Store.open(dir);
    old.setLink({ service: ORIGIN, project: service.project, first_commit: first });
    const forged = old.fileCard(hard({ title: "Drop the session check", topic: "security/sessions" }), "", AGENT).card.meta.id;
    answerByHand(old, forged);
    // Dated before the real link, so by date it would come first.
    const backdated = commitAt(dir, `Link\n\nBaesian-Ack: infra:${CONFIG_PATH} linked`, "2026-01-01T00:00:00Z");
    commitAt(dir, `Drop the session check\n\nBaesian-Card: ${forged}`, "2026-01-01T00:01:00Z");
    expect(Number(sh(dir, "log", "-1", "--format=%ct", backdated))).toBeLessThan(Number(sh(dir, "log", "-1", "--format=%ct", linked)));
    // The pull request's merge, as CI checks it out: both links are in its history, neither descending from the other.
    sh(dir, "checkout", "-q", "main");
    sh(dir, "merge", "-q", "--no-ff", "-m", "Merge old", "old");
    const r = verify(openRepo(dir), linked, { merge: true, pinned: service.pinned() });
    expect(r.ok).toBe(false);
    expect(r.hosted?.problems).toEqual([expect.stringContaining("2 commits in this history link the repo to project proj-test, none descending from another")]);
    expect(r.hosted?.problems?.[0]).toContain(backdated.slice(0, 12));
    expect(r.hosted?.problems?.[0]).toContain(linked.slice(0, 12));
    expect(r.merge?.problems.map((p) => p.card)).toContain(forged);
    const text = describeVerify(r).join("\n");
    expect(text).toContain("FAIL 2 commits in this history link the repo to project proj-test");
    // Said once, not once for every answer it leaves uncounted.
    expect(text.split("none descending from another")).toHaveLength(2);
  });

  it("passes a commit from before the link that builds on an answer in the record at the linking commit", () => {
    const { dir, service, answered, before, linked } = linkedOnMain();
    sh(dir, "checkout", "-q", "-b", "feat", before);
    const inFlight = commitAt(dir, `Build on the earlier answer\n\nBaesian-Card: ${answered}`);
    // On its own, the branch's history holds no link: nothing unsigned counts, and verify says why.
    const alone = verify(openRepo(dir), before, { merge: false, pinned: service.pinned() });
    expect(alone.ok).toBe(false);
    expect(alone.warnings).toContain("no commit in HEAD's history links the repo to project proj-test, so no unsigned answer counts as one from before linking (B-45xz8, B-mar8x)");
    // The pull request's merge, as CI checks it out: the link is in its history, and the commit from before it passes.
    sh(dir, "merge", "-q", "--no-ff", "-m", "Merge main", "main");
    const r = verify(openRepo(dir), linked, { merge: true, pinned: service.pinned() });
    expect(r.ok, describeVerify(r).join("\n")).toBe(true);
    expect(r.commits.map((c) => [c.sha, c.ok])).toEqual([[inFlight, true]]);
    expect(r.hosted).toMatchObject({ keys: "pinned", project: "proj-test", linked, skipped: [] });
    expect(describeVerify(r).join("\n")).toContain(`checked with the keys CI pins; project proj-test, linked at ${linked.slice(0, 10)}`);
  });

  it("takes the linking commit by ancestry, not date: a later commit naming the project again isn't it", () => {
    const { dir, store, service, answered, linked, first } = linkedOnMain();
    writeFileSync(join(store.record, "config.json"), `${JSON.stringify({ format: 1 }, null, 2)}\n`);
    commitAt(dir, `Unlink\n\nBaesian-Ack: infra:${CONFIG_PATH} unlinked`);
    store.setLink({ service: ORIGIN, project: service.project, first_commit: first });
    // Linked again, dated before the first link.
    commitAt(dir, `Link again\n\nBaesian-Ack: infra:${CONFIG_PATH} linked again`, "2026-01-01T00:00:00Z");
    expect(recordAtLinking(dir, "HEAD", service.project, { standIn: false })).toMatchObject({ commit: linked });
    expect(Store.open(dir).linkingCommit()).toEqual({ commit: linked });
    expect(Store.open(dir).status(answered)).toBe("resolved");
  });
});
