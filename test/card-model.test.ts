import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { modelSessions } from "../src/agents.js";
import { main } from "../src/cli.js";
import { slug } from "../src/git.js";
import { modelPath } from "../src/store.js";
import { REVIEWER, cleanup, draft, draftFile, repo } from "./helpers.js";

// A card's model (B-k0w7d): the plugin's hooks keep each harness session's model in the live layer, and Baesian writes
// it on the cards the session files, as `source_model`, which it fills in like `source_agent`. The hooks' side is in
// plugin.test.ts, the MCP server's in mcp.test.ts, and the decision note's in vault.test.ts.

afterEach(cleanup);

/** The CLI in-process, with the environment a harness gives the commands an agent runs. */
async function cli(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}, stdin = "") {
  const out: string[] = [];
  const err: string[] = [];
  const io = { out: (l: string) => out.push(l), err: (l: string) => err.push(l), stdin: () => stdin, cwd, notify: () => {}, env };
  const status = await main(["node", "baesian", "--agent", "claude-code", ...args], io);
  return { status, stdout: out.join("\n"), stderr: err.join("\n") };
}

const filed = async (cwd: string, env: NodeJS.ProcessEnv, over: Record<string, unknown> = {}) => {
  const r = await cli(cwd, ["file", "--json", "--new"], env, draftFile(over));
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(r.stdout).card.meta as { id: string; source_model?: string };
};

describe("a card's model (B-k0w7d)", () => {
  it("is written on the card from the session's model file, by the session the harness gives the command", async () => {
    const { dir, store } = repo();
    store.noteSessionModel("2f6c-session", "claude-opus-5-5");
    const meta = await filed(dir, { CLAUDE_CODE_SESSION_ID: "2f6c-session" });
    expect(meta.source_model).toBe("claude-opus-5-5");
    // On the revision itself, beside its agent, and in the worktree's record.
    expect(readFileSync(join(dir, ".baesian", "cards", meta.id, "r1.md"), "utf8")).toMatch(/source_agent: claude-code\nsource_model: claude-opus-5-5\nsource_branch: main/);
    expect(store.card(meta.id)!.meta.source_model).toBe("claude-opus-5-5");
  });

  it("follows the session when it switches, and is absent with no session, no file for it, or a file it can't read", async () => {
    const { dir, store } = repo();
    store.noteSessionModel("s-1", "claude-sonnet-5");
    expect((await filed(dir, { CLAUDE_CODE_SESSION_ID: "s-1" })).source_model).toBe("claude-sonnet-5");
    store.noteSessionModel("s-1", "claude-opus-5-5");
    expect((await filed(dir, { CLAUDE_CODE_SESSION_ID: "s-1" }, { title: "Another store", topic: "storage/other" })).source_model).toBe("claude-opus-5-5");
    expect(await filed(dir, {}, { title: "A third", topic: "storage/third" })).not.toHaveProperty("source_model");
    expect(await filed(dir, { CLAUDE_CODE_SESSION_ID: "s-2" }, { title: "A fourth", topic: "storage/fourth" })).not.toHaveProperty("source_model");
    writeFileSync(join(store.live, modelPath("s-3")), "{ not json");
    expect(await filed(dir, { CLAUDE_CODE_SESSION_ID: "s-3" }, { title: "A fifth", topic: "storage/fifth" })).not.toHaveProperty("source_model");
    mkdirSync(join(store.live, "models"), { recursive: true });
    writeFileSync(join(store.live, modelPath("s-4")), JSON.stringify({ type: "session-model", format: 9, model: "future", at: new Date().toISOString() }));
    expect(await filed(dir, { CLAUDE_CODE_SESSION_ID: "s-4" }, { title: "A sixth", topic: "storage/sixth" })).not.toHaveProperty("source_model");
  });

  it("is found in Codex by CODEX_THREAD_ID, or CODEX_SESSION_ID first when Codex sets it", async () => {
    expect(modelSessions({ CODEX_THREAD_ID: "t-1" })).toEqual(["t-1"]);
    expect(modelSessions({ CODEX_SESSION_ID: "s-1", CODEX_THREAD_ID: "t-1" })).toEqual(["s-1", "t-1"]);
    expect(modelSessions({ CLAUDE_CODE_SESSION_ID: " c-1 ", CODEX_THREAD_ID: "" })).toEqual(["c-1"]);
    const { dir, store } = repo();
    store.noteSessionModel("019a-thread", "gpt-5.5-codex");
    expect((await filed(dir, { CODEX_SESSION_ID: "019a-session", CODEX_THREAD_ID: "019a-thread" })).source_model).toBe("gpt-5.5-codex");
  });

  it("is kept by the session's ID as Baesian names files, which the plugin's hooks repeat", () => {
    expect(modelPath("2F6C/Session ID")).toBe(`models/${slug("2F6C/Session ID")}.json`);
  });

  it("is Baesian's to fill in: a draft that gives one is refused", () => {
    const { store } = repo();
    expect(() => store.fileCard(draft({ source_model: "claude-opus-5-5" }), "", { agent: "claude-code" })).toThrow(/source_model/);
  });

  it("is the model of whoever filed each revision: a revision and a reply record their own, or none", async () => {
    const { dir, store } = repo();
    store.noteSessionModel("s-1", "claude-sonnet-5");
    const { id } = await filed(dir, { CLAUDE_CODE_SESSION_ID: "s-1" });
    store.addVerdict({ card: id, revision: 1, response: "alternative", choice: "Postgres", first_choice: "proposal", ...REVIEWER });
    // The reply comes from a session with no model known: it records none, not the first revision's.
    const replied = await cli(dir, ["reply", id, "Two CI runners write at once."], { CLAUDE_CODE_SESSION_ID: "s-9" });
    expect(replied.status, replied.stderr).toBe(0);
    expect(store.card(id)!.meta).toMatchObject({ revision: 2 });
    expect(store.card(id)!.meta).not.toHaveProperty("source_model");
    store.addVerdict({ card: id, revision: 2, response: "question", comment: "Which runners?", ...REVIEWER });
    store.noteSessionModel("s-1", "claude-opus-5-5");
    const revised = await cli(dir, ["revise", id], { CLAUDE_CODE_SESSION_ID: "s-1" }, draftFile({ crux_fact: "The nightly and the PR runner." }));
    expect(revised.status, revised.stderr).toBe(0);
    expect(store.card(id)!.meta).toMatchObject({ revision: 3, source_model: "claude-opus-5-5" });
    expect(store.revisions(id).map((r) => r.meta.source_model)).toEqual(["claude-sonnet-5", undefined, "claude-opus-5-5"]);
  });

  it("shows in `baesian show`, beside the card's deck", async () => {
    const { dir, store } = repo();
    store.noteSessionModel("s-1", "claude-opus-5-5");
    const { id } = await filed(dir, { CLAUDE_CODE_SESSION_ID: "s-1" });
    const shown = await cli(dir, ["show", id]);
    expect(shown.stdout).toMatch(/\n {2}model: +claude-opus-5-5\n/);
    const { id: none } = await filed(dir, {}, { title: "Another store", topic: "storage/other" });
    expect((await cli(dir, ["show", none])).stdout).not.toContain("model:");
  });
});
