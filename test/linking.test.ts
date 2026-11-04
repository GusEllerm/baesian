import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
import { CONFIG_PATH, type Snapshot, detectFacts } from "../src/facts.js";
import { openRepo } from "../src/git.js";
import { Config } from "../src/schema.js";
import { SHALLOW_HISTORY, Store } from "../src/store.js";
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
    expect(fact({ format: 1, ...LINK }, { format: 1, ...LINK, gate_infra: ["deploy/**"] })).toEqual([]);
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
