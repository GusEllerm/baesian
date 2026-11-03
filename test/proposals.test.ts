import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ApiPresets, ApiState } from "../src/api.js";
import { inboxOp } from "../src/ops.js";
import { LOOSEN_AFTER, afterVerdict, proposeConvention, proposeSliderMoves } from "../src/proposals.js";
import { routingReport } from "../src/report.js";
import { type RunningServer, startServer } from "../src/server.js";
import type { Store } from "../src/store.js";
import { BODY, REVIEWER, cleanup, draft, repo, worktree } from "./helpers.js";

// M8: the report per row (P14 section 3), slider proposals (B-y6jn6), convention cards (D161), and the client's API.

const servers: RunningServer[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.close();
  cleanup();
});

const AGENT = { agent: "claude-code" };
const WHO = { by: "gus", client: "test" };
let n = 0;
/** A card on a row: its own title and topic, so none is a possible duplicate of another. */
function file(store: Store, over: Record<string, unknown> = {}): string {
  n += 1;
  return store.fileCard(draft({ title: `Decision ${n} on its own`, topic: `area${n}/q`, ...over }), BODY, { ...AGENT, force: true }).card.meta.id;
}
const answer = (store: Store, id: string, over: Record<string, unknown> = {}) =>
  store.addVerdict({ card: id, revision: store.card(id)!.meta.revision, response: "accept", ...REVIEWER, ...over } as Parameters<Store["addVerdict"]>[0]);

describe("the report per row (P14 section 3)", () => {
  it("counts shown and held cards, audits answered and not, misses, switches and the bound", () => {
    const { store } = repo();
    store.writePreferences({ preset: "hands-off", mode: "enforce", rate_agent_decides: 1, burn_in: 0 }, WHO);
    const dep = (over = {}) => file(store, { touches: ["dependency"], ...over });
    const kept = dep();
    const overturned = dep();
    const asked = dep();
    const unanswered = dep();
    const shown = dep({ reverse: "one-way", wrong_if: "a", check: "b" });
    answer(store, kept, { first_choice: "alternative" });
    answer(store, overturned, { response: "alternative", choice: "Postgres", first_choice: "alternative" });
    answer(store, asked, { first_choice: "proposal", should_have_asked: true });
    answer(store, shown, { first_choice: "proposal" });
    expect(store.status(unanswered)).toBe("held");
    const r = routingReport(store);
    expect(r.rows.dependency).toMatchObject({ position: "agent-decides", shown: 1, held: 4, wouldHold: 0, drawn: 4, auditsAnswered: 3, auditsUnanswered: 1, answered: 4, misses: 2, switched: 1, blind: 4, matched: 2 });
    expect(r.rows.dependency?.bound).toBeUndefined();
    expect(r.pooled).toMatchObject({ shown: 1, held: 4, answered: 4, misses: 2 });
    expect(r.rows.schema).toMatchObject({ position: "sample", shown: 0, held: 0 });
  });

  it("counts a card filed before the gate as \"Today\" showed it, and bounds a row with no misses", () => {
    const { store } = repo();
    const ids = [file(store), file(store), file(store)];
    rmSync(join(store.live, "cards", ids[0]!, "gate-r1-cli.json"));
    for (const id of ids) answer(store, id);
    const r = routingReport(store);
    expect(r.beforeGate).toBe(1);
    expect(r.rows.schema).toMatchObject({ position: "tell-me", shown: 3, answered: 3, misses: 0, bound: 1, streak: 3 });
  });

  it("leaves out Baesian's own cards and withdrawn ones", () => {
    const { store } = repo();
    const id = file(store);
    store.withdraw(id, "not needed", "claude-code");
    store.fileCard(draft({ title: "Two answers", topic: "x/y", touches: [] }), BODY, { agent: "baesian", force: true });
    expect(routingReport(store).pooled.shown).toBe(0);
  });
});

describe("slider proposals (B-y6jn6)", () => {
  it("propose one stop up after a miss on a row, provisional, in the preferences deck, once while it waits", () => {
    const { store } = repo();
    const id = file(store, { touches: ["dependency"] });
    answer(store, id, { response: "alternative", choice: "Postgres" });
    const [card] = proposeSliderMoves(store);
    expect(card?.meta).toMatchObject({ pref_row: "dependency", pref_from: "tell-me", pref_to: "stop-and-ask", level: "provisional", deck: "preferences", source_agent: "baesian", touches: [], reverse: "cheap" });
    expect(card?.meta.crux_fact).toContain(`On ${id}`);
    expect(store.gateRecord(card!.meta.id)).toMatchObject({ source: "baesian", outcome: "shown" });
    expect(store.deck("preferences")?.meta.title).toBe("Your preferences");
    expect(proposeSliderMoves(store)).toEqual([]);
    // Declined: nothing moves, and only a new miss proposes again.
    answer(store, card!.meta.id, { response: "alternative", choice: card!.meta.alternative });
    expect(proposeSliderMoves(store)).toEqual([]);
    const next = file(store, { touches: ["dependency"] });
    answer(store, next, { response: "reject" });
    expect(proposeSliderMoves(store).map((c) => c.meta.pref_to)).toEqual(["stop-and-ask"]);
    expect(store.preferenceNames()).toEqual([]);
  });

  it("write a new preference file when accepted, naming the card, unless the row has moved since", () => {
    const { store } = repo();
    const id = file(store, { touches: ["infra"] });
    answer(store, id, { response: "correction", choice: "Something else" });
    const [card] = proposeSliderMoves(store);
    answer(store, card!.meta.id);
    const force = store.inForce();
    expect(force.file).toMatchObject({ row_infra: "stop-and-ask", from_card: card!.meta.id, mode: "shadow", by: "gus", client: "test" });
    expect(force.file?.replaces).toBeUndefined();
    // A proposal made stale by a move of the row writes nothing.
    const again = file(store, { touches: ["infra"] });
    answer(store, again, { response: "alternative", choice: "Postgres" });
    const [up] = proposeSliderMoves(store);
    expect(up?.meta).toMatchObject({ pref_from: "stop-and-ask", pref_to: "never-without-me" });
    store.writePreferences({ replaces: force.name, row_infra: "tell-me" }, WHO);
    answer(store, up!.meta.id);
    expect(store.inForce().file?.row_infra).toBe("tell-me");
  });

  it(`propose one stop down, as a hard card, after ${LOOSEN_AFTER} final answers in a row without a miss`, () => {
    const { store } = repo();
    for (let i = 0; i < LOOSEN_AFTER - 1; i++) answer(store, file(store, { touches: ["user-facing"] }));
    expect(proposeSliderMoves(store)).toEqual([]);
    answer(store, file(store, { touches: ["user-facing"] }));
    const [down] = proposeSliderMoves(store);
    expect(down?.meta).toMatchObject({ pref_row: "user_facing", pref_from: "tell-me", pref_to: "sample", level: "hard" });
    expect(down?.meta.crux_fact).toMatch(/last 29 final answers on it kept the agent's pick/);
    expect(routingReport(store).rows.user_facing).toMatchObject({ streak: 0, since: down!.meta.created });
  });

  it("never propose loosening security below \"tell me but carry on\" (D146)", () => {
    const { store } = repo();
    store.writePreferences({ row_security: "tell-me" }, WHO);
    for (let i = 0; i < LOOSEN_AFTER; i++) answer(store, file(store, { touches: ["security"], wrong_if: "a", check: "b" }));
    expect(proposeSliderMoves(store)).toEqual([]);
  });
});

describe("convention cards (D161, P16 section 6)", () => {
  it("come from a comment in rule words, and saying yes asks any agent for the rule, whatever its branch", async () => {
    const { dir, store } = repo();
    const id = file(store);
    answer(store, id, { comment: "Always keep state in SQLite." });
    const [card] = proposeConvention(store, id);
    expect(card?.meta).toMatchObject({ convention: "rule-words", depends_on: [id], deck: "conventions", topic: `conventions/area${n}/${id.toLowerCase()}`, question: "Should this decision become a rule?", source_agent: "baesian" });
    expect(card?.meta.crux_fact).toContain("Always keep state in SQLite.");
    // A decision is evidence for one convention card at most.
    expect(proposeConvention(store, id)).toEqual([]);
    answer(store, card!.meta.id);
    expect(store.ruleAsked(card!.meta.id)).toBe(true);
    const other = worktree(dir, "feat");
    const [item] = inboxOp(other.store, { advance: true }).data;
    expect(item).toMatchObject({ card: card!.meta.id, ruleAsked: true });
    const draftCard = other.store.draftRule(card!.meta.id, "Keep local state in SQLite.", ["dep:sqlite*"], AGENT);
    expect(draftCard.meta.depends_on).toEqual([card!.meta.id]);
  });

  it("come from decisions in one area whose chosen answers are alike, each used once", () => {
    const { store } = repo();
    const a = store.fileCard(draft({ title: "The run store", topic: "storage/runs" }), BODY, AGENT).card.meta.id;
    const b = store.fileCard(draft({ title: "The cache's home", topic: "storage/cache" }), BODY, AGENT).card.meta.id;
    const c = store.fileCard(draft({ title: "Elsewhere", topic: "network/retry", proposal: "SQLite (WAL mode)" }), BODY, AGENT).card.meta.id;
    answer(store, a);
    expect(proposeConvention(store, a)).toEqual([]);
    answer(store, c);
    expect(proposeConvention(store, c)).toEqual([]);
    answer(store, b);
    const [card] = proposeConvention(store, b);
    expect(card?.meta).toMatchObject({ convention: "same-choice", depends_on: [a, b], question: "Should these 2 decisions become one rule?", topic: `conventions/storage/${a.toLowerCase()}` });
    const d = store.fileCard(draft({ title: "The log's home", topic: "storage/logs" }), BODY, AGENT).card.meta.id;
    answer(store, d);
    expect(proposeConvention(store, d)).toEqual([]);
  });

  it("reach agents' inboxes only with a yes; slider proposals never do, and neither takes a reply", () => {
    const { store } = repo();
    const id = file(store, { touches: ["dependency"] });
    answer(store, id, { response: "alternative", choice: "Postgres", comment: "Never in-process databases here." });
    store.inbox({ advance: true });
    const [convention] = proposeConvention(store, id);
    const [slider] = proposeSliderMoves(store);
    answer(store, convention!.meta.id, { response: "alternative", choice: convention!.meta.alternative });
    answer(store, slider!.meta.id, { response: "alternative", choice: slider!.meta.alternative });
    expect(store.inbox({ advance: false })).toEqual([]);
    expect(store.canReply(convention!.meta.id)).toBe(false);
    expect(store.canReply(slider!.meta.id)).toBe(false);
  });

  it("aren't found from a decision already asked for a rule, or from Baesian's own cards", () => {
    const { store } = repo();
    const a = file(store);
    answer(store, a, { make_rule: true, comment: "Never Postgres." });
    expect(proposeConvention(store, a)).toEqual([]);
    expect(afterVerdict(store, store.verdicts(a).at(-1)!)).toEqual([]);
  });
});

describe("the client's API (M8)", () => {
  async function serve(store: Store, opts: Parameters<typeof startServer>[1] = {}) {
    const s = await startServer(store, { reviewer: "tester", debounceMs: 20, writeServerFile: false, reusePort: false, ...opts });
    servers.push(s);
    const url = (p: string) => `http://127.0.0.1:${s.port}${p}`;
    const headers = { authorization: `Bearer ${s.token}` };
    return {
      get: async <T>(p: string) => (await fetch(url(p), { headers })).json() as Promise<T>,
      post: async (p: string, body: unknown) => {
        const r = await fetch(url(p), { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) });
        return { status: r.status, body: (await r.json()) as Record<string, unknown> };
      },
    };
  }

  it("writes a preference file, refusing a stale one, a floor broken, and unknown fields", async () => {
    const { store } = repo();
    const api = await serve(store);
    const first = await api.post("/api/preferences", { preset: "fewer-interruptions" });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ file: { profile: "fewer-interruptions", by: "tester", client: "web", mode: "shadow" } });
    expect((await api.post("/api/preferences", { mode: "enforce" })).status).toBe(409);
    expect((await api.post("/api/preferences", { replaces: first.body.name, row_security: "sample" })).status).toBe(400);
    expect((await api.post("/api/preferences", { replaces: first.body.name, from_card: "B-zzzzz" })).body.error).toMatch(/unexpected fields: from_card/);
    const second = await api.post("/api/preferences", { replaces: first.body.name, mode: "enforce" });
    expect(second.status).toBe(201);
    const st = await api.get<ApiState>("/api/state");
    expect(st.routing.preferences?.name).toBe(second.body.name);
    expect(st.routing.history.map((h) => h.name)).toEqual([first.body.name, second.body.name]);
    expect(st.routing.settings).toMatchObject({ mode: "enforce", rows: { dependency: "sample" } });
  });

  it("gives each card its gate record and marks an audit; the report is in the state", async () => {
    const { store } = repo();
    store.writePreferences({ preset: "hands-off", mode: "enforce", rate_agent_decides: 1, burn_in: 0 }, WHO);
    const held = file(store, { touches: ["dependency"] });
    const api = await serve(store);
    const st = await api.get<ApiState>("/api/state");
    const card = st.cards.find((c) => c.meta.id === held)!;
    expect(card).toMatchObject({ status: "held", audit: true, gate: { outcome: "held", drawn: true, row: "dependency" } });
    expect(st.routing.report.rows.dependency).toMatchObject({ held: 1, drawn: 1, auditsUnanswered: 1 });
    // "You should have asked me", on the held card, counts as a miss, and proposes tightening the row.
    const answered = await api.post("/api/verdicts", { card: held, revision: 1, response: "accept", first_choice: "proposal", should_have_asked: true });
    expect(answered.status).toBe(201);
    expect(answered.body.filed).toHaveLength(1);
    const after = await api.get<ApiState>("/api/state");
    const proposal = after.cards.find((c) => c.meta.id === (answered.body.filed as string[])[0])!;
    expect(proposal.meta).toMatchObject({ pref_row: "dependency", pref_from: "agent-decides", pref_to: "sample" });
    expect(after.routing.report.rows.dependency).toMatchObject({ misses: 1, auditsAnswered: 1, auditsUnanswered: 0 });
  });

  it("files no proposals when told not to", async () => {
    const { store } = repo();
    const id = file(store, { touches: ["dependency"] });
    const api = await serve(store, { proposals: false });
    const r = await api.post("/api/verdicts", { card: id, revision: 1, response: "alternative", choice: "Postgres" });
    expect(r.body.filed).toBeUndefined();
    expect(store.cards()).toHaveLength(1);
  });

  it("gives the presets, each replayed over past cards, and the setup survey", async () => {
    const { store } = repo();
    for (let i = 0; i < 3; i++) file(store, { touches: ["dependency"] });
    file(store, { touches: ["schema"] });
    const api = await serve(store);
    const p = await api.get<ApiPresets>("/api/presets");
    expect(p.presets.map((x) => x.id)).toEqual(["today", "fewer-interruptions", "hands-off"]);
    const [today, fewer, hands] = p.presets;
    expect(today?.replay.total).toMatchObject({ cards: 4, held: 0 });
    expect(fewer?.replay.rows.dependency).toMatchObject({ cards: 3, held: 3 });
    expect(fewer?.replay.total.held).toBe(3);
    expect(hands?.replay.total.held).toBe(4);
    expect(p.inForce.settings.mode).toBe("shadow");
    expect(p.rows.find((r) => r.row === "security")).toMatchObject({ floor: "tell-me" });
    expect(p.rows.find((r) => r.row === "money")).toMatchObject({ fixed: true });
    expect(p.positions.map((x) => x.level ?? "held")).toEqual(["held", "held", "provisional", "blocking", "hard"]);
    expect(p.survey.items.length).toBeGreaterThanOrEqual(5);
    expect(p.survey.question).toMatch(/fine not seeing/);
  });
});
