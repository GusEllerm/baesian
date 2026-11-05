import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cite } from "../src/cite.js";
import { main } from "../src/cli.js";
import { openRepo } from "../src/git.js";
import {
  AUDIT_DEFAULTS,
  type GateInput,
  PRESETS,
  type Settings,
  TODAY,
  levelInForce,
  loosening,
  replay,
  route,
  rowOf,
  stop,
  suggestPreset,
} from "../src/routing.js";
import { Fact, HARD_BY_DEFAULT, Preferences } from "../src/schema.js";
import { StalePreferences, Store, drawOf } from "../src/store.js";
import { checkMerge, verify } from "../src/verify.js";
import { WAIT_EXIT, describeBrief as describeBriefLines, describeOutcome as describeOutcomeLines, exitCodeFor, waitForVerdict } from "../src/wait.js";
import { BODY, REVIEWER, cleanup, draft, draftFile, fakeClock, repo, sh, worktree } from "./helpers.js";
import { plain } from "../src/style.js";

/** What the agent reads, in plain text. */
const describeBrief = (...a: Parameters<typeof describeBriefLines>) => plain(describeBriefLines(...a));
const describeOutcome = (...a: Parameters<typeof describeOutcomeLines>) => plain(describeOutcomeLines(...a));

afterEach(cleanup);

const AGENT = { agent: "claude-code" };
const WHO = { by: "gus", client: "test" };
const preset = (id: string) => PRESETS.find((p) => p.id === id)!.rows;
const settings = (over: Partial<Settings> = {}): Settings => ({ ...TODAY, ...over });
const input = (over: Partial<GateInput> = {}): GateInput => ({ touches: [], reverse: "moderate", source: "agent", draw: 0.5, heldBefore: () => 99, ...over });

function run(cwd: string, args: string[], stdin = "") {
  const out: string[] = [];
  const err: string[] = [];
  const io = { out: (l: string) => out.push(l), err: (l: string) => err.push(l), stdin: () => stdin, cwd, notify: () => {} };
  return main(["node", "baesian", ...args], io).then((code) => ({ code, out: out.join("\n"), err: err.join("\n") }));
}

/** A repo whose preferences hold dependency cards back, enforcing: "Hands-off", with each audit's chance and the burn-in given. */
function enforcing(over: { rate_agent_decides?: number; burn_in?: number; mode?: "shadow" | "enforce" } = {}) {
  const r = repo();
  r.store.writePreferences({ preset: "hands-off", mode: "enforce", rate_agent_decides: 0, burn_in: 0, ...over }, WHO);
  return r;
}

const dependency = (over: Record<string, unknown> = {}) => draft({ touches: ["dependency"], ...over });

describe("the rules (rules-1)", () => {
  it("route exactly as Baesian did before the gate under \"Today\": hard for a hard-by-default fact, else the level asked for", () => {
    const facts = Fact.options;
    for (let mask = 0; mask < 1 << facts.length; mask += 7) {
      const touches = facts.filter((_, i) => mask & (1 << i));
      for (const asked of [undefined, "provisional", "blocking", "hard"] as const) {
        for (const reverse of ["cheap", "moderate", "one-way"] as const) {
          const d = route(input({ touches, asked, reverse }), TODAY);
          const before = touches.some((f) => HARD_BY_DEFAULT.has(f)) ? "hard" : (asked ?? "provisional");
          expect(d.outcome).toBe("shown");
          expect(levelInForce(d, "shadow", asked), `${touches} ${asked} ${reverse}`).toBe(before);
        }
      }
    }
  });

  it("take the strictest row a card's facts fall in, and `other` for a card with none", () => {
    const s = settings({ rows: { ...preset("hands-off"), schema: "stop-and-ask" } });
    expect(rowOf(["dependency", "schema"], s)).toEqual({ row: "schema", position: "stop-and-ask" });
    expect(rowOf(["dependency", "money"], s)).toEqual({ row: "money", position: "never-without-me" });
    expect(rowOf([], s)).toEqual({ row: "other", position: "agent-decides" });
    // A tie goes to the fixed rows, then security and privacy.
    expect(rowOf(["security", "money"], TODAY).row).toBe("money");
    expect(rowOf(["privacy", "security"], TODAY).row).toBe("security");
  });

  it("hold a card on a low row whatever level the agent asked for, and raise a shown one to it (B-chq61)", () => {
    const s = settings({ mode: "enforce", rows: preset("hands-off") });
    const held = route(input({ touches: ["dependency"], asked: "hard" }), s);
    expect(held).toMatchObject({ row: "dependency", position: "agent-decides", outcome: "held", reason: "row", p: AUDIT_DEFAULTS.rate_agent_decides });
    expect(levelInForce(held, "enforce", "hard")).toBe("provisional");
    // In shadow nothing is held: it's shown at the level asked for, as before the gate.
    expect(levelInForce(held, "shadow", "blocking")).toBe("blocking");
    const shown = route(input({ touches: ["security"], asked: "blocking" }), settings({ rows: { ...TODAY.rows, security: "tell-me" } }));
    expect(shown).toMatchObject({ outcome: "shown", level: "blocking", reason: "agent" });
  });

  it("never hold a one-way card, Baesian's own, or a revision after an answer (B-yebnn, P16)", () => {
    const s = settings({ rows: preset("hands-off") });
    expect(route(input({ touches: ["dependency"], reverse: "one-way" }), s)).toMatchObject({ outcome: "shown", level: "provisional", reason: "one-way" });
    expect(route(input({ touches: ["dependency"], reverse: "cheap" }), s).outcome).toBe("held");
    expect(route(input({ source: "baesian" }), s)).toMatchObject({ outcome: "shown", reason: "baesian" });
    expect(route(input({ source: "answer" }), s)).toMatchObject({ outcome: "shown", reason: "answer" });
    // Spending, destroying data and publishing are fixed: a floor, at hard.
    expect(route(input({ touches: ["money", "dependency"] }), s)).toMatchObject({ row: "money", outcome: "shown", level: "hard", reason: "floor" });
  });

  it("draw a held card for audit by its chance, or always within the row's burn-in (B-fgc4y)", () => {
    const s = settings({ rows: preset("fewer-interruptions") }); // dependency at "check a sample": 1 in 3
    const at = (draw: number, before: number) => route(input({ touches: ["dependency"], draw, heldBefore: () => before }), s);
    expect(at(0.2, 99)).toMatchObject({ outcome: "held", p: 1 / 3, drawn: true, burn_in: false, held_before: 99, draw: 0.2 });
    expect(at(0.5, 99)).toMatchObject({ drawn: false, burn_in: false });
    expect(at(0.5, 9)).toMatchObject({ drawn: true, burn_in: true });
    expect(at(0.5, 10)).toMatchObject({ drawn: false, burn_in: false });
    // The draw is a hash of the ID and revision, from 0 to 1, the same every time.
    expect(drawOf("B-7f3kq", 1)).toBe(drawOf("B-7f3kq", 1));
    expect(drawOf("B-7f3kq", 1)).not.toBe(drawOf("B-7f3kq", 2));
    for (const id of ["B-00000", "B-zzzzz", "B-7f3kq"]) expect(drawOf(id, 1)).toBeGreaterThanOrEqual(0), expect(drawOf(id, 1)).toBeLessThan(1);
  });

  it("move one stop, never past a row's floor (D146)", () => {
    expect(stop("dependency", "tell-me", "down")).toBe("sample");
    expect(stop("dependency", "agent-decides", "down")).toBeUndefined();
    expect(stop("security", "tell-me", "down")).toBeUndefined();
    expect(stop("privacy", "stop-and-ask", "down")).toBe("tell-me");
    expect(stop("schema", "never-without-me", "up")).toBeUndefined();
  });

  it("count as loosening each change that lets more cards past you: a row toward held, enforcing, fewer audits (D163, B-shndb)", () => {
    expect(loosening(TODAY, TODAY)).toEqual([]);
    expect(loosening(TODAY, settings({ mode: "enforce", rows: preset("fewer-interruptions") }))).toEqual([
      "it turns enforcing on",
      "it moves dependency from tell-me to sample",
      "it moves infra from tell-me to sample",
      "it moves other from tell-me to sample",
    ]);
    expect(loosening(TODAY, settings({ rate_agent_decides: 0, rate_sample: 0.25, burn_in: 3 }))).toEqual([
      "it lowers rate_agent_decides from 10% to 0%",
      "it lowers rate_sample from 33.3% to 25%",
      "it lowers burn_in from 10 to 3",
    ]);
    // Tightening, more audits and a longer burn-in included, lets nothing more past.
    expect(loosening(settings({ mode: "enforce", rows: preset("hands-off") }), settings({ rate_agent_decides: 0.5, burn_in: 20 }))).toEqual([]);
  });

  it("have three presets, security and privacy at \"never without me\" in all (B-wwxa3)", () => {
    expect(PRESETS.map((p) => p.id)).toEqual(["today", "fewer-interruptions", "hands-off"]);
    for (const p of PRESETS) expect([p.rows.security, p.rows.privacy]).toEqual(["never-without-me", "never-without-me"]);
    expect(preset("fewer-interruptions")).toMatchObject({ dependency: "sample", infra: "sample", other: "sample", schema: "tell-me" });
    expect(preset("hands-off")).toMatchObject({ dependency: "agent-decides", other: "agent-decides", public_api: "sample", user_facing: "sample" });
  });

  it("suggest the preset the setup survey's answers fit, the stricter on a tie (B-5na1k)", () => {
    expect(suggestPreset({}).id).toBe("today");
    expect(suggestPreset({ fine: ["dependency", "infra"], see: ["schema", "public_api"] }).id).toBe("fewer-interruptions");
    expect(suggestPreset({ fine: ["dependency", "infra", "schema", "public_api", "user_facing", "other"] }).id).toBe("hands-off");
    expect(suggestPreset({ see: ["dependency"] }).id).toBe("today");
  });

  it("replay past cards under a setting: what it would have held, and the misses among them", () => {
    const cards = [
      { id: "B-00001", touches: ["dependency"] as Fact[], reverse: "cheap" as const, source: "agent" as const, outcome: { miss: false, switched: false } },
      { id: "B-00002", touches: ["dependency"] as Fact[], reverse: "moderate" as const, source: "agent" as const, outcome: { miss: true, switched: false } },
      { id: "B-00003", touches: ["security"] as Fact[], reverse: "moderate" as const, source: "agent" as const, outcome: { miss: false, switched: false } },
      { id: "B-00004", touches: ["dependency"] as Fact[], reverse: "one-way" as const, source: "agent" as const, outcome: { miss: false, switched: false } },
    ];
    const r = replay(cards, settings({ rows: preset("hands-off") }));
    expect(r.held).toEqual(["B-00001", "B-00002"]);
    expect(r.rows.dependency).toMatchObject({ cards: 3, shown: 1, held: 2, heldMissed: 1, audits: 2 });
    expect(r.total).toMatchObject({ cards: 4, shown: 2, held: 2 });
    expect(replay(cards, TODAY).held).toEqual([]);
  });
});

describe("preference files (D146, D147)", () => {
  it("are written once, newest in force, each replacing the last, and a change from an old view is refused", () => {
    const { store } = repo();
    expect(store.inForce()).toEqual({ settings: TODAY });
    const first = store.writePreferences({ preset: "fewer-interruptions" }, WHO);
    expect(first.file).toMatchObject({ type: "preferences", format: 1, mode: "shadow", profile: "fewer-interruptions", row_dependency: "sample", rate_sample: 1 / 3, burn_in: 10, by: "gus", client: "test" });
    expect(first.file.replaces).toBeUndefined();
    expect(() => store.writePreferences({ row_schema: "sample" }, WHO)).toThrow(StalePreferences);
    const second = store.writePreferences({ replaces: first.name, row_schema: "sample", mode: "enforce" }, WHO);
    expect(second.file).toMatchObject({ replaces: first.name, row_schema: "sample", row_dependency: "sample", mode: "enforce", profile: "fewer-interruptions" });
    expect(store.preferenceNames()).toEqual([first.name, second.name]);
    expect(store.inForce().name).toBe(second.name);
    expect(() => store.writePreferences({ replaces: first.name, row_infra: "tell-me" }, WHO)).toThrow(/preferences have changed/);
    // In the record too, beside the live layer.
    expect(readFileSync(join(store.record, "preferences", second.name), "utf8")).toBe(readFileSync(join(store.live, "preferences", second.name), "utf8"));
  });

  it("refuse security or privacy below \"tell me but carry on\", and an unknown preset (D146)", () => {
    const { store } = repo();
    expect(() => store.writePreferences({ row_security: "sample" }, WHO)).toThrow(/security may go no lower than tell-me/);
    expect(() => store.writePreferences({ row_privacy: "agent-decides" }, WHO)).toThrow(/privacy may go no lower/);
    expect(() => store.writePreferences({ preset: "yolo" }, WHO)).toThrow(/no preset "yolo"/);
    expect(store.writePreferences({ row_security: "tell-me" }, WHO).file.row_security).toBe("tell-me");
  });

  it("keep the setup survey's answers, and take the preset they suggest (B-5na1k)", () => {
    const { store } = repo();
    const { file } = store.writePreferences({ survey_fine: ["dependency", "infra", "other"], survey_see: ["schema"] }, WHO);
    expect(file).toMatchObject({ profile: "fewer-interruptions", row_dependency: "sample", survey_fine: ["dependency", "infra", "other"], survey_see: ["schema"] });
  });

  it("need every row: a file missing one doesn't read", () => {
    const { store } = repo();
    const { file } = store.writePreferences({}, WHO);
    const { row_other: _, ...partial } = file;
    expect(Preferences.safeParse(partial).success).toBe(false);
  });

  it("reach every branch's record, so CI rechecks with what the local gate saw", () => {
    const { dir, store } = repo();
    const { name } = store.writePreferences({ preset: "hands-off" }, WHO);
    const other = worktree(dir, "feat");
    expect(other.store.syncRecord()).toContain(join("preferences", name));
  });

  it("fail toward the reviewer when the newest can't be read: \"Today\", in shadow, saying why (P14)", () => {
    const { store } = enforcing();
    const name = store.preferenceNames().at(-1)!;
    writeFileSync(join(store.live, "preferences", name), "{ not json");
    expect(store.inForce()).toMatchObject({ name, settings: TODAY, problem: expect.stringContaining("can't be read") });
    const r = store.fileCard(dependency(), BODY, AGENT);
    expect(r.gate).toMatchObject({ mode: "shadow", outcome: "shown" });
    expect(r.gate.preferences).toBeUndefined();
    expect(r.warnings.join()).toMatch(/can't be read.*"Today", in shadow/);
  });
});

describe("the gate at filing (D144, D145)", () => {
  it("writes a gate record beside each revision, in both layers, and routes as before with no preference file", () => {
    const { store } = repo();
    const r = store.fileCard(draft({ level: "blocking" }), BODY, AGENT);
    const id = r.card.meta.id;
    expect(r.card.meta.level).toBe("blocking");
    expect(r.gate).toMatchObject({ type: "gate", format: 1, card: id, revision: 1, by: "cli", gate: "rules-1", mode: "shadow", touches: ["schema", "dependency"], reverse: "moderate", asked: "blocking", source: "agent", row: "schema", position: "tell-me", outcome: "shown", level: "blocking", reason: "agent" });
    const rel = join("cards", id, "gate-r1-cli.json");
    expect(JSON.parse(readFileSync(join(store.live, rel), "utf8"))).toEqual(r.gate);
    expect(readFileSync(join(store.record, rel), "utf8")).toBe(readFileSync(join(store.live, rel), "utf8"));
    expect(store.gateRecord(id)).toEqual(r.gate);
    expect(store.status(id)).toBe("open");
    // Security stays hard by default (D42, D144): the "Today" row is "never without me".
    const sec = store.fileCard(draft({ title: "Where the token lives", topic: "auth/token", touches: ["security"], level: "provisional", wrong_if: "a script reads it", check: "the client's scripts" }), BODY, AGENT);
    expect(sec.card.meta.level).toBe("hard");
    expect(sec.hardBecause).toEqual(["security"]);
  });

  it("lets a repo lower security to provisional, and no further (D146)", () => {
    const { store } = repo();
    store.writePreferences({ row_security: "tell-me" }, WHO);
    const sec = store.fileCard(draft({ title: "Where the token lives", topic: "auth/token", touches: ["security"], wrong_if: "a script reads it", check: "the client's scripts" }), BODY, AGENT);
    expect(sec.card.meta.level).toBe("provisional");
    expect(sec.gate).toMatchObject({ row: "security", position: "tell-me", outcome: "shown", reason: "row" });
  });

  it("holds a card back when enforcing, as provisional, whatever level it asked for (D150, B-chq61)", () => {
    const { store } = enforcing();
    const r = store.fileCard(dependency({ level: "blocking" }), BODY, AGENT);
    const id = r.card.meta.id;
    expect(r.card.meta.level).toBe("provisional");
    expect(r.gate).toMatchObject({ mode: "enforce", row: "dependency", position: "agent-decides", outcome: "held", asked: "blocking", drawn: false, p: 0, held_before: 0, burn_in: false });
    expect(r.gate.draw).toBe(drawOf(id, 1));
    expect(r.gate.level).toBeUndefined();
    expect(store.status(id)).toBe("held");
    // Any answer ends it.
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    expect(store.status(id)).toBe("resolved");
  });

  it("only records, in shadow: a card the settings would hold is shown, at the level asked for (D148)", () => {
    const { store } = enforcing({ mode: "shadow" });
    const r = store.fileCard(dependency({ level: "blocking" }), BODY, AGENT);
    expect(r.gate).toMatchObject({ mode: "shadow", outcome: "held" });
    expect(r.card.meta.level).toBe("blocking");
    expect(store.status(r.card.meta.id)).toBe("open");
  });

  it("counts a row's earlier held cards, across branches, for the burn-in (B-fgc4y)", () => {
    const { dir, store } = enforcing({ burn_in: 2 });
    const first = store.fileCard(dependency(), BODY, AGENT).gate;
    const other = worktree(dir, "feat");
    const second = other.store.fileCard(dependency({ title: "Another dependency", topic: "deps/other" }), BODY, AGENT).gate;
    const third = store.fileCard(dependency({ title: "A third one", topic: "deps/third" }), BODY, AGENT).gate;
    const elsewhere = store.fileCard(draft({ title: "Retry policy", topic: "net/retry", touches: [] }), BODY, AGENT).gate;
    expect([first, second, third].map((g) => [g.held_before, g.burn_in, g.drawn])).toEqual([[0, true, true], [1, true, true], [2, false, false]]);
    expect([elsewhere.row, elsewhere.held_before, elsewhere.burn_in]).toEqual(["other", 0, true]);
  });

  it("gates a revision: shown after an answer, and as a new decision after a parent went the other way (D80)", () => {
    const { store } = enforcing();
    const id = store.fileCard(dependency({ reverse: "one-way", wrong_if: "it breaks", check: "the build" }), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: id, revision: 1, response: "question", comment: "Why this one?", ...REVIEWER });
    const r2 = store.reviseCard(id, dependency(), BODY, AGENT);
    expect(r2.gate).toMatchObject({ revision: 2, source: "answer", outcome: "shown", reason: "answer" });
    store.addVerdict({ card: id, revision: 2, response: "accept", ...REVIEWER });
    const child = store.fileCard(dependency({ title: "Pin it", topic: "deps/pin", depends_on: [id], reverse: "one-way", wrong_if: "a", check: "b" }), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: id, revision: 2, response: "alternative", choice: "Postgres", ...REVIEWER });
    expect(store.status(child)).toBe("returned");
    const again = store.reviseCard(child, dependency({ title: "Pin it", topic: "deps/pin", depends_on: [id] }), BODY, AGENT);
    expect(again.gate).toMatchObject({ source: "agent", outcome: "held" });
    expect(store.status(child)).toBe("held");
  });

  it("shows a reply, a rule draft and a conflict card: Baesian's own and an answer's follow-ups reach you", () => {
    const { store } = enforcing();
    const id = store.fileCard(draft({ touches: [], reverse: "one-way", wrong_if: "a", check: "b" }), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: id, revision: 1, response: "alternative", choice: "Postgres", make_rule: true, ...REVIEWER });
    const reply = store.replyToCard(id, "Only one machine writes runs.", AGENT);
    expect(store.gateRecord(id, reply.meta.revision)).toMatchObject({ source: "answer", outcome: "shown" });
    store.addVerdict({ card: id, revision: 2, response: "accept", make_rule: true, ...REVIEWER });
    const rule = store.draftRule(id, "Use SQLite.", [], AGENT);
    expect(store.gateRecord(rule.meta.id)).toMatchObject({ source: "baesian", outcome: "shown", reason: "baesian" });
    const conflict = store.fileCard(draft({ title: "Two answers", topic: "net/x", touches: [] }), BODY, { agent: "baesian", force: true });
    expect(conflict.gate).toMatchObject({ source: "baesian", outcome: "shown" });
  });

  it("takes \"you should have asked me\" only on a card the gate held, or would have (D151)", () => {
    const { store } = enforcing();
    const held = store.fileCard(dependency(), BODY, AGENT).card.meta.id;
    const shown = store.fileCard(draft({ title: "Buy a domain", topic: "net/domain", touches: ["money"] }), BODY, AGENT).card.meta.id;
    expect(() => store.addVerdict({ card: shown, revision: 1, response: "accept", should_have_asked: true, ...REVIEWER })).toThrow(/wasn't held back/);
    expect(store.addVerdict({ card: held, revision: 1, response: "accept", first_choice: "alternative", should_have_asked: true, ...REVIEWER }).should_have_asked).toBe(true);
  });

  it("tells the agent to rework when a held card's answer overturns its pick (D151)", () => {
    const { store } = enforcing();
    const id = store.fileCard(dependency(), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: id, revision: 1, response: "alternative", choice: "Postgres", first_choice: "alternative", ...REVIEWER });
    const [brief] = store.briefs(id);
    expect(brief).toMatchObject({ kind: "held-answered", card: id, assumed: "SQLite (WAL mode)", now: "Postgres", reviewer: "gus", agent: "claude-code" });
    const [item] = store.inbox({ advance: false });
    expect(item?.brief?.kind).toBe("held-answered");
    expect(describeBrief(brief!)[0]).toBe(`  ${id} was held back, so its agent went ahead with the pick by claude-code on main (an agent): "SQLite (WAL mode)". The reviewer has answered it since: decided by gus (a person): "Postgres".`);
    // Keeping the pick needs no brief.
    const kept = store.fileCard(dependency({ title: "Another", topic: "deps/another" }), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: kept, revision: 1, response: "accept", ...REVIEWER });
    expect(store.briefs(kept)).toEqual([]);
  });
});

describe("waiting on a held card (B-chq61)", () => {
  it("answers at once: go ahead, exit 8, with no marker", async () => {
    const { store } = enforcing();
    const id = store.fileCard(dependency({ level: "hard" }), BODY, AGENT).card.meta.id;
    const o = await waitForVerdict(store, id, { ...AGENT, ...fakeClock() });
    expect(o).toEqual({ kind: "held", id });
    expect(exitCodeFor(o)).toBe(WAIT_EXIT.held);
    expect(WAIT_EXIT.held).toBe(8);
    expect(describeOutcome(o).join("\n")).toMatch(/held back.*Go ahead with your pick, as provisional.*settled at merge/s);
    expect(store.waitingOn(id)).toEqual([]);
  });

  it("through the CLI: file says held back, wait exits 8 with next: go", async () => {
    const { dir } = enforcing();
    const filed = await run(dir, ["--agent", "claude-code", "file"], draftFile({ touches: ["dependency"], level: "blocking" }));
    expect(filed.out).toMatch(/^filed (B-\w{5}) "The run-metadata store", held back/);
    expect(filed.out).toContain("held back (Runtime dependencies: let the agent decide): go ahead with your pick, as provisional");
    expect(filed.out).not.toContain("baesian wait");
    const id = /filed (B-\w{5})/.exec(filed.out)![1]!;
    const waited = await run(dir, ["wait", id, "--json"]);
    expect(waited.code).toBe(8);
    expect(JSON.parse(waited.out)).toMatchObject({ kind: "held", next: "go", exit: 8 });
    expect((await run(dir, ["list"])).out).toBe("nothing waiting on the reviewer");
    expect((await run(dir, ["show", id])).out).toContain("held back (Runtime dependencies: let the agent decide): its agent goes ahead with its pick");
  });

  it("prints the outcome of a shown card too", async () => {
    const { dir } = repo();
    const filed = await run(dir, ["file"], draftFile({ level: "blocking" }));
    expect(filed.out).toContain("level:  blocking, the level you asked for");
  });
});

describe("the merge gate and verify (D150, P16 section 3)", () => {
  function branchedEnforcing() {
    const { dir, store } = enforcing();
    store.syncRecord();
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", "Set up");
    sh(dir, "checkout", "-q", "-b", "feat");
    return { dir, store: Store.open(dir) };
  }
  const commit = (dir: string, store: Store, message: string) => {
    store.syncRecord();
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "--allow-empty", "-m", message);
  };

  it("accepts a held card as settled, with a note, once its record rechecks", () => {
    const { dir, store } = branchedEnforcing();
    const id = store.fileCard(dependency(), BODY, AGENT).card.meta.id;
    commit(dir, store, `Use SQLite\n\nBaesian-Card: ${id}`);
    const r = verify(openRepo(dir), "main", { merge: true });
    expect(r.merge?.problems).toEqual([]);
    expect(r.merge?.notes.join()).toContain(`${id} is held: the gate let its agent go ahead${cite("D150")}`);
    expect(r.ok).toBe(true);
  });

  it("fails a gate record that doesn't recheck: tampered, or naming a preference file the record lacks", () => {
    const { dir, store } = branchedEnforcing();
    const id = store.fileCard(dependency(), BODY, AGENT).card.meta.id;
    commit(dir, store, `Use SQLite\n\nBaesian-Card: ${id}`);
    const rel = join(".baesian", "cards", id, "gate-r1-cli.json");
    const g = JSON.parse(readFileSync(join(dir, rel), "utf8"));
    writeFileSync(join(dir, rel), `${JSON.stringify({ ...g, p: 0.5 }, null, 2)}\n`);
    sh(dir, "commit", "-q", "-am", "Tamper");
    const r = verify(openRepo(dir), "main", { merge: true });
    expect(r.merge?.problems).toEqual([expect.objectContaining({ card: id, problem: "gate", message: expect.stringContaining("its audit draw doesn't recompute") })]);
    const head = Store.overRecord(openRepo(dir), join(dir, ".baesian"));
    const card = head.card(id)!;
    expect(checkMerge(head, head, [id]).problems[0]?.message).toContain("doesn't recheck");
    sh(dir, "rm", "-q", "-r", join(".baesian", "preferences"));
    expect(checkMerge(Store.overRecord(openRepo(dir), join(dir, ".baesian")), head, [id]).problems[0]?.message).toContain("which isn't in the record");
    expect(card.meta.level).toBe("provisional");
  });

  it("fails a held card whose level was raised by hand without its record", () => {
    const { dir, store } = branchedEnforcing();
    const id = store.fileCard(dependency(), BODY, AGENT).card.meta.id;
    commit(dir, store, `Use SQLite\n\nBaesian-Card: ${id}`);
    const rel = join(".baesian", "cards", id, "r1.md");
    writeFileSync(join(dir, rel), readFileSync(join(dir, rel), "utf8").replace("level: provisional", "level: hard"));
    sh(dir, "commit", "-q", "-am", "Edit");
    expect(verify(openRepo(dir), "main", { merge: true }).merge?.problems[0]?.message).toContain("the card's level is hard, but the gate gave it provisional");
  });
});
