import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commitSnapshot } from "./facts.js";
import { type GateReport, describeReport, detectStaged, evaluate } from "./gate.js";
import { type Repo, git } from "./git.js";
import { byLine, cardAuthor, q, reviewerOf, said } from "./quote.js";
import { TODAY, levelInForce, route } from "./routing.js";
import { type GateRecord, HARD_BY_DEFAULT } from "./schema.js";
import { BAESIAN, type Card, RECORD_DIR, Store, drawOf, normalise, settingsOf } from "./store.js";
import { parseTrailers } from "./trailers.js";
import { DECISIONS, RULES, cleanVaultPath, vaultWarnings } from "./vault.js";

// M3b: `baesian verify`, the same gate in CI, plus the merge gate (D31) and conflicts (D35, D38).
// CI has no live layer, so everything here reads committed records (D34).

/** A commit's `.baesian/`, extracted to a temporary directory and read as a store. */
export class RecordAt {
  private readonly dirs: string[] = [];

  constructor(private readonly repo: Repo) {}

  store(rev: string): Store {
    const dir = mkdtempSync(join(tmpdir(), "baesian-record-"));
    this.dirs.push(dir);
    const out = join(dir, RECORD_DIR);
    mkdirSync(out, { recursive: true });
    let present = true;
    try {
      git(this.repo.toplevel, ["cat-file", "-e", `${rev}:${RECORD_DIR}`]);
    } catch {
      present = false; // this commit predates Baesian in the repo: an empty record
    }
    if (present) {
      const tar = execFileSync("git", ["archive", "--format=tar", rev, RECORD_DIR], {
        cwd: this.repo.toplevel,
        maxBuffer: 256 << 20,
      });
      execFileSync("tar", ["-x", "-C", dir], { input: tar });
    }
    return Store.overRecord(this.repo, out);
  }

  dispose(): void {
    for (const d of this.dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  }
}

export interface CommitCheck {
  sha: string;
  subject: string;
  cards: string[];
  report: GateReport;
}

export interface MergeProblem {
  card: string;
  problem: "missing" | "unanswered" | "rejected" | "gate";
  message: string;
}

export interface Conflict {
  topic: string;
  /** The decision already on the base branch. */
  base: { id: string; decision: string };
  /** The decision this branch made. */
  branch: { id: string; decision: string };
}

export interface MergeCheck {
  problems: MergeProblem[];
  conflicts: Conflict[];
  notes: string[];
}

export interface VerifyResult {
  base: string;
  commits: CommitCheck[];
  merge?: MergeCheck;
  /** Advice that doesn't fail the check: the vault's missing notes (M6). */
  warnings?: string[];
  ok: boolean;
}

/** Whether a commit has the configured vault, and the paths of its decision and rule notes, relative to the vault. */
function vaultFilesAt(repo: Repo, record: Store, rev: string): { vaultExists: boolean; paths: string[] } {
  const vault = record.config().vault;
  if (!vault) return { vaultExists: false, paths: [] };
  const rel = cleanVaultPath(vault);
  const prefix = rel === "." ? "" : `${rel}/`;
  const exists = rel === "." || git(repo.toplevel, ["ls-tree", "-d", "--name-only", rev, "--", rel]) === rel;
  if (!exists) return { vaultExists: false, paths: [] };
  const out = git(repo.toplevel, ["ls-tree", "-r", "--name-only", "-z", rev, "--", `${prefix}${DECISIONS}`, `${prefix}${RULES}`]);
  return { vaultExists: true, paths: out.split("\0").filter(Boolean).map((p) => p.slice(prefix.length)) };
}

function commitsIn(repo: Repo, base: string): string[] {
  const out = git(repo.toplevel, ["rev-list", "--reverse", "--no-merges", `${base}..HEAD`]);
  return out ? out.split("\n") : [];
}

/** Check one commit the way the local commit-msg hook did: its diff, its message, its own record. */
export function checkCommit(repo: Repo, records: RecordAt, sha: string): CommitCheck {
  const record = records.store(sha);
  const message = git(repo.toplevel, ["log", "-1", "--format=%B", sha]);
  const trailers = parseTrailers(message, repo.toplevel);
  const report = evaluate(record, detectStaged(record, commitSnapshot(repo.toplevel, sha)), trailers);
  return { sha, subject: message.split("\n")[0] ?? "", cards: trailers.cards, report };
}

/** The merge gate (D31): every card the branch cites is resolved or deferred, in the record at HEAD. */
export function checkMerge(head: Store, baseRecord: Store, cited: string[]): MergeCheck {
  const problems: MergeProblem[] = [];
  const notes: string[] = [];
  for (const id of cited) {
    const card = head.card(id);
    if (!card) {
      problems.push({ card: id, problem: "missing", message: `${id} is cited but isn't in the record at HEAD: run \`baesian sync\` and commit.` });
      continue;
    }
    const status = head.status(id);
    const last = head.verdicts(id).filter((v) => v.revision === card.meta.revision).at(-1);
    // The gate's record must recheck against the rules and the preference file it names (P16 section 3), like a fact.
    const gate = head.gateRecord(id, card.meta.revision);
    const wrong = gate && gateProblem(head, card, gate);
    if (wrong) {
      problems.push({ card: id, problem: "gate", message: `${id}'s gate record doesn't recheck: ${wrong}. Answer the card, or file it again.` });
      continue;
    }
    if (status === "resolved") continue;
    if (status === "held") {
      notes.push(`${id} is held: the gate let its agent go ahead (D150), so it counts as settled; the reviewer may still answer it.`);
      continue;
    }
    if (status === "deferred") {
      notes.push(last?.comment ? `${id} is deferred; ${said("comment", reviewerOf(last), last.comment)}` : `${id} is deferred: no reason given`);
      continue;
    }
    if (status === "withdrawn" || status === "superseded") {
      notes.push(`${id} is ${status}; commits that cite it may need another look.`);
      continue;
    }
    if (status === "returned" && last?.response === "reject") {
      problems.push({
        card: id,
        problem: "rejected",
        message: `${id} was rejected by ${byLine(reviewerOf(last))}${last.comment ? `: ${q(last.comment)}` : ""}. Rework what builds on it before merging.`,
      });
      continue;
    }
    problems.push({
      card: id,
      problem: "unanswered",
      message: `${id} (${said("title", cardAuthor(card.meta), card.meta.title)}) is ${status} in the record at HEAD. Answer it, or defer it with a reason. If it's already answered, run \`baesian sync\` and commit.`,
    });
  }
  return { problems, conflicts: findConflicts(head, baseRecord), notes };
}

/**
 * Why a gate record doesn't recheck, if it doesn't (P16 section 3): the preference file it names must be in the record,
 * and the rules must give the same outcome, level and draw from the card and that file. The burn-in can't be recounted
 * from one branch's record, since a row's earlier held cards may be on any branch: the record keeps the count it saw
 * (`held_before`), and the recheck uses it. Locally that count is the CLI's word, as a verdict is (D62); in a hosted repo
 * the relay's own record holds a card back (D158).
 */
export function gateProblem(s: Store, card: Card, g: GateRecord): string | undefined {
  let settings = TODAY;
  if (g.preferences) {
    let file;
    try {
      file = s.preferenceFile(g.preferences);
    } catch (e) {
      return `its preference file, preferences/${g.preferences}, can't be read (${e instanceof Error ? e.message.split("\n")[0] : String(e)})`;
    }
    if (!file) return `it names preferences/${g.preferences}, which isn't in the record`;
    settings = settingsOf(file);
  }
  if (g.mode !== settings.mode) return `it says ${g.mode}, but its preferences say ${settings.mode}`;
  const m = card.meta;
  const facts = (x: readonly string[]) => [...x].sort().join(",");
  if (g.card !== m.id || g.revision !== m.revision || facts(g.touches) !== facts(m.touches) || g.reverse !== m.reverse) return "it doesn't match the card's facts";
  if (g.source === "agent" && m.source_agent === BAESIAN) return "it gated Baesian's own card as an agent's";
  if (g.reason === "error") {
    const floor = m.touches.some((f) => HARD_BY_DEFAULT.has(f));
    return g.outcome === "shown" && g.level === m.level && (!floor || m.level === "hard") ? undefined : "it says the gate failed, but didn't show the card as a failure must";
  }
  const d = route({ touches: m.touches, reverse: m.reverse, asked: g.asked, source: g.source, draw: drawOf(m.id, m.revision), heldBefore: () => g.held_before ?? 0 }, settings);
  const same = d.row === g.row && d.position === g.position && d.outcome === g.outcome && d.level === g.level && d.reason === g.reason;
  if (!same) return `the rules give ${d.outcome}${d.level ? ` at ${d.level}` : ""} (${d.row}, ${d.position}, ${d.reason}), not ${g.outcome}${g.level ? ` at ${g.level}` : ""} (${g.row}, ${g.position}, ${g.reason})`;
  if (d.outcome === "held" && (d.p !== g.p || d.draw !== g.draw || d.burn_in !== g.burn_in || d.drawn !== g.drawn)) return "its audit draw doesn't recompute";
  const level = levelInForce(d, settings.mode, g.asked);
  if (m.level !== level) return `the card's level is ${m.level}, but the gate gave it ${level}`;
  return undefined;
}

/**
 * Decisions this branch resolved that answer a topic the base branch answered differently (D38).
 * A card that `supersedes` the other, or a resolved conflict card over the pair, settles it.
 */
export function findConflicts(head: Store, baseRecord: Store): Conflict[] {
  const resolved = (s: Store) =>
    s
      .cards()
      .filter((c) => c.meta.topic && s.status(c.meta.id) === "resolved")
      .map((c) => ({ card: c, topic: head.canonicalTopic(c.meta.topic!), decision: s.decision(c.meta.id)! }));
  const onBase = resolved(baseRecord);
  const baseIds = new Set(onBase.map((d) => d.card.meta.id));
  const settled = (a: string, b: string) =>
    head
      .cards()
      .some((c) => c.meta.conflict_of?.includes(a) && c.meta.conflict_of.includes(b) && head.status(c.meta.id) === "resolved");
  const out: Conflict[] = [];
  for (const mine of resolved(head)) {
    if (baseIds.has(mine.card.meta.id)) continue; // not new on this branch
    for (const theirs of onBase) {
      if (theirs.topic !== mine.topic) continue;
      if (normalise(theirs.decision) === normalise(mine.decision)) continue;
      if (mine.card.meta.supersedes === theirs.card.meta.id) continue;
      if (head.status(theirs.card.meta.id) === "superseded") continue;
      if (settled(mine.card.meta.id, theirs.card.meta.id)) continue;
      out.push({
        topic: mine.topic,
        base: { id: theirs.card.meta.id, decision: theirs.decision },
        branch: { id: mine.card.meta.id, decision: mine.decision },
      });
    }
  }
  return out;
}

/** Run every check for `base..HEAD`. */
export function verify(repo: Repo, base: string, opts: { merge: boolean }): VerifyResult {
  const records = new RecordAt(repo);
  try {
    git(repo.toplevel, ["rev-parse", "--verify", "-q", `${base}^{commit}`]);
  } catch {
    throw new Error(`unknown base "${base}": in CI, check out with full history (fetch-depth: 0)`);
  }
  try {
    const commits = commitsIn(repo, base).map((sha) => checkCommit(repo, records, sha));
    const head = records.store("HEAD");
    let merge: MergeCheck | undefined;
    if (opts.merge) {
      const cited = [...new Set(commits.flatMap((c) => c.cards))];
      merge = checkMerge(head, records.store(base), cited);
    }
    const ok =
      commits.every((c) => c.report.ok) && (!merge || (merge.problems.length === 0 && merge.conflicts.length === 0));
    // M6: the vault's notes are a view, so a missing note or vault is a warning, never a failure.
    const warnings = vaultWarnings(head, vaultFilesAt(repo, head, "HEAD"));
    return { base, commits, ...(merge ? { merge } : {}), ...(warnings.length ? { warnings } : {}), ok };
  } finally {
    records.dispose();
  }
}

export function describeVerify(r: VerifyResult): string[] {
  const out: string[] = [];
  out.push(`baesian verify: ${r.commits.length} commit${r.commits.length === 1 ? "" : "s"} since ${r.base}`);
  // The local gate's advice about previewing and bypassing doesn't apply to commits already made.
  const localOnly = (l: string) =>
    l.startsWith("baesian: commit blocked") || l.includes("--no-verify") || l.includes("`baesian check` previews");
  for (const c of r.commits) {
    out.push(`${c.report.ok ? "  ok  " : "  FAIL"} ${c.sha.slice(0, 10)} ${c.subject}`);
    if (!c.report.ok) {
      for (const line of describeReport(c.report).filter((l) => !localOnly(l))) out.push(`      ${line}`);
    }
  }
  if (r.commits.some((c) => !c.report.ok)) {
    out.push("  To fix a failed commit, reword its message to add the trailers (e.g. `git rebase -i`, then reword).");
    out.push("  Commits from before the repo adopted Baesian: verify from a later --base.");
  }
  if (r.merge) {
    out.push("merge gate:");
    if (!r.merge.problems.length && !r.merge.conflicts.length) out.push("  ok: every cited card is resolved or deferred");
    for (const p of r.merge.problems) out.push(`  FAIL ${p.message}`);
    for (const c of r.merge.conflicts) {
      out.push(
        `  FAIL conflict on ${c.topic}: ${c.base.id} on the base decided ${q(c.base.decision)}, ${c.branch.id} here decided ${q(c.branch.decision)}.`,
      );
    }
    if (r.merge.conflicts.length) {
      out.push("       Settle it: run `baesian verify --merge --file-conflicts` locally and answer the conflict card,");
      out.push("       or file a card that `supersedes` one of them.");
    }
    for (const n of r.merge.notes) out.push(`  note: ${n}`);
  }
  for (const w of r.warnings ?? []) out.push(`warning: ${w}`);
  out.push(r.ok ? "baesian verify: ok" : "baesian verify: failed");
  return out;
}

/**
 * File a conflict card for each conflict that doesn't already have one (D35). Local only: CI can't
 * write to the live layer. The card is blocking: the merge waits on it.
 */
export function fileConflicts(store: Store, conflicts: Conflict[]): Card[] {
  const filed: Card[] = [];
  for (const c of conflicts) {
    const exists = store
      .cards()
      .some((k) => k.meta.conflict_of?.includes(c.base.id) && k.meta.conflict_of.includes(c.branch.id));
    if (exists) continue;
    // Baesian writes this card itself, with no model (D65), so its crux is a fixed one (D94).
    const draft = {
      title: `Two answers on ${c.topic}`,
      question: `Which answer on \`${c.topic}\` should the project keep?`,
      doing: `merging ${store.repo.branch}, which answers \`${c.topic}\` differently from the base branch`,
      topic: c.topic,
      level: "blocking",
      reverse: "moderate",
      proposal: c.base.decision,
      proposal_then: "it stays; this branch's work built on the other answer gets a rework brief",
      alternative: c.branch.decision,
      alternative_then: "it replaces the base branch's decision; work built on that one gets a rework brief",
      crux: "Was the newer decision made with context the older one lacked?",
      crux_proposal: "If it wasn't",
      crux_alternative: "If it was",
      proposal_breaks: [c.branch.id],
      alternative_breaks: [c.base.id],
      conflict_of: [c.base.id, c.branch.id],
      caught_at: "merge",
    };
    const body = [
      `Two decisions answer \`${c.topic}\` differently:`,
      `- ${c.base.id}, already on the base branch: ${c.base.decision}`,
      `- ${c.branch.id}, on this branch: ${c.branch.decision}`,
      "",
      "Whichever you don't keep becomes superseded, and the work built on it gets a rework brief.",
      "",
    ].join("\n");
    filed.push(store.fileCard(draft, body, { agent: "baesian", force: true }).card);
  }
  return filed;
}
