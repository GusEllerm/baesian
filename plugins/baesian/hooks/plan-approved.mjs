// Claude Code's PostToolUse hook on ExitPlanMode (B-e0b1j): a plan you've approved becomes a deck's briefing, and the
// agent is told to file the plan's hard-to-undo decisions into that deck. It runs only once you've approved the plan,
// and never approves one. Without the CLI, or outside a repo that uses Baesian, it says nothing.
import { pathToFileURL } from "node:url";
import { baesian, runHook } from "./baesian.mjs";

const FALLBACK_TITLE = "An approved plan";

/** The deck's title and ID, from the plan's first heading. */
export function deckFor(plan) {
  const heading = /^#{1,6}[ \t]+(.+?)[ \t#]*$/m.exec(plan)?.[1] ?? "";
  const title =
    heading
      .replace(/[*_`]/g, "")
      .replace(/^plan:\s*/i, "")
      .trim()
      .slice(0, 100) || FALLBACK_TITLE;
  const full = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  // At most 40 characters, cut between words.
  const cut = full.length > 40 ? full.slice(0, 41) : full;
  const slug = full.length > 40 && cut.lastIndexOf("-") > 0 ? cut.slice(0, cut.lastIndexOf("-")) : cut.slice(0, 40);
  return { title, id: `plan-${slug || "approved"}` };
}

/** What the agent is told once the deck exists. */
export function contextFor(id, title) {
  return [
    `Baesian: the plan you just had approved is now the briefing of the deck \`${id}\` ("${title}").`,
    "Approving a plan is one yes for the whole of it, so its hard-to-undo decisions still go to the reviewer one by one:",
    `before you build each one that \`AGENTS.md\` says needs a card, file it with \`deck: ${id}\`, and wait on it if it's`,
    "blocking. Decide the rest yourself.",
  ].join(" ");
}

const NOT_BAESIAN = /not inside a git repository|not set up in this repository/;

/** The hook's output for Claude Code's input, or nothing. */
export async function onPlanApproved(input, run = baesian) {
  if (input?.tool_name !== "ExitPlanMode") return undefined;
  const response = input.tool_response ?? {};
  // A subagent's plan, or one sent on to a team lead, isn't one you've approved.
  if (response.isAgent || response.awaitingLeaderApproval) return undefined;
  const plan = typeof response.plan === "string" ? response.plan : input.tool_input?.plan;
  if (typeof plan !== "string" || !plan.trim()) return undefined;
  const { id, title } = deckFor(plan);
  for (let n = 1; n <= 20; n++) {
    const deck = n === 1 ? id : `${id}-${n}`;
    const r = await run(["deck", deck, "--title", title, "--from", "-"], plan, input.cwd);
    if (r.status === 0) return { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: contextFor(deck, title) } };
    if (r.missing || NOT_BAESIAN.test(r.stderr)) return undefined;
    if (!/already a deck/.test(r.stderr)) throw new Error(r.stderr.trim() || `baesian deck exited ${r.status}`);
  }
  throw new Error(`every deck from ${id} to ${id}-20 is taken`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runHook(onPlanApproved);
