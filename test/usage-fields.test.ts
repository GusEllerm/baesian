import { describe, expect, it } from "vitest";
import { Fact, Level, Response, Reverse } from "../src/schema.js";
import { NEVER_COUNTED, USAGE_FACTS, USAGE_KINDS, USAGE_LEVELS, USAGE_RESPONSES, USAGE_REVERSE, usageProblem } from "../src/usage-fields.js";

// The hosted service's usage counts (D141, B-7nq85): the one list the service checks every event against and the public
// page shows. Its values follow the store's own, and nothing outside it passes.

describe("what the service counts", () => {
  it("has the ten kinds the card decided, and its value lists are the store's own", () => {
    expect(Object.keys(USAGE_KINDS)).toEqual(["account_created", "machine_approved", "card_filed", "card_answered", "preferences_changed", "topic_merged", "push_sent", "push_opened", "visit", "error"]);
    expect([...USAGE_LEVELS]).toEqual(Level.options);
    expect([...USAGE_RESPONSES]).toEqual(Response.options);
    expect([...USAGE_FACTS]).toEqual(Fact.options);
    expect([...USAGE_REVERSE]).toEqual(Reverse.options);
    expect(USAGE_KINDS.error!.ids).toBe(false);
    expect(NEVER_COUNTED.join(" ")).toMatch(/what a card says/);
  });

  it("takes only a kind's own fields, each from its list, a whole number or yes/no", () => {
    expect(usageProblem("card_filed", { revision: 1, level: "hard", gate: "held", touches: ["money"], reverse: "cheap", harness: "codex", by_baesian: false })).toBeUndefined();
    expect(usageProblem("topic_merged", {})).toBeUndefined();
    expect(usageProblem("card_filed", { title: "Where the token lives" })).toBe("card_filed has no field title");
    expect(usageProblem("card_filed", { harness: "my-own-agent" })).toMatch(/harness is one of claude-code, codex, other/);
    expect(usageProblem("card_filed", { touches: ["money", "money"] })).toMatch(/a list from/);
    expect(usageProblem("card_filed", { touches: "money" })).toMatch(/a list from/);
    expect(usageProblem("card_answered", { minutes_waiting: 1.5 })).toMatch(/whole number/);
    expect(usageProblem("card_answered", { minutes_waiting: -1 })).toMatch(/whole number/);
    expect(usageProblem("card_answered", { blind_match: "yes" })).toMatch(/yes or no/);
    expect(usageProblem("card_title", {})).toMatch(/isn't a kind of event/);
    expect(usageProblem("toString", {})).toMatch(/isn't a kind of event/);
    expect(usageProblem("visit", { constructor: "x" })).toBe("visit has no field constructor");
  });
});
