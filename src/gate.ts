import { execFileSync } from "node:child_process";
import { DEFAULT_INFRA, DEFAULT_SCHEMA, type DetectedFact, type FactKind, type Snapshot, detectFacts } from "./facts.js";
import { matcher } from "./globs.js";
import { answerLine, byLine, q, reviewerOf } from "./quote.js";
import type { Fact, Verdict } from "./schema.js";
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
    const built = store.ledger(id).map((e) => e.meta.commit?.slice(0, 10)).filter(Boolean);
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
  if (card.meta.level === "hard" && status !== "resolved") {
    return {
      card: id,
      problem: "hard-unresolved",
      lines: [`${id} is hard and isn't resolved yet: nothing can build on it until it is (D46). Run \`baesian wait ${id}\`.`],
    };
  }
  return undefined;
}

export function evaluate(store: Store, detection: { facts: DetectedFact[]; warnings: string[] }, trailers: Trailers): GateReport {
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

/** Detect the staged facts with the repo's configured paths. */
export function detectStaged(store: Store, snap: Snapshot) {
  const c = store.config();
  return detectFacts(snap, {
    schema: c.gate_schema ?? DEFAULT_SCHEMA,
    infra: c.gate_infra ?? DEFAULT_INFRA,
    api: c.gate_api ?? [],
    ignore: c.gate_ignore ?? [],
  });
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

/** What the gate prints. Agents read this, so it ends with exactly what to do. */
export function describeReport(r: GateReport, news: Verdict[] = []): string[] {
  const out: string[] = [];
  if (news.length) {
    out.push("baesian: new verdicts since this branch's last commit:");
    for (const v of news) {
      // What the reviewer wrote is quoted, with their name (D169).
      out.push(`  ${v.card} ${answerLine(v)}`);
    }
  }
  for (const w of r.warnings) out.push(`baesian: warning: ${w}`);
  for (const a of r.unusedAcks) out.push(`baesian: note: ${ACK_TRAILER} ${a} matches nothing in this commit`);
  if (r.ok) {
    if (r.covered.length) {
      const parts = r.covered.map(({ fact, cover }) =>
        cover.by === "card" ? `${fact.id} (${cover.card})` : cover.by === "rule" ? `${fact.id} (rule ${cover.rule})` : `${fact.id} (ack)`,
      );
      out.push(`baesian: decisions covered: ${parts.join(", ")}`);
    }
    return out;
  }
  out.push("baesian: commit blocked.");
  for (const m of r.malformed) out.push(`  unreadable trailer: ${m}`);
  for (const p of r.problems) for (const [i, line] of p.lines.entries()) out.push(`${i === 0 ? "  " : "    "}${line}`);
  if (r.uncovered.length) {
    out.push("  These decisions aren't covered by a card or an ack:");
    const width = Math.max(...r.uncovered.map((f) => f.id.length));
    for (const f of r.uncovered) out.push(`    ${f.id.padEnd(width)}  ${f.detail}`);
    out.push("  For each one, either file a card whose `touches` include it (`baesian file`) and add");
    out.push(`    ${CARD_TRAILER}: <id>`);
    out.push("  or, if it's a two-way door, acknowledge it with a reason:");
    for (const f of r.uncovered) out.push(`    ${ACK_TRAILER}: ${f.id} <why this is fine>`);
  }
  out.push("  Trailers go at the end of the message, after a blank line. `baesian check` previews this.");
  out.push("  To bypass in an emergency: git commit --no-verify (CI runs the same check).");
  return out;
}
