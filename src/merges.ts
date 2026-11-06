import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { parseDoc } from "./frontmatter.js";
import { CARD_ID, type MergeEvent } from "./schema.js";
import type { Store } from "./store.js";
import { citedIn } from "./trailers.js";

// D181: finding merges. A branch B merged into a branch A is found by the git hooks of the machine that saw A move (a
// merge, a pull, a squash commit, a rebase), and recorded as a file of its own (`Store.writeMerge`), which goes up to the
// relay and comes down to the project's other machines. Two ways, behind one interface (`findMerges()`):
//
// - **The committed record** (shared mode, today's): a commit on A that brings into A's record cards whose
//   `source_branch` is B, or B's deck, is the merge of B into A. It sees merge commits, squashes, fast-forwards and
//   rebases alike, since the record moves with the code. Since B-w41p7 it reads the ledger too: a commit made on B that
//   cites a card, becoming reachable from A, is a merge of B even when it brings no card, as a later fast-forward of the
//   same branch does.
// - **The ledger** (personal mode, B-4rwyz, where the record isn't committed): a commit the ledger records as citing a
//   card, made on B, becoming reachable from A means B merged into A. A squash or a rebase on another machine (GitHub's)
//   makes new commits the ledger never saw: those are matched by patch ID, a commit's against each of B's, and against B's
//   whole diff, for a squash.
//
// Each merge found names the tip that landed, and is checked against git's ancestry before it's written (B-w41p7): the
// commits it brought are those reachable from that tip and not from where A was, and those of B's that cite cards are
// listed in it, so the branches panel draws what's recorded, with no guess.
//
// It reads git and the live layer, and writes nothing but the squash marker; the hooks (src/hooks.ts) write what it finds.

/** A merge as found: a `MergeEvent`'s fields. */
export type Found = Omit<MergeEvent, "type" | "format">;

/** How a branch moved, as a hook saw it. */
export interface Moved {
  /** The branch that moved, the one checked out: what was merged into. */
  into: string;
  /** Where it was, and where it is now. */
  from: string;
  to: string;
  /** For a squash commit: the squashed commits, from the marker `post-merge` left (`squashMarker()`). */
  squashed?: { tip: string; commits: string[] };
  /** Match by patch ID too: only for a merge, a pull or a rebase, never a plain commit. */
  deep?: boolean;
  /**
   * A movement of the branch rather than a commit made on it, whose commits were all made here (a push, B-h7rsv): where
   * the record is committed, the ledger is read for the commits it brought, as `deep` reads it, with no patch-ID matching.
   */
  moved?: boolean;
  /**
   * Found after the fact, in git's history (the history scan, B-dezkk): A's line is read as a pull reads it, merge commit
   * by merge commit and run by run, with no branch named by its ref; and a run of another branch's commits ends before
   * A's own next commit, not at the next arrival.
   */
  after?: boolean;
  /** When this is happening: a fast-forward's time, which git doesn't record. Default now. */
  now?: Date;
}

/** What one branch brought at one commit on A's line. */
interface Got {
  /** Its cards that arrived: in shared mode those filed on it; where the record isn't committed, those its commits cite. */
  cards: Set<string>;
  /** Its commits that cite cards, as the ledger has them, that arrived. */
  cited: Set<string>;
  /** Its commit that landed, where that's known by content rather than by ancestry: a squash's tip, a patch-ID match. */
  tip?: string;
}

/** What the commits on A's first-parent line brought, oldest first: what each brought, by the branch it came from. */
interface Arrival {
  commit: string;
  parents: string[];
  /** When it was committed, as git says. */
  at: string;
  /** Branch → what it brought. Nothing but an empty `Got`: only the branch's deck. */
  by: Map<string, Got>;
}

/** A commit's ledger entry, as merges read it: the card it cites, the branch it was made on, and when it was written. */
interface Cite {
  card: string;
  branch: string;
  at: string;
}

/** The ledger's entries by commit, read once a movement needs them. */
type Ledger = () => Map<string, Cite[]>;

/** The two ways to find merges (D181): from the committed record, or from the ledger. Each says what a movement brought. */
export interface MergeDetector {
  readonly name: "record" | "ledger";
  arrivals(store: Store, top: string, chain: Chain[], m: Moved, ledger: Ledger): Arrival[];
}

/** A commit on the first-parent line: its ID, parents and committed time. */
interface Chain {
  commit: string;
  parents: string[];
  at: string;
}

/** The branches no merge is ever of: Baesian's own on the relay, and a detached HEAD's. */
const notABranch = (b: string) => b === "relay" || b.startsWith("detached-");

function run(top: string, args: string[], input?: string): string | undefined {
  try {
    return execFileSync("git", args, { cwd: top, encoding: "utf8", stdio: [input === undefined ? "ignore" : "pipe", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024, ...(input !== undefined ? { input } : {}) });
  } catch {
    return undefined;
  }
}

const iso = (t: string) => new Date(t).toISOString();

/** A's first-parent line from `from` (excluded) to `to`, oldest first. */
function chainOf(top: string, from: string, to: string): Chain[] {
  const out = run(top, ["rev-list", "--first-parent", "--reverse", "--format=%P%x00%cI", `${from}..${to}`]) ?? "";
  const lines = out.split("\n");
  const chain: Chain[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^commit ([0-9a-f]+)$/.exec(lines[i]!);
    if (!m) continue;
    const [parents = "", at = ""] = (lines[i + 1] ?? "").split("\0");
    chain.push({ commit: m[1]!, parents: parents.split(" ").filter(Boolean), at: iso(at) });
  }
  return chain;
}

/**
 * A's line, with each merge of A's own upstream (`git pull` on a branch that had moved on here) opened up: the upstream's
 * first-parent line comes before the pull's merge, so a merge made there is found at its own commit, not the pull's.
 */
function withUpstream(top: string, chain: Chain[], into: string): Chain[] {
  if (!chain.some((c) => c.parents.length > 1)) return chain;
  const upstream = new Set(
    (run(top, ["for-each-ref", "--format=%(objectname) %(refname)", "refs/remotes"]) ?? "")
      .split("\n")
      .flatMap((l) => {
        const [sha, ref] = l.split(" ");
        return sha && ref && ref.split("/").slice(3).join("/") === into ? [sha] : [];
      }),
  );
  if (!upstream.size) return chain;
  return chain.flatMap((c) => (c.parents.length > 1 && upstream.has(c.parents[1]!) ? [...chainOf(top, c.parents[0]!, c.parents[1]!), c] : [c]));
}

/** Several blobs at once (`git cat-file --batch`): each spec's text, or undefined where there's none. */
function blobs(top: string, specs: string[]): (string | undefined)[] {
  if (!specs.length) return [];
  let out: Buffer;
  try {
    out = execFileSync("git", ["cat-file", "--batch"], { cwd: top, input: `${specs.join("\n")}\n`, stdio: ["pipe", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 });
  } catch {
    return specs.map(() => undefined);
  }
  const texts: (string | undefined)[] = [];
  let at = 0;
  for (let i = 0; i < specs.length; i++) {
    const nl = out.indexOf(10, at);
    if (nl < 0) break;
    const head = out.subarray(at, nl).toString("utf8");
    at = nl + 1;
    const m = /^\S+ blob (\d+)$/.exec(head);
    if (!m) {
      texts.push(undefined); // "<spec> missing"
      continue;
    }
    const size = Number(m[1]);
    texts.push(out.subarray(at, at + size).toString("utf8"));
    at += size + 1;
  }
  return texts;
}

const metaOf = (text: string | undefined): Record<string, unknown> | undefined => {
  if (!text) return undefined;
  try {
    return parseDoc(text).meta as Record<string, unknown>;
  } catch {
    return undefined;
  }
};

const field = (text: string | undefined, key: string): string | undefined => {
  const v = metaOf(text)?.[key];
  return typeof v === "string" ? v : undefined;
};

const emptyGot = (): Got => ({ cards: new Set(), cited: new Set() });

/** Note what a branch brought at an arrival: a card, a commit citing one, the tip that landed; nothing, for a deck. */
const add = (a: Arrival, branch: string, what: { card?: string; cited?: string; tip?: string } = {}) => {
  const got = a.by.get(branch) ?? emptyGot();
  if (what.card) got.cards.add(what.card);
  if (what.cited) got.cited.add(what.cited);
  if (what.tip) got.tip = what.tip;
  a.by.set(branch, got);
};

/** Fold one `Got` into another: a later tip replaces an earlier one. */
const fold = (into: Got, got: Got) => {
  for (const c of got.cards) into.cards.add(c);
  for (const c of got.cited) into.cited.add(c);
  if (got.tip) into.tip = got.tip;
};

/** Several detectors' arrivals as one list, in the line's order: what each found at the same commit, together. */
function combine(chain: Chain[], ...lists: Arrival[][]): Arrival[] {
  const at = new Map<string, Arrival>();
  for (const list of lists) {
    for (const a of list) {
      let into = at.get(a.commit);
      if (!into) at.set(a.commit, (into = { commit: a.commit, parents: a.parents, at: a.at, by: new Map() }));
      for (const [branch, got] of a.by) {
        const there = into.by.get(branch) ?? emptyGot();
        fold(there, got);
        into.by.set(branch, there);
      }
    }
  }
  return chain.flatMap((c) => at.get(c.commit) ?? []);
}

/** The ledger's arrivals with their cards taken out: where the record is committed, a merge's cards are the record's. */
const commitsOnly = (arrivals: Arrival[]): Arrival[] =>
  arrivals.map((a) => ({ ...a, by: new Map([...a.by].map(([b, g]) => [b, { ...g, cards: new Set<string>() }])) }));

/** The record's folder, relative to the repo's top, with forward slashes. */
const recordDir = (store: Store, top: string) => relative(top, store.record).split("\\").join("/");

/**
 * The committed record's cards (shared mode): the cards (each's first revision) and decks each commit on A's line added
 * to the record, compared with its first parent, by the branch each was filed on. A card attached to on A came in by
 * `baesian attach`, not a merge, so it's left out.
 */
function filedArrivals(store: Store, top: string, chain: Chain[], m: Moved): Arrival[] {
  const rec = recordDir(store, top);
  // Each commit's files added, against its first parent: one git call for the whole line.
  const out = run(top, ["log", "--stdin", "--no-walk=unsorted", "--diff-merges=first-parent", "--name-only", "--diff-filter=A", `--relative=${rec}/`, "--format=%x1e%H"], `${chain.map((c) => c.commit).join("\n")}\n`) ?? "";
  const added = new Map<string, { cards: string[]; decks: string[] }>();
  for (const block of out.split("\x1e").slice(1)) {
    const [commit = "", ...names] = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const cards = names.flatMap((n) => /^cards\/(B-[^/]+)\/r1\.md$/.exec(n)?.[1] ?? []).filter((id) => CARD_ID.test(id));
    const decks = names.filter((n) => /^decks\/[a-z0-9][a-z0-9-]*\.md$/.test(n));
    if (cards.length || decks.length) added.set(commit, { cards, decks });
  }
  if (!added.size) return [];
  // Who filed each: from the commit's own blobs, so a card this machine never had still counts.
  const specs = [...added].flatMap(([commit, a]) => [...a.cards.map((id) => `cards/${id}/r1.md`), ...a.decks].map((p) => `${commit}:${rec}/${p}`));
  const texts = new Map(blobs(top, specs).map((t, i) => [specs[i]!, t]));
  const attached = (id: string) => store.attachments(id).some((x) => x.branch === m.into);
  const arrivals: Arrival[] = [];
  for (const c of chain) {
    const a = added.get(c.commit);
    if (!a) continue;
    const arrival: Arrival = { ...c, by: new Map() };
    // `baesian attach` copies the card, and its deck, into the record.
    const byAttach = new Set<string>();
    for (const id of a.cards) {
      const branch = field(texts.get(`${c.commit}:${rec}/cards/${id}/r1.md`), "source_branch");
      if (!branch || branch === m.into || notABranch(branch)) continue;
      if (attached(id)) byAttach.add(branch);
      else add(arrival, branch, { card: id });
    }
    for (const deck of a.decks) {
      const branch = field(texts.get(`${c.commit}:${rec}/${deck}`), "branch");
      if (branch && branch !== m.into && !notABranch(branch) && !byAttach.has(branch)) add(arrival, branch);
    }
    if (arrival.by.size) arrivals.push(arrival);
  }
  return arrivals;
}

/**
 * The committed record (shared mode): the cards each commit on A's line brought into the record (`filedArrivals()`), and,
 * since B-w41p7, the commits citing cards it made reachable, from the ledger, which are a merge even when they bring no
 * card: a later fast-forward of the same branch is one. Cards that came at a commit no commit of their branch came with
 * (a squash or a rebase made elsewhere) have their branch's commits matched by patch ID there, for the tip that landed.
 */
export const RECORD: MergeDetector = {
  name: "record",
  arrivals(store, top, chain, m, ledger) {
    const filed = filedArrivals(store, top, chain, m);
    // A plain commit brings no other branch's commits: the ledger is read for a merge, a squash or a movement only.
    if (!m.deep && !m.moved && !m.squashed && chain.every((c) => c.parents.length < 2)) return filed;
    const byCommit = ledger();
    const direct = citedArrivals(top, chain, m, byCommit);
    const came = new Set(direct.arrivals.flatMap((a) => [...a.by.keys()]));
    const focus = new Map(
      filed.flatMap((a) => {
        const branches = [...a.by.keys()].filter((b) => !came.has(b));
        return a.parents.length === 1 && branches.length ? [[a.commit, new Set(branches)] as const] : [];
      }),
    );
    const matched = m.deep && focus.size ? patchArrivals(top, chain.filter((c) => focus.has(c.commit)), m, byCommit, (c) => focus.get(c)) : [];
    return combine(chain, filed, commitsOnly(direct.arrivals), commitsOnly(matched));
  },
};

/** Commits newly reachable at a commit on A's line: itself, or for a merge, everything it brought. */
function broughtBy(top: string, c: Chain): string[] {
  if (c.parents.length < 2) return [c.commit];
  return (run(top, ["rev-list", `${c.parents[0]}..${c.commit}`]) ?? "").split("\n").filter(Boolean);
}

/**
 * The ledger's entries by commit: the card each cites, the branch it was made on (the card's, for a detached HEAD), and
 * when it was written. From the live layer; and where the record is committed, from the record at `recordAt` too
 * (B-w41p7), for the entries another machine committed that this one hasn't pulled.
 */
function ledgerByCommit(store: Store, top: string, recordAt?: string): Map<string, Cite[]> {
  const out = new Map<string, Cite[]>();
  const seen = new Set<string>();
  const put = (commit: unknown, card: unknown, branch: unknown, at: unknown) => {
    if (typeof commit !== "string" || typeof card !== "string" || typeof branch !== "string" || typeof at !== "string") return;
    let b = branch;
    if (b.startsWith("detached-")) b = store.revisions(card)[0]?.meta.source_branch ?? b;
    const key = `${commit} ${card} ${b}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.set(commit, [...(out.get(commit) ?? []), { card, branch: b, at }]);
  };
  for (const e of store.ledgerEntries()) put(e.meta.commit, e.meta.card, e.meta.branch, e.meta.at);
  if (recordAt) {
    const rec = recordDir(store, top);
    const here = new Set(store.storage.list("ledger"));
    const names = (run(top, ["ls-tree", "--name-only", `${recordAt}:${rec}/ledger`]) ?? "").split("\n").filter((n) => /^B-[^/]+\.md$/.test(n) && !here.has(n));
    const texts = blobs(top, names.map((n) => `${recordAt}:${rec}/ledger/${n}`));
    for (const text of texts) {
      const meta = metaOf(text);
      if (meta?.type === "ledger") put(meta.commit, meta.card, meta.branch, meta.at instanceof Date ? meta.at.toISOString() : meta.at);
    }
  }
  return out;
}

/**
 * The commits the ledger says cite cards, made on another branch, that each commit on A's line made reachable; a squash's
 * commit brings the commits its marker names. And the commits that brought none and aren't the ledger's (`unmatched`),
 * for matching by patch ID.
 */
function citedArrivals(top: string, chain: Chain[], m: Moved, byCommit: Map<string, Cite[]>): { arrivals: Arrival[]; unmatched: Chain[] } {
  const arrivals: Arrival[] = [];
  const unmatched: Chain[] = [];
  for (const c of chain) {
    const squash = m.squashed && c.commit === m.to ? m.squashed : undefined;
    const brought = squash ? squash.commits : broughtBy(top, c);
    const arrival: Arrival = { ...c, ...(squash ? { parents: [...c.parents, squash.tip] } : {}), by: new Map() };
    for (const commit of brought) {
      for (const e of byCommit.get(commit) ?? []) {
        if (e.branch !== m.into && !notABranch(e.branch)) add(arrival, e.branch, { card: e.card, cited: commit, ...(squash ? { tip: squash.tip } : {}) });
      }
    }
    if (arrival.by.size) arrivals.push(arrival);
    else if (c.parents.length === 1 && !byCommit.has(c.commit)) unmatched.push(c);
  }
  return { arrivals, unmatched };
}

/** Patch IDs (`git patch-id --stable`) of commits, by commit; merges have none. */
function patchIds(top: string, commits: string[]): Map<string, string> {
  const out = new Map<string, string>();
  if (!commits.length) return out;
  const diffs = run(top, ["log", "--no-walk=unsorted", "--no-merges", "-p", "--format=commit %H", ...commits]);
  if (!diffs) return out;
  for (const line of (run(top, ["patch-id", "--stable"], diffs) ?? "").split("\n")) {
    const [pid, commit] = line.split(" ");
    if (pid && commit) out.set(commit, pid);
  }
  return out;
}

/** The patch ID of the diff between two commits: a branch's whole change, to match a squash of it. */
function rangePatchId(top: string, base: string, tip: string): string | undefined {
  const diff = run(top, ["diff", base, tip]);
  if (!diff) return undefined;
  return (run(top, ["patch-id", "--stable"], diff) ?? "").split(" ")[0] || undefined;
}

/** How many of A's new commits, and of other branches' ledger commits, patch IDs are worked out for: a pull stays quick. */
const PATCH_LIMIT = { commits: 50, branches: 10, entries: 200 };

/**
 * Squashes and rebases made elsewhere, which make commits the ledger never saw: each of `commits` that matches, by patch
 * ID, a ledger commit of another branch's not reachable from where A was (a rebase or cherry-pick of it, GitHub's "rebase
 * and merge", a one-commit squash) brings that commit, which is the tip that landed; one that matches that branch's
 * whole diff, from its merge base to its newest such commit (a squash), brings all of them, and that newest is the tip.
 * `only` limits each commit to the branches it names.
 */
function patchArrivals(top: string, commits: Chain[], m: Moved, byCommit: Map<string, Cite[]>, only?: (commit: string) => Set<string> | undefined): Arrival[] {
  const allowed = only ? new Set(commits.flatMap((c) => [...(only(c.commit) ?? [])])) : undefined;
  const ours = (e: Cite) => e.branch !== m.into && !notABranch(e.branch) && (!allowed || allowed.has(e.branch));
  const candidates = [...byCommit.entries()].filter(([, es]) => es.some(ours));
  if (!candidates.length) return [];
  const known = new Set((run(top, ["cat-file", "--batch-check=%(objectname) %(objecttype)"], `${candidates.map(([c]) => c).join("\n")}\n`) ?? "").split("\n").flatMap((l) => (l.endsWith(" commit") ? [l.split(" ")[0]!] : [])));
  const theirs = candidates.filter(([commit]) => known.has(commit)).slice(-PATCH_LIMIT.entries);
  if (!theirs.length) return [];
  const reached = new Set((run(top, ["rev-list", ...theirs.map(([c]) => c), "--not", m.from]) ?? "").split("\n").filter(Boolean));
  const open = theirs.filter(([c]) => reached.has(c));
  if (!open.length) return [];
  const mine = commits.slice(-PATCH_LIMIT.commits);
  const pids = patchIds(top, [...mine.map((c) => c.commit), ...open.map(([c]) => c)]);
  const pidToLedger = new Map(open.flatMap(([c, es]) => (pids.get(c) ? [[pids.get(c)!, { commit: c, es }] as const] : [])));
  // Each branch's newest open ledger commit, for its whole diff, with all of its open ones.
  const tips = new Map<string, { commit: string; cards: Set<string>; cited: Set<string> }>();
  for (const [c, es] of open) {
    for (const e of es) {
      if (!ours(e)) continue;
      const t = tips.get(e.branch) ?? { commit: c, cards: new Set<string>(), cited: new Set<string>() };
      t.commit = c;
      t.cards.add(e.card);
      t.cited.add(c);
      tips.set(e.branch, t);
    }
  }
  const branches = [...tips.entries()].slice(-PATCH_LIMIT.branches);
  const out: Arrival[] = [];
  for (const c of mine) {
    const here = only?.(c.commit);
    const may = (branch: string) => !here || here.has(branch);
    const arrival: Arrival = { ...c, by: new Map() };
    const pid = pids.get(c.commit);
    const match = pid ? pidToLedger.get(pid) : undefined;
    for (const e of match?.es ?? []) if (ours(e) && may(e.branch)) add(arrival, e.branch, { card: e.card, cited: match!.commit, tip: match!.commit });
    if (!arrival.by.size && pid) {
      for (const [branch, t] of branches) {
        if (!may(branch)) continue;
        const base = run(top, ["merge-base", c.parents[0]!, t.commit])?.trim();
        if (base && rangePatchId(top, base, t.commit) === pid) {
          for (const card of t.cards) add(arrival, branch, { card });
          for (const cited of t.cited) add(arrival, branch, { cited });
          add(arrival, branch, { tip: t.commit });
          break;
        }
      }
    }
    if (arrival.by.size) out.push(arrival);
  }
  return out;
}

/**
 * The ledger (personal mode, B-4rwyz): the commits the ledger says cite cards, made on another branch, that each commit
 * on A's line made reachable. A squash commit with the marker brings the commits it squashed. With `deep` (a merge, a
 * pull or a rebase), a new commit that matches by patch ID one of another branch's ledger commits, or that branch's whole
 * diff, brings that branch's cited cards too (`patchArrivals()`).
 */
export const LEDGER: MergeDetector = {
  name: "ledger",
  arrivals(_store, top, chain, m, ledger) {
    const byCommit = ledger();
    if (!byCommit.size) return [];
    const direct = citedArrivals(top, chain, m, byCommit);
    if (!m.deep || !direct.unmatched.length) return direct.arrivals;
    return combine(chain, direct.arrivals, patchArrivals(top, direct.unmatched, m, byCommit));
  },
};

/** Whether the commit's tree holds the record: then the record is committed (shared mode), and merges are found from it. */
export function recordCommitted(store: Store, commit: string): boolean {
  const rec = relative(store.repo.toplevel, store.record).split("\\").join("/");
  return run(store.repo.toplevel, ["cat-file", "-e", `${commit}:${rec}/config.json`]) !== undefined;
}

/**
 * Which way to find merges at a commit (D181): from the record where it's committed, from the ledger where it isn't
 * (personal mode, B-4rwyz).
 */
export function detectorFor(store: Store, commit: string): MergeDetector {
  return recordCommitted(store, commit) ? RECORD : LEDGER;
}

/**
 * What came in, as branches: the names of the branches, local or remote-tracking, whose tips the movement made reachable
 * and that no other such tip contains; and a branch one of those began from (D8: its tip on that one's first-parent line,
 * and no merge recorded of it into that one, which a fast-forward into it would have), since its whole tip came in with it.
 * A's own upstream among them (`upstream`) is a pull: it's left out, and if it's the only one, this is undefined, as it is
 * when nothing is named; then each merge on A's line says what it merged by the cards it brought.
 */
function cameIn(top: string, m: Moved, recorded: readonly { branch: string; into: string }[]): { names: Set<string>; tips: Map<string, string>; upstream: boolean } | undefined {
  const refs = (run(top, ["for-each-ref", "--format=%(objectname) %(refname)", "refs/heads", "refs/remotes"]) ?? "").split("\n").filter(Boolean);
  const range = new Set((run(top, ["rev-list", `${m.from}..${m.to}`]) ?? "").split("\n").filter(Boolean));
  if (m.squashed) for (const c of m.squashed.commits) range.add(c);
  const inRange = refs
    .map((l) => l.split(" ") as [string, string])
    .filter(([sha, ref]) => range.has(sha) && ref !== `refs/heads/${m.into}` && !ref.endsWith("/HEAD"));
  if (!inRange.length) return undefined;
  const independent = new Set((run(top, ["merge-base", "--independent", ...new Set(inRange.map(([sha]) => sha))]) ?? "").split("\n").filter(Boolean));
  const nameOf = (ref: string) => (ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref.split("/").slice(3).join("/"));
  const names = new Set<string>();
  const tips = new Map<string, string>();
  for (const [sha, ref] of inRange) {
    if (!independent.has(sha)) continue;
    names.add(nameOf(ref));
    tips.set(nameOf(ref), sha);
  }
  const lines = new Map<string, Set<string>>();
  const lineOf = (tip: string) => lines.get(tip) ?? lines.set(tip, new Set((run(top, ["rev-list", "--first-parent", tip, "--not", m.from]) ?? "").split("\n").filter(Boolean))).get(tip)!;
  for (const [sha, ref] of inRange) {
    const name = nameOf(ref);
    if (independent.has(sha) || names.has(name) || name === m.into) continue;
    const from = [...tips].find(([n, tip]) => n !== m.into && lineOf(tip).has(sha) && !recorded.some((r) => r.branch === name && r.into === n));
    if (from) names.add(name), tips.set(name, sha);
  }
  const upstream = names.delete(m.into);
  if (!names.size) return undefined;
  return { names, tips, upstream };
}

/**
 * Which branches a merge commit on A's line merged itself, of those whose cards or citing commits it brought (D7): those
 * with a card filed, or a citing commit made, on its other parent's first-parent line, the merged branch's own. One that
 * came only through a merge on that line was merged into the merged branch first: that merge is its own, as the named
 * path has it. With none on that line to tell by, every one.
 */
function mergedHere(store: Store, top: string, a: Arrival): Set<string> {
  const all = new Set(a.by.keys());
  if (all.size < 2 || a.parents.length < 2) return all;
  const line = (run(top, ["rev-list", "--first-parent", a.parents[1]!, "--not", a.parents[0]!]) ?? "").split("\n").filter(Boolean);
  if (!line.length) return all;
  const onLine = new Set(line);
  const added = run(top, ["log", "--stdin", "--no-walk=unsorted", "--no-merges", "--name-only", "--diff-filter=A", `--relative=${recordDir(store, top)}/`, "--format="], `${line.join("\n")}\n`) ?? "";
  const filed = new Set(added.split("\n").flatMap((n) => /^cards\/(B-[^/]+)\/r1\.md$/.exec(n.trim())?.[1] ?? []));
  const direct = new Set([...a.by].filter(([, got]) => [...got.cards].some((c) => filed.has(c)) || [...got.cited].some((c) => onLine.has(c))).map(([b]) => b));
  return direct.size ? direct : all;
}

/** The first commit on A's line that made `tip` reachable: the tip itself, or the merge that brought it. */
function whereReached(top: string, chain: Chain[], tip: string, squash?: string): Chain | undefined {
  if (squash) return chain.find((c) => c.commit === squash);
  const direct = chain.find((c) => c.commit === tip);
  if (direct) return direct;
  return chain.find((c) => c.parents.length > 1 && run(top, ["merge-base", "--is-ancestor", tip, c.commit]) !== undefined && run(top, ["merge-base", "--is-ancestor", tip, c.parents[0]!]) === undefined);
}

/**
 * Whether a branch has work of its own (B-c4efj): a card filed on it, or a commit the ledger says was made on it that
 * cites one, in the live layer or, where the record is committed, in the record before or after the movement.
 */
function ownWork(store: Store, top: string, branch: string, m: Moved, ledger: Ledger, recordCommittedHere: boolean): boolean {
  const mine = (byCommit: Map<string, Cite[]>) => [...byCommit.values()].some((es) => es.some((e) => e.branch === branch));
  if (store.cards().some((c) => c.meta.source_branch === branch)) return true;
  if (mine(ledger())) return true;
  return recordCommittedHere && mine(ledgerByCommit(store, top, m.from));
}

/** A merge as found, before git's ancestry is checked (`landed()`). */
interface Draft {
  branch: string;
  /** Where it landed on A's line, and when. */
  commit: string;
  at: string;
  /** How `at` was told: a merge or squash commit's time, the moment it was found, or the time of the last commit it brought. */
  dated: "git" | "now" | "commit";
  got: Got;
  /** The commit that landed from the branch's side. */
  tip: string;
  /** Where A was before it. */
  base: string;
}

/**
 * Check a merge against git's ancestry as it's written (B-w41p7): a commit is part of it if it's reachable from the tip
 * that landed and wasn't reachable from A before. Those made on the merged branch that cite cards are its `commits`, oldest
 * first; where the record isn't committed, the cards they cite are among its `cards`. One dated by the last commit it
 * brought (found in a pull, after the fact) is dated no earlier than the ledger's entries for its commits, which are
 * written as each commit is made, before anything can merge it.
 */
function landed(top: string, into: string, d: Draft, byCommit: Map<string, Cite[]>, citedCards: boolean): Found {
  const range = run(top, ["rev-list", "--reverse", "--topo-order", d.tip, "--not", d.base]);
  const reachable = range === undefined ? [...d.got.cited] : range.split("\n").filter(Boolean);
  // The tip's own ledger entry is written by post-commit, after it: no later commit on the branch carried it into the
  // record, so a machine that didn't make the tip has none (D5). Its trailers say what it cites, as the gate reads them.
  const tipCites = byCommit.has(d.tip) || !reachable.includes(d.tip) ? undefined : citedIn(top, d.tip);
  const entries = (c: string): Cite[] => (c === d.tip && tipCites ? tipCites.cards.map((card) => ({ card, branch: d.branch, at: iso(tipCites.at) })) : (byCommit.get(c) ?? []));
  const mine = (c: string) => entries(c).filter((e) => e.branch === d.branch);
  const commits = reachable.filter((c) => mine(c).length);
  const cards = new Set(d.got.cards);
  if (citedCards) for (const c of commits) for (const e of mine(c)) cards.add(e.card);
  let at = d.at;
  if (d.dated === "commit") {
    for (const c of commits) for (const e of mine(c)) if (Date.parse(e.at) > Date.parse(at)) at = iso(e.at);
  }
  return { branch: d.branch, into, commit: d.commit, tip: d.tip, at, cards: [...cards].sort(), commits };
}

/**
 * The merges a movement of A made (D181), found the way the commit's tree says (`detectorFor()`):
 * - **when a branch came in by name** (`git merge feat`, a fast-forward to it, a rebase onto it, a squash of it): one
 *   merge of each such branch, at the commit that brought it (the merge or squash commit, or the tip a fast-forward or
 *   rebase moved to), with every card of its that arrived, and its tip, the ref's. Cards of other branches that came with
 *   it were merged into it first, not into A, so they're left out;
 * - **otherwise** (a pull of A's own upstream, or nothing named): each merge commit on A's line is a merge into A of every
 *   branch whose cards or citing commits it brought, its other parent the tip; and a run of other commits bringing one
 *   branch's (a fast-forward or a squash done elsewhere) is one merge, at the run's last commit, which is the tip.
 * Each is checked against git's ancestry before it's returned (`landed()`, B-w41p7). A later fast-forward of a branch
 * merged before brings its commits that cite cards, so it's a merge of its own, at its own commit; one that brings none
 * of those, nor a card, isn't recorded. Returns nothing for a detached HEAD, or when A didn't move forward.
 */
export function findMerges(store: Store, m: Moved, detector?: MergeDetector): Found[] {
  if (!store.hasRepo || notABranch(m.into)) return [];
  const top = store.repo.toplevel;
  const chain = withUpstream(top, chainOf(top, m.from, m.to), m.into);
  if (!chain.length) return [];
  const det = detector ?? detectorFor(store, m.to);
  let read: Map<string, Cite[]> | undefined;
  const ledger: Ledger = () => (read ??= ledgerByCommit(store, top, det === RECORD ? m.to : undefined));
  // A card, or a commit citing one, arrives once: where a pull merged A's own upstream, its line came first, and the
  // pull's merge brings it again.
  const seenCards = new Set<string>();
  const seenCited = new Set<string>();
  const arrivals = det.arrivals(store, top, chain, m, ledger).flatMap((a) => {
    for (const [branch, got] of a.by) {
      const cards = [...got.cards].filter((c) => !seenCards.has(c));
      const cited = [...got.cited].filter((c) => !seenCited.has(c));
      for (const c of cards) seenCards.add(c);
      for (const c of cited) seenCited.add(c);
      if (got.cards.size + got.cited.size && !cards.length && !cited.length) a.by.delete(branch);
      else a.by.set(branch, { ...got, cards: new Set(cards), cited: new Set(cited) });
    }
    return a.by.size ? [a] : [];
  });
  if (!arrivals.length) return [];
  const now = (m.now ?? new Date()).toISOString();
  const named = m.after ? undefined : cameIn(top, m, store.merges());
  // A pull of A's own upstream that also brought a branch named at the tip (D1: v1/next, pushed to the remote's main,
  // and main brought up to it) is that branch's merge, if it brought anything; otherwise the pull is read merge by merge.
  const names = named && (named.upstream ? [...named.names].filter((b) => arrivals.some((a) => a.by.has(b))) : [...named.names]);
  const drafts: Draft[] = [];
  // B-c4efj ("Where it began"): a branch with nothing of its own yet, brought up to another's tip by a fast-forward (or a
  // rebase onto it, which is one), began there, as a worktree made from a stale base and brought up to v1/next as it
  // starts does: no merge is recorded, and the branches panel draws its start. One with work of its own brought up to
  // another is still a merge, and the repo's default branch is never one that's beginning, cards of its own or none.
  let began: boolean | undefined;
  const beganHere = () => (began ??= m.into !== store.defaultBranch() && !ownWork(store, top, m.into, m, ledger, det === RECORD));
  if (named && names?.length) {
    for (const branch of names) {
      let got: Got | undefined;
      for (const a of arrivals) {
        const g = a.by.get(branch);
        if (!g) continue;
        got ??= emptyGot();
        fold(got, g);
      }
      if (!got) continue;
      const tip = named.tips.get(branch)!;
      const at = whereReached(top, chain, tip, m.squashed ? m.to : undefined) ?? chain.at(-1)!;
      // A merge or squash commit this movement made says when; a fast-forward or a rebase onto the branch happened now,
      // even onto a merge commit made earlier elsewhere (D4, G-6), which is the tip itself.
      const byGit = (at.parents.length > 1 && at.commit !== tip) || !!m.squashed;
      if (!byGit && beganHere()) continue;
      drafts.push({ branch, commit: at.commit, at: byGit ? at.at : now, dated: byGit ? "git" : "now", got, tip: m.squashed?.tip ?? tip, base: m.from });
    }
  } else {
    // A run of commits bringing one branch ends where the next run, or a merge, begins, or at A's tip: commits on A's line
    // that brought nothing after its last arrival came with it (D6: a fast-forward's plain last commit), so the merge is
    // at the tip the merging machine fast-forwarded to, and in the same file.
    const index = new Map(chain.map((c, i) => [c.commit, i]));
    const arrived = new Set(arrivals.map((a) => a.commit));
    // In git's history (B-dezkk), A's own commits come between runs: a run ends before A's next one.
    const own = (c: string) => !!m.after && (ledger().get(c) ?? []).some((e) => e.branch === m.into);
    const runEnd = (last: Arrival): Chain => {
      let i = index.get(last.commit)!;
      while (i + 1 < chain.length && !arrived.has(chain[i + 1]!.commit) && chain[i + 1]!.parents.length < 2 && !own(chain[i + 1]!.commit)) i++;
      return chain[i]!;
    };
    let span: { branch: string; first: Arrival; last: Arrival; got: Got } | undefined;
    const flush = () => {
      if (span) {
        const end = runEnd(span.last);
        drafts.push({ branch: span.branch, commit: end.commit, at: end.at, dated: "commit", got: span.got, tip: span.got.tip ?? end.commit, base: span.first.parents[0] ?? m.from });
      }
      span = undefined;
    };
    for (const a of arrivals) {
      if (a.parents.length > 1) {
        flush();
        // Each branch the merge brought, but one merged into the merged branch first (D7): that one's merge is its own.
        const direct = mergedHere(store, top, a);
        for (const [branch, got] of a.by) if (direct.has(branch)) drafts.push({ branch, commit: a.commit, at: a.at, dated: "git", got, tip: got.tip ?? a.parents[1]!, base: a.parents[0]! });
        continue;
      }
      if (a.by.size !== 1 || (span && !a.by.has(span.branch))) flush();
      for (const [branch, got] of a.by) {
        if (a.by.size > 1) {
          drafts.push({ branch, commit: a.commit, at: a.at, dated: "commit", got, tip: got.tip ?? a.commit, base: a.parents[0] ?? m.from });
          continue;
        }
        span ??= { branch, first: a, last: a, got: emptyGot() };
        span.last = a;
        fold(span.got, got);
      }
    }
    flush();
  }
  return drafts.map((d) => landed(top, m.into, d, ledger(), det === LEDGER));
}

// ---------------------------------------------------------------- the history scan (B-dezkk)

/** What the history scan found: the merges it would record, oldest first, and how many it found recorded already. */
export interface Scan {
  found: Found[];
  known: number;
}

/** A branch as the scan reads it: its name, its tip, and whether it's a local branch. */
interface Ref {
  name: string;
  tip: string;
  local: boolean;
}

/**
 * The branches, local and remote-tracking (`all`), each named as a merge names it, without its remote; and one per name
 * (`branches`): the local branch, where there's one of the name, else the remote's.
 */
function branchRefs(top: string): { branches: Ref[]; all: Ref[] } {
  const all: Ref[] = [];
  const one = new Map<string, Ref>();
  for (const l of (run(top, ["for-each-ref", "--format=%(objectname) %(refname)", "refs/heads", "refs/remotes"]) ?? "").split("\n")) {
    const [tip, ref] = l.split(" ");
    if (!tip || !ref || ref.endsWith("/HEAD")) continue;
    const local = ref.startsWith("refs/heads/");
    const name = local ? ref.slice("refs/heads/".length) : ref.split("/").slice(3).join("/");
    if (!name || notABranch(name)) continue;
    all.push({ name, tip, local });
    if (!one.get(name)?.local) one.set(name, { name, tip, local });
  }
  return { branches: [...one.values()], all };
}

/** A merge's subject as git writes one, for the branch it merged: `Merge branch 'x'`, a remote-tracking one, a pull request's. */
function mergedName(subject: string): string | undefined {
  const m =
    /^Merge (?:remote-tracking )?branch '([^']+)'/.exec(subject) ??
    /^Merge pull request #\d+ from [^/\s]+\/(\S+)/.exec(subject);
  return m?.[1]?.replace(/^(?:origin|upstream)\//, "");
}

/**
 * The history scan (B-dezkk, "The history scan finds them"): the merges git's history shows that no hook saw, made before
 * this repo had Baesian's merge hooks, or where it isn't installed. Each branch's own line is read as a pull of it reads
 * it (`findMerges()`, `after`): each merge commit on it merged the branches whose cards or citing commits it brought, and
 * each run of another branch's commits on it was that branch's fast-forward. A branch's own line is its first-parent line
 * from where it left the lines read before it: the default branch's first, from its first commit, then each other branch
 * by how much history it holds, so one fast-forwarded into another adds nothing of its own. The line a merge commit
 * brought is read in turn, as the merged branch's (named by a ref at it, its subject, or the one branch it brought), so a
 * branch merged into another before both reached the default branch is found merged into that other, at its own merge
 * commit, and it's read from no further back than the first card or ledger entry here, a day early: nothing older brought
 * a card.
 *
 * What's recorded already isn't found again: a merge of the same branch at the same commit, or one listing a card or a
 * commit a merge of that branch recorded already lists (the same merge, read another way: a hook's fast-forward at its
 * tip, or an older reading of the same run). With `write`, each merge found is recorded (`Store.writeMerge`).
 */
export function scanHistory(store: Store, o: { write?: boolean } = {}): Scan {
  if (!store.hasRepo) return { found: [], known: 0 };
  const top = store.repo.toplevel;
  // Nothing older than the first card, or ledger entry, brought one.
  const firsts = [...store.cards().map((c) => c.meta.created), ...store.ledgerEntries().map((e) => e.meta.at)].map((t) => Date.parse(t)).filter((t) => !Number.isNaN(t));
  if (!firsts.length) return { found: [], known: 0 };
  const since = Math.min(...firsts) - 86_400_000;
  const trunk = store.defaultBranch();
  const { branches, all } = branchRefs(top);
  const count = (tip: string) => Number(run(top, ["rev-list", "--count", tip])?.trim() ?? 0);
  const order = branches.map((r) => ({ ...r, n: count(r.tip) })).sort((a, b) => Number(b.name === trunk) - Number(a.name === trunk) || b.n - a.n || a.name.localeCompare(b.name));
  // First-parent lines, as sets, for telling whose a merged line is.
  const lines = new Map<string, Set<string>>();
  const lineOf = (tip: string) => lines.get(tip) ?? lines.set(tip, new Set((run(top, ["rev-list", "--first-parent", tip]) ?? "").split("\n").filter(Boolean))).get(tip)!;
  const found: Found[] = [];
  const read = new Set<string>();
  const scanLine = (into: string, from: string, to: string): void => {
    const key = `${into}\0${from}\0${to}`;
    if (read.has(key)) return;
    read.add(key);
    const here = findMerges(store, { into, from, to, deep: true, after: true });
    const merges = (run(top, ["rev-list", "--first-parent", "--merges", "--format=%P", `${from}..${to}`]) ?? "").split("\n");
    const sides: { into: string; from: string; to: string }[] = [];
    for (let i = 0; i < merges.length; i++) {
      const m = /^commit ([0-9a-f]+)$/.exec(merges[i]!);
      if (!m) continue;
      const commit = m[1]!;
      const [p1, ...others] = (merges[i + 1] ?? "").split(" ").filter(Boolean);
      const at = here.filter((f) => f.commit === commit);
      if (!p1 || !at.length) continue;
      const candidates = new Set(at.map((f) => f.branch));
      for (const side of others) {
        // Whose line it brought: a branch whose ref is on it (A's own upstream, pulled, is A's), the branch its subject
        // names, or the one branch it brought.
        const byRef = new Set(all.filter((r) => (r.name === into || candidates.has(r.name)) && (r.tip === side || lineOf(r.tip).has(side)) && !lineOf(r.tip).has(commit)).map((r) => r.name));
        const named = mergedName(run(top, ["log", "-1", "--format=%s", commit])?.trim() ?? "");
        const owner = byRef.size === 1 ? [...byRef][0] : named && (named === into || candidates.has(named)) ? named : candidates.size === 1 ? [...candidates][0] : undefined;
        if (!owner) continue;
        // The branches it brought that came to the owner first are found on the owner's line, merged into it.
        for (let j = here.length - 1; j >= 0; j--) if (here[j]!.commit === commit && here[j]!.branch !== owner) here.splice(j, 1);
        if (owner === into) for (let j = here.length - 1; j >= 0; j--) if (here[j]!.commit === commit) here.splice(j, 1);
        sides.push({ into: owner, from: p1, to: side });
      }
    }
    found.push(...here);
    for (const s of sides) scanLine(s.into, s.from, s.to);
  };
  const done: string[] = [];
  for (const r of order) {
    const own = (run(top, ["rev-list", "--first-parent", "--reverse", "--format=%P%x00%ct", r.tip, ...(done.length ? ["--not", ...done] : [])]) ?? "").split("\n");
    done.push(r.tip);
    // From the parent of the first commit of its own, or the last commit before the first card, whichever is later.
    let from: string | undefined;
    let first = true;
    for (let i = 0; i < own.length; i++) {
      const m = /^commit ([0-9a-f]+)$/.exec(own[i]!);
      if (!m) continue;
      const [parents = "", t = "0"] = (own[i + 1] ?? "").split("\0");
      if (first) from = parents.split(" ")[0] || undefined;
      first = false;
      if (Number(t) * 1000 < since) from = m[1];
      else break;
    }
    if (first) continue; // nothing of its own
    if (!from) from = (run(top, ["rev-list", "--max-parents=0", r.tip]) ?? "").split("\n").filter(Boolean).at(-1);
    if (from && from !== r.tip) scanLine(r.name, from, r.tip);
  }
  // What's recorded already, by branch: the commits its merges are at, and the cards and commits they list.
  const knownOf = new Map<string, { at: Set<string>; listed: Set<string> }>();
  const note = (f: { branch: string; commit: string; cards: readonly string[]; commits: readonly string[] }) => {
    const k = knownOf.get(f.branch) ?? { at: new Set<string>(), listed: new Set<string>() };
    k.at.add(f.commit);
    for (const x of [...f.cards, ...f.commits]) k.listed.add(x);
    knownOf.set(f.branch, k);
  };
  for (const m of store.merges()) note(m);
  const out: Found[] = [];
  let known = 0;
  const seen = new Set<string>();
  for (const f of found.sort((a, b) => a.at.localeCompare(b.at) || a.commit.localeCompare(b.commit))) {
    const id = `${f.commit} ${f.branch} ${f.into}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const k = knownOf.get(f.branch);
    if (f.branch === f.into || (k && (k.at.has(f.commit) || [...f.cards, ...f.commits].some((x) => k.listed.has(x))))) {
      known += 1;
      continue;
    }
    note(f);
    out.push(f);
    if (o.write) store.writeMerge(f);
  }
  return { found: out, known };
}

// ---------------------------------------------------------------- the squash marker

/** Where `post-merge` notes a squash for the commit that follows: this worktree's own git directory, as `baesian-staged.json`. */
function markerPath(top: string): string | undefined {
  return run(top, ["rev-parse", "--path-format=absolute", "--git-path", "baesian-squash.json"])?.trim();
}

/**
 * `git merge --squash` stages the change and commits nothing; its `post-merge` (with the squash flag) runs while
 * `SQUASH_MSG` lists the commits squashed. They're noted beside the index, with HEAD, so the commit that follows on it
 * (`post-commit`) knows what it squashed, and from which branch. Nothing leaves the machine.
 */
export function noteSquash(store: Store): void {
  const top = store.repo.toplevel;
  const msg = run(top, ["rev-parse", "--path-format=absolute", "--git-path", "SQUASH_MSG"])?.trim();
  const path = markerPath(top);
  if (!msg || !path || !existsSync(msg)) return;
  const commits = [...readFileSync(msg, "utf8").matchAll(/^commit ([0-9a-f]{40,64})$/gm)].map((x) => x[1]!);
  const head = run(top, ["rev-parse", "HEAD"])?.trim();
  if (!commits.length || !head) return;
  writeFileSync(path, `${JSON.stringify({ head, tip: commits[0], commits })}\n`);
}

/** The squash noted for a commit whose parent is `parent`, if there's one; the marker is removed either way. */
export function takeSquash(store: Store, parent: string): { tip: string; commits: string[] } | undefined {
  const path = markerPath(store.repo.toplevel);
  if (!path || !existsSync(path)) return undefined;
  try {
    const m = JSON.parse(readFileSync(path, "utf8")) as { head?: unknown; tip?: unknown; commits?: unknown };
    if (m.head !== parent || typeof m.tip !== "string" || !Array.isArray(m.commits)) return undefined;
    return { tip: m.tip, commits: m.commits.filter((c): c is string => typeof c === "string") };
  } catch {
    return undefined;
  } finally {
    rmSync(path, { force: true });
  }
}

/** The branch a rebase in progress is rewriting, when HEAD is detached for it: its commits are that branch's. */
export function rebasing(store: Store): string | undefined {
  const top = store.repo.toplevel;
  for (const dir of ["rebase-merge", "rebase-apply"]) {
    const p = run(top, ["rev-parse", "--path-format=absolute", "--git-path", `${dir}/head-name`])?.trim();
    if (p && existsSync(p)) {
      const ref = readFileSync(p, "utf8").trim();
      if (ref.startsWith("refs/heads/")) return ref.slice("refs/heads/".length);
    }
  }
  return undefined;
}
