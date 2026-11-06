import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import type { ApiContextNote } from "./api.js";
import { parseDoc, renderDoc } from "./frontmatter.js";
import { type Field, type Line, type Piece, blank, cmd, literal, note } from "./style.js";
import { type RuleMeta, type RuleRetirement, type Verdict, newestFormat, upgradeFile } from "./schema.js";
import { type Card, type Status, Store, normalise } from "./store.js";
import { linkText, parseWikilink } from "./wikilinks.js";

// M6, the vault adapter (docs/vault/Design/Vault Adapter.md, P17; D170–D175). A vault is Markdown in the repo, with
// Obsidian as its interface. The record stays the source of truth: this module renders one note per decision and per
// rule from it, extends a note when its decision changes, and resolves a deck's wikilinks. It reads nothing from the
// vault that could change what the gate lets through (D173).

/** Where decision and rule notes go, inside the vault (D171). */
export const DECISIONS = "Decisions";
export const RULES = "Rules";
/** The vault's hand-written log, which embeds the query (D43). */
export const DECISION_LOG = "Decision Log.md";
/** The notes agents are pointed to as guidance on when to file, at the vault's root, whichever exist (D173). */
export const ROUTING_NOTES = ["Working Agreement.md", "Code Conventions.md"] as const;

/** A decision note's title is cut at this many characters, and a rule's first words at this many (D171). */
export const TITLE_MAX = 80;
export const RULE_WORDS_MAX = 60;

// ---------------------------------------------------------------- the vault's folder

/** Why a configured vault path can't be used, if it can't: it must be relative, and inside the repo. */
export function vaultPathProblem(toplevel: string, vault: string): string | undefined {
  if (isAbsolute(vault)) return `the vault must be a path relative to the repo root, not ${vault}`;
  const dir = resolve(toplevel, vault);
  if (dir !== toplevel && !dir.startsWith(toplevel + sep)) return `the vault must be inside the repo: ${vault} is outside it`;
  return undefined;
}

/** A vault path as the config keeps it: relative, with forward slashes, and no trailing slash. */
export function cleanVaultPath(vault: string): string {
  return normalize(vault).split(sep).join("/").replace(/\/+$/, "") || ".";
}

export interface VaultAt {
  /** As the config names it, relative to the repo root. */
  rel: string;
  /** Its absolute path. */
  dir: string;
}

/** The store's configured vault, if it names one that's inside the repo. */
export function vaultOf(store: Store): VaultAt | { rel: string; problem: string } | undefined {
  const rel = store.config().vault;
  if (!rel) return undefined;
  const problem = vaultPathProblem(store.repo.toplevel, rel);
  if (problem) return { rel, problem };
  return { rel: cleanVaultPath(rel), dir: resolve(store.repo.toplevel, rel) };
}

// ---------------------------------------------------------------- names (D171)

/** The characters Obsidian can't use in a note's name or a link to it. */
const FORBIDDEN = /[*"\\/<>:|?#^[\]]/g;

/** A title made fit for a file name: those characters removed, spacing collapsed, and cut at a word boundary. */
export function cleanName(text: string, max: number): string {
  const s = text.replace(FORBIDDEN, "").replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim();
  const chars = [...s];
  let out = s;
  if (chars.length > max) {
    const head = chars.slice(0, max + 1).join("");
    const space = head.lastIndexOf(" ");
    out = space > 0 ? head.slice(0, space) : chars.slice(0, max).join("");
  }
  // A name ending in a dot or a space trips some file systems.
  return out.replace(/[\s.]+$/, "");
}

/** `B-3akjw How an answer becomes a rule`: the card ID, and the first revision's title, which never changes. */
export function decisionNoteName(id: string, firstTitle: string): string {
  const title = cleanName(firstTitle, TITLE_MAX);
  return title ? `${id} ${title}` : id;
}

/** `R-g4mn8 Never put secrets in URLs`: the rule ID, and the rule's first words. */
export function ruleNoteName(id: string, text: string): string {
  const words = cleanName(text, RULE_WORDS_MAX);
  return words ? `${id} ${words}` : id;
}

/** A note's ID, from the start of its file name: a note renamed by hand is still found if it keeps it. */
const NOTE_ID = /^([BR]-[0-9a-hjkmnp-tv-z]{5})(?=[\s.]|$)/;
export const noteIdOf = (fileName: string): string | undefined => NOTE_ID.exec(fileName)?.[1];

const day = (iso: string) => iso.slice(0, 10);
const link = (name: string, id: string) => `[[${name}|${id}]]`;
/** Text ending as a sentence: a full stop added unless it already ends in one. */
const sentence = (s: string) => (/[.!?…]["”’)]?$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
const withoutStop = (s: string) => s.trim().replace(/[.]+$/, "");
/** What follows from an option: "Then runs are recorded…", or, when the agent wrote it as a sentence, that sentence. */
const consequence = (s: string) => (/^\p{Lu}/u.test(s.trim()) ? sentence(s) : `Then ${sentence(s)}`);
const quote = (s: string) => `"${s.trim()}"`;

// ---------------------------------------------------------------- a decision's history (D172)

/** A resolving verdict, with the revision it answered and what it decided. */
interface Resolution {
  verdict: Verdict;
  card: Card;
  answer: string;
}

/** A dated section added at the end of a note when its decision changes (D172). */
export interface Section {
  at: string;
  heading: string;
  text: string;
}

interface History {
  /** The first answer that resolved the card: the note's body is rendered from it, and never changes. */
  first: Resolution;
  /** The latest answer that resolved it: the frontmatter shows it. */
  latest: Resolution;
  sections: Section[];
  supersededBy?: string;
}

const RESOLVES = new Set<Verdict["response"]>(["accept", "alternative", "correction"]);

const REOPENED_BY: Partial<Record<Verdict["response"], string>> = {
  reject: "rejected it",
  question: "asked a question",
  need_context: "asked for more context",
  see_it_run: "asked to see it run",
  not_my_area: "passed it on, as outside their area",
  defer: "deferred it",
};

const HOW: Record<"accept" | "alternative" | "correction", string> = {
  accept: "the agent's pick",
  alternative: "the alternative",
  correction: "the reviewer's own answer",
};

/** One read of a record, for rendering every note from it. */
class Reading {
  /** The cards that supersede a card, or name it in a conflict (D35). */
  private readonly claims = new Map<string, Card[]>();
  private readonly histories = new Map<string, History | undefined>();

  constructor(readonly record: Store) {
    for (const c of record.cards()) {
      for (const target of [c.meta.supersedes, ...(c.meta.conflict_of ?? [])]) {
        if (target) (this.claims.get(target) ?? this.claims.set(target, []).get(target)!).push(c);
      }
    }
  }

  first(id: string): Card | undefined {
    return this.record.revisions(id)[0];
  }

  /** What a verdict decided, for one that resolves. */
  answerOf(v: Verdict): Resolution | undefined {
    if (!RESOLVES.has(v.response)) return undefined;
    const card = this.record.revisions(v.card).find((r) => r.meta.revision === v.revision);
    if (!card) return undefined;
    return { verdict: v, card, answer: v.response === "accept" ? card.meta.proposal : v.choice! };
  }

  /** A link to a card's decision note: its name is built from its first revision, so any copy of the card builds it. */
  linkTo(id: string): string {
    const first = this.first(id);
    return first ? link(decisionNoteName(id, first.meta.title), id) : id;
  }

  /** A link for the frontmatter, which is rendered afresh each time: only to a card that has a note. */
  linkIfNoted(id: string): string {
    return this.history(id) ? this.linkTo(id) : id;
  }

  /** Whether a card gets a decision note: it is or was resolved, and isn't a rule draft (D110). */
  noted(id: string): boolean {
    return this.history(id) !== undefined;
  }

  /**
   * The card's history after its first answer, walked in time order from immutable files only, so the sections a
   * note gains are the same on every branch that holds the same files, and a note written fresh equals one written
   * earlier and extended since.
   */
  history(id: string): History | undefined {
    if (this.histories.has(id)) return this.histories.get(id);
    this.histories.set(id, undefined); // a cycle of claims reads as no history, not a loop
    const h = this.walk(id);
    this.histories.set(id, h);
    return h;
  }

  private walk(id: string): History | undefined {
    const revisions = this.record.revisions(id);
    const r1 = revisions[0];
    if (!r1 || r1.meta.rule !== undefined) return undefined;
    type Ev =
      | { at: string; rank: number; kind: "verdict"; v: Verdict }
      | { at: string; rank: number; kind: "reply"; rev: Card }
      | { at: string; rank: number; kind: "parent"; parent: string; v: Verdict }
      | { at: string; rank: number; kind: "claim"; claimant: Card; v: Verdict }
      | { at: string; rank: number; kind: "withdrawn"; by: string; reason: string };
    const evs: Ev[] = this.record.verdicts(id).map((v) => ({ at: v.at, rank: 0, kind: "verdict", v }));
    for (const rev of revisions) if (rev.meta.reply !== undefined) evs.push({ at: rev.meta.created, rank: 1, kind: "reply", rev });
    for (const parent of r1.meta.depends_on) {
      for (const v of this.first(parent) ? this.record.verdicts(parent) : []) {
        if (v.at < r1.meta.created) continue;
        if (v.response === "reject" || v.response === "alternative" || v.response === "correction") evs.push({ at: v.at, rank: 2, kind: "parent", parent, v });
      }
    }
    for (const claimant of this.claims.get(id) ?? []) {
      for (const v of this.record.verdicts(claimant.meta.id)) if (RESOLVES.has(v.response)) evs.push({ at: v.at, rank: 3, kind: "claim", claimant, v });
    }
    const w = this.record.withdrawal(id);
    if (w) evs.push({ at: w.at, rank: 4, kind: "withdrawn", by: w.by, reason: w.reason });
    evs.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.rank - b.rank));

    let phase: "none" | "active" | "reopened" | "done" = "none";
    let first: Resolution | undefined;
    let latest: Resolution | undefined;
    let supersededBy: string | undefined;
    const sections: Section[] = [];
    const add = (at: string, heading: string, lines: (string | false | undefined)[]) =>
      sections.push({ at, heading: `${heading} on ${day(at)}`, text: lines.filter((l): l is string => Boolean(l)).join("\n\n") });
    const notInForce = "Until the card is answered again, this decision isn't in force.";

    for (const e of evs) {
      if (phase === "done") break;
      if (e.kind === "verdict") {
        const r = this.answerOf(e.v);
        if (r) {
          if (phase === "none") {
            first = latest = r;
            phase = "active";
            continue;
          }
          const was = latest!.answer;
          const how = HOW[e.v.response as keyof typeof HOW];
          const comment = e.v.comment && `**Comment:** ${quote(e.v.comment)}`;
          if (normalise(r.answer) !== normalise(was)) {
            add(e.at, "Changed", [`**Now:** ${sentence(`${withoutStop(r.answer)}, ${how}`)} **Was:** ${sentence(was)} Answered by ${e.v.reviewer}.`, comment]);
          } else if (phase === "reopened") {
            add(e.at, "Answered again", [`**Decided:** ${sentence(`${withoutStop(r.answer)}, ${how}, as before`)} Answered by ${e.v.reviewer}.`, comment]);
          }
          latest = r;
          phase = "active";
        } else if (phase === "active") {
          const what = REOPENED_BY[e.v.response] ?? e.v.response;
          add(e.at, "Reopened", [e.v.comment ? `${e.v.reviewer} ${what}: ${quote(e.v.comment)}` : `${e.v.reviewer} ${what}.`, notInForce]);
          phase = "reopened";
        }
      } else if (phase === "none") {
        if (e.kind === "withdrawn" || (e.kind === "parent" && e.v.response === "reject")) return undefined; // withdrawn before any answer
      } else if (e.kind === "reply") {
        if (phase !== "active") continue;
        add(e.at, "Reopened", [`${e.rev.meta.source_agent} replied to the answer, once: ${quote(e.rev.meta.reply!)}`, notInForce]);
        phase = "reopened";
      } else if (e.kind === "parent") {
        if (e.v.response === "reject") {
          add(e.at, "Withdrawn", [`It builds on ${e.parent}, which was rejected${e.v.comment ? `: ${quote(e.v.comment)}` : "."}`]);
          phase = "done";
        } else if (phase === "active") {
          add(e.at, "Reopened", [`It builds on ${this.linkTo(e.parent)}, which was decided otherwise: ${quote(e.v.choice ?? "")}.`, notInForce]);
          phase = "reopened";
        }
      } else if (e.kind === "claim") {
        const won = this.answerOf(e.v)!;
        const supersedes = e.claimant.meta.supersedes === id;
        // A conflict card supersedes the decisions it names that it didn't choose (D35).
        if (!supersedes && normalise(won.answer) === normalise(latest!.answer)) continue;
        add(e.at, "Superseded", [`By ${this.linkTo(e.claimant.meta.id)}, which decided: ${sentence(won.answer)}`]);
        supersededBy = e.claimant.meta.id;
        phase = "done";
      } else {
        add(e.at, "Withdrawn", [`By ${e.by}: ${sentence(e.reason)}`]);
        phase = "done";
      }
    }
    if (!first || !latest) return undefined;
    return { first, latest, sections, ...(supersededBy ? { supersededBy } : {}) };
  }
}

// ---------------------------------------------------------------- rendering

/** The note's status, from the store's (D172): `active`, `superseded`, `withdrawn`, or `reopened` for anything open again. */
function noteStatus(s: Status): string {
  return s === "resolved" ? "active" : s === "superseded" || s === "withdrawn" ? s : "reopened";
}

/** The options a resolution didn't choose: one, or both for the reviewer's own answer. */
function notChosen(r: Resolution): { name: string; then: string; pick: boolean }[] {
  const m = r.card.meta;
  const options = [
    { name: m.proposal, then: m.proposal_then, pick: true },
    { name: m.alternative, then: m.alternative_then, pick: false },
  ];
  if (r.verdict.response === "correction") return options;
  return options.filter((o) => normalise(o.name) !== normalise(r.answer));
}

/** Keys the adapter owns, in the order it writes them: the vault's own keys, then the decision's (P17 §2). */
const DECISION_KEYS = [
  "type", "format", "status", "authority", "livedocs", "summary", "created", "updated", "tags", "aliases",
  "card", "revision", "title", "question", "answer", "response", "not_chosen", "answered", "answered_by",
  "topic", "deck", "level", "reverse", "touches", "filed", "filed_by", "branch",
  "depends_on", "supersedes", "superseded_by", "conflict_of",
] as const;

const RULE_KEYS = [
  "type", "format", "status", "authority", "livedocs", "summary", "created", "updated", "tags", "aliases",
  "rule", "topic", "covers", "from_card", "accepted_by", "accepted", "retired", "retired_by", "retired_on",
] as const;

interface Rendered {
  /** Which kind of note, for its format number (D156). */
  kind: "decision-note" | "rule-note";
  meta: Record<string, unknown>;
  owned: readonly string[];
  head: string;
  sections: Section[];
}

function decisionNote(read: Reading, id: string, h: History): Rendered {
  const record = read.record;
  const r1 = read.first(id)!;
  const a = h.latest;
  const m = a.card.meta;
  const meta = {
    type: "decision",
    format: newestFormat("decision-note"),
    status: noteStatus(record.status(id)),
    authority: "log",
    livedocs: "snapshot",
    summary: `${withoutStop(m.title)}: ${withoutStop(a.answer)} (${id}).`,
    created: day(h.first.verdict.at),
    updated: day(h.sections.at(-1)?.at ?? h.first.verdict.at),
    tags: ["baesian", "decision"],
    aliases: [id],
    card: id,
    revision: m.revision,
    title: m.title,
    question: m.question,
    answer: a.answer,
    response: a.verdict.response,
    not_chosen: notChosen(a).map((o) => o.name),
    answered: a.verdict.at,
    answered_by: a.verdict.reviewer,
    topic: record.canonicalTopic(m.topic),
    deck: m.deck,
    level: m.level,
    reverse: m.reverse,
    touches: m.touches,
    filed: r1.meta.created,
    filed_by: r1.meta.source_agent,
    branch: r1.meta.source_branch,
    depends_on: m.depends_on.map((p) => read.linkIfNoted(p)),
    supersedes: m.supersedes ? read.linkIfNoted(m.supersedes) : undefined,
    superseded_by: record.status(id) === "superseded" && h.supersededBy ? read.linkIfNoted(h.supersededBy) : undefined,
    conflict_of: m.conflict_of?.map((c) => read.linkIfNoted(c)),
  };
  return { kind: "decision-note", meta, owned: DECISION_KEYS, head: decisionHead(read, id, h.first), sections: h.sections };
}

/** The body as a person reads it, in the client's order: the question, what was decided, then the rest (P17 §2). */
function decisionHead(read: Reading, id: string, r: Resolution): string {
  const m = r.card.meta;
  const v = r.verdict;
  const r1 = read.first(id)!;
  const how = HOW[v.response as keyof typeof HOW];
  const chosen = v.response === "accept" ? { then: m.proposal_then } : v.response === "alternative" && normalise(v.choice!) === normalise(m.alternative) ? { then: m.alternative_then } : {};
  const lines: string[] = [`# ${m.title}`, m.question];
  lines.push(`**Decided:** ${sentence(`${withoutStop(r.answer)}, ${how}`)}${chosen.then ? ` ${consequence(chosen.then)}` : ""}`);
  for (const o of notChosen(r)) lines.push(`**Not chosen:** ${sentence(o.pick ? `${withoutStop(o.name)}, the agent's pick` : o.name)} ${consequence(o.then)}`);
  lines.push(
    `**It turned on:** ${m.crux}${m.crux_preference ? " (a preference)" : ""} ${withoutStop(m.crux_proposal)}: ${sentence(m.proposal)} ${withoutStop(m.crux_alternative)}: ${sentence(m.alternative)}`,
  );
  if (m.crux_fact) lines.push(`**The fact given:** ${sentence(m.crux_fact)}`);
  if (v.comment) lines.push(`**Comment:** ${quote(v.comment)}`);
  // B-hswmx: the reviewer answered it in chat first, and the agent filed that answer as its pick.
  if (m.answered_in_chat) lines.push(`**Answered in chat first:** ${quote(m.answered_in_chat)}, which the agent filed as its pick.`);
  const option =v.response === "accept" ? "proposal" : v.response === "alternative" ? "alternative" : undefined;
  if (v.first_choice && option && v.first_choice !== option) lines.push(`**First chose:** ${sentence(`${withoutStop(m[v.first_choice])}, then switched once the agent's pick was shown`)}`);
  if (m.rationale) lines.push(`**The agent's case:** ${sentence(m.rationale)}`);
  if (m.wrong_if) lines.push(`**Wrong if:** ${sentence(m.wrong_if)}${m.check ? ` **To check:** ${sentence(m.check)}` : ""}`);
  if (m.reply) lines.push(`**The agent's reply:** ${sentence(m.reply)}`);
  const deck = read.record.deck(m.deck);
  const context = (deck?.meta.context_notes ?? []).map((n) => (n.startsWith("[[") ? n : `[[${n}]]`));
  lines.push(
    [
      `Answered by ${v.reviewer} on ${day(v.at)}, through Baesian (card ${id}, revision ${m.revision}).`,
      `Filed by ${r1.meta.source_agent} on ${r1.meta.source_branch}, in the deck ${deck ? `“${deck.meta.title}”` : m.deck}.`,
      context.length ? `Context: ${context.join(", ")}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    `The record is in \`.baesian/cards/${id}/\`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.`,
  );
  if (r.card.body.trim()) lines.push("## Background", r.card.body.trim());
  return lines.join("\n\n");
}

/** A rule's first sentence, for its summary. */
function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const m = /^.*?[.!?](?=\s|$)/.exec(flat);
  return m ? m[0] : flat;
}

function ruleNote(read: Reading, rule: { meta: RuleMeta; body: string; retired?: RuleRetirement }): Rendered {
  const { meta: r, retired } = rule;
  const text = rule.body.trim();
  const meta = {
    type: "rule",
    format: newestFormat("rule-note"),
    status: retired ? "retired" : "active",
    authority: "specifies",
    livedocs: "snapshot",
    summary: firstSentence(text),
    created: day(r.created),
    updated: day(retired?.at ?? r.created),
    tags: ["baesian", "rule"],
    aliases: [r.id],
    rule: r.id,
    topic: r.topic,
    covers: r.covers,
    from_card: r.from_card ? read.linkIfNoted(r.from_card) : undefined,
    accepted_by: r.accepted_by,
    accepted: r.created,
    retired: retired?.at,
    retired_by: retired?.by,
    retired_on: retired ? read.linkIfNoted(retired.card) : undefined,
  };
  // A rule reaches every branch's record, but the card it came from may not: the body names cards only by ID, so
  // every branch writes the same bytes. The frontmatter, rendered afresh each time, links them.
  const words = [...text.replace(/\s+/g, " ")].length > RULE_WORDS_MAX ? `${cleanName(text, RULE_WORDS_MAX)}…` : text.replace(/\s+/g, " ");
  const covers = r.covers.length
    ? `It lets a commit through the gate without a card when these are its only decisions: ${r.covers.map((c) => `\`${c}\``).join(", ")}.`
    : `It covers no gate facts: it's shown beside the cards on its topic${r.topic ? `, ${r.topic}` : ""}.`;
  const head = [
    `# ${words}`,
    text.split("\n").map((l) => `> ${l}`.trimEnd()).join("\n"),
    [`Accepted by ${r.accepted_by} on ${day(r.created)}${r.from_card ? `, from the decision ${r.from_card}` : ""}.`, covers].join(" "),
    `The rule is in \`.baesian/rules/${r.id}.md\`. Editing this note changes no rule: a rule is made by accepting a draft in the Baesian client, and retired by an answer there.`,
  ].join("\n\n");
  const sections: Section[] = retired
    ? [{ at: retired.at, heading: `Retired on ${day(retired.at)}`, text: `By ${retired.by}, with the answer on ${retired.card}, whose chosen option breaks it. The gate no longer applies it.` }]
    : [];
  return { kind: "rule-note", meta, owned: RULE_KEYS, head, sections };
}

/** A note written from scratch. */
function fresh(n: Rendered): string {
  return renderDoc(n.meta, [n.head, ...n.sections.map(sectionText)].map((p) => p.trimEnd()).join("\n\n"));
}

const sectionText = (s: Section) => `## ${s.heading}\n\n${s.text}`;
const GENERATED = /^## (?:Superseded|Changed|Reopened|Withdrawn|Answered again|Retired) on \d{4}-\d{2}-\d{2}$/;

/**
 * An existing note brought up to date (D172): the owned keys rendered afresh, in order, then the keys a person added;
 * and each missing section added, in its place among the ones already there, or at the end. Nothing in the body is
 * rewritten, so text a person added stays where they put it. A note with no `format` was written before v1, and gains
 * it now; one in a newer format than this Baesian writes is refused (D157), and left as it is.
 */
export function extendNote(existing: string, n: Rendered): string {
  const { meta: old, body } = parseDoc(existing);
  upgradeFile(n.kind, old, "the note");
  const owned = new Set(n.owned);
  const union = (key: string) => [...new Set([...((n.meta[key] as string[] | undefined) ?? []), ...(Array.isArray(old[key]) ? (old[key] as unknown[]).map(String) : [])])];
  const meta: Record<string, unknown> = { ...n.meta, tags: union("tags"), aliases: union("aliases") };
  for (const [k, v] of Object.entries(old)) if (!owned.has(k)) meta[k] = v;

  const lines = body.split("\n");
  const found = lines.flatMap((l, i) => (GENERATED.test(l.trimEnd()) ? [{ heading: l.trimEnd(), line: i }] : []));
  let p = 0;
  const at: (number | undefined)[] = n.sections.map((s) => {
    const want = `## ${s.heading}`;
    let q = p;
    while (q < found.length && found[q]!.heading !== want) q++;
    if (q >= found.length) return undefined;
    p = q + 1;
    return found[q]!.line;
  });
  const before = new Map<number, string[]>();
  const end: string[] = [];
  n.sections.forEach((s, i) => {
    if (at[i] !== undefined) return;
    const anchor = at.slice(i + 1).find((x) => x !== undefined);
    if (anchor === undefined) end.push(sectionText(s));
    else (before.get(anchor) ?? before.set(anchor, []).get(anchor)!).push(sectionText(s));
  });
  const out: string[] = [];
  lines.forEach((l, i) => {
    for (const s of before.get(i) ?? []) {
      if (out.length && out.at(-1)!.trim() !== "") out.push("");
      out.push(...s.split("\n"), "");
    }
    out.push(l);
  });
  let text = out.join("\n");
  if (end.length) text = `${text.trimEnd()}\n\n${end.join("\n\n")}\n`;
  return renderDoc(meta, text);
}

// ---------------------------------------------------------------- planning and writing

/** One note the record calls for: where it is (or goes), what it holds now, and what it should hold. */
export interface PlannedNote {
  kind: "decision" | "rule";
  id: string;
  /** Relative to the repo root, with forward slashes. */
  path: string;
  current?: string;
  next: string;
  /** What any version of the note becomes once brought up to date: the hook compares the index's version with this. */
  update: (text: string) => string;
}

/** Every note in a vault folder, by the ID its name starts with: a note moved into a subfolder is found too. */
function notesById(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (d: string) => {
    let names: string[];
    try {
      names = readdirSync(d).sort();
    } catch {
      return;
    }
    for (const name of names) {
      const path = join(d, name);
      const st = lstatSync(path);
      if (st.isDirectory() && !name.startsWith(".")) walk(path);
      else if (st.isFile() && name.endsWith(".md")) {
        const id = noteIdOf(name);
        if (id && !out.has(id)) out.set(id, path);
      }
    }
  };
  walk(dir);
  return out;
}

/** The IDs of the decisions and rules a record calls notes for. */
export function notedIds(record: Store): { decisions: string[]; rules: string[] } {
  return record.view(() => {
    const read = new Reading(record);
    return { decisions: record.cardIds().filter((id) => read.noted(id)), rules: record.rules().map((r) => r.meta.id) };
  });
}

/**
 * The notes a record calls for in a vault, each with what it should hold (D170–D172). Read-only. A note whose
 * frontmatter can't be read is left alone, with a warning.
 */
export function planNotes(record: Store, toplevel: string, vault: VaultAt): { notes: PlannedNote[]; warnings: string[] } {
  const warnings: string[] = [];
  const notes: PlannedNote[] = [];
  const rel = (abs: string) => relative(toplevel, abs).split(sep).join("/");
  record.view(() => {
    const read = new Reading(record);
    const plan = (kind: PlannedNote["kind"], id: string, folder: string, name: string, existing: Map<string, string>, n: Rendered) => {
      const path = existing.get(id) ?? join(vault.dir, folder, `${name}.md`);
      const current = existsSync(path) ? readFileSync(path, "utf8") : undefined;
      let next: string;
      try {
        next = current === undefined ? fresh(n) : extendNote(current, n);
      } catch (e) {
        warnings.push(`left ${rel(path)} alone: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
      notes.push({ kind, id, path: rel(path), ...(current !== undefined ? { current } : {}), next, update: (text) => extendNote(text, n) });
    };
    const decisions = notesById(join(vault.dir, DECISIONS));
    for (const id of record.cardIds()) {
      const h = read.history(id);
      if (!h) continue;
      plan("decision", id, DECISIONS, decisionNoteName(id, read.first(id)!.meta.title), decisions, decisionNote(read, id, h));
    }
    const rules = notesById(join(vault.dir, RULES));
    for (const rule of record.rules()) plan("rule", rule.meta.id, RULES, ruleNoteName(rule.meta.id, rule.body), rules, ruleNote(read, rule));
  });
  return { notes, warnings };
}

export interface NotesResult {
  /** The vault, as the config names it; absent when none is configured. */
  vault?: string;
  /** Every note the record calls for that's on disk now, relative to the repo root. */
  notes: string[];
  /** What each of them should hold. */
  planned: PlannedNote[];
  /** The notes written this time. */
  written: string[];
  /** Notes that needed a change but weren't written, because `mayWrite` said no. */
  skipped: string[];
  warnings: string[];
  /** Set when a vault is configured but can't be written: it's missing, or outside the repo. */
  unusable?: true;
}

/**
 * Bring the vault's notes up to date with the worktree's record (D170): a note for each decision and rule that has
 * none, and the changes to those that have one (D172). Nothing happens without a vault in the config (D8). A vault
 * that isn't there is a warning, never an error: the notes are a view.
 */
export function writeNotes(store: Store, opts: { mayWrite?: (note: PlannedNote) => boolean } = {}): NotesResult {
  const v = vaultOf(store);
  if (!v) return { notes: [], planned: [], written: [], skipped: [], warnings: [] };
  const result: NotesResult = { vault: v.rel, notes: [], planned: [], written: [], skipped: [], warnings: [] };
  if ("problem" in v) {
    result.warnings.push(`${v.problem} (.baesian/config.json); no vault notes written`);
    return { ...result, unusable: true };
  }
  if (!existsSync(v.dir)) {
    result.warnings.push(`the vault ${v.rel}/ that .baesian/config.json names isn't there; no vault notes written`);
    return { ...result, unusable: true };
  }
  if (!existsSync(store.record)) return result;
  const record = store.readOnly ? store : Store.overRecord(store.repo, store.record);
  const { notes, warnings } = planNotes(record, store.repo.toplevel, v);
  result.warnings.push(...warnings);
  result.planned = notes;
  for (const n of notes) {
    if (n.next !== n.current) {
      if (opts.mayWrite && !opts.mayWrite(n)) {
        result.skipped.push(n.path);
        if (n.current !== undefined) result.notes.push(n.path);
        continue;
      }
      const abs = join(store.repo.toplevel, n.path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, n.next);
      result.written.push(n.path);
    }
    result.notes.push(n.path);
  }
  return result;
}

/** What `baesian verify` warns about (P17 §11): a missing vault, and decisions or rules in the record with no note. */
export function vaultWarnings(record: Store, files: { vaultExists: boolean; paths: string[] }): string[] {
  const vault = record.config().vault;
  if (!vault) return [];
  const rel = cleanVaultPath(vault);
  if (!files.vaultExists) return [`the vault ${rel}/ that .baesian/config.json names isn't in the commit`];
  const present = new Set(files.paths.map((p) => noteIdOf(p.split("/").at(-1)!)).filter((x): x is string => x !== undefined));
  const { decisions, rules } = notedIds(record);
  const missing = [...decisions, ...rules].filter((id) => !present.has(id));
  if (!missing.length) return [];
  const shown = missing.slice(0, 8).join(", ") + (missing.length > 8 ? `, and ${missing.length - 8} more` : "");
  return [`${rel}/ lacks ${missing.length} note${missing.length === 1 ? "" : "s"} for what the record holds (${shown}): run \`baesian sync\`, then commit.`];
}

// ---------------------------------------------------------------- `baesian init --vault` (P17 §5)

/** The Decision Log's section: one Bases query over the notes, with three views (P17 §5, unchanged). */
export const DECISION_LOG_SECTION = `## Decided through Baesian

One note per decision in \`Decisions/\`, and per rule in \`Rules/\`, written by Baesian from the record.

\`\`\`base
filters:
  or:
    - file.inFolder("Decisions")
    - file.inFolder("Rules")
properties:
  note.answer:
    displayName: Decided
  note.answered:
    displayName: Answered
  note.covers:
    displayName: Gate facts
views:
  - type: table
    name: Decisions in force
    filters:
      and:
        - 'note.type == "decision"'
        - 'note.status == "active"'
    order:
      - file.name
      - note.answer
      - note.answered
      - note.topic
    sort:
      - property: note.answered
        direction: DESC
  - type: table
    name: Rules in force
    filters:
      and:
        - 'note.type == "rule"'
        - 'note.status == "active"'
    order:
      - file.name
      - note.summary
      - note.covers
      - note.accepted
    sort:
      - property: note.accepted
        direction: DESC
  - type: table
    name: Everything
    order:
      - file.name
      - note.type
      - note.status
      - note.answer
      - note.updated
    sort:
      - property: note.updated
        direction: DESC
\`\`\`
`;

/** Whether a note already holds the query: the section's heading, or a base block over `Decisions`. */
function holdsQuery(text: string): boolean {
  return /^## Decided through Baesian\s*$/m.test(text) || /```base[\s\S]*?file\.inFolder\("Decisions"\)[\s\S]*?```/.test(text);
}

/**
 * Insert the section into the vault's Decision Log, once, before its first second-level heading (or at the end). It's
 * never rewritten after that. `no-log` means there's no Decision Log to put it in: print it to paste instead.
 */
export function insertLogQuery(vaultDir: string): "inserted" | "present" | "no-log" {
  const path = join(vaultDir, DECISION_LOG);
  if (!existsSync(path)) return "no-log";
  const text = readFileSync(path, "utf8");
  if (holdsQuery(text)) return "present";
  const lines = text.split("\n");
  let fenced = false;
  let at = -1;
  // Skip the frontmatter, and anything in a code block, looking for the first `## ` heading.
  let i = lines[0]?.trim() === "---" ? lines.findIndex((l, j) => j > 0 && l.trim() === "---") + 1 : 0;
  for (; i < lines.length; i++) {
    const l = lines[i]!;
    if (/^\s*(```|~~~)/.test(l)) fenced = !fenced;
    else if (!fenced && /^## /.test(l)) {
      at = i;
      break;
    }
  }
  const section = DECISION_LOG_SECTION.trimEnd().split("\n");
  const next = at < 0 ? `${text.trimEnd()}\n\n${DECISION_LOG_SECTION}` : [...lines.slice(0, at), ...section, "", ...lines.slice(at)].join("\n");
  writeFileSync(path, next);
  return "inserted";
}

/**
 * Turn Obsidian's Bases core plugin on (P17 §5), in the vault's `.obsidian/core-plugins.json`: set `"bases": true` in
 * its object form, keeping the other keys and their order, or add `"bases"` to its older list form. A vault with no
 * `.obsidian/`, or no `core-plugins.json`, is left alone: creating them would give Obsidian settings nobody chose.
 */
export function enableBases(vaultDir: string): "enabled" | "already" | "no-obsidian" | "no-core-plugins" | "unreadable" {
  const obsidian = join(vaultDir, ".obsidian");
  if (!existsSync(obsidian)) return "no-obsidian";
  const path = join(obsidian, "core-plugins.json");
  if (!existsSync(path)) return "no-core-plugins";
  const text = readFileSync(path, "utf8");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return "unreadable";
  }
  if (Array.isArray(value)) {
    if (value.includes("bases")) return "already";
    value.push("bases");
  } else if (typeof value === "object" && value !== null) {
    const plugins = value as Record<string, unknown>;
    if (plugins.bases === true) return "already";
    plugins.bases = true;
  } else {
    return "unreadable";
  }
  writeFileSync(path, `${JSON.stringify(value, null, 2)}${text.endsWith("\n") ? "\n" : ""}`);
  return "enabled";
}

/** The routing notes at a vault's root, whichever exist, relative to the repo root (D173). */
export function routingNotes(toplevel: string, vault: string): string[] {
  const rel = cleanVaultPath(vault);
  return ROUTING_NOTES.filter((n) => existsSync(join(toplevel, rel, n))).map((n) => (rel === "." ? n : `${rel}/${n}`));
}

/** What the `AGENTS.md` block points agents to, with a vault configured (D173): its routing notes, and its rules. */
export function vaultGuidance(store: Store): { rules: string; notes: string[] } | undefined {
  const v = vaultOf(store);
  if (!v || "problem" in v) return undefined;
  return { rules: `${v.rel === "." ? "" : `${v.rel}/`}${RULES}/`, notes: routingNotes(store.repo.toplevel, v.rel) };
}

/**
 * `baesian init --vault` (P17 §5, §11): record the vault, in a config that may already exist; turn Bases on; and insert
 * the Decision Log's query, or say to paste it. Returns the lines to print. Writes no notes: the next commit does.
 */
export function initVault(store: Store, vault: string): { field: Field; notes: Line[]; changed: boolean } {
  const changed = store.setVault(vault);
  const recorded = `${changed ? "recorded in" : "already in"} .baesian/config.json`;
  const dir = resolve(store.repo.toplevel, vault);
  if (!existsSync(dir)) {
    return {
      changed,
      field: { label: "vault", value: `${vault}/`, why: recorded },
      notes: [note(`there's no folder ${vault}/ yet. Create the vault there (`, cmd(`livedocs new-vault ${vault}`), "), then run this again.")],
    };
  }
  const done: Piece[] = [recorded];
  const notes: Line[] = [];
  const bases = enableBases(dir);
  const where = `${vault}/.obsidian/core-plugins.json`;
  if (bases === "enabled") done.push(`; Bases turned on in ${where}`);
  else if (bases === "no-obsidian") notes.push(note(`${vault}/ has no .obsidian/, so Bases isn't turned on; open it in Obsidian, then run this again, or turn Bases on in Obsidian's settings.`));
  else if (bases === "no-core-plugins" || bases === "unreadable") notes.push(note(`couldn't ${bases === "unreadable" ? "read" : "find"} ${where}; turn Bases on in Obsidian's settings (Core plugins).`));
  const log = insertLogQuery(dir);
  if (log === "inserted") done.push(`; the decision query added to ${vault}/${DECISION_LOG}`);
  else if (log === "no-log") notes.push(note(`${vault}/ has no ${DECISION_LOG}. To list the decisions in a note, paste this section into it:`), blank, ...DECISION_LOG_SECTION.trimEnd().split("\n").map(literal));
  done.push("; notes for the decisions already made are written by the next commit, or now by ", cmd("baesian sync"));
  return { changed, field: { label: "vault", value: `${vault}/`, why: done }, notes };
}

// ---------------------------------------------------------------- links from decks (P17 §8)

// A wikilink's parts, and what one shows, are in src/wikilinks.ts, which the relay's state module can import.
export { parseWikilink } from "./wikilinks.js";

/** The vault's Markdown notes, relative to it, with forward slashes and no `.md`. Hidden folders and symlinks are skipped. */
export function listNotes(vaultDir: string): string[] {
  const out: string[] = [];
  const walk = (d: string, prefix: string) => {
    let names: string[];
    try {
      names = readdirSync(d).sort();
    } catch {
      return;
    }
    for (const name of names) {
      if (name.startsWith(".")) continue;
      const path = join(d, name);
      const st = lstatSync(path);
      if (st.isDirectory()) walk(path, `${prefix}${name}/`);
      else if (st.isFile() && name.endsWith(".md")) out.push(`${prefix}${name.slice(0, -3)}`);
    }
  };
  walk(vaultDir, "");
  return out;
}

/**
 * The note a wikilink names, as Obsidian resolves it: `[[Name]]` by file name anywhere in the vault, `[[Folder/Name]]`
 * by path, ignoring case; if several match, the shortest path.
 */
export function resolveWikilink(notes: string[], target: string): string | undefined {
  const t = target.replace(/\.md$/i, "").replace(/^\/+/, "").toLowerCase();
  if (!t) return undefined;
  const matches = notes.filter((n) => {
    const l = n.toLowerCase();
    return t.includes("/") ? l === t || l.endsWith(`/${t}`) : (l.split("/").at(-1) === t);
  });
  return matches.sort((a, b) => a.length - b.length || (a < b ? -1 : 1))[0];
}

/** A note's `summary:` line, if its frontmatter has one. */
function summaryOf(path: string): string | undefined {
  try {
    const s = parseDoc(readFileSync(path, "utf8")).meta.summary;
    return typeof s === "string" && s.trim() ? s.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A deck's context notes for the client (P17 §8): each link with what to show, and, with a vault, the note it
 * resolves to and its summary line, or that it's missing. Without a vault, the links are plain text.
 */
export function contextNotes(store: Store, links: string[], cache: { notes?: string[] } = {}): ApiContextNote[] {
  let v: ReturnType<typeof vaultOf>;
  try {
    v = links.length ? vaultOf(store) : undefined;
  } catch {
    v = undefined; // an unreadable config: the links show as plain text
  }
  const vault = v && !("problem" in v) && existsSync(v.dir) ? v : undefined;
  const all = vault ? (cache.notes ??= listNotes(vault.dir)) : [];
  return links.map((raw) => {
    const { target } = parseWikilink(raw);
    const shown = linkText(raw);
    if (!vault) return { link: raw, text: shown };
    const found = resolveWikilink(all, target);
    if (!found) return { link: raw, text: shown, missing: true as const };
    const summary = summaryOf(join(vault.dir, `${found}.md`));
    return { link: raw, text: shown, path: vault.rel === "." ? `${found}.md` : `${vault.rel}/${found}.md`, ...(summary ? { summary } : {}) };
  });
}
