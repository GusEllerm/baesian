import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AGENTS_BLOCK, agentsBlock } from "../src/agents.js";
import { main } from "../src/cli.js";
import { globToRegExp as gateGlob } from "../src/globs.js";
import { MCP_INSTRUCTIONS } from "../src/mcp.js";
import { Config } from "../src/schema.js";
// @ts-expect-error: plain JavaScript, as below
import { repoOf } from "../plugins/baesian/hooks/baesian.mjs";
// @ts-expect-error: plain JavaScript, as below
import { CHOICE_REASON, CHOICE_TAIL, QUESTION_REASON, asksChoice, choiceSignals } from "../plugins/baesian/hooks/choices.mjs";
// @ts-expect-error: plain JavaScript, as below
import { onQuestion } from "../plugins/baesian/hooks/question-asked.mjs";
// @ts-expect-error: plain JavaScript, as below
import { editedPaths, globToRegExp as hookGlob, onEdit, reminderFor } from "../plugins/baesian/hooks/user-facing-edit.mjs";
// @ts-expect-error: the hook is plain JavaScript, so it runs with Node alone wherever the plugin is installed
import { contextFor, deckFor, onPlanApproved } from "../plugins/baesian/hooks/plan-approved.mjs";
// @ts-expect-error: plain JavaScript, as above
import { newVerdicts } from "../plugins/baesian/hooks/new-verdicts.mjs";
// @ts-expect-error: plain JavaScript, as above
import { onTurnEnded, remindedIn } from "../plugins/baesian/hooks/turn-ended.mjs";
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

  it("register the MCP server, as `baesian mcp` on PATH, with no timeouts, so one file serves both harnesses (D165)", () => {
    expect(readJson(join(PLUGIN, ".mcp.json"))).toEqual({ mcpServers: { baesian: { command: "baesian", args: ["mcp"] } } });
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
    expect(Object.keys(hooks).sort()).toEqual(["PostToolUse", "PreToolUse", "SessionStart", "Stop", "UserPromptSubmit"]);
    for (const { matcher } of hooks.PreToolUse) expect(matcher.split("|")).not.toContain("ExitPlanMode");
  });

  it("check as the agent acts (B-qrdhh): the question tool, and edits, with command hooks only, which Codex runs too", () => {
    const { hooks } = readJson(join(PLUGIN, "hooks", "hooks.json"));
    expect(hooks.PreToolUse).toEqual([
      { matcher: "AskUserQuestion|request_user_input", hooks: [expect.objectContaining({ type: "command", command: expect.stringContaining("hooks/question-asked.mjs") })] },
      // Codex's apply_patch matches Edit and Write too; named, in case it doesn't.
      { matcher: "Edit|Write|MultiEdit|NotebookEdit|apply_patch", hooks: [expect.objectContaining({ type: "command", command: expect.stringContaining("hooks/user-facing-edit.mjs") })] },
    ]);
    // No prompt hook: one would run a model at every turn's end, and Codex skips them.
    const handlers = Object.values(hooks).flatMap((groups) => (groups as { hooks: { type: string }[] }[]).flatMap((g) => g.hooks));
    expect(new Set(handlers.map((h) => h.type))).toEqual(new Set(["command"]));
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

  describe("with cards still open, in Claude Code (B-xnae9)", () => {
    /** Claude Code's Stop input since 2.1.145, which lists the session's background tasks. */
    const claude = (cwd: string, extra: Record<string, unknown> = {}) => ({ ...stopped(cwd), session_id: "s-1", background_tasks: [], session_crons: [], ...extra });
    const memory = () => {
      const kept = new Map<string, Set<string>>();
      return { read: (s: string) => new Set(kept.get(s) ?? []), write: (s: string, keys: Set<string>) => kept.set(s, new Set(keys)) };
    };

    it("reminds the agent once that it can leave a wait running in the background, naming the cards", async () => {
      const { dir, store } = repo();
      const a = /filed (B-\w{5})/.exec((await cli(["--agent", "claude-code", "file"], draftFile({ level: "blocking" }), dir)).stdout)![1]!;
      const b = /filed (B-\w{5})/.exec((await cli(["--agent", "claude-code", "file", "--new"], draftFile({ title: "Which queue carries jobs", topic: "area/queue" }), dir)).stdout)![1]!;
      const answered = /filed (B-\w{5})/.exec((await cli(["--agent", "claude-code", "file", "--new"], draftFile({ title: "How logs rotate", topic: "area/logs" }), dir)).stdout)![1]!;
      store.addVerdict({ card: answered, revision: 1, response: "accept", ...REVIEWER });
      const seen = memory();
      // The answer comes first, as before; the reminder waits for a turn with nothing new.
      expect((await onTurnEnded(claude(dir), cli, seen)).hookSpecificOutput.additionalContext).toContain(`${answered} r1  accept`);
      const out = await onTurnEnded(claude(dir), cli, seen);
      expect(out.hookSpecificOutput.hookEventName).toBe("Stop");
      const text: string = out.hookSpecificOutput.additionalContext;
      expect(text.split("\n")[0]).toBe(`Cards on this branch are still with the reviewer: ${a} (blocking), ${b} (provisional).`);
      expect(text).toContain(`\`baesian wait ${a} ${b} --until-answered\` running in the background`);
      expect(text).not.toContain(answered);
      // Once a session: not at its next turn, but a new session is told.
      expect(await onTurnEnded(claude(dir), cli, seen)).toBeUndefined();
      expect(await onTurnEnded(claude(dir, { session_id: "s-2" }), cli, seen)).toMatchObject({ hookSpecificOutput: { additionalContext: expect.stringContaining(a) } });
    });

    it("says nothing when a wait is running in the background, while carrying on for a Stop hook, in Codex, or in an older Claude Code", async () => {
      const { dir } = repo();
      await cli(["--agent", "claude-code", "file"], draftFile({ level: "blocking" }), dir);
      const running = [{ id: "task-1", type: "shell", status: "running", description: "wait for answers", command: "baesian wait B-aaaaa B-bbbbb --until-answered" }];
      expect(await onTurnEnded(claude(dir, { background_tasks: running }), cli, memory())).toBeUndefined();
      expect(await onTurnEnded(claude(dir, { stop_hook_active: true }), cli, memory())).toBeUndefined();
      expect(await onTurnEnded(claude(dir, { turn_id: "turn-1" }), cli, memory())).toBeUndefined();
      const { background_tasks: _, ...older } = claude(dir);
      expect(await onTurnEnded(older, cli, memory())).toBeUndefined();
      // Another background task isn't a wait.
      const other = [{ id: "task-2", type: "shell", status: "running", description: "tail logs", command: "tail -f server.log" }];
      expect(await onTurnEnded(claude(dir, { background_tasks: other }), cli, memory())).toBeDefined();
    });

    it("keeps what it reminded of between runs in a file of its own, and says nothing outside a repo that uses Baesian", async () => {
      const { dir } = repo();
      await cli(["--agent", "claude-code", "file"], draftFile({ level: "blocking" }), dir);
      const folder = mkdtempSync(join(tmpdir(), "baesian-reminded-"));
      try {
        expect(await onTurnEnded(claude(dir), cli, remindedIn(folder))).toBeDefined();
        expect(await onTurnEnded(claude(dir), cli, remindedIn(folder))).toBeUndefined();
        const plain = mkdtempSync(join(tmpdir(), "baesian-plain-"));
        expect(await onTurnEnded(claude(plain, { session_id: "s-3" }), cli, remindedIn(folder))).toBeUndefined();
        rmSync(plain, { recursive: true, force: true });
      } finally {
        rmSync(folder, { recursive: true, force: true });
      }
    });
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

// ---------------------------------------------------------------- checking as the agent acts (B-qrdhh)

/** The plugin's memory, kept in a map for a test. */
const memory = () => {
  const kept = new Map<string, Set<string>>();
  return { read: (s: string) => new Set(kept.get(s) ?? []), write: (s: string, keys: Set<string>) => kept.set(s, new Set(keys)) };
};

describe("the instructions on a choice put in chat (B-qrdhh)", () => {
  const oneLine = (text: string) => text.replace(/\*\*/g, "").replace(/\s+/g, " ");

  it("say it goes as a card even when the reviewer is there, without listing the options, and that restoring a decision cites it", () => {
    const skill = readFileSync(join(PLUGIN, "skills", "baesian", "SKILL.md"), "utf8");
    for (const text of [AGENTS_BLOCK, MCP_INSTRUCTIONS, skill].map(oneLine)) {
      expect(text).toMatch(/A choice you'd put to the (?:reviewer|person) in chat (?:goes as|is) a card,? even when they're in the conversation/);
      expect(text).toContain(`say "it's in your deck"`);
      expect(text).toContain("don't list the options there, so they still choose before seeing your pick");
      expect(text).toContain("A change that only restores what a card or rule decided cites it, and needs no card.");
    }
  });

  it("are in this repo's own AGENTS.md, as `baesian init` writes them", () => {
    const agents = readFileSync(join(ROOT, "AGENTS.md"), "utf8");
    expect(agents).toContain(agentsBlock({ rules: "docs/vault/Rules/", notes: ["docs/vault/Working Agreement.md"] }));
  });
});

/** The last message of a turn that put a choice to the person in chat, on 2026-11-05: it became B-b0dzp. */
const MISS =
  'In the same screenshot, the options read "then The relay notes…". The card shows the word "then" before the agent\'s text, and the agent started that text with a capital. I can lowercase the first letter when it follows "then", or tell agents in the card template to write it lowercase. Say which you\'d prefer.';

describe("the pattern for a choice put in chat", () => {
  it("fires on choices and on picks put for approval, not on go-aheads, questions of fact, reports or answers relayed", () => {
    for (const text of [
      MISS,
      "Two things I'd like your take on:\n- Should card notes live in the vault's `Decisions/` folder, as I proposed, or stay in a separate `.baesian/` directory?",
      "**Where does it live?** A panel from the desk's menu like Calibration, or a tab on the project's page? I'd go with the panel.",
      'I\'d hide merges from the trunk into a short-lived branch by default, or fold them into the "began" row. Shall I?',
      "**Eight decisions, with my recommendation on each:**\n1. **Drop citations**: **yes**.\n\nShall I go with all eight?",
      'Reply "sign off" to accept 1–13, or give the numbers you want to overturn.',
    ]) {
      expect(asksChoice(text), text).toBe(true);
    }
    for (const text of [
      "Shall I start it?",
      "M3c is still uncommitted. Should I commit it with that ack, push, and start M3b?",
      "Should I commit it now, or wait until you've tried round 2?",
      "And did you install the app from Chrome or Safari?",
      "The `v0.1.6` deploy is running. When it finishes, the same background job syncs this repo. I'll report once both are done.",
      "Your three answers: all three were my pick, and the builder has them: a sign-in lasts until 30 days without use.",
      'They use sample questions, like "WebSockets or server-sent events for live updates?". Shall I build the script?',
      "Waiting on your answers:\n- **B-5s5h2:** whether text spans its box. I'm waiting on both cards in the background.",
      "",
    ]) {
      expect(asksChoice(text), text).toBe(false);
    }
    expect(asksChoice(undefined)).toBe(false);
    expect(asksChoice(null)).toBe(false); // Codex's last message can be null
  });

  it("reads only the end of a message, where a turn's ask is", () => {
    expect(asksChoice(`Should it live in A or in B?\n\n${"A long report. ".repeat(200)}`)).toBe(false);
    expect(asksChoice(`${"A long report. ".repeat(200)}\n\nShould it live in A or in B?`)).toBe(true);
  });

  it("is measured on 228 real turn endings, labelled by hand (test/fixtures/turn-endings.json)", () => {
    const { items } = readJson(join(ROOT, "test", "fixtures", "turn-endings.json")) as { items: { label: string; text: string }[] };
    expect(items).toHaveLength(228);
    for (const i of items) expect(i.text.length).toBeLessThanOrEqual(CHOICE_TAIL);
    const count = (label: (l: string) => boolean, fires: boolean) => items.filter((i) => label(i.label) && asksChoice(i.text) === fires).length;
    const choice = (l: string) => l === "choice";
    const asked = (l: string) => l !== "other";
    const other = (l: string) => l === "other";
    // Choices between options: 8 of 11 caught. With picks put for approval too: 23 of 29.
    expect([count(choice, true), count(choice, false)]).toEqual([8, 3]);
    expect([count(asked, true), count(asked, false)]).toEqual([23, 6]);
    // It fires on 6 of the 199 other endings: 29 fires in 228 turns, where the agent is asked to judge.
    expect([count(other, true), count(other, false)]).toEqual([6, 193]);
    // The miss that started it all.
    expect(items.some((i) => i.label === "choice" && i.text.endsWith("Say which you'd prefer.") && asksChoice(i.text))).toBe(true);
  });

  it("names what it found", () => {
    expect(choiceSignals(MISS)).toEqual(expect.arrayContaining(["offer", "prefer"]));
    expect(choiceSignals("Shall I start it?")).toEqual([]);
  });
});

describe("the hook at the end of a turn, on a choice put in chat (B-qrdhh)", () => {
  const stopped = (cwd: string, message: string | null, extra: Record<string, unknown> = {}) => ({
    hook_event_name: "Stop",
    stop_hook_active: false,
    session_id: "s-1",
    last_assistant_message: message,
    cwd,
    ...extra,
  });

  it("asks the agent once whether it put a choice in chat, to file a card and say it's in the deck rather than list the options", async () => {
    const { dir } = repo();
    const out = await onTurnEnded(stopped(dir, MISS), cli, memory());
    expect(out).toEqual({ hookSpecificOutput: { hookEventName: "Stop", additionalContext: CHOICE_REASON } });
    expect(CHOICE_REASON).toContain("file_card");
    expect(CHOICE_REASON).toContain("it's in their deck without listing the options");
    expect(CHOICE_REASON).toContain("end your turn with no further message");
    // Once: not while the agent carries on because of a Stop hook.
    expect(await onTurnEnded(stopped(dir, MISS, { stop_hook_active: true }), cli, memory())).toBeUndefined();
  });

  it("lets a go-ahead or a report end the turn", async () => {
    const { dir } = repo();
    expect(await onTurnEnded(stopped(dir, "Shall I start it?"), cli, memory())).toBeUndefined();
    expect(await onTurnEnded(stopped(dir, null), cli, memory())).toBeUndefined();
  });

  it("answers Codex with a block and the reason, since Codex has no prompt hooks", async () => {
    const { dir } = repo();
    const out = await onTurnEnded(stopped(dir, MISS, { turn_id: "turn-1", model: "gpt-5" }), cli, memory());
    expect(out).toEqual({ decision: "block", reason: CHOICE_REASON });
  });

  it("brings new verdicts in beside it", async () => {
    const { dir, store } = repo();
    const filed = await cli(["--agent", "claude-code", "file"], draftFile(), dir);
    const id = /filed (B-\w{5})/.exec(filed.stdout)![1]!;
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    const text: string = (await onTurnEnded(stopped(dir, MISS), cli, memory())).hookSpecificOutput.additionalContext;
    expect(text).toContain(`${id} r1  accept`);
    expect(text.endsWith(CHOICE_REASON)).toBe(true);
  });

  it("says nothing outside a repo that uses Baesian, or without the CLI", async () => {
    const plain = mkdtempSync(join(tmpdir(), "baesian-plain-"));
    try {
      expect(await onTurnEnded(stopped(plain, MISS), cli, memory())).toBeUndefined();
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
    const missing = async () => ({ missing: true, status: 1, stdout: "", stderr: "spawnSync baesian ENOENT" });
    expect(await onTurnEnded(stopped("/", MISS), missing, memory())).toBeUndefined();
  });
});

describe("the hook on the question tool (B-qrdhh)", () => {
  const QUESTIONS = [
    {
      question: "Where should the branches view live?",
      header: "Branches",
      options: [
        { label: "A panel", description: "From the desk's menu" },
        { label: "A tab", description: "On the project's page" },
      ],
      multiSelect: false,
    },
  ];
  const asking = (cwd: string, extra: Record<string, unknown> = {}) => ({
    hook_event_name: "PreToolUse",
    session_id: "s-1",
    tool_name: "AskUserQuestion",
    tool_input: { questions: QUESTIONS },
    tool_use_id: "toolu_1",
    cwd,
    ...extra,
  });
  const DENY = { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: QUESTION_REASON } };

  it("sends a question with options back once, to be a card; asked again unchanged, it goes through", async () => {
    const { dir } = repo();
    const asked = memory();
    expect(await onQuestion(asking(dir), asked)).toEqual(DENY);
    expect(QUESTION_REASON).toContain("ask it again unchanged and it will go through");
    expect(await onQuestion(asking(dir), asked)).toBeUndefined();
    // Another question is sent back too, and the same one in another session.
    const other = [{ ...QUESTIONS[0], question: "Should old branches fold away?" }];
    expect(await onQuestion(asking(dir, { tool_input: { questions: other } }), asked)).toEqual(DENY);
    expect(await onQuestion(asking(dir, { session_id: "s-2" }), asked)).toEqual(DENY);
  });

  it("takes Codex's request_user_input the same way", async () => {
    const { dir } = repo();
    const codex = asking(dir, { tool_name: "request_user_input", turn_id: "turn-1", tool_input: { questions: [{ id: "where", header: "Branches", question: "Where should it live?", options: QUESTIONS[0]!.options }] } });
    expect(await onQuestion(codex, memory())).toEqual(DENY);
  });

  it("lets a question without options through, and says nothing outside a repo that uses Baesian, or for another tool", async () => {
    const { dir } = repo();
    expect(await onQuestion(asking(dir, { tool_input: { questions: [{ question: "What did you see?", header: "Seen", options: [] }] } }), memory())).toBeUndefined();
    expect(await onQuestion(asking(dir, { tool_name: "Bash", tool_input: { command: "ls" } }), memory())).toBeUndefined();
    const plain = mkdtempSync(join(tmpdir(), "baesian-plain-"));
    try {
      expect(await onQuestion(asking(plain), memory())).toBeUndefined();
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });
});

describe("the hook on edits to user-facing paths (B-qrdhh, B-bf29j)", () => {
  const GLOBS = ["client/src/**/*.tsx", "src/cli.ts"];
  /** A repo whose config declares user-facing paths, as `baesian init` and an agent would leave it. */
  const declared = (globs: string[] = GLOBS) => {
    const { dir, store } = repo();
    const path = join(dir, ".baesian", "config.json");
    writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, "utf8")), user_facing: globs }));
    expect(store.config().user_facing).toEqual(globs); // the store reads it too
    return dir;
  };
  const editing = (cwd: string, tool: string, input: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    hook_event_name: "PreToolUse",
    session_id: "s-1",
    tool_name: tool,
    tool_input: input,
    cwd,
    ...extra,
  });
  const told = (paths: string[]) => ({ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: reminderFor(paths) } });

  it("adds a one-line reminder, never a block, once a session for each file", async () => {
    const dir = declared();
    const seen = memory();
    const card = join(dir, "client", "src", "Card.tsx");
    const out = await onEdit(editing(dir, "Edit", { file_path: card, old_string: "a", new_string: "b" }), seen);
    expect(out).toEqual(told(["client/src/Card.tsx"]));
    expect(out.hookSpecificOutput.permissionDecision).toBeUndefined();
    expect(out.hookSpecificOutput.additionalContext).not.toContain("\n");
    expect(out.hookSpecificOutput.additionalContext).toContain("a change that only restores what a card or rule decided cites it instead");
    expect(await onEdit(editing(dir, "Write", { file_path: card, content: "" }), seen)).toBeUndefined(); // once
    expect(await onEdit(editing(dir, "Write", { file_path: join(dir, "src", "cli.ts"), content: "" }), seen)).toEqual(told(["src/cli.ts"]));
    expect(await onEdit(editing(dir, "Write", { file_path: card, content: "" }, { session_id: "s-2" }), seen)).toEqual(told(["client/src/Card.tsx"]));
  });

  it("says nothing for other paths, outside the repo, with no globs declared, or outside a repo that uses Baesian", async () => {
    const dir = declared();
    expect(await onEdit(editing(dir, "Edit", { file_path: join(dir, "src", "store.ts") }), memory())).toBeUndefined();
    expect(await onEdit(editing(dir, "Edit", { file_path: "/elsewhere/client/src/Card.tsx" }), memory())).toBeUndefined();
    const { dir: none } = repo();
    expect(await onEdit(editing(none, "Edit", { file_path: join(none, "client", "src", "Card.tsx") }), memory())).toBeUndefined();
    const plain = mkdtempSync(join(tmpdir(), "baesian-plain-"));
    try {
      execFileSync("git", ["init", "-q"], { cwd: plain });
      expect(await onEdit(editing(plain, "Edit", { file_path: join(plain, "client", "src", "Card.tsx") }), memory())).toBeUndefined();
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  it("reads Codex's apply_patch, and NotebookEdit's path", async () => {
    const dir = declared(["client/src/**/*.tsx", "notebooks/*.ipynb"]);
    const patch = "*** Begin Patch\n*** Update File: client/src/Card.tsx\n@@\n-a\n+b\n*** Add File: client/src/New.tsx\n+x\n*** Update File: src/store.ts\n*** End Patch\n";
    expect(editedPaths("apply_patch", { command: patch })).toEqual(["client/src/Card.tsx", "client/src/New.tsx", "src/store.ts"]);
    expect(await onEdit(editing(dir, "apply_patch", { command: patch }, { turn_id: "turn-1" }), memory())).toEqual(told(["client/src/Card.tsx", "client/src/New.tsx"]));
    expect(await onEdit(editing(dir, "NotebookEdit", { notebook_path: join(dir, "notebooks", "a.ipynb"), new_source: "" }), memory())).toEqual(told(["notebooks/a.ipynb"]));
  });

  it("reads a personal clone's own config, where nothing is committed (B-4rwyz)", async () => {
    const { dir } = repo();
    rmSync(join(dir, ".baesian"), { recursive: true, force: true });
    mkdirSync(join(dir, ".git", "baesian"), { recursive: true });
    writeFileSync(join(dir, ".git", "baesian", "config.json"), JSON.stringify({ format: 1, user_facing: ["ui/**"] }));
    expect(repoOf(dir)).toEqual({ toplevel: dir, config: { format: 1, user_facing: ["ui/**"] } });
    expect(await onEdit(editing(dir, "Write", { file_path: join(dir, "ui", "page.html") }), memory())).toEqual(told(["ui/page.html"]));
  });

  it("reads globs as the commit gate does", () => {
    const paths = ["client/src/Card.tsx", "client/src/site/Page.tsx", "client/Card.tsx", "src/cli.ts", "src/cli.tsx", "a/b/c.css", "x.css", "q?.md", "qa.md"];
    for (const glob of ["client/src/**/*.tsx", "src/cli.ts", "**/*.css", "*.css", "q?.md", "**"]) {
      for (const p of paths) expect(hookGlob(glob).test(p), `${glob} ${p}`).toBe(gateGlob(glob).test(p));
    }
  });

  it("are a list of globs in the config, at least one, with no built-in list (B-bf29j)", () => {
    expect(Config.parse({ user_facing: ["client/src/**/*.tsx"] }).user_facing).toEqual(["client/src/**/*.tsx"]);
    expect(() => Config.parse({ user_facing: [] })).toThrow();
    expect(() => Config.parse({ user_facing: [" padded"] })).toThrow();
    expect(Config.parse({}).user_facing).toBeUndefined();
    // This repo's own.
    expect(readJson(join(ROOT, ".baesian", "config.json")).user_facing).toEqual(expect.arrayContaining(["client/src/**/*.tsx", "client/src/**/*.css", "src/cli.ts"]));
  });
});
