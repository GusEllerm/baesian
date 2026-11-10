import { afterEach, describe, expect, it } from "vitest";
import { MISS_WORDS, proposeSliderMoves } from "../src/proposals.js";
import { calibrationOf, routingReport } from "../src/report.js";
import { outcomeOf, replayCardOf } from "../src/routing.js";
import type { Store } from "../src/store.js";
import { BODY, REVIEWER, cleanup, draft, repo } from "./helpers.js";

// What counts as a miss (B-87tkc, B-ab06a): an overturn, or "you should have asked me"; and on a crux of preference, a
// blind choice against the agent's pick, whatever the final answer. On a crux of fact, coming round still isn't one.

afterEach(cleanup);

const at = "2026-11-10T20:00:00.000Z";
const accept = (first_choice?: "proposal" | "alternative") => ({ response: "accept" as const, at, ...(first_choice ? { first_choice } : {}) });

describe("a miss (B-87tkc, B-ab06a)", () => {
  it("on a crux of preference, is a blind choice against the pick, whatever the final answer", () => {
    expect(outcomeOf([accept("alternative")], { preference: true })).toMatchObject({ miss: true, missBy: "blind", switched: true });
    expect(outcomeOf([{ response: "alternative", at, first_choice: "alternative" }], { preference: true })).toMatchObject({ miss: true, missBy: "overturn" });
    expect(outcomeOf([accept("proposal")], { preference: true })).toEqual({ final: accept("proposal"), miss: false, switched: false });
    // A blind choice for the pick that the final answer then overturned is an overturn, as on any crux.
    expect(outcomeOf([{ response: "correction", at, first_choice: "proposal" }], { preference: true })).toMatchObject({ miss: true, missBy: "overturn" });
    // No blind choice recorded: nothing to count against the pick.
    expect(outcomeOf([accept()], { preference: true })).toMatchObject({ miss: false });
  });

  it("on a crux of fact, is only an overturn or \"you should have asked me\": coming round is reported, not counted", () => {
    for (const opts of [{}, { preference: false }]) {
      expect(outcomeOf([accept("alternative")], opts)).toEqual({ final: accept("alternative"), miss: false, switched: true });
    }
    expect(outcomeOf([{ ...accept("proposal"), should_have_asked: true }])).toMatchObject({ miss: true, missBy: "asked" });
    expect(outcomeOf([{ response: "question", at, should_have_asked: true }])).toEqual({ miss: true, missBy: "asked", switched: false });
    expect(outcomeOf([{ response: "reject", at }])).toMatchObject({ miss: true, missBy: "overturn" });
  });

  it("puts a preference crux you came round on with the misses in your calibration, not with coming round", () => {
    expect(calibrationOf(outcomeOf([accept("alternative")], { preference: true }))).toBe("missed");
    expect(calibrationOf(outcomeOf([accept("alternative")]))).toBe("cameRound");
  });
});

/** A card filed and answered on the user-facing row. */
function answered(store: Store, n: number, over: Record<string, unknown>, verdict: Record<string, unknown>): string {
  const id = store.fileCard(draft({ title: `Decision ${n} on its own`, topic: `area${n}/q`, touches: ["user-facing"], ...over }), BODY, { agent: "claude-code", force: true }).card.meta.id;
  store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER, ...verdict } as Parameters<Store["addVerdict"]>[0]);
  return id;
}

describe("every measure counts it (B-ab06a)", () => {
  it("the report: a blind choice against the pick on a crux of preference is a miss, on a crux of fact a switch", () => {
    const { store } = repo();
    answered(store, 1, { crux_preference: true }, { first_choice: "alternative" });
    answered(store, 2, {}, { first_choice: "alternative" });
    answered(store, 3, { crux_preference: true }, { first_choice: "proposal" });
    const r = routingReport(store).rows.user_facing!;
    expect(r).toMatchObject({ answered: 3, misses: 1, switched: 2, cameRound: 1, agreed: 1, blind: 3, matched: 1 });
    expect(r.agreed + r.cameRound + r.misses + r.unblind + r.unanswered).toBe(3);
  });

  it("the replay, from the state the client reads", () => {
    const meta = { id: "B-00001", touches: ["user-facing" as const], reverse: "cheap" as const, source_agent: "claude-code" };
    const verdicts = [accept("alternative")];
    expect(replayCardOf({ meta: { ...meta, crux_preference: true }, status: "resolved", verdicts })?.outcome.miss).toBe(true);
    expect(replayCardOf({ meta, status: "resolved", verdicts })?.outcome.miss).toBe(false);
  });

  it("the slider proposals, which name it as what made the move", () => {
    const { store } = repo();
    const id = answered(store, 1, { crux_preference: true }, { first_choice: "alternative" });
    const [card] = proposeSliderMoves(store);
    expect(card!.meta).toMatchObject({ pref_row: "user_facing", pref_from: "tell-me", pref_to: "stop-and-ask" });
    expect(card!.meta.crux_fact).toContain(`On ${id}, “Decision 1 on its own”, a question of what you value, you chose against the agent's pick before seeing its case.`);
    expect(card!.body).toContain(MISS_WORDS);
    expect(MISS_WORDS).toContain("on a question of what you value, a blind choice against the agent's pick, whatever you answer after its case (B-ab06a)");
  });

  it("but never a card answered in chat, which stays out of every measure (B-hswmx)", () => {
    const { store } = repo();
    answered(store, 1, { crux_preference: true, answered_in_chat: "SQLite, please" }, {});
    expect(routingReport(store).rows.user_facing).toMatchObject({ answered: 0, misses: 0, inChat: 1 });
    expect(proposeSliderMoves(store)).toEqual([]);
  });
});
