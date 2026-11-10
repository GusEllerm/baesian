import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AGENTS_BLOCK, CARD_TEMPLATE } from "../src/agents.js";
import { evaluate } from "../src/gate.js";
import { openRepo } from "../src/git.js";
import { MCP_INSTRUCTIONS } from "../src/mcp.js";
import { cardDetails, fileOp, verdictLines } from "../src/ops.js";
import { proposeSliderMoves } from "../src/proposals.js";
import { routingReport } from "../src/report.js";
import { answeredInChat, replayCardOf } from "../src/routing.js";
import { CardMeta, Verdict } from "../src/schema.js";
import { presets } from "../src/state.js";
import { Store, ValidationError } from "../src/store.js";
import { plain } from "../src/style.js";
import { parseTrailers } from "../src/trailers.js";
import { verify } from "../src/verify.js";
import { BODY, REVIEWER, cleanup, draft, repo, sh } from "./helpers.js";

// B-hswmx, "File it, marked seen": a choice the reviewer already answered in chat is filed with their answer as its pick
// (`answered_in_chat`), shown for them to confirm with one tap, and every verdict on it is marked seen. It joins the
// record and can become a rule; calibration leaves it out of every measure, and says how many it left out.

afterEach(cleanup);

const AGENT = { agent: "claude-code" };
const WHO = { by: "gus", client: "test" };
const SAID = "Postgres. Two runners will write at once.";
let n = 0;
/** A card on its own topic, so none is a possible duplicate of another; answered in chat unless `said` is null. */
function file(store: Store, over: Record<string, unknown> = {}, said: string | null = SAID): string {
  n += 1;
  const chat = said === null ? {} : { answered_in_chat: said, proposal: "Postgres", alternative: "SQLite (WAL mode)" };
  return store.fileCard(draft({ title: `Decision ${n}`, topic: `area${n}/q`, ...chat, ...over }), BODY, { ...AGENT, force: true }).card.meta.id;
}
const answer = (store: Store, id: string, over: Record<string, unknown> = {}) =>
  store.addVerdict({ card: id, revision: store.card(id)!.meta.revision, response: "accept", ...REVIEWER, ...over } as Parameters<Store["addVerdict"]>[0]);

describe("filing a choice answered in chat", () => {
  it("keeps what the reviewer said on the card, and the gate shows it, for them to confirm, whatever its row would do", () => {
    const { store } = repo();
    // Dependencies are the agent's to decide here: an ordinary card on the row is held back.
    store.writePreferences({ preset: "hands-off", mode: "enforce", rate_agent_decides: 0, rate_sample: 0, burn_in: 0 }, WHO);
    const held = file(store, { touches: ["dependency"] }, null);
    expect(store.status(held)).toBe("held");
    const seen = file(store, { touches: ["dependency"] });
    expect(store.card(seen)!.meta.answered_in_chat).toBe(SAID);
    expect(store.status(seen)).toBe("open");
    expect(store.gateRecord(seen)).toMatchObject({ source: "chat", reason: "chat", outcome: "shown", level: "provisional" });
    // A row that shows it keeps its own reason and level; the source still says where it came from.
    const blocking = file(store, { touches: ["schema"], level: "blocking" });
    expect(store.gateRecord(blocking)).toMatchObject({ source: "chat", outcome: "shown", level: "blocking" });
  });

  it("says so when it's filed", () => {
    const { store } = repo();
    const op = fileOp(store, draft({ answered_in_chat: SAID, proposal: "Postgres", alternative: "SQLite (WAL mode)" }), BODY, { ...AGENT, notify: () => {} });
    expect(plain(op.lines).join("\n")).toMatch(/seen: +answered in chat: the reviewer confirms it with one tap, and calibration leaves it out/);
    expect(plain(cardDetails(store.card(op.data.card.meta.id)!)).join("\n")).toContain(`answered_in_chat (the reviewer's answer in chat, the agent's pick; marked seen) by claude-code on main (an agent): "${SAID}"`);
  });

  it("refuses an answer that is the alternative's name: the pick is what they said", () => {
    const { store } = repo();
    expect(() => store.fileCard(draft({ answered_in_chat: " postgres ", proposal: "SQLite", alternative: "Postgres" }), BODY, AGENT)).toThrow(ValidationError);
    expect(() => store.fileCard(draft({ answered_in_chat: "postgres", proposal: "SQLite", alternative: "Postgres" }), BODY, AGENT)).toThrow(/answered_in_chat is the alternative, “Postgres”/);
  });

  it("asks, without refusing, when what they said names only the alternative, and when it's long", () => {
    const { store } = repo();
    const warned = store.fileCard(draft({ answered_in_chat: "SQLite is fine for now", proposal: "Postgres", alternative: "SQLite", topic: "a/b" }), BODY, AGENT);
    expect(warned.warnings).toContain("answered_in_chat names the alternative, “SQLite”, and not your pick: a card answered in chat has the reviewer's answer as its pick, so check that the proposal is what they chose");
    // Naming both, or neither, or a word that only contains the name, asks nothing.
    for (const [said, topic] of [["Not SQLite: Postgres", "c/d"], ["the second one", "e/f"], ["SQLites are fine", "g/h"]] as const) {
      const r = store.fileCard(draft({ answered_in_chat: said, proposal: "Postgres", alternative: "SQLite", topic, title: said }), BODY, AGENT);
      expect(r.warnings.filter((w) => w.startsWith("answered_in_chat"))).toEqual([]);
    }
    const long = store.fileCard(draft({ answered_in_chat: `Postgres. ${"x".repeat(240)}`, proposal: "Postgres", alternative: "SQLite", topic: "i/j", title: "Long" }), BODY, AGENT);
    expect(long.warnings).toContain("answered_in_chat is 250 characters; the card reads best under 240");
  });

  it("is a field of the template, commented out", () => {
    expect(CARD_TEMPLATE).toMatch(/^# answered_in_chat: "" +\(only if the reviewer already answered it in chat: what they said, quoted and short; your pick is their answer, which they confirm with one tap\)$/m);
  });

  it("reads an old card, with no such field, as before: not answered in chat", () => {
    const { store } = repo();
    const id = file(store, {}, null);
    const text = readFileSync(join(store.live, "cards", id, "r1.md"), "utf8");
    expect(text).not.toContain("answered_in_chat");
    expect(store.card(id)!.meta.answered_in_chat).toBeUndefined();
    expect(store.gateRecord(id)?.source).toBe("agent");
    const v = answer(store, id, { first_choice: "proposal" });
    expect(v.seen).toBeUndefined();
    expect(routingReport(store).pooled).toMatchObject({ agreed: 1, inChat: 0 });
  });
});

describe("answering it", () => {
  it("marks every verdict on it seen, and none carries a blind choice", () => {
    const { store } = repo();
    const id = file(store);
    expect(() => answer(store, id, { first_choice: "proposal" })).toThrow(/answered in chat, so its pick was seen first: a verdict on it has no blind choice/);
    const v = answer(store, id, { make_rule: true });
    expect(v).toMatchObject({ response: "accept", seen: true, make_rule: true });
    expect(v.first_choice).toBeUndefined();
    expect(store.status(id)).toBe("resolved");
    const file_ = store.storage.list("verdicts").find((f) => f.includes(id))!;
    expect(JSON.parse(store.storage.read(`verdicts/${file_}`)!.toString())).toMatchObject({ seen: true });
    expect(plain(verdictLines(store, v)).join("\n")).toContain(`accept by gus (a person): "Postgres", answered in chat first`);
  });

  it("marks only a card answered in chat seen", () => {
    const { store } = repo();
    const id = file(store, {}, null);
    expect(() => answer(store, id, { seen: true })).toThrow(/wasn't answered in chat: only a verdict on a card answered in chat is marked seen/);
    expect(() => Verdict.parse({ type: "verdict", format: 1, card: id, revision: 1, response: "accept", seen: true, first_choice: "proposal", ...REVIEWER, at: new Date().toISOString() })).toThrow(/no blind choice/);
  });

  it("takes the normal answers when it isn't what they meant", () => {
    const { store } = repo();
    const other = file(store);
    expect(answer(store, other, { response: "alternative", choice: "SQLite (WAL mode)", comment: "I meant the other." })).toMatchObject({ seen: true, response: "alternative" });
    const asked = file(store);
    expect(answer(store, asked, { response: "question", comment: "Which runners?" })).toMatchObject({ seen: true });
    expect(store.status(asked)).toBe("returned");
  });

  it("is a schema field only on a card revision, and in the draft", () => {
    expect(CardMeta.shape.answered_in_chat.safeParse("Postgres").success).toBe(true);
    expect(CardMeta.shape.answered_in_chat.safeParse("").success).toBe(false);
  });
});

describe("calibration leaves it out of every measure (B-hswmx)", () => {
  it("counts none of its answers, says how many it left out, by row and pooled", () => {
    const { store } = repo();
    const ux = (over = {}, said: string | null = SAID) => file(store, { touches: ["user-facing"], ...over }, said);
    answer(store, ux(), { make_rule: true }); // confirmed with one tap
    answer(store, ux(), { response: "alternative", choice: "SQLite (WAL mode)" }); // not what they meant: not a miss
    ux(); // waiting for the tap: not "not answered"
    answer(store, ux({}, null), { first_choice: "proposal" }); // an ordinary card, chosen blind
    const r = routingReport(store);
    expect(r.rows.user_facing).toMatchObject({ shown: 1, answered: 1, agreed: 1, cameRound: 0, misses: 0, unblind: 0, unanswered: 0, blind: 1, matched: 1, test: { answers: 1, misses: 0, toLoosen: 27, waiting: false }, inChat: 3 });
    expect(r.pooled).toMatchObject({ shown: 1, answered: 1, misses: 0, inChat: 3 });
    // Every card counted falls in exactly one place; those answered in chat in none of them.
    for (const row of [...Object.values(r.rows), r.pooled]) {
      expect(row.agreed + row.cameRound + row.misses + row.unblind + row.unanswered).toBe(row.shown + row.held + row.wouldHold);
    }
  });

  it("leaves it out even after a revision that isn't marked, once an answer on it was seen", () => {
    const { store } = repo();
    const id = file(store, { touches: ["user-facing"] });
    answer(store, id, { response: "need_context", comment: "Which runners?" });
    const { answered_in_chat: _, ...unmarked } = draft({ title: "Decision again", topic: store.card(id)!.meta.topic, proposal: "Postgres", alternative: "SQLite (WAL mode)", touches: ["user-facing"] }) as Record<string, unknown> & { answered_in_chat?: string };
    store.reviseCard(id, unmarked, BODY, AGENT);
    answer(store, id, { first_choice: "proposal" });
    expect(routingReport(store).rows.user_facing).toMatchObject({ answered: 0, agreed: 0, inChat: 1 });
  });

  it("proposes no slider move from it: an overturned one isn't a miss", () => {
    const { store } = repo();
    const id = file(store, { touches: ["dependency"] });
    answer(store, id, { response: "alternative", choice: "SQLite (WAL mode)" });
    expect(proposeSliderMoves(store)).toEqual([]);
    // The same answer on an ordinary card is a miss, and Baesian proposes a stop up.
    const plain_ = file(store, { touches: ["dependency"] }, null);
    answer(store, plain_, { response: "alternative", choice: "Postgres" });
    expect(proposeSliderMoves(store).map((c) => c.meta.pref_row)).toEqual(["dependency"]);
  });

  it("isn't replayed under other settings, on the server or in the client", () => {
    const { store } = repo();
    answer(store, file(store, { touches: ["dependency"] }));
    answer(store, file(store, { touches: ["dependency"] }, null), { first_choice: "proposal" });
    expect(presets(store).inForce.replay.total.cards).toBe(1);
    const verdicts = [{ response: "accept" as const, at: "2026-11-06T00:00:00.000Z", seen: true as const }];
    const meta = { id: "B-aaaaa", touches: [], reverse: "cheap" as const, source_agent: "claude-code" };
    expect(replayCardOf({ meta: { ...meta, answered_in_chat: SAID }, status: "resolved", verdicts })).toBeUndefined();
    expect(replayCardOf({ meta, status: "resolved", verdicts })).toBeUndefined();
    expect(replayCardOf({ meta, status: "resolved", verdicts: [{ response: "accept", at: verdicts[0]!.at }] })).toBeDefined();
    expect(answeredInChat({ meta: {}, verdicts: [{}] })).toBe(false);
  });
});

describe("rules and the gate treat it as an answered card", () => {
  it("drafts a rule from its answer, and the rule covers the gate's facts once accepted", () => {
    const { store, dir } = repo();
    const id = file(store, { title: "The test runner", topic: "testing/runner", touches: ["dependency"] });
    answer(store, id, { make_rule: true });
    expect(store.ruleAsked(id)).toBe(true);
    const draftCard = store.draftRule(id, "Use pytest for every suite.", ["dep:pytest*"], AGENT);
    answer(store, draftCard.meta.id, { first_choice: "proposal" });
    const rule = store.rules().find((r) => r.meta.from_card === id)!;
    expect(rule.meta.covers).toEqual(["dep:pytest*"]);
    const fact = { id: "dep:pytest-cov", kind: "dep" as const, path: "package.json", detail: "added to package.json" };
    expect(evaluate(store, { facts: [fact], warnings: [] }, parseTrailers("Add pytest-cov\n", dir)).covered[0]?.cover).toEqual({ by: "rule", rule: rule.meta.id });
  });

  it("covers a commit that cites it, and a hard one only once it's confirmed", () => {
    const { store, dir } = repo();
    const id = file(store, { touches: ["dependency", "privacy"], wrong_if: "a token leaks", check: "the logs" });
    expect(store.card(id)!.meta.level).toBe("hard");
    const fact = { id: "dep:pg", kind: "dep" as const, path: "package.json", detail: "added to package.json" };
    const cites = parseTrailers(`Add pg\n\nBaesian-Card: ${id}\n`, dir);
    expect(evaluate(store, { facts: [fact], warnings: [] }, cites).problems.map((p) => p.problem)).toEqual(["hard-unresolved"]);
    answer(store, id);
    const report = evaluate(store, { facts: [fact], warnings: [] }, cites);
    expect(report.ok).toBe(true);
    expect(report.covered[0]?.cover).toEqual({ by: "card", card: id });
  });

  it("is a precedent at filing, and a conflict at merge when a branch answers its topic otherwise", () => {
    const { store, dir } = repo();
    const onMain = file(store, { topic: "time/format", title: "Timestamp format", proposal: "ISO 8601 strings", alternative: "Unix epoch integers" }, "ISO strings, please");
    answer(store, onMain);
    // Filing the same question again finds it, decided.
    expect(() => store.fileCard(draft({ topic: "time/format", title: "Times again" }), BODY, AGENT)).toThrow(/may already be on file/);
    store.syncRecord();
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", "Main decides time format");
    sh(dir, "checkout", "-q", "-b", "feat");
    const feat = Store.open(dir);
    const onBranch = feat.fileCard(draft({ topic: "time/format", title: "Epoch ints", proposal: "Unix epoch integers", alternative: "ISO 8601 strings", answered_in_chat: "epoch ints" }), BODY, { ...AGENT, force: true }).card.meta.id;
    answer(feat, onBranch);
    feat.syncRecord();
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", `Use epoch\n\nBaesian-Card: ${onBranch}`);
    const r = verify(openRepo(dir), "main", { merge: true });
    expect(r.merge?.conflicts).toEqual([{ topic: "time/format", base: { id: onMain, decision: "ISO 8601 strings" }, branch: { id: onBranch, decision: "Unix epoch integers" } }]);
  });

  it("passes baesian verify, with its seen verdict in the record", () => {
    const { store, dir } = repo();
    store.syncRecord();
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", "Set up Baesian");
    sh(dir, "checkout", "-q", "-b", "feat");
    const feat = Store.open(dir);
    const id = file(feat, { touches: ["dependency"] });
    put(dir, "package.json", JSON.stringify({ name: "x", dependencies: { pg: "^8" } }));
    feat.syncRecord();
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", `Add pg\n\nBaesian-Card: ${id}`);
    answer(feat, id);
    feat.syncRecord();
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", "Sync");
    const r = verify(openRepo(dir), "main", { merge: true });
    expect(r.commits.map((c) => c.report.ok)).toEqual([true, true]);
    expect(r.ok).toBe(true);
    const v = readdirVerdict(dir, id);
    expect(v).toMatchObject({ card: id, seen: true });
  });
});

describe("the instructions agents read", () => {
  it("say to file a choice already answered in chat as a seen card, and otherwise to file before asking: AGENTS.md's block, the skill and the MCP server's", () => {
    const skill = readFileSync(join(process.cwd(), "plugins", "baesian", "skills", "baesian", "SKILL.md"), "utf8");
    const repoBlock = readFileSync(join(process.cwd(), "AGENTS.md"), "utf8");
    const line = "A choice the reviewer has already answered in chat is filed all the same, with their answer as your pick and their words";
    for (const text of [AGENTS_BLOCK, repoBlock, skill, MCP_INSTRUCTIONS]) {
      const flat = text.replace(/\s+/g, " ");
      expect(flat).toContain(line);
      expect(flat).toMatch(/answered_in_chat`?, for them to confirm with one tap; otherwise, file it before you ask/);
    }
  });
});

function put(dir: string, path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

/** The card's verdict as the committed record has it. */
function readdirVerdict(dir: string, id: string): unknown {
  const name = sh(dir, "ls-files", ".baesian/verdicts").split("\n").find((f) => f.includes(id) && f.endsWith(".json"))!;
  return JSON.parse(readFileSync(join(dir, name), "utf8"));
}
