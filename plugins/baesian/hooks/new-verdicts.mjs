// SessionStart and UserPromptSubmit, for Claude Code and Codex (D116, D118): when a session starts or resumes, and
// with your next message, the new verdicts on this branch's cards come in as plain text, which both harnesses add
// to the agent's context. Each session keeps its own place in the inbox (B-ghhym). Nothing new, or no Baesian
// installed, prints nothing. In a clone that uses Baesian in personal mode (B-4rwyz), where AGENTS.md says nothing of
// it, a session's first look also brings Baesian's instructions, which the CLI prints.
//
// Both also note the session's model, when the harness names it (B-k0w7d): Claude Code at `SessionStart`, Codex at
// every hook. model-switched.mjs notes it when Claude Code switches.
//
// At a session's start, in a repo that uses Baesian, it checks the `baesian` on PATH is the plugin's release (B-pw9ak),
// and when it isn't, or there's none, tells the agent once, to ask the person to install or update.
import { pathToFileURL } from "node:url";
import { baesian, noteModel, runHook, sessionArgs, sessionMemory, versionNote } from "./baesian.mjs";

/** The hook's plain output: a word on the CLI's release, at a session's start, then what `inbox --quiet` printed. */
export async function newVerdicts(input, run = baesian, memory = sessionMemory("version")) {
  noteModel(input);
  const note = await versionNote(input, run, memory);
  const r = await run(["inbox", "--quiet", ...sessionArgs(input)], "", input?.cwd);
  if (r.missing || r.status !== 0) return note;
  return note + r.stdout;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runHook(newVerdicts);
