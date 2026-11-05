import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cite, citeIn } from "./cite.js";
import { commitSnapshot } from "./facts.js";
import { type GateReport, blockedBody, configWarnings, detectStaged, evaluate, named } from "./gate.js";
import { HANG, type Line, cmd, dim, failed, failure, fields, head, id, indent, next, note, ok, strong, text, trailer, warning } from "./style.js";
import { type Repo, git } from "./git.js";
import { byLine, cardAuthor, q, reviewerOf, said } from "./quote.js";
import { TODAY, levelInForce, route } from "./routing.js";
import { type GateRecord, HARD_BY_DEFAULT } from "./schema.js";
import { BAESIAN, type Card, RECORD_DIR, SHALLOW_HISTORY, Store, type StoreTrust, drawOf, normalise, recordAtLinking, settingsOf } from "./store.js";
import { ACK_TRAILER, CARD_TRAILER, parseTrailers } from "./trailers.js";
import { TRUST_ENV, type TrustRoot, drawOfProof, pinComplete, pinProblems, pinnedTrust } from "./trust.js";
import { DECISIONS, RULES, cleanVaultPath, vaultWarnings } from "./vault.js";

// M3b: `baesian verify`, the same gate in CI, plus the merge gate (D31) and conflicts (D35, D38).
// CI has no live layer, so everything here reads committed records (D34).

/** A commit's `.baesian/`, extracted to a temporary directory and read as a store. */
export class RecordAt {
  private readonly dirs: string[] = [];

  /** `trust` holds CI's pinned keys, which every commit's record is checked with whatever it says (D142). */
  constructor(
    private readonly repo: Repo,
    private readonly trust: StoreTrust = {},
  ) {}

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
    return Store.overRecord(this.repo, out, this.trust, rev);
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
  /**
   * The record's keys that CI doesn't pin, or pins differently (D142, D159), and a config naming another project than CI
   * pins (B-mar8x): each fails the commit.
   */
  trust: string[];
  ok: boolean;
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
  /**
   * In a hosted repo (D138): where the keys came from, CI's pin or the record's copy; the project, as CI pins it
   * (B-mar8x) or else as HEAD's config names it, and the commit that linked the repo to it (B-45xz8); the files a person
   * writes in the record at HEAD that don't count, which are ignored, with a note; and what fails the run whatever the
   * commits say: the link can't be told (two commits link the repo, B-mar8x), or HEAD names another project than CI pins.
   */
  hosted?: { keys: "pinned" | "record"; project?: string; linked?: string; skipped: { file: string; why: string }[]; shallow?: true; problems?: string[] };
  /** Advice that doesn't fail the check: the vault's missing notes (M6); keys checked against the record's copy alone. */
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

/**
 * Check one commit the way the local commit-msg hook did: its diff, its message, its own record. In a hosted repo the
 * record's answers count only when signed (D138), and with keys pinned in CI, the record's copy must match them (D142),
 * and its config may name no project but the pinned one (B-mar8x).
 */
export function checkCommit(repo: Repo, records: RecordAt, sha: string, pinned?: TrustRoot): CommitCheck {
  const record = records.store(sha);
  const message = git(repo.toplevel, ["log", "-1", "--format=%B", sha]);
  const trailers = parseTrailers(message, repo.toplevel);
  return record.view(() => {
    const report = evaluate(record, detectStaged(record, commitSnapshot(repo.toplevel, sha), { configWarning: false }), trailers);
    const keys = record.trustFiles();
    const trust = pinned ? [...otherProject(record, pinned), ...pinProblems(pinned, [...keys.service, ...keys.passkeys])] : [];
    return { sha, subject: message.split("\n")[0] ?? "", cards: trailers.cards, report, trust, ok: report.ok && trust.length === 0 };
  });
}

/**
 * Why a record's config names the wrong project, if it does (B-mar8x): with keys pinned, CI pins the repo's project too,
 * so a commit can't link the repo to a project of its own making, whose answers it could write. A config that names no
 * project is from before the link, and is checked against the pinned one.
 */
function otherProject(record: Store, pinned: TrustRoot): string[] {
  const named = record.config().project;
  if (named === undefined || pinned.project === undefined || named === pinned.project) return [];
  return [
    `.baesian/config.json names project ${named}, but CI pins project ${pinned.project}${cite("B-mar8x")}: a commit can't link the repo to another project. If the repo was linked again on purpose, run \`baesian ci\` and update ${TRUST_ENV}.`,
  ];
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
    // The gate's records must recheck against the rules and the preference file each names (P16 section 3), like a fact:
    // the CLI's, which set the card's level, and in a hosted repo the relay's signed one, which alone holds it (D158).
    const records = [head.gateRecordBy(id, card.meta.revision, "cli"), head.hosted() ? head.gateRecordBy(id, card.meta.revision, "relay") : undefined];
    const wrong = records.map((g) => g && gateProblem(head, card, g)).find(Boolean);
    if (wrong) {
      problems.push({ card: id, problem: "gate", message: `${id}'s gate record doesn't recheck: ${wrong}. Answer the card, or file it again.` });
      continue;
    }
    if (status === "resolved") continue;
    if (status === "held") {
      notes.push(`${id} is held: the gate let its agent go ahead${cite("D150")}, so it counts as settled; the reviewer may still answer it.`);
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
 * the relay's own record holds a card back (D158), with the relay's count, and a draw recomputed from its signed proof.
 * The relay's record doesn't set the card's level, which the CLI wrote at filing: it can only raise the level in force.
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
    if (!file) {
      const judged = existsSync(join(s.live, "preferences", g.preferences)) ? s.judge(`preferences/${g.preferences}`) : undefined;
      return judged && !judged.ok ? `it names preferences/${g.preferences}, which doesn't count: ${judged.why}` : `it names preferences/${g.preferences}, which isn't in the record`;
    }
    settings = settingsOf(file);
  }
  if (g.mode !== settings.mode) return `it says ${g.mode}, but its preferences say ${settings.mode}`;
  const m = card.meta;
  const facts = (x: readonly string[]) => [...x].sort().join(",");
  if (g.card !== m.id || g.revision !== m.revision || facts(g.touches) !== facts(m.touches) || g.reverse !== m.reverse) return "it doesn't match the card's facts";
  if (g.source === "agent" && m.source_agent === BAESIAN) return "it gated Baesian's own card as an agent's";
  const relay = g.by === "relay";
  if (g.reason === "error") {
    const floor = m.touches.some((f) => HARD_BY_DEFAULT.has(f));
    return g.outcome === "shown" && (relay || g.level === m.level) && (!floor || g.level === "hard") ? undefined : "it says the gate failed, but didn't show the card as a failure must";
  }
  let draw = drawOf(m.id, m.revision);
  if (relay && g.outcome === "held") {
    // The relay's draw is its own signature over the card (D158): checked, then read as the CLI's is.
    const root = s.hosted()?.root;
    if (!root || !g.draw_proof) return "it holds the card back without the relay's draw proof";
    const proved = drawOfProof(root, g.draw_proof, m.id, m.revision, s.bytes(`cards/${m.id}/r${m.revision}.md`), g.at);
    if ("problem" in proved) return proved.problem;
    draw = proved.draw;
  }
  const d = route({ touches: m.touches, reverse: m.reverse, asked: g.asked, source: g.source, draw, heldBefore: () => g.held_before ?? 0 }, settings);
  const same = d.row === g.row && d.position === g.position && d.outcome === g.outcome && d.level === g.level && d.reason === g.reason;
  if (!same) return `the rules give ${d.outcome}${d.level ? ` at ${d.level}` : ""} (${d.row}, ${d.position}, ${d.reason}), not ${g.outcome}${g.level ? ` at ${g.level}` : ""} (${g.row}, ${g.position}, ${g.reason})`;
  if (d.outcome === "held" && (d.p !== g.p || d.draw !== g.draw || d.burn_in !== g.burn_in || d.drawn !== g.drawn)) return "its audit draw doesn't recompute";
  const level = levelInForce(d, settings.mode, g.asked);
  if (!relay && m.level !== level) return `the card's level is ${m.level}, but the gate gave it ${level}`;
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

/**
 * Run every check for `base..HEAD`. `pinned` is CI's pin (D142, D159): the keys, and the repo's project beside them
 * (B-mar8x); by default it's read from CI's settings (`BAESIAN_TRUST`, `BAESIAN_TRUST_FILE`), and `null` pins none. With
 * a pin, every commit is checked as hosted, whatever its record says, in the pinned project, against one linking commit
 * found from HEAD; without, a commit is hosted when its record holds the service's keys.
 */
export function verify(repo: Repo, base: string, opts: { merge: boolean; pinned?: TrustRoot | null }): VerifyResult {
  const given = opts.pinned !== undefined ? (opts.pinned ?? undefined) : pinnedTrust();
  const pinned = given && pinComplete(given, TRUST_ENV);
  // The commit that linked the repo to the pinned project, found once, from the tip, by ancestry (B-mar8x): every commit's
  // record counts its answers from before linking against that record, a commit from before the link included, and no
  // commit can make up a linking commit of its own.
  const linking = pinned ? (recordAtLinking(repo.toplevel, "HEAD", pinned.project, { standIn: false }) ?? null) : undefined;
  const records = new RecordAt(repo, { pinned: pinned ?? null, ...(linking !== undefined ? { linking } : {}) });
  try {
    git(repo.toplevel, ["rev-parse", "--verify", "-q", `${base}^{commit}`]);
  } catch {
    throw new Error(`unknown base "${base}": in CI, check out with full history (fetch-depth: 0)`);
  }
  try {
    const commits = commitsIn(repo, base).map((sha) => checkCommit(repo, records, sha, pinned));
    const head = records.store("HEAD");
    return head.view(() => {
      let merge: MergeCheck | undefined;
      if (opts.merge) {
        const cited = [...new Set(commits.flatMap((c) => c.cards))];
        const baseRecord = records.store(base);
        merge = baseRecord.view(() => checkMerge(head, baseRecord, cited));
      }
      const ok = commits.every((c) => c.ok) && (!merge || (merge.problems.length === 0 && merge.conflicts.length === 0));
      // M6: the vault's notes are a view, so a missing note or vault is a warning, never a failure.
      const warnings = [...vaultWarnings(head, vaultFilesAt(repo, head, "HEAD")), ...configWarnings(head.config())];
      const h = head.hosted();
      if (h && !h.pinned) {
        warnings.push(`the service's keys come from the record, which a commit can change: in CI, pin them in its protected settings (${TRUST_ENV}${citeIn("D142")})`);
      }
      const skipped = h ? head.uncounted() : [];
      // Answers from before the repo was linked count as they are (B-45xz8), which takes the commit that linked it: a
      // shallow clone may not have it, and then the run fails, saying to fetch the full history.
      const shallow = skipped.some((s) => s.why === SHALLOW_HISTORY);
      // Two commits that each link the repo fail closed (B-mar8x), whatever the commits need; as does HEAD naming another
      // project than CI pins, when HEAD is a merge, which isn't checked as a commit of its own.
      const link = h ? head.linkingCommit() : undefined;
      const problems: string[] = [];
      if (link && "problem" in link && link.problem !== SHALLOW_HISTORY) problems.push(link.problem);
      if (pinned) {
        const tip = git(repo.toplevel, ["rev-parse", "HEAD"]);
        if (!commits.some((c) => c.sha === tip)) problems.push(...otherProject(head, pinned).map((p) => `at HEAD, ${p}`));
      }
      if (pinned && linking === null) {
        warnings.push(`no commit in HEAD's history links the repo to project ${pinned.project}, so no unsigned answer counts as one from before linking${cite("B-45xz8", "B-mar8x")}`);
      }
      const hosted = h
        ? {
            hosted: {
              keys: h.pinned ? ("pinned" as const) : ("record" as const),
              ...(h.project ? { project: h.project } : {}),
              ...(link && "commit" in link ? { linked: link.commit } : {}),
              skipped,
              ...(shallow ? { shallow: true as const } : {}),
              ...(problems.length ? { problems } : {}),
            },
          }
        : {};
      return { base, commits, ...(merge ? { merge } : {}), ...hosted, ...(warnings.length ? { warnings } : {}), ok: ok && !shallow && !problems.length };
    });
  } finally {
    records.dispose();
  }
}

/** A commit as `verify` names it: seven characters of its ID. */
const short = (ref: string): string => (/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(ref) ? ref.slice(0, 7) : ref);

/** What a failing commit says: why, and what to add; the local gate's advice on previewing and bypassing goes. */
function commitBody(r: GateReport): Line[] {
  if (r.uncovered.length !== 1) return blockedBody(r, { steps: false });
  // One decision uncovered, as most failing commits have: a sentence, and the two trailers that cover it.
  const f = r.uncovered[0]!;
  const rest = blockedBody({ ...r, uncovered: [] }, { steps: false });
  return [
    ...rest,
    text(f.id, " ", dim(`(${f.detail})`), " isn't covered: add a trailer for a card whose touches include it, or, for a two-way door, an ack with a reason:"),
    trailer(`${CARD_TRAILER}: <id>`),
    trailer(`${ACK_TRAILER}: ${f.id} <why this is fine>`),
  ].map((l) => (l.kind === "text" && l.indent === 0 ? { ...l, indent: 2 } : l));
}

/** What `verify` prints, for CI's log: a headline, each commit and the merge gate, and what to do about a failure. */
export function describeVerify(r: VerifyResult): Line[] {
  const out: Line[] = [];
  const n = r.commits.length;
  const failing = r.commits.filter((c) => !c.ok);
  const mergeFails = Boolean(r.merge && (r.merge.problems.length || r.merge.conflicts.length));
  const hostedFails = Boolean(r.hosted?.shallow || r.hosted?.problems?.length);
  const commits = `${failing.length && failing.length < n ? `${failing.length} of ` : ""}${n} commit${n === 1 ? "" : "s"} since ${short(r.base)}`;
  const what = r.ok
    ? `${commits}${r.merge ? ", and the merge gate" : ""}`
    : [failing.length ? commits : "", mergeFails ? "the merge gate" : "", hostedFails ? "the hosted record" : ""].filter(Boolean).join(", and ") || commits;
  out.push(r.ok ? head("done", strong("baesian verify:"), " ", ok("ok"), `: ${what}`) : failed(strong("baesian verify:"), " ", failure("failed"), `: ${what}`));
  if (r.hosted) {
    const where = [r.hosted.project ? `project ${r.hosted.project}` : "", r.hosted.linked ? `linked at ${r.hosted.linked.slice(0, 7)}` : ""].filter(Boolean).join(", ");
    out.push(
      ...fields([
        { label: "hosted", value: `only answers the service signed count${cite("D138")}, checked with ${r.hosted.keys === "pinned" ? "the keys CI pins" : "the record's copy of the keys"}${where ? `; ${where}` : ""}` },
      ]),
    );
  }
  for (const c of r.commits) {
    out.push(indent(2, text(c.ok ? ok("ok  ") : failure("FAIL"), " ", id(c.sha.slice(0, 7)), " ", HANG, c.subject)));
    const body = [...(c.report.ok ? [] : commitBody(c.report)), ...c.trust.map((t) => text(t))];
    out.push(...indent(5, body));
  }
  if (r.merge) {
    if (!mergeFails) out.push(indent(2, text(ok("ok  "), " merge gate: every cited card is resolved or deferred")));
    else out.push(indent(2, text(failure("FAIL"), " merge gate")));
    for (const p of r.merge.problems) out.push(indent(7, text(p.message)));
    for (const c of r.merge.conflicts) {
      out.push(indent(7, text(`conflict on ${c.topic}: ${c.base.id} on the base decided ${q(c.base.decision)}, ${c.branch.id} here decided ${q(c.branch.decision)}.`)));
    }
    if (r.merge.conflicts.length) {
      out.push(indent(7, text("Settle it: run the command below locally and answer the conflict card it files, or file a card that ", cmd("supersedes"), " one of them.")));
    }
    for (const m of r.merge.notes) out.push(indent(2, note(m)));
  }
  if (r.hosted?.shallow) out.push(indent(2, text(failure("FAIL"), ` answers from before the repo was linked can't be checked in a shallow clone${cite("B-45xz8")}: fetch the full history (in CI, fetch-depth: 0)`)));
  for (const p of r.hosted?.problems ?? []) out.push(indent(2, text(failure("FAIL"), " ", p)));
  // A file that doesn't count is ignored, not an error (D138): an answer given outside the website, say. Those that don't
  // count because the link can't be told are said once, above.
  const told = new Set([SHALLOW_HISTORY, ...(r.hosted?.problems ?? [])]);
  for (const s of r.hosted?.skipped ?? []) if (!told.has(s.why)) out.push(note(`${s.file} doesn't count: ${s.why}`));
  for (const w of r.warnings ?? []) out.push(warning(w));
  if (r.merge?.conflicts.length) out.push(next("baesian verify --merge --file-conflicts", "locally: files a conflict card to answer"));
  const reword = failing.filter((c) => !c.report.ok);
  if (reword.length) {
    const shas = named(reword.map((c) => c.sha.slice(0, 7)));
    out.push(next(`git rebase -i ${short(r.base)}`, `reword ${shas}'s message${reword.length === 1 ? "" : "s"} to add ${reword.length === 1 ? "its" : "their"} trailers`));
    out.push(indent(2, text(dim("Commits from before the repo used Baesian fail too: verify from a later --base."))));
  }
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
