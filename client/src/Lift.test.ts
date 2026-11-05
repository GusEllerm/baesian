import { describe, expect, it } from "vitest";
import { pointing, reachFrom } from "./Lift";

// A card held until it lifts, then dragged (B-yfehp): how far it must go to reach an answer, and which it points to.

const ALL = ["left", "right", "up", "down"] as const;

describe("reachFrom", () => {
  it("is 96 px sideways and 110 px up or down, from the middle of a phone's screen", () => {
    expect(reachFrom(195, 422, 390, 844)).toEqual({ left: 96, right: 96, up: 110, down: 110 });
  });

  it("is shorter toward an edge the finger lifted it near, so that edge stays in reach, but never under 44 px", () => {
    const r = reachFrom(320, 760, 390, 844);
    expect(r.right).toBeCloseTo(49);
    expect(r.left).toBe(96);
    expect(r.down).toBeCloseTo(58.8);
    expect(reachFrom(380, 422, 390, 844).right).toBe(44);
  });
});

describe("pointing", () => {
  const reach = reachFrom(195, 422, 390, 844);

  it("points nowhere until the card has moved a little", () => {
    expect(pointing(8, -6, ALL, reach)).toEqual({ dir: undefined, progress: 0 });
  });

  it("points along the way it has moved furthest, and reaches the answer at its reach", () => {
    expect(pointing(-48, 20, ALL, reach)).toEqual({ dir: "left", progress: 0.5 });
    expect(pointing(30, -110, ALL, reach)).toEqual({ dir: "up", progress: 1 });
    expect(pointing(130, 0, ALL, reach).progress).toBeGreaterThan(1);
  });

  it("points nowhere a card has no answer: up, on the setup survey's examples", () => {
    expect(pointing(0, -200, ["left", "right", "down"], reach)).toEqual({ dir: undefined, progress: 0 });
    expect(pointing(0, 200, ["left", "right", "down"], reach).dir).toBe("down");
  });
});
