import { byLine, q, reviewerOf, said } from "./quote.js";
import type { Level, Verdict } from "./schema.js";
import { type Line, type Piece, attention, cmd, failed, head, id, indent, lit, next, ok, text } from "./style.js";
import { type Brief, type BriefCommit, NoCard, type Status, type Store, WAITING_BEAT_MS } from "./store.js";

/** The client beats every 30 s; three missed beats means the reviewer has stepped away (D41). */
export const PRESENCE_STALE_MS = 90_000;
/** How long a wait lasts in all, across its runs, before the agent falls back (D42, D46). */
export const DEFAULT_TIMEOUT_MS = 9 * 60_000;
/**
 * How long one run of `baesian wait` lasts (D101): under every harness's command limit we know of, including
 * Claude Code's default of 2 minutes. While the reviewer is there, a run that ends exits 7, and the agent runs it
 * again.
 */
export const SLICE_MS = 100_000;
export const POLL_MS = 1_000;

/** `baesian wait` exit codes. The agent-facing instructions in AGENTS.md list them too. */
export const WAIT_EXIT = {
  /** Resolved: use the decision. */
  resolved: 0,
  /** Answered, but not a go-ahead: returned, deferred, withdrawn or superseded. Read the verdict. */
  answered: 4,
  /** No verdict yet; proceed provisionally on the proposal. */
  proceed: 5,
  /** No verdict yet on a hard card: don't proceed. */
  park: 6,
  /** No verdict yet, and the reviewer is still there: run `baesian wait` again (D101). */
  again: 7,
  /**
   * Held back by the repo's preferences (D150, B-chq61): go ahead with your pick, as provisional. It counts as settled at
   * merge, and the reviewer may still answer it later.
   */
  held: 8,
} as const;

export type WaitOutcome =
  /** `canReply`: the answer went against the agent's pick, and it hasn't replied yet (D89, D104). */
  /** `ruleAsked`: the answer asks for a rule, and none is drafted yet (D16, D109). */
  | { kind: "resolved"; id: string; decision: string; verdict: Verdict | undefined; briefs: Brief[]; canReply: boolean; ruleAsked: boolean }
  | { kind: "answered"; id: string; status: Exclude<Status, "open" | "held" | "rerouted" | "resolved">; level: Level; verdict: Verdict | undefined; briefs: Brief[]; ruleAsked: boolean }
  /** The gate held it back (D150): the agent goes ahead with its pick, whatever level it asked for (B-chq61). */
  | { kind: "held"; id: string }
  | { kind: "no-verdict"; id: string; reason: "timeout" | "away"; level: Level; proceed: boolean; recorded: boolean }
  /** This run is over, but the wait isn't: the agent runs `baesian wait` again (D101). */
  | { kind: "again"; id: string; waitedMs: number; leftMs: number };

export interface WaitOptions {
  agent: string;
  /** The whole wait, across runs, counted from the card's first wait (D101). */
  timeoutMs?: number;
  /** One run. */
  sliceMs?: number;
  pollMs?: number;
  /** Return at once when the client's heartbeat is stale. Default true. */
  usePresence?: boolean;
  /**
   * Wait with no slice, no time limit and no presence check, until the cards are answered or one comes back (B-xnae9):
   * for a run in the background that wakes its agent when it ends. Its waiting markers show for `timeoutMs` only.
   */
  untilAnswered?: boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /**
   * Stops the wait: the harness cancelled the MCP call, its input closed, or the person pressed Ctrl-C. The marker is
   * removed, since the agent has stopped waiting, and the wait throws `WaitCancelled`.
   */
  signal?: AbortSignal;
  /** Called at each beat of the marker (every `WAITING_BEAT_MS`): the MCP server reports progress then. */
  onBeat?: (beat: { waitedMs: number; leftMs: number }) => void;
  /**
   * Called whenever the waiting marker is written, refreshed or removed, with its path in the live layer: in a linked
   * repo it goes to the relay too, as a heartbeat (M9d, `waitWithRelay()`).
   */
  onMarker?: (marker: { path: string; removed: boolean }) => void;
}

/** The wait was stopped through its signal before it had an outcome. */
export class WaitCancelled extends Error {
  constructor(readonly id: string) {
    super(`stopped waiting on ${id}`);
  }
}

/** A sleep that ends early when the signal aborts. */
function realSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((done) => {
    if (signal?.aborted) return done();
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      done();
    };
    const timer = setTimeout(finish, ms);
    signal?.addEventListener("abort", finish, { once: true });
  });
}

/**
 * Block until the reviewer answers `id`, the timeout passes, or the client reports the reviewer away.
 * Rerouted cards keep waiting: another reviewer is still to answer. With no verdict, what the agent may
 * do depends on the level (D42): provisional and blocking proceed (a blocking card records a fallback,
 * D46); hard never does. It's `waitForAll()` on one card.
 */
export async function waitForVerdict(store: Store, id: string, opts: WaitOptions): Promise<WaitOutcome> {
  const all = await waitForAll(store, [id], opts);
  if (all.ended === "again") return { kind: "again", id, waitedMs: all.waitedMs, leftMs: all.leftMs ?? 0 };
  const card = all.cards[0]!;
  // One card ends a wait only by being answered, held, or given up on: it's never still open at the end.
  if (card.kind === "open") throw new Error(`the wait on ${id} ended with the card still open`);
  return card;
}

/** A card still with the reviewer when a wait on several ended: its run's slice was over, or another card came back. */
export interface StillOpen {
  kind: "open";
  id: string;
  level: Level;
}

/** One card's part in a wait on several: its outcome, or still open. */
export type CardOutcome = Exclude<WaitOutcome, { kind: "again" }> | StillOpen;

/**
 * A wait on several cards (B-xnae9): each card's outcome, in the order asked, and why the wait ended:
 * - `answered`: every card has an answer, or is no longer the agent's to wait on (resolved, deferred, withdrawn, superseded);
 * - `returned`: a card came back to the agent, before the rest were answered: it's to revise or withdraw;
 * - `held`: a card is held back by the repo's preferences, so its agent goes ahead with its pick (B-chq61);
 * - `again`: this run's slice is over, and the reviewer is still there (D101): run it again;
 * - `no-verdict`: the wait's time ran out, or the reviewer is away: the cards still open each say what the agent may do.
 */
export interface WaitAllOutcome {
  kind: "several";
  ids: string[];
  ended: "answered" | "returned" | "held" | "again" | "no-verdict";
  cards: CardOutcome[];
  /** How long the wait has gone on, from the earliest marker's start. */
  waitedMs: number;
  /** For `again`: how long the wait goes on. */
  leftMs?: number;
  /** With no time limit: it ends only when the cards are answered, or one comes back (`WaitOptions.untilAnswered`). */
  untilAnswered: boolean;
}

/** A card's outcome now, inside a view: resolved, answered otherwise or held, or nothing while it's still open. */
function outcomeOf(store: Store, id: string): CardOutcome | undefined {
  const status = store.status(id);
  if (status === "held") return { kind: "held", id };
  if (status === "open" || status === "rerouted") return undefined;
  const latest = store.card(id)!;
  const verdict = store
    .verdicts(id)
    .filter((v) => v.revision === latest.meta.revision)
    .at(-1);
  if (status === "resolved") {
    return { kind: "resolved", id, decision: store.decision(id)!, verdict, briefs: store.briefs(id), canReply: store.canReply(id), ruleAsked: store.ruleAsked(id) };
  }
  return { kind: "answered", id, status, level: latest.meta.level, verdict, briefs: store.briefs(id), ruleAsked: store.ruleAsked(id) };
}

/** A card that comes back to its agent ends a wait on several at once: returned, so it's to revise or withdraw. */
const cameBack = (o: CardOutcome) => o.kind === "answered" && o.status === "returned";

/**
 * Block until every card in `ids` is answered, or sooner, when one comes back to the agent (returned) or is held back
 * (B-xnae9); or, as a wait on one card does, until this run's slice is over, the wait's time runs out, or the reviewer
 * is away. Each card still open keeps a waiting marker (D90), removed as soon as it's answered. Rerouted cards keep
 * waiting.
 *
 * With `untilAnswered` it has no slice, no time limit and no presence check, so it ends only when the cards are answered
 * or one comes back: for a run in the background that wakes its agent when it ends (Claude Code). Its markers show for
 * the wait's budget (`timeoutMs`, from the first wait), as a wait the agent ran itself would, and are then removed while
 * it goes on listening: an agent that ended its turn hours ago isn't one that has just stopped for the reviewer.
 */
export async function waitForAll(store: Store, ids: string[], opts: WaitOptions): Promise<WaitAllOutcome> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => realSleep(ms, opts.signal));
  const pollMs = opts.pollMs ?? POLL_MS;
  const until = opts.untilAnswered === true;
  const wanted = [...new Set(ids)];
  if (!wanted.length) throw new Error("no cards to wait on");
  for (const id of wanted) if (!store.card(id)) throw new NoCard(id);
  if (opts.signal?.aborted) throw new WaitCancelled(wanted.join(" "));

  const settled = new Map<string, CardOutcome>();
  const look = () =>
    store.view(() => {
      for (const id of wanted) {
        if (settled.has(id)) continue;
        const o = outcomeOf(store, id);
        if (o) settled.set(id, o);
      }
    });
  const ending = (): WaitAllOutcome["ended"] | undefined => {
    const all = [...settled.values()];
    if (all.some(cameBack)) return "returned";
    if (all.some((o) => o.kind === "held")) return "held";
    return settled.size === wanted.length ? "answered" : undefined;
  };
  const started = now();
  const result = (ended: WaitAllOutcome["ended"], extra: { waitedMs?: number; leftMs?: number } = {}): WaitAllOutcome => ({
    kind: "several",
    ids: wanted,
    ended,
    cards: wanted.map((id) => settled.get(id) ?? { kind: "open", id, level: store.card(id)!.meta.level }),
    waitedMs: extra.waitedMs ?? now() - started,
    ...(extra.leftMs !== undefined ? { leftMs: extra.leftMs } : {}),
    untilAnswered: until,
  });

  // A card already answered, or held, needs no marker: nobody waits on it. A held card answers the agent at once: go
  // ahead, as settled at merge (B-chq61). A marker this agent left on it, from a run that ended with "again", goes.
  look();
  for (const id of settled.keys()) {
    if (!store.waitingOn(id, now()).some((w) => w.marker.agent === opts.agent && !w.stale)) continue;
    const left = store.startWaiting(id, opts.agent, new Date(now()).toISOString());
    left.stop();
    opts.onMarker?.({ path: left.path, removed: true });
  }
  const first = ending();
  if (first) return result(first, { waitedMs: 0 });

  // The waiting markers (D90): while one is fresh, "stopped for you" is true of its card. A run that ends with "again"
  // keeps them, and the next run picks them up, so the wait's budget counts from when it first started (D101). Each is
  // removed when its card is answered, or the wait is over; an agent killed mid-wait leaves them behind, to go stale.
  const markers = new Map<string, { since: string; refresh(at: string): void; stop(): void }>();
  for (const id of wanted.filter((i) => !settled.has(i))) {
    const m = store.startWaiting(id, opts.agent, new Date(now()).toISOString());
    const told = (removed: boolean) => opts.onMarker?.({ path: m.path, removed });
    markers.set(id, {
      since: m.since,
      refresh(at: string) {
        m.refresh(at);
        told(false);
      },
      stop() {
        m.stop();
        told(true);
      },
    });
    told(false);
  }
  const since = Math.min(...[...markers.values()].map((m) => Date.parse(m.since)));
  const budgetEnd = since + (opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const sliceEnd = until ? Number.POSITIVE_INFINITY : now() + (opts.sliceMs ?? SLICE_MS);
  const stopMarker = (id: string) => {
    markers.get(id)?.stop();
    markers.delete(id);
  };
  let beat = now();
  let keep = false;
  try {
    let reason: "timeout" | "away";
    for (;;) {
      // Each poll is one fresh view of the live layer: a card's status reads the others, once each.
      look();
      for (const id of [...markers.keys()]) if (settled.has(id)) stopMarker(id);
      const ended = ending();
      if (ended) return result(ended, { waitedMs: now() - since });
      if (until) {
        // Past the budget, it listens on without markers: the reviewer no longer sees an agent stopped for these cards.
        if (markers.size && now() >= budgetEnd) for (const id of [...markers.keys()]) stopMarker(id);
      } else {
        if (opts.usePresence !== false) {
          const p = store.presence();
          // No heartbeat at all means the client has never run: unknown, so keep waiting. A stale one means away.
          if (p && now() - Date.parse(p.at) > PRESENCE_STALE_MS) {
            reason = "away";
            break;
          }
        }
        if (now() >= budgetEnd) {
          reason = "timeout";
          break;
        }
        if (now() >= sliceEnd) {
          keep = true;
          for (const m of markers.values()) m.refresh(new Date(now()).toISOString());
          return result("again", { waitedMs: now() - since, leftMs: budgetEnd - now() });
        }
      }
      const next = until ? (markers.size ? budgetEnd - now() : pollMs) : Math.min(sliceEnd - now(), budgetEnd - now());
      await sleep(Math.max(0, Math.min(pollMs, next)));
      // Cancelled: the finally below removes the markers, since the agent has stopped waiting.
      if (opts.signal?.aborted) throw new WaitCancelled(wanted.join(" "));
      if (markers.size && now() - beat >= WAITING_BEAT_MS) {
        beat = now();
        for (const m of markers.values()) m.refresh(new Date(beat).toISOString());
        opts.onBeat?.({ waitedMs: beat - since, leftMs: budgetEnd - beat });
      }
    }

    // The level in force: in a hosted repo, the relay's signed gate record may have raised it (P16 section 3).
    for (const id of wanted.filter((i) => !settled.has(i))) {
      const level = store.view(() => store.levelOf(id)) ?? store.card(id)!.meta.level;
      const proceed = level !== "hard";
      let recorded = false;
      if (level === "blocking") {
        store.recordFallback(id, reason, opts.agent);
        recorded = true;
      }
      settled.set(id, { kind: "no-verdict", id, reason, level, proceed, recorded });
    }
    return result("no-verdict", { waitedMs: now() - since });
  } finally {
    if (!keep) for (const id of [...markers.keys()]) stopMarker(id);
  }
}

export function exitCodeFor(outcome: WaitOutcome): number {
  if (outcome.kind === "resolved") return WAIT_EXIT.resolved;
  if (outcome.kind === "again") return WAIT_EXIT.again;
  if (outcome.kind === "held") return WAIT_EXIT.held;
  if (outcome.kind === "answered") return WAIT_EXIT.answered;
  return outcome.proceed ? WAIT_EXIT.proceed : WAIT_EXIT.park;
}

/**
 * A wait on several cards' exit code (B-xnae9): 0 when every card is resolved; 4 as soon as one comes back (returned),
 * or when every card is answered and one isn't a go-ahead; 8 as soon as one is held back; 7 when the run's slice is over;
 * and when the time runs out, or the reviewer is away, 6 if a card still open is hard, 4 if an answered one isn't a
 * go-ahead, and otherwise 5.
 */
export function exitCodeForAll(o: WaitAllOutcome): number {
  const notGoAhead = o.cards.some((c) => c.kind === "answered");
  switch (o.ended) {
    case "returned":
      return WAIT_EXIT.answered;
    case "held":
      return WAIT_EXIT.held;
    case "again":
      return WAIT_EXIT.again;
    case "answered":
      return notGoAhead ? WAIT_EXIT.answered : WAIT_EXIT.resolved;
    case "no-verdict":
      if (o.cards.some((c) => c.kind === "no-verdict" && !c.proceed)) return WAIT_EXIT.park;
      return notGoAhead ? WAIT_EXIT.answered : WAIT_EXIT.proceed;
  }
}

/**
 * A brief in the words an agent reads: what changed, and what to do about it (D80, D81). The texts others wrote are
 * quoted with their authors (D169).
 */
export function describeBrief(b: Brief): Line[] {
  if (b.kind === "parent-decided-otherwise") {
    const parent = { agent: b.parentAgent, branch: b.parentBranch };
    return indent(2, [
      text(id(b.parent), `, which ${b.card} builds on, was decided the other way. ${said("Its title", parent, b.parentTitle)}`),
      text(`${said("Decided", reviewerOf(b), b.decided)}; ${said("not the proposal", parent, b.assumed)}`),
      next(`baesian revise ${b.card} card.md`, "re-propose it on that basis, or withdraw it"),
    ]);
  }
  const name = (c: BriefCommit) => `${c.commit?.slice(0, 7) ?? "uncommitted"} (${c.branch})`;
  const live = b.commits.filter((c) => !c.rewritten);
  const gone = b.commits.filter((c) => c.rewritten);
  const commits = live.length
    ? `Commits that cite ${b.card}, built on the old answer: ${live.map(name).join(", ")}. Rework them to match. Only commits that cite the card are listed: check for other work built on it.`
    : gone.length
      ? `No commit on a branch cites ${b.card} now; check for work built on the old answer all the same.`
      : `No commit cites ${b.card} yet; check for work built on the old answer all the same.`;
  // B-9v5xj: the ledger's commits that a rebase or a squash took off every branch.
  const rewritten = gone.length
    ? [text(`Rewritten since, and on no branch now: ${gone.map(name).join(", ")}. Their work may be in ${live.length ? "the commits above, or in ones" : "commits"} that don't cite ${b.card}.`)]
    : [];
  const now = b.now !== undefined ? said(b.kind === "held-answered" ? "decided" : "one", reviewerOf(b), b.now) : `not a go-ahead (${b.response} by ${byLine(reviewerOf(b))})`;
  if (b.kind === "held-answered") {
    // D150, D151: the gate held it back, so the agent went ahead with its pick; the reviewer answered it later.
    const pick = said("the pick", { agent: b.agent, branch: b.branch }, b.assumed);
    return indent(2, [text(id(b.card), ` was held back, so its agent went ahead with ${pick}. The reviewer has answered it since: ${now}.`), text(commits), ...rewritten]);
  }
  const was = said("an answer", { person: b.wasReviewer }, b.was);
  return indent(2, [text("The answer on ", id(b.card), ` changed. It was ${was}; now it's ${now}.`), text(commits), ...rewritten]);
}

/** What an agent is told when the reviewer asked for a rule from a decision (D16, D109, D110). */
export const ruleHint = (cardId: string): Line[] => [
  text(
    "They asked for a rule from this decision: draft it in a line, with the gate patterns it covers, if any (such as dep:pytest-* or schema:migrations/*). It goes to them as a card:",
  ),
  next(`baesian rule ${cardId} "<the rule>" --covers <pattern>`),
];

/** What an agent is told when an answer went against its pick and it may still reply (D89, D104). */
export const replyHint = (cardId: string): Line[] => [
  text(
    "It went against your pick: proceed with their decision. If you hold a fact they lacked, or a check that would settle it, you may reply once (not with your pick again):",
  ),
  next(`baesian reply ${cardId} "<the fact or check>"`),
];

/** How a returned card came back: "rejected by …", "with a question by …". */
function returnedHow(v: Verdict | undefined): string {
  if (!v) return "";
  const by = byLine(reviewerOf(v));
  const how: Partial<Record<Verdict["response"], string>> = {
    reject: "rejected",
    question: "with a question",
    need_context: "asking for more context,",
    see_it_run: "asking to see it run,",
  };
  return `, ${how[v.response] ?? v.response} by ${by}`;
}

/** The trailer a commit that builds on a card carries, at the end of a sentence, so it copies whole. */
const carries = (cardId: string): Piece[] => ["Commits that build on it carry the trailer  ", lit(`Baesian-Card: ${cardId}`)];

/** What the agent should read: what happened, and what to do next. What the reviewer wrote is quoted (D169). */
export function describeOutcome(o: WaitOutcome): Line[] {
  const comment = (v: Verdict | undefined): Line[] => (v?.comment ? [indent(2, text(said("Comment", reviewerOf(v), v.comment)))] : []);
  const by = (v: Verdict | undefined) => (v ? ` by ${byLine(reviewerOf(v))}` : "");
  if (o.kind === "held") {
    return [
      head("done", id(o.id), " is held back: this repo's preferences let the agent decide this kind of decision, whatever level the card asked for."),
      text("Go ahead with your pick, as provisional: it counts as settled at merge. ", ...carries(o.id)),
      text("The reviewer may still answer it later; ", cmd("baesian inbox"), " brings that answer if they do."),
    ];
  }
  if (o.kind === "again") {
    const min = Math.max(1, Math.round(o.leftMs / 60_000));
    return [head("next", "no verdict on ", id(o.id), " yet, and the reviewer is still there"), next(`baesian wait ${o.id}`, `again: the wait goes on for about ${min} more minute${min === 1 ? "" : "s"}`)];
  }
  const briefs = o.kind === "no-verdict" ? [] : o.briefs.flatMap(describeBrief);
  switch (o.kind) {
    case "resolved":
      // Word for word what it has always said: agents and their tests read it.
      return [
        head("done", id(o.id), " ", ok("resolved"), `${by(o.verdict)}: ${q(o.decision)}`),
        ...comment(o.verdict),
        ...(o.verdict?.retire_rules?.length
          ? [indent(2, text(`The reviewer retired the rule${o.verdict.retire_rules.length === 1 ? "" : "s"} it breaks, ${o.verdict.retire_rules.join(", ")}: don't cite ${o.verdict.retire_rules.length === 1 ? "it" : "them"} again.`))]
          : []),
        ...briefs,
        text("Proceed with that decision."),
        ...(o.ruleAsked ? ruleHint(o.id) : []),
        ...(o.canReply ? replyHint(o.id) : []),
      ];
    case "answered":
      if (o.status === "returned" && o.briefs.some((b) => b.kind === "parent-decided-otherwise")) {
        return [head("attention", id(o.id), " ", attention("returned"), ": what it builds on was decided the other way"), ...briefs];
      }
      if (o.status === "returned") {
        return [
          head("attention", id(o.id), " ", attention("returned"), returnedHow(o.verdict)),
          ...comment(o.verdict),
          ...briefs,
          next(`baesian revise ${o.id} card.md`, "reply with the card's next revision"),
          next(`baesian withdraw ${o.id} --reason "<why>"`, "or withdraw it, if it no longer applies"),
          ...(o.ruleAsked ? ruleHint(o.id) : []),
        ];
      }
      if (o.status === "deferred") {
        return [
          head("attention", id(o.id), " ", attention("deferred"), by(o.verdict)),
          ...comment(o.verdict),
          text(o.level === "hard" ? "It is hard: don't proceed with it." : "Proceed provisionally; it must be resolved before the branch merges."),
        ];
      }
      return [head("attention", id(o.id), ` is ${o.status}: it no longer applies. Don't build on it.`)];
    case "no-verdict": {
      const why = o.reason === "away" ? "the reviewer is away" : "timed out";
      if (!o.proceed) {
        return [
          failed("no verdict on ", id(o.id), ` yet (${why})`),
          text("It is hard: do not proceed with it. Park this task and work on something else, or stop."),
          next(`baesian wait ${o.id}`, "later, to wait again"),
        ];
      }
      return [
        head("attention", "no verdict on ", id(o.id), ` yet (${why})`),
        text("Proceed provisionally on your proposal. ", ...carries(o.id)),
        ...(o.recorded ? [text("Recorded on the card: you proceeded without a verdict.")] : []),
      ];
    }
  }
}

/** IDs as an agent reads them in a sentence: "B-a", "B-a and B-b", "B-a, B-b and B-c". */
const named = (ids: string[]) => (ids.length < 2 ? ids.join("") : `${ids.slice(0, -1).join(", ")} and ${ids.at(-1)}`);

/**
 * What the agent reads after a wait on several cards (B-xnae9): why it ended, then what happened to each card, in the
 * words a wait on one card uses. A run that ends with "again" gives no answers yet: they all come when the wait ends,
 * so the agent doesn't start on half of them.
 */
export function describeAll(o: WaitAllOutcome): Line[] {
  const open = o.cards.filter((c): c is StillOpen => c.kind === "open").map((c) => c.id);
  const answered = o.cards.filter((c): c is Exclude<CardOutcome, StillOpen> => c.kind !== "open");
  if (o.ended === "again") {
    const min = Math.max(1, Math.round((o.leftMs ?? 0) / 60_000));
    const sofar = answered.length ? ` (${answered.length} of ${o.cards.length} answered so far; every answer comes when the wait ends)` : "";
    return [
      head("next", `no verdict yet on ${named(open)}, and the reviewer is still there${sofar}`),
      next(`baesian wait ${o.ids.join(" ")}`, `again: the wait goes on for about ${min} more minute${min === 1 ? "" : "s"}`),
    ];
  }
  // What ended it comes first: the cards that came back, or were held back.
  const first = answered.filter((c) => (o.ended === "returned" ? cameBack(c) : o.ended === "held" ? c.kind === "held" : false));
  const rest = answered.filter((c) => !first.includes(c));
  const parked = o.cards.some((c) => c.kind === "no-verdict" && !c.proceed);
  const head_ = {
    answered: head(answered.every((c) => c.kind === "resolved") ? "done" : "attention", `every card you waited on has an answer: ${named(o.ids)}`),
    returned: head("attention", `${named(first.map((c) => c.id))} came back to you, so the wait ended before every card was answered`),
    held: head("done", `${named(first.map((c) => c.id))} ${first.length === 1 ? "is" : "are"} held back, so the wait ended before every card was answered`),
    "no-verdict": head(parked ? "failed" : "attention", `the wait is over with no verdict yet on ${named(o.cards.filter((c) => c.kind === "no-verdict").map((c) => c.id))}`),
  }[o.ended];
  const lines = [head_, ...[...first, ...rest].flatMap(describeOutcome)];
  if (open.length) {
    lines.push(text(`Still with the reviewer: ${named(open)}. To wait on ${open.length === 1 ? "it" : "them"} again once you've acted on ${named(first.map((c) => c.id))}, with any card you revise added:`));
    lines.push(next(`baesian wait ${open.join(" ")}${o.untilAnswered ? " --until-answered" : ""}`));
  }
  return lines;
}
