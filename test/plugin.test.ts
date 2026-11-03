import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
// @ts-expect-error: the hook is plain JavaScript, so it runs with Node alone wherever the plugin is installed
import { contextFor, deckFor, onPlanApproved } from "../plugins/baesian/hooks/plan-approved.mjs";
// @ts-expect-error: plain JavaScript, as above
import { newVerdicts } from "../plugins/baesian/hooks/new-verdicts.mjs";
// @ts-expect-error: plain JavaScript, as above
import { onTurnEnded } from "../plugins/baesian/hooks/turn-ended.mjs";
import { REVIEWER, cleanup, draftFile, repo } from "./helpers.js";

afterEach(cleanup);

const ROOT = join(import.meta.dirname, "..");
const PLUGIN = join(ROOT, "plugins", "baesian");
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

/** The CLI, in-process, the way the hooks run it: arguments, stdin, and the repo it's in. */
async function cli(args: string[], input: string, cwd: string) {
  const out: string[] = [];
  const err: string[] = [];
  const io = { out: (l: string) => out.push(l), err: (l: string) => err.push(l), stdin: () => input, cwd };
  const status = await main(["node", "baesian", ...args], io);
  return { status, stdout: out.join("\n"), stderr: err.join("\n") };
}

const PLAN = "# Plan: Move the store to SQLite\n\n1. Add `better-sqlite3`.\n2. Migrate the cards.\n";
const approved = (cwd: string, response: Record<string, unknown> = {}) => ({
  hook_event_name: "PostToolUse",
  tool_name: "ExitPlanMode",
  tool_input: { plan: PLAN },
  tool_response: { plan: PLAN, filePath: "/home/someone/.claude/plans/a-plan.md", ...response },
  cwd,
});

describe("the plugin's files", () => {
  it("are listed by the marketplace at the repo's root", () => {
    const market = readJson(join(ROOT, ".claude-plugin", "marketplace.json"));
    const entry = market.plugins.find((p: { name: string }) => p.name === "baesian");
    expect(join(ROOT, entry.source)).toBe(PLUGIN);
    expect(readJson(join(PLUGIN, ".claude-plugin", "plugin.json")).name).toBe("baesian");
    expect(existsSync(join(PLUGIN, "skills", "baesian", "SKILL.md"))).toBe(true);
  });

  it("bring new verdicts in at stopping points only, and never decide whether a plan is approved", () => {
    const { hooks } = readJson(join(PLUGIN, "hooks", "hooks.json"));
    for (const event of ["SessionStart", "UserPromptSubmit"]) {
      expect(hooks[event][0].hooks[0].command).toContain("hooks/new-verdicts.mjs");
    }
    expect(hooks.Stop[0].hooks[0].command).toContain("hooks/turn-ended.mjs");
    expect(hooks.PostToolUse).toEqual([expect.objectContaining({ matcher: "ExitPlanMode" })]);
    // Nothing mid-task (D116), and only a person approves a plan: a PreToolUse hook on ExitPlanMode could answer
    // for them.
    expect(Object.keys(hooks).sort()).toEqual(["PostToolUse", "SessionStart", "Stop", "UserPromptSubmit"]);
  });
});

describe("the hook on an approved plan", () => {
  it("names the deck from the plan's first heading", () => {
    expect(deckFor(PLAN)).toEqual({ title: "Move the store to SQLite", id: "plan-move-the-store-to-sqlite" });
    expect(deckFor("## **The `v2` API**\n...")).toEqual({ title: "The v2 API", id: "plan-the-v2-api" });
    expect(deckFor("Just some steps.\n")).toEqual({ title: "An approved plan", id: "plan-an-approved-plan" });
    expect(deckFor(`# ${"a very long title ".repeat(8)}`).id).toBe("plan-a-very-long-title-a-very-long-title-a");
  });

  it("makes the plan a deck's briefing, without its path, and tells the agent to file into it", async () => {
    const { dir, store } = repo();
    const out = await onPlanApproved(approved(dir), cli);
    expect(out).toEqual({
      hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: contextFor("plan-move-the-store-to-sqlite", "Move the store to SQLite") },
    });
    expect(out.hookSpecificOutput.additionalContext).toContain("deck: plan-move-the-store-to-sqlite");
    const deck = store.deck("plan-move-the-store-to-sqlite")!;
    expect(deck.meta).toMatchObject({ title: "Move the store to SQLite", branch: "main" });
    expect(deck.meta.from).toBeUndefined(); // the plan's file is outside the repo, in someone's home
    expect(deck.body.trim()).toBe(PLAN.trim());
  });

  it("takes the next free name when the plan's is taken", async () => {
    const { dir, store } = repo();
    await onPlanApproved(approved(dir), cli);
    const again = await onPlanApproved(approved(dir), cli);
    expect(again.hookSpecificOutput.additionalContext).toContain("`plan-move-the-store-to-sqlite-2`");
    expect(store.deck("plan-move-the-store-to-sqlite-2")?.body.trim()).toBe(PLAN.trim());
  });

  it("does nothing for a subagent's plan, one awaiting a team lead, or another tool", async () => {
    const { dir, store } = repo();
    expect(await onPlanApproved(approved(dir, { isAgent: true }), cli)).toBeUndefined();
    expect(await onPlanApproved(approved(dir, { awaitingLeaderApproval: true }), cli)).toBeUndefined();
    expect(await onPlanApproved({ ...approved(dir), tool_name: "Bash" }, cli)).toBeUndefined();
    expect(store.deck("plan-move-the-store-to-sqlite")).toBeUndefined();
  });

  it("says nothing outside a repo that uses Baesian, or without the CLI", async () => {
    const plain = mkdtempSync(join(tmpdir(), "baesian-plain-"));
    try {
      expect(await onPlanApproved(approved(plain), cli)).toBeUndefined();
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
    const missing = async () => ({ missing: true, status: 1, stderr: "spawnSync baesian ENOENT" });
    expect(await onPlanApproved(approved("/"), missing)).toBeUndefined();
  });

  it("reports any other failure, for Claude Code to show", async () => {
    const broken = async () => ({ status: 1, stderr: "the deck is invalid" });
    await expect(onPlanApproved(approved("/"), broken)).rejects.toThrow("the deck is invalid");
  });
});

describe("the hooks when a session starts and with your next message", () => {
  const started = (cwd: string, session: string) => ({ hook_event_name: "SessionStart", session_id: session, source: "startup", cwd });

  it("bring in new verdicts as plain text, once for each session on the branch (B-ghhym)", async () => {
    const { dir, store } = repo();
    const filed = await cli(["--agent", "claude-code", "file"], draftFile(), dir);
    const id = /filed (B-\w{5})/.exec(filed.stdout)![1]!;
    expect(await newVerdicts(started(dir, "s-1"), cli)).toBe("");
    expect(await newVerdicts(started(dir, "s-2"), cli)).toBe("");
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    const one = await newVerdicts({ hook_event_name: "UserPromptSubmit", session_id: "s-1", prompt: "go on", cwd: dir }, cli);
    expect(one).toContain(`${id} r1  accept`);
    expect(await newVerdicts(started(dir, "s-1"), cli)).toBe(""); // seen by this session
    expect(await onTurnEnded({ hook_event_name: "Stop", session_id: "s-2", cwd: dir }, cli)).toMatchObject({ hookSpecificOutput: { additionalContext: expect.stringContaining(`${id} r1  accept`) } });
  });

  it("say nothing without the CLI", async () => {
    const missing = async () => ({ missing: true, status: 1, stdout: "", stderr: "spawnSync baesian ENOENT" });
    expect(await newVerdicts(started("/", "s-1"), missing)).toBe("");
  });
});

describe("the hook at the end of a turn", () => {
  const stopped = (cwd: string) => ({ hook_event_name: "Stop", stop_hook_active: false, cwd });

  it("brings in new verdicts once, so the agent carries on to act on them", async () => {
    const { dir, store } = repo();
    const filed = await cli(["--agent", "claude-code", "file"], draftFile(), dir);
    const id = /filed (B-\w{5})/.exec(filed.stdout)![1]!;
    expect(await onTurnEnded(stopped(dir), cli)).toBeUndefined(); // nothing new: the agent stops as usual
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    const out = await onTurnEnded(stopped(dir), cli);
    expect(out.hookSpecificOutput.hookEventName).toBe("Stop");
    expect(out.hookSpecificOutput.additionalContext).toContain(`${id} r1  accept`);
    expect(out.hookSpecificOutput.additionalContext).toContain("act on these before you finish");
    expect(await onTurnEnded({ ...stopped(dir), stop_hook_active: true }, cli)).toBeUndefined(); // seen: no loop
  });

  it("answers Codex in its own form: a block with a reason (D118)", async () => {
    const { dir, store } = repo();
    const filed = await cli(["file", "--json"], draftFile(), dir);
    const id: string = JSON.parse(filed.stdout).card.meta.id;
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    // Codex's Stop input, as its hooks schema gives it.
    const codex = { ...stopped(dir), turn_id: "turn-1", model: "gpt-5", last_assistant_message: null };
    const out = await onTurnEnded(codex, cli);
    expect(Object.keys(out)).toEqual(["decision", "reason"]);
    expect(out.decision).toBe("block");
    expect(out.reason).toContain(`${id} r1  accept`);
    expect(await onTurnEnded({ ...codex, stop_hook_active: true }, cli)).toBeUndefined();
  });

  it("says nothing outside a repo that uses Baesian, without the CLI, or for another event", async () => {
    const plain = mkdtempSync(join(tmpdir(), "baesian-plain-"));
    try {
      expect(await onTurnEnded(stopped(plain), cli)).toBeUndefined();
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
    const missing = async () => ({ missing: true, status: 1, stdout: "", stderr: "spawnSync baesian ENOENT" });
    expect(await onTurnEnded(stopped("/"), missing)).toBeUndefined();
    const { dir } = repo();
    expect(await onTurnEnded({ ...stopped(dir), hook_event_name: "SubagentStop" }, cli)).toBeUndefined();
  });
});
