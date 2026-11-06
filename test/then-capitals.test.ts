import { describe, expect, it } from "vitest";
import { CardDraft, filingWarnings } from "../src/schema.js";
import { draft } from "./helpers.js";

const warn = (over: Record<string, unknown>) => filingWarnings(CardDraft.parse(draft(over))).filter((w) => w.includes('"then"'));

describe("an outcome that starts with a capital, shown after \"then\" (B-b0dzp)", () => {
  it("asks for it lowercase, naming the field", () => {
    expect(warn({ proposal_then: "The relay notes the commits it held." })).toEqual([
      'proposal_then starts with a capital, and the card shows it after "then": start it lowercase, unless its first word is a name',
    ]);
    expect(warn({ alternative_then: "A merge listing only commits goes at the next daily look." })).toHaveLength(1);
  });
  it("passes an outcome that starts lowercase, or with a word in capitals", () => {
    expect(warn({ proposal_then: "the relay notes the commits it held", alternative_then: "CI restores packages from a cache" })).toEqual([]);
    expect(warn({ proposal_then: "`findMerges()` skips it" })).toEqual([]);
  });
});
