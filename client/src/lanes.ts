import type { ApiCard, ApiCommit, ApiMerge, ApiState } from "../../src/api";
import { agentOf, isHard } from "./model";

// D181, redrawn (B-v8jzy, B-vfdhz, B-tgq5p): a project's decisions by branch, as a list, newest first, with each branch a
// line in a gutter of fixed columns beside it. Pure: what happened, and the rows that show it, for `<BranchesDrawer />`
// (Branches.tsx) to draw, from the state the local server and the relay both serve. Ported from the design loop's
// reference model (`branchModel`, `phoneRows`, `statusOf`, `shortNames`), less the across view it also drew (B-v8jzy
// chose the list everywhere), and less its 60-second rule for commits after a merge (B-w41p7 chose to record what a merge
// brought, not to infer it).
//
//   branchModel(state, opts) -> Model   what happened: lanes, parents, ends, one entry per commit, events in order
//   columnsOf(model)         -> Map     each lane's column in the gutter, reused once a lane has merged
//   listRows(model, cols, o) -> rows    the history as rows, newest first, with what each row's gutter draws
//   statusOf(model)          -> words   the opening sentences
//   shortNames(names)        -> Map     names that keep the part that tells branches apart

/** How a card's mark is drawn: chosen as the agent picked, otherwise, waiting, set aside (settled at merge), or gone. */
export type MarkState = "with" | "against" | "waiting" | "aside" | "gone";

/**
 * What the panel reads. `defaultBranch` is the repo's default branch (B-jr8mk: the state will carry it); until the
 * command line sends it, the trunk is guessed (`trunkOf()`).
 */
export type BranchesState = Pick<ApiState, "cards" | "merges" | "commits"> & { defaultBranch?: string };

/** A branch with nothing for this long, and no merge recorded after it, is idle: its column is free again. */
export const IDLE_MS = 24 * 3600_000;
/** How far back a guessed parent's own events count, for "busiest before". */
const BUSY_MS = 6 * 3600_000;
/** The gutter's columns, at most; past them, lanes share the last one, and their rows name the branch. */
export const COLUMNS = 8;

/** The branches no lane is drawn for: Baesian's own cards on the relay, and a detached HEAD's. */
const noLane = (b: string | undefined) => !b || b === "relay" || b.startsWith("detached-");

/** A day, as the reader's clock has it. */
export const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

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

/** Which option a settled card's last answer chose, if it chose one. */
export function chosenOf(c: ApiCard): "proposal" | "alternative" | undefined {
  if (c.status !== "resolved") return undefined;
  const last = c.verdicts.filter((v) => v.revision === c.meta.revision).at(-1);
  return last?.response === "accept" ? "proposal" : last?.response === "alternative" ? "alternative" : undefined;
}

/** What happened to a card, in a few words. */
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
      if (st === "with") return { words: `you chose “${c.meta.proposal}”, the agent's pick${last?.first_choice === "alternative" ? ", after reading its case" : ""}`, tone: st };
      if (last?.response === "alternative") return { words: `you chose “${c.meta.alternative}”, not the agent's pick`, tone: st };
      return { words: `you answered “${last?.choice ?? c.decision ?? last?.response ?? "otherwise"}”`, tone: st };
  }
}

// ------------------------------------------------------------------------------------------------ the model

/** A card, as the panel draws it. */
export interface BCard {
  id: string;
  card: ApiCard;
  title: string;
  branch: string;
  agent: string;
  /** When it was filed, in ms. */
  t: number;
  state: MarkState;
  hard: boolean;
}

/** One commit: the ledger has an entry per (commit, card), so a commit citing three cards is three entries, and one mark. */
export interface Commit {
  hash: string;
  short: string;
  branch: string;
  at: string;
  /** Its earliest entry's time, in ms. */
  t: number;
  cards: string[];
  /** The merge whose commit it is, when it's in the ledger too: drawn as the merge, not as a commit of its own. */
  folded?: Merge;
}

export interface Merge extends ApiMerge {
  key: string;
  /** Git's time, in ms. */
  gitT: number;
  /** Where it goes in order: at the end of its second, since git keeps a commit's time to the second. */
  t: number;
  /** The merge's own commit, when a ledger entry names it: its cards are the merge's to show. */
  own?: Commit;
  /** Whether it ends its branch: nothing happened on the branch after it. */
  ends: boolean;
}

export type LaneEnd =
  | { kind: "trunk"; quietSince: number }
  | { kind: "merged"; into: string; at: string; merge: Merge }
  /** No merge ends it: `waiting` cards hold its merge (`verify --merge`); `since`, a merge recorded before its last event. */
  | { kind: "open"; waiting: number; aside: number; idleSince: number | null; since?: Merge };

export interface Lane {
  name: string;
  short: string;
  cards: BCard[];
  commits: Commit[];
  out: Merge[];
  in: Merge[];
  /** The branch it began from: the one it merged into, or a guess. */
  parent: string | null;
  parentWhy: "merged" | "guess" | null;
  depth: number;
  /** Its first and last events, in ms, and its last card or commit. */
  first: number;
  last: number;
  lastOwn: number;
  end: LaneEnd;
}

export type Event =
  | { kind: "fork"; key: string; t: number; rank: 0; lane: string; from: string; guess: boolean }
  | { kind: "card"; key: string; t: number; rank: 1; lane: string; card: BCard }
  /** A commit on a branch with no lane (commits only, no cards and no merge recorded) is loose: `lane` is null. */
  | { kind: "commit"; key: string; t: number; rank: 2; lane: string | null; commit: Commit }
  | { kind: "merge"; key: string; t: number; rank: 3; lane: string; into: string; merge: Merge; ends: boolean };

export interface Model {
  nowT: number;
  trunk: string | null;
  /** Whether the trunk is the repo's default branch, said by the state, or a guess. */
  trunkKnown: boolean;
  short: Map<string, string>;
  lanes: Map<string, Lane>;
  cards: BCard[];
  cardById: Map<string, BCard>;
  commits: Commit[];
  commitByHash: Map<string, Commit>;
  /** The commits that cite each card. */
  citedBy: Map<string, Commit[]>;
  merges: Merge[];
  loose: { branches: string[]; commits: Commit[] };
  events: Event[];
  /** Cards on the relay's branch or a detached HEAD: counted, not drawn. */
  offLane: number;
  counts: {
    cards: number;
    with: number;
    against: number;
    waiting: number;
    aside: number;
    gone: number;
    hard: number;
    branches: number;
    merged: number;
    open: Lane[];
    held: Lane[];
    commits: number;
    cited: number;
  };
}

/** The ledger is one entry per (commit, card): one entry per commit, with the cards it cites, at its earliest entry. */
export function commitsOf(ledger: ApiCommit[]): Commit[] {
  const by = new Map<string, Commit>();
  for (const e of ledger) {
    const t = Date.parse(e.at);
    let c = by.get(e.commit);
    if (!c) by.set(e.commit, (c = { hash: e.commit, short: e.commit.slice(0, 7), branch: e.branch, at: e.at, t, cards: [] }));
    if (!c.cards.includes(e.card)) c.cards.push(e.card);
    if (t < c.t) Object.assign(c, { t, at: e.at });
  }
  return [...by.values()].sort((a, b) => a.t - b.t || a.hash.localeCompare(b.hash));
}

/**
 * Short names: a long name that shares a prefix with others keeps one word of the prefix and the part that differs,
 * from 7 characters until it's unique (`worktree-agent-a0bd0dd57881ac741` → `worktree a0bd0dd`), so it never reads as a
 * commit's ID. Any other name is kept whole up to 28 characters, then loses its middle.
 */
export function shortNames(names: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const n of names) {
    let p = "";
    for (let i = 0; i < n.length; i++) if ((n[i] === "-" || n[i] === "/") && names.some((o) => o !== n && o.startsWith(n.slice(0, i + 1)))) p = n.slice(0, i + 1);
    if (!p || n.length <= 20) {
      out.set(n, n.length <= 28 ? n : `${n.slice(0, 15)}…${n.slice(-10)}`);
      continue;
    }
    const rest = n.slice(p.length);
    const fam = names.filter((o) => o !== n && o.startsWith(p)).map((o) => o.slice(p.length));
    let k = Math.min(7, rest.length);
    while (k < rest.length && fam.some((f) => f.slice(0, k) === rest.slice(0, k))) k++;
    out.set(n, `${p.replace(/[-/]+$/, "").split(/[-/]/)[0]} ${rest.slice(0, k)}`);
  }
  return out;
}

/**
 * The same merge found twice with nothing on its branch between is one: a pull that merged where the branch had moved
 * on finds its own merge besides the one made where it was pushed.
 */
function distinctMerges(merges: ApiMerge[], activity: Map<string, number[]>): ApiMerge[] {
  const out: ApiMerge[] = [];
  const last = new Map<string, ApiMerge>();
  for (const m of [...merges].sort((a, b) => a.at.localeCompare(b.at))) {
    const key = `${m.branch}\0${m.into}`;
    const before = last.get(key);
    if (before && !(activity.get(m.branch) ?? []).some((t) => t > Date.parse(before.at) + 999 && t <= Date.parse(m.at) + 999)) continue;
    last.set(key, m);
    out.push(m);
  }
  return out;
}

/** Names that are the trunk wherever they're used, before the longest-lived branch is guessed. */
const TRUNK_NAMES = ["main", "master"];

/**
 * The trunk (B-jr8mk): the repo's default branch when the state says it, a lane or not; otherwise main, then master,
 * then the longest-lived branch that others merged into and that never merged anywhere itself. With none of those
 * (a repo with only a feature branch), there's no trunk, and every branch has an end.
 */
export function trunkOf(lanes: Map<string, Lane>, defaultBranch?: string): { name: string | null; known: boolean } {
  if (defaultBranch) return { name: lanes.has(defaultBranch) ? defaultBranch : null, known: true };
  const named = TRUNK_NAMES.find((n) => lanes.has(n));
  if (named) return { name: named, known: false };
  const into = [...lanes.values()].filter((L) => L.in.length && !L.out.length).sort((a, b) => b.last - b.first - (a.last - a.first) || a.first - b.first);
  return { name: into[0]?.name ?? null, known: false };
}

/** What happened, by branch. */
export function branchModel(state: BranchesState, opts: { nowMs: number; idleMs?: number }): Model {
  const idleMs = opts.idleMs ?? IDLE_MS;
  // Now is never before the last thing that happened: a clock a few seconds behind the machine that made a commit (or a
  // model built a minute ago) mustn't leave a branch that's still open short of the top.
  const times = [...state.cards.map((c) => Date.parse(c.meta.created)), ...(state.commits ?? []).map((c) => Date.parse(c.at)), ...(state.merges ?? []).map((m) => Date.parse(m.at) + 999)].filter((t) => !Number.isNaN(t));
  const nowT = Math.max(opts.nowMs, ...times.map((t) => t + 1));
  const offLane = state.cards.filter((c) => noLane(c.meta.source_branch)).length;
  const cards: BCard[] = state.cards
    .filter((c) => !noLane(c.meta.source_branch))
    .map((c) => ({ id: c.meta.id, card: c, title: c.meta.title, branch: c.meta.source_branch, agent: agentOf(c), t: Date.parse(c.meta.created), state: markState(c), hard: isHard(c) }))
    .sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const commits = commitsOf(state.commits ?? []);
  const commitByHash = new Map(commits.map((c) => [c.hash, c]));

  // Lanes: every branch with a card, or named by a recorded merge. Branches with commits only are loose.
  const names: string[] = [];
  const add = (n: string) => {
    if (!noLane(n) && !names.includes(n)) names.push(n);
  };
  for (const c of cards) add(c.branch);
  const activity = new Map<string, number[]>();
  const act = (b: string, t: number) => activity.set(b, [...(activity.get(b) ?? []), t]);
  for (const c of cards) act(c.branch, c.t);
  for (const c of commits) act(c.branch, c.t);
  const raw = (state.merges ?? []).filter((m) => m.branch !== m.into && !noLane(m.branch) && !noLane(m.into));
  for (const m of raw) add(m.branch), add(m.into);
  const short = shortNames([...new Set([...names, ...commits.filter((c) => !noLane(c.branch)).map((c) => c.branch)])]);
  const lanes = new Map<string, Lane>(
    names.map((n) => [n, { name: n, short: short.get(n) ?? n, cards: [], commits: [], out: [], in: [], parent: null, parentWhy: null, depth: 0, first: Infinity, last: -Infinity, lastOwn: -Infinity, end: { kind: "open", waiting: 0, aside: 0, idleSince: null } }]),
  );
  const laneOf = (n: string) => lanes.get(n)!;
  for (const c of cards) laneOf(c.branch).cards.push(c);

  const merges: Merge[] = distinctMerges(raw, activity).map((m) => ({ ...m, gitT: Date.parse(m.at), t: Date.parse(m.at) + 999, key: `merge:${m.commit.slice(0, 12)}:${m.branch}`, ends: false }));
  for (const m of merges) {
    // The commit git recorded for the merge, when it's in the ledger too, is the merge's: one mark, not two.
    const own = commitByHash.get(m.commit);
    if (own && !own.folded) (own.folded = m), (m.own = own);
    laneOf(m.branch).out.push(m);
    laneOf(m.into).in.push(m);
  }
  const loose: Model["loose"] = { branches: [], commits: [] };
  for (const c of commits) {
    if (c.folded) continue;
    // A detached HEAD's commit (from before rebases kept their branch) is loose too: drawn, never put on a branch.
    if (lanes.has(c.branch)) laneOf(c.branch).commits.push(c);
    else loose.commits.push(c), loose.branches.includes(c.branch) || loose.branches.push(c.branch);
  }
  // Where each lane's merge ends it: its last merge out, with nothing on it after (no card, commit, or merge into it).
  const endMerge = new Map<string, Merge>();
  for (const L of lanes.values()) {
    const own = [...L.cards.map((c) => c.t), ...L.commits.map((c) => c.t)];
    L.lastOwn = own.length ? Math.max(...own) : -Infinity;
    L.first = Math.min(...own, ...L.out.map((m) => m.t), ...L.in.map((m) => m.t));
    L.last = Math.max(L.lastOwn, ...L.out.map((m) => m.t), ...L.in.map((m) => m.t));
    const lastOut = [...L.out].sort((a, b) => a.t - b.t).at(-1);
    if (lastOut && !(L.lastOwn > lastOut.t || L.in.some((m) => m.t > lastOut.t))) endMerge.set(L.name, lastOut);
  }

  const trunk = trunkOf(lanes, state.defaultBranch);
  if (trunk.name) endMerge.delete(trunk.name);

  // Parents: the branch it merged into; otherwise a guess among branches open when it began (never one already merged).
  const order = [...lanes.values()].sort((a, b) => a.first - b.first || a.name.localeCompare(b.name));
  for (const L of order) {
    if (L.name === trunk.name) continue;
    const into = (endMerge.get(L.name) ?? L.out[0])?.into;
    if (into) {
      L.parent = into;
      L.parentWhy = "merged";
      continue;
    }
    // Scored by: the cards its commits cite; then how busy it was in the hours before; then the trunk; then its cards.
    const cites = (o: Lane) => L.commits.reduce((n, c) => n + c.cards.filter((id) => cardById.get(id)?.branch === o.name).length, 0);
    const busy = (o: Lane) => [...o.cards.map((c) => c.t), ...o.commits.map((c) => c.t), ...o.in.map((m) => m.t)].filter((t) => t <= L.first && t > L.first - BUSY_MS).length;
    const cand = order
      // Git keeps a merge's time to the second: a branch merged in the second this one began counts as merged already.
      .filter((o) => o !== L && (o.name === trunk.name || (o.first <= L.first && !(endMerge.get(o.name) && endMerge.get(o.name)!.gitT <= L.first))))
      .map((o) => ({ o, s: [cites(o), busy(o), o.name === trunk.name ? 1 : 0, o.cards.length] as const }))
      .sort((a, b) => b.s[0] - a.s[0] || b.s[1] - a.s[1] || b.s[2] - a.s[2] || b.s[3] - a.s[3]);
    if (cand[0]) (L.parent = cand[0].o.name), (L.parentWhy = "guess");
  }
  // No cycles: a branch can't be its own ancestor.
  for (const L of lanes.values()) {
    const seen = new Set([L.name]);
    for (let p = L.parent; p; p = laneOf(p).parent) {
      if (seen.has(p)) {
        L.parent = trunk.name && trunk.name !== L.name ? trunk.name : null;
        L.parentWhy = L.parent ? "guess" : null;
        break;
      }
      seen.add(p);
    }
  }
  for (const L of lanes.values()) for (let p = L.parent; p; p = laneOf(p).parent) L.depth++;
  // A parent's line reaches back to where its children began.
  for (let pass = 0; pass < 4; pass++) for (const L of lanes.values()) if (L.parent && L.parent !== trunk.name) laneOf(L.parent).first = Math.min(laneOf(L.parent).first, L.first - 1);

  for (const L of lanes.values()) {
    const em = endMerge.get(L.name);
    if (L.name === trunk.name) L.end = { kind: "trunk", quietSince: L.last };
    else if (em) (L.end = { kind: "merged", into: em.into, at: em.at, merge: em }), (em.ends = true);
    else {
      const since = [...L.out].sort((a, b) => a.t - b.t).at(-1);
      L.end = {
        kind: "open",
        waiting: L.cards.filter((c) => c.state === "waiting").length,
        aside: L.cards.filter((c) => c.state === "aside").length,
        idleSince: nowT - L.last > idleMs ? L.last : null,
        ...(since ? { since } : {}),
      };
    }
  }

  // Every event, in the order it happened: where a branch began, its cards and commits, its merges.
  const events: Event[] = [];
  for (const L of lanes.values()) if (L.parent) events.push({ kind: "fork", key: `fork:${L.name}`, lane: L.name, from: L.parent, guess: L.parentWhy !== "merged", t: L.first, rank: 0 });
  for (const c of cards) events.push({ kind: "card", key: `card:${c.id}`, lane: c.branch, card: c, t: c.t, rank: 1 });
  for (const L of lanes.values()) for (const c of L.commits) events.push({ kind: "commit", key: `commit:${c.hash}`, lane: L.name, commit: c, t: c.t, rank: 2 });
  for (const c of loose.commits) events.push({ kind: "commit", key: `commit:${c.hash}`, lane: null, commit: c, t: c.t, rank: 2 });
  for (const m of merges) events.push({ kind: "merge", key: m.key, lane: m.branch, into: m.into, merge: m, ends: m.ends, t: m.t, rank: 3 });
  events.sort((a, b) => a.t - b.t || a.rank - b.rank || a.key.localeCompare(b.key));
  const citedBy = new Map<string, Commit[]>();
  for (const c of commits) for (const id of c.cards) citedBy.set(id, [...(citedBy.get(id) ?? []), c]);

  const all = [...lanes.values()];
  const count = (st: MarkState) => cards.filter((c) => c.state === st).length;
  return {
    nowT,
    trunk: trunk.name,
    trunkKnown: trunk.known,
    short,
    lanes,
    cards,
    cardById,
    commits,
    commitByHash,
    citedBy,
    merges,
    loose,
    events,
    offLane,
    counts: {
      cards: cards.length,
      with: count("with"),
      against: count("against"),
      waiting: count("waiting"),
      aside: count("aside"),
      gone: count("gone"),
      hard: cards.filter((c) => c.hard).length,
      branches: all.filter((l) => l.cards.length).length,
      merged: all.filter((l) => l.end.kind === "merged").length,
      open: all.filter((l) => l.end.kind === "open"),
      held: all.filter((l) => l.end.kind === "open" && l.end.waiting > 0),
      commits: commits.length,
      cited: [...citedBy.keys()].filter((id) => cardById.has(id)).length,
    },
  };
}

// ------------------------------------------------------------------------------------------------ the gutter's columns

/**
 * Each lane's column in the gutter (B-tgq5p: fixed rows, gaps where curves cross): the trunk first; then by depth,
 * shortest first, each in the first column right of its parent's that's free over its time, from where it began to its
 * merge (to now, for one still open; to its last event, for one idle). A short branch inside a longer one's time sits
 * nearer the parent, so the longer one's curves don't cross it; open and held branches, the longest, go outermost.
 * A column is reused once the lane in it has merged. Time here is the events' order: the list gives each its row.
 */
export function columnsOf(model: Model): Map<string, number> {
  const idx = new Map(model.events.map((e, i) => [e.key, i]));
  const firstEv = new Map<string, number>();
  const lastEv = new Map<string, number>();
  model.events.forEach((e, i) => {
    if (e.kind === "fork") return;
    for (const n of e.kind === "merge" ? [e.lane, e.into] : [e.lane]) {
      if (!n) continue;
      if (!firstEv.has(n)) firstEv.set(n, i);
      lastEv.set(n, i);
    }
  });
  const extent = (L: Lane) => {
    const fork = idx.get(`fork:${L.name}`);
    const x0 = L.name === model.trunk ? -Infinity : (fork ?? (firstEv.get(L.name) ?? 0) - 0.5);
    const x1 = L.end.kind === "merged" ? idx.get(L.end.merge.key)! : L.end.kind === "open" && L.end.idleSince !== null ? (lastEv.get(L.name) ?? 0) + 0.5 : Infinity;
    return { x0, x1 };
  };
  const col = new Map<string, number>();
  const used: { x0: number; x1: number }[][] = [];
  const free = (c: number, iv: { x0: number; x1: number }) => !(used[c] ?? []).some((u) => u.x0 <= iv.x1 && iv.x0 <= u.x1);
  const take = (name: string, c: number, iv: { x0: number; x1: number }) => {
    col.set(name, c);
    (used[c] ??= []).push(iv);
  };
  if (model.trunk) take(model.trunk, 0, extent(model.lanes.get(model.trunk)!));
  const length = (iv: { x0: number; x1: number }) => (iv.x1 === Infinity ? Number.MAX_SAFE_INTEGER : iv.x1 - iv.x0);
  const rest = [...model.lanes.values()].filter((L) => L.name !== model.trunk).map((L) => ({ L, iv: extent(L) }));
  rest.sort((a, b) => a.L.depth - b.L.depth || length(a.iv) - length(b.iv) || a.iv.x0 - b.iv.x0 || a.L.name.localeCompare(b.L.name));
  for (const { L, iv } of rest) {
    let c = L.parent && col.has(L.parent) ? col.get(L.parent)! + 1 : 0;
    while (!free(c, iv)) c++;
    take(L.name, c, iv);
  }
  return col;
}

// ------------------------------------------------------------------------------------------------ the list's rows

/** The lanes live through a row: column → lane. */
export type Live = Map<number, string>;

export type Row =
  /** The top: the branches still open, by their end words. */
  | { kind: "now"; key: string; t: number; tags: string[]; live: Live }
  | { kind: "day"; key: string; dk: string; t: number; live: Live; cards: number; against: number; waiting: number; merges: number }
  /** A day folded into one row: what it held, and the lanes at its top and bottom. */
  | { kind: "fold"; key: string; dk: string; t: number; top: Live; bottom: Live; cards: number; against: number; gone: number; began: string[]; merged: number }
  /** A run of cards (and commits) the filter hides. */
  | { kind: "more"; key: string; t: number; keys: string[]; cards: number; commits: number; live: Live }
  /** An idle lane's end, just above its last event. */
  | { kind: "end"; key: string; lane: string; t: number; live: Live; col: number }
  /** A card, a commit, a merge or a fork: its column, and for a merge or a fork the other end's. */
  | { kind: "event"; key: string; e: Event; t: number; live: Live; above: Live; below: Live; col: number | null; other?: number };

export interface Rows {
  rows: Row[];
  /** How many columns the lanes take; a loose commit is drawn in the one after. */
  cols: number;
  loose: boolean;
}

/**
 * The history as rows, newest first, each with what its gutter draws. A day other than the latest folds into one row,
 * unless it has a card waiting or held back, a card the filter matches, or the reader has opened it.
 */
export function listRows(model: Model, columns: Map<string, number>, opts: { commits: boolean; filter?: ((c: BCard) => boolean) | undefined; open: Set<string>; cap?: number }): Rows {
  const cap = opts.cap ?? COLUMNS;
  const col = (name: string) => Math.min(columns.get(name) ?? 0, cap - 1);
  const lanes = [...model.lanes.values()];
  // Each lane's time in its column: from where it began to its merge (or now; or its last event, when idle).
  const span = new Map(
    lanes.map((L) => [
      L.name,
      {
        start: L.name === model.trunk || !L.parent ? -Infinity : L.first,
        end: L.end.kind === "merged" ? L.end.merge.t : L.end.kind === "open" && L.end.idleSince !== null ? L.last + 0.4 : Infinity,
        col: col(L.name),
      },
    ]),
  );
  const liveAt = (t: number): Live => {
    const cols: Live = new Map();
    for (const [name, s] of span) if (s.start < t && t < s.end) cols.set(s.col, name);
    return cols;
  };
  const byDay = new Map<string, Event[]>();
  for (const e of model.events) byDay.set(dayKey(e.t), [...(byDay.get(dayKey(e.t)) ?? []), e]);
  const days = [...byDay.keys()].sort().reverse();
  const pending = (e: Event) => e.kind === "card" && (e.card.state === "waiting" || e.card.state === "aside");
  const rows: Row[] = [];
  const open = lanes.filter((L) => L.end.kind === "open" && L.end.idleSince === null);
  rows.push({ kind: "now", key: "now", t: model.nowT, tags: open.map((L) => L.name), live: liveAt(model.nowT - 0.1) });
  for (const dk of days) {
    const all = byDay.get(dk)!;
    const tTop = all.at(-1)!.t;
    const tBottom = all[0]!.t;
    const cardsOf = all.filter((e): e is Extract<Event, { kind: "card" }> => e.kind === "card");
    const match = opts.filter ? cardsOf.some((e) => opts.filter!(e.card)) : false;
    rows.push({ kind: "day", key: `day:${dk}`, dk, t: tTop + 0.5, live: liveAt(tTop + 0.5), cards: cardsOf.length, against: cardsOf.filter((e) => e.card.state === "against").length, waiting: cardsOf.filter((e) => e.card.state === "waiting").length, merges: all.filter((e) => e.kind === "merge").length });
    const folded = !opts.open.has(dk) && dk !== days[0] && !all.some(pending) && !match;
    if (folded) {
      const began = all.filter((e) => e.kind === "fork").map((e) => model.lanes.get(e.lane!)!.short);
      rows.push({
        kind: "fold",
        key: `fold:${dk}`,
        dk,
        t: tBottom,
        top: liveAt(tTop + 0.5),
        bottom: liveAt(tBottom - 0.5),
        cards: cardsOf.length,
        against: cardsOf.filter((e) => e.card.state === "against").length,
        gone: cardsOf.filter((e) => e.card.state === "gone").length,
        began,
        merged: all.filter((e) => e.kind === "merge" && e.ends).length,
      });
      continue;
    }
    let run: Extract<Row, { kind: "more" }> | null = null;
    for (const e of [...all].reverse()) {
      if (e.kind === "commit" && !opts.commits) continue;
      // An idle lane's end goes just above its last event.
      for (const L of lanes) {
        if (L.end.kind !== "open" || L.end.idleSince === null || Math.abs(L.last - e.t) >= 1) continue;
        if (e.lane === L.name || (e.kind === "merge" && e.into === L.name)) rows.push({ kind: "end", key: `end:${L.name}`, lane: L.name, t: L.last + 0.2, live: liveAt(L.last + 0.2), col: col(L.name) });
      }
      const hidden = opts.filter && (e.kind === "card" ? !opts.filter(e.card) : e.kind === "commit");
      if (hidden) {
        if (!run) rows.push((run = { kind: "more", key: `more:${e.key}`, t: e.t, keys: [], cards: 0, commits: 0, live: new Map() }));
        run.keys.push(e.key);
        if (e.kind === "card") run.cards++;
        else run.commits++;
        run.live = liveAt(e.t - 0.1);
        continue;
      }
      run = null;
      const r: Extract<Row, { kind: "event" }> = { kind: "event", key: e.key, e, t: e.t, live: liveAt(e.t), above: liveAt(e.t + 0.1), below: liveAt(e.t - 0.1), col: null };
      if (e.kind === "card" || e.kind === "commit") r.col = e.lane ? col(e.lane) : null;
      if (e.kind === "merge") (r.col = col(e.into)), (r.other = col(e.lane));
      if (e.kind === "fork") (r.col = col(e.from)), (r.other = col(e.lane));
      rows.push(r);
    }
  }
  const n = Math.max(0, ...[...model.lanes.keys()].map(col)) + 1;
  return { rows, cols: model.lanes.size ? Math.min(cap, n) : 0, loose: opts.commits && model.loose.commits.length > 0 };
}

// ------------------------------------------------------------------------------------------------ words

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
/** A count that starts a sentence is a word. */
const lead = (n: number) => WORDS[n] ?? String(n);
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const listOf = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const dayWords = (t: number) => new Date(t).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const hm = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** The words at the end of a lane with no merge ending it. */
export function endWords(L: Lane): string {
  const e = L.end;
  if (e.kind !== "open") return "";
  const st = e.waiting ? `Merge held: ${e.waiting} waiting` : "every card answered";
  // A merge recorded before something else happened on the branch ended nothing: say so, not "no merge".
  const none = e.since ? `No merge recorded after ${dayWords(e.since.gitT)}, ${hm(e.since.gitT)}` : "No merge recorded";
  return `${none} · ${st}${e.idleSince !== null ? ` · idle since ${dayWords(e.idleSince)}` : ""}`;
}

/** The opening words: what needs you first (lead), then the counts (body), the branches with no merge, and the commits. */
export function statusOf(model: Model): { lead: string; body: string; open: Lane[]; cites: string } {
  const c = model.counts;
  if (!c.cards) return { lead: "No cards yet.", body: "A branch appears here once an agent files a card on it.", open: [], cites: "" };
  const held = c.held.map((L) => L.short);
  const first = c.waiting ? `${c.waiting === 1 ? "One card is" : `${lead(c.waiting)} cards are`} waiting for you${held.length ? `, holding ${listOf(held)} from merging` : ""}.` : "Nothing is waiting for you.";
  const answered = c.against ? `you chose otherwise than the agent on ${c.against}` : c.with ? "you chose the agent's pick on every one you answered" : "none answered yet";
  const body = [
    `${plural(c.cards, "card")} on ${plural(c.branches, "branch", "branches")}: ${answered}${c.gone ? `, and ${c.gone} ${c.gone === 1 ? "was" : "were"} withdrawn` : ""}.`,
    c.merged ? `${lead(c.merged)} ${c.merged === 1 ? "branch has" : "branches have"} merged.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const more = model.loose.branches.length;
  const cites = c.commits ? `${plural(c.commits, "commit")} cite ${c.cited} of the cards${more ? `; ${plural(more, "more branch", "more branches")} ${more === 1 ? "has" : "have"} commits but no cards` : ""}.` : "";
  return { lead: first, body, open: c.open, cites };
}

/** What the panel opens on: the oldest card waiting for you; else the latest card. */
export function openingKey(model: Model): string | null {
  const waiting = model.cards.filter((c) => c.state === "waiting").sort((a, b) => a.t - b.t)[0];
  const latest = model.cards.at(-1);
  const c = waiting ?? latest;
  return c ? `card:${c.id}` : null;
}

/** The keys a row is linked to: a card's commits (a merge's, for its own commit), a commit's cards, a merge's cards. */
export function linkedKeys(model: Model, key: string | null): string[] {
  if (!key) return [];
  if (key.startsWith("card:")) return (model.citedBy.get(key.slice(5)) ?? []).map((c) => (c.folded ? c.folded.key : `commit:${c.hash}`));
  if (key.startsWith("commit:")) return (model.commitByHash.get(key.slice(7))?.cards ?? []).map((id) => `card:${id}`);
  if (key.startsWith("merge:")) {
    const mg = model.merges.find((m) => m.key === key);
    return mg ? [...new Set([...(mg.own?.cards ?? []), ...mg.cards])].map((id) => `card:${id}`) : [];
  }
  return [];
}

/** The days, oldest first, with how many cards each has: for "Go to". */
export function daysOf(model: Model): { key: string; t: number; cards: number }[] {
  const out = new Map<string, { key: string; t: number; cards: number }>();
  for (const e of model.events) {
    const k = dayKey(e.t);
    if (!out.has(k)) out.set(k, { key: k, t: e.t, cards: 0 });
    if (e.kind === "card") out.get(k)!.cards++;
  }
  return [...out.values()];
}
