import { CARD_TEMPLATE } from "./agents.js";
import { agentLabel, answerLine, byLine, cardAuthor, q, reviewerOf, said } from "./quote.js";
import type { Verdict, Withdrawal } from "./schema.js";
import { type Brief, type Card, type FileResult, type InboxItem, NoCard, PENDING, type PossibleDuplicate, type Status, type Store } from "./store.js";
import { type WaitOptions, type WaitOutcome, describeBrief, describeOutcome, exitCodeFor, replyHint, ruleHint, waitForVerdict } from "./wait.js";

// The agent commands' operations, shared by the CLI and the MCP server (P18), so the two never drift: each returns the
// lines the CLI prints and what its `--json` prints, and the server returns the same as a tool's text and structured
// content. Errors are the store's classes, which the CLI prints and the server names with a code. Text others wrote
// is quoted with its author (D169), through `quote.ts`.

/** What an operation gives back: the lines an agent reads, and the data `--json` prints. */
export interface Op<T> {
  lines: string[];
  data: T;
}

/** Who is acting, and how the reviewer hears of a card that makes the agent wait. */
export interface Actor {
  agent: string;
  notify: (card: Card) => void;
}

// ---------------------------------------------------------------- lines

/** A card on one line: its ID, status, level, title and author, topic and deck. */
export function cardLine(s: Store, card: Card): string {
  const m = card.meta;
  const where = [m.topic, `deck ${m.deck}`].filter(Boolean).join("; ");
  return `${m.id}  ${s.status(m.id).padEnd(10)} ${m.level.padEnd(11)} ${said("title", cardAuthor(m), m.title)}  [${where}]`;
}

/** The card itself, each of its texts quoted, under the agent that wrote them: the question, the crux, the options. */
export function cardDetails(card: Card): string[] {
  const m = card.meta;
  const undo = { cheap: "easy", moderate: "costly", "one-way": "hard" }[m.reverse];
  const out = [
    `Written by ${byLine(cardAuthor(m))}, each text quoted:`,
    `  question: ${q(m.question)}`,
    `  doing: ${q(m.doing)}`,
    `  stakes: ${undo} to undo${m.touches.length ? `; touches ${m.touches.join(", ")}` : ""}`,
    "",
    `  crux: ${q(m.crux)}${m.crux_preference ? " (a preference)" : ""}`,
  ];
  if (m.crux_fact) out.push(`  crux_fact: ${q(m.crux_fact)}`);
  out.push(`  ${q(m.crux_proposal)} → proposal (the agent's pick): ${q(m.proposal)}; then: ${q(m.proposal_then)}`);
  out.push(`  ${q(m.crux_alternative)} → alternative: ${q(m.alternative)}; then: ${q(m.alternative_then)}`);
  if (m.premise) out.push(`  premise, unverified, of the ${m.premise_option}: ${q(m.premise)} (check: ${q(m.premise_check ?? "")})`);
  if (m.acted) out.push(`  acted, already built for the ${m.acted_option}: ${q(m.acted)}`);
  if (m.rationale) out.push(`  rationale: ${q(m.rationale)}`);
  if (m.wrong_if) out.push(`  wrong_if: ${q(m.wrong_if)} (check: ${q(m.check ?? "")})`);
  if (card.body.trim()) out.push(`  body: ${q(card.body.trim())}`);
  return out;
}

/** One verdict, naming what it decided: an accept names the proposal it accepted, as `wait` does. */
export function verdictLine(s: Store, v: Verdict): string {
  const proposal = v.response === "accept" ? s.revisions(v.card).find((r) => r.meta.revision === v.revision)?.meta.proposal : undefined;
  return `${v.card} r${v.revision}  ${answerLine(v, proposal)}  (${v.at})`;
}

/** What `baesian file` prints when the decision may already be on file (exit 3), and the server's error text. */
export function duplicateLines(e: PossibleDuplicate): string[] {
  const out = ["This decision may already be on file:"];
  for (const m of e.matches) out.push(`  ${m.card.meta.id}  ${m.status}  ${said("title", cardAuthor(m.card.meta), m.card.meta.title)}  (same ${m.by})`);
  out.push("Attach to an open card (`baesian attach <id>`), follow a resolved one,");
  out.push("or file anyway with --new, setting `supersedes:` if you are arguing against a decision.");
  // A topic is one question (D112): a different question on the same subject is a narrower topic, not a duplicate.
  if (e.matches.some((m) => m.by === "topic")) {
    out.push("If yours is a different question on the same subject, give it a narrower topic of its own");
    out.push("(client/rule-drafts beside client/rules), and list what it builds on in `depends_on`.");
  }
  return out;
}

// ---------------------------------------------------------------- filing

/** `baesian file`: file a card, notify for blocking and hard cards, and say what to do next. */
export function fileOp(s: Store, draft: unknown, body: string, actor: Actor & { force?: boolean }): Op<FileResult> {
  const result = s.fileCard(draft, body, { agent: actor.agent, force: actor.force ?? false });
  actor.notify(result.card);
  const { id, level, deck } = result.card.meta;
  const lines = [`filed ${id} (${level}, deck ${deck})`];
  if (result.hardBecause) lines.push(`  level raised to hard by: ${result.hardBecause.join(", ")} (D42; an agent can raise a card's level, never lower it: D144)`);
  if (result.nearTopics.length) lines.push(`  new topic; did you mean: ${result.nearTopics.join(", ")}?`);
  for (const w of result.warnings) lines.push(`  note: ${w}`);
  if (level === "blocking") lines.push(`  run \`baesian wait ${id}\` before building on it`);
  if (level === "hard") lines.push(`  don't proceed with it until \`baesian wait ${id}\` exits 0`);
  lines.push(`  add "Baesian-Card: ${id}" to commits that build on it`);
  return { lines, data: result };
}

/** `baesian revise`: the next revision of a returned card. */
export function reviseOp(s: Store, id: string, draft: unknown, body: string, actor: Actor): Op<FileResult> {
  const result = s.reviseCard(id, draft, body, { agent: actor.agent });
  actor.notify(result.card);
  return { lines: [`filed ${id} r${result.card.meta.revision}`, ...result.warnings.map((w) => `  note: ${w}`)], data: result };
}

/** `baesian reply`: the agent's one reply to an answer against its pick (D89, D104). */
export function replyOp(s: Store, id: string, text: string, actor: Actor): Op<{ card: string; revision: number; level: string }> {
  const card = s.replyToCard(id, text, { agent: actor.agent });
  actor.notify(card);
  return {
    lines: [
      `filed ${id} r${card.meta.revision}: your reply goes to the reviewer, and the card is open again`,
      card.meta.level === "hard"
        ? `  it's hard: don't commit work that cites it until \`baesian wait ${id}\` exits 0`
        : "  until they answer again, proceed with their decision; `baesian inbox` brings the new answer",
    ],
    data: { card: id, revision: card.meta.revision, level: card.meta.level },
  };
}

/** `baesian rule`: draft the rule the reviewer asked for, as a card (D110). */
export function ruleOp(s: Store, id: string, text: string, covers: string[], actor: Actor): Op<{ card: string; from: string }> {
  const card = s.draftRule(id, text, covers, { agent: actor.agent });
  actor.notify(card);
  return { lines: [`filed ${card.meta.id}: the rule goes to the reviewer as a card, and is saved once they accept it`], data: { card: card.meta.id, from: id } };
}

/** `baesian attach`: wait on an existing card instead of filing a duplicate. */
export function attachOp(s: Store, id: string, agent: string): Op<{ card: string; waiting: number }> {
  s.attach(id, agent);
  const waiting = s.waiting(id);
  return { lines: [`attached to ${id}; ${waiting} agents are waiting on it`], data: { card: id, waiting } };
}

/** `baesian withdraw`: withdraw a card this agent filed or attached to. */
export function withdrawOp(s: Store, id: string, reason: string, agent: string): Op<Withdrawal> {
  return { lines: [`withdrew ${id}`], data: s.withdraw(id, reason, agent) };
}

// ---------------------------------------------------------------- waiting and the inbox

/** What to do after a wait, by its exit code (P18): the MCP tool's `next`. */
export const NEXT = { 0: "use", 4: "read", 5: "proceed", 6: "park", 7: "again" } as const;
export type Next = (typeof NEXT)[keyof typeof NEXT];

export type WaitResult = WaitOutcome & { next: Next; exit: number };

/**
 * `baesian wait`: one run of at most `SLICE_MS` (D101, D168). An answer it gives is marked delivered, so `inbox` and
 * the hooks don't hand it over again.
 */
export async function waitOp(s: Store, id: string, opts: WaitOptions): Promise<Op<WaitResult>> {
  const outcome = await waitForVerdict(s, id, opts);
  if (outcome.kind === "resolved" || outcome.kind === "answered") s.markDelivered(id, outcome);
  const exit = exitCodeFor(outcome);
  return { lines: describeOutcome(outcome), data: { ...outcome, next: NEXT[exit as keyof typeof NEXT], exit } };
}

/** An inbox item, marked with whether its answer can still take a reply or a rule draft. */
export type InboxEntry = InboxItem & { canReply: boolean; ruleAsked: boolean };

/** `baesian inbox`: new verdicts on this branch's cards, less those `wait` delivered, inside one view. */
export function inboxOp(s: Store, opts: { advance: boolean; session?: string }): Op<InboxEntry[]> {
  return s.view(() => {
    const entries = s.inbox(opts).map((item): InboxEntry => {
      // Only the answer that's standing now: an earlier one, or one already replied to, takes no reply.
      const latest = s.card(item.card);
      const standing = item.verdict.card === item.card && latest !== undefined && item.verdict.revision === latest.meta.revision;
      return { ...item, canReply: standing && s.canReply(item.card), ruleAsked: standing && Boolean(item.verdict.make_rule) && s.ruleAsked(item.card) };
    });
    const lines: string[] = [];
    for (const e of entries) {
      // A dependent returned by its parent's verdict (D80) is listed under its own ID.
      lines.push(e.verdict.card === e.card ? verdictLine(s, e.verdict) : `${e.card}  returned, by a verdict on ${e.verdict.card}`);
      if (e.brief) lines.push(...describeBrief(e.brief));
      if (e.ruleAsked) lines.push(...ruleHint(e.card).map((l) => `  ${l}`));
      if (e.canReply) lines.push(...replyHint(e.card).map((l) => `  ${l}`));
    }
    return { lines: entries.length ? lines : ["no new verdicts"], data: entries };
  });
}

// ---------------------------------------------------------------- reading

export interface ShowData extends Card {
  status: Status;
  decision?: string;
  verdicts: Verdict[];
  /** Agents waiting on it, and whether each has gone quiet (D90). */
  waiting: { agent: string; since: string; at: string; stale: boolean }[];
  briefs: Brief[];
}

/** `baesian show`: the card as the client shows it, with who's waiting, its briefs and its verdicts. */
export function showOp(s: Store, id: string): Op<ShowData> {
  s.requireInit();
  return s.view(() => {
    const card = s.card(id);
    if (!card) throw new NoCard(id);
    const status = s.status(id);
    const decision = s.decision(id);
    const verdicts = s.verdicts(id);
    const waiting = s.waitingOn(id).map(({ marker, stale }) => ({ agent: marker.agent, since: marker.since, at: marker.at, stale }));
    const briefs = s.briefs(id);
    const lines = [cardLine(s, card)];
    if (decision !== undefined) {
      const by = verdicts.filter((v) => v.revision === card.meta.revision).at(-1);
      lines.push(by ? said("decided", reviewerOf(by), decision) : `decided: ${q(decision)}`);
    }
    lines.push("", ...cardDetails(card));
    for (const w of waiting) lines.push(`  ${agentLabel(w.agent)} ${w.stale ? `stopped waiting (last seen ${w.at})` : `is waiting, since ${w.since}`}`);
    for (const b of briefs) lines.push(...describeBrief(b));
    if (verdicts.length) lines.push("", "verdicts:", ...verdicts.map((v) => `  ${verdictLine(s, v)}`));
    return { lines, data: { ...card, status, ...(decision !== undefined ? { decision } : {}), verdicts, waiting, briefs } };
  });
}

/** `baesian list`: the cards still with the reviewer, or all of them; this branch's, or every branch's. */
export function listOp(s: Store, opts: { all?: boolean; branch?: boolean }): Op<(Card["meta"] & { status: Status })[]> {
  s.requireInit();
  // A card's status reads the others: read the live layer once (Store.view), not once per card.
  return s.view(() => {
    const cards = (opts.branch ? s.branchCards() : s.cards()).filter((c) => opts.all || PENDING.has(s.status(c.meta.id)));
    const lines = cards.length ? cards.map((c) => cardLine(s, c)) : [opts.all ? "no cards" : "nothing waiting on the reviewer"];
    return { lines, data: cards.map((c) => ({ ...c.meta, status: s.status(c.meta.id) })) };
  });
}

/** `baesian topics`: the canonical topics in use. Topics are slugs (`Topic`), so they print as they are. */
export function topicsOp(s: Store): Op<string[]> {
  s.requireInit();
  const topics = [...s.view(() => s.topics())].sort();
  return { lines: topics.length ? topics : ["no topics yet"], data: topics };
}

/** `baesian template`: the card draft to fill in. */
export function templateOp(): Op<{ template: string }> {
  return { lines: [CARD_TEMPLATE.trimEnd()], data: { template: CARD_TEMPLATE } };
}
