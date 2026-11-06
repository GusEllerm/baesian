import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AGENTS_BLOCK } from "../src/agents.js";
import { main } from "../src/cli.js";
import { parseDoc } from "../src/frontmatter.js";
import { openRepo } from "../src/git.js";
import { serverState } from "../src/server.js";
import { Store } from "../src/store.js";
import { verify } from "../src/verify.js";
import { DECISION_LOG_SECTION, cleanName, decisionNoteName, enableBases, insertLogQuery, listNotes, parseWikilink, resolveWikilink, writeNotes } from "../src/vault.js";
import { BODY, REVIEWER, cleanup, draft, repo, sh, worktree } from "./helpers.js";

// M6, the vault adapter (docs/vault/Design/Vault Adapter.md, P17 §12): notes rendered from the record, against real
// repositories and linked worktrees. The hook's own tests, with commits through the real hooks, are in vault-hooks.test.ts.

afterEach(cleanup);

const AGENT = { agent: "claude-code" };
const VAULT = "docs/vault";

/** A repo with Baesian set up and a vault folder recorded in its config. */
function vaultRepo() {
  const r = repo();
  mkdirSync(join(r.dir, VAULT), { recursive: true });
  r.store.setVault(VAULT);
  return r;
}

/** Sync the record and write the notes, as `baesian sync` and the pre-commit hook do. */
function write(store: Store) {
  store.syncRecord();
  return writeNotes(store);
}

/** Every note in a vault folder: its name, and its text. */
function notesIn(dir: string, folder = "Decisions"): Record<string, string> {
  const at = join(dir, VAULT, folder);
  if (!existsSync(at)) return {};
  return Object.fromEntries(readdirSync(at).map((f) => [f, readFileSync(join(at, f), "utf8")]));
}

function only(dir: string, folder = "Decisions"): { name: string; text: string; meta: Record<string, unknown>; body: string } {
  const all = Object.entries(notesIn(dir, folder));
  expect(all).toHaveLength(1);
  const [name, text] = all[0]!;
  return { name, text, ...parseDoc(text) };
}

function noteFor(dir: string, id: string, folder = "Decisions") {
  const name = Object.keys(notesIn(dir, folder)).find((n) => n.startsWith(`${id} `) || n === `${id}.md`);
  if (!name) throw new Error(`no note for ${id}`);
  const text = readFileSync(join(dir, VAULT, folder, name), "utf8");
  return { name, text, ...parseDoc(text) };
}

const file = (store: Store, over: Record<string, unknown> = {}, body = BODY) => store.fileCard(draft(over), body, { ...AGENT, force: true }).card.meta.id;

async function run(cwd: string, args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const io = { out: (l: string) => out.push(l), err: (l: string) => err.push(l), stdin: () => "", cwd, hookFallback: [] as string[] };
  const code = await main(["node", "baesian", ...args], io);
  return { code, out: out.join("\n"), err: err.join("\n") };
}

describe("a decision note (D171, D172)", () => {
  it("is written for an accepted card, named by its ID and title, with its frontmatter and the decision as a person reads it", () => {
    const { dir, store } = vaultRepo();
    const id = file(store, { crux_fact: "Two CI runners write at once.", rationale: "One file is simplest." });
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    const r = write(store);
    expect(r.written).toEqual([`${VAULT}/Decisions/${id} The run-metadata store.md`]);
    const note = only(dir);
    expect(note.meta).toMatchObject({
      type: "decision",
      status: "active",
      authority: "log",
      livedocs: "snapshot",
      summary: `The run-metadata store: SQLite (WAL mode) (${id}).`,
      tags: ["baesian", "decision"],
      aliases: [id],
      card: id,
      revision: 1,
      answer: "SQLite (WAL mode)",
      response: "accept",
      not_chosen: ["Postgres"],
      answered_by: "gus",
      topic: "storage/run-metadata",
      filed_by: "claude-code",
      branch: "main",
    });
    // The vault's keys first, then the decision's (P17 §2).
    expect(Object.keys(note.meta).slice(0, 5)).toEqual(["type", "format", "status", "authority", "livedocs"]);
    expect(note.body).toContain("# The run-metadata store\n\nWhich store should hold run metadata?");
    expect(note.body).toContain("**Decided:** SQLite (WAL mode), the agent's pick. Then runs are recorded in one file next to the repo.");
    expect(note.body).toContain("**Not chosen:** Postgres. Then runs go to a database server that has to be running.");
    // An option's consequence written as a sentence stands as one, not as "Then The…".
    const capital = file(store, { title: "The cache", question: "Where should the cache live?", topic: "storage/cache", proposal_then: "Runs are cached in one file." });
    store.addVerdict({ card: capital, revision: 1, response: "accept", ...REVIEWER });
    write(store);
    expect(noteFor(dir, capital).body).toContain("**Decided:** SQLite (WAL mode), the agent's pick. Runs are cached in one file.");
    const risky = file(store, { title: "The queue", question: "Which queue?", topic: "storage/queue", wrong_if: "Jobs outgrow one machine", check: "Count jobs per hour" });
    store.addVerdict({ card: risky, revision: 1, response: "accept", ...REVIEWER });
    write(store);
    expect(noteFor(dir, risky).body).toContain("**Wrong if:** Jobs outgrow one machine. **To check:** Count jobs per hour.");
    expect(note.body).toContain("**It turned on:** Will more than one machine write runs at once? If not: SQLite (WAL mode). If so: Postgres.");
    expect(note.body).toContain("**The fact given:** Two CI runners write at once.");
    expect(note.body).toContain("**The agent's case:** One file is simplest.");
    expect(note.body).toContain(`through Baesian (card ${id}, revision 1)`);
    expect(note.body).toContain("editing this note changes nothing");
    expect(note.body).toContain(`## Background\n\n${BODY.trim()}`);
    expect(note.body).not.toContain("**Comment:**");
  });

  it("names what was chosen and not chosen, for the alternative and for the reviewer's own answer", () => {
    const { dir, store } = vaultRepo();
    const alt = file(store);
    store.addVerdict({ card: alt, revision: 1, response: "alternative", choice: "Postgres", first_choice: "proposal", comment: "Two runners.", ...REVIEWER });
    const own = file(store, { title: "Where run files are kept", topic: "storage/run-files" });
    store.addVerdict({ card: own, revision: 1, response: "correction", choice: "DuckDB files", ...REVIEWER });
    write(store);
    const a = noteFor(dir, alt);
    expect(a.meta).toMatchObject({ answer: "Postgres", response: "alternative", not_chosen: ["SQLite (WAL mode)"] });
    expect(a.body).toContain("**Decided:** Postgres, the alternative. Then runs go to a database server");
    expect(a.body).toContain("**Not chosen:** SQLite (WAL mode), the agent's pick. Then runs are recorded");
    expect(a.body).toContain('**Comment:** "Two runners."');
    expect(a.body).toContain("**First chose:** SQLite (WAL mode), then switched once the agent's pick was shown.");
    const o = noteFor(dir, own);
    expect(o.meta).toMatchObject({ answer: "DuckDB files", response: "correction", not_chosen: ["SQLite (WAL mode)", "Postgres"] });
    expect(o.body).toContain("**Decided:** DuckDB files, the reviewer's own answer.\n");
    expect(o.body.match(/\*\*Not chosen:\*\*/g)).toHaveLength(2);
  });

  it("says a decision was answered in chat first, with what the reviewer said (B-hswmx)", () => {
    const { dir, store } = vaultRepo();
    const id = file(store, { answered_in_chat: "SQLite: one machine writes runs", proposal: "SQLite (WAL mode)" });
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    write(store);
    const note = noteFor(dir, id);
    expect(note.body).toContain('**Answered in chat first:** "SQLite: one machine writes runs", which the agent filed as its pick.');
    expect(note.body).not.toContain("**First chose:**");
  });

  it("is written for a conflict card, and the decision it didn't choose is superseded (D35)", () => {
    const { dir, store } = vaultRepo();
    const base = file(store);
    store.addVerdict({ card: base, revision: 1, response: "accept", ...REVIEWER });
    const branch = file(store, { title: "The run-metadata store, again" });
    store.addVerdict({ card: branch, revision: 1, response: "alternative", choice: "Postgres", ...REVIEWER });
    const conflict = store.fileCard(
      draft({
        title: "Two answers on storage/run-metadata",
        proposal: "SQLite (WAL mode)",
        alternative: "Postgres",
        crux: "Was the newer decision made with context the older one lacked?",
        crux_proposal: "If it wasn't",
        crux_alternative: "If it was",
        conflict_of: [base, branch],
        caught_at: "merge",
      }),
      "",
      { agent: "baesian", force: true },
    ).card.meta.id;
    store.addVerdict({ card: conflict, revision: 1, response: "accept", ...REVIEWER });
    write(store);
    expect(noteFor(dir, conflict).meta).toMatchObject({ status: "active", conflict_of: [`[[${base} The run-metadata store|${base}]]`, `[[${branch} The run-metadata store, again|${branch}]]`] });
    const lost = noteFor(dir, branch);
    expect(lost.meta).toMatchObject({ status: "superseded", superseded_by: `[[${conflict} Two answers on storagerun-metadata|${conflict}]]` });
    expect(lost.body).toMatch(new RegExp(`## Superseded on \\d{4}-\\d{2}-\\d{2}\\n\\nBy \\[\\[${conflict} Two answers on storagerun-metadata\\|${conflict}\\]\\], which decided: SQLite \\(WAL mode\\)\\.`));
    expect(noteFor(dir, base).meta.status).toBe("active");
  });

  it("isn't written for a card never resolved, nor for a rule draft, whose rule gets a rule note", () => {
    const { dir, store } = vaultRepo();
    file(store, { title: "Still open" });
    const asked = file(store, { title: "Returned", topic: "storage/returned" });
    store.addVerdict({ card: asked, revision: 1, response: "question", comment: "Why?", ...REVIEWER });
    const parked = file(store, { title: "Deferred", topic: "storage/deferred" });
    store.addVerdict({ card: parked, revision: 1, response: "defer", comment: "Later.", ...REVIEWER });
    const gone = file(store, { title: "Withdrawn", topic: "storage/withdrawn" });
    store.withdraw(gone, "not needed", "claude-code");
    const runner = file(store, { title: "The test runner", topic: "testing/runner", proposal: "pytest", alternative: "unittest" });
    store.addVerdict({ card: runner, revision: 1, response: "accept", make_rule: true, ...REVIEWER });
    const ruleCard = store.draftRule(runner, "Use pytest for every Python test suite. No exceptions.", ["dep:pytest*"], AGENT).meta.id;
    store.addVerdict({ card: ruleCard, revision: 1, response: "accept", ...REVIEWER });
    write(store);
    expect(Object.keys(notesIn(dir))).toEqual([`${runner} The test runner.md`]);
    const rule = only(dir, "Rules");
    const id = store.rules()[0]!.meta.id;
    expect(rule.name).toBe(`${id} Use pytest for every Python test suite. No exceptions.md`);
    expect(rule.meta).toMatchObject({
      type: "rule",
      status: "active",
      authority: "specifies",
      livedocs: "snapshot",
      summary: "Use pytest for every Python test suite.",
      tags: ["baesian", "rule"],
      aliases: [id],
      rule: id,
      topic: "testing/runner",
      covers: ["dep:pytest*"],
      from_card: `[[${runner} The test runner|${runner}]]`,
      accepted_by: "gus",
    });
    expect(rule.body).toContain("> Use pytest for every Python test suite. No exceptions.");
    expect(rule.body).toContain(`from the decision ${runner}`);
    expect(rule.body).toContain("`dep:pytest*`");
    expect(rule.body).toContain("Editing this note changes no rule");
  });

  it("isn't written at all without a vault (D8)", () => {
    const { dir, store } = repo();
    const id = file(store);
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    expect(write(store)).toMatchObject({ notes: [], written: [], warnings: [] });
    expect(existsSync(join(dir, VAULT))).toBe(false);
  });

  it("warns, and writes nothing, when the vault isn't there", () => {
    const { dir, store } = vaultRepo();
    rmSync(join(dir, VAULT), { recursive: true });
    const id = file(store);
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    const r = write(store);
    expect(r.written).toEqual([]);
    expect(r.unusable).toBe(true);
    expect(r.warnings[0]).toContain(`the vault ${VAULT}/ that .baesian/config.json names isn't there`);
    expect(existsSync(join(dir, VAULT))).toBe(false);
  });
});

describe("names (D171)", () => {
  it("drop what Obsidian can't use, collapse spacing, and cut at a word boundary to 80 characters", () => {
    expect(cleanName('Where * the "token" \\ lives / <here> : a|b? #c ^d [e]', 80)).toBe("Where the token lives here ab c d e");
    expect(cleanName("  lots   of\tspace\nhere. ", 80)).toBe("lots of space here");
    const long = "word ".repeat(30).trim();
    const cut = cleanName(long, 80);
    expect(cut.length).toBeLessThanOrEqual(80);
    expect(cut.endsWith("word")).toBe(true);
    expect(cleanName("x".repeat(100), 80)).toHaveLength(80);
    expect(decisionNoteName("B-3akjw", "How an answer becomes a rule")).toBe("B-3akjw How an answer becomes a rule");
    expect(decisionNoteName("B-3akjw", "???")).toBe("B-3akjw");
  });

  it("keep the first revision's title after a retitle, so every copy of the card names the note the same", () => {
    const { dir, store } = vaultRepo();
    const id = file(store, { title: "First title" });
    store.addVerdict({ card: id, revision: 1, response: "need_context", ...REVIEWER });
    store.reviseCard(id, draft({ title: "Second title" }), BODY, AGENT);
    store.addVerdict({ card: id, revision: 2, response: "accept", ...REVIEWER });
    write(store);
    const note = only(dir);
    expect(note.name).toBe(`${id} First title.md`);
    expect(note.meta).toMatchObject({ title: "Second title", revision: 2 });
  });

  it("find a note renamed by hand by its ID, so it isn't written twice, and change it in place", () => {
    const { dir, store } = vaultRepo();
    const id = file(store);
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    write(store);
    const folder = join(dir, VAULT, "Decisions");
    mkdirSync(join(folder, "Storage"));
    renameSync(join(folder, `${id} The run-metadata store.md`), join(folder, "Storage", `${id} Where runs are kept.md`));
    expect(write(store).written).toEqual([]);
    store.addVerdict({ card: id, revision: 1, response: "alternative", choice: "Postgres", ...REVIEWER });
    expect(write(store).written).toEqual([`${VAULT}/Decisions/Storage/${id} Where runs are kept.md`]);
    expect(readdirSync(folder)).toEqual(["Storage"]);
  });
});

describe("when a decision changes (D172)", () => {
  it("adds a dated section for a changed answer, and updates the frontmatter, once", () => {
    const { dir, store } = vaultRepo();
    const id = file(store);
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    write(store);
    const before = only(dir).text;
    store.addVerdict({ card: id, revision: 1, response: "alternative", choice: "Postgres", comment: "We have two runners now.", ...REVIEWER });
    expect(write(store).written).toHaveLength(1);
    const after = only(dir);
    expect(after.meta).toMatchObject({ answer: "Postgres", response: "alternative", not_chosen: ["SQLite (WAL mode)"], status: "active" });
    // What it said stays: the body only grows at the end.
    expect(after.body).toContain(parseDoc(before).body.trim());
    expect(after.body).toMatch(/## Changed on \d{4}-\d{2}-\d{2}\n\n\*\*Now:\*\* Postgres, the alternative\. \*\*Was:\*\* SQLite \(WAL mode\)\. Answered by gus\.\n\n\*\*Comment:\*\* "We have two runners now\."\n$/);
    expect(write(store).written).toEqual([]);
  });

  it("marks it reopened when an answer sends it back, and answered again when it comes back the same", () => {
    const { dir, store } = vaultRepo();
    const id = file(store);
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    write(store);
    store.addVerdict({ card: id, revision: 1, response: "question", comment: "Is one machine enough?", ...REVIEWER });
    write(store);
    let note = only(dir);
    expect(note.meta.status).toBe("reopened");
    expect(note.body).toContain('## Reopened on');
    expect(note.body).toContain('gus asked a question: "Is one machine enough?"');
    expect(write(store).written).toEqual([]);
    store.reviseCard(id, draft(), BODY, AGENT);
    store.addVerdict({ card: id, revision: 2, response: "accept", ...REVIEWER });
    write(store);
    note = only(dir);
    expect(note.meta).toMatchObject({ status: "active", revision: 2 });
    expect(note.body).toContain("## Answered again on");
    expect(note.body).toContain("**Decided:** SQLite (WAL mode), the agent's pick, as before.");
    expect(write(store).written).toEqual([]);
  });

  it("marks it reopened when the agent replies once (D89)", () => {
    const { dir, store } = vaultRepo();
    const id = file(store);
    store.addVerdict({ card: id, revision: 1, response: "alternative", choice: "Postgres", ...REVIEWER });
    write(store);
    store.replyToCard(id, "Only one machine writes: CI runs serially.", AGENT);
    write(store);
    const note = only(dir);
    expect(note.meta.status).toBe("reopened");
    expect(note.body).toContain('claude-code replied to the answer, once: "Only one machine writes: CI runs serially."');
    expect(write(store).written).toEqual([]);
  });

  it("marks it superseded when a card that supersedes it resolves, linking each to the other", () => {
    const { dir, store } = vaultRepo();
    const old = file(store);
    store.addVerdict({ card: old, revision: 1, response: "accept", ...REVIEWER });
    write(store);
    const next = file(store, { title: "Run metadata, revisited", supersedes: old, proposal: "Postgres", alternative: "SQLite (WAL mode)" });
    store.addVerdict({ card: next, revision: 1, response: "accept", ...REVIEWER });
    write(store);
    const was = noteFor(dir, old);
    expect(was.meta).toMatchObject({ status: "superseded", superseded_by: `[[${next} Run metadata, revisited|${next}]]` });
    expect(was.body).toContain(`By [[${next} Run metadata, revisited|${next}]], which decided: Postgres.`);
    expect(noteFor(dir, next).meta.supersedes).toBe(`[[${old} The run-metadata store|${old}]]`);
    expect(write(store).written).toEqual([]);
  });

  it("marks it withdrawn, by its agent or when the card it builds on is rejected (D14)", () => {
    const { dir, store } = vaultRepo();
    const mine = file(store);
    store.addVerdict({ card: mine, revision: 1, response: "accept", ...REVIEWER });
    const parent = file(store, { title: "The storage layer", topic: "storage/layer" });
    const child = file(store, { title: "The run files", topic: "storage/run-files", depends_on: [parent] });
    store.addVerdict({ card: child, revision: 1, response: "accept", ...REVIEWER });
    write(store);
    store.withdraw(mine, "the runs moved to the service", "claude-code");
    store.addVerdict({ card: parent, revision: 1, response: "reject", comment: "No storage layer.", ...REVIEWER });
    write(store);
    const a = noteFor(dir, mine);
    expect(a.meta.status).toBe("withdrawn");
    expect(a.body).toContain("## Withdrawn on");
    expect(a.body).toContain("By claude-code: the runs moved to the service.");
    const b = noteFor(dir, child);
    expect(b.meta).toMatchObject({ status: "withdrawn", depends_on: [parent] });
    expect(b.body).toContain(`It builds on ${parent}, which was rejected: "No storage layer."`);
    expect(write(store).written).toEqual([]);
  });

  it("marks it reopened when the card it builds on is decided otherwise (D80)", () => {
    const { dir, store } = vaultRepo();
    const parent = file(store, { title: "The storage layer", topic: "storage/layer" });
    store.addVerdict({ card: parent, revision: 1, response: "accept", ...REVIEWER });
    const child = file(store, { title: "The run files", topic: "storage/run-files", depends_on: [parent] });
    store.addVerdict({ card: child, revision: 1, response: "accept", ...REVIEWER });
    write(store);
    store.addVerdict({ card: parent, revision: 1, response: "alternative", choice: "Postgres", ...REVIEWER });
    write(store);
    const note = noteFor(dir, child);
    expect(note.meta).toMatchObject({ status: "reopened", depends_on: [`[[${parent} The storage layer|${parent}]]`] });
    expect(note.body).toContain(`It builds on [[${parent} The storage layer|${parent}]], which was decided otherwise: "Postgres".`);
  });

  it("retires a rule's note when an answer retires the rule (D119), once", () => {
    const { dir, store } = vaultRepo();
    const runner = file(store, { title: "The test runner", topic: "testing/runner", proposal: "pytest", alternative: "unittest" });
    store.addVerdict({ card: runner, revision: 1, response: "accept", make_rule: true, ...REVIEWER });
    const draftId = store.draftRule(runner, "Use pytest.", ["dep:pytest*"], AGENT).meta.id;
    store.addVerdict({ card: draftId, revision: 1, response: "accept", ...REVIEWER });
    write(store);
    const ruleId = store.rules()[0]!.meta.id;
    const breaker = file(store, { title: "A second runner", topic: "testing/second-runner", proposal_breaks: [ruleId] });
    store.addVerdict({ card: breaker, revision: 1, response: "accept", retire_rules: [ruleId], ...REVIEWER });
    write(store);
    const rule = only(dir, "Rules");
    expect(rule.meta).toMatchObject({ status: "retired", retired_by: "gus", retired_on: `[[${breaker} A second runner|${breaker}]]` });
    expect(rule.body).toMatch(new RegExp(`## Retired on \\d{4}-\\d{2}-\\d{2}\\n\\nBy gus, with the answer on ${breaker}, whose chosen option breaks it\\. The gate no longer applies it\\.\\n$`));
    expect(write(store).written).toEqual([]);
  });

  it("keeps what a person wrote: text in the middle, keys and tags of their own", () => {
    const { dir, store } = vaultRepo();
    const id = file(store);
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    write(store);
    const path = join(dir, VAULT, "Decisions", `${id} The run-metadata store.md`);
    const edited = readFileSync(path, "utf8")
      .replace("  - decision\n", "  - decision\n  - storage\n")
      .replace("branch: main\n", "branch: main\nreviewed: 2026-11-04\n")
      .replace("## Background", "A note of my own, in the middle.\n\n## Background");
    writeFileSync(path, edited);
    expect(write(store).written).toEqual([]);
    store.addVerdict({ card: id, revision: 1, response: "alternative", choice: "Postgres", ...REVIEWER });
    write(store);
    const note = only(dir);
    expect(note.body).toContain("A note of my own, in the middle.\n\n## Background");
    expect(note.body).toMatch(/## Changed on \d{4}-\d{2}-\d{2}\n\n\*\*Now:\*\* Postgres/);
    expect(note.meta).toMatchObject({ reviewed: "2026-11-04", tags: ["baesian", "decision", "storage"], answer: "Postgres" });
  });

  it("is the same note written fresh as written earlier and extended since", () => {
    const { dir, store } = vaultRepo();
    const id = file(store);
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    write(store);
    store.addVerdict({ card: id, revision: 1, response: "question", comment: "Why?", ...REVIEWER });
    write(store);
    store.reviseCard(id, draft(), BODY, AGENT);
    store.addVerdict({ card: id, revision: 2, response: "correction", choice: "DuckDB files", ...REVIEWER });
    write(store);
    const extended = only(dir).text;
    expect(extended.match(/^## (Reopened|Changed) on/gm)).toEqual(["## Reopened on", "## Changed on"]);
    rmSync(join(dir, VAULT, "Decisions"), { recursive: true });
    write(store);
    expect(only(dir).text).toBe(extended);
  });
});

describe("on two branches (D170, D172)", () => {
  /** Main, with Baesian and its vault committed, and two worktrees branched from it. */
  function twoBranches() {
    const main = vaultRepo();
    writeFileSync(join(main.dir, VAULT, "Home.md"), "# Home\n");
    sh(main.dir, "add", "-A");
    sh(main.dir, "commit", "-q", "-m", "Set up");
    return { main, a: worktree(main.dir, "a"), b: worktree(main.dir, "b") };
  }
  const commitAll = (dir: string, store: Store, message: string) => {
    write(store);
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", message);
  };

  it("write the same bytes for a card they both hold, and merge cleanly", () => {
    const { a, b } = twoBranches();
    const id = file(a.store);
    b.store.attach(id, "codex");
    a.store.addVerdict({ card: id, revision: 1, response: "alternative", choice: "Postgres", ...REVIEWER });
    commitAll(a.dir, a.store, "On a");
    commitAll(b.dir, b.store, "On b");
    expect(notesIn(a.dir)).toEqual(notesIn(b.dir));
    expect(Object.keys(notesIn(a.dir))).toHaveLength(1);
    const merge = spawnSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "user.name=t", "-c", "user.email=t@t", "merge", "-q", "--no-edit", "b"], { cwd: a.dir, encoding: "utf8" });
    expect(merge.status).toBe(0);
    expect(write(a.store).written).toEqual([]);
  });

  it("conflict when each supersedes one decision differently: a real conflict stays one", () => {
    const main = vaultRepo();
    const old = file(main.store);
    main.store.addVerdict({ card: old, revision: 1, response: "accept", ...REVIEWER });
    commitAll(main.dir, main.store, "Decided");
    const a = worktree(main.dir, "a");
    const b = worktree(main.dir, "b");
    const onA = file(a.store, { title: "Postgres after all", supersedes: old, proposal: "Postgres", alternative: "SQLite (WAL mode)" });
    a.store.addVerdict({ card: onA, revision: 1, response: "accept", ...REVIEWER });
    commitAll(a.dir, a.store, "Superseded on a");
    const onB = file(b.store, { title: "DuckDB after all", supersedes: old, proposal: "DuckDB", alternative: "SQLite (WAL mode)" });
    b.store.addVerdict({ card: onB, revision: 1, response: "accept", ...REVIEWER });
    commitAll(b.dir, b.store, "Superseded on b");
    const merge = spawnSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "user.name=t", "-c", "user.email=t@t", "merge", "-q", "--no-edit", "b"], { cwd: a.dir, encoding: "utf8" });
    expect(merge.status).not.toBe(0);
    expect(sh(a.dir, "diff", "--name-only", "--diff-filter=U")).toBe(`${VAULT}/Decisions/${old} The run-metadata store.md`);
  });

  it("end in the right note from either side of a conflict that isn't real: one wrote it before an answer changed, one after", () => {
    for (const side of ["--ours", "--theirs"]) {
      const { a, b } = twoBranches();
      const id = file(a.store);
      b.store.attach(id, "codex");
      a.store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
      commitAll(a.dir, a.store, "Written before the change");
      a.store.addVerdict({ card: id, revision: 1, response: "alternative", choice: "Postgres", ...REVIEWER });
      commitAll(b.dir, b.store, "Written after it");
      const right = notesIn(b.dir);
      const merge = spawnSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "user.name=t", "-c", "user.email=t@t", "merge", "-q", "--no-edit", "b"], { cwd: a.dir, encoding: "utf8" });
      expect(merge.status).not.toBe(0);
      const [note] = Object.keys(right);
      sh(a.dir, "checkout", side, "--", `${VAULT}/Decisions/${note}`);
      // The commit that resolves the merge runs the adapter, which adds whatever is missing.
      write(a.store);
      expect(notesIn(a.dir)).toEqual(right);
      cleanup();
    }
  });
});

describe("baesian init --vault (P17 §5)", () => {
  /** A vault folder as `livedocs new-vault` leaves it, with Obsidian's settings and a Decision Log. */
  function withVault(dir: string, plugins: unknown = { "file-explorer": true, graph: true }) {
    mkdirSync(join(dir, VAULT, ".obsidian"), { recursive: true });
    writeFileSync(join(dir, VAULT, ".obsidian", "core-plugins.json"), `${JSON.stringify(plugins, null, 2)}\n`);
    writeFileSync(join(dir, VAULT, "Working Agreement.md"), "# Working Agreement\n");
    writeFileSync(join(dir, VAULT, "Decision Log.md"), "---\ntype: decision-log\n---\n\n# Decision Log\n\nIntro.\n\n## Accepted (user)\n\n| ID |\n");
  }

  it("records the vault in a config that already exists, turns Bases on, and adds the query to the Decision Log once", async () => {
    const { dir, store } = repo();
    writeFileSync(join(store.record, "config.json"), `${JSON.stringify({ gate_schema: ["src/schema.ts"] }, null, 2)}\n`);
    withVault(dir);
    const r = await run(dir, ["init", "--no-hooks", "--vault", `${VAULT}/`]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/vault: +docs\/vault\/ +recorded in \.baesian\/config\.json; Bases turned on/);
    expect(store.config()).toEqual({ format: 1, vault: VAULT, gate_schema: ["src/schema.ts"] });
    expect(readFileSync(join(dir, VAULT, ".obsidian", "core-plugins.json"), "utf8")).toBe(`{\n  "file-explorer": true,\n  "graph": true,\n  "bases": true\n}\n`);
    const log = readFileSync(join(dir, VAULT, "Decision Log.md"), "utf8");
    expect(log).toBe(`---\ntype: decision-log\n---\n\n# Decision Log\n\nIntro.\n\n${DECISION_LOG_SECTION}\n## Accepted (user)\n\n| ID |\n`);
    const again = await run(dir, ["init", "--no-hooks", "--vault", VAULT]);
    expect(again.out).toMatch(/^Baesian is set up in this repo already, in shared mode\n  vault: +docs\/vault\/ +already in .baesian\/config.json;/);
    expect(readFileSync(join(dir, VAULT, "Decision Log.md"), "utf8")).toBe(log);
  });

  it("adds Bases to the older list form, and leaves Bases already on alone", () => {
    const { dir } = repo();
    withVault(dir, ["file-explorer", "graph"]);
    expect(enableBases(join(dir, VAULT))).toBe("enabled");
    expect(JSON.parse(readFileSync(join(dir, VAULT, ".obsidian", "core-plugins.json"), "utf8"))).toEqual(["file-explorer", "graph", "bases"]);
    expect(enableBases(join(dir, VAULT))).toBe("already");
  });

  it("creates no .obsidian/, and prints the section to paste when there's no Decision Log", async () => {
    const { dir } = repo();
    mkdirSync(join(dir, VAULT), { recursive: true });
    const r = await run(dir, ["init", "--no-hooks", "--no-agents", "--vault", VAULT]);
    expect(r.code).toBe(0);
    expect(existsSync(join(dir, VAULT, ".obsidian"))).toBe(false);
    expect(r.out).toContain("has no .obsidian/, so Bases isn't turned on");
    expect(r.out).toContain("has no Decision Log.md");
    expect(r.out).toContain("```base");
    expect(insertLogQuery(join(dir, VAULT))).toBe("no-log");
  });

  it("points agents to the vault's routing notes and rules, as guidance (D173)", async () => {
    const { dir } = repo();
    withVault(dir);
    await run(dir, ["init", "--no-hooks", "--vault", VAULT]);
    const agents = readFileSync(join(dir, "AGENTS.md"), "utf8");
    expect(agents).toContain(`Before deciding whether to file, read this repo's guidance in its vault: \`${VAULT}/Working Agreement.md\` and the rules in force, in \`${VAULT}/Rules/\`.`);
    // Without a vault, the block is as it was.
    const plain = repo();
    await run(plain.dir, ["init", "--no-hooks"]);
    expect(readFileSync(join(plain.dir, "AGENTS.md"), "utf8")).toContain(AGENTS_BLOCK);
  });

  it("refuses a vault outside the repo", async () => {
    const { dir } = repo();
    expect((await run(dir, ["init", "--no-hooks", "--vault", "../elsewhere"])).err).toContain("the vault must be inside the repo");
    expect((await run(dir, ["init", "--no-hooks", "--vault", "/tmp/vault"])).err).toContain("relative to the repo root");
  });
});

describe("baesian sync", () => {
  it("writes the vault's notes, without staging them", async () => {
    const { dir, store } = vaultRepo();
    const id = file(store);
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    const r = await run(dir, ["sync"]);
    expect(r.out).toContain(`wrote 1 note in the vault\n  ${VAULT}/Decisions/${id} The run-metadata store.md`);
    expect(sh(dir, "diff", "--cached", "--name-only")).toBe("");
    expect((await run(dir, ["sync"])).out).toContain("the vault's notes are up to date");
  });
});

describe("baesian verify (P17 §11)", () => {
  it("warns, without failing, when a decision in the record has no note, or the vault is missing", () => {
    const { dir, store } = vaultRepo();
    writeFileSync(join(dir, VAULT, "Home.md"), "# Home\n");
    store.syncRecord();
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", "Set up");
    const base = sh(dir, "rev-parse", "HEAD");
    const id = file(store, { touches: [] });
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    store.syncRecord();
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", "Decided, without its note");
    let r = verify(openRepo(dir), base, { merge: false });
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([`${VAULT}/ lacks 1 note for what the record holds (${id}): run \`baesian sync\`, then commit.`]);
    writeNotes(store);
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", "Its note");
    expect(verify(openRepo(dir), base, { merge: false }).warnings).toBeUndefined();
    sh(dir, "rm", "-q", "-r", VAULT);
    sh(dir, "commit", "-q", "-m", "No vault");
    r = verify(openRepo(dir), base, { merge: false });
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([`the vault ${VAULT}/ that .baesian/config.json names isn't in the commit`]);
  });
});

describe("links from decks (P17 §8)", () => {
  const notes = ["Home", "Design/Baesian Design", "Design/Vault Adapter", "Sessions/2026-11-03 Notes", "Archive/Old/Baesian Design", "Modules/src-store"];

  it("parse a wikilink's target, heading and display text", () => {
    expect(parseWikilink("[[Baesian Design#The git gate|the gate]]")).toEqual({ target: "Baesian Design", heading: "The git gate", text: "the gate" });
    expect(parseWikilink("[[Design/Vault Adapter]]")).toEqual({ target: "Design/Vault Adapter" });
    expect(parseWikilink("Vault Adapter")).toEqual({ target: "Vault Adapter" });
  });

  it("resolve as Obsidian does: by name anywhere, by path, ignoring case; the shortest path of several", () => {
    expect(resolveWikilink(notes, "Vault Adapter")).toBe("Design/Vault Adapter");
    expect(resolveWikilink(notes, "vault adapter.md")).toBe("Design/Vault Adapter");
    expect(resolveWikilink(notes, "Baesian Design")).toBe("Design/Baesian Design");
    expect(resolveWikilink(notes, "Old/Baesian Design")).toBe("Archive/Old/Baesian Design");
    expect(resolveWikilink(notes, "Design/src-store")).toBeUndefined();
    expect(resolveWikilink(notes, "Missing")).toBeUndefined();
    expect(resolveWikilink(notes, "")).toBeUndefined();
  });

  it("reach the client with each note's path and summary line, or that it's missing; plain text without a vault", () => {
    const { dir, store } = vaultRepo();
    const put = (path: string, text: string) => {
      mkdirSync(dirname(join(dir, VAULT, path)), { recursive: true });
      writeFileSync(join(dir, VAULT, path), text);
    };
    put("Design/Vault Adapter.md", '---\nsummary: "How the adapter writes notes."\n---\n\n# Vault Adapter\n');
    put("Home.md", "# Home, with no frontmatter\n");
    put(".obsidian/Hidden.md", "---\nsummary: hidden\n---\n");
    expect(listNotes(join(dir, VAULT))).toEqual(["Design/Vault Adapter", "Home"]);
    store.createDeck({ id: "vault", title: "The vault adapter", context_notes: ["[[Vault Adapter#Links|the links]]", "[[Home]]", "[[Nowhere]]"] }, "The briefing.\n");
    const state = serverState(store, { version: 1, started: new Date().toISOString(), watch: "poll" });
    expect(state.decks.find((d) => d.meta.id === "vault")!.notes).toEqual([
      { link: "[[Vault Adapter#Links|the links]]", text: "the links", path: `${VAULT}/Design/Vault Adapter.md`, summary: "How the adapter writes notes." },
      { link: "[[Home]]", text: "Home", path: `${VAULT}/Home.md` },
      { link: "[[Nowhere]]", text: "Nowhere", missing: true },
    ]);
    const plain = repo();
    plain.store.createDeck({ id: "vault", title: "The vault adapter", context_notes: ["[[Design/Vault Adapter#Links]]"] }, "");
    const without = serverState(plain.store, { version: 1, started: new Date().toISOString(), watch: "poll" });
    expect(without.decks.find((d) => d.meta.id === "vault")!.notes).toEqual([{ link: "[[Design/Vault Adapter#Links]]", text: "Vault Adapter › Links" }]);
  });
});
