import type { ApiCard, ApiCommit, ApiMerge, ApiState } from "../../src/api";
import { agentOf, isHard } from "./model";
import { type Team, chatWhose, passedBy, shared, waitsForMe, whoGave } from "./team";

// D181, redrawn (B-v8jzy, B-vfdhz, B-tgq5p): a project's decisions by branch, as a list, newest first, with each branch a
// line in a gutter of fixed columns beside it. Pure: what happened, and the rows that show it, for `<BranchesDrawer />`
// (Branches.tsx) to draw, from the state the local server and the relay both serve. Ported from the design loop's
// reference model (`branchModel`, `phoneRows`, `statusOf`, `shortNames`), less the across view it also drew (B-v8jzy
// chose the list everywhere), and less its 60-second rule for commits after a merge (B-w41p7 chose to record what a merge
// brought, not to infer it).
//
//   branchModel(state, opts) -> Model   what happened: lanes, parents, ends, one entry per commit, events in order
//   spansOf(model)           -> Map     each lane's stretch of the events' order, from its fork to its merge or end
//   columnsOf(model)         -> Map     each lane's column in the gutter, reused once a lane has merged
//   listRows(model, cols, o) -> rows    the history as rows, newest first, with the lanes live through each
//   strokesOf(row, rows, m)  -> Stroke[] what a row's gutter draws, as the drawer draws it
//   gutterOf(cols, wide)     -> pitch   the gutter's spacing, and how many columns fit its width (B-cjqxz)
//   statusOf(model)          -> words   the opening sentences
//   shortNames(names)        -> Map     names that keep the part that tells branches apart

/** How a card's mark is drawn: chosen as the agent picked, otherwise, waiting, set aside (settled at merge), or gone. */
export type MarkState = "with" | "against" | "waiting" | "aside" | "gone";

/**
 * What the panel reads. `defaultBranch` is the repo's default branch (B-jr8mk: the state will carry it); until the
 * command line sends it, the trunk is guessed (`trunkOf()`).
 */
export type BranchesState = Pick<ApiState, "cards" | "merges" | "commits"> & { defaultBranch?: string };

/**
 * A branch with nothing for this long, and no merge recorded after it, is idle: its end moves down to its last event, and
 * its column is free again; unless a card on it is waiting for you (B-srtcs), which keeps it at the top.
 */
export const IDLE_MS = 24 * 3600_000;
/** How far back a guessed parent's own events count, for "busiest before". */
const BUSY_MS = 6 * 3600_000;

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

/**
 * What happened to a card, in a few words. In a project with members (`team`, P20), an answer is named for whoever gave
 * it, "you" only when it was you; and a card another member passed on is waiting for you.
 */
export function saidOf(c: ApiCard, nowMs: number, team?: Team): { words: string; tone: MarkState } {
  const st = markState(c);
  const last = c.verdicts.filter((v) => v.revision === c.meta.revision).at(-1);
  const who = whoGave(last, team);
  switch (c.status) {
    case "withdrawn":
      return { words: "withdrawn by its agent", tone: st };
    case "superseded":
      return { words: "superseded by a later decision", tone: st };
    case "held":
      return { words: `held back by ${shared(team) ? "the project's" : "your"} settings: ${agentOf(c)} went ahead`, tone: st };
    case "deferred":
      return { words: `${who} deferred it`, tone: st };
    case "returned":
      return { words: last?.response === "reject" ? `${who} rejected it: returned to its agent` : "returned to its agent", tone: st };
    case "rerouted": {
      if (!team) return { words: "you passed it on: waiting for someone else", tone: st };
      const passed = passedBy(c);
      if (passed.includes(team.me)) return { words: "you passed it on: waiting for someone else", tone: st };
      // Whoever it was sent to comes first; else whoever passed it. Nobody named, from before the repo was linked.
      const by = c.sent_to !== undefined && passed.includes(c.sent_to) ? c.sent_to : passed[0];
      const name = by === undefined ? undefined : (team.handles.get(by) ?? "someone who has left");
      if (waitsForMe(c, team)) return { words: `${name} passed it on: waiting for you`, tone: st };
      // Passed on before the repo was linked, by the one reviewer there was: you, if you're still the only member.
      if (!name && !shared(team)) return { words: "you passed it on: waiting for someone else", tone: st };
      return { words: name ? `${name} passed it on` : "passed on", tone: st };
    }
    case "open":
      // A card only owners answer isn't a member's to answer (B-rxbss).
      if (!waitsForMe(c, team)) return { words: "waiting for an owner", tone: st };
      return { words: c.waiting.some((w) => nowMs - Date.parse(w.at) <= 90_000) ? `${agentOf(c)} has stopped: waiting for you` : "waiting for you", tone: st };
    default:
      // A choice answered in chat, confirmed here (B-hswmx): the pick was that answer.
      if (st === "with" && last?.seen) return { words: `${who} confirmed “${c.meta.proposal}”, ${chatWhose(c, team, who)} answer in chat`, tone: st };
      if (st === "with") return { words: `${who} chose “${c.meta.proposal}”, the agent's pick${last?.first_choice === "alternative" ? ", after reading its case" : ""}`, tone: st };
      if (last?.response === "alternative") return { words: `${who} chose “${c.meta.alternative}”, not the agent's pick`, tone: st };
      return { words: `${who} answered “${last?.choice ?? c.decision ?? last?.response ?? "otherwise"}”`, tone: st };
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
  /** Its mark: "waiting" holds its branch's merge (open, returned to its agent, or passed on), as `verify --merge` counts. */
  state: MarkState;
  /** Waiting for you to answer: open. One returned to its agent, or passed on to someone else, holds the merge, but not for you. */
  forYou: boolean;
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
  /** Whether it ends its branch: nothing happened on the branch after it, and it went into a branch that didn't begin from it. */
  ends: boolean;
  /** Into a branch that began from it (its parent chain leads back to it): a sync, which ends nothing (B-9v07y). */
  sync: boolean;
}

export type LaneEnd =
  | { kind: "trunk"; quietSince: number }
  | { kind: "merged"; into: string; at: string; merge: Merge }
  /**
   * No merge ends it: `waiting` cards hold its merge (`verify --merge`); `since`, a merge recorded before its last event (a
   * sync never is). `idleSince`, its last event, when that was a day ago; `down`, its end moved down to it and its column
   * freed, which a card waiting for you prevents (B-srtcs).
   */
  | { kind: "open"; waiting: number; aside: number; idleSince: number | null; down: boolean; since?: Merge };

export interface Lane {
  name: string;
  short: string;
  cards: BCard[];
  commits: Commit[];
  out: Merge[];
  in: Merge[];
  /** Where it began, when a record says (B-c4efj): it was brought up to another branch's tip before any work of its own. */
  began?: Merge;
  /** The branch it began from: the one a record says it was brought up to, the one it merged into, or a guess. */
  parent: string | null;
  parentWhy: "began" | "merged" | "guess" | null;
  depth: number;
  /** Its first and last events, in ms, and its last card or commit. */
  first: number;
  last: number;
  lastOwn: number;
  end: LaneEnd;
}

export type Event =
  /** Where a branch began. One a record places (`start`, B-c4efj) sits in its second with the merges, after any into `from`. */
  | { kind: "fork"; key: string; t: number; rank: 0 | 3; lane: string; from: string; guess: boolean; start?: Merge }
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
  /** Records of a branch brought up to another's tip before any work of its own: where it began, not merges (B-c4efj). */
  starts: Merge[];
  loose: { branches: string[]; commits: Commit[] };
  events: Event[];
  /** Cards on the relay's branch or a detached HEAD: counted, not drawn. */
  offLane: number;
  counts: {
    cards: number;
    with: number;
    against: number;
    /** Cards waiting for you (`BCard.forYou`). */
    waiting: number;
    aside: number;
    gone: number;
    hard: number;
    branches: number;
    merged: number;
    /** Of those merged, the branches with commits but no cards of their own. */
    mergedBare: number;
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

/** The part of a name that differs is a hex ID (an agent's, a commit's): seven characters of it are enough. */
const HEX_ID = /^(?=.*\d)[0-9a-f]{7,}$/i;
/** Where a name's words end: before each separator, and at its end. */
const wordEnds = (s: string) => [...[...s].flatMap((ch, i) => (i > 0 && /[-/_.]/.test(ch) ? [i] : [])), s.length];
/** How much of a name's differing words are kept, at most, unless more are needed to tell it apart. */
const WORDS_KEPT = 28;

/**
 * Short names (B-my3az): a long name that shares a prefix with others keeps one word of the prefix and the part that
 * differs. Where that part is a hex ID it keeps 7 characters, more until it's unique (`worktree-agent-a0bd0dd57881ac741`
 * → `worktree a0bd0dd`), so it never reads as a commit's ID; where it's words it keeps whole words, up to 28 characters,
 * then "…", a word more until it's unique (`feature/checkout-and-payments-refactor` → `feature checkout-and-payments…`).
 * Any other name is kept whole up to 28 characters, then loses its middle.
 */
export function shortNames(names: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const words: { n: string; head: string; rest: string; ends: number[]; i: number }[] = [];
  for (const n of names) {
    let p = "";
    for (let i = 0; i < n.length; i++) if ((n[i] === "-" || n[i] === "/") && names.some((o) => o !== n && o.startsWith(n.slice(0, i + 1)))) p = n.slice(0, i + 1);
    if (!p || n.length <= 20) {
      out.set(n, n.length <= 28 ? n : `${n.slice(0, 15)}…${n.slice(-10)}`);
      continue;
    }
    const rest = n.slice(p.length);
    const head = p.replace(/[-/]+$/, "").split(/[-/]/)[0]!;
    if (HEX_ID.test(rest)) {
      const fam = names.filter((o) => o !== n && o.startsWith(p)).map((o) => o.slice(p.length));
      let k = Math.min(7, rest.length);
      while (k < rest.length && fam.some((f) => f.slice(0, k) === rest.slice(0, k))) k++;
      out.set(n, `${head} ${rest.slice(0, k)}`);
      continue;
    }
    // Words: all but the prefix's first, as many whole ones as fit, and at least one. Two names that share more than a
    // word of their prefix (`gus/rework-the-flow-a`, `gus/rework-the-flow-b`) keep what they share, as far as it fits.
    const all = n.slice(head.length + 1);
    const ends = wordEnds(all);
    let i = 0;
    while (i + 1 < ends.length && ends[i + 1]! <= WORDS_KEPT) i++;
    words.push({ n, head, rest: all, ends, i });
  }
  const show = (w: (typeof words)[number]) => `${w.head} ${w.rest.slice(0, w.ends[w.i])}${w.ends[w.i]! < w.rest.length ? "…" : ""}`;
  // Names that would read the same keep a word more each, until they don't.
  for (let pass = 0; pass < 64; pass++) {
    const same = new Map<string, typeof words>();
    for (const w of words) same.set(show(w), [...(same.get(show(w)) ?? []), w]);
    const grow = [...same.values()].filter((g) => g.length > 1).flat().filter((w) => w.i + 1 < w.ends.length);
    if (!grow.length) break;
    for (const w of grow) w.i++;
  }
  for (const w of words) out.set(w.n, show(w));
  return out;
}

/**
 * A merge's row key: its commit, the branch merged and the one it went into. Two worktrees fast-forwarded to one tip are
 * two merges of one branch at one commit, so the target is part of it.
 */
export const mergeKey = (m: Pick<ApiMerge, "commit" | "branch" | "into">) => `merge:${m.commit.slice(0, 12)}:${m.branch}:${m.into}`;

/**
 * The same merge found twice with nothing on its branch between is one: a pull that merged where the branch had moved
 * on finds its own merge besides the one made where it was pushed.
 */
function distinctMerges(merges: ApiMerge[], activity: Map<string, number[]>): ApiMerge[] {
  const out: ApiMerge[] = [];
  const last = new Map<string, ApiMerge>();
  const seen = new Set<string>();
  for (const m of [...merges].sort((a, b) => a.at.localeCompare(b.at))) {
    // One merge, one key (`mergeKey()`): the same record found twice, under two names, is one.
    if (seen.has(mergeKey(m))) continue;
    seen.add(mergeKey(m));
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
export function trunkOf(lanes: Map<string, Pick<Lane, "name" | "in" | "out" | "first" | "last">>, defaultBranch?: string): { name: string | null; known: boolean } {
  if (defaultBranch) return { name: lanes.has(defaultBranch) ? defaultBranch : null, known: true };
  const named = TRUNK_NAMES.find((n) => lanes.has(n));
  if (named) return { name: named, known: false };
  const into = [...lanes.values()].filter((L) => L.in.length && !L.out.length).sort((a, b) => b.last - b.first - (a.last - a.first) || a.first - b.first);
  return { name: into[0]?.name ?? null, known: false };
}

/**
 * What happened, by branch. In a project with members (`team`, P20), a card is "for you" when it waits for you
 * (`waitsForMe()`): one another member passed on is, and one only owners answer isn't, unless you're one.
 */
export function branchModel(state: BranchesState, opts: { nowMs: number; idleMs?: number; team?: Team | undefined }): Model {
  const idleMs = opts.idleMs ?? IDLE_MS;
  // Now is never before the last thing that happened: a clock a few seconds behind the machine that made a commit (or a
  // model built a minute ago) mustn't leave a branch that's still open short of the top.
  const times = [...state.cards.map((c) => Date.parse(c.meta.created)), ...(state.commits ?? []).map((c) => Date.parse(c.at)), ...(state.merges ?? []).map((m) => Date.parse(m.at) + 999)].filter((t) => !Number.isNaN(t));
  const nowT = Math.max(opts.nowMs, ...times.map((t) => t + 1));
  const offLane = state.cards.filter((c) => noLane(c.meta.source_branch)).length;
  const cards: BCard[] = state.cards
    .filter((c) => !noLane(c.meta.source_branch))
    .map((c) => ({ id: c.meta.id, card: c, title: c.meta.title, branch: c.meta.source_branch, agent: agentOf(c), t: Date.parse(c.meta.created), state: markState(c), forYou: waitsForMe(c, opts.team), hard: isHard(c) }))
    .sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const commits = commitsOf(state.commits ?? []);
  const commitByHash = new Map(commits.map((c) => [c.hash, c]));
  // A commit a merge says it brought (B-w41p7: its commits and the tip that landed) is before that merge, whatever time its
  // ledger entry was written, which can be seconds after git's time for the merge.
  for (const m of state.merges ?? []) {
    const mt = Date.parse(m.at);
    for (const h of [...(m.commits ?? []), ...(m.tip ? [m.tip] : [])]) {
      const c = commitByHash.get(h);
      if (c && c.branch === m.branch && c.t >= mt) c.t = mt - 1;
    }
  }

  // Every branch's own activity, its cards and commits: what tells a merge found twice from two, and a start from a merge.
  const activity = new Map<string, number[]>();
  const act = (b: string, t: number) => activity.set(b, [...(activity.get(b) ?? []), t]);
  for (const c of cards) act(c.branch, c.t);
  for (const c of commits) act(c.branch, c.t);
  const raw = (state.merges ?? []).filter((m) => m.branch !== m.into && !noLane(m.branch) && !noLane(m.into));
  const recorded: Merge[] = distinctMerges(raw, activity).map((m) => ({ ...m, gitT: Date.parse(m.at), t: Date.parse(m.at) + 999, key: mergeKey(m), ends: false, sync: false }));
  /** The branches drawn: every branch with a card, or named by a merge. Branches with commits only are loose. */
  const named = (ms: Merge[]) => {
    const names: string[] = [];
    const add = (n: string) => {
      if (!noLane(n) && !names.includes(n)) names.push(n);
    };
    for (const c of cards) add(c.branch);
    for (const m of ms) add(m.branch), add(m.into);
    return names;
  };

  // The trunk, with every record counted as a merge: it never began from another branch.
  const trunk = trunkOf(
    new Map(
      named(recorded).map((n) => {
        const out = recorded.filter((m) => m.branch === n);
        const into = recorded.filter((m) => m.into === n);
        const ts = [...(activity.get(n) ?? []), ...out.map((m) => m.t), ...into.map((m) => m.t)];
        return [n, { name: n, in: into, out, first: Math.min(...ts), last: Math.max(...ts) }];
      }),
    ),
    state.defaultBranch,
  );
  // Where a branch began, when a record says (B-c4efj): the first record into a branch with nothing of its own before it
  // (no card, no commit citing one, no merge out of it) is that branch brought up to the other's tip as it began, not a
  // merge. One into a branch with work of its own before it is a merge.
  const firstIn = new Map<string, Merge>();
  for (const m of [...recorded].sort((a, b) => a.t - b.t || a.key.localeCompare(b.key))) if (!firstIn.has(m.into)) firstIn.set(m.into, m);
  const starts = [...firstIn].filter(([b, m]) => b !== trunk.name && !(activity.get(b) ?? []).some((t) => t < m.gitT) && !recorded.some((o) => o.branch === b && o.t < m.t)).map(([, m]) => m);
  const merges = recorded.filter((m) => !starts.includes(m));

  const names = named(merges);
  const short = shortNames([...new Set([...names, ...commits.filter((c) => !noLane(c.branch)).map((c) => c.branch)])]);
  const lanes = new Map<string, Lane>(
    names.map((n) => [n, { name: n, short: short.get(n) ?? n, cards: [], commits: [], out: [], in: [], parent: null, parentWhy: null, depth: 0, first: Infinity, last: -Infinity, lastOwn: -Infinity, end: { kind: "open", waiting: 0, aside: 0, idleSince: null, down: false } }]),
  );
  const laneOf = (n: string) => lanes.get(n)!;
  for (const c of cards) laneOf(c.branch).cards.push(c);
  for (const m of merges) {
    // The commit git recorded for the merge, when it's in the ledger too, is the merge's: one mark, not two.
    const own = commitByHash.get(m.commit);
    if (own && !own.folded) (own.folded = m), (m.own = own);
    laneOf(m.branch).out.push(m);
    laneOf(m.into).in.push(m);
  }
  // A start is drawn from the branch it was brought up to, where both are drawn.
  for (const m of starts) if (lanes.has(m.into) && lanes.has(m.branch)) laneOf(m.into).began = m;
  const loose: Model["loose"] = { branches: [], commits: [] };
  for (const c of commits) {
    if (c.folded) continue;
    // A detached HEAD's commit (from before rebases kept their branch) is loose too: drawn, never put on a branch.
    if (lanes.has(c.branch)) laneOf(c.branch).commits.push(c);
    else loose.commits.push(c), loose.branches.includes(c.branch) || loose.branches.push(c.branch);
  }
  // Each lane's last merge out, with nothing on it after (no card, commit, or merge into it): its end, unless a sync.
  const lastOut = new Map<string, Merge>();
  for (const L of lanes.values()) {
    const own = [...L.cards.map((c) => c.t), ...L.commits.map((c) => c.t)];
    const began = L.began ? [L.began.t] : [];
    L.lastOwn = own.length ? Math.max(...own) : -Infinity;
    L.first = Math.min(...own, ...L.out.map((m) => m.t), ...L.in.map((m) => m.t), ...began);
    L.last = Math.max(L.lastOwn, ...L.out.map((m) => m.t), ...L.in.map((m) => m.t), ...began);
    const m = [...L.out].sort((a, b) => a.t - b.t).at(-1);
    if (m && L.name !== trunk.name && !(L.lastOwn > m.t || L.in.some((o) => o.t > m.t))) lastOut.set(L.name, m);
  }

  // Parents: where a record says it began; else the branch it merged into; else a guess among branches open when it began
  // (never one already merged). A merge into a branch whose parent chain leads back to its own (a sync, B-9v07y) ends
  // nothing, and makes no parent: found by looking again until there are no more.
  const order = [...lanes.values()].sort((a, b) => a.first - b.first || a.name.localeCompare(b.name));
  const sync = new Set<Merge>();
  const endMerge = new Map<string, Merge>();
  const parents = () => {
    endMerge.clear();
    for (const [n, m] of lastOut) if (!sync.has(m)) endMerge.set(n, m);
    for (const L of order) {
      L.parent = null;
      L.parentWhy = null;
      if (L.name === trunk.name) continue;
      if (L.began) {
        L.parent = L.began.branch;
        L.parentWhy = "began";
        continue;
      }
      const into = (endMerge.get(L.name) ?? L.out.find((m) => !sync.has(m)))?.into;
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
  };
  /** Whether `child` began from `from`, through its parents: each one there before the branch it's the parent of. */
  const beganFrom = (child: string, from: string) => {
    const seen = new Set<string>();
    for (let L = laneOf(child); L.parent && !seen.has(L.parent) && laneOf(L.parent).first <= L.first; L = laneOf(L.parent)) {
      if (L.parent === from) return true;
      seen.add(L.parent);
    }
    return false;
  };
  // Each pass finds a sync or stops, so this ends with the parents of the last.
  for (let pass = 0; pass <= merges.length; pass++) {
    parents();
    const found = merges.filter((m) => !sync.has(m) && beganFrom(m.into, m.branch));
    if (!found.length) break;
    for (const m of found) sync.add(m), (m.sync = true);
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
      // Its end words name the last merge out it carried on after, never a sync (B-9v07y).
      const since = L.out.filter((m) => !m.sync).sort((a, b) => a.t - b.t).at(-1);
      const idle = nowT - L.last > idleMs;
      L.end = {
        kind: "open",
        waiting: L.cards.filter((c) => c.state === "waiting").length,
        aside: L.cards.filter((c) => c.state === "aside").length,
        idleSince: idle ? L.last : null,
        // A card waiting for you keeps it at the top however long it's idle (B-srtcs).
        down: idle && !L.cards.some((c) => c.forYou),
        ...(since ? { since } : {}),
      };
    }
  }

  // Every event, in the order it happened: where a branch began, its cards and commits, its merges.
  const events: Event[] = [];
  for (const L of lanes.values()) {
    if (!L.parent) continue;
    // A start a record places is in its second with the merges, ordered among them below.
    const start = L.parentWhy === "began" ? L.began : undefined;
    events.push({ kind: "fork", key: `fork:${L.name}`, lane: L.name, from: L.parent, guess: L.parentWhy === "guess", t: L.first, rank: start && start.t === L.first ? 3 : 0, ...(start ? { start } : {}) });
  }
  for (const c of cards) events.push({ kind: "card", key: `card:${c.id}`, lane: c.branch, card: c, t: c.t, rank: 1 });
  for (const L of lanes.values()) for (const c of L.commits) events.push({ kind: "commit", key: `commit:${c.hash}`, lane: L.name, commit: c, t: c.t, rank: 2 });
  for (const c of loose.commits) events.push({ kind: "commit", key: `commit:${c.hash}`, lane: null, commit: c, t: c.t, rank: 2 });
  for (const m of merges) events.push({ kind: "merge", key: m.key, lane: m.branch, into: m.into, merge: m, ends: m.ends, t: m.t, rank: 3 });
  // Merges and recorded starts in one second (two records at one commit, as 952d56b has): one into a branch comes before
  // one out of it, or a start from it, since it made the commit the other moved to (A into B, then C brought up to B).
  const moves = (e: Event) => (e.kind === "merge" ? { from: e.lane, to: e.into } : e.kind === "fork" && e.rank === 3 ? { from: e.from, to: e.lane } : null);
  const step = new Map<string, number>();
  const stepOf = (e: Event) => step.get(e.key) ?? 0;
  const sameSecond = new Map<number, Event[]>();
  for (const e of events) if (moves(e)) sameSecond.set(e.t, [...(sameSecond.get(e.t) ?? []), e]);
  for (const es of sameSecond.values()) if (es.length > 1) for (let pass = 0; pass < 4; pass++) for (const e of es) for (const o of es) if (o !== e && moves(o)!.to === moves(e)!.from) step.set(e.key, Math.max(stepOf(e), stepOf(o) + 1));
  events.sort((a, b) => a.t - b.t || a.rank - b.rank || stepOf(a) - stepOf(b) || a.key.localeCompare(b.key));
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
    starts,
    loose,
    events,
    offLane,
    counts: {
      cards: cards.length,
      with: count("with"),
      against: count("against"),
      waiting: cards.filter((c) => c.forYou).length,
      aside: count("aside"),
      gone: count("gone"),
      hard: cards.filter((c) => c.hard).length,
      branches: all.filter((l) => l.cards.length).length,
      merged: all.filter((l) => l.end.kind === "merged").length,
      mergedBare: all.filter((l) => l.end.kind === "merged" && !l.cards.length).length,
      open: all.filter((l) => l.end.kind === "open"),
      held: all.filter((l) => l.end.kind === "open" && l.end.waiting > 0),
      commits: commits.length,
      cited: [...citedBy.keys()].filter((id) => cardById.has(id)).length,
    },
  };
}

// ------------------------------------------------------------------------------------------------ the gutter's columns

/**
 * A lane's time in its column, as positions in the events' order (`Model.events`, by index), not as times: events in one
 * second (two merges at one commit, a fork and the card it precedes) are distinct rows, and a branch's line runs through
 * every row between its fork and its merge. An event at index i sits at i; the gap above it, toward newer, at i + 0.5.
 */
export interface Span {
  /** Its fork's index; -Infinity for the trunk and a lane with no parent, whose line runs down off the list's bottom. */
  start: number;
  /** Its merge's index; Infinity while it's open; for one idle, just past its end row, in the gap above its last event. */
  end: number;
  /** An idle lane's end row: in the gap above event `after`, at position `at` (`end` is just above it). */
  endRow?: { after: number; at: number };
}

/**
 * Each lane's span (`Span`). An idle lane's line reaches its last event, a merge into it, or a fork from it (G-8: a branch
 * guessed to begin from it is drawn from a line that's there), and its end row goes just above that; two ending above the
 * same event are stacked, one above the other.
 */
export function spansOf(model: Model): Map<string, Span> {
  const index = new Map(model.events.map((e, i) => [e.key, i]));
  const fork = new Map<string, number>();
  const last = new Map<string, number>();
  const touch = (n: string | null, i: number) => {
    if (n) last.set(n, i);
  };
  model.events.forEach((e, i) => {
    if (e.kind === "fork") fork.set(e.lane, i), touch(e.from, i);
    else if (e.kind === "merge") touch(e.lane, i), touch(e.into, i);
    else touch(e.lane, i);
  });
  const spans = new Map<string, Span>();
  const idle = new Map<number, string[]>();
  for (const L of model.lanes.values()) {
    const start = fork.get(L.name) ?? -Infinity;
    const end = L.end.kind === "merged" ? index.get(L.end.merge.key)! : Infinity;
    spans.set(L.name, { start, end });
    if (L.end.kind === "open" && L.end.down) {
      const after = last.get(L.name) ?? Math.max(0, start);
      idle.set(after, [...(idle.get(after) ?? []), L.name]);
    }
  }
  for (const [after, names] of idle) {
    names.sort().forEach((name, j) => {
      const at = after + 0.5 + 0.01 * j;
      Object.assign(spans.get(name)!, { end: at + 0.005, endRow: { after, at } });
    });
  }
  return spans;
}

/**
 * Each lane's column in the gutter (B-tgq5p: fixed rows, gaps where curves cross): the trunk first; then by depth,
 * shortest first, each in the first column right of its parent's that's free over its time, from where it began to its
 * merge (to now, for one still open; to its last event, for one idle). A short branch inside a longer one's time sits
 * nearer the parent, so the longer one's curves don't cross it; open and held branches, the longest, go outermost.
 * A column is reused once the lane in it has merged. Time here is the events' order: the list gives each its row.
 */
export function columnsOf(model: Model, spans: Map<string, Span> = spansOf(model)): Map<string, number> {
  const extent = (L: Lane) => {
    const s = spans.get(L.name)!;
    return { x0: s.start, x1: s.end };
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
  /** The top: the branches still open, by their end words; `dated` when now isn't on the newest day shown (B-srtcs). */
  | { kind: "now"; key: string; t: number; tags: string[]; live: Live; dated: boolean }
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
  /** How many columns the lanes take, one for each branch open at once (B-cjqxz); a loose commit is drawn in the one after. */
  cols: number;
  loose: boolean;
}

/**
 * The history as rows, newest first, each with what its gutter draws. A day other than the latest folds into one row,
 * unless it has a card waiting or held back, a card the filter matches, or the reader has opened it.
 */
export function listRows(model: Model, columns: Map<string, number>, opts: { commits: boolean; filter?: ((c: BCard) => boolean) | undefined; open: Set<string>; spans?: Map<string, Span> }): Rows {
  const col = (name: string) => columns.get(name) ?? 0;
  const lanes = [...model.lanes.values()];
  const spans = opts.spans ?? spansOf(model);
  const span = [...spans].map(([name, s]) => ({ name, ...s, col: col(name) }));
  // The lanes live at a position in the events' order (`Span`): at an event's own index, those passing through its row.
  const liveAt = (x: number): Live => {
    const cols: Live = new Map();
    for (const s of span) if (s.start < x && x < s.end) cols.set(s.col, s.name);
    return cols;
  };
  const events = model.events;
  const shown = (e: Event) => e.kind !== "commit" || opts.commits;
  // Each idle lane's end row, by the event it goes above, the highest first.
  const endRows = new Map<number, { lane: string; at: number }[]>();
  for (const [lane, s] of spans) if (s.endRow) endRows.set(s.endRow.after, [...(endRows.get(s.endRow.after) ?? []), { lane, at: s.endRow.at }].sort((a, b) => b.at - a.at));
  const byDay = new Map<string, number[]>();
  events.forEach((e, i) => byDay.set(dayKey(e.t), [...(byDay.get(dayKey(e.t)) ?? []), i]));
  // A day with nothing to show (commits only, with the switch off) has no header, and no place in "Go to" (`daysOf()`).
  const days = [...byDay.keys()].filter((dk) => byDay.get(dk)!.some((i) => shown(events[i]!) || endRows.has(i))).sort().reverse();
  const pending = (e: Event) => e.kind === "card" && (e.card.state === "waiting" || e.card.state === "aside");
  const rows: Row[] = [];
  const open = lanes.filter((L) => L.end.kind === "open" && !L.end.down);
  // Above the newest event, past any end row there: what the Now row and a day's header draw.
  rows.push({ kind: "now", key: "now", t: model.nowT, tags: open.map((L) => L.name), live: liveAt(events.length - 0.1), dated: !!days[0] && days[0] !== dayKey(model.nowT) });
  for (const dk of days) {
    const idx = byDay.get(dk)!;
    const all = idx.map((i) => events[i]!);
    const a = idx[0]!;
    const b = idx.at(-1)!;
    const tTop = all.at(-1)!.t;
    const tBottom = all[0]!.t;
    const cardsOf = all.filter((e): e is Extract<Event, { kind: "card" }> => e.kind === "card");
    const match = opts.filter ? cardsOf.some((e) => opts.filter!(e.card)) : false;
    rows.push({ kind: "day", key: `day:${dk}`, dk, t: tTop + 0.5, live: liveAt(b + 0.9), cards: cardsOf.length, against: cardsOf.filter((e) => e.card.state === "against").length, waiting: cardsOf.filter((e) => e.card.forYou).length, merges: all.filter((e) => e.kind === "merge").length });
    const folded = !opts.open.has(dk) && dk !== days[0] && !all.some(pending) && !match;
    if (folded) {
      const began = all.filter((e) => e.kind === "fork").map((e) => model.lanes.get(e.lane!)!.short);
      rows.push({
        kind: "fold",
        key: `fold:${dk}`,
        dk,
        t: tBottom,
        top: liveAt(b + 0.9),
        bottom: liveAt(a - 0.1),
        cards: cardsOf.length,
        against: cardsOf.filter((e) => e.card.state === "against").length,
        gone: cardsOf.filter((e) => e.card.state === "gone").length,
        began,
        merged: all.filter((e) => e.kind === "merge" && e.ends).length,
      });
      continue;
    }
    let run: Extract<Row, { kind: "more" }> | null = null;
    for (const i of [...idx].reverse()) {
      const e = events[i]!;
      // An idle lane's end goes just above its last event, shown or not (G-9), once (G-13); a run a filter folds stops there (G-7).
      for (const end of endRows.get(i) ?? []) {
        run = null;
        const L = model.lanes.get(end.lane)!;
        rows.push({ kind: "end", key: `end:${end.lane}`, lane: end.lane, t: L.last + 0.2, live: liveAt(end.at), col: col(end.lane) });
      }
      if (!shown(e)) continue;
      const hidden = opts.filter && (e.kind === "card" ? !opts.filter(e.card) : e.kind === "commit");
      if (hidden) {
        if (!run) rows.push((run = { kind: "more", key: `more:${e.key}`, t: e.t, keys: [], cards: 0, commits: 0, live: new Map() }));
        run.keys.push(e.key);
        if (e.kind === "card") run.cards++;
        else run.commits++;
        // The lines through the run: those through its oldest event (none begins or ends at a card or a commit).
        run.live = liveAt(i);
        continue;
      }
      run = null;
      const r: Extract<Row, { kind: "event" }> = { kind: "event", key: e.key, e, t: e.t, live: liveAt(i), above: liveAt(i + 0.5), below: liveAt(i - 0.5), col: null };
      if (e.kind === "card" || e.kind === "commit") r.col = e.lane ? col(e.lane) : null;
      if (e.kind === "merge") (r.col = col(e.into)), (r.other = col(e.lane));
      if (e.kind === "fork") (r.col = col(e.from)), (r.other = col(e.lane));
      rows.push(r);
    }
  }
  const n = Math.max(0, ...[...model.lanes.keys()].map(col)) + 1;
  return { rows, cols: model.lanes.size ? n : 0, loose: opts.commits && model.loose.commits.length > 0 };
}

// ------------------------------------------------------------------------------------------------ the gutter's spacing

/** The px between columns: roomy up to five, then narrower to fit the gutter's width, but never under 6 (B-cjqxz). */
const PITCH = { narrow: 14, wide: 18 };
const SPAN = { narrow: 70, wide: 100 };
export const MIN_PITCH = 6;
/** The first column's centre, and the room right of the last. */
const LEFT = 11;
const RIGHT = 13;

/**
 * The gutter's spacing for `cols` columns (B-cjqxz: a column for each branch open at once). Up to five, 14 px apart (18
 * when Wider); past five they narrow to fit 70 px (100), as far as 6 px; past that the gutter widens, but only where
 * that many are drawn: `fits` columns fit its usual width, and a stretch of rows that reaches further needs `width(n)`.
 */
export function gutterOf(cols: number, wide: boolean): { pitch: number; fits: number; x: (c: number) => number; width: (n: number) => number } {
  const span = wide ? SPAN.wide : SPAN.narrow;
  const pitch = cols <= 5 ? (wide ? PITCH.wide : PITCH.narrow) : Math.max(MIN_PITCH, Math.floor(span / Math.max(1, cols - 1)));
  const x = (c: number) => LEFT + c * pitch;
  return { pitch, fits: cols <= 5 ? cols : Math.min(cols, Math.floor(span / pitch) + 1), x, width: (n: number) => x(Math.max(0, n - 1)) + RIGHT };
}

/** How many columns a row's strokes reach: its highest column, and one. */
export function reachOf(strokes: Stroke[] | null): number {
  let n = 0;
  for (const s of strokes ?? []) n = Math.max(n, 1 + ("col" in s ? s.col : Math.max(s.from, s.to)));
  return n;
}

// ------------------------------------------------------------------------------------------------ what a row's gutter draws

/** Where a stroke starts or stops down its row: px from the row's top, or a share of the row's height. */
export type Y = number | "38%" | "62%" | "100%";
/** A mark's centre, down its row. */
export const MARK_Y = 19;
/** Where a fork leaves its parent's line, and where it reaches its branch's. */
export const FORK_Y = 25;
export const CHILD_Y = FORK_Y - 18;
/** Where a merge's curve leaves its branch's line, and where it reaches its target's (under the arrowhead). */
export const SOURCE_Y = MARK_Y + 18;
export const TARGET_Y = MARK_Y + 3;
/** Where the lines start in the "Now" row, under its heading. */
export const NOW_Y = MARK_Y + 18;

/**
 * What a row's gutter draws, in the order it's drawn: a branch's line in its column, a cap where one stops, a fork's dashed
 * curve, a merge's curve (with its arrowhead on the target), the halo under a curve that passes over a live branch
 * (B-tgq5p), and a card's or commit's mark. Pure: `<BranchesDrawer />` draws exactly these, and the tests check them.
 */
export type Stroke =
  | { k: "line"; col: number; y1: Y; y2: Y; lane: string }
  | { k: "cap"; col: number; y: Y; lane: string; half: number }
  | { k: "halo"; curve: "fork" | "merge"; from: number; to: number }
  | { k: "fork"; from: number; to: number; lane: string; parent: string }
  | { k: "merge"; from: number; to: number; lane: string; into: string }
  | { k: "mark"; col: number; lane: string | null };

/** A curve between two columns passes over any live branch between them. */
const crossesLive = (live: Live, a: number, b: number) => [...live.keys()].some((c) => c > Math.min(a, b) && c < Math.max(a, b));

/** The strokes of a row's gutter (`Stroke`); null for a row that isn't drawn. */
export function strokesOf(r: Row, P: Rows, model: Model): Stroke[] | null {
  const line = (col: number, y1: Y, y2: Y, lane: string): Stroke => ({ k: "line", col, y1, y2, lane });
  const lines = (live: Live, skip: (number | null | undefined)[] = []): Stroke[] => [...live].filter(([c]) => !skip.includes(c)).map(([c, lane]) => line(c, 0, "100%", lane));
  /** A lane's line in an event's row, through the point `y` where its mark or curve is: from above it, on below it, or both. */
  const through = (r: Extract<Row, { kind: "event" }>, c: number, lane: string, y: Y): Stroke[] => {
    const up = r.above.get(c) === lane;
    const dn = r.below.get(c) === lane;
    return up && dn ? [line(c, 0, "100%", lane)] : [...(up ? [line(c, 0, y, lane)] : []), ...(dn ? [line(c, y, "100%", lane)] : [])];
  };
  if (r.kind === "now") {
    if (!r.tags.length && !model.trunk) return null;
    return [...r.live].flatMap(([c, lane]): Stroke[] => [line(c, NOW_Y, "100%", lane), ...(r.tags.includes(lane) ? [{ k: "cap", col: c, y: NOW_Y, lane, half: 5 } as const] : [])]);
  }
  if (r.kind === "day" || r.kind === "more") return lines(r.live);
  if (r.kind === "fold") {
    const out: Stroke[] = [];
    for (let c = 0; c < P.cols; c++) {
      const a = r.top.get(c);
      const b = r.bottom.get(c);
      if (a && a === b) out.push(line(c, 0, "100%", a));
      else {
        if (a) out.push(line(c, 0, "38%", a), { k: "cap", col: c, y: "38%", lane: a, half: 4 });
        if (b) out.push(line(c, "62%", "100%", b), { k: "cap", col: c, y: "62%", lane: b, half: 4 });
      }
    }
    return out;
  }
  if (r.kind === "end") return [...lines(r.live, [r.col]), line(r.col, MARK_Y, "100%", r.lane), { k: "cap", col: r.col, y: MARK_Y, lane: r.lane, half: 5 }];
  const e = r.e;
  if (e.kind === "fork") {
    const pc = r.col!;
    const cc = r.other!;
    return [
      ...lines(r.live, [pc, cc]),
      ...(crossesLive(r.live, pc, cc) ? [{ k: "halo", curve: "fork", from: pc, to: cc } as const] : []),
      ...through(r, pc, e.from, FORK_Y),
      { k: "fork", from: pc, to: cc, lane: e.lane, parent: e.from },
      ...(r.above.get(cc) === e.lane ? [line(cc, 0, CHILD_Y, e.lane)] : []),
    ];
  }
  if (e.kind === "card" || e.kind === "commit") {
    if (r.col === null) return [...lines(r.live), { k: "mark", col: P.cols, lane: null }];
    const c = r.col;
    const lane = e.lane!;
    return [...lines(r.live, [c]), ...(r.above.get(c) === lane ? [line(c, 0, MARK_Y, lane)] : []), ...(r.below.get(c) === lane ? [line(c, MARK_Y, "100%", lane)] : []), { k: "mark", col: c, lane }];
  }
  const tc = r.col!;
  const sc = r.other!;
  return [
    ...lines(r.live, [tc, sc]),
    ...(crossesLive(r.live, sc, tc) ? [{ k: "halo", curve: "merge", from: sc, to: tc } as const] : []),
    ...through(r, tc, e.into, TARGET_Y),
    ...through(r, sc, e.lane, SOURCE_Y),
    { k: "merge", from: sc, to: tc, lane: e.lane, into: e.into },
  ];
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

/**
 * The opening words: what needs you first (lead), then the counts (body), the branches with no merge, and the commits.
 * In a project with other members (`team`), the counts are of everyone's answers, and say so.
 */
export function statusOf(model: Model, team?: Team): { lead: string; body: string; open: Lane[]; cites: string } {
  const c = model.counts;
  if (!c.cards) return { lead: "No cards yet.", body: "A branch appears here once an agent files a card on it.", open: [], cites: "" };
  // The branches a card waiting for you holds from merging (one returned to its agent holds it too, but not for you).
  const held = c.held.filter((L) => L.cards.some((x) => x.forYou)).map((L) => L.short);
  const first = c.waiting ? `${c.waiting === 1 ? "One card is" : `${lead(c.waiting)} cards are`} waiting for you${held.length ? `, holding ${listOf(held)} from merging` : ""}.` : "Nothing is waiting for you.";
  const answered = shared(team)
    ? c.against
      ? `${c.against} ${c.against === 1 ? "was" : "were"} answered otherwise than the agent chose`
      : c.with
        ? "the agent's pick was chosen on every one answered"
        : "none answered yet"
    : c.against
      ? `you chose otherwise than the agent on ${c.against}`
      : c.with
        ? "you chose the agent's pick on every one you answered"
        : "none answered yet";
  // The branches merged count every branch drawn, those with commits but no cards too, and say so (B-zshw5).
  const bare = !c.mergedBare ? "" : c.mergedBare < c.merged ? `, ${c.mergedBare} of them with commits but no cards` : `, ${c.merged === 1 ? "" : c.merged === 2 ? "both " : "all "}with commits but no cards`;
  const body = [
    `${plural(c.cards, "card")} on ${plural(c.branches, "branch", "branches")}: ${answered}${c.gone ? `, and ${c.gone} ${c.gone === 1 ? "was" : "were"} withdrawn` : ""}.`,
    c.merged ? `${lead(c.merged)} ${c.merged === 1 ? "branch has" : "branches have"} merged${bare}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const more = model.loose.branches.length;
  const cites = c.commits ? `${plural(c.commits, "commit")} cite ${c.cited} of the cards${more ? `; ${plural(more, "more branch", "more branches")} ${more === 1 ? "has" : "have"} commits but no cards` : ""}.` : "";
  return { lead: first, body, open: c.open, cites };
}

/** What the panel opens on: the oldest card waiting for you; else the latest card. */
export function openingKey(model: Model): string | null {
  const waiting = model.cards.filter((c) => c.forYou).sort((a, b) => a.t - b.t)[0];
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

/** The days, oldest first, with how many cards each has: for "Go to". With the Commits switch off, a day of commits only isn't one. */
export function daysOf(model: Model, opts: { commits: boolean } = { commits: true }): { key: string; t: number; cards: number }[] {
  const out = new Map<string, { key: string; t: number; cards: number }>();
  for (const e of model.events) {
    if (e.kind === "commit" && !opts.commits) continue;
    const k = dayKey(e.t);
    if (!out.has(k)) out.set(k, { key: k, t: e.t, cards: 0 });
    if (e.kind === "card") out.get(k)!.cards++;
  }
  return [...out.values()];
}
