// The PreToolUse hook on the question tool (B-qrdhh): Claude Code's `AskUserQuestion`, and Codex's
// `request_user_input` (unverified: Codex runs PreToolUse for its local function tools by name). A question with
// options is refused once, with a reason that sends the agent to file a card if it asks the person to choose for a
// design decision. The same question asked again goes through, so a question of fact costs one retry and is never
// blocked. Outside a repo that uses Baesian, or for a question without options, it says nothing.
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { repoOf, runHook, sessionMemory } from "./baesian.mjs";
import { QUESTION_REASON } from "./choices.mjs";

export const QUESTION_TOOLS = ["AskUserQuestion", "request_user_input"];

/** The questions a call asks, each with its options' labels: both tools take `questions`, each with `options`. */
export function questionsOf(toolInput) {
  const questions = Array.isArray(toolInput?.questions) ? toolInput.questions : [];
  return questions
    .filter((q) => q && typeof q === "object")
    .map((q) => ({
      question: String(q.question ?? q.header ?? ""),
      options: (Array.isArray(q.options) ? q.options : []).map((o) => String(o?.label ?? o ?? "")),
    }));
}

/** The plugin's memory of the questions each session has been sent back on once (`sessionMemory()`). */
export function askedIn(dir) {
  return sessionMemory("asked", dir);
}

/** The hook's output for the harness's input, or nothing. */
export async function onQuestion(input, asked = askedIn(), repo = repoOf) {
  if (input?.hook_event_name !== "PreToolUse" || !QUESTION_TOOLS.includes(input.tool_name)) return undefined;
  const questions = questionsOf(input.tool_input);
  if (!questions.some((q) => q.options.length >= 2)) return undefined;
  if (!repo(input.cwd)) return undefined;
  // The same questions, in any order, are one ask: asked again, they go through.
  const key = createHash("sha256")
    .update(JSON.stringify(questions.map((q) => q.question.trim()).sort()))
    .digest("hex")
    .slice(0, 32);
  const session = typeof input.session_id === "string" ? input.session_id : "";
  const seen = asked.read(session);
  if (seen.has(key)) return undefined;
  asked.write(session, new Set([...seen, key]));
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: QUESTION_REASON } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runHook(onQuestion);
