import { describe, expect, it } from "vitest";
import { ASK_BEFORE_EXPIRY_MS, askNow, confirmedLine, expiredLine, waitingLine } from "./waiting";

// Answers waiting for your passkey (B-a6xpc): when the desk asks by itself, and what it says.

const NOW = Date.UTC(2026, 10, 5, 12);
const MIN = 60_000;
const w = (pending: string, minutesLeft = 30) => ({ pending, expiresAt: NOW + minutesLeft * MIN });
const ask = (over: Partial<Parameters<typeof askNow>[0]>) => askNow({ waiting: [w("a"), w("b")], busy: false, hardInFront: false, declined: new Set(), warned: new Set(), now: NOW, ...over });

describe("askNow", () => {
  it("asks once the card in front of you isn't hard, or none is left: the run of hard cards is over", () => {
    expect(ask({})).toBe("run-over");
    expect(ask({ hardInFront: true })).toBe("no");
    expect(ask({ waiting: [] })).toBe("no");
  });

  it("waits while anything is in the way: an answer in its undo window or on its way, a panel, the prompt", () => {
    expect(ask({ busy: true })).toBe("no");
    expect(ask({ busy: true, waiting: [w("a", 1)] })).toBe("no");
  });

  it("after Not now, asks by itself again only for an answer that joined since", () => {
    expect(ask({ declined: new Set(["a", "b"]) })).toBe("no");
    expect(ask({ declined: new Set(["a"]) })).toBe("run-over");
  });

  it("asks once, whatever is in front of you, when an answer would expire within five minutes", () => {
    const near = w("a", ASK_BEFORE_EXPIRY_MS / MIN);
    expect(ask({ waiting: [near, w("b")], hardInFront: true, declined: new Set(["a", "b"]) })).toBe("expiring");
    expect(ask({ waiting: [near, w("b")], hardInFront: true, warned: new Set(["a"]) })).toBe("no");
    expect(ask({ waiting: [w("a", 6)], hardInFront: true })).toBe("no");
  });
});

describe("what the desk says", () => {
  it("counts the answers waiting in words", () => {
    expect(waitingLine(1)).toBe("One answer waits for your passkey.");
    expect(waitingLine(2)).toBe("Two answers wait for your passkey.");
    expect(waitingLine(12)).toBe("12 answers wait for your passkey.");
  });

  it("names the cards whose answers waited too long, which are back", () => {
    expect(expiredLine(["Where runs are kept"])).toBe("Your answer to “Where runs are kept” waited too long for your passkey, so it wasn't recorded. The card is back for you to answer.");
    expect(expiredLine(["One", "Two"])).toBe("Two answers waited too long for your passkey, so they weren't recorded: “One”, “Two”. Their cards are back for you to answer.");
  });

  it("says what one tap confirmed", () => {
    expect(confirmedLine(1, "Sent to claude-code.")).toBe("Sent to claude-code.");
    expect(confirmedLine(3, "Sent to claude-code.")).toBe("Three answers confirmed and sent.");
  });
});
