import { describe, expect, it } from "vitest";
import type { ApiCard, ApiRouting, RowReport } from "../../src/api";
import { PRESETS, TODAY } from "../../src/routing";
import {
  allowed,
  blindWords,
  boundWords,
  changeOf,
  dirty,
  draftOf,
  heldRows,
  heldWords,
  listWords,
  pastCards,
  presetOf,
  replacesOf,
  replayDraft,
  reportLines,
  rowHeldWords,
  rowInSentence,
  surveyAnswersOf,
  surveyChange,
} from "./prefs";

// The client's side of the preferences (M8b, D147): drafts, the change it sends, what a draft would have held, and the
// report in words.

const T0 = Date.parse("2026-11-03T12:00:00.000Z");
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
let n = 0;
function card(over: Partial<ApiCard["meta"]> = {}, rest: Partial<Omit<ApiCard, "meta">> = {}): ApiCard {
  n += 1;
  return {
    meta: {
      type: "card", format: 1, id: `B-${String(n).padStart(5, "0")}`, revision: 1, title: `Decision ${n}`, question: "Which?", doing: "working",
      topic: `area${n}/q`, deck: "branch-main", level: "provisional", touches: [], reverse: "cheap",
      proposal: "A", proposal_then: "a", alternative: "B", alternative_then: "b", also_considered: [], crux: "c?", crux_proposal: "If so", crux_alternative: "If not",
      rules: [], proposal_breaks: [], alternative_breaks: [], depends_on: [], domain: [], evidence: [], rule_covers: [],
      source_agent: "claude-code", source_branch: "main", created: at(n), ...over,
    },
    body: "", revisions: 1, replied: false, status: "open", canonicalTopic: `area${n}/q`, verdicts: [], dependents: [], briefs: [], waiting: [], fallbacks: [], attachments: 0,
    ...rest,
  };
}
const verdict = (response: "accept" | "alternative", over = {}) => ({ type: "verdict" as const, format: 1, card: "B-x", revision: 1, response, reviewer: "gus", client: "web", at: at(100), ...over });
const blank: RowReport = { shown: 0, held: 0, wouldHold: 0, drawn: 0, auditsAnswered: 0, auditsUnanswered: 0, answered: 0, misses: 0, switched: 0, blind: 0, matched: 0, streak: 0, recentMisses: 0 };
const fewer = PRESETS.find((p) => p.id === "fewer-interruptions")!;

describe("a draft of the preferences", () => {
  it("starts from the settings in force, and knows when it's changed, or matches a preset", () => {
    const d = draftOf(TODAY);
    expect(dirty(d, TODAY)).toBe(false);
    expect(presetOf(d.rows)?.id).toBe("today");
    expect(dirty({ ...d, mode: "enforce" }, TODAY)).toBe(true);
    const moved = { ...d, rows: { ...fewer.rows } };
    expect(dirty(moved, TODAY)).toBe(true);
    expect(presetOf(moved.rows)?.id).toBe("fewer-interruptions");
    expect(presetOf({ ...d.rows, schema: "stop-and-ask" })).toBeUndefined();
    // The survey's suggestion, to adjust, is unsaved even when it's what's in force.
    expect(dirty({ ...d, survey: { see: ["schema"], fine: [] } }, TODAY)).toBe(true);
  });

  it("keeps security and privacy at \"tell me but carry on\" or above (D146)", () => {
    expect(allowed("security", "sample")).toBe(false);
    expect(allowed("privacy", "tell-me")).toBe(true);
    expect(allowed("dependency", "agent-decides")).toBe(true);
  });

  it("is sent as every row and the mode, over the file it replaces, with the preset it started from and the survey's answers", () => {
    const d = { ...draftOf(TODAY), rows: { ...fewer.rows }, preset: "fewer-interruptions", survey: { see: ["schema" as const], fine: ["dependency" as const] } };
    expect(changeOf(d, "20261103T120000.000Z-abcd.json", "  Trying it. ")).toEqual({
      replaces: "20261103T120000.000Z-abcd.json",
      preset: "fewer-interruptions",
      mode: "shadow",
      row_public_api: "tell-me", row_schema: "tell-me", row_dependency: "sample", row_infra: "sample", row_user_facing: "tell-me", row_security: "never-without-me", row_privacy: "never-without-me", row_other: "sample",
      survey_see: ["schema"],
      survey_fine: ["dependency"],
      reason: "Trying it.",
    });
    // The first file replaces none.
    expect(changeOf(draftOf(TODAY), undefined)).not.toHaveProperty("replaces");
  });

  it("replaces the newest file, even one that can't be read", () => {
    const routing = { settings: TODAY, history: [], report: { rows: {}, pooled: blank, beforeGate: 0 } } as ApiRouting;
    expect(replacesOf(routing)).toBeUndefined();
    expect(replacesOf({ ...routing, preferences: { name: "a.json", file: {} as never } })).toBe("a.json");
    expect(replacesOf({ ...routing, problem: "the preference file preferences/20261103T1-x.json can't be read (bad)" })).toBe("20261103T1-x.json");
  });
});

describe("what a draft would have held", () => {
  it("replays past cards in filing order, without Baesian's own or withdrawn ones, and counts the held misses", () => {
    const late = card({ touches: ["dependency"], created: at(1) }, { gate: { at: at(60) } as ApiCard["gate"], verdicts: [verdict("alternative", { choice: "B" })] });
    const early = card({ touches: ["dependency"], created: at(2) }, { verdicts: [verdict("accept")] });
    const shown = card({ touches: ["user-facing"] });
    const own = card({ source_agent: "baesian" });
    const withdrawn = card({ touches: ["dependency"] }, { status: "withdrawn" });
    const past = pastCards([late, early, shown, own, withdrawn]);
    expect(past.map((c) => c.id)).toEqual([early.meta.id, shown.meta.id, late.meta.id]);
    const r = replayDraft(past, { ...draftOf(TODAY), rows: { ...fewer.rows } }, TODAY);
    expect(r.total).toMatchObject({ cards: 3, held: 2, heldMissed: 1 });
    expect(r.rows.dependency).toMatchObject({ cards: 2, held: 2 });
    expect(replayDraft(past, draftOf(TODAY), TODAY).total.held).toBe(0);
  });

  it("says so in words", () => {
    expect(heldWords({ cards: 4, held: 2, heldMissed: 1 })).toBe("Would have held back 2 of your 4 past cards. You answered 1 of those against the agent.");
    expect(heldWords({ cards: 4, held: 1, heldMissed: 0 }, "It")).toBe("It would have held back 1 of your 4 past cards.");
    expect(heldWords({ cards: 4, held: 0, heldMissed: 0 }, "These settings")).toBe("These settings would have shown you all 4 of your past cards.");
    expect(heldWords({ cards: 0, held: 0, heldMissed: 0 })).toBe("No past cards to try it on yet.");
    expect(rowHeldWords(undefined)).toBe("No past cards");
    expect(rowHeldWords({ cards: 1, held: 0 })).toBe("1 past card, all reach you");
    expect(rowHeldWords({ cards: 3, held: 2 })).toBe("2 of 3 past cards held back");
  });
});

describe("the report in words (P14 section 3)", () => {
  it("says what reached you and what was held back, the audits, and the misses with their bound", () => {
    expect(reportLines(blank)).toEqual(["No cards yet."]);
    expect(reportLines({ ...blank, shown: 6, answered: 6 })).toEqual(["6 reached you.", "No misses in 6 answers: under about 1 in 2."]);
    expect(reportLines({ ...blank, shown: 1, held: 4, drawn: 4, auditsAnswered: 3, auditsUnanswered: 1, answered: 4, misses: 2 })).toEqual([
      "1 reached you, 4 held back.",
      "4 audits: 3 answered, 1 waiting for you.",
      "2 misses in 4 answers.",
    ]);
    expect(reportLines({ ...blank, shown: 3, wouldHold: 2 })).toEqual(["3 reached you, 2 would have been held back."]);
    expect(reportLines({ ...blank, held: 1, misses: 1 })).toEqual(["1 held back.", "1 miss."]);
  });

  it("bounds a rate only when the answers bound it usefully: under about 3 in n", () => {
    expect(boundWords(29)).toBe("under about 1 in 9");
    expect(boundWords(6)).toBe("under about 1 in 2");
    expect(boundWords(5)).toBe("too few answers to bound it yet");
  });

  it("says how often your blind choice matched the agent's, and the switches", () => {
    expect(blindWords(blank)).toBeUndefined();
    expect(blindWords({ ...blank, blind: 7, matched: 6, switched: 1 })).toBe("Your blind choice matched the agent's pick on 6 of 7. 1 time you switched to the agent's pick once you'd seen its case.");
  });
});

describe("the setup survey (B-5na1k)", () => {
  it("sends its answers and the preset they suggest, which the server would pick from them too", () => {
    const answers = { dependency: "fine", infra: "fine", other: "fine", schema: "see", user_facing: "see" } as const;
    expect(surveyAnswersOf(answers)).toEqual({ see: ["schema", "user_facing"], fine: ["dependency", "infra", "other"] });
    expect(surveyChange(answers, undefined)).toEqual({ preset: "fewer-interruptions", survey_see: ["schema", "user_facing"], survey_fine: ["dependency", "infra", "other"] });
    // Not sure of every one: "Today", named, so its rows are set whatever was in force.
    expect(surveyChange({}, "a.json")).toEqual({ replaces: "a.json", preset: "today" });
  });

  it("names the rows a preset holds back, in a sentence", () => {
    expect(heldRows(fewer.rows)).toEqual({ sample: ["dependency", "infra", "other"], agent: [] });
    expect(listWords(["runtime dependencies", "delivery and infrastructure", "anything else"])).toBe("runtime dependencies, delivery and infrastructure, and anything else");
    expect(listWords(["data formats", "security"])).toBe("data formats and security");
    expect(rowInSentence("data_loss")).toBe("destroying data");
  });
});
