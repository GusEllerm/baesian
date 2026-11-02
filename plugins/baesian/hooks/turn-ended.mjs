// The Stop hook, for Claude Code and Codex (D116, D118): when the agent finishes a turn, the new verdicts on this
// branch's cards are brought in, and the agent carries on to act on them. The end of a turn is a natural stopping
// point, so an answer never lands mid-task. `SessionStart` and `UserPromptSubmit` run `baesian inbox --quiet`
// directly, since their plain output is added to the agent's context; a Stop hook's has to be JSON.
import { pathToFileURL } from "node:url";
import { baesian, runHook } from "./baesian.mjs";

/** The hook's output, in the form the harness that ran it takes, or nothing. */
export async function onTurnEnded(input, run = baesian) {
  if (input?.hook_event_name !== "Stop") return undefined;
  // `inbox --quiet` prints nothing when there's nothing new, and marks what it prints as seen, so a turn that carries
  // on because of this hook ends quietly next time.
  const r = await run(["inbox", "--quiet"], "", input.cwd);
  if (r.missing || r.status !== 0 || !r.stdout.trim()) return undefined;
  const context = `${r.stdout.trim()}\nYou've reached a stopping point: act on these before you finish.`;
  // Codex carries a turn on only for a block with a reason, and ignores `additionalContext` here. Claude Code takes
  // either, but labels a block as a hook error. Codex's input always has a `turn_id`, and Claude Code's has none.
  if (typeof input.turn_id === "string") return { decision: "block", reason: context };
  return { hookSpecificOutput: { hookEventName: "Stop", additionalContext: context } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runHook(onTurnEnded);
