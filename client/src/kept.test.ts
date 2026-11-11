import { describe, expect, it } from "vitest";
import type { ApiState } from "../../src/api";
import { keepCounts, keepState, keptCounts, keptFor, keptState } from "./kept";

describe("what the tab keeps (B-3va5g, B-9n2c3)", () => {
  it("keeps each project's last state and counts for whoever is signed in, and forgets them when someone else is, or nobody", () => {
    const state = { version: 3 } as unknown as ApiState;
    keptFor("acct-gus");
    keepState("/v1/projects/p-1/state", { state, fetchedAt: 1 });
    keepCounts("p-1", { total: 2, hard: 1, blocking: 0 });
    keptFor("acct-gus");
    expect(keptState("/v1/projects/p-1/state")?.state.version).toBe(3);
    expect(keptCounts("p-1")).toEqual({ total: 2, hard: 1, blocking: 0 });
    keptFor(undefined);
    expect(keptState("/v1/projects/p-1/state")).toBeUndefined();
    expect(keptCounts("p-1")).toBeUndefined();
    keepState("/v1/projects/p-1/state", { state, fetchedAt: 1 });
    keptFor("acct-robin");
    expect(keptState("/v1/projects/p-1/state")).toBeUndefined();
  });
});
