import { describe, expect, it } from "vitest";
import type { ApiState, RowReport } from "../../src/api";
import { TODAY } from "../../src/routing";
import { SCALE_MIN, barOf, laterSuperseded, leftOut, median, needsWords, notCounted, ownReport, recap, ruleWords, scaleOf, seconds, segmentWords, summaryWords, timeSpent } from "./calibration";

// The calibration panel and the recap (M4 step 5e), and your answers row by row (D180).

describe("time spent", () => {
  it("is a median, by stakes", () => {
    expect(median([])).toBeUndefined();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    const at = "2026-10-31T12:00:00.000Z";
    expect(timeSpent([{ rarity: "rare", ms: 9000, at }, { rarity: "mythic", ms: 11000, at }, { rarity: "common", ms: 2000, at }])).toEqual({ high: 10000, common: 2000 });
    expect(seconds(undefined)).toBe("none yet");
    expect(seconds(12345)).toBe("12.3\u00a0s"); // a no-break space: "s" never wraps onto a line of its own
  });
});

describe("later superseded (Client Data Contract: partial)", () => {
  it("names the decisions you resolved in the client that were later superseded", () => {
    const card = (title: string, status: string, client: string, response = "accept") => ({ meta: { title }, status, verdicts: [{ client, response }] });
    const state = { cards: [card("Kept", "resolved", "web"), card("Overturned", "superseded", "web"), card("Not yours", "superseded", "cli"), card("Only asked", "superseded", "web", "question")] } as unknown as ApiState;
    expect(laterSuperseded(state)).toEqual({ names: ["Overturned"], inChat: 0 });
    // Answered on the website, from either layout (D130).
    const site = { cards: [card("On a phone", "superseded", "hosted-phone"), card("On a desktop", "superseded", "hosted-desktop", "alternative")] } as unknown as ApiState;
    expect(laterSuperseded(site).names).toEqual(["On a phone", "On a desktop"]);
  });

  it("leaves out the choices you answered in chat, and counts those you settled here (B-hswmx)", () => {
    const chat = (title: string, status: string) => ({ meta: { title, answered_in_chat: "Postgres." }, status, verdicts: [{ client: "web", response: "accept", seen: true }] });
    const blind = { meta: { title: "Blind" }, status: "superseded", verdicts: [{ client: "web", response: "accept" }] };
    const waiting = { meta: { title: "Waiting", answered_in_chat: "Postgres." }, status: "open", verdicts: [] };
    const state = { cards: [chat("Said in chat", "superseded"), chat("Kept from chat", "resolved"), blind, waiting] } as unknown as ApiState;
    expect(laterSuperseded(state)).toEqual({ names: ["Blind"], inChat: 2 });
  });
});

describe("your own answers, in a project with members (B-4mt91)", () => {
  const handles = new Map([
    ["acct-ana", "ana"],
    ["acct-ben", "ben"],
  ]);
  const ana = { me: "acct-ana", role: "owner" as const, handles };
  const ben = { me: "acct-ben", role: "member" as const, handles };
  const v = (account: string, response: string, first_choice?: string, over: Record<string, unknown> = {}) => ({ account, reviewer: handles.get(account), client: "hosted-desktop", response, at: "2026-11-11T10:00:00.000Z", ...(first_choice ? { first_choice } : {}), ...over });
  const card = (title: string, verdicts: unknown[], over: Record<string, unknown> = {}, status = "resolved") => ({ meta: { title, touches: ["schema"], source_agent: "claude-code", ...over }, status, verdicts, gate: { row: "schema", source: "agent" } });
  const blank = { shown: 0, held: 0, wouldHold: 0, drawn: 0, auditsAnswered: 0, auditsUnanswered: 0, answered: 0, misses: 0, switched: 0, blind: 0, matched: 0, agreed: 0, cameRound: 0, unblind: 0, unanswered: 0, heldWaiting: 0, inChat: 0 };
  const test = { answers: 30, misses: 0, toLoosen: 12, waiting: false };
  const state = {
    cards: [
      card("Ana agreed", [v("acct-ana", "accept", "proposal")]),
      card("Ana came round", [v("acct-ana", "accept", "alternative")]),
      card("Ben overturned", [v("acct-ben", "alternative", "alternative")]),
      card("Ben agreed", [v("acct-ben", "accept", "proposal")]),
      // Ben asked a question, then Ana settled it: hers alone to count.
      card("Asked, then settled", [v("acct-ben", "question"), v("acct-ana", "accept", "proposal")]),
      card("Ana, in chat", [v("acct-ana", "accept", undefined, { seen: true })], { answered_in_chat: "A." }),
      card("Ana, no blind choice", [v("acct-ana", "accept")]),
      card("Nobody yet", [], {}, "open"),
      card("Baesian's own", [v("acct-ana", "accept", "proposal")], { source_agent: "baesian" }),
      card("Withdrawn", [v("acct-ana", "accept", "proposal")], {}, "withdrawn"),
    ],
    routing: { settings: TODAY, history: [], report: { rows: { schema: { ...blank, position: "stop-and-ask", agreed: 3, cameRound: 1, misses: 1, test } }, pooled: { ...blank, agreed: 3, cameRound: 1, misses: 1 }, beforeGate: 0 } },
  } as unknown as ApiState;

  it("counts each member's own answers, once a card, and nobody else's", () => {
    const hers = ownReport(state, ana);
    expect(barOf(hers.pooled)).toEqual({ agreed: 2, cameRound: 1, missed: 0, total: 3 });
    expect(hers.pooled).toMatchObject({ answered: 4, unblind: 1, inChat: 1, unanswered: 0 });
    expect(barOf(hers.rows.schema!)).toEqual({ agreed: 2, cameRound: 1, missed: 0, total: 3 });
    const his = ownReport(state, ben);
    expect(barOf(his.pooled)).toEqual({ agreed: 1, cameRound: 0, missed: 1, total: 2 });
    // A new member's bars start empty.
    expect(barOf(ownReport(state, { me: "acct-cat", role: "member", handles }).pooled).total).toBe(0);
  });

  it("keeps each row's stop, and what the project needs before it moves, named as the project's", () => {
    const his = ownReport(state, ben);
    expect(his.rows.schema).toMatchObject({ position: "stop-and-ask", test });
    expect(needsWords(test, ben)).toBe("The project needs 12 more without a miss for a lower stop");
    expect(needsWords({ ...test, toLoosen: 0 }, ben)).toBe("The project has enough for a lower stop");
    expect(needsWords({ ...test, waiting: true }, ben)).toBe("A move for this row waits for an owner");
    expect(needsWords({ ...test, waiting: true }, ana)).toBe("A move for this row waits for you or another owner");
    // Where one person answers, as ever.
    expect(needsWords(test)).toBe("12 more without a miss for a lower stop");
    expect(needsWords({ ...test, waiting: true }, { me: "acct-ana", role: "owner", handles: new Map([["acct-ana", "ana"]]) })).toBe("A move for this row waits for you");
  });

  it("names only the decisions you settled yourself as later superseded", () => {
    const sup = { cards: [card("Ana's", [v("acct-ana", "accept", "proposal")], {}, "superseded"), card("Ben's", [v("acct-ben", "accept", "proposal")], {}, "superseded")] } as unknown as ApiState;
    expect(laterSuperseded(sup, ana).names).toEqual(["Ana's"]);
    expect(laterSuperseded(sup, ben).names).toEqual(["Ben's"]);
    expect(laterSuperseded(sup).names).toEqual(["Ana's", "Ben's"]);
  });
});

describe("the recap", () => {
  it("says what you did this session, in one sentence", () => {
    expect(recap([])).toBe("");
    expect(recap([{ kind: "choose", option: "proposal", first: "proposal" }])).toBe("You answered 1 card, and took the agent's pick.");
    expect(recap([{ kind: "choose", option: "proposal", first: "proposal" }, { kind: "choose", option: "proposal", first: "proposal" }])).toBe("You answered 2 cards, and took the agent's pick each time.");
    expect(
      recap([
        { kind: "choose", option: "proposal", first: "proposal" },
        { kind: "choose", option: "alternative", first: "alternative" },
        { kind: "pass", reason: "see_it_run", text: "" },
      ]),
    ).toBe("You answered 3 cards: 1 took the agent's pick, 1 chose the alternative and 1 couldn't judge.");
  });
});

const blank: RowReport = {
  shown: 0, held: 0, wouldHold: 0, drawn: 0, auditsAnswered: 0, auditsUnanswered: 0, answered: 0, misses: 0, switched: 0, blind: 0, matched: 0,
  agreed: 0, cameRound: 0, unblind: 0, unanswered: 0, heldWaiting: 0, inChat: 0,
};

describe("your answers, row by row (D180)", () => {
  it("reads each row's bar from the report: missed is its misses (B-87tkc, B-ab06a)", () => {
    expect(barOf({ ...blank, agreed: 23, cameRound: 19, misses: 1 })).toEqual({ agreed: 23, cameRound: 19, missed: 1, total: 43 });
  });

  it("puts every row on one scale, the longest filling the track, or the answers a clean row needs for a lower stop until one has them", () => {
    const bar = (total: number) => ({ agreed: total, cameRound: 0, missed: 0, total });
    expect(scaleOf([bar(17), bar(43), bar(2)])).toBe(43);
    expect(scaleOf([bar(5), bar(2)])).toBe(SCALE_MIN);
    expect(SCALE_MIN).toBe(28);
  });

  it("says what a row now needs for a lower stop, in words read at a glance (B-jtsfh)", () => {
    expect(needsWords({ answers: 3, misses: 0, toLoosen: 25, waiting: false })).toBe("25 more without a miss for a lower stop");
    expect(needsWords({ answers: 44, misses: 1, toLoosen: 1, waiting: false })).toBe("1 more without a miss for a lower stop");
    expect(needsWords({ answers: 28, misses: 0, toLoosen: 0, waiting: false })).toBe("Enough for a lower stop");
    expect(needsWords({ answers: 28, misses: 0, toLoosen: 0, waiting: true })).toBe("A move for this row waits for you");
    expect(needsWords({ answers: 28, misses: 0, waiting: false })).toBe("As low as it can go");
    expect(needsWords(undefined)).toBeUndefined();
    expect(ruleWords).toEqual({ down: "after 28 answers with none, 45 with one, 60 with two", up: "a miss in its first 2 answers, 3 in 10, 5 in 20" });
  });

  it("sums up every card, and says what the bars leave out", () => {
    expect(summaryWords({ ...blank, agreed: 75, cameRound: 46, misses: 8 })).toBe(
      "Of 129 cards, you chose as the agent did 75 times without seeing its pick and came round to it 46 times after reading its case; 8 were misses.",
    );
    expect(summaryWords({ ...blank, agreed: 1, misses: 1, unanswered: 4, heldWaiting: 3, auditsUnanswered: 1, unblind: 1 })).toBe(
      "Of 2 cards, you chose as the agent did once without seeing its pick and came round to it 0 times after reading its case; 1 was a miss. 5\u00a0more aren't counted: 1 not answered, 2 held back, 1 audit waiting and 1 kept without a blind choice.",
    );
    expect(summaryWords(blank)).toBe("No answers yet: each row's bar fills in as you answer its cards.");
    expect(summaryWords({ ...blank, unanswered: 1 })).toBe("No answers to count yet: 1 not answered.");
    expect(leftOut({ ...blank, unanswered: 2, heldWaiting: 2, auditsUnanswered: 2 })).toEqual(["2 audits waiting"]);
  });

  it("says how many choices answered in chat it left out (B-hswmx)", () => {
    expect(leftOut({ ...blank, inChat: 2 })).toEqual(["2 answered in chat"]);
    expect(notCounted({ ...blank, unanswered: 1, unblind: 1, inChat: 2 })).toBe(4);
    expect(notCounted(undefined)).toBe(0);
    expect(summaryWords({ ...blank, agreed: 3, inChat: 1 })).toBe(
      "Of 3 cards, you chose as the agent did 3 times without seeing its pick and came round to it 0 times after reading its case; 0 were misses. 1 more isn't counted: 1 answered in chat.",
    );
    expect(summaryWords({ ...blank, inChat: 2 })).toBe("No answers to count yet: 2 answered in chat.");
  });

  it("names a segment's count in its tooltip", () => {
    expect(segmentWords("Security", "agreed", 23, 43)).toBe("Security: you chose as the agent did, blind, on 23 of 43 cards");
    expect(segmentWords("Privacy", "missed", 1, 5)).toBe("Privacy: a miss, on 1 of 5 cards");
    expect(segmentWords("Privacy", "missed", 2, 5)).toBe("Privacy: misses, on 2 of 5 cards");
    expect(segmentWords("Spending", "cameRound", 1, 1)).toBe("Spending: you came round to its pick, on 1 of 1 card");
  });
});
