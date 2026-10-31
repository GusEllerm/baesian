import { describe, expect, it } from "vitest";
import type { ApiState } from "../../src/api";
import { laterSuperseded, median, recap, seconds, timeSpent } from "./calibration";

// The calibration panel and the recap (M4 step 5e).

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
    expect(laterSuperseded(state)).toEqual(["Overturned"]);
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
