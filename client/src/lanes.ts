import type { ApiCard, ApiCommit, ApiMerge, ApiState } from "../../src/api";
import { agentOf, isHard } from "./model";

// D181: a project's decisions laid out by branch, as the mockup the user approved draws them, with what it couldn't know:
// merges, found by the CLI's hooks, and the commits that cite cards, from the ledger. Pure: what goes where, for
// `<BranchesPanel />` to draw, from the state the local server and the relay both serve.
//
// Each branch with cards is a lane, in the order its first card was filed; a branch merged into that has none of its own
// gets a lane too. Along x, every card, commit and merge in the order they happened. A lane merged into another curves
// into it at the merge, and starts from it: git doesn't say where a branch forked, so its fork is drawn just before its
// first card or commit. A lane not merged yet is joined, dotted, to the lane busiest when its first card came, as the
// mockup guessed every join.

/** How a card's mark is drawn. */
export type MarkState = "with" | "against" | "waiting" | "aside" | "gone";

/** Sizes, in px: a card's slot, a commit's, a merge's, a lane's height, the space above the first lane, the ends' padding, and a mark's reach for a pointer. */
export interface Geometry {
  step: number;
  commitStep: number;
  mergeStep: number;
  /** How far back from a lane's first mark its fork begins. */
  fork: number;
  lane: number;
  top: number;
  pad: number;
  hit: number;
}

export const DESK_GEOMETRY: Geometry = { step: 18, commitStep: 10, mergeStep: 36, fork: 28, lane: 76, top: 34, pad: 30, hit: 10 };
/** On a phone every mark is a 44 px target (D130), so the marks are further apart; a lane is taller, for its name in a narrower column. */
export const PHONE_GEOMETRY: Geometry = { step: 36, commitStep: 28, mergeStep: 48, fork: 30, lane: 96, top: 34, pad: 30, hit: 22 };

/** How a lane ends: merged into another, or not merged, every card answered or some waiting (`verify --merge` holds it). */
export type LaneEnd = { kind: "merged"; into: string; at: string } | { kind: "ready" } | { kind: "held"; waiting: number };

export interface Lane {
  name: string;
  /** Its row, from 0 at the top. */
  k: number;
  agents: string[];
  cards: number;
  /** Where its line starts and ends. */
  from: number;
  to: number;
  /** The lane it starts from: known where it merged into it, inferred (dotted) otherwise. */
  fork?: { lane: number; x: number; inferred: boolean };
  end: LaneEnd;
}

export interface CardMark {
  kind: "card";
  key: string;
  card: ApiCard;
  lane: number;
  x: number;
  state: MarkState;
  hard: boolean;
}

export interface CommitMark {
  kind: "commit";
  key: string;
  commit: ApiCommit;
  lane: number;
  x: number;
  /** The card it cites, where that card is drawn. */
  cites?: CardMark;
}

export interface MergeMark {
  kind: "merge";
  key: string;
  merge: ApiMerge;
  from: number;
  /** The lane it lands on; the merge's node is there. */
  lane: number;
  x: number;
  /** Whether it ends its lane: nothing happened on it after, and it merged into a lane older than itself. */
  ends: boolean;
}

export type Mark = CardMark | CommitMark | MergeMark;

export interface Layout {
  lanes: Lane[];
  marks: Mark[];
  /** Where each day starts, and the time of its first event. */
  days: { x: number; at: string }[];
  width: number;
  height: number;
  /** Counts for the summary. */
  counts: { cards: number; answered: number; against: number; held: number; merged: number; commits: number };
}

/** A card's state on its lane: chosen as the agent picked, otherwise, waiting, set aside (settled at merge), or gone. */
export function markState(c: ApiCard): MarkState {
  switch (c.status) {
    case "withdrawn":
    case "superseded":
      return "gone";
    case "held":
    case "deferred":
      return "aside";
    case "resolved": {
      const last = c.verdicts.filter((v) => v.revision === c.meta.revision).at(-1);
      return last?.response === "accept" ? "with" : "against";
    }
    default:
      return "waiting";
  }
}

/** What happened to a card, in a few words, for its callout. */
export function saidOf(c: ApiCard, nowMs: number): { words: string; tone: MarkState } {
  const st = markState(c);
  const last = c.verdicts.filter((v) => v.revision === c.meta.revision).at(-1);
  switch (c.status) {
    case "withdrawn":
      return { words: "withdrawn by its agent", tone: st };
    case "superseded":
      return { words: "superseded by a later decision", tone: st };
    case "held":
      return { words: `held back by your settings: ${agentOf(c)} went ahead`, tone: st };
    case "deferred":
      return { words: "you deferred it", tone: st };
    case "returned":
      return { words: last?.response === "reject" ? "you rejected it: returned to its agent" : "returned to its agent", tone: st };
    case "rerouted":
      return { words: "you passed it on: waiting for someone else", tone: st };
    case "open":
      return { words: c.waiting.some((w) => nowMs - Date.parse(w.at) <= 90_000) ? `${agentOf(c)} has stopped: waiting for you` : "waiting for you", tone: st };
    default:
      if (st === "with") return { words: `you chose “${c.meta.proposal}”${last?.first_choice === "alternative" ? ", after reading its case" : ""}`, tone: st };
      if (last?.response === "alternative") return { words: `you chose “${c.meta.alternative}”, not the agent's pick`, tone: st };
      return { words: `you answered “${last?.choice ?? c.decision ?? last?.response ?? "otherwise"}”`, tone: st };
  }
}

/** The width a day's label takes, "Wed 4 Nov", with room after it. */
const DAY_LABEL = 76;

/** The branches no lane is drawn for: Baesian's own cards on the relay, and a detached HEAD's. */
const noLane = (b: string) => b === "relay" || b.startsWith("detached-");

/** A day, as the lanes mark them: the reader's own. */
export const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/**
 * The same merge found twice, with nothing on its branch between: one (D181's merge events are per commit, and a pull
 * that merged where the branch had moved on finds its own merge besides the one made where it was pushed).
 */
function distinctMerges(merges: ApiMerge[], activity: Map<string, string[]>): ApiMerge[] {
  const out: ApiMerge[] = [];
  const last = new Map<string, ApiMerge>();
  for (const m of [...merges].sort((a, b) => a.at.localeCompare(b.at))) {
    const key = `${m.branch}\0${m.into}`;
    const before = last.get(key);
    const between = before && (activity.get(m.branch) ?? []).some((t) => t > before.at && t <= m.at);
    if (before && !between) continue;
    last.set(key, m);
    out.push(m);
  }
  return out;
}

/** Lay out the state's cards, commits and merges by branch. */
export function layoutBranches(state: Pick<ApiState, "cards" | "merges" | "commits">, g: Geometry = DESK_GEOMETRY): Layout {
  const cards = state.cards.filter((c) => !noLane(c.meta.source_branch)).sort((a, b) => a.meta.created.localeCompare(b.meta.created));
  const byId = new Map(cards.map((c) => [c.meta.id, c]));
  // Branches with cards, in the order their first card was filed.
  const names: string[] = [];
  for (const c of cards) if (!names.includes(c.meta.source_branch)) names.push(c.meta.source_branch);
  const has = new Set(names);
  const commits = (state.commits ?? []).flatMap((c) => {
    const lane = has.has(c.branch) ? c.branch : byId.get(c.card)?.meta.source_branch;
    return lane ? [{ c, lane }] : [];
  });
  const activity = new Map<string, string[]>();
  for (const c of cards) activity.set(c.meta.source_branch, [...(activity.get(c.meta.source_branch) ?? []), c.meta.created]);
  for (const { c, lane } of commits) activity.set(lane, [...(activity.get(lane) ?? []), c.at]);
  const merges = distinctMerges((state.merges ?? []).filter((m) => has.has(m.branch) && m.branch !== m.into && !noLane(m.into)), activity);
  // A branch merged into with no cards of its own (often main) is a lane too.
  for (const m of merges) if (!names.includes(m.into)) names.push(m.into);

  // Every event along x, in the order it happened: a card, then a commit, then a merge, at the same time.
  type Ev = { at: string; order: number; slot: number; place: (x: number) => void };
  const evs: Ev[] = [];
  const marks: Mark[] = [];
  const cardMark = new Map<string, CardMark>();
  for (const c of cards) {
    const m: CardMark = { kind: "card", key: `card:${c.meta.id}`, card: c, lane: -1, x: 0, state: markState(c), hard: isHard(c) };
    cardMark.set(c.meta.id, m);
    marks.push(m);
    evs.push({ at: c.meta.created, order: 0, slot: g.step, place: (x) => (m.x = x) });
  }
  for (const { c, lane } of commits) {
    const m: CommitMark = { kind: "commit", key: `commit:${c.commit}:${c.card}`, commit: c, lane: names.indexOf(lane), x: 0, ...(cardMark.get(c.card) ? { cites: cardMark.get(c.card)! } : {}) };
    marks.push(m);
    evs.push({ at: c.at, order: 1, slot: g.commitStep, place: (x) => (m.x = x) });
  }
  const mergeMarks: MergeMark[] = [];
  for (const mg of merges) {
    const m: MergeMark = { kind: "merge", key: `merge:${mg.commit}:${mg.branch}`, merge: mg, from: names.indexOf(mg.branch), lane: names.indexOf(mg.into), x: 0, ends: false };
    mergeMarks.push(m);
    marks.push(m);
    // Git keeps a commit's time to the second: a merge goes at the end of its second, after what it merged.
    evs.push({ at: mg.at.replace(/\.000Z$/, ".999Z"), order: 2, slot: g.mergeStep, place: (x) => (m.x = x) });
  }
  evs.sort((a, b) => a.at.localeCompare(b.at) || a.order - b.order);
  const days: Layout["days"] = [];
  let x = g.pad;
  let day = "";
  for (const e of evs) {
    if (dayKey(e.at) !== day) {
      day = dayKey(e.at);
      // Room for the day before's label, however little happened on it.
      const prev = days.at(-1);
      if (prev && x - g.step / 2 < prev.x + DAY_LABEL) x = prev.x + DAY_LABEL + g.step / 2;
      days.push({ x: x - g.step / 2, at: e.at });
    }
    e.place(x);
    x += e.slot;
  }
  const lastX = Math.max(g.pad, x - (evs.at(-1)?.slot ?? 0));
  for (const c of cards) cardMark.get(c.meta.id)!.lane = names.indexOf(c.meta.source_branch);

  // Each lane's extent, from what's on it.
  const span = names.map(() => ({ first: Infinity, last: -Infinity }));
  const touch = (lane: number, at: number) => {
    span[lane]!.first = Math.min(span[lane]!.first, at);
    span[lane]!.last = Math.max(span[lane]!.last, at);
  };
  for (const m of marks) {
    if (m.kind === "merge") {
      touch(m.lane, m.x);
      touch(m.from, m.x);
    } else touch(m.lane, m.x);
  }
  // Its own events only: where its first card or commit is, and its last.
  const own = names.map(() => ({ first: Infinity, last: -Infinity }));
  for (const m of marks) {
    if (m.kind === "merge") continue;
    own[m.lane]!.first = Math.min(own[m.lane]!.first, m.x);
    own[m.lane]!.last = Math.max(own[m.lane]!.last, m.x);
  }
  const counted = names.map((n) => cards.filter((c) => c.meta.source_branch === n));
  // A lane with no cards (merged into only) starts at the beginning: it's the trunk the others came from.
  const start = names.map((_, i) => (counted[i]!.length ? own[i]!.first : g.pad - g.step));
  // Rows: by where each starts.
  const order = names.map((_, i) => i).sort((a, b) => start[a]! - start[b]! || a - b);
  const row = new Map(order.map((i, k) => [i, k]));

  const lanes: Lane[] = names.map((name, i) => ({
    name,
    k: row.get(i)!,
    agents: [...new Set(counted[i]!.map(agentOf))],
    cards: counted[i]!.length,
    from: start[i]!,
    to: Math.max(span[i]!.last, start[i]!) + g.step,
    end: { kind: "ready" },
  }));
  // Merges: the last of a lane's merges into an older lane ends it, when nothing happened on it after.
  for (const m of mergeMarks) {
    const L = lanes[m.from]!;
    const older = start[m.lane]! < start[m.from]!;
    const later = own[m.from]!.last > m.x || mergeMarks.some((o) => o !== m && o.from === m.from && o.x > m.x);
    if (older && !later) {
      m.ends = true;
      L.to = m.x - g.mergeStep;
      L.end = { kind: "merged", into: m.merge.into, at: m.merge.at };
    }
  }
  // Forks: from the lane it merged into, where it did; otherwise the busiest lane around its first card, dotted.
  for (const [i, L] of lanes.entries()) {
    if (!counted[i]!.length) continue;
    const into = mergeMarks.find((m) => m.from === i && start[m.lane]! < start[i]!);
    const forkX = Math.max(2, L.from - g.fork);
    if (into) {
      L.fork = { lane: into.lane, x: forkX, inferred: false };
      continue;
    }
    const around = lanes
      .map((o, j) => ({ o, j }))
      .filter(({ j }) => j !== i && start[j]! < start[i]! && span[j]!.last >= start[i]! - 3 * g.step)
      .sort((a, b) => b.o.cards - a.o.cards);
    if (around[0]) L.fork = { lane: around[0].j, x: forkX, inferred: true };
  }
  for (const [i, L] of lanes.entries()) {
    if (L.end.kind === "merged") continue;
    const waiting = counted[i]!.filter((c) => markState(c) === "waiting").length;
    L.end = waiting ? { kind: "held", waiting } : { kind: "ready" };
  }
  // Marks name lanes by row from here on.
  for (const m of marks) {
    m.lane = row.get(m.lane)!;
    if (m.kind === "merge") m.from = row.get(m.from)!;
  }
  for (const L of lanes) if (L.fork) L.fork.lane = row.get(L.fork.lane)!;
  lanes.sort((a, b) => a.k - b.k);

  const answered = cards.filter((c) => ["with", "against"].includes(markState(c)));
  return {
    lanes,
    marks,
    days,
    width: Math.max(lastX, ...lanes.map((l) => l.to)) + g.pad + 30,
    height: g.top + lanes.length * g.lane,
    counts: {
      cards: cards.length,
      answered: answered.length,
      against: answered.filter((c) => markState(c) === "against").length,
      held: lanes.filter((l) => l.end.kind === "held").length,
      merged: lanes.filter((l) => l.end.kind === "merged").length,
      commits: commits.length,
    },
  };
}

/** The summary under the lede. */
export function summaryOf(l: Layout): string {
  const c = l.counts;
  if (!c.cards) return "No cards yet: a lane appears for each branch once an agent files a card on it.";
  const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
  return [
    `${n(c.cards, "card")} on ${n(l.lanes.length, "branch", "branches")}${c.commits ? `, cited by ${n(c.commits, "commit")}` : ""}.`,
    `You've answered ${c.answered}, choosing otherwise than the agent on ${c.against}.`,
    c.merged ? `${n(c.merged, "branch", "branches")} merged.` : "",
    c.held ? `${n(c.held, "branch is", "branches are")} held by a card still waiting.` : "No branch is held.",
  ]
    .filter(Boolean)
    .join(" ");
}
