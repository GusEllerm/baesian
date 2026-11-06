import { describe, expect, it } from "vitest";
import type { ApiCard, ApiRouting, RowReport } from "../../src/api";
import { PRESETS, TODAY } from "../../src/routing";
import {
  FIXED_ROWS,
  ROWS,
  ROW_WHAT,
  STOP_SHORT,
  allowed,
  changeOf,
  dirty,
  draftOf,
  heldRows,
  heldWords,
  holdingWords,
  listWords,
  pastCards,
  presetOf,
  rateWords,
  replacesOf,
  replayDraft,
  rowEvidence,
  rowInSentence,
  stopMeans,
  stopRows,
  stopTitle,
  surveyAnswersOf,
  surveyChange,
} from "./prefs";

// The client's side of the preferences (M8b, D147): drafts, the change it sends, what a draft would have held, and what
// each stop does, in words (D180).

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
const blank: RowReport = {
  shown: 0, held: 0, wouldHold: 0, drawn: 0, auditsAnswered: 0, auditsUnanswered: 0, answered: 0, misses: 0, switched: 0, blind: 0, matched: 0, streak: 0, recentMisses: 0,
  agreed: 0, cameRound: 0, unblind: 0, unanswered: 0, heldWaiting: 0, inChat: 0,
};
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
  });
});

describe("what each stop does, in words (D180)", () => {
  it("lists the five stops from \"never without me\" down, with the audit rates and burn-in in force, and the passkey only on the website", () => {
    const rows = stopRows(TODAY, false);
    expect(rows.map((r) => [r.position, r.chip])).toEqual([
      ["never-without-me", "hard"],
      ["stop-and-ask", "blocking"],
      ["tell-me", "provisional"],
      ["sample", "held"],
      ["agent-decides", "held"],
    ]);
    expect(rows[0]!.card).toBe("Reaches you.");
    expect(stopRows(TODAY, true)[0]!.card).toBe("Reaches you. Answering it takes your passkey.");
    expect(rows[1]!.agent).toBe("Waits for you while you're here, up to about 9 minutes, then goes ahead with its pick until you answer.");
    expect(rows[3]!.card).toBe("Goes to your Held back list, not your queue. About 1 in 3 comes to you anyway, at random, to check; so does each of a row's first 10.");
    expect(rows[3]!.agent).toBe("Goes ahead with its pick. Its branch can merge without your answer, and you can still answer it later.");
    expect(rows[4]!.card).toBe("Goes to your Held back list. About 1 in 10 comes to you anyway, at random, to check; so does each of a row's first 10.");
    // Other settings say other numbers.
    expect(stopRows({ rate_sample: 0.5, rate_agent_decides: 0, burn_in: 0 }, false).slice(3).map((r) => r.card)).toEqual([
      "Goes to your Held back list, not your queue. About 1 in 2 comes to you anyway, at random, to check.",
      "Goes to your Held back list. None comes to you to check.",
    ]);
    expect(stopRows({ rate_sample: 1, rate_agent_decides: 0, burn_in: 4 }, false).slice(3).map((r) => r.card)).toEqual([
      "Goes to your Held back list, not your queue. Every one comes to you anyway, to check.",
      "Goes to your Held back list. Only a row's first 4 come to you, to check.",
    ]);
    expect(rateWords(0.1)).toBe("about 1 in 10");
  });

  it("says what holding back does in each mode, with the passkey only on the website", () => {
    expect(holdingWords("shadow", true).now).toBe("Shadow: your settings are tried out, not applied. Every card still reaches you.");
    expect(holdingWords("enforce", false)).toEqual({
      now: "On: cards on rows at the two lowest stops skip your queue. Their agents carry on, and a random sample comes back to you.",
      more: "Rows at the three upper stops are unchanged.",
    });
    expect(holdingWords("enforce", true).more).toBe("Turning it on takes your passkey, because it lets cards past you. Rows at the three upper stops are unchanged.");
  });

  it("says what a row's stop means now: by the mode for the two that hold back, with the rest of the row's burn-in", () => {
    const opts = { hosted: false, held: 0 };
    expect(stopMeans("tell-me", "shadow", TODAY, opts)).toBe("These cards reach you, and the agent carries on with its pick meanwhile, so you never hold it up. It hears your answer at its next stopping point.");
    expect(stopMeans("stop-and-ask", "enforce", TODAY, opts)).toBe("These cards reach you, and the agent waits for your answer while you're here, up to about 9 minutes, before going ahead with its pick.");
    expect(stopMeans("never-without-me", "enforce", TODAY, opts)).toBe("These cards reach you, and the agent stops until you answer.");
    expect(stopMeans("never-without-me", "enforce", TODAY, { hosted: true, held: 0 })).toBe("These cards reach you, and the agent stops until you answer, with your passkey.");
    expect(stopMeans("sample", "shadow", TODAY, opts)).toBe(
      "In shadow, these cards still reach you. With holding back on, they'd go to your Held back list and the agent would carry on with its pick; the row's first 10 would come back to you, then about 1 in 3.",
    );
    expect(stopMeans("sample", "enforce", TODAY, opts)).toBe(
      "These cards skip your queue: the agent carries on with its pick, and the card waits on your Held back list. The row's first 10 come back to you, then about 1 in 3, at random.",
    );
    expect(stopMeans("agent-decides", "enforce", TODAY, { hosted: false, held: 9 })).toBe(
      "These cards skip your queue: the agent carries on with its pick, and the card waits on your Held back list. The row's next one comes back to you, then about 1 in 10, at random.",
    );
    expect(stopMeans("agent-decides", "enforce", TODAY, { hosted: false, held: 12 })).toBe(
      "These cards skip your queue: the agent carries on with its pick, and the card waits on your Held back list. About 1 in 10 comes back to you, at random.",
    );
    expect(stopMeans("agent-decides", "shadow", { ...TODAY, rate_agent_decides: 0, burn_in: 0 }, opts)).toMatch(/; none would come back to you\.$/);
  });

  it("gives a row's evidence from the report, and at a stop that holds back, what it would have held of the row's past cards", () => {
    expect(rowEvidence(undefined, undefined, false)).toBe("No cards in this row yet.");
    expect(rowEvidence({ ...blank, shown: 17, misses: 1 }, undefined, false)).toBe("17 cards so far: you overturned the agent on 1.");
    expect(rowEvidence({ ...blank, shown: 2 }, { cards: 2, held: 0, heldMissed: 0 }, false)).toBe("2 cards so far: you haven't overturned the agent here.");
    expect(rowEvidence({ ...blank, shown: 4, misses: 1 }, { cards: 4, held: 3, heldMissed: 1 }, true)).toBe(
      "4 cards so far: you overturned the agent on 1. At this stop, 3 of them would have been held back, including 1 you overturned.",
    );
    expect(rowEvidence({ ...blank, shown: 2 }, { cards: 2, held: 2, heldMissed: 0 }, true)).toBe("2 cards so far: you haven't overturned the agent here. At this stop, all of them would have been held back.");
    expect(rowEvidence({ ...blank, shown: 1 }, { cards: 1, held: 0, heldMissed: 0 }, true)).toBe("1 card so far: you haven't overturned the agent here. At this stop, it wouldn't have been held back.");
    expect(rowEvidence({ ...blank, held: 1, misses: 1 }, { cards: 1, held: 1, heldMissed: 1 }, true)).toBe("1 card so far: you overturned the agent on 1. At this stop, it would have been held back, and you overturned it.");
    // The replay puts a card with several facts on its strictest row under the draft, which can differ from the record's.
    expect(rowEvidence({ ...blank, shown: 3 }, { cards: 2, held: 1, heldMissed: 0 }, true)).toBe("3 cards so far: you haven't overturned the agent here. At this stop, 1 of its 2 past cards would have been held back.");
  });

  it("describes every row, and names each stop short enough for a phone", () => {
    for (const row of [...ROWS, ...FIXED_ROWS]) expect(ROW_WHAT[row]).toMatch(/\.$/);
    expect(Object.values(STOP_SHORT)).toEqual(["Agent decides", "Sample after", "Tell me, carry on", "Stop and ask", "Never without me"]);
    expect(stopTitle("tell-me")).toBe("Tell me but carry on");
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
