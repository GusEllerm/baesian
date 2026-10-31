import { describe, expect, it } from "vitest";
import type { ApiState } from "../../src/api";
import { arrivals, stopping } from "./notify";

// Which cards are news (D40): blocking and hard cards that are open, and weren't there before.

const card = (id: string, level: string, status = "open", revision = 1) => ({ meta: { id, level, revision }, status });
const state = (...cards: ReturnType<typeof card>[]) => ({ cards }) as unknown as ApiState;

describe("notifications", () => {
  it("are for open blocking and hard cards only", () => {
    const s = state(card("a", "blocking"), card("b", "hard"), card("c", "provisional"), card("d", "blocking", "resolved"));
    expect(stopping(s).map((c) => c.meta.id)).toEqual(["a", "b"]);
  });

  it("are for cards that weren't there before, and a revised card is a new question", () => {
    const before = new Set(["a@1", "b@1"]);
    const s = state(card("a", "blocking"), card("b", "hard", "open", 2), card("e", "blocking"));
    expect(arrivals(before, s).map((c) => c.meta.id)).toEqual(["b", "e"]);
  });
});
