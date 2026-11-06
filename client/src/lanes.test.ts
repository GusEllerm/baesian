import { describe, expect, it } from "vitest";
import type { ApiCard, ApiCommit, ApiMerge } from "../../src/api";
import { type BranchesState, CHILD_Y, type Event, FORK_Y, MARK_Y, MIN_PITCH, type Model, NOW_Y, type Row, type Rows, SOURCE_Y, type Stroke, TARGET_Y, type Y, branchModel, chosenOf, columnsOf, commitsOf, dayKey, daysOf, endWords, gutterOf, linkedKeys, listRows, markState, openingKey, reachOf, saidOf, shortNames, statusOf, strokesOf } from "./lanes";

// D181 redrawn (B-v8jzy, B-vfdhz, B-tgq5p, B-jr8mk): the branches list's model, against hand-built states. The fixtures
// are the design loop's (its final/data.mjs), as typed builders: a history like this repo's (a trunk, v1/next, worktrees
// merged into it, merges' own commits in the ledger, commits on branches with no cards), parallel worktrees with held and
// unmerged branches, no cards on main, a repo with only a feature branch, six worktrees alive at once, and 60 days.

const T0 = Date.parse("2026-11-02T09:00:00.000Z");
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();
const sha = (s: string) => (s + "0123456789abcdef".repeat(3)).slice(0, 40);

let n = 0;
type St = "with" | "against" | "waiting" | "held" | "deferred" | "gone" | "returned" | "rerouted";
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
    verdicts: st === "with" ? verdict("accept") : st === "against" ? verdict("alternative") : st === "returned" ? verdict("reject") : [],
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

/**
 * Real-like, plus four worktrees in parallel off v1/next (one still held by a waiting card) and a branch from two days
 * back that never merged, a card on it waiting for you (or, `answered`, every card on it answered).
 */
function parallel(o: { answered?: boolean } = {}) {
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
  const old = [card("feature/import-old-decks", 300), card("feature/import-old-decks", 318, o.answered ? "with" : "waiting", { level: "hard" })];
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

  it("keeps seven characters of a hex ID, and whole words of a name made of words, up to 28 characters (B-my3az)", () => {
    const s = shortNames([
      "feature/checkout-and-payments-refactor",
      "feature/search-results-page",
      "feature/import_old_decks_from_the_first_format",
      "gus/rework-the-onboarding-flow-for-teams-a",
      "gus/rework-the-onboarding-flow-for-teams-b",
      "worktree-agent-a0bd0dd57881ac741",
      "worktree-agent-acdb431292060ac18",
      "worktree-wf_7ec3a0ab-1e8-8",
    ]);
    // Words: whole ones, as many as fit in 28 characters, then "…"; never cut in the middle of one.
    expect(s.get("feature/checkout-and-payments-refactor")).toBe("feature checkout-and-payments…");
    expect(s.get("feature/search-results-page")).toBe("feature search-results-page");
    expect(s.get("feature/import_old_decks_from_the_first_format")).toBe("feature import_old_decks_from_the…");
    // Two that would read the same keep a word more each, until they don't.
    expect(s.get("gus/rework-the-onboarding-flow-for-teams-a")).toBe("gus rework-the-onboarding-flow-for-teams-a");
    expect(s.get("gus/rework-the-onboarding-flow-for-teams-b")).toBe("gus rework-the-onboarding-flow-for-teams-b");
    // A hex ID: seven characters, as before; a name with an ID among words is words.
    expect(s.get("worktree-agent-a0bd0dd57881ac741")).toBe("worktree a0bd0dd");
    expect(s.get("worktree-wf_7ec3a0ab-1e8-8")).toBe("worktree wf_7ec3a0ab-1e8-8");
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
    // A choice you answered in chat, confirmed with one tap (B-hswmx).
    const chat = card("main", 0, "with", { answered_in_chat: "A, please" });
    chat.verdicts = chat.verdicts.map((v) => ({ ...v, seen: true as const }));
    expect(saidOf(chat, now)).toEqual({ words: "you confirmed “A”, your answer in chat", tone: "with" });
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
    // The trunk never began from another branch: a merge into it, with nothing on it before, is a merge (B-c4efj).
    expect(m.starts).toEqual([]);
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

  it("takes a branch brought up to another's tip before any work of its own as where it began, from that branch, once: no merge (B-c4efj)", () => {
    const f = startThenBack();
    const m = model(f);
    const start = f.state.merges[0]!;
    // The record is a start, not a merge: no merge row, no arrowhead, and v1 merged into nothing.
    expect(m.starts.map((x) => `${x.branch}>${x.into}`)).toEqual(["v1>wt"]);
    expect(m.merges.map((x) => `${x.branch}>${x.into}`)).toEqual(["wt>v1"]);
    expect(m.events.filter((e) => e.kind === "merge")).toHaveLength(1);
    const wt = lane(m, "wt");
    expect([wt.parent, wt.parentWhy, wt.began?.commit]).toEqual(["v1", "began", start.commit]);
    // Its start is drawn once, recorded (not a guess), where the record has it: before its first commit.
    const forks = m.events.filter((e): e is Extract<Event, { kind: "fork" }> => e.kind === "fork" && e.lane === "wt");
    expect(forks).toHaveLength(1);
    expect(forks[0]).toMatchObject({ from: "v1", guess: false, t: Date.parse(start.at) + 999 });
    expect(forks[0]!.t).toBeLessThan(wt.commits[0]!.t);
    expect(lane(m, "v1").out).toEqual([]);
    expect(endWords(lane(m, "v1"))).toBe("No merge recorded · every card answered");
    // A merge into a branch with work of its own before it is still a merge.
    const s = syncThenBack();
    const ms = model(s);
    expect(ms.starts).toEqual([]);
    expect(ms.merges.map((x) => `${x.branch}>${x.into}`)).toEqual(["v1>wt", "wt>v1"]);
    expect(lane(ms, "wt").parentWhy).toBe("merged");
  });

  it("puts a start a record places after a merge into its parent in the same second, at the commit that merge made (B-c4efj)", () => {
    const m = model(sharedCommit());
    expect(m.starts.map((x) => `${x.branch}>${x.into}`)).toEqual(["v1>wt-b"]);
    const order = m.events.filter((e) => e.kind === "merge" || e.kind === "fork").map((e) => (e.kind === "merge" ? `${e.lane}>${e.into}` : `fork ${e.from}>${e.lane}`));
    expect(order.indexOf("fork v1>wt-b")).toBe(order.indexOf("wt-a>v1") + 1);
    // v1 isn't ended by it: nothing merged it anywhere.
    expect(lane(m, "v1").end).toMatchObject({ kind: "open" });
    // A branch with commits and a start, but no card and no merge yet, is loose, as any branch with commits alone.
    const alone = model(syncAtTheMergeCommit());
    expect([alone.lanes.has("wt-b"), alone.loose.branches]).toEqual([false, ["wt-b"]]);
    expect(lane(alone, "v1").end).toMatchObject({ kind: "open" });
  });

  it("never ends a branch with a merge into one that began from it: it keeps its Now tag and its children, and isn't merged (B-9v07y)", () => {
    const m = model(quietAfterSync());
    const sync = m.merges.find((x) => x.branch === "v1" && x.into === "wt")!;
    expect([sync.sync, sync.ends]).toEqual([true, false]);
    const v1 = lane(m, "v1");
    expect(v1.end).toMatchObject({ kind: "open", idleSince: null });
    // Its end words don't cite the sync; it's still its children's parent, and isn't counted as merged.
    expect(endWords(v1)).toBe("No merge recorded · every card answered");
    expect([v1.parent, lane(m, "wt").parent, lane(m, "wt2").parent]).toEqual(["main", "v1", "v1"]);
    expect(m.counts.merged).toBe(0);
    const P = listRows(m, columnsOf(m), { commits: false, open: allOpen(m) });
    expect((P.rows[0] as Extract<Row, { kind: "now" }>).tags).toContain("v1");
    // Any other last merge out ends its branch, as before.
    const back = model(syncThenBack());
    expect(lane(back, "wt").end).toMatchObject({ kind: "merged", into: "v1" });
    expect(back.merges.find((x) => x.branch === "v1")!.sync).toBe(true);
  });

  it("opens with the right words", () => {
    const m = model(realLike());
    expect(statusOf(m)).toMatchObject({
      lead: "Nothing is waiting for you.",
      body: "13 cards on 6 branches: you chose otherwise than the agent on 2, and 1 was withdrawn. Four branches have merged.",
      cites: "12 commits cite 10 of the cards; 1 more branch has commits but no cards.",
    });
    expect(statusOf(m).open.map((L) => L.name)).toEqual(["v1/next"]);
    // Branches merged count those with commits but no cards too, and say so, however many (B-zshw5).
    const bare = (k: number, withCards = 0) => {
      const m0 = card("main", 0);
      const cs = Array.from({ length: withCards }, (_, i) => card(`wt-c${i}`, 5 + i));
      const commits = Array.from({ length: k }, (_, i) => cite(m0, 10 + i, `b${i}`, `wt-b${i}`));
      const merges = [...cs.map((c, i) => merge(`wt-c${i}`, "main", 30 + i, [c], `mc${i}`)), ...Array.from({ length: k }, (_, i) => ({ ...merge(`wt-b${i}`, "main", 40 + i, [], `mb${i}`), commits: [sha(`b${i}`)] }))];
      return statusOf(branchModel({ cards: [m0, ...cs], commits, merges }, { nowMs: T0 + 60 * 60_000 })).body.replace(/^.*?\. /, "");
    };
    expect(bare(2, 1)).toBe("Three branches have merged, 2 of them with commits but no cards.");
    expect(bare(1, 2)).toBe("Three branches have merged, 1 of them with commits but no cards.");
    expect(bare(1)).toBe("One branch has merged, with commits but no cards.");
    expect(bare(2)).toBe("Two branches have merged, both with commits but no cards.");
    expect(bare(3)).toBe("Three branches have merged, all with commits but no cards.");
    expect(bare(0, 1)).toBe("One branch has merged.");
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

  it("gives an idle branch with every card answered an end row of its own, just above its last event, and frees its column", () => {
    const m = model(parallel({ answered: true }));
    const L = lane(m, "feature/import-old-decks");
    expect(L.end).toMatchObject({ kind: "open", waiting: 0, down: true });
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

  it("keeps a branch with a card waiting for you at the top however long it's idle; one returned to its agent doesn't (B-srtcs)", () => {
    const m = model(parallel());
    const L = lane(m, "feature/import-old-decks");
    expect(L.end).toMatchObject({ kind: "open", waiting: 1, idleSince: L.last, down: false });
    expect(endWords(L)).toMatch(/^No merge recorded · Merge held: 1 waiting · idle since \w{3} \d{1,2} \w{3}$/);
    const P = listRows(m, columnsOf(m), { commits: false, open: allOpen(m) });
    const now = P.rows[0] as Extract<Row, { kind: "now" }>;
    expect(now.tags).toContain(L.name);
    // No end row of its own: its line runs on to the top, in a column of its own.
    expect(P.rows.some((r) => r.kind === "end" && r.lane === L.name)).toBe(false);
    expect([...now.live.values()]).toContain(L.name);
    expect(checkGutter(m, P)).toEqual([]);
    // A card returned to its agent holds the merge, but isn't waiting for you: its end moves down after a day.
    const old = [card("old", 0), card("old", 10, "returned")];
    const r = branchModel({ cards: [card("main", -10), ...old, card("main", 2000)], commits: [], merges: [] }, { nowMs: T0 + 48 * 3600_000 });
    expect(lane(r, "old").end).toMatchObject({ kind: "open", waiting: 1, down: true });
  });

  it("names the Now row's day when it isn't the newest day shown (B-srtcs)", () => {
    const quiet = model(idleParent());
    expect((listRows(quiet, columnsOf(quiet), { commits: false, open: new Set() }).rows[0] as Extract<Row, { kind: "now" }>).dated).toBe(true);
    const busy = model(realLike());
    expect((listRows(busy, columnsOf(busy), { commits: false, open: new Set() }).rows[0] as Extract<Row, { kind: "now" }>).dated).toBe(false);
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

// ------------------------------------------------------------------------------------------------ the gutter's invariants

// The bug sweep of 2026-11-05 found lines that broke where two rows shared an instant, a branch's first card floating above
// its fork, a filter's folded run dropping a line, a fork from a line that had ended, an idle branch with no end, and two
// ends for one. Each is a break in one of these rules, checked over what every row's gutter draws (`strokesOf()`, which
// `<BranchesDrawer />` draws exactly), for every fixture, with commits on and off, with and without a filter, folded and
// open. A gap under a curve's halo is paint, not a break: the line goes on under it.

/** A position down a row, comparable: px from its top; a fold's 38% and 62% between its top and bottom; its bottom last. */
const yOf = (y: Y) => (y === "100%" ? Number.POSITIVE_INFINITY : y === "38%" ? 1e6 : y === "62%" ? 1e6 + 1 : y);
const ends = (s: Stroke[], edge: "top" | "bottom") => new Set(s.flatMap((x) => (x.k === "line" && (edge === "top" ? yOf(x.y1) === 0 : yOf(x.y2) === Number.POSITIVE_INFINITY) ? [`${x.col}:${x.lane}`] : [])));

/**
 * Every break in the gutter's rules: a line that stops at a row's edge with nothing going on across it, or starts there
 * from nothing; a line that starts or stops inside a row with no mark, cap or curve there; a curve or arrowhead that
 * doesn't sit on its branch's line, or its target's; two branches in one column at once; and a branch that began at a fork
 * running off the bottom of the list.
 */
function checkGutter(m: Model, P: Rows): string[] {
  const drawn = P.rows.flatMap((r) => {
    const s = strokesOf(r, P, m);
    return s ? [{ r, s }] : [];
  });
  const out: string[] = [];
  const lines = (s: Stroke[]) => s.filter((x): x is Extract<Stroke, { k: "line" }> => x.k === "line");
  const on = (s: Stroke[], col: number, lane: string, y: number) => lines(s).some((x) => x.col === col && x.lane === lane && yOf(x.y1) <= y && y <= yOf(x.y2));
  for (let i = 0; i < drawn.length; i++) {
    const { r, s } = drawn[i]!;
    // Two branches in one column at once.
    const ls = lines(s);
    for (const a of ls) for (const b of ls) if (a.col === b.col && a.lane < b.lane && yOf(a.y1) < yOf(b.y2) && yOf(b.y1) < yOf(a.y2)) out.push(`${r.key}: ${a.lane} and ${b.lane} share column ${a.col}`);
    // A line that starts or stops inside the row does so at a mark, a cap, a curve's end, or the Now row's heading.
    const node = (col: number, y: number, lane: string) =>
      (r.kind === "now" && y === NOW_Y) ||
      s.some(
        (x) =>
          (x.k === "mark" && x.col === col && x.lane === lane && y === MARK_Y) ||
          (x.k === "cap" && x.col === col && x.lane === lane && yOf(x.y) === y) ||
          (x.k === "fork" && ((x.from === col && x.parent === lane && y === FORK_Y) || (x.to === col && x.lane === lane && y === CHILD_Y))) ||
          (x.k === "merge" && ((x.from === col && x.lane === lane && y === SOURCE_Y) || (x.to === col && x.into === lane && y === TARGET_Y))),
      );
    for (const x of lines(s)) {
      for (const y of [yOf(x.y1), yOf(x.y2)]) {
        if (y === 0 || y === Number.POSITIVE_INFINITY) continue;
        const joined = lines(s).some((o) => o !== x && o.col === x.col && o.lane === x.lane && (yOf(o.y1) === y || yOf(o.y2) === y));
        if (!node(x.col, y, x.lane) && !joined) out.push(`${r.key}: ${x.lane}'s line ends in mid-air at ${y}px`);
      }
    }
    // Curves on their branches' columns; an arrowhead only into its target's line.
    for (const x of s) {
      if (x.k === "fork") {
        if (!on(s, x.from, x.parent, FORK_Y)) out.push(`${r.key}: the fork leaves column ${x.from}, where ${x.parent} isn't drawn`);
        if (!on(s, x.to, x.lane, CHILD_Y)) out.push(`${r.key}: the fork reaches column ${x.to}, where ${x.lane} isn't drawn`);
      }
      if (x.k === "merge") {
        if (!on(s, x.from, x.lane, SOURCE_Y)) out.push(`${r.key}: the merge leaves column ${x.from}, where ${x.lane} isn't drawn`);
        if (!on(s, x.to, x.into, TARGET_Y)) out.push(`${r.key}: the arrowhead is in column ${x.to}, where ${x.into} isn't drawn`);
      }
    }
    // Row edges: what reaches the bottom of one row goes on at the top of the next.
    const next = drawn[i + 1];
    const bottom = ends(s, "bottom");
    if (!next) {
      for (const k of bottom) {
        const lane = k.slice(k.indexOf(":") + 1);
        if (m.lanes.get(lane)?.parent && lane !== m.trunk) out.push(`${r.key}: ${lane} began at a fork, but runs off the bottom of the list`);
      }
      continue;
    }
    const top = ends(next.s, "top");
    for (const k of bottom) if (!top.has(k)) out.push(`${r.key}: ${k} stops at its bottom edge, and ${next.r.key} doesn't go on with it`);
    for (const k of top) if (!bottom.has(k)) out.push(`${next.r.key}: ${k} starts at its top edge from nothing (${r.key} above)`);
  }
  return out;
}

/** Every way the list is drawn: commits on and off, every card or one filter, every day folded but the latest or all open. */
function everyWay(f: { state: BranchesState; now: number }) {
  const m = branchModel(f.state, { nowMs: f.now });
  const cols = columnsOf(m);
  const out: { how: string; m: Model; P: Rows }[] = [];
  for (const commits of [false, true])
    for (const filter of [undefined, "against", "hard"] as const)
      for (const open of ["folded", "open"] as const) {
        const test = filter === "against" ? (c: { state: string }) => c.state === "against" : filter === "hard" ? (c: { hard: boolean }) => c.hard : undefined;
        const P = listRows(m, cols, { commits, filter: test as never, open: open === "open" ? allOpen(m) : new Set() });
        out.push({ how: `commits ${commits ? "on" : "off"}, ${filter ?? "every card"}, ${open}`, m, P });
      }
  return out;
}

/**
 * Two records at one commit, in one second, as 952d56b has them: one worktree merged in, and the next brought up to it as
 * it began, before any work of its own (a start, B-c4efj), which later merges back.
 */
function sharedCommit() {
  const v = [card("v1", 5), card("v1", 10)];
  const commits = [cite(v[0]!, 12, "a1", "wt-a"), cite(v[1]!, 45, "b1", "wt-b")];
  const merges = [{ ...merge("wt-a", "v1", 30, [], "X"), tip: sha("a1"), commits: [sha("a1")] }, merge("v1", "wt-b", 30, v, "X"), { ...merge("wt-b", "v1", 50, [], "bm"), tip: sha("b1"), commits: [sha("b1")] }];
  return { state: { cards: [card("main", 0), ...v, card("v1", 60)], commits, merges } satisfies BranchesState, now: T0 + 90 * 60_000 };
}
/** Two branches whose first cards were filed in the same minute, and two merges into main in one second. */
function sameStart() {
  const a = [card("feat-a", 10), card("feat-a", 20)];
  const b = [card("feat-b", 10), card("feat-b", 25)];
  return { state: { cards: [card("main", 0), ...a, ...b, card("main", 40)], commits: [], merges: [merge("feat-a", "main", 30, a, "ma"), merge("feat-b", "main", 30, b, "mb")] } satisfies BranchesState, now: T0 + 60 * 60_000 };
}
/** A branch guessed to begin from one that has since gone idle: old's last card is before new began. */
function idleParent() {
  return { state: { cards: [card("main", -300), card("old", 0), card("old", 30), card("old", 60), card("new", 120), card("new", 130)], commits: [], merges: [] } satisfies BranchesState, now: T0 + 30 * 3600_000 };
}
/** An idle branch whose last event is a commit, which the Commits switch hides. */
function idleLastCommit() {
  const o = [card("old", 0), card("old", 10)];
  return { state: { cards: [card("main", -10), ...o, card("main", 2000)], commits: [cite(o[1]!, 40, "late")], merges: [] } satisfies BranchesState, now: T0 + 48 * 3600_000 };
}
/** An idle branch, a card of which a filter hides, as a run that would span its end. */
function moreOverEnd() {
  return { state: { cards: [card("main", -10), card("old", 30, "against"), card("old", 40), card("main", 50)], commits: [], merges: [] } satisfies BranchesState, now: T0 + 48 * 3600_000 };
}
/** An idle branch whose last second holds two merges into it, at one commit. */
function twoMergesAtTheEnd() {
  const fa = [card("feat-a", 3)];
  const fb = [card("feat-b", 4)];
  return { state: { cards: [card("main", -10), card("dev", 1), card("dev", 2), ...fa, ...fb], commits: [], merges: [merge("feat-a", "dev", 10, fa, "oct"), merge("feat-b", "dev", 10, fb, "oct")] } satisfies BranchesState, now: T0 + 3 * 24 * 3600_000 };
}
/** A new worktree brought up to v1 before any work of its own (a start, B-c4efj: G-1's records), which then merges back. */
function startThenBack() {
  const v = [card("v1", 5), card("v1", 10)];
  return { state: { cards: [card("main", 0), ...v, card("v1", 50)], commits: [cite(v[0]!, 30, "w1", "wt")], merges: [merge("v1", "wt", 20, v, "v1tip"), { ...merge("wt", "v1", 40, [], "wm"), tip: sha("w1"), commits: [sha("w1")] }] } satisfies BranchesState, now: T0 + 90 * 60_000 };
}
/** v1 merged into a worktree with work of its own (a sync, B-9v07y), which then merges back. */
function syncThenBack() {
  const v = [card("v1", 5), card("v1", 10)];
  const commits = [cite(v[0]!, 15, "w0", "wt"), cite(v[0]!, 30, "w1", "wt")];
  return { state: { cards: [card("main", 0), ...v, card("v1", 50)], commits, merges: [merge("v1", "wt", 20, v, "v1tip"), { ...merge("wt", "v1", 40, [], "wm"), tip: sha("w1"), commits: [sha("w0"), sha("w1")] }] } satisfies BranchesState, now: T0 + 90 * 60_000 };
}
/**
 * v1 merged into a worktree that began from it (its commits cite v1's cards), and quiet after (B-9v07y); a second worktree
 * begins from v1 after the sync.
 */
function quietAfterSync() {
  const v = [card("v1", 5), card("v1", 10)];
  const commits = [cite(v[0]!, 15, "w0", "wt"), cite(v[1]!, 61, "x0", "wt2")];
  return { state: { cards: [card("main", 0), ...v, card("wt", 50), card("wt2", 60)], commits, merges: [merge("v1", "wt", 30, v, "sync")] } satisfies BranchesState, now: T0 + 90 * 60_000 };
}
/**
 * As this repo stood at 15:20 on 2026-11-05: a worktree merged into v1 at a commit, and in the same second (as the record
 * has it) a new worktree brought up to v1 at that commit, before any work of its own: where it began (B-c4efj).
 */
function syncAtTheMergeCommit() {
  const v = [card("v1", 5), card("v1", 10)];
  const commits = [cite(v[0]!, 12, "a1", "wt-a"), cite(v[1]!, 45, "b1", "wt-b")];
  const merges = [{ ...merge("wt-a", "v1", 30, [], "X"), tip: sha("a1"), commits: [sha("a1")] }, merge("v1", "wt-b", 30, v, "X")];
  return { state: { cards: [card("main", 0), ...v], commits, merges } satisfies BranchesState, now: T0 + 90 * 60_000 };
}
/**
 * `k` branches open at once off main, merged back newest first, with commits citing their cards; then a quiet day after,
 * main's alone (B-cjqxz: a column for each, and the gutter as wide as that only that day).
 */
function manyParallel(k: number) {
  const cards = [card("main", 0)];
  const commits: ApiCommit[] = [];
  const merges: ApiMerge[] = [];
  for (let i = 0; i < k; i++) {
    const cs = [card(`wt-${i}`, 10 + i), card(`wt-${i}`, 40 + i, i % 3 ? "with" : "against")];
    cards.push(...cs);
    commits.push(cite(cs[0]!, 12 + i, `p${k}-${i}`));
  }
  for (let i = k - 1; i >= 0; i--) merges.push(merge(`wt-${i}`, "main", 80 + (k - 1 - i), [], `t${k}-${i}`));
  cards.push(card("main", 26 * 60), card("main", 26 * 60 + 30));
  return { state: { cards, commits, merges } satisfies BranchesState, now: T0 + 27 * 3600_000 };
}

describe("the gutter's invariants (B-tgq5p: a branch's line runs whole from its fork to its merge, gaps only under a curve's halo)", () => {
  const fixtures: [string, () => { state: BranchesState; now: number }][] = [
    ["a history like this repo's", realLike],
    ["parallel worktrees, held and unmerged", parallel],
    ["no cards on main", noMainCards],
    ["a feature branch only", featureOnly],
    ["six branches at once", sixParallel],
    ["two merges at one commit", sharedCommit],
    ["two branches begun in one minute", sameStart],
    ["a fork from a branch gone idle", idleParent],
    ["an idle branch ending in a commit", idleLastCommit],
    ["a filtered run over an idle branch's end", moreOverEnd],
    ["two merges in an idle branch's last second", twoMergesAtTheEnd],
    ["a start, then a merge back", startThenBack],
    ["a sync, then a merge back", syncThenBack],
    ["a sync, its branch quiet after", quietAfterSync],
    ["a merge in, and a start from it, at one commit in one second", syncAtTheMergeCommit],
    ["parallel worktrees, every card answered", () => parallel({ answered: true })],
    ["ten branches at once", () => manyParallel(10)],
    ["twelve branches at once", () => manyParallel(12)],
    ["twenty branches at once", () => manyParallel(20)],
  ];
  for (const [name, f] of fixtures) {
    it(`holds for ${name}, every way it's drawn`, () => {
      for (const { how, m, P } of everyWay(f())) expect(checkGutter(m, P), how).toEqual([]);
    });
  }

  // This repo's own history, read from a state the local server served (`GET /api/state`, saved to a file), when given.
  // (The client's code has no Node types: Vitest gives the environment as `import.meta.env`, and Node's files by name.)
  const real = import.meta.env.BAESIAN_STATE as string | undefined;
  it.skipIf(!real)("holds for a real repo's history, every way it's drawn (BAESIAN_STATE)", async () => {
    const fs = (await import(["node", "fs"].join(":"))) as { readFileSync: (path: string, encoding: "utf8") => string };
    const state = JSON.parse(fs.readFileSync(real!, "utf8")) as BranchesState & { server?: { now?: string } };
    for (const { how, m, P } of everyWay({ state, now: Date.parse(state.server?.now ?? new Date().toISOString()) })) expect(checkGutter(m, P), how).toEqual([]);
  });

  it("holds for 60 days", () => {
    const f = big();
    const m = branchModel(f.state, { nowMs: f.now });
    const P = listRows(m, columnsOf(m), { commits: true, open: allOpen(m) });
    expect(checkGutter(m, P)).toEqual([]);
  });

  it("gives each of ten, twelve and twenty branches open at once a column of its own (B-cjqxz)", () => {
    for (const k of [10, 12, 20]) {
      const m = model(manyParallel(k));
      const c = columnsOf(m);
      expect(new Set(Array.from({ length: k }, (_, i) => c.get(`wt-${i}`))).size, `${k}`).toBe(k);
      expect(listRows(m, c, { commits: false, open: allOpen(m) }).cols).toBe(k + 1);
    }
  });

  it("spaces the columns 14 px apart up to five, narrows them to fit, and widens the gutter once they're 6 px apart (B-cjqxz)", () => {
    expect([3, 5, 6, 8, 10, 12, 13, 20].map((n) => gutterOf(n, false).pitch)).toEqual([14, 14, 14, 10, 7, 6, 6, 6]);
    expect([5, 8, 17, 18].map((n) => gutterOf(n, true).pitch)).toEqual([18, 14, 6, 6]);
    // As many as fit the usual width; the gutter for more is wider.
    expect([8, 12, 13, 20].map((n) => gutterOf(n, false).fits)).toEqual([8, 12, 12, 12]);
    expect(gutterOf(20, true).fits).toBe(17);
    const g = gutterOf(20, false);
    expect(g.pitch).toBe(MIN_PITCH);
    expect(g.width(20)).toBeGreaterThan(g.width(g.fits));
    // Twelve fit in no more room than eight did.
    expect(gutterOf(12, false).width(12)).toBeLessThanOrEqual(gutterOf(8, false).width(8));
  });

  it("reaches as many columns as a day has branches open at once: only that day's rows need the wider gutter (B-cjqxz)", () => {
    const m = model(manyParallel(20));
    const P = listRows(m, columnsOf(m), { commits: true, open: allOpen(m) });
    const reach = new Map<string, number>();
    let day = "";
    for (const r of P.rows) {
      if (r.kind === "day") day = r.dk;
      if (day) reach.set(day, Math.max(reach.get(day) ?? 0, reachOf(strokesOf(r, P, m))));
    }
    expect([...reach.values()]).toEqual([1, 21]);
    expect(reachOf(null)).toBe(0);
  });

  it("puts a merge into a branch before a merge out of it in the same second: the first made the commit the second moved to", () => {
    // As 952d56b has it, but with work on wt-b before, so the second is a merge (a sync), not where wt-b began.
    const v = [card("v1", 5), card("v1", 10)];
    const commits = [cite(v[0]!, 12, "a1", "wt-a"), cite(v[1]!, 20, "b0", "wt-b")];
    const merges = [{ ...merge("wt-a", "v1", 30, [], "X"), tip: sha("a1"), commits: [sha("a1")] }, merge("v1", "wt-b", 30, v, "X")];
    const m = branchModel({ cards: [card("main", 0), ...v], commits, merges }, { nowMs: T0 + 90 * 60_000 });
    const order = m.events.filter((e) => e.kind === "merge").map((e) => `${e.lane}>${e.into}`);
    expect(order).toEqual(["wt-a>v1", "v1>wt-b"]);
  });

  it("joins a branch's first card to its fork (G-3)", () => {
    const m = branchModel({ cards: [card("main", 0), card("feat", 10), card("feat", 20)], commits: [], merges: [] }, { nowMs: T0 + 60 * 60_000 });
    const P = listRows(m, columnsOf(m), { commits: false, open: allOpen(m) });
    const first = events(P.rows).find((r) => r.e.kind === "card" && r.e.card.t === T0 + 10 * 60_000)!;
    expect(first.below.get(first.col!)).toBe("feat");
    expect(checkGutter(m, P)).toEqual([]);
  });

  it("keeps every line whole through rows in one second (G-2: two merges at one commit; two branches begun in one minute)", () => {
    for (const f of [sharedCommit(), sameStart()]) {
      const m = branchModel(f.state, { nowMs: f.now });
      const P = listRows(m, columnsOf(m), { commits: true, open: allOpen(m) });
      // Each merged lane is drawn through every other row between its fork and its merge.
      const rs = events(P.rows);
      for (const L of m.lanes.values()) {
        if (L.end.kind !== "merged") continue;
        const key = L.end.merge.key;
        const from = rs.findIndex((r) => r.key === key);
        const to = rs.findIndex((r) => r.e.kind === "fork" && r.e.lane === L.name);
        for (const r of rs.slice(from + 1, to)) if (r.e.lane !== L.name) expect([...r.live.values()], `${L.name} through ${r.key}`).toContain(L.name);
      }
      expect(checkGutter(m, P)).toEqual([]);
    }
  });

  it("keeps a branch's line through a run a filter folds, and ends a run at an idle branch's end (G-7)", () => {
    const f = [card("feat", 10), card("feat", 20, "against")];
    const m = branchModel({ cards: [card("main", 0), ...f, card("main", 30)], commits: [], merges: [merge("feat", "main", 25, f, "fm")] }, { nowMs: T0 + 60 * 60_000 });
    const P = listRows(m, columnsOf(m), { commits: false, filter: (c) => c.state === "against", open: allOpen(m) });
    const more = P.rows.find((r): r is Extract<Row, { kind: "more" }> => r.kind === "more" && r.keys.includes(`card:${f[0]!.meta.id}`))!;
    expect([...more.live.values()]).toContain("feat");
    expect(checkGutter(m, P)).toEqual([]);
    const o = moreOverEnd();
    const mo = branchModel(o.state, { nowMs: o.now });
    const Po = listRows(mo, columnsOf(mo), { commits: false, filter: (c) => c.state === "against", open: allOpen(mo) });
    const end = Po.rows.findIndex((r) => r.kind === "end" && r.lane === "old");
    // old's own hidden card isn't folded into a run above its end.
    const above = Po.rows.slice(0, end).flatMap((r) => (r.kind === "more" ? r.keys : []));
    expect(above).not.toContain(`card:${o.state.cards[2]!.meta.id}`);
    expect(checkGutter(mo, Po)).toEqual([]);
  });

  it("forks a branch only from a line that's there: a guessed parent gone idle keeps its line to the fork (G-8)", () => {
    const f = idleParent();
    const m = branchModel(f.state, { nowMs: f.now });
    expect(m.lanes.get("new")!.parent).toBe("old");
    expect(m.lanes.get("old")!.end).toMatchObject({ kind: "open", idleSince: T0 + 60 * 60_000 });
    const P = listRows(m, columnsOf(m), { commits: false, open: allOpen(m) });
    const fork = P.rows.findIndex((r) => r.kind === "event" && r.e.kind === "fork" && r.e.lane === "new");
    const end = P.rows.findIndex((r) => r.kind === "end" && r.lane === "old");
    // old's end is above the fork from it, not below.
    expect(end).toBeGreaterThanOrEqual(0);
    expect(end).toBeLessThan(fork);
    expect(checkGutter(m, P)).toEqual([]);
  });

  it("ends an idle branch with its end row whatever the Commits switch, and only once (G-9, IF-5, G-13)", () => {
    for (const commits of [false, true]) {
      const f = idleLastCommit();
      const m = branchModel(f.state, { nowMs: f.now });
      const P = listRows(m, columnsOf(m), { commits, open: allOpen(m) });
      expect(P.rows.filter((r) => r.kind === "end" && r.lane === "old"), `commits ${commits}`).toHaveLength(1);
      expect(checkGutter(m, P)).toEqual([]);
    }
    const g = twoMergesAtTheEnd();
    const m = branchModel(g.state, { nowMs: g.now });
    const P = listRows(m, columnsOf(m), { commits: false, open: allOpen(m) });
    expect(P.rows.filter((r) => r.kind === "end").map((r) => r.key)).toEqual(["end:dev"]);
    expect(new Set(P.rows.map((r) => r.key)).size).toBe(P.rows.length);
  });
});

describe("rows and counts the sweep found wrong", () => {
  it("keys two merges at one commit of one branch, into two branches, apart; one record found twice is one (IF-4)", () => {
    const v = [card("v1", 5)];
    // Each worktree has work of its own before: these are merges, not where they began (B-c4efj).
    const own = [cite(v[0]!, 10, "wa", "wt-a"), cite(v[0]!, 11, "wb", "wt-b")];
    const m = branchModel({ cards: [card("main", 0), ...v, card("v1", 50)], commits: own, merges: [merge("v1", "wt-a", 20, v, "same"), merge("v1", "wt-b", 21, v, "same")] }, { nowMs: T0 + 90 * 60_000 });
    expect(m.merges).toHaveLength(2);
    expect(new Set(m.merges.map((x) => x.key)).size).toBe(2);
    expect(new Set(m.events.map((e) => e.key)).size).toBe(m.events.length);
    const twice = branchModel({ cards: [card("main", 0), ...v, card("v1", 50)], commits: own, merges: [merge("v1", "wt-a", 20, v, "same"), { ...merge("v1", "wt-a", 20, v, "same"), at: at(20.5) }] }, { nowMs: T0 + 90 * 60_000 });
    expect(twice.merges).toHaveLength(1);
  });

  it("counts only open cards as waiting for you; returned and passed-on ones still hold the merge (IF-6)", () => {
    for (const st of ["returned", "rerouted"] as const) {
      const held = card("feat", 10, st);
      const m = branchModel({ cards: [card("main", 0), held], commits: [], merges: [] }, { nowMs: T0 + 60 * 60_000 });
      expect(m.counts.waiting, st).toBe(0);
      expect(statusOf(m).lead).toBe("Nothing is waiting for you.");
      expect(openingKey(m)).toBe(`card:${held.meta.id}`);
      expect(endWords(m.lanes.get("feat")!)).toBe("No merge recorded · Merge held: 1 waiting");
      const P = listRows(m, columnsOf(m), { commits: false, open: allOpen(m) });
      expect(P.rows.find((r): r is Extract<Row, { kind: "day" }> => r.kind === "day")!.waiting).toBe(0);
    }
    const open = card("feat", 10, "waiting");
    const m = branchModel({ cards: [card("main", 0), card("feat", 5, "returned"), open], commits: [], merges: [] }, { nowMs: T0 + 60 * 60_000 });
    expect([m.counts.waiting, statusOf(m).lead, openingKey(m)]).toEqual([1, "One card is waiting for you, holding feat from merging.", `card:${open.meta.id}`]);
  });

  it("shows no day, and offers none to go to, that holds only commits the switch hides (IF-11)", () => {
    const c = card("main", 0);
    const m = branchModel({ cards: [c], commits: [cite(c, 26 * 60, "nextday")], merges: [] }, { nowMs: T0 + 27 * 3600_000 });
    const off = listRows(m, columnsOf(m), { commits: false, open: new Set() });
    expect(off.rows.filter((r) => r.kind === "day")).toHaveLength(1);
    expect(daysOf(m, { commits: false }).map((d) => d.key)).toEqual([dayKey(T0)]);
    const on = listRows(m, columnsOf(m), { commits: true, open: new Set() });
    expect(on.rows.filter((r) => r.kind === "day")).toHaveLength(2);
    expect(daysOf(m, { commits: true })).toHaveLength(2);
  });
});
