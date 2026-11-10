// SessionStart and UserPromptSubmit, for Claude Code and Codex (D116, D118): when a session starts or resumes, and
// with your next message, the new verdicts on this branch's cards come in as plain text, which both harnesses add
// to the agent's context. Each session keeps its own place in the inbox (B-ghhym). Nothing new, or no Baesian
// installed, prints nothing. In a clone that uses Baesian in personal mode (B-4rwyz), where AGENTS.md says nothing of
// it, a session's first look also brings Baesian's instructions, which the CLI prints.
//
// Both also note the session's model, when the harness names it (B-k0w7d): Claude Code at `SessionStart`, Codex at
// every hook. model-switched.mjs notes it when Claude Code switches.
import { pathToFileURL } from "node:url";
import { baesian, noteModel, runHook, sessionArgs } from "./baesian.mjs";

/** The hook's plain output: what `inbox --quiet` printed for this session, or nothing. */
export async function newVerdicts(input, run = baesian) {
  noteModel(input);
  const r = await run(["inbox", "--quiet", ...sessionArgs(input)], "", input?.cwd);
  if (r.missing || r.status !== 0) return "";
  return r.stdout;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runHook(newVerdicts);
