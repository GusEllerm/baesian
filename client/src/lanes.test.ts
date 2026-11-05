import { describe, expect, it } from "vitest";
import type { ApiCard, ApiCommit, ApiMerge } from "../../src/api";
import { DESK_GEOMETRY, layoutBranches, markState, saidOf, summaryOf } from "./lanes";

// D181: the branches panel's layout, against hand-built states: lanes in the order their first card came, merges that
// end a lane and say where it forked, the dotted joins kept for lanes not merged, how a lane ends, and the commits.

const T0 = Date.parse("2026-11-04T09:00:00.000Z");
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();

let n = 0;
function card(branch: string, min: number, rest: Partial<Omit<ApiCard, "meta">> = {}, over: Partial<ApiCard["meta"]> = {}): ApiCard {
  n += 1;
  const id = `B-${String(n).padStart(5, "0")}`;
  return {
    meta: {
      type: "card", format: 1, id, revision: 1, title: `Decision ${n}`, question: `Which for ${n}?`, doing: "working",
      topic: `t${n}/x`, deck: "branch-x", level: "provisional", touches: [], reverse: "cheap",
      proposal: "A", proposal_then: "a", alternative: "B", alternative_then: "b", also_considered: [],
      crux: "?", crux_proposal: "yes", crux_alternative: "no",
      rules: [], proposal_breaks: [], alternative_breaks: [], depends_on: [], domain: [], evidence: [], rule_covers: [],
      source_agent: "claude-code", source_branch: branch, created: at(min),
      ...over,
    },
    body: "", revisions: 1, replied: false, status: "resolved", canonicalTopic: `t${n}/x`, dependents: [], briefs: [], waiting: [], fallbacks: [], attachments: 0,
    verdicts: [{ type: "verdict", format: 1, card: id, revision: 1, response: "accept", reviewer: "gus", client: "web", at: at(min + 1) }],
    ...rest,
  } as ApiCard;
}
const waiting = (branch: string, min: number) => card(branch, min, { status: "open", verdicts: [] });
const commit = (c: ApiCard, min: number, sha = "c".repeat(40)): ApiCommit => ({ commit: sha, branch: c.meta.source_branch, card: c.meta.id, at: at(min) });
const merge = (branch: string, into: string, min: number, cards: ApiCard[], sha = "d".repeat(40)): ApiMerge => ({ branch, into, commit: sha, at: at(min), cards: cards.map((c) => c.meta.id) });
const lane = (l: ReturnType<typeof layoutBranches>, name: string) => l.lanes.find((x) => x.name === name)!;

describe("the branches panel's layout (D181)", () => {
  it("draws a lane per branch, in the order the first card came, with each event placed in time", () => {
    const a = card("main", 0);
    const b = card("feat", 10);
    const c = card("main", 20);
    const l = layoutBranches({ cards: [c, b, a] });
    expect(l.lanes.map((x) => [x.name, x.k, x.cards])).toEqual([["main", 0, 2], ["feat", 1, 1]]);
    const xs = l.marks.map((m) => (m.kind === "card" ? [m.card.meta.id, m.x] : [])).filter((x) => x.length);
    expect(xs).toEqual([[a.meta.id, 30], [b.meta.id, 48], [c.meta.id, 66]]);
    // feat isn't merged: it's joined, dotted, to the busiest lane around when its first card came.
    expect(lane(l, "feat").fork).toMatchObject({ lane: 0, inferred: true });
    expect(lane(l, "feat").end).toEqual({ kind: "ready" });
  });

  it("ends a merged lane in its target, says where it forked from, and keeps the dotted join for one not merged", () => {
    const a = card("main", 0);
    const f1 = card("feat", 10);
    const f2 = card("feat", 20);
    const g1 = card("other", 25);
    const l = layoutBranches({ cards: [a, f1, f2, g1], merges: [merge("feat", "main", 30, [f1, f2])] });
    const feat = lane(l, "feat");
    expect(feat.end).toEqual({ kind: "merged", into: "main", at: at(30) });
    expect(feat.fork).toMatchObject({ lane: 0, inferred: false });
    const m = l.marks.find((x) => x.kind === "merge")!;
    expect(m).toMatchObject({ kind: "merge", lane: 0, from: feat.k, ends: true });
    expect(feat.to).toBeLessThan(m.x);
    expect(lane(l, "other").fork?.inferred).toBe(true);
    expect(summaryOf(l)).toBe("4 cards on 3 branches. You've answered 4, choosing otherwise than the agent on 0. 1 branch merged. No branch is held.");
  });

  it("gives a lane to a branch merged into with no cards of its own, at the top, as the trunk", () => {
    const f = card("feat", 10);
    const l = layoutBranches({ cards: [f], merges: [merge("feat", "main", 20, [f])] });
    expect(l.lanes.map((x) => [x.name, x.k, x.cards])).toEqual([["main", 0, 0], ["feat", 1, 1]]);
    expect(lane(l, "feat").end.kind).toBe("merged");
  });

  it("keeps a lane going past a merge it carried on after, and a sync from an older lane never ends that lane", () => {
    const a = card("main", 0);
    const f1 = card("feat", 10);
    const f2 = card("feat", 40);
    const l = layoutBranches({ cards: [a, f1, f2], merges: [merge("feat", "main", 20, [f1], "1".repeat(40)), merge("main", "feat", 30, [a], "2".repeat(40))] });
    expect(lane(l, "feat").end).toEqual({ kind: "ready" });
    expect(lane(l, "main").end).toEqual({ kind: "ready" });
    expect(l.marks.filter((m) => m.kind === "merge").map((m) => m.kind === "merge" && m.ends)).toEqual([false, false]);
  });

  it("holds a lane while a card on it waits, and says how many", () => {
    const l = layoutBranches({ cards: [card("main", 0), waiting("feat", 5), waiting("feat", 6), card("feat", 7, { status: "held", verdicts: [] })] });
    expect(lane(l, "feat").end).toEqual({ kind: "held", waiting: 2 });
    expect(summaryOf(l)).toMatch(/1 branch is held by a card still waiting\.$/);
  });

  it("puts each commit on its branch's lane, joined to the card it cites, and counts the same merge found twice once", () => {
    const f = card("feat", 10);
    const l = layoutBranches({ cards: [card("main", 0), f], commits: [commit(f, 12), { ...commit(f, 13, "e".repeat(40)), branch: "detached-abc1234" }], merges: [merge("feat", "main", 20, [f], "1".repeat(40)), merge("feat", "main", 21, [f], "2".repeat(40))] });
    const commits = l.marks.filter((m) => m.kind === "commit");
    expect(commits).toHaveLength(2);
    // A commit made on a detached HEAD goes on its card's lane.
    expect(commits.every((m) => m.lane === lane(l, "feat").k && m.kind === "commit" && m.cites?.card.meta.id === f.meta.id)).toBe(true);
    expect(l.marks.filter((m) => m.kind === "merge")).toHaveLength(1);
    expect(l.counts.commits).toBe(2);
  });

  it("leaves room for each day's label, however little happened on the day before", () => {
    const l = layoutBranches({ cards: [card("main", 0), card("main", 24 * 60)] });
    expect(l.days).toHaveLength(2);
    expect(l.days[1]!.x - l.days[0]!.x).toBeGreaterThanOrEqual(76);
    expect(l.width).toBeGreaterThan(l.days[1]!.x);
    expect(DESK_GEOMETRY.step).toBe(18);
  });

  it("says what happened to each card, as its mark shows it", () => {
    const now = T0 + 60 * 60_000;
    expect(markState(card("main", 0))).toBe("with");
    const against = card("main", 0, { verdicts: [{ type: "verdict", format: 1, card: "B-x", revision: 1, response: "alternative", reviewer: "gus", client: "web", at: at(1) } as never] });
    expect(markState(against)).toBe("against");
    expect(saidOf(against, now).words).toBe("you chose “B”, not the agent's pick");
    expect(saidOf(card("main", 0, { verdicts: [{ type: "verdict", format: 1, card: "B-x", revision: 1, response: "accept", first_choice: "alternative", reviewer: "gus", client: "web", at: at(1) } as never] }), now).words).toBe("you chose “A”, after reading its case");
    expect(markState(card("main", 0, { status: "withdrawn" }))).toBe("gone");
    expect(markState(card("main", 0, { status: "deferred" }))).toBe("aside");
    expect(saidOf(waiting("main", 0), now)).toEqual({ words: "waiting for you", tone: "waiting" });
  });
});
