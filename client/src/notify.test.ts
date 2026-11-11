import { describe, expect, it } from "vitest";
import type { ApiState } from "../../src/api";
import { arrivals, stopping } from "./notify";

// Which cards are news (D40): blocking and hard cards that are open, and weren't there before.

const card = (id: string, level: string, status = "open", revision = 1, sent_to?: string) => ({ meta: { id, level, revision }, status, ...(sent_to ? { sent_to } : {}) });
const state = (...cards: ReturnType<typeof card>[]) => ({ cards }) as unknown as ApiState;

describe("notifications", () => {
  it("are for open blocking and hard cards only", () => {
    const s = state(card("a", "blocking"), card("b", "hard"), card("c", "provisional"), card("d", "blocking", "resolved"));
    expect(stopping(s).map((c) => c.meta.id)).toEqual(["a", "b"]);
  });

  it("in a project with members, are for the cards sent to you: the others are on your desk when you look (B-tzdjn)", () => {
    const handles = new Map([
      ["acct-ana", "ana"],
      ["acct-ben", "ben"],
    ]);
    const s = state(card("a", "blocking", "open", 1, "acct-ana"), card("b", "hard", "open", 1, "acct-ben"), card("c", "hard"));
    // Ana, an owner: hers, and the one sent to nobody in particular. Ben, a member: his alone.
    expect(stopping(s, { me: "acct-ana", role: "owner", handles }).map((c) => c.meta.id)).toEqual(["a", "c"]);
    expect(stopping(s, { me: "acct-ben", role: "member", handles }).map((c) => c.meta.id)).toEqual(["b"]);
    expect(arrivals(new Set(["b@1"]), s, { me: "acct-ben", role: "member", handles })).toEqual([]);
  });

  it("are for cards that weren't there before, and a revised card is a new question", () => {
    const before = new Set(["a@1", "b@1"]);
    const s = state(card("a", "blocking"), card("b", "hard", "open", 2), card("e", "blocking"));
    expect(arrivals(before, s).map((c) => c.meta.id)).toEqual(["b", "e"]);
  });
});
