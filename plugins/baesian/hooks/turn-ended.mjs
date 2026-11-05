// The Stop hook, for Claude Code and Codex (D116, D118): when the agent finishes a turn, the new verdicts on this
// branch's cards are brought in, and the agent carries on to act on them. The end of a turn is a natural stopping
// point, so an answer never lands mid-task. `SessionStart` and `UserPromptSubmit` run new-verdicts.mjs, since their
// plain output is added to the agent's context; a Stop hook's has to be JSON.
//
// With nothing new, in Claude Code (B-xnae9): if the turn ends with this branch's cards still with the reviewer and no
// `baesian wait` running in the background, the agent is reminded once that it can leave one running, and be woken when
// the cards are answered. Codex can't be woken that way, so it's never reminded.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { baesian, runHook, sessionArgs } from "./baesian.mjs";

/**
 * What each session has been reminded of (`<card> r<revision>`), in a file of its own under the system's temporary
 * folder: the plugin's own memory, not Baesian's, so an agent that chose not to wait isn't told again at every turn.
 * Nothing kept means it may remind again; it never fails the hook.
 */
export function remindedIn(dir = join(tmpdir(), "baesian-plugin")) {
  const file = (session) => join(dir, `reminded-${createHash("sha256").update(session).digest("hex").slice(0, 32)}.json`);
  return {
    read(session) {
      try {
        const keys = JSON.parse(readFileSync(file(session), "utf8"));
        return new Set(Array.isArray(keys) ? keys : []);
      } catch {
        return new Set();
      }
    },
    write(session, keys) {
      try {
        mkdirSync(dir, { recursive: true });
        writeFileSync(file(session), JSON.stringify([...keys]));
      } catch {
        // no memory of it: the next turn may remind again
      }
    },
  };
}

/** A command that waits on Baesian's cards: `baesian wait …`, or a loop over it. */
const WAITS = /\bbaesian\b[\s\S]*\bwait\b/;

/**
 * The reminder at the end of a turn, or nothing (B-xnae9). Only in Claude Code 2.1.145 and later, whose Stop input lists
 * the session's background tasks, since only there does a command left in the background wake the agent; never while
 * the agent is carrying on because of a Stop hook, nor when a `baesian wait` is running in the background already; and
 * once a session for each card's revision.
 */
export async function reminder(input, run = baesian, reminded = remindedIn()) {
  if (!Array.isArray(input.background_tasks) || typeof input.turn_id === "string" || input.stop_hook_active) return undefined;
  if (typeof input.session_id !== "string" || !input.session_id) return undefined;
  if (input.background_tasks.some((t) => WAITS.test(String(t?.command ?? "")))) return undefined;
  const r = await run(["list", "--branch", "--json"], "", input.cwd);
  if (r.missing || r.status !== 0) return undefined;
  let cards;
  try {
    cards = JSON.parse(r.stdout);
  } catch {
    return undefined;
  }
  if (!Array.isArray(cards)) return undefined;
  // In the order they were filed, which the agent knows them by; the ID only breaks a tie.
  const open = cards
    .filter((c) => c?.status === "open" || c?.status === "rerouted")
    .sort((x, y) => String(x.created).localeCompare(String(y.created)) || String(x.id).localeCompare(String(y.id)));
  const seen = reminded.read(input.session_id);
  const key = (c) => `${c.id} r${c.revision}`;
  const fresh = open.filter((c) => !seen.has(key(c)));
  if (!fresh.length) return undefined;
  reminded.write(input.session_id, new Set([...seen, ...fresh.map(key)]));
  const ids = fresh.map((c) => c.id);
  return [
    `Cards on this branch are still with the reviewer: ${fresh.map((c) => `${c.id} (${c.level})`).join(", ")}.`,
    `If you'll act on their answers, leave \`baesian wait ${ids.join(" ")} --until-answered\` running in the background before you finish (Bash, run in the background; name only the cards you need, since it waits for every one): you'll be woken when it ends, with the answers.`,
    "If you won't, finish as you were. These cards won't be mentioned again in this session.",
  ].join("\n");
}

/** The hook's output, in the form the harness that ran it takes, or nothing. */
export async function onTurnEnded(input, run = baesian, reminded = remindedIn()) {
  if (input?.hook_event_name !== "Stop") return undefined;
  // `inbox --quiet` prints nothing when there's nothing new, and marks what it prints as seen, so a turn that carries
  // on because of this hook ends quietly next time.
  const r = await run(["inbox", "--quiet", ...sessionArgs(input)], "", input.cwd);
  if (r.missing) return undefined;
  if (r.status !== 0 || !r.stdout.trim()) {
    const remind = await reminder(input, run, reminded);
    return remind ? { hookSpecificOutput: { hookEventName: "Stop", additionalContext: remind } } : undefined;
  }
  const context = `${r.stdout.trim()}\nYou've reached a stopping point: act on these before you finish.`;
  // Codex carries a turn on only for a block with a reason, and ignores `additionalContext` here. Claude Code takes
  // either, but labels a block as a hook error. Codex's input always has a `turn_id`, and Claude Code's has none.
  if (typeof input.turn_id === "string") return { decision: "block", reason: context };
  return { hookSpecificOutput: { hookEventName: "Stop", additionalContext: context } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runHook(onTurnEnded);
