import { byLine, q, reviewerOf, said } from "./quote.js";
import type { Level, Verdict } from "./schema.js";
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
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /**
   * Stops the wait: the harness cancelled the MCP call, its input closed, or the person pressed Ctrl-C. The marker is
   * removed, since the agent has stopped waiting, and the wait throws `WaitCancelled`.
   */
  signal?: AbortSignal;
  /** Called at each beat of the marker (every `WAITING_BEAT_MS`): the MCP server reports progress then. */
  onBeat?: (beat: { waitedMs: number; leftMs: number }) => void;
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
 * D46); hard never does.
 */
export async function waitForVerdict(store: Store, id: string, opts: WaitOptions): Promise<WaitOutcome> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => realSleep(ms, opts.signal));
  const pollMs = opts.pollMs ?? POLL_MS;
  const card = store.card(id);
  if (!card) throw new NoCard(id);
  if (opts.signal?.aborted) throw new WaitCancelled(id);
  // A held card answers the agent at once: go ahead, as settled at merge (B-chq61). Nobody waits, so no marker.
  if (store.view(() => store.status(id)) === "held") return { kind: "held", id };

  // The waiting marker (D90): while it's fresh, "stopped for you" is true. A run that ends with "again" keeps it,
  // and the next run picks it up, so the wait's budget counts from when it first started (D101). It's removed when
  // the wait is over; an agent killed mid-wait leaves it behind, and it goes stale.
  const marker = store.startWaiting(id, opts.agent, new Date(now()).toISOString());
  const budgetEnd = Date.parse(marker.since) + (opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const sliceEnd = now() + (opts.sliceMs ?? SLICE_MS);
  let beat = now();
  let keep = false;
  try {
    let reason: "timeout" | "away";
    for (;;) {
      // Each poll is one fresh view of the live layer: a card's status reads the others, once each.
      const done = store.view((): WaitOutcome | undefined => {
        const status = store.status(id);
        const latest = store.card(id)!;
        const verdict = store
          .verdicts(id)
          .filter((v) => v.revision === latest.meta.revision)
          .at(-1);
        if (status === "resolved") {
          return { kind: "resolved", id, decision: store.decision(id)!, verdict, briefs: store.briefs(id), canReply: store.canReply(id), ruleAsked: store.ruleAsked(id) };
        }
        if (status !== "open" && status !== "rerouted" && status !== "held") {
          return { kind: "answered", id, status, level: latest.meta.level, verdict, briefs: store.briefs(id), ruleAsked: store.ruleAsked(id) };
        }
        return undefined;
      });
      if (done) return done;
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
        marker.refresh(new Date(now()).toISOString());
        return { kind: "again", id, waitedMs: now() - Date.parse(marker.since), leftMs: budgetEnd - now() };
      }
      await sleep(Math.max(0, Math.min(pollMs, sliceEnd - now(), budgetEnd - now())));
      // Cancelled: the finally below removes the marker, since the agent has stopped waiting.
      if (opts.signal?.aborted) throw new WaitCancelled(id);
      if (now() - beat >= WAITING_BEAT_MS) {
        beat = now();
        marker.refresh(new Date(beat).toISOString());
        opts.onBeat?.({ waitedMs: beat - Date.parse(marker.since), leftMs: budgetEnd - beat });
      }
    }

    // The level in force: in a hosted repo, the relay's signed gate record may have raised it (P16 section 3).
    const level = store.view(() => store.levelOf(id)) ?? store.card(id)!.meta.level;
    const proceed = level !== "hard";
    let recorded = false;
    if (level === "blocking") {
      store.recordFallback(id, reason, opts.agent);
      recorded = true;
    }
    return { kind: "no-verdict", id, reason, level, proceed, recorded };
  } finally {
    if (!keep) marker.stop();
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
 * A brief in the words an agent reads: what changed, and what to do about it (D80, D81). The texts others wrote are
 * quoted with their authors (D169).
 */
export function describeBrief(b: Brief): string[] {
  if (b.kind === "parent-decided-otherwise") {
    const parent = { agent: b.parentAgent, branch: b.parentBranch };
    return [
      `  ${b.parent}, which ${b.card} builds on, was decided the other way. ${said("Its title", parent, b.parentTitle)}`,
      `  ${said("Decided", reviewerOf(b), b.decided)}; ${said("not the proposal", parent, b.assumed)}`,
      `  Re-propose ${b.card} on that basis with \`baesian revise ${b.card} <card.md>\`, or withdraw it.`,
    ];
  }
  const name = (c: BriefCommit) => `${c.commit?.slice(0, 7) ?? "uncommitted"} (${c.branch})`;
  const live = b.commits.filter((c) => !c.rewritten);
  const gone = b.commits.filter((c) => c.rewritten);
  const commits = live.length
    ? `  Commits that cite ${b.card}, built on the old answer: ${live.map(name).join(", ")}. Rework them to match. Only commits that cite the card are listed: check for other work built on it.`
    : gone.length
      ? `  No commit on a branch cites ${b.card} now; check for work built on the old answer all the same.`
      : `  No commit cites ${b.card} yet; check for work built on the old answer all the same.`;
  // B-9v5xj: the ledger's commits that a rebase or a squash took off every branch.
  const rewritten = gone.length
    ? [`  Rewritten since, and on no branch now: ${gone.map(name).join(", ")}. Their work may be in ${live.length ? "the commits above, or in ones" : "commits"} that don't cite ${b.card}.`]
    : [];
  const now = b.now !== undefined ? said(b.kind === "held-answered" ? "decided" : "one", reviewerOf(b), b.now) : `not a go-ahead (${b.response} by ${byLine(reviewerOf(b))})`;
  if (b.kind === "held-answered") {
    // D150, D151: the gate held it back, so the agent went ahead with its pick; the reviewer answered it later.
    const pick = said("the pick", { agent: b.agent, branch: b.branch }, b.assumed);
    return [`  ${b.card} was held back, so its agent went ahead with ${pick}. The reviewer has answered it since: ${now}.`, commits, ...rewritten];
  }
  const was = said("an answer", { person: b.wasReviewer }, b.was);
  return [`  The answer on ${b.card} changed. It was ${was}; now it's ${now}.`, commits, ...rewritten];
}

/** What an agent is told when the reviewer asked for a rule from a decision (D16, D109, D110). */
export const ruleHint = (id: string) => [
  "The reviewer asked for a rule from this decision. Draft it in a line, with the gate patterns it covers, if any (as gate reports name them: dep:pytest-*, schema:migrations/*):",
  `  baesian rule ${id} "<the rule>" --covers <pattern>…`,
  "It goes to them as a card; accepting it saves the rule.",
];

/** What an agent is told when an answer went against its pick and it may still reply (D89, D104). */
export const replyHint = (id: string) => [
  `It went against your pick. If you hold a fact the reviewer lacked, or a check that would settle it, you may reply once:`,
  `  baesian reply ${id} "<the fact or check>"`,
  "Not your pick again. Until they answer again, proceed with their decision.",
];

/** What the agent should read: what happened, and what to do next. What the reviewer wrote is quoted (D169). */
export function describeOutcome(o: WaitOutcome): string[] {
  const comment = (v: Verdict | undefined) => (v?.comment ? [`  ${said("Comment", reviewerOf(v), v.comment)}`] : []);
  const by = (v: Verdict | undefined) => (v ? ` by ${byLine(reviewerOf(v))}` : "");
  if (o.kind === "held") {
    return [
      `${o.id} is held back: this repo's preferences let the agent decide this kind of decision, whatever level the card asked for.`,
      `Go ahead with your pick, as provisional. Commits that build on it carry \`Baesian-Card: ${o.id}\`, and it counts as settled at merge.`,
      "The reviewer may still answer it later; `baesian inbox` brings that answer if they do.",
    ];
  }
  if (o.kind === "again") {
    const min = Math.max(1, Math.round(o.leftMs / 60_000));
    return [`No verdict on ${o.id} yet, and the reviewer is still there.`, `Run \`baesian wait ${o.id}\` again: the wait goes on for about ${min} more minute${min === 1 ? "" : "s"}.`];
  }
  const briefs = o.kind === "no-verdict" ? [] : o.briefs.flatMap(describeBrief);
  switch (o.kind) {
    case "resolved":
      return [
        `${o.id} resolved${by(o.verdict)}: ${q(o.decision)}`,
        ...comment(o.verdict),
        ...(o.verdict?.retire_rules?.length ? [`  The reviewer retired the rule${o.verdict.retire_rules.length === 1 ? "" : "s"} it breaks, ${o.verdict.retire_rules.join(", ")}: don't cite ${o.verdict.retire_rules.length === 1 ? "it" : "them"} again.`] : []),
        ...briefs,
        "Proceed with that decision.",
        ...(o.ruleAsked ? ruleHint(o.id) : []),
        ...(o.canReply ? replyHint(o.id) : []),
      ];
    case "answered":
      if (o.status === "returned" && o.briefs.some((b) => b.kind === "parent-decided-otherwise")) {
        return [`${o.id} returned: what it builds on was decided the other way.`, ...briefs];
      }
      if (o.status === "returned") {
        return [
          `${o.id} returned (${o.verdict?.response ?? "reject"}${by(o.verdict)}).`,
          ...comment(o.verdict),
          ...briefs,
          `Reply with \`baesian revise ${o.id} <card.md>\`, or withdraw it with \`baesian withdraw ${o.id} --reason …\`.`,
          ...(o.ruleAsked ? ruleHint(o.id) : []),
        ];
      }
      if (o.status === "deferred") {
        return [
          `${o.id} deferred${by(o.verdict)}.`,
          ...comment(o.verdict),
          o.level === "hard"
            ? "It is hard: don't proceed with it."
            : "Proceed provisionally; it must be resolved before the branch merges.",
        ];
      }
      return [`${o.id} is ${o.status}: it no longer applies. Don't build on it.`];
    case "no-verdict": {
      const why = o.reason === "away" ? "the reviewer is away" : "timed out";
      if (!o.proceed) {
        return [
          `No verdict on ${o.id} yet (${why}).`,
          `It is hard: do not proceed with it. Park this task and work on something else, or stop. Run \`baesian wait ${o.id}\` again later.`,
        ];
      }
      return [
        `No verdict on ${o.id} yet (${why}).`,
        `Proceed provisionally on your proposal. Commits that build on it carry \`Baesian-Card: ${o.id}\`.`,
        ...(o.recorded ? ["Recorded on the card: you proceeded without a verdict."] : []),
      ];
    }
  }
}
