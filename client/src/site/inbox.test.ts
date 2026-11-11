import { describe, expect, it } from "vitest";
import { inboxLine, waitingIn } from "./inbox";

describe("a project's inbox (B-fzr1e)", () => {
  it("says how many cards wait for you, naming the hard and blocking ones, or that none do", () => {
    expect(inboxLine({ total: 0, hard: 0, blocking: 0 })).toBe("Nothing waiting");
    expect(inboxLine({ total: 1, hard: 0, blocking: 0 })).toBe("1 waiting for you");
    expect(inboxLine({ total: 3, hard: 1, blocking: 0 })).toBe("3 waiting for you, 1 hard");
    expect(inboxLine({ total: 4, hard: 1, blocking: 2 })).toBe("4 waiting for you, 1 hard, 2 blocking");
  });

  it("says when it's still asking, or couldn't, and counts nothing until it knows", () => {
    expect(inboxLine(undefined)).toBe("Checking what's waiting…");
    expect(inboxLine("failed")).toBe("Couldn't check what's waiting");
    expect(waitingIn(undefined)).toBe(0);
    expect(waitingIn("failed")).toBe(0);
    expect(waitingIn({ total: 2, hard: 0, blocking: 1 })).toBe(2);
  });
});
