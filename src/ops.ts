import { CARD_TEMPLATE } from "./agents.js";
import { cite, citeIn } from "./cite.js";
import { agentLabel, byLine, cardAuthor, q, reviewerOf, said } from "./quote.js";
import { POSITION_NAMES, ROW_NAMES, type AnyRow, type Position } from "./routing.js";
import type { GateRecord, Verdict, Withdrawal } from "./schema.js";
import {
  type Field,
  type Line,
  type Piece,
  attention,
  blank,
  cmd,
  dim,
  errorLines,
  failure,
  fields,
  head,
  id,
  indent,
  level,
  lit,
  literal,
  next,
  ok,
  strong,
  status as statusPiece,
  table,
  text,
  warning,
} from "./style.js";
import { type Brief, type Card, type FileResult, type InboxItem, NoCard, NoDeck, NotAllowed, PENDING, type PossibleDuplicate, type Status, type Store } from "./store.js";
import {
  type WaitAllOutcome,
  type WaitOptions,
  type WaitOutcome,
  describeAll,
  describeBrief,
  describeOutcome,
  exitCodeFor,
  exitCodeForAll,
  replyHint,
  ruleHint,
  waitForAll,
  waitForVerdict,
} from "./wait.js";

// The agent commands' operations, shared by the CLI and the MCP server (P18), so the two never drift: each returns the
// lines the CLI prints and what its `--json` prints, and the server returns the same as a tool's text and structured
// content, the lines in plain text (B-eyrt5, src/style.ts). Errors are the store's classes, which the CLI prints and
// the server names with a code. Text others wrote is quoted with its author (D169), through `quote.ts`.

/** What an operation gives back: the lines an agent reads (src/style.ts), and the data `--json` prints. */
export interface Op<T> {
  lines: Line[];
  data: T;
}

/** Who is acting, and how the reviewer hears of a card that makes the agent wait. */
export interface Actor {
  agent: string;
  notify: (card: Card) => void;
}

// ---------------------------------------------------------------- lines

/** A time as people read it: to the minute, in UTC. */
export const when = (iso: string): string => (/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(iso) ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : iso);

/** The card itself: the question, the crux, the options, each text quoted with the agent that wrote it, line by line. */
export function cardDetails(card: Card): Line[] {
  const m = card.meta;
  const by = (what: string, t: string) => said(what, cardAuthor(m), t);
  const undo = { cheap: "easy", moderate: "costly", "one-way": "hard" }[m.reverse];
  const out: Line[] = [
    text(by("question", m.question)),
    text(by("doing", m.doing)),
    text(`stakes: ${undo} to undo${m.touches.length ? `; touches ${m.touches.join(", ")}` : ""}`),
    blank,
    text(`${by("crux", m.crux)}${m.crux_preference ? " (a preference)" : ""}`),
  ];
  if (m.crux_fact) out.push(text(by("crux_fact", m.crux_fact)));
  if (m.answered_in_chat) out.push(text(by(`answered_in_chat (the reviewer's answer in chat, the agent's pick; marked seen${citeIn("B-hswmx")})`, m.answered_in_chat)));
  out.push(text(`${by("proposal (the agent's pick)", m.proposal)}; if: ${q(m.crux_proposal)}; then: ${q(m.proposal_then)}`));
  out.push(text(`${by("alternative", m.alternative)}; if: ${q(m.crux_alternative)}; then: ${q(m.alternative_then)}`));
  if (m.premise) out.push(text(`${by(`premise, unverified, of the ${m.premise_option}`, m.premise)}; check: ${q(m.premise_check ?? "")}`));
  if (m.acted) out.push(text(by(`acted, already built for the ${m.acted_option}`, m.acted)));
  if (m.rationale) out.push(text(by("rationale", m.rationale)));
  if (m.wrong_if) out.push(text(`${by("wrong_if", m.wrong_if)}; check: ${q(m.check ?? "")}`));
  if (m.secret_reason) out.push(text(by(`secret_reason (filed though it looks like it holds a secret${citeIn("B-jfkv9")})`, m.secret_reason)));
  if (card.body.trim()) out.push(text(by("body", card.body.trim())));
  return indent(2, out);
}

/** An answer, coloured by what it does: resolves, sends the card back, or neither. */
function response(r: Verdict["response"]): Piece {
  if (r === "accept" || r === "alternative" || r === "correction") return ok(r);
  if (r === "reject") return failure(r);
  if (r === "question" || r === "need_context" || r === "see_it_run" || r === "defer") return attention(r);
  return r;
}

/**
 * One verdict, naming what it decided (an accept names the proposal it accepted, as `wait` does), and when; then the
 * reviewer's comment on a line of its own, as `wait` gives it, and the rules it retired.
 */
export function verdictLines(s: Store, v: Verdict): Line[] {
  const proposal = v.response === "accept" ? s.revisions(v.card).find((r) => r.meta.revision === v.revision)?.meta.proposal : undefined;
  const what = v.choice ?? proposal;
  const out = [text(id(v.card), ` r${v.revision}  `, response(v.response), ` by ${byLine(reviewerOf(v))}${what !== undefined ? `: ${q(what)}` : ""}${v.seen ? ", answered in chat first" : ""}`, "  ", dim(when(v.at)))];
  if (v.comment) out.push(indent(2, text(said("Comment", reviewerOf(v), v.comment))));
  if (v.retire_rules?.length) out.push(indent(2, text(`It retires ${v.retire_rules.join(", ")}.`)));
  return out;
}

/** Why a possible duplicate matched: the same topic, the same title, or a title like it. */
function matchedBy(m: PossibleDuplicate["matches"][number], title: string | undefined): string {
  if (m.by === "topic") return "same topic";
  const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();
  return title !== undefined && norm(title) === norm(m.card.meta.title) ? "same title" : "similar title";
}

/**
 * What `baesian file` prints when the decision may already be on file (exit 3), and the server's error text: the cards
 * it matched, and what to do in each case, with their IDs filled in. `title` is the draft's, to tell the same title from
 * a similar one.
 */
export function duplicateLines(e: PossibleDuplicate, title?: string): Line[] {
  const out: Line[] = [head("attention", attention("not filed"), ": this decision may already be on file")];
  out.push(...table(undefined, e.matches.map((m) => [id(m.card.meta.id), statusPiece(m.status), matchedBy(m, title ?? e.title), said("title", cardAuthor(m.card.meta), m.card.meta.title)])));
  const open = e.matches.find((m) => PENDING.has(m.status));
  const decided = e.matches.find((m) => m.status === "resolved");
  if (open) out.push(next(`baesian attach ${open.card.meta.id}`, "the same question: wait on that card instead of filing another"));
  if (decided) out.push(next(`baesian show ${decided.card.meta.id}`, "the same question, decided already: follow that decision"));
  // A topic is one question (D112): a different question on the same subject is a narrower topic, not a duplicate.
  const byTopic = e.matches.find((m) => m.by === "topic" && m.card.meta.topic);
  if (byTopic) {
    out.push(
      indent(
        2,
        text(`A different question on the same subject: give it a narrower topic of its own, such as ${byTopic.card.meta.topic}/<what it asks>, list what it builds on in depends_on, and file it again.`),
      ),
    );
  }
  const against = (decided ?? open ?? e.matches[0])!.card.meta.id;
  out.push(indent(2, text(`An argument against that decision: set supersedes: ${against}, and file it with `, cmd("--new"), ".")));
  return out;
}

/** The level a card is shown at, and why; or that the gate held it back, which means its agent goes ahead with its pick. */
export function levelField(g: GateRecord, filer = true): Field {
  const row = ROW_NAMES[g.row as AnyRow];
  // No quotation marks: in an agent's lines they mean a text someone else wrote (D169).
  const at = POSITION_NAMES[g.position as Position];
  if (g.outcome === "held") {
    if (g.mode === "shadow") return { label: "level", value: [level(g.level ?? "provisional"), `; in shadow, the repo's preferences would have held it back (${row}: ${at})`] };
    const go = filer ? "go ahead with your pick, as provisional, whatever level you asked for" : "its agent goes ahead with its pick, as provisional";
    return { label: "level", value: [attention("held back"), ` (${row}: ${at}): ${go}. It counts as settled at merge; the reviewer may still answer it later`] };
  }
  const why = {
    row: `(${row}: ${at})`,
    floor: `(${row}: never without me, always)`,
    "one-way": "(it's one-way, and a one-way card is never held back)",
    agent: `the level ${filer ? "you" : "its agent"} asked for`,
    baesian: "(a card Baesian files is always shown)",
    answer: "(a revision that follows an answer is always shown)",
    chat: "(a choice the reviewer answered in chat is always shown, for them to confirm)",
    error: "(the gate couldn't run, so the card is shown)",
  }[g.reason];
  return { label: "level", value: [level(g.level ?? "provisional"), g.reason === "agent" ? `, ${why}` : ` ${why}`] };
}

/** The trailer a commit that builds on a card carries, at the end of its line, so it copies whole. */
const carries = (cardId: string): Line => indent(2, text("Commits that build on it carry the trailer  ", lit(`Baesian-Card: ${cardId}`)));

/** What filing or revising printed: the headline, the level, the deck, notes, and what to do next. */
function filed(result: FileResult, title: Piece): Line[] {
  const { id: cardId, level: lvl, deck, revision } = result.card.meta;
  const held = result.gate.outcome === "held" && result.gate.mode === "enforce";
  const out: Line[] = [head("done", "filed ", id(revision > 1 ? `${cardId} r${revision}` : cardId), " ", title, held ? ", held back" : "")];
  out.push(
    ...fields([
      levelField(result.gate),
      result.card.meta.answered_in_chat !== undefined && { label: "seen", value: `answered in chat: the reviewer confirms it with one tap, and calibration leaves it out${cite("B-hswmx")}` },
      { label: "deck", value: deck },
      result.hardBecause && { label: "raised", value: [`to `, level("hard"), ` by what it touches, ${result.hardBecause.join(", ")}: an agent can raise a card's level, never lower it${cite("D42", "D144")}`] },
      result.nearTopics.length > 0 && { label: "topic", value: `new; did you mean ${result.nearTopics.join(" or ")}?` },
    ]),
  );
  for (const w of result.warnings) out.push(indent(2, warning(w)));
  if (!held && lvl === "blocking") out.push(next(`baesian wait ${cardId}`, "before building on it"));
  if (!held && lvl === "hard") out.push(next(`baesian wait ${cardId}`, "don't proceed with it until this exits 0"));
  out.push(carries(cardId));
  return out;
}

// ---------------------------------------------------------------- filing

/** `baesian file`: file a card, notify for blocking and hard cards, and say what to do next. */
export function fileOp(s: Store, draft: unknown, body: string, actor: Actor & { force?: boolean }): Op<FileResult> {
  const result = s.fileCard(draft, body, { agent: actor.agent, force: actor.force ?? false });
  actor.notify(result.card);
  return { lines: filed(result, q(result.card.meta.title)), data: result };
}

/** `baesian revise`: the next revision of a returned card. */
export function reviseOp(s: Store, cardId: string, draft: unknown, body: string, actor: Actor): Op<FileResult> {
  const result = s.reviseCard(cardId, draft, body, { agent: actor.agent });
  actor.notify(result.card);
  return { lines: filed(result, q(result.card.meta.title)), data: result };
}

/** `baesian reply`: the agent's one reply to an answer against its pick (D89, D104). */
export function replyOp(s: Store, cardId: string, reply: string, actor: Actor): Op<{ card: string; revision: number; level: string }> {
  const card = s.replyToCard(cardId, reply, { agent: actor.agent });
  actor.notify(card);
  return {
    lines: [
      head("done", "filed ", id(`${cardId} r${card.meta.revision}`), ": your reply goes to the reviewer, and the card is open again"),
      card.meta.level === "hard"
        ? next(`baesian wait ${cardId}`, "it's hard: don't commit work that cites it until this exits 0")
        : indent(2, text("Until they answer again, proceed with their decision; ", cmd("baesian inbox"), " brings the new answer.")),
    ],
    data: { card: cardId, revision: card.meta.revision, level: card.meta.level },
  };
}

/** `baesian rule`: draft the rule the reviewer asked for, as a card (D110). */
export function ruleOp(s: Store, from: string, rule: string, covers: string[], actor: Actor): Op<{ card: string; from: string }> {
  const card = s.draftRule(from, rule, covers, { agent: actor.agent });
  actor.notify(card);
  return { lines: [head("done", "filed ", id(card.meta.id), ": the rule goes to the reviewer as a card, and is saved once they accept it")], data: { card: card.meta.id, from } };
}

/** `baesian attach`: wait on an existing card instead of filing a duplicate. */
export function attachOp(s: Store, cardId: string, agent: string): Op<{ card: string; waiting: number }> {
  s.attach(cardId, agent);
  const waiting = s.waiting(cardId);
  return {
    lines: [head("done", "attached to ", id(cardId), `; ${waiting === 1 ? "1 agent is" : `${waiting} agents are`} waiting on it`), next(`baesian wait ${cardId}`, "for its answer")],
    data: { card: cardId, waiting },
  };
}

/** `baesian withdraw`: withdraw a card this agent filed or attached to. */
export function withdrawOp(s: Store, cardId: string, reason: string, agent: string): Op<Withdrawal> {
  return { lines: [head("done", "withdrew ", id(cardId))], data: s.withdraw(cardId, reason, agent) };
}

// ---------------------------------------------------------------- waiting and the inbox

/** What to do after a wait, by its exit code (P18): the MCP tool's `next`. */
export const NEXT = { 0: "use", 4: "read", 5: "proceed", 6: "park", 7: "again", 8: "go" } as const;
export type Next = (typeof NEXT)[keyof typeof NEXT];

export type WaitResult = WaitOutcome & { next: Next; exit: number };

/**
 * `baesian wait`: one run of at most `SLICE_MS` (D101, D168). An answer it gives is marked delivered, so `inbox` and
 * the hooks don't hand it over again.
 */
export async function waitOp(s: Store, cardId: string, opts: WaitOptions): Promise<Op<WaitResult>> {
  const outcome = await waitForVerdict(s, cardId, opts);
  if (outcome.kind === "resolved" || outcome.kind === "answered") s.markDelivered(cardId, outcome);
  const exit = exitCodeFor(outcome);
  return { lines: describeOutcome(outcome), data: { ...outcome, next: NEXT[exit as keyof typeof NEXT], exit } };
}

export type WaitAllResult = WaitAllOutcome & { next: Next; exit: number };

/**
 * `baesian wait` on several cards, or a deck's (B-xnae9): one run, until every card is answered, or one comes back or is
 * held back; or, without `untilAnswered`, until the run's slice or the wait's time is over. Each answer it gives is
 * marked delivered; a run that ends with "again" gives none yet, so they all come when the wait ends.
 */
export async function waitAllOp(s: Store, ids: string[], opts: WaitOptions): Promise<Op<WaitAllResult>> {
  const outcome = await waitForAll(s, ids, opts);
  if (outcome.ended !== "again") for (const c of outcome.cards) if (c.kind === "resolved" || c.kind === "answered") s.markDelivered(c.id, c);
  const exit = exitCodeForAll(outcome);
  return { lines: describeAll(outcome), data: { ...outcome, next: NEXT[exit as keyof typeof NEXT], exit } };
}

/**
 * The cards `baesian wait --deck` waits on (B-xnae9): the deck's cards still with the reviewer (open, or rerouted to
 * another reviewer) that this agent filed or attached to, on this branch (`Store.branchCards`). This agent's, not every
 * card in the deck: an agent wakes for the answers it acts on. And on this branch, since agents share names (every
 * Claude Code session is `claude-code` unless it's named), so the branch tells them apart, as `baesian inbox` does.
 */
export function deckWaitIds(s: Store, deck: string, agent: string): string[] {
  s.requireInit();
  if (!s.deck(deck)) throw new NoDeck(`no deck "${deck}"`);
  return s.view(() => {
    const attached = new Set(s.attachments().filter((a) => a.agent === agent).map((a) => a.card));
    const mine = s.branchCards().filter((c) => c.meta.deck === deck && (c.meta.source_agent === agent || attached.has(c.meta.id)));
    // In the order they were filed, which the agent knows them by; the ID only breaks a tie.
    const ids = mine
      .filter((c) => ["open", "rerouted"].includes(s.status(c.meta.id)))
      .sort((x, y) => x.meta.created.localeCompare(y.meta.created) || x.meta.id.localeCompare(y.meta.id))
      .map((c) => c.meta.id);
    if (!ids.length) {
      throw new NotAllowed(`deck "${deck}" has no cards of yours still with the reviewer (filed or attached to by ${agent}, on this branch): nothing to wait on`, [
        { command: "baesian inbox", why: "any answers you haven't seen" },
      ]);
    }
    return ids;
  });
}

/** An inbox item, marked with whether its answer can still take a reply or a rule draft. */
export type InboxEntry = InboxItem & { canReply: boolean; ruleAsked: boolean };

/** The headline over new verdicts: how many, on this branch's cards. */
export const verdictsHeadline = (n: number): string => `${n === 1 ? "1 new verdict" : `${n} new verdicts`} on this branch's cards`;

/** `baesian inbox`: new verdicts on this branch's cards, less those `wait` delivered, inside one view. */
export function inboxOp(s: Store, opts: { advance: boolean; session?: string }): Op<InboxEntry[]> {
  return s.view(() => {
    const entries = s.inbox(opts).map((item): InboxEntry => {
      // Only the answer that's standing now: an earlier one, or one already replied to, takes no reply.
      const latest = s.card(item.card);
      const standing = item.verdict.card === item.card && latest !== undefined && item.verdict.revision === latest.meta.revision;
      // A yes to a convention card asks for a rule as the toggle does (D161).
      const asks = Boolean(item.verdict.make_rule) || (latest?.meta.convention !== undefined && item.verdict.response === "accept");
      return { ...item, canReply: standing && s.canReply(item.card), ruleAsked: standing && asks && s.ruleAsked(item.card) };
    });
    if (!entries.length) return { lines: [head("done", "no new verdicts")], data: entries };
    const lines: Line[] = [head("attention", verdictsHeadline(entries.length))];
    for (const e of entries) {
      // A dependent returned by its parent's verdict (D80) is listed under its own ID.
      lines.push(...(e.verdict.card === e.card ? verdictLines(s, e.verdict) : [text(id(e.card), "  ", attention("returned"), `, by a verdict on ${e.verdict.card}`)]));
      if (e.brief) lines.push(...describeBrief(e.brief));
      if (e.ruleAsked) lines.push(...indent(2, ruleHint(e.card)));
      if (e.canReply) lines.push(...indent(2, replyHint(e.card)));
    }
    return { lines, data: entries };
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
  /** The gate's record for the latest revision, if it was filed through the gate (M8). */
  gate?: GateRecord;
}

/** `baesian show`: the card as the client shows it, with who's waiting, its briefs and its verdicts. */
export function showOp(s: Store, cardId: string): Op<ShowData> {
  s.requireInit();
  return s.view(() => {
    const card = s.card(cardId);
    if (!card) throw new NoCard(cardId);
    const m = card.meta;
    const status = s.status(cardId);
    const decision = s.decision(cardId);
    const verdicts = s.verdicts(cardId);
    // Only a card still with the reviewer has agents waiting on it: a marker a wait left when its run ended (exit 7) says
    // nothing once the card is answered.
    const waiting = PENDING.has(status) || status === "held" ? s.waitingOn(cardId).map(({ marker, stale }) => ({ agent: marker.agent, since: marker.since, at: marker.at, stale })) : [];
    const briefs = s.briefs(cardId);
    const gate = s.gateRecord(cardId);
    const by = verdicts.filter((v) => v.revision === m.revision).at(-1);
    const lines: Line[] = [head(undefined, id(cardId), "  ", statusPiece(status), "  ", said("title", cardAuthor(m), m.title))];
    lines.push(
      ...fields([
        m.topic !== undefined && { label: "topic", value: m.topic },
        { label: "deck", value: m.deck },
        gate ? levelField(gate, false) : { label: "level", value: level(m.level) },
        decision !== undefined && { label: "decided", value: by ? `by ${byLine(reviewerOf(by))}: ${q(decision)}` : q(decision) },
        ...waiting.map((w) => ({ label: "waiting", value: `${agentLabel(w.agent)}, ${w.stale ? `stopped (last seen ${when(w.at)})` : `since ${when(w.since)}`}` })),
      ]),
    );
    lines.push(blank, ...cardDetails(card));
    for (const b of briefs) lines.push(...describeBrief(b));
    if (verdicts.length) lines.push(blank, text("verdicts:"), ...indent(2, verdicts.flatMap((v) => verdictLines(s, v))));
    return { lines, data: { ...card, status, ...(decision !== undefined ? { decision } : {}), verdicts, waiting, briefs, ...(gate ? { gate } : {}) } };
  });
}

/** Counts by status, in a fixed order: "3 resolved, 1 returned to its agent, 1 withdrawn". */
function counts(statuses: Status[]): string {
  const order: Status[] = ["open", "rerouted", "held", "returned", "deferred", "resolved", "withdrawn", "superseded"];
  const say: Partial<Record<Status, string>> = { returned: "returned to its agent", rerouted: "rerouted to another reviewer" };
  return order
    .map((st) => [st, statuses.filter((x) => x === st).length] as const)
    .filter(([, n]) => n > 0)
    .map(([st, n]) => `${n} ${say[st] && n === 1 ? say[st] : st === "returned" && n > 1 ? "returned to their agents" : st}`)
    .join(", ");
}

/**
 * `baesian list`: the cards still with the reviewer, or all of them; this branch's, or every branch's. A headline with
 * the counts, then a row a card, in the order they were filed. What every row shares, the author and the deck, is said
 * once under the headline (B-gff98); the titles stay quoted, and their author named (D169).
 */
export function listOp(s: Store, opts: { all?: boolean; branch?: boolean }): Op<(Card["meta"] & { status: Status })[]> {
  s.requireInit();
  // A card's status reads the others: read the live layer once (Store.view), not once per card.
  return s.view(() => {
    const cards = (opts.branch ? s.branchCards() : s.cards())
      .filter((c) => opts.all || PENDING.has(s.status(c.meta.id)))
      .sort((x, y) => x.meta.created.localeCompare(y.meta.created) || x.meta.id.localeCompare(y.meta.id));
    const data = cards.map((c) => ({ ...c.meta, status: s.status(c.meta.id) }));
    if (!cards.length) return { lines: [head("done", opts.all ? "no cards" : "nothing waiting on the reviewer")], data };
    const author = (c: Card) => byLine(cardAuthor(c.meta));
    const oneAuthor = new Set(cards.map(author)).size === 1;
    const oneDeck = new Set(cards.map((c) => c.meta.deck)).size === 1;
    const n = cards.length;
    const what = opts.all ? `${n} card${n === 1 ? "" : "s"}` : `${n} card${n === 1 ? "" : "s"} still with the reviewer`;
    const lines: Line[] = [head(undefined, strong(what), ": ", counts(data.map((d) => d.status)))];
    const shared = [oneAuthor ? `all filed by ${author(cards[0]!)}` : "", oneDeck ? `${oneAuthor ? "in" : "all in"} deck ${cards[0]!.meta.deck}` : ""].filter(Boolean).join(", ");
    if (shared) lines.push(indent(2, text(dim(shared))));
    const header = ["id", "status", "level", "topic", ...(oneDeck ? [] : ["deck"]), ...(oneAuthor ? ["title"] : ["title, by its author"])];
    const rows = cards.map((c, i): Piece[] => [
      id(c.meta.id),
      statusPiece(data[i]!.status),
      level(c.meta.level),
      c.meta.topic ?? "",
      ...(oneDeck ? [] : [c.meta.deck]),
      oneAuthor ? q(c.meta.title) : `by ${author(c)}: ${q(c.meta.title)}`,
    ]);
    lines.push(...table(header, rows));
    return { lines, data };
  });
}

/** `baesian topics`: the canonical topics in use. Topics are slugs (`Topic`), so they print as they are. */
export function topicsOp(s: Store): Op<string[]> {
  s.requireInit();
  const topics = [...s.view(() => s.topics())].sort();
  if (!topics.length) return { lines: [head(undefined, "no topics yet")], data: topics };
  return {
    lines: [head(undefined, `${topics.length} topic${topics.length === 1 ? "" : "s"} in use: reuse one only for the same question`), ...indent(2, topics.map((t) => text(t)))],
    data: topics,
  };
}

/** `baesian template`: the card draft to fill in, as it is, to save to a file. */
export function templateOp(): Op<{ template: string }> {
  return { lines: CARD_TEMPLATE.trimEnd().split("\n").map(literal), data: { template: CARD_TEMPLATE } };
}

/**
 * An error as the CLI and the MCP server both say it, word for word: its headline and next steps (`errorLines`), and for
 * a card that isn't there, where to see the ones that are.
 */
export function failureLines(e: unknown): Line[] {
  return [...errorLines(e), ...(e instanceof NoCard ? [next("baesian list --all", "the cards in this repo")] : [])];
}
