import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EXIT_POSSIBLE_DUPLICATE, main } from "../src/cli.js";
import { REVIEWER, cleanup, draftFile, repo, sh } from "./helpers.js";

afterEach(cleanup);

function run(cwd: string, args: string[], stdin = "") {
  const out: string[] = [];
  const err: string[] = [];
  const io = { out: (l: string) => out.push(l), err: (l: string) => err.push(l), stdin: () => stdin, cwd };
  return main(["node", "baesian", ...args], io).then((code) => ({ code, out: out.join("\n"), err: err.join("\n") }));
}

describe("inbox --quiet, for a harness's session-start hook", () => {
  it("prints the new verdicts under a heading, and nothing when there are none", async () => {
    const { dir, store } = repo();
    const r = await run(dir, ["--agent", "claude-code", "file"], draftFile());
    const id = /filed (B-\w{5})/.exec(r.out)![1]!;
    expect((await run(dir, ["inbox", "--quiet"])).out).toBe("");
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    const once = await run(dir, ["inbox", "--quiet"]);
    expect(once.code).toBe(0);
    expect(once.out.split("\n")[0]).toBe("Baesian: new verdicts on this branch's cards since you last looked (`baesian inbox`):");
    expect(once.out).toContain(`${id} r1  accept`);
    expect((await run(dir, ["inbox", "--quiet"])).out).toBe(""); // delivered: marked as seen
  });

  it("is silent, and succeeds, in a repo that doesn't use Baesian", async () => {
    const plain = mkdtempSync(join(tmpdir(), "baesian-plain-"));
    try {
      const r = await run(plain, ["inbox", "--quiet"]);
      expect(r).toMatchObject({ code: 0, out: "", err: "" });
      expect((await run(plain, ["inbox"])).code).not.toBe(0);
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });
});

describe("check --json", () => {
  it("exits as the gate would, so a grader reading the JSON gets the verdict from the exit code too", async () => {
    const { dir } = repo();
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", dependencies: { "left-pad": "1.3.0" } }));
    sh(dir, "add", "package.json");
    const r = await run(dir, ["check", "--json"]);
    expect(JSON.parse(r.out).ok).toBe(false);
    expect(r.code).toBe(1);
    expect((await run(dir, ["check"])).code).toBe(1);
  });
});

describe("cli", () => {
  it("files from stdin and tells the agent which trailer to add", async () => {
    const { dir } = repo();
    const r = await run(dir, ["--agent", "claude-code", "file"], draftFile());
    expect(r.code).toBe(0);
    const id = /filed (B-\w{5})/.exec(r.out)?.[1];
    expect(id).toBeDefined();
    expect(r.out).toContain(`Baesian-Card: ${id}`);
    const list = await run(dir, ["list"]);
    expect(list.out).toContain(id);
    expect(list.out).toContain("open");
  });

  it("exits 3 on a possible duplicate, listing the match", async () => {
    const { dir } = repo();
    await run(dir, ["file"], draftFile());
    const r = await run(dir, ["file"], draftFile({ title: "SQLite or Postgres?" }));
    expect(r.code).toBe(EXIT_POSSIBLE_DUPLICATE);
    expect(r.err).toMatch(/same topic/);
    expect(r.err).toMatch(/baesian attach/);
    // A topic is one question (D112): the message says how to file a different question on the same subject.
    expect(r.err).toMatch(/If yours is a different question on the same subject, give it a narrower topic/);
    expect((await run(dir, ["file", "--new"], draftFile({ title: "SQLite or Postgres?" }))).code).toBe(0);
  });

  it("reports validation errors readably", async () => {
    const { dir } = repo();
    const r = await run(dir, ["file"], draftFile({ touches: ["vibes"] }));
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/touches/);
  });

  it("shows a decision and delivers it to the inbox once", async () => {
    const { dir, store } = repo();
    const filed = await run(dir, ["file", "--json"], draftFile());
    const id: string = JSON.parse(filed.out).card.meta.id;
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    expect((await run(dir, ["show", id])).out).toContain("decided: SQLite (WAL mode)");
    expect((await run(dir, ["show", id])).out).toContain(`${id} r1  accept: SQLite (WAL mode)  (gus`);
    // An accept names what it accepted, as `wait` does.
    expect((await run(dir, ["inbox"])).out).toContain(`${id} r1  accept: SQLite (WAL mode)  (gus`);
    expect((await run(dir, ["inbox"])).out).toBe("no new verdicts");
  });

  it("has no command that resolves a card: only the client does (D32)", async () => {
    const { dir } = repo();
    for (const cmd of ["respond", "accept", "resolve", "verdict"]) {
      const r = await run(dir, [cmd]);
      expect(r.code).toBe(1);
      expect(r.err).toMatch(/unknown command/);
    }
  });

  it("prints help with exit code 0", async () => {
    const { dir } = repo();
    const r = await run(dir, ["--help"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("file [options] [path]");
  });
});
