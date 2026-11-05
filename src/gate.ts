import { execFileSync } from "node:child_process";
import { cite } from "./cite.js";
import { type Line, cmd, dim, failed, failure, head, id, indent, next, note, table, text, trailer, warning } from "./style.js";
import { CONFIG_PATH, type DetectedFact, type Detection, type FactKind, type Snapshot, detectFacts } from "./facts.js";
import { matcher } from "./globs.js";
import { answerLine, byLine, q, reviewerOf } from "./quote.js";
import type { Config, Fact, Verdict } from "./schema.js";
import type { Store } from "./store.js";
import { ACK_TRAILER, CARD_TRAILER, type Trailers } from "./trailers.js";

// The commit gate (D24, D26, D30, D46, D52, D53): every detected decision is covered by a card or an
// ack, and no commit builds on a rejected card or on a hard card without a verdict.

/** Which detected facts a card covers, by the facts it declares in `touches` (D53). */
export const KIND_OF_TOUCH: Partial<Record<Fact, FactKind>> = {
  dependency: "dep",
  schema: "schema",
  "public-api": "api",
  infra: "infra",
};

export type CoveredBy = { by: "card"; card: string } | { by: "ack"; reason: string } | { by: "rule"; rule: string };

export interface CardProblem {
  card: string;
  problem: "unknown" | "rejected" | "withdrawn" | "superseded" | "hard-unresolved";
  lines: string[];
}

export interface GateReport {
  facts: DetectedFact[];
  covered: { fact: DetectedFact; cover: CoveredBy }[];
  uncovered: DetectedFact[];
  problems: CardProblem[];
  malformed: string[];
  /** Acks for facts this commit doesn't contain. Harmless; reported so typos show. */
  unusedAcks: string[];
  warnings: string[];
  ok: boolean;
}

function lastVerdict(store: Store, id: string): Verdict | undefined {
  const card = store.card(id);
  return store
    .verdicts(id)
    .filter((v) => v.revision === card?.meta.revision)
    .at(-1);
}

/** Why a commit may not cite this card, or undefined if it may. */
function cardProblem(store: Store, id: string): CardProblem | undefined {
  const card = store.card(id);
  if (!card) {
    return {
      card: id,
      problem: "unknown",
      lines: [`${id} isn't a card here. File it first (\`baesian file\`), or fix the ID.`],
    };
  }
  const status = store.status(id);
  if (status === "withdrawn" || status === "superseded") {
    return { card: id, problem: status, lines: [`${id} is ${status}: it no longer applies, so nothing should build on it.`] };
  }
  const last = lastVerdict(store, id);
  if (status === "returned" && last?.response === "reject") {
    const built = store.ledger(id).map((e) => e.meta.commit?.slice(0, 7)).filter(Boolean);
    return {
      card: id,
      problem: "rejected",
      lines: [
        `${id} was rejected by ${byLine(reviewerOf(last))}${last.comment ? `: ${q(last.comment)}` : "."}`,
        `Don't build on it: revise it (\`baesian revise ${id}\`) or withdraw it, and rework what depends on it.`,
        ...(built.length ? [`Commits already built on it: ${built.join(", ")}`] : []),
      ],
    };
  }
  // The level in force: the card's, raised in a hosted repo by the relay's signed gate record (P16 section 3).
  if (store.levelOf(id) === "hard" && status !== "resolved") {
    return {
      card: id,
      problem: "hard-unresolved",
      lines: [`${id} is hard and isn't resolved yet: nothing can build on it until it is${cite("D46")}.`],
    };
  }
  return undefined;
}

export function evaluate(store: Store, detection: { facts: DetectedFact[]; warnings: string[] }, trailers: Trailers): GateReport {
  // One consistent read: a card's status reads the others, and in a hosted repo checks each answer's signature (D138).
  return store.view(() => evaluateIn(store, detection, trailers));
}

function evaluateIn(store: Store, detection: { facts: DetectedFact[]; warnings: string[] }, trailers: Trailers): GateReport {
  const problems = trailers.cards.map((id) => cardProblem(store, id)).filter((p): p is CardProblem => p !== undefined);
  const usable = trailers.cards.filter((id) => !problems.some((p) => p.card === id));
  const rules = store
    .rules()
    .filter((r) => !r.retired)
    .map((r) => ({ id: r.meta.id, covers: matcher(r.meta.covers) }));

  const covered: GateReport["covered"] = [];
  const uncovered: DetectedFact[] = [];
  for (const fact of detection.facts) {
    const reason = trailers.acks.get(fact.id);
    const card = usable.find((id) => store.card(id)!.meta.touches.some((t) => KIND_OF_TOUCH[t] === fact.kind));
    const rule = rules.find((r) => r.covers(fact.id));
    if (reason) covered.push({ fact, cover: { by: "ack", reason } });
    else if (card) covered.push({ fact, cover: { by: "card", card } });
    else if (rule) covered.push({ fact, cover: { by: "rule", rule: rule.id } });
    else uncovered.push(fact);
  }
  const ids = new Set(detection.facts.map((f) => f.id));
  const unusedAcks = [...trailers.acks.keys()].filter((id) => !ids.has(id));
  return {
    facts: detection.facts,
    covered,
    uncovered,
    problems,
    malformed: trailers.malformed,
    unusedAcks,
    warnings: detection.warnings,
    ok: uncovered.length === 0 && problems.length === 0 && trailers.malformed.length === 0,
  };
}

/**
 * Detect the staged facts where the preferences in force say to look (B-qkek1), as the gate at filing reads its rows:
 * locally, the newest preference file in the live layer; in CI, the newest in the commit's own record; in a hosted repo,
 * only one that counts, so a commit can't make the gate see less by writing a file of its own (D138, D163). With none,
 * the built-in paths. Warns when the config still has the keys the gate read before, unless asked not to (`verify` says
 * so once, for HEAD).
 */
export function detectStaged(store: Store, snap: Snapshot, opts: { configWarning?: boolean } = {}): Detection {
  const force = store.inForce();
  const found = detectFacts(snap, force.settings.paths);
  const warnings = [
    ...(force.problem ? [`${force.problem}, so the gate looks where it does by default`] : []),
    ...(opts.configWarning === false ? [] : configWarnings(store.config())),
    ...found.warnings,
  ];
  return { facts: found.facts, warnings };
}

/** The keys a config still has that the gate read before B-qkek1, and reads no longer. */
export function staleGateKeys(config: Config): string[] {
  return (["gate_schema", "gate_infra", "gate_ignore", "gate_api"] as const).filter((k) => config[k] !== undefined);
}

/** What to say when the config still has them: they're ignored, and what to do instead (B-qkek1). */
export function configWarnings(config: Config): string[] {
  const keys = staleGateKeys(config);
  if (!keys.length) return [];
  const them = keys.length === 1 ? keys[0]! : `${keys.slice(0, -1).join(", ")} and ${keys.at(-1)}`;
  return [
    `${CONFIG_PATH} still has ${them}, which the gate no longer reads${cite("B-qkek1")}: what it looks for is in your preferences now, which only you change, in the client (Your preferences, then "What the gate looks for"). Set it there if the built-in lists don't cover it, then delete ${keys.length === 1 ? "it" : "them"} from the config.`,
  ];
}

/** Verdicts on this branch's cards given since the branch's last commit (D30). */
export function verdictsSinceLastCommit(store: Store): Verdict[] {
  let since = "";
  try {
    since = execFileSync("git", ["log", "-1", "--format=%cI", "HEAD"], {
      cwd: store.repo.toplevel,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    since = new Date(since).toISOString();
  } catch {
    // no commits yet: everything is new
  }
  return store
    .branchCards()
    .flatMap((c) => store.verdicts(c.meta.id))
    .filter((v) => v.at > since)
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** IDs in a sentence: "B-a", "B-a and B-b", "B-a, B-b and B-c". */
export const named = (ids: readonly string[]): string => (ids.length < 2 ? ids.join("") : `${ids.slice(0, -1).join(", ")} and ${ids.at(-1)}`);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Why the gate blocks, in a clause: what isn't covered, the cards it can't build on, the trailers it can't read. */
export function blockedBecause(r: GateReport): string {
  const parts: string[] = [];
  if (r.uncovered.length) parts.push(`${plural(r.uncovered.length, "decision")} in it ${r.uncovered.length === 1 ? "isn't" : "aren't"} covered by a card or an ack`);
  if (r.problems.length) parts.push(`it cites ${named(r.problems.map((p) => p.card))}, which it can't build on`);
  if (r.malformed.length) parts.push(`${plural(r.malformed.length, "trailer")} can't be read`);
  return parts.join("; ");
}

/** What to run for a card a commit can't build on: wait on a hard one, revise a rejected one. */
function problemStep(p: CardProblem): Line[] {
  if (p.problem === "hard-unresolved") return [next(`baesian wait ${p.card}`, "until it's resolved")];
  if (p.problem === "rejected") return [next(`baesian revise ${p.card} card.md`, "or withdraw it")];
  return [];
}

/**
 * Why a commit is blocked, and how to cover what isn't: the body of the gate's report, and of each failing commit in
 * `verify`. The trailers to paste are lines of their own, at the start of the line, never styled (B-eyrt5).
 */
export function blockedBody(r: GateReport, opts: { steps?: boolean } = {}): Line[] {
  const out: Line[] = [];
  for (const m of r.malformed) out.push(indent(2, text("unreadable trailer: ", m)));
  for (const p of r.problems) {
    out.push(...indent(2, p.lines.map((l) => text(l))));
    if (opts.steps !== false) out.push(...problemStep(p));
  }
  if (r.uncovered.length) {
    out.push(...table(undefined, r.uncovered.map((f) => [f.id, dim(f.detail)])));
    out.push(indent(2, text("Cover each one with a trailer at the end of the message, after a blank line: a card whose touches include it (", cmd("baesian file"), "),")));
    out.push(trailer(`${CARD_TRAILER}: <id>`));
    out.push(indent(2, text("or, for a two-way door, an ack with a reason:")));
    for (const f of r.uncovered) out.push(trailer(`${ACK_TRAILER}: ${f.id} <why this is fine>`));
  }
  return out;
}

/** The decisions a passing commit has, each with what covers it. */
function coveredRows(r: GateReport): Line[] {
  return table(
    undefined,
    r.covered.map(({ fact, cover }) => [fact.id, cover.by === "card" ? id(cover.card) : cover.by === "rule" ? ["rule ", id(cover.rule)] : "ack"]),
  );
}

/**
 * What the gate prints: at commit time (`for: "commit"`, from the hooks, which prefix each line), or as `baesian check`
 * previews it. Agents read this, so it ends with exactly what to do. New verdicts since the branch's last commit come
 * after, the reviewer's words quoted with their name (D169).
 */
export function describeReport(r: GateReport, opts: { news?: Verdict[]; for?: "commit" | "check"; message?: boolean } = {}): Line[] {
  const commit = opts.for !== "check";
  const out: Line[] = [];
  if (!r.ok) {
    out.push(failed(failure(commit ? "commit blocked" : "this commit would be blocked"), ": ", blockedBecause(r)));
    out.push(...blockedBody(r));
    if (commit) out.push(indent(2, text(dim("To bypass it in an emergency: git commit --no-verify. CI runs the same check."))));
    else if (!opts.message && r.uncovered.length) out.push(next("baesian check --message <file>", "check a message's trailers before you commit"));
  } else if (r.covered.length) {
    const n = r.covered.length;
    const covered = n === 1 ? "its decision is covered" : `its ${n} decisions are covered`;
    out.push(head("done", commit ? covered : `this commit would pass: ${covered}`));
    out.push(...coveredRows(r));
  } else if (!commit) out.push(head("done", "no decisions detected in the staged changes"));
  for (const w of r.warnings) out.push(warning(w));
  for (const a of r.unusedAcks) out.push(note(`${ACK_TRAILER} ${a} matches nothing in this commit`));
  const news = opts.news ?? [];
  if (news.length) {
    out.push(head("attention", plural(news.length, "new verdict"), " since this branch's last commit"));
    // What the reviewer wrote is quoted, with their name (D169).
    for (const v of news) out.push(indent(2, text(id(v.card), " ", answerLine(v))));
  }
  return out;
}
