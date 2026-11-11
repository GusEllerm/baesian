import { describe, expect, it } from "vitest";
import { inboxLine, waitingIn } from "./inbox";

describe("a project's inbox (B-fzr1e)", () => {
  it("says how many cards wait for you, naming the hard and blocking ones, or that none do", () => {
    expect(inboxLine({ total: 0, hard: 0, blocking: 0 })).toBe("Nothing waiting");
    expect(inboxLine({ total: 1, hard: 0, blocking: 0 })).toBe("1 waiting for you");
    expect(inboxLine({ total: 3, hard: 1, blocking: 0 })).toBe("3 waiting for you, 1 hard");
    expect(inboxLine({ total: 4, hard: 1, blocking: 2 })).toBe("4 waiting for you, 1 hard, 2 blocking");
  });

  it("in a project with other members, says how many of the cards waiting were sent to you (B-tzdjn)", () => {
    const none = { total: 0, hard: 0, blocking: 0 };
    // Every one of them was sent to you: as a project of one says it.
    expect(inboxLine({ total: 3, hard: 1, blocking: 0, yours: { total: 3, hard: 1, blocking: 0 } })).toBe("3 waiting for you, 1 hard");
    expect(inboxLine({ total: 5, hard: 1, blocking: 0, yours: { total: 2, hard: 0, blocking: 0 } })).toBe("5 waiting, 2 sent to you, 1 hard");
    expect(inboxLine({ total: 2, hard: 0, blocking: 1, yours: none })).toBe("2 waiting, none sent to you, 1 blocking");
    expect(inboxLine({ ...none, yours: none })).toBe("Nothing waiting");
    // The tray counts every card on your desk, whoever it was sent to.
    expect(waitingIn({ total: 5, hard: 1, blocking: 0, yours: { total: 2, hard: 0, blocking: 0 } })).toBe(5);
  });

  it("says when it's still asking, or couldn't, and counts nothing until it knows", () => {
    expect(inboxLine(undefined)).toBe("Checking what's waiting…");
    expect(inboxLine("failed")).toBe("Couldn't check what's waiting");
    expect(waitingIn(undefined)).toBe(0);
    expect(waitingIn("failed")).toBe(0);
    expect(waitingIn({ total: 2, hard: 0, blocking: 1 })).toBe(2);
  });
});
