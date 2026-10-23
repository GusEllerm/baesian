import { afterEach, describe, expect, it } from "vitest";
import { EXIT_POSSIBLE_DUPLICATE, main } from "../src/cli.js";
import { REVIEWER, cleanup, draftFile, repo } from "./helpers.js";

afterEach(cleanup);

function run(cwd: string, args: string[], stdin = "") {
  const out: string[] = [];
  const err: string[] = [];
  const io = { out: (l: string) => out.push(l), err: (l: string) => err.push(l), stdin: () => stdin, cwd };
  return main(["node", "baesian", ...args], io).then((code) => ({ code, out: out.join("\n"), err: err.join("\n") }));
}

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
    expect((await run(dir, ["inbox"])).out).toContain(`${id} r1  accept`);
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
