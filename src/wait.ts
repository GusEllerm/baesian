import type { Level, Verdict } from "./schema.js";
import { type Brief, type Status, type Store, WAITING_BEAT_MS } from "./store.js";

/** The client beats every 30 s; three missed beats means the reviewer has stepped away (D41). */
export const PRESENCE_STALE_MS = 90_000;
/** Under Claude Code's 10-minute limit on a shell command; the agent can simply wait again. */
export const DEFAULT_TIMEOUT_MS = 9 * 60_000;
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
} as const;

export type WaitOutcome =
  | { kind: "resolved"; id: string; decision: string; verdict: Verdict | undefined; briefs: Brief[] }
  | { kind: "answered"; id: string; status: Exclude<Status, "open" | "rerouted" | "resolved">; level: Level; verdict: Verdict | undefined; briefs: Brief[] }
  | { kind: "no-verdict"; id: string; reason: "timeout" | "away"; level: Level; proceed: boolean; recorded: boolean };

export interface WaitOptions {
  agent: string;
  timeoutMs?: number;
  pollMs?: number;
  /** Return at once when the client's heartbeat is stale. Default true. */
  usePresence?: boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Block until the reviewer answers `id`, the timeout passes, or the client reports the reviewer away.
 * Rerouted cards keep waiting: another reviewer is still to answer. With no verdict, what the agent may
 * do depends on the level (D42): provisional and blocking proceed (a blocking card records a fallback,
 * D46); hard never does.
 */
export async function waitForVerdict(store: Store, id: string, opts: WaitOptions): Promise<WaitOutcome> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? realSleep;
  const pollMs = opts.pollMs ?? POLL_MS;
  const deadline = now() + (opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const card = store.card(id);
  if (!card) throw new Error(`no card ${id}`);

  // The waiting marker (D90): while it's fresh, "stopped for you" is true. It's removed when this returns;
  // an agent killed mid-wait leaves it behind, and it goes stale.
  const marker = store.startWaiting(id, opts.agent, new Date(now()).toISOString());
  let beat = now();
  try {
    let reason: "timeout" | "away";
    for (;;) {
      const status = store.status(id);
      const latest = store.card(id)!;
      const verdict = store
        .verdicts(id)
        .filter((v) => v.revision === latest.meta.revision)
        .at(-1);
      if (status === "resolved") return { kind: "resolved", id, decision: store.decision(id)!, verdict, briefs: store.briefs(id) };
      if (status !== "open" && status !== "rerouted") {
        return { kind: "answered", id, status, level: latest.meta.level, verdict, briefs: store.briefs(id) };
      }
      if (opts.usePresence !== false) {
        const p = store.presence();
        // No heartbeat at all means the client has never run: unknown, so keep waiting. A stale one means away.
        if (p && now() - Date.parse(p.at) > PRESENCE_STALE_MS) {
          reason = "away";
          break;
        }
      }
      const left = deadline - now();
      if (left <= 0) {
        reason = "timeout";
        break;
      }
      await sleep(Math.min(pollMs, left));
      if (now() - beat >= WAITING_BEAT_MS) {
        beat = now();
        marker.refresh(new Date(beat).toISOString());
      }
    }

    const level = store.card(id)!.meta.level;
    const proceed = level !== "hard";
    let recorded = false;
    if (level === "blocking") {
      store.recordFallback(id, reason, opts.agent);
      recorded = true;
    }
    return { kind: "no-verdict", id, reason, level, proceed, recorded };
  } finally {
    marker.stop();
  }
}

export function exitCodeFor(outcome: WaitOutcome): number {
  if (outcome.kind === "resolved") return WAIT_EXIT.resolved;
  if (outcome.kind === "answered") return WAIT_EXIT.answered;
  return outcome.proceed ? WAIT_EXIT.proceed : WAIT_EXIT.park;
}

/** What the agent should read: what happened, and what to do next. */
/** A brief in the words an agent reads: what changed, and what to do about it (D80, D81). */
export function describeBrief(b: Brief): string[] {
  if (b.kind === "parent-decided-otherwise") {
    return [
      `  ${b.parent} ("${b.parentTitle}"), which ${b.card} builds on, was decided the other way: "${b.decided}", not "${b.assumed}".`,
      `  Re-propose ${b.card} on that basis with \`baesian revise ${b.card} <card.md>\`, or withdraw it.`,
    ];
  }
  const now = b.now !== undefined ? `"${b.now}"` : `not a go-ahead (${b.response})`;
  const commits = b.commits.length
    ? `  Commits that cite ${b.card}, built on the old answer: ${b.commits.map((c) => `${c.commit?.slice(0, 7) ?? "uncommitted"} (${c.branch})`).join(", ")}. Rework them to match. Only commits that cite the card are listed: check for other work built on it.`
    : `  No commit cites ${b.card} yet; check for work built on the old answer all the same.`;
  return [`  The answer on ${b.card} changed: it was "${b.was}", and now it's ${now}.`, commits];
}

export function describeOutcome(o: WaitOutcome): string[] {
  const comment = (v: Verdict | undefined) => (v?.comment ? [`  reviewer: ${v.comment}`] : []);
  const briefs = o.kind === "no-verdict" ? [] : o.briefs.flatMap(describeBrief);
  switch (o.kind) {
    case "resolved":
      return [`${o.id} resolved: ${o.decision}`, ...comment(o.verdict), ...briefs, "Proceed with that decision."];
    case "answered":
      if (o.status === "returned" && o.briefs.some((b) => b.kind === "parent-decided-otherwise")) {
        return [`${o.id} returned: what it builds on was decided the other way.`, ...briefs];
      }
      if (o.status === "returned") {
        return [
          `${o.id} returned (${o.verdict?.response ?? "reject"}).`,
          ...comment(o.verdict),
          ...briefs,
          `Reply with \`baesian revise ${o.id} <card.md>\`, or withdraw it with \`baesian withdraw ${o.id} --reason …\`.`,
        ];
      }
      if (o.status === "deferred") {
        return [
          `${o.id} deferred.`,
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
