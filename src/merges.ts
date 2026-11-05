import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { parseDoc } from "./frontmatter.js";
import { CARD_ID, type MergeEvent } from "./schema.js";
import type { Store } from "./store.js";

// D181: finding merges. A branch B merged into a branch A is found by the git hooks of the machine that saw A move (a
// merge, a pull, a squash commit, a rebase), and recorded as a file of its own (`Store.writeMerge`), which goes up to the
// relay and comes down to the project's other machines. Two ways, behind one interface (`findMerges()`):
//
// - **The committed record** (shared mode, today's): a commit on A that brings into A's record cards whose
//   `source_branch` is B, or B's deck, is the merge of B into A. It sees merge commits, squashes, fast-forwards and
//   rebases alike, since the record moves with the code.
// - **The ledger** (personal mode, B-4rwyz, where the record isn't committed): a commit the ledger records as citing a
//   card, made on B, becoming reachable from A means B merged into A. A squash or a rebase on another machine (GitHub's)
//   makes new commits the ledger never saw: those are matched by patch ID, a commit's against each of B's, and against B's
//   whole diff, for a squash.
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
  /** Match by patch ID too, where the record isn't committed: only for a merge, a pull or a rebase, never a plain commit. */
  deep?: boolean;
  /** When this is happening: a fast-forward's time, which git doesn't record. Default now. */
  now?: Date;
}

/** What the commits on A's first-parent line brought, oldest first: each one's cards, by the branch they came from. */
interface Arrival {
  commit: string;
  parents: string[];
  /** When it was committed, as git says. */
  at: string;
  /** Branch → the cards it brought. An empty set: only the branch's deck. */
  by: Map<string, Set<string>>;
}

/** The two ways to find merges (D181): from the committed record, or from the ledger. Each says what a movement brought. */
export interface MergeDetector {
  readonly name: "record" | "ledger";
  arrivals(store: Store, top: string, chain: Chain[], m: Moved): Arrival[];
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

const field = (text: string | undefined, key: string): string | undefined => {
  if (!text) return undefined;
  try {
    const v = (parseDoc(text).meta as Record<string, unknown>)[key];
    return typeof v === "string" ? v : undefined;
  } catch {
    return undefined;
  }
};

const add = (a: Arrival, branch: string, card?: string) => {
  const s = a.by.get(branch) ?? new Set<string>();
  if (card) s.add(card);
  a.by.set(branch, s);
};

/**
 * The committed record (shared mode): the cards (each's first revision) and decks each commit on A's line added to the
 * record, compared with its first parent, by the branch each was filed on. A card attached to on A came in by
 * `baesian attach`, not a merge, so it's left out.
 */
export const RECORD: MergeDetector = {
  name: "record",
  arrivals(store, top, chain, m) {
    const rec = relative(top, store.record).split("\\").join("/");
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
        else add(arrival, branch, id);
      }
      for (const deck of a.decks) {
        const branch = field(texts.get(`${c.commit}:${rec}/${deck}`), "branch");
        if (branch && branch !== m.into && !notABranch(branch) && !byAttach.has(branch)) add(arrival, branch);
      }
      if (arrival.by.size) arrivals.push(arrival);
    }
    return arrivals;
  },
};

/** Commits newly reachable at a commit on A's line: itself, or for a merge, everything it brought. */
function broughtBy(top: string, c: Chain): string[] {
  if (c.parents.length < 2) return [c.commit];
  return (run(top, ["rev-list", `${c.parents[0]}..${c.commit}`]) ?? "").split("\n").filter(Boolean);
}

/** The ledger's entries by commit: the card each cites, and the branch it was made on (the card's, for a detached HEAD). */
function ledgerByCommit(store: Store): Map<string, { card: string; branch: string }[]> {
  const out = new Map<string, { card: string; branch: string }[]>();
  for (const e of store.ledgerEntries()) {
    const commit = e.meta.commit;
    if (!commit) continue;
    let branch = e.meta.branch;
    if (branch.startsWith("detached-")) branch = store.revisions(e.meta.card)[0]?.meta.source_branch ?? branch;
    out.set(commit, [...(out.get(commit) ?? []), { card: e.meta.card, branch }]);
  }
  return out;
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
 * The ledger (personal mode, B-4rwyz): the commits the ledger says cite cards, made on another branch, that each commit
 * on A's line made reachable. A squash commit with the marker brings the commits it squashed. With `deep` (a merge, a
 * pull or a rebase), a new commit that matches, by patch ID, a ledger commit of another branch's not reachable before
 * (a rebase or cherry-pick of it, GitHub's "rebase and merge", a one-commit squash), or that branch's whole diff (a
 * squash), brings that branch's cited cards too.
 */
export const LEDGER: MergeDetector = {
  name: "ledger",
  arrivals(store, top, chain, m) {
    const byCommit = ledgerByCommit(store);
    if (!byCommit.size) return [];
    const out: Arrival[] = [];
    const unmatched: Chain[] = [];
    for (const c of chain) {
      const brought = m.squashed && c.commit === m.to ? m.squashed.commits : broughtBy(top, c);
      const arrival: Arrival = { ...c, ...(m.squashed && c.commit === m.to ? { parents: [...c.parents, m.squashed.tip] } : {}), by: new Map() };
      for (const commit of brought) for (const e of byCommit.get(commit) ?? []) if (e.branch !== m.into && !notABranch(e.branch)) add(arrival, e.branch, e.card);
      if (arrival.by.size) out.push(arrival);
      else if (c.parents.length === 1 && !byCommit.has(c.commit)) unmatched.push(c);
    }
    if (!m.deep || !unmatched.length) return out;
    // Squashes and rebases made elsewhere: other branches' ledger commits not reachable from where A was.
    const known = new Set((run(top, ["cat-file", "--batch-check=%(objectname) %(objecttype)"], `${[...byCommit.keys()].join("\n")}\n`) ?? "").split("\n").flatMap((l) => (l.endsWith(" commit") ? [l.split(" ")[0]!] : [])));
    const theirs = [...byCommit.entries()].filter(([commit, es]) => known.has(commit) && es.some((e) => e.branch !== m.into && !notABranch(e.branch))).slice(-PATCH_LIMIT.entries);
    if (!theirs.length) return out;
    const reached = new Set((run(top, ["rev-list", ...theirs.map(([c]) => c), "--not", m.from]) ?? "").split("\n").filter(Boolean));
    const open = theirs.filter(([c]) => reached.has(c));
    if (!open.length) return out;
    const commits = unmatched.slice(-PATCH_LIMIT.commits);
    const pids = patchIds(top, [...commits.map((c) => c.commit), ...open.map(([c]) => c)]);
    const pidToLedger = new Map(open.flatMap(([c, es]) => (pids.get(c) ? [[pids.get(c)!, es] as const] : [])));
    // Each branch's newest open ledger commit, for its whole diff.
    const tips = new Map<string, { commit: string; cards: Set<string> }>();
    for (const [c, es] of open) {
      for (const e of es) {
        if (e.branch === m.into || notABranch(e.branch)) continue;
        const t = tips.get(e.branch) ?? { commit: c, cards: new Set<string>() };
        t.commit = c;
        t.cards.add(e.card);
        tips.set(e.branch, t);
      }
    }
    const branches = [...tips.entries()].slice(-PATCH_LIMIT.branches);
    for (const c of commits) {
      const arrival: Arrival = { ...c, by: new Map() };
      const pid = pids.get(c.commit);
      for (const e of (pid && pidToLedger.get(pid)) || []) if (e.branch !== m.into && !notABranch(e.branch)) add(arrival, e.branch, e.card);
      if (!arrival.by.size && pid) {
        for (const [branch, t] of branches) {
          const base = run(top, ["merge-base", c.parents[0]!, t.commit])?.trim();
          if (base && rangePatchId(top, base, t.commit) === pid) {
            for (const card of t.cards) add(arrival, branch, card);
            break;
          }
        }
      }
      if (arrival.by.size) out.push(arrival);
    }
    return out.sort((a, b) => chain.findIndex((c) => c.commit === a.commit) - chain.findIndex((c) => c.commit === b.commit));
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
 * and that no other such tip contains. Undefined when it names none but A itself (a pull of A's own upstream) or none at
 * all: then each merge on A's line says what it merged by the cards it brought.
 */
function cameIn(top: string, m: Moved): { names: Set<string>; tips: Map<string, string> } | undefined {
  const refs = (run(top, ["for-each-ref", "--format=%(objectname) %(refname)", "refs/heads", "refs/remotes"]) ?? "").split("\n").filter(Boolean);
  const range = new Set((run(top, ["rev-list", `${m.from}..${m.to}`]) ?? "").split("\n").filter(Boolean));
  if (m.squashed) for (const c of m.squashed.commits) range.add(c);
  const inRange = refs
    .map((l) => l.split(" ") as [string, string])
    .filter(([sha, ref]) => range.has(sha) && ref !== `refs/heads/${m.into}` && !ref.endsWith("/HEAD"));
  if (!inRange.length) return undefined;
  const independent = new Set((run(top, ["merge-base", "--independent", ...new Set(inRange.map(([sha]) => sha))]) ?? "").split("\n").filter(Boolean));
  const names = new Set<string>();
  const tips = new Map<string, string>();
  for (const [sha, ref] of inRange) {
    if (!independent.has(sha)) continue;
    const name = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref.split("/").slice(3).join("/");
    names.add(name);
    tips.set(name, sha);
  }
  if (!names.size || names.has(m.into)) return undefined;
  return { names, tips };
}

/** The first commit on A's line that made `tip` reachable: the tip itself, or the merge that brought it. */
function whereReached(top: string, chain: Chain[], tip: string, squash?: string): Chain | undefined {
  if (squash) return chain.find((c) => c.commit === squash);
  const direct = chain.find((c) => c.commit === tip);
  if (direct) return direct;
  return chain.find((c) => c.parents.length > 1 && run(top, ["merge-base", "--is-ancestor", tip, c.commit]) !== undefined && run(top, ["merge-base", "--is-ancestor", tip, c.parents[0]!]) === undefined);
}

/**
 * The merges a movement of A made (D181), found the way the commit's tree says (`detectorFor()`):
 * - **when a branch came in by name** (`git merge feat`, a fast-forward to it, a rebase onto it, a squash of it): one
 *   merge of each such branch, at the commit that brought it (the merge or squash commit, or the tip a fast-forward or
 *   rebase moved to), with every card of its that arrived. Cards of other branches that came with it were merged into it
 *   first, not into A, so they're left out;
 * - **otherwise** (a pull of A's own upstream, or nothing named): each merge commit on A's line is a merge into A of every
 *   branch whose cards it brought; and a run of other commits bringing one branch's cards (a fast-forward or a squash
 *   done elsewhere) is one merge, at the run's last commit.
 * Returns nothing for a detached HEAD, or when A didn't move forward.
 */
export function findMerges(store: Store, m: Moved, detector?: MergeDetector): Found[] {
  if (!store.hasRepo || notABranch(m.into)) return [];
  const top = store.repo.toplevel;
  const chain = withUpstream(top, chainOf(top, m.from, m.to), m.into);
  if (!chain.length) return [];
  // A card arrives once: where a pull merged A's own upstream, its line came first, and the pull's merge brings it again.
  const seen = new Set<string>();
  const arrivals = (detector ?? detectorFor(store, m.to)).arrivals(store, top, chain, m).flatMap((a) => {
    for (const [branch, cards] of a.by) {
      const fresh = [...cards].filter((c) => !seen.has(c));
      for (const c of fresh) seen.add(c);
      if (fresh.length) a.by.set(branch, new Set(fresh));
      else if (cards.size) a.by.delete(branch);
    }
    return a.by.size ? [a] : [];
  });
  if (!arrivals.length) return [];
  const now = (m.now ?? new Date()).toISOString();
  const named = cameIn(top, m);
  const found: Found[] = [];
  if (named) {
    for (const branch of named.names) {
      const cards = new Set<string>();
      let seen = false;
      for (const a of arrivals) {
        const got = a.by.get(branch);
        if (!got) continue;
        seen = true;
        for (const c of got) cards.add(c);
      }
      if (!seen) continue;
      const at = whereReached(top, chain, named.tips.get(branch)!, m.squashed ? m.to : undefined) ?? chain.at(-1)!;
      // A merge or squash commit says when; a fast-forward or a rebase onto the branch happened now.
      const when = at.parents.length > 1 || m.squashed ? at.at : now;
      found.push({ branch, into: m.into, commit: at.commit, at: when, cards: [...cards].sort() });
    }
    return found;
  }
  let run: { branch: string; last: Arrival; cards: Set<string> } | undefined;
  const flush = () => {
    if (run) found.push({ branch: run.branch, into: m.into, commit: run.last.commit, at: run.last.at, cards: [...run.cards].sort() });
    run = undefined;
  };
  for (const a of arrivals) {
    if (a.parents.length > 1) {
      flush();
      for (const [branch, cards] of a.by) found.push({ branch, into: m.into, commit: a.commit, at: a.at, cards: [...cards].sort() });
      continue;
    }
    if (a.by.size !== 1 || (run && !a.by.has(run.branch))) flush();
    for (const [branch, cards] of a.by) {
      if (a.by.size > 1) {
        found.push({ branch, into: m.into, commit: a.commit, at: a.at, cards: [...cards].sort() });
        continue;
      }
      run ??= { branch, last: a, cards: new Set() };
      run.last = a;
      for (const c of cards) run.cards.add(c);
    }
  }
  flush();
  return found;
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
