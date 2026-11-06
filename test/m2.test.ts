import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AGENTS_BLOCK, BEGIN, CARD_TEMPLATE, END, agentName, claudeMdMissesAgents, writeAgentsBlock } from "../src/agents.js";
import { main } from "../src/cli.js";
import { parseDoc } from "../src/frontmatter.js";
import { notifyFiled, shouldNotify, userConfig } from "../src/notify.js";
import type { Card } from "../src/store.js";
import { BODY, REVIEWER, cleanup, draft, draftFile, fakeClock, repo } from "./helpers.js";

afterEach(cleanup);

function run(cwd: string, args: string[], stdin = "", extra: Record<string, unknown> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const notified: Card[] = [];
  const io = {
    out: (l: string) => out.push(l),
    err: (l: string) => err.push(l),
    stdin: () => stdin,
    cwd,
    notify: (c: Card) => notified.push(c),
    ...extra,
  };
  return main(["node", "baesian", ...args], io).then((code) => ({ code, out: out.join("\n"), err: err.join("\n"), notified }));
}

async function eventually(check: () => boolean, ms = 3_000): Promise<void> {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("notifications (D40)", () => {
  it("only interrupts for blocking and hard cards", () => {
    const { store } = repo();
    const p = store.fileCard(draft(), BODY, { agent: "a" }).card;
    const h = store.fileCard(draft({ title: "Delete runs?", topic: "retention", touches: ["data-loss"] }), BODY, { agent: "a" }).card;
    expect(shouldNotify(p)).toBe(false);
    expect(shouldNotify(h)).toBe(true);
    expect(notifyFiled(p, { notify: "true" })).toEqual({ os: false, command: false });
  });

  it("runs the user's notify command with the card as JSON on stdin", async () => {
    const { store } = repo();
    const card = store.fileCard(draft({ level: "blocking" }), BODY, { agent: "a" }).card;
    const out = join(mkdtempSync(join(tmpdir(), "baesian-notify-")), "payload.json");
    const result = notifyFiled(card, { notify: `cat > '${out}'`, os_notify: false });
    expect(result).toEqual({ os: false, command: true });
    await eventually(() => existsSync(out) && readFileSync(out, "utf8").endsWith("\n"));
    expect(JSON.parse(readFileSync(out, "utf8"))).toMatchObject({ id: card.meta.id, level: "blocking", branch: "main" });
  });

  it("never fails because the command does", () => {
    const { store } = repo();
    const card = store.fileCard(draft({ level: "hard" }), BODY, { agent: "a" }).card;
    expect(() => notifyFiled(card, { notify: "exit 7", os_notify: false })).not.toThrow();
  });

  it("reads personal settings from the user config, never the repo", () => {
    const dir = mkdtempSync(join(tmpdir(), "baesian-cfg-"));
    const path = join(dir, "config.json");
    writeFileSync(path, JSON.stringify({ notify: "ntfy publish me", os_notify: false }));
    expect(userConfig(path)).toEqual({ format: 1, notify: "ntfy publish me", os_notify: false });
    expect(userConfig(join(dir, "missing.json"))).toEqual({});
    writeFileSync(path, JSON.stringify({ vault: "docs" }));
    expect(() => userConfig(path)).toThrow(/not valid/);
  });

  it("is rejected in the committed config", () => {
    const { store } = repo();
    writeFileSync(join(store.record, "config.json"), JSON.stringify({ notify: "curl evil" }));
    expect(() => store.config()).toThrow(/not valid/);
  });
});

describe("AGENTS.md (tier 1)", () => {
  it("creates, appends, updates and leaves alone", () => {
    const { dir } = repo();
    expect(writeAgentsBlock(dir)).toBe("created");
    expect(writeAgentsBlock(dir)).toBe("unchanged");
    const path = join(dir, "AGENTS.md");
    writeFileSync(path, "# Mine\n\nKeep this.\n");
    expect(writeAgentsBlock(dir)).toBe("appended");
    const text = readFileSync(path, "utf8");
    expect(text).toMatch(/^# Mine\n\nKeep this\.\n\n<!-- baesian:begin -->/);
    writeFileSync(path, text.replace("## Decisions (Baesian)", "## Old heading"));
    expect(writeAgentsBlock(dir)).toBe("updated");
    const final = readFileSync(path, "utf8");
    expect(final).toContain("Keep this.");
    expect(final.split(BEGIN)).toHaveLength(2);
    expect(final).toContain(AGENTS_BLOCK);
    expect(final.indexOf(END)).toBeGreaterThan(0);
  });

  it("warns when CLAUDE.md doesn't import AGENTS.md", () => {
    const { dir } = repo();
    expect(claudeMdMissesAgents(dir)).toBe(false);
    writeFileSync(join(dir, "CLAUDE.md"), "Some rules.\n");
    expect(claudeMdMissesAgents(dir)).toBe(true);
    writeFileSync(join(dir, "CLAUDE.md"), "@AGENTS.md\n");
    expect(claudeMdMissesAgents(dir)).toBe(false);
  });

  it("documents the wait exit codes the code uses", () => {
    for (const code of ["exits 0", "4 when answered", "5 with no verdict", "6 with no verdict on a hard card", "8 when the card is held back"]) {
      expect(AGENTS_BLOCK).toContain(code);
    }
  });
});

describe("cli: M2 commands", () => {
  it("init writes the instructions, and --no-agents doesn't", async () => {
    const a = repo();
    const r = await run(a.dir, ["init"]);
    expect(r.out).toMatch(/agents: +AGENTS.md +instructions added/);
    // With no preferences yet, it points to the setup survey in the client (B-5na1k).
    expect(r.out).toMatch(/preferences: +none yet +the client suggests them, from a few example decisions\nnext: baesian serve  # open the client/);
    const b = repo();
    await run(b.dir, ["init", "--no-agents"]);
    expect(existsSync(join(b.dir, "AGENTS.md"))).toBe(false);
  });

  it("prints a template that refuses to file until it is filled in", async () => {
    const { dir } = repo();
    const t = await run(dir, ["template"]);
    expect(Object.keys(parseDoc(t.out).meta)).toEqual(expect.arrayContaining(["question", "doing", "alternative", "crux", "reverse"]));
    const filed = await run(dir, ["file"], t.out);
    expect(filed.code).toBe(1);
    expect(filed.err).toMatch(/title|question/);
  });

  it("notifies for a blocking card and tells the agent to wait", async () => {
    const { dir } = repo();
    const r = await run(dir, ["file"], draftFile({ level: "blocking" }));
    expect(r.notified).toHaveLength(1);
    expect(r.out).toMatch(/next: baesian wait B-\w{5}  # before building on it/);
    const p = await run(dir, ["file"], draftFile({ title: "Test runner?", topic: "tests/runner" }));
    expect(p.notified).toHaveLength(1); // the io stub sees every filing; notifyFiled filters by level
  });

  it("lists topics", async () => {
    const { dir } = repo();
    await run(dir, ["file"], draftFile());
    expect((await run(dir, ["topics"])).out).toBe("1 topic in use: reuse one only for the same question\n  storage/run-metadata");
  });

  it("wait exits with the outcome's code", async () => {
    const { dir, store } = repo();
    const filed = await run(dir, ["file", "--json"], draftFile({ level: "hard" }));
    const id: string = JSON.parse(filed.out).card.meta.id;
    const clock = fakeClock();
    const parked = await run(dir, ["wait", id, "--timeout", "60"], "", { waitClock: clock });
    expect(parked.code).toBe(6);
    expect(parked.out).toMatch(/do not proceed/);
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    const resolved = await run(dir, ["wait", id], "", { waitClock: fakeClock() });
    expect(resolved.code).toBe(0);
    expect(resolved.out).toContain('resolved by gus (a person): "SQLite (WAL mode)"');
  });

  it("rejects a bad timeout", async () => {
    const { dir } = repo();
    const r = await run(dir, ["wait", "B-aaaaa", "--timeout", "soon"]);
    expect(r.code).not.toBe(0);
    expect(r.err).toMatch(/seconds/);
  });
});

describe("cli: wait on several cards, or a deck's (B-xnae9)", () => {
  const file = async (dir: string, overrides: Record<string, unknown>, agent = "claude-code") => {
    const r = await run(dir, ["--agent", agent, "file", "--new", "--json"], draftFile(overrides));
    expect(r.code, r.err).toBe(0);
    return JSON.parse(r.out).card.meta.id as string;
  };

  it("takes several IDs, and prints each card's outcome, as JSON too", async () => {
    const { dir, store } = repo();
    const a = await file(dir, { title: "Where runs live", topic: "area/runs", level: "blocking" });
    const b = await file(dir, { title: "Which queue carries jobs", topic: "area/queue" });
    const clock = fakeClock();
    clock.at(5_000, () => store.addVerdict({ card: a, revision: 1, response: "accept", ...REVIEWER }));
    clock.at(9_000, () => store.addVerdict({ card: b, revision: 1, response: "accept", ...REVIEWER }));
    const r = await run(dir, ["--agent", "claude-code", "wait", a, b, "--json"], "", { waitClock: clock });
    expect(r.code, r.err).toBe(0);
    expect(JSON.parse(r.out)).toMatchObject({ kind: "several", ended: "answered", ids: [a, b], exit: 0, next: "use", cards: [{ kind: "resolved", id: a }, { kind: "resolved", id: b }] });
    store.addVerdict({ card: a, revision: 1, response: "reject", comment: "No.", ...REVIEWER });
    const again = await run(dir, ["wait", a, b], "", { waitClock: fakeClock() });
    expect(again.code).toBe(4);
    expect(again.out.split("\n")[0]).toBe(`${a} came back to you, so the wait ended before every card was answered`);
  });

  it("--deck waits on this agent's cards still with the reviewer in the deck, on this branch, until each is answered", async () => {
    const { dir, store } = repo();
    store.createDeck({ id: "plan-runs", title: "Runs" }, "");
    const a = await file(dir, { title: "Where runs live", topic: "area/runs", deck: "plan-runs" });
    const b = await file(dir, { title: "Which queue carries jobs", topic: "area/queue", deck: "plan-runs" });
    const answered = await file(dir, { title: "How logs rotate", topic: "area/logs", deck: "plan-runs" });
    const others = await file(dir, { title: "What the API is called", topic: "area/api", deck: "plan-runs" }, "codex");
    const elsewhere = await file(dir, { title: "Who reads the metrics", topic: "area/metrics" });
    store.addVerdict({ card: answered, revision: 1, response: "accept", ...REVIEWER });
    const clock = fakeClock();
    clock.at(60 * 60_000, () => store.addVerdict({ card: a, revision: 1, response: "accept", ...REVIEWER }));
    clock.at(2 * 60 * 60_000, () => store.addVerdict({ card: b, revision: 1, response: "accept", ...REVIEWER }));
    const r = await run(dir, ["--agent", "claude-code", "wait", "--deck", "plan-runs", "--until-answered", "--no-presence"], "", { waitClock: { ...clock, pollMs: 60_000 } });
    expect(r.code, r.err).toBe(0);
    expect(r.out.split("\n")[0]).toBe(`every card you waited on has an answer: ${a} and ${b}`);
    expect(r.out).not.toContain(others);
    expect(r.out).not.toContain(elsewhere);
    expect(clock.elapsed()).toBe(2 * 60 * 60_000);
    // Delivered: the inbox doesn't hand them over again.
    expect((await run(dir, ["inbox"])).out).not.toContain(a);
  });

  it("names a deck that doesn't exist with a command that creates it, title and all (the hook test, 2026-11-06)", async () => {
    const { dir } = repo();
    const fileIt = () => run(dir, ["--agent", "claude-code", "file", "--new"], draftFile({ title: "What the cache is called", topic: "area/cache", deck: "hook-test" }));
    const r = await fileIt();
    expect(r.code).toBe(1);
    const hint = /create it with `([^`]+)`/.exec(r.err)?.[1];
    expect(hint).toBe('baesian deck hook-test --title "<what it decides>"');
    // Run as given, with its placeholder filled, it creates the deck: the card then files.
    expect((await run(dir, hint!.replace("<what it decides>", "What the cache is called").match(/"[^"]*"|\S+/g)!.slice(1).map((a) => a.replace(/^"|"$/g, "")))).code).toBe(0);
    expect((await fileIt()).code).toBe(0);
  });

  it("says what's wrong with no card, an unknown deck, or a deck with none of yours open", async () => {
    const { dir, store } = repo();
    expect(await run(dir, ["wait"])).toMatchObject({ code: 1, err: "name a card to wait on, or several, or a deck with --deck\nnext: baesian list  # the cards still with the reviewer" });
    expect(await run(dir, ["wait", "--deck", "nope"])).toMatchObject({ code: 1, err: 'no deck "nope"' });
    store.createDeck({ id: "plan-runs", title: "Runs" }, "");
    await file(dir, { title: "What the API is called", topic: "area/api", deck: "plan-runs" }, "codex");
    const none = await run(dir, ["--agent", "claude-code", "wait", "--deck", "plan-runs"]);
    expect(none.code).toBe(1);
    expect(none.err).toContain('deck "plan-runs" has no cards of yours still with the reviewer');
  });
});


describe("an agent's name (D102)", () => {
  it("comes from --agent, then BAESIAN_AGENT, then the harness, then \"agent\"", () => {
    const claude = { AI_AGENT: "claude-code_2-1-314_agent", CLAUDE_CODE_ENTRYPOINT: "cli" };
    expect(agentName("codex", { ...claude, BAESIAN_AGENT: "spark-research" })).toBe("codex");
    expect(agentName(undefined, { ...claude, BAESIAN_AGENT: "spark-research" })).toBe("spark-research");
    expect(agentName(undefined, claude)).toBe("claude-code");
    expect(agentName(undefined, { CLAUDE_CODE_ENTRYPOINT: "cli" })).toBe("claude-code");
    expect(agentName(undefined, { CODEX_THREAD_ID: "019a-thread", CODEX_VERSION: "0.166.0" })).toBe("codex");
    expect(agentName(undefined, { BAESIAN_AGENT: "  " })).toBe("agent");
    expect(agentName(undefined, {})).toBe("agent");
  });

  it("is in the instructions, with the new exit code (D101)", () => {
    expect(AGENTS_BLOCK).toContain("BAESIAN_AGENT");
    // A topic names one question; a follow-on gets its own (D112).
    expect(AGENTS_BLOCK).toContain("A topic names one question");
    expect(AGENTS_BLOCK).toContain("give it a narrower topic");
    // What the reviewer needs in order to choose goes where they see it first (D113).
    expect(AGENTS_BLOCK).toContain("put what they need in order to choose, kept neutral, in\n`crux_fact`");
    expect(CARD_TEMPLATE).toContain("the only context they see first");
    expect(CARD_TEMPLATE).toContain("reuse one from `baesian topics` only for the same question");
    expect(AGENTS_BLOCK).toMatch(/7 while\s+the reviewer is still there/);
    // Late answers are taken at a stopping point, never mid-task (D116).
    expect(AGENTS_BLOCK).toContain("and again when you finish a task");
  });
});
