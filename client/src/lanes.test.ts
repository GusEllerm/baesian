import { describe, expect, it } from "vitest";
import type { ApiCard, ApiCommit, ApiMerge } from "../../src/api";
import { type BranchesState, type Event, type Model, type Row, branchModel, chosenOf, columnsOf, commitsOf, endWords, linkedKeys, listRows, markState, openingKey, saidOf, shortNames, statusOf } from "./lanes";

// D181 redrawn (B-v8jzy, B-vfdhz, B-tgq5p, B-jr8mk): the branches list's model, against hand-built states. The fixtures
// are the design loop's (its final/data.mjs), as typed builders: a history like this repo's (a trunk, v1/next, worktrees
// merged into it, merges' own commits in the ledger, commits on branches with no cards), parallel worktrees with held and
// unmerged branches, no cards on main, a repo with only a feature branch, six worktrees alive at once, and 60 days.

const T0 = Date.parse("2026-11-02T09:00:00.000Z");
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();
const sha = (s: string) => (s + "0123456789abcdef".repeat(3)).slice(0, 40);

let n = 0;
type St = "with" | "against" | "waiting" | "held" | "deferred" | "gone";
function card(branch: string, min: number, st: St = "with", over: Partial<ApiCard["meta"]> = {}): ApiCard {
  n += 1;
  const id = over.id ?? `B-${String(n).padStart(5, "0")}`;
  const verdict = (response: string, extra = {}) => [{ type: "verdict", format: 1, card: id, revision: 1, response, reviewer: "gus", client: "web", at: at(min + 1), ...extra }];
  const status = st === "with" || st === "against" ? "resolved" : st === "waiting" ? "open" : st === "gone" ? "withdrawn" : st;
  return {
    meta: {
      type: "card", format: 1, id, revision: 1, title: `Decision ${id}`, question: `Which for ${id}?`, doing: "working",
      topic: `t${n}/x`, deck: "branch-x", level: "provisional", touches: [], reverse: "cheap",
      proposal: "A", proposal_then: "a", alternative: "B", alternative_then: "b", also_considered: [],
      crux: "?", crux_proposal: "yes", crux_alternative: "no",
      rules: [], proposal_breaks: [], alternative_breaks: [], depends_on: [], domain: [], evidence: [], rule_covers: [],
      source_agent: "claude-code", source_branch: branch, created: at(min),
      ...over,
    },
    body: "", revisions: 1, replied: false, status, canonicalTopic: `t${n}/x`, dependents: [], briefs: [], waiting: [], fallbacks: [], attachments: 0,
    verdicts: st === "with" ? verdict("accept") : st === "against" ? verdict("alternative") : [],
  } as unknown as ApiCard;
}
const cite = (c: ApiCard, min: number, hash: string, branch = c.meta.source_branch): ApiCommit => ({ commit: sha(hash), branch, card: c.meta.id, at: at(min) });
const merge = (branch: string, into: string, min: number, cards: ApiCard[], hash: string): ApiMerge => ({ branch, into, commit: sha(hash), at: at(min), cards: cards.map((c) => c.meta.id) });
const W = (k: string) => `worktree-agent-${k}5c0ffee1234567`;

/** A history like this repo's: main, an overnight branch merged into it, v1/next (never merged), worktrees merged into v1/next by fast-forward. */
function realLike() {
  const m0 = card("main", 0, "with", { level: "hard" });
  const m1 = card("main", 30, "against");
  const o = [card("overnight/2026-11-02", 60), card("overnight/2026-11-02", 80), card("overnight/2026-11-02", 100, "gone")];
  const v = [card("v1/next", 24 * 60), card("v1/next", 24 * 60 + 40, "with", { level: "hard" }), card("v1/next", 24 * 60 + 200), card("v1/next", 48 * 60 + 30)];
  const a = [card(W("a0"), 24 * 60 + 60), card(W("a0"), 24 * 60 + 70, "against")];
  const b = [card(W("b0"), 24 * 60 + 120)];
  const c = [card(W("c0"), 48 * 60 + 10)];
  const cards = [m0, m1, ...o, ...v, ...a, ...b, ...c];
  const commits: ApiCommit[] = [
    cite(m0, 5, "m0"),
    cite(o[0]!, 62, "o1"), cite(o[1]!, 82, "o2"),
    // the overnight merge commit, in the ledger too: folded into its merge
    cite(o[0]!, 120, "omerge", "main"),
    cite(a[0]!, 24 * 60 + 61, "a1"), cite(a[1]!, 24 * 60 + 72, "a2"),
    // a fast-forward's tip, the merge's own commit
    cite(a[1]!, 24 * 60 + 90, "amerge"),
    cite(b[0]!, 24 * 60 + 121, "b1"),
    // a commit citing three cards: three entries, one commit
    cite(v[0]!, 24 * 60 + 300, "many", "v1/next"), cite(v[1]!, 24 * 60 + 300, "many", "v1/next"), cite(v[2]!, 24 * 60 + 300, "many", "v1/next"),
    // commits on a branch with no cards and no merge recorded
    cite(v[2]!, 24 * 60 + 210, "loose1", W("d0")), cite(v[2]!, 24 * 60 + 215, "loose2", W("d0")),
    cite(c[0]!, 48 * 60 + 11, "c1"),
  ];
  const merges = [
    merge("overnight/2026-11-02", "main", 120, o, "omerge"),
    merge(W("a0"), "v1/next", 24 * 60 + 90, a, "amerge"),
    merge(W("b0"), "v1/next", 24 * 60 + 130, b, "bmerge"),
    merge(W("c0"), "v1/next", 48 * 60 + 15, c, "cmerge"),
  ];
  return { state: { cards, commits, merges } satisfies BranchesState, now: T0 + (48 * 60 + 60) * 60_000, cards: { m0, m1, o, v, a, b, c } };
}

/** Real-like, plus four worktrees in parallel off v1/next (one still held by a waiting card) and a branch from two days back that never merged. */
function parallel() {
  const base = realLike();
  const s = base.state;
  const day = 48 * 60;
  // A: 19:05-20:50, B: 19:20-22:30, C: 19:40-20:10 (inside A and B), D: 20:00-now, held.
  const plan: [string, number[], number | null][] = [
    [W("p1"), [605, 630, 680], 710],
    [W("p2"), [620, 700, 770], 810],
    [W("p3"), [640, 655], 672],
    [W("p4"), [660, 725, 825], null],
  ];
  const cards = [...s.cards];
  const merges = [...s.merges];
  const commits = [...s.commits];
  plan.forEach(([b, times, m], i) => {
    const cs = times.map((t, k) => card(b, day + t, i === 3 && k === 1 ? "waiting" : i === 3 && k === 2 ? "held" : i === 1 && k === 1 ? "against" : "with"));
    cards.push(...cs);
    commits.push(cite(cs[0]!, day + times[0]! + 3, `p${i}c1`));
    if (m !== null) merges.push(merge(b, "v1/next", day + m, cs, `p${i}m`));
  });
  for (const t of [612, 648, 690, 740, 790, 840]) cards.push(card("v1/next", day + t));
  const old = [card("feature/import-old-decks", 300), card("feature/import-old-decks", 318, "waiting", { level: "hard" })];
  cards.push(...old);
  return { state: { cards, commits, merges } satisfies BranchesState, now: T0 + (day + 880) * 60_000 };
}

function noMainCards() {
  const a = [card("feature/a", 0), card("feature/a", 5)];
  const b = [card("feature/b", 60), card("feature/b", 70, "waiting", { level: "hard" })];
  return { state: { cards: [...a, ...b], commits: [], merges: [merge("feature/a", "main", 30, a, "fa")] } satisfies BranchesState, now: T0 + 200 * 60_000 };
}

function featureOnly() {
  return { state: { cards: [card("feature/login", 0), card("feature/login", 10, "waiting", { level: "hard" }), card("feature/login", 20, "waiting")], commits: [], merges: [] } satisfies BranchesState, now: T0 + 60 * 60_000 };
}

/** Six worktrees alive at once off v1, merged back newest-first. */
function sixParallel() {
  const cards = [card("main", 0), card("v1", 10)];
  const merges: ApiMerge[] = [];
  for (let k = 0; k < 6; k++) cards.push(card(`wt-${k}`, 20 + k), card(`wt-${k}`, 40 + k));
  cards.push(card("v1", 50));
  for (let k = 5; k >= 0; k--) merges.push(merge(`wt-${k}`, "v1", 60 + (5 - k) * 5, [], `w${k}`));
  cards.push(card("v1", 100));
  return { state: { cards, commits: [], merges } satisfies BranchesState, now: T0 + 400 * 60_000 };
}

/** 60 days, two worktrees a day off main. */
function big() {
  const cards = [card("main", 0)];
  const commits: ApiCommit[] = [];
  const merges: ApiMerge[] = [];
  for (let day = 0; day < 60; day++) {
    const m = day * 1440 + 600;
    for (let w = 0; w < 2; w++) {
      const b = `worktree-agent-${(day * 2 + w).toString(16).padStart(4, "0")}9f3e2a1`;
      const cs = Array.from({ length: 6 }, (_, k) => card(b, m + w * 25 + k * 10, day > 57 && k === 5 ? "waiting" : k === 2 ? "against" : "with"));
      cards.push(...cs);
      for (let k = 0; k < 4; k++) commits.push(cite(cs[k]!, m + w * 25 + k * 12 + 5, `k${day}-${w}-${k}`));
      if (day < 59) merges.push(merge(b, "main", m + 90 + w * 30, cs, `km${day}-${w}`));
    }
    for (let k = 0; k < 8; k++) cards.push(card("main", m + 200 + k * 7));
  }
  return { state: { cards, commits, merges } satisfies BranchesState, now: T0 + 60 * 1440 * 60_000 };
}

const model = (f: { state: BranchesState; now: number }) => branchModel(f.state, { nowMs: f.now });
const lane = (m: Model, name: string) => m.lanes.get(name)!;
const events = (rows: Row[]) => rows.filter((r): r is Extract<Row, { kind: "event" }> => r.kind === "event");
/** Each curve (a fork or a merge) that passes over a live branch between its two columns. */
function crossings(m: Model, rows: Row[]) {
  return events(rows)
    .filter((r) => r.e.kind === "fork" || r.e.kind === "merge")
    .flatMap((r) => {
      const [a, b] = [Math.min(r.col!, r.other!), Math.max(r.col!, r.other!)];
      return [...r.live].filter(([c]) => c > a && c < b).map(([, name]) => ({ curve: r.e, over: name }));
    });
}
const everything = new Set<string>();
const allOpen = (m: Model) => new Set(m.events.map((e) => new Date(e.t)).map((d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`));

describe("the ledger and names", () => {
  it("makes one commit of the ledger's entries per commit, its cards once each, at its earliest entry", () => {
    const c1 = card("main", 0);
    const c2 = card("main", 1);
    const out = commitsOf([cite(c1, 10, "x"), cite(c2, 9, "x"), cite(c1, 11, "x"), cite(c2, 20, "y")]);
    expect(out.map((c) => [c.short, c.cards, c.at])).toEqual([
      [sha("x").slice(0, 7), [c1.meta.id, c2.meta.id], at(9)],
      [sha("y").slice(0, 7), [c2.meta.id], at(20)],
    ]);
  });

  it("keeps the part of a long name that tells branches apart, and a word of what they share", () => {
    const s = shortNames(["worktree-agent-a0bd0dd57881ac741", "worktree-agent-a0bd0ee00000000", "worktree-agent-nocards590", "worktree-agent-nocards591", "feature/import-old-decks", "v1/next", "a-very-long-branch-name-with-no-family-at-all"]);
    expect(s.get("worktree-agent-a0bd0dd57881ac741")).toBe("worktree a0bd0dd");
    expect(s.get("worktree-agent-a0bd0ee00000000")).toBe("worktree a0bd0ee");
    expect(s.get("worktree-agent-nocards590")).not.toBe(s.get("worktree-agent-nocards591"));
    expect(s.get("worktree-agent-nocards590")).toMatch(/^worktree /);
    expect(s.get("feature/import-old-decks")).toBe("feature/import-old-decks");
    expect(s.get("v1/next")).toBe("v1/next");
    expect(s.get("a-very-long-branch-name-with-no-family-at-all")).toBe("a-very-long-bra…ily-at-all");
    expect(new Set(s.values()).size).toBe(s.size);
  });

  it("says what happened to each card, as its mark shows it, and which option it chose", () => {
    const now = T0;
    expect(markState(card("main", 0))).toBe("with");
    const against = card("main", 0, "against");
    expect(markState(against)).toBe("against");
    expect(chosenOf(against)).toBe("alternative");
    expect(saidOf(against, now).words).toBe("you chose “B”, not the agent's pick");
    expect(saidOf(card("main", 0), now).words).toBe("you chose “A”, the agent's pick");
    expect(chosenOf(card("main", 0))).toBe("proposal");
    expect(markState(card("main", 0, "gone"))).toBe("gone");
    expect(chosenOf(card("main", 0, "gone"))).toBeUndefined();
    expect(markState(card("main", 0, "deferred"))).toBe("aside");
    expect(saidOf(card("main", 0, "waiting"), now)).toEqual({ words: "waiting for you", tone: "waiting" });
  });
});

describe("what happened, by branch", () => {
  it("draws a history like this repo's: main the trunk, v1/next from it, every recorded merge ending its branch", () => {
    const f = realLike();
    const m = model(f);
    expect(m.trunk).toBe("main");
    expect(m.trunkKnown).toBe(false);
    expect(lane(m, "main").end.kind).toBe("trunk");
    expect([lane(m, "v1/next").parent, lane(m, "v1/next").parentWhy]).toEqual(["main", "guess"]);
    expect(m.merges).toHaveLength(4);
    expect(m.merges.every((x) => x.ends)).toBe(true);
    for (const b of ["overnight/2026-11-02", W("a0"), W("b0"), W("c0")]) expect(lane(m, b).end).toMatchObject({ kind: "merged" });
    expect([lane(m, W("a0")).parent, lane(m, W("a0")).parentWhy]).toEqual(["v1/next", "merged"]);
    // v1/next isn't merged: no merge recorded, every card answered. The default branch has no end.
    expect(endWords(lane(m, "v1/next"))).toBe("No merge recorded · every card answered");
    expect(endWords(lane(m, "main"))).toBe("");
  });

  it("puts every commit on its own branch, once, and folds a merge's own commit into the merge", () => {
    const m = model(realLike());
    // 14 ledger entries: 12 commits, two of them merges' own, one citing three cards.
    expect(m.counts.commits).toBe(12);
    expect(m.merges.filter((x) => x.own).map((x) => x.own!.short)).toEqual([sha("omerge").slice(0, 7), sha("amerge").slice(0, 7)]);
    const drawn = m.events.filter((e): e is Extract<Event, { kind: "commit" }> => e.kind === "commit");
    expect(drawn).toHaveLength(10);
    for (const e of drawn) expect(e.lane === null ? m.loose.branches.includes(e.commit.branch) : e.lane === e.commit.branch).toBe(true);
    const many = m.commitByHash.get(sha("many"))!;
    expect(many.cards).toHaveLength(3);
    // Branches with commits but no cards share the loose row; nothing is invented about them.
    expect(m.loose.branches).toEqual([W("d0")]);
    expect(m.lanes.has(W("d0"))).toBe(false);
    expect(m.counts.cited).toBe(10);
  });

  it("draws a detached HEAD's commit loose, never on the branch of the card it cites", () => {
    const f = card("feat", 10);
    const m = branchModel({ cards: [card("main", 0), f], commits: [cite(f, 12, "on-feat"), cite(f, 13, "detached", "detached-abc1234")], merges: [] }, { nowMs: T0 + 60 * 60_000 });
    expect(lane(m, "feat").commits.map((c) => c.short)).toEqual([sha("on-feat").slice(0, 7)]);
    expect(m.loose).toMatchObject({ branches: ["detached-abc1234"], commits: [{ short: sha("detached").slice(0, 7) }] });
    expect(m.lanes.has("detached-abc1234")).toBe(false);
  });

  it("never invents a merge: a commit made after a recorded merge keeps its branch open until a merge is recorded after it (B-w41p7)", () => {
    const a = [card(W("e0"), 0)];
    const base = [card("main", -10), ...a];
    const commits = [cite(a[0]!, 5, "e1"), cite(a[0]!, 6, "emerge"), cite(a[0]!, 6.4, "elater")];
    const first = merge(W("e0"), "main", 6, a, "emerge");
    const m1 = branchModel({ cards: base, commits, merges: [first] }, { nowMs: T0 + 60 * 60_000 });
    const L1 = lane(m1, W("e0"));
    expect(L1.end).toMatchObject({ kind: "open", waiting: 0 });
    expect(endWords(L1)).toMatch(/^No merge recorded after \w{3} \d{1,2} \w{3}, \d\d:\d\d · every card answered$/);
    expect(m1.merges[0]!.ends).toBe(false);
    // The later fast-forward, recorded: it ends the branch, after the commit it brought.
    const m2 = branchModel({ cards: base, commits, merges: [first, merge(W("e0"), "main", 7, a, "elater")] }, { nowMs: T0 + 60 * 60_000 });
    expect(lane(m2, W("e0")).end).toMatchObject({ kind: "merged", into: "main" });
    expect(m2.merges.map((x) => x.ends)).toEqual([false, true]);
    expect(m2.merges[1]!.own?.short).toBe(sha("elater").slice(0, 7));
  });

  it("puts a commit a merge says it brought before that merge, though its ledger entry was written after it (B-w41p7)", () => {
    const a = [card(W("f0"), 0)];
    const base = [card("main", -10), ...a];
    // git's time for the merge is 6:00; the hook wrote the ledger entry for the commit it brought at 6:04.
    const commits = [cite(a[0]!, 6 + 4 / 60, "fbrought")];
    const recorded = { ...merge(W("f0"), "main", 6, a, "fmerge"), tip: sha("fbrought"), commits: [sha("fbrought")] };
    const m = branchModel({ cards: base, commits, merges: [recorded] }, { nowMs: T0 + 60 * 60_000 });
    expect(lane(m, W("f0")).end).toMatchObject({ kind: "merged", into: "main" });
    expect(m.merges[0]!.ends).toBe(true);
    // Without the merge's list, the late entry keeps the branch open, as it did before B-w41p7.
    const old = branchModel({ cards: base, commits, merges: [merge(W("f0"), "main", 6, a, "fmerge")] }, { nowMs: T0 + 60 * 60_000 });
    expect(lane(old, W("f0")).end).toMatchObject({ kind: "open" });
  });

  it("counts the same merge found twice, with nothing on its branch between, once", () => {
    const f = card("feat", 10);
    const m = branchModel({ cards: [card("main", 0), f], commits: [], merges: [merge("feat", "main", 20, [f], "m1"), merge("feat", "main", 21, [f], "m2")] }, { nowMs: T0 + 60 * 60_000 });
    expect(m.merges).toHaveLength(1);
    expect(lane(m, "feat").end.kind).toBe("merged");
  });

  it("ends a branch merged into main when main has no cards, and holds one with a card waiting", () => {
    const m = model(noMainCards());
    expect(m.trunk).toBe("main");
    expect(lane(m, "main").cards).toHaveLength(0);
    expect(lane(m, "feature/a").end).toMatchObject({ kind: "merged", into: "main" });
    expect(lane(m, "feature/b").end).toMatchObject({ kind: "open", waiting: 1 });
    expect(statusOf(m).lead).toBe("One card is waiting for you, holding feature/b from merging.");
    expect(openingKey(m)).toBe(`card:${lane(m, "feature/b").cards[1]!.id}`);
  });

  it("has no trunk in a repo with only a feature branch, so the branch has an end", () => {
    const m = model(featureOnly());
    expect(m.trunk).toBeNull();
    expect(lane(m, "feature/login").end).toMatchObject({ kind: "open", waiting: 2 });
    expect(endWords(lane(m, "feature/login"))).toBe("No merge recorded · Merge held: 2 waiting");
    expect(statusOf(m).lead).toBe("Two cards are waiting for you, holding feature/login from merging.");
  });

  it("takes the trunk from the state's default branch when it says one (B-jr8mk), else main, master, then the longest-lived branch merged into", () => {
    const d = [card("develop", 0), card("main", 5), card("develop", 50)];
    const f = card("feat", 10);
    const merges = [merge("feat", "develop", 20, [f], "fd")];
    const said = branchModel({ cards: [...d, f], commits: [], merges, defaultBranch: "develop" }, { nowMs: T0 + 60 * 60_000 });
    expect([said.trunk, said.trunkKnown]).toEqual(["develop", true]);
    expect(lane(said, "develop").end.kind).toBe("trunk");
    // main is just a branch here: it gets an end.
    expect(lane(said, "main").end.kind).toBe("open");
    const guessed = branchModel({ cards: [...d, f], commits: [], merges }, { nowMs: T0 + 60 * 60_000 });
    expect([guessed.trunk, guessed.trunkKnown]).toEqual(["main", false]);
    const master = branchModel({ cards: [card("master", 0), card("trunk-ish", 1)], commits: [], merges: [] }, { nowMs: T0 });
    expect(master.trunk).toBe("master");
    // Neither: the longest-lived branch that others merged into and that never merged anywhere.
    const g = [card("feat", 10), card("fix", 30)];
    const longest = branchModel({ cards: [card("develop", 0), card("release", 15), ...g, card("develop", 90)], commits: [], merges: [merge("feat", "develop", 20, [g[0]!], "1"), merge("fix", "release", 40, [g[1]!], "2")] }, { nowMs: T0 + 2 * 3600_000 });
    expect(longest.trunk).toBe("develop");
    // A default branch with nothing on it: no trunk drawn, and every branch has an end.
    const none = branchModel({ cards: [card("feat", 0)], commits: [], merges: [], defaultBranch: "main" }, { nowMs: T0 });
    expect([none.trunk, lane(none, "feat").end.kind]).toEqual([null, "open"]);
  });

  it("keeps a branch going past a merge it carried on after; a sync from the trunk ends nothing; a parent cycle is broken", () => {
    const f1 = card("feat", 10);
    const f2 = card("feat", 40);
    const m = branchModel({ cards: [card("main", 0), f1, f2], commits: [], merges: [merge("feat", "main", 20, [f1], "1"), merge("main", "feat", 30, [], "2")] }, { nowMs: T0 + 60 * 60_000 });
    expect(lane(m, "feat").end).toMatchObject({ kind: "open" });
    expect(lane(m, "main").end.kind).toBe("trunk");
    expect(m.merges.map((x) => x.ends)).toEqual([false, false]);
    const x = card("x", 0);
    const y = card("y", 1);
    const c = branchModel({ cards: [card("main", -5), x, y, card("x", 30), card("y", 31)], commits: [], merges: [merge("x", "y", 10, [x], "3"), merge("y", "x", 20, [y], "4")] }, { nowMs: T0 + 60 * 60_000 });
    for (const name of ["x", "y"]) {
      const seen = new Set<string>();
      for (let p: string | null = name; p; p = lane(c, p).parent) {
        expect(seen.has(p)).toBe(false);
        seen.add(p);
      }
    }
  });

  it("never draws a branch from one that had already merged away", () => {
    const a = [card("feat-a", 10), card("feat-a", 12)];
    const b = [card("feat-b", 30)];
    const m = branchModel({ cards: [card("main", 0), ...a, ...b], commits: [], merges: [merge("feat-a", "main", 20, a, "1")] }, { nowMs: T0 + 60 * 60_000 });
    expect(lane(m, "feat-b").parent).toBe("main");
  });

  it("opens with the right words", () => {
    const m = model(realLike());
    expect(statusOf(m)).toMatchObject({
      lead: "Nothing is waiting for you.",
      body: "13 cards on 6 branches: you chose otherwise than the agent on 2, and 1 was withdrawn. Four branches have merged.",
      cites: "12 commits cite 10 of the cards; 1 more branch has commits but no cards.",
    });
    expect(statusOf(m).open.map((L) => L.name)).toEqual(["v1/next"]);
    const agreed = branchModel({ cards: [card("main", 0), card("main", 1)], commits: [], merges: [] }, { nowMs: T0 });
    expect(statusOf(agreed).body).toBe("2 cards on 1 branch: you chose the agent's pick on every one you answered.");
    expect(statusOf(branchModel({ cards: [], commits: [], merges: [] }, { nowMs: T0 })).lead).toBe("No cards yet.");
  });

  it("links a card to the commits that cite it, a merge's own commit to the merge, and a commit to its cards (B-vfdhz)", () => {
    const f = realLike();
    const m = model(f);
    const a1 = f.cards.a[1]!.meta.id;
    const own = m.merges.find((x) => x.branch === W("a0"))!;
    expect(linkedKeys(m, `card:${a1}`)).toEqual([`commit:${sha("a2")}`, own.key]);
    expect(linkedKeys(m, `commit:${sha("many")}`)).toEqual(f.cards.v.slice(0, 3).map((c) => `card:${c.meta.id}`));
    expect(linkedKeys(m, own.key).sort()).toEqual(f.cards.a.map((c) => `card:${c.meta.id}`).sort());
    expect(linkedKeys(m, null)).toEqual([]);
  });
});

describe("the gutter's columns (B-tgq5p)", () => {
  it("puts the trunk first, its branches next, and reuses a column once its branch has merged", () => {
    const m = model(realLike());
    const c = columnsOf(m);
    expect(c.get("main")).toBe(0);
    expect(c.get("overnight/2026-11-02")).toBe(1);
    expect(c.get("v1/next")).toBe(1);
    // The worktrees one after another: each takes v1/next's next column, free again once the last one merged.
    expect([W("a0"), W("b0"), W("c0")].map((b) => c.get(b))).toEqual([2, 2, 2]);
    const P = listRows(m, c, { commits: false, open: allOpen(m) });
    expect(P.cols).toBe(3);
    expect(crossings(m, P.rows)).toEqual([]);
  });

  it("keeps parallel branches in fixed columns, shortest nearest, open and held ones outermost, with few crossings and each where times overlap", () => {
    const m = model(parallel());
    const c = columnsOf(m);
    const p = [W("p1"), W("p2"), W("p3"), W("p4")].map((b) => c.get(b)!);
    expect(new Set(p).size).toBe(4);
    // p3 lies inside p1's and p2's time: nearest v1/next. p4, still open, is outermost of them.
    expect(p[2]).toBe(Math.min(...p));
    expect(p[3]).toBe(Math.max(...p));
    const P = listRows(m, c, { commits: true, open: allOpen(m) });
    const x = crossings(m, P.rows);
    expect(x.length).toBeLessThanOrEqual(4);
    // Each crossing is between two branches alive at once, neither inside the other's time.
    const span = (name: string) => {
      const L = lane(m, name);
      return [L.first, L.end.kind === "merged" ? L.end.merge.t : Infinity];
    };
    for (const { curve, over } of x) {
      const own = curve.kind === "fork" ? curve.lane : curve.kind === "merge" ? curve.lane : "";
      const [a0, a1] = span(own);
      const [b0, b1] = span(over);
      expect(a0! < b1! && b0! < a1!).toBe(true);
    }
  });

  it("gives six branches alive at once six columns, with no curve over a live branch", () => {
    const m = model(sixParallel());
    const c = columnsOf(m);
    expect(new Set(Array.from({ length: 6 }, (_, k) => c.get(`wt-${k}`))).size).toBe(6);
    const P = listRows(m, c, { commits: false, open: allOpen(m) });
    expect(P.cols).toBe(8);
    expect(crossings(m, P.rows)).toEqual([]);
  });

  it("lays out 60 days quickly, in three columns", () => {
    const f = big();
    const t0 = performance.now();
    const m = model(f);
    const c = columnsOf(m);
    const P = listRows(m, c, { commits: false, open: everything });
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(Math.max(...c.values()) + 1).toBeLessThanOrEqual(3);
    // Only the latest day, and the days with a card waiting, are unfolded.
    expect(P.rows.filter((r) => r.kind === "fold").length).toBeGreaterThan(50);
  });
});

describe("the list's rows", () => {
  it("opens with the branches still open, newest first, and folds the days before the latest", () => {
    const m = model(realLike());
    const c = columnsOf(m);
    const P = listRows(m, c, { commits: false, open: new Set() });
    expect(P.rows[0]).toMatchObject({ kind: "now", tags: ["v1/next"] });
    expect(P.rows.filter((r) => r.kind === "day")).toHaveLength(3);
    expect(P.rows.filter((r) => r.kind === "fold")).toHaveLength(2);
    // Newest first.
    const ts = events(P.rows).map((r) => r.t);
    expect(ts).toEqual([...ts].sort((a, b) => b - a));
    // With the Commits switch off, no commit has a row.
    expect(events(P.rows).some((r) => r.e.kind === "commit")).toBe(false);
    const all = listRows(m, c, { commits: true, open: allOpen(m) });
    expect(events(all.rows).filter((r) => r.e.kind === "commit")).toHaveLength(10);
    // A loose commit has no column of its own: it's drawn in the one after the lanes.
    expect(all.loose).toBe(true);
    expect(events(all.rows).filter((r) => r.e.kind === "commit" && r.col === null)).toHaveLength(2);
  });

  it("never folds a day with a card waiting or held back, and caps a column whose branch changes across a fold", () => {
    const m = model(parallel());
    const c = columnsOf(m);
    const P = listRows(m, c, { commits: false, open: new Set() });
    const shown = new Set(events(P.rows).flatMap((r) => (r.e.kind === "card" ? [r.e.card.id] : [])));
    const pending = m.cards.filter((x) => x.state === "waiting" || x.state === "aside");
    expect(pending.length).toBe(3);
    for (const x of pending) expect(shown.has(x.id)).toBe(true);
    // The first day folds: overnight merged into main during it, so main's next column changes hands within it.
    const fold = P.rows.find((r): r is Extract<Row, { kind: "fold" }> => r.kind === "fold")!;
    expect(fold).toBeDefined();
    expect([...fold.top].some(([col, name]) => fold.bottom.get(col) !== name) || [...fold.bottom].some(([col, name]) => fold.top.get(col) !== name)).toBe(true);
  });

  it("gives an idle branch's end a row of its own, just above its last event, and frees its column", () => {
    const m = model(parallel());
    const L = lane(m, "feature/import-old-decks");
    expect(L.end).toMatchObject({ kind: "open", waiting: 1 });
    expect(L.end.kind === "open" && L.end.idleSince).toBe(L.last);
    const c = columnsOf(m);
    const P = listRows(m, c, { commits: false, open: allOpen(m) });
    const i = P.rows.findIndex((r) => r.kind === "end" && r.lane === L.name);
    expect(i).toBeGreaterThan(0);
    const next = P.rows[i + 1]!;
    expect(next.kind === "event" && next.e.kind === "card" && next.e.card.branch === L.name).toBe(true);
    // Not among "Now"'s open branches.
    expect((P.rows[0] as Extract<Row, { kind: "now" }>).tags).not.toContain(L.name);
  });

  it("folds a run of cards the filter hides into one row, which holds no card it matches", () => {
    const m = model(realLike());
    const c = columnsOf(m);
    const against = (x: { state: string }) => x.state === "against";
    const P = listRows(m, c, { commits: false, filter: against, open: new Set() });
    const more = P.rows.filter((r): r is Extract<Row, { kind: "more" }> => r.kind === "more");
    expect(more.length).toBeGreaterThan(0);
    for (const r of more) for (const k of r.keys) if (k.startsWith("card:")) expect(against(m.cardById.get(k.slice(5))!)).toBe(false);
    // Days with a match aren't folded.
    const matched = events(P.rows).filter((r) => r.e.kind === "card");
    expect(matched.map((r) => r.e.kind === "card" && r.e.card.state)).toEqual(["against", "against"]);
  });

  it("marks where a branch began as a guess unless it merged into its parent", () => {
    const m = model(realLike());
    const forks = m.events.filter((e): e is Extract<Event, { kind: "fork" }> => e.kind === "fork");
    expect(forks.find((e) => e.lane === "v1/next")).toMatchObject({ from: "main", guess: true });
    expect(forks.find((e) => e.lane === W("a0"))).toMatchObject({ from: "v1/next", guess: false });
    // A fork comes before its branch's first card.
    for (const e of forks) expect(e.t).toBeLessThanOrEqual(Math.min(...lane(m, e.lane).cards.map((x) => x.t)));
  });
});
