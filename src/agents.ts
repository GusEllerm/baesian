import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Tier 1 (D27): plain instructions any harness can read. `baesian init` keeps this block in AGENTS.md.

export const BEGIN = "<!-- baesian:begin -->";
export const END = "<!-- baesian:end -->";

export const AGENTS_BLOCK = `${BEGIN}
## Decisions (Baesian)

Design decisions that are hard to undo go to a person as cards; you don't make them silently. Run
\`baesian inbox\` before starting work, and again when you finish a task: it shows new verdicts on this branch's
cards, to act on then rather than mid-task.

**File a card** (\`baesian template > card.md\`, fill it in, \`baesian file card.md\`) when a decision
changes a schema or on-disk format; changes a public API, URL scheme or module boundary; adds a runtime
dependency; changes CI, infrastructure or deployment; is user-facing; publishes something; touches
security or privacy; spends money; deletes or overwrites stored data; or would break something to
reverse. Otherwise decide yourself. Every card states its strongest alternative, and the one question
the choice turns on (the crux). A topic names one question: reuse one from \`baesian topics\` only for the
same question, and give a follow-on question its own, narrower topic. The reviewer chooses before seeing
your pick, your case or the card's body; put what they need in order to choose, kept neutral, in
\`crux_fact\`, and background in the body. The decision record is committed with the code, so don't paste
secrets, credentials or private output into a card.

**The commit gate** detects some of these decisions (dependencies, schemas and migrations, CI and
deploy files) and blocks a commit until each one is covered. Either cite a card whose \`touches\`
include it, \`Baesian-Card: <id>\`, or, for a two-way door, acknowledge it with a reason:
\`Baesian-Ack: dep:httpx <why this is fine>\`. When it blocks, the gate prints the lines to paste.
\`baesian check\` previews it before you commit. Trailers go at the end of the message, after a blank
line.

- \`level: provisional\` (the default): carry on with your proposal. \`blocking\`: run \`baesian wait <id>\`
  before building on it. \`hard\` (the default for publishing, security, privacy, money and data loss): never
  proceed without a verdict. A level is a minimum only when the card is shown: the repo's preferences may
  hold a card back instead, and \`baesian file\` says so. A held card means go ahead with your pick, as
  provisional, citing it as usual; it counts as settled at merge, and the reviewer may answer it later.
- \`baesian wait <id>\` exits 0 when resolved (use the decision. If it went against your pick and you hold
  a fact the reviewer lacked, or a check that would settle it, you may reply once:
  \`baesian reply <id> "<the fact or check>"\`. Not your pick again); 4 when answered otherwise (returned:
  read the comment, then \`baesian revise <id>\` or \`baesian withdraw <id>\`); 5 with no verdict yet
  (proceed provisionally); 6 with no verdict on a hard card (don't proceed: park the task or stop); 7 while
  the reviewer is still there (run \`baesian wait <id>\` again); 8 when the card is held back (go ahead with
  your pick, as provisional). Each run lasts at most 100 seconds.
- If an answer asks for a rule (\`wait\` and \`inbox\` say so), draft it, with the gate patterns it covers:
  \`baesian rule <id> "<the rule>" --covers dep:pytest-*\`. It goes to the reviewer as a card.
- If you're a long-lived agent, set \`BAESIAN_AGENT\` to your name; otherwise your harness's name is used.
- If \`baesian file\` exits 3, the decision may already be open or decided: attach with
  \`baesian attach <id>\`, or follow the decision. File with \`--new\` only to argue against one, and set
  \`supersedes:\`. If yours is a different question on the same subject, give it a narrower topic
  (\`client/rule-drafts\` beside \`client/rules\`) and list what it builds on in \`depends_on\`.
- Commits that build on a card carry the trailer \`Baesian-Card: <id>\`. The gate blocks a commit that
  builds on a rejected card, or on a hard card that isn't resolved yet.
- Never record a verdict yourself, or write the repo's preference files: only a person answers, and sets
  the preferences, in the Baesian client.
${END}`;

/**
 * Who is running a command (D102): `--agent`, then `$BAESIAN_AGENT` (a long-lived agent's own name), then the
 * name the harness gives itself, then "agent". The MCP server passes the name its client gave in the protocol, which
 * comes before the harness's variables, since a stdio server isn't given them all (P18).
 */
export function agentName(opt: string | undefined, env: NodeJS.ProcessEnv = process.env, client?: string): string {
  return opt ?? (env.BAESIAN_AGENT?.trim() || undefined) ?? clientAgentName(client) ?? harnessName(env) ?? "agent";
}

/** An MCP client's name as an agent's: Claude Code's and Codex's become the names their commands get; others stay. */
export function clientAgentName(client: string | undefined): string | undefined {
  const name = client?.trim();
  if (!name) return undefined;
  if (/^claude[-_ ]?code\b/i.test(name)) return "claude-code";
  if (/^codex\b/i.test(name)) return "codex";
  return name;
}

/** The harness's own name, from the variables it sets for the commands it runs. */
/**
 * The harness session a command runs in, when the harness says: Claude Code gives its commands
 * `CLAUDE_CODE_SESSION_ID`, and Codex `CODEX_THREAD_ID`, each the same ID its hooks receive as `session_id`. So an
 * agent's own `baesian inbox` reads its session's place, as the plugin's hooks do (B-ghhym), and never hears twice.
 */
export function harnessSession(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.CLAUDE_CODE_SESSION_ID?.trim() || env.CODEX_THREAD_ID?.trim() || undefined;
}

export function harnessName(env: NodeJS.ProcessEnv): string | undefined {
  // Claude Code sets AI_AGENT to "<name>_<version>_<role>", for example "claude-code_2-1-314_agent".
  const ai = env.AI_AGENT?.trim();
  if (ai) return ai.split("_")[0] || undefined;
  if (env.CLAUDE_CODE_ENTRYPOINT || env.CLAUDECODE) return "claude-code";
  // Codex sets no AI_AGENT, but gives the commands it runs a per-session CODEX_THREAD_ID (seen in 0.166.0, by
  // rehearse's agent, with no model calls).
  if (env.CODEX_THREAD_ID) return "codex";
  return undefined;
}

export type BlockResult = "created" | "appended" | "updated" | "unchanged";

/**
 * The block for a repo, with its vault's guidance (M6, D173): with a vault, one sentence points agents to its routing
 * notes and its rules, to read when deciding whether to file. They're guidance: the gate takes rules only from the store.
 */
export function agentsBlock(vault?: { rules: string; notes: string[] }): string {
  if (!vault) return AGENTS_BLOCK;
  const read = [...vault.notes.map((n) => `\`${n}\``), `the rules in force, in \`${vault.rules}\``];
  const sentence = `Before deciding whether to file, read this repo's guidance in its vault: ${read.length > 2 ? `${read.slice(0, -1).join(", ")} and ${read.at(-1)}` : read.join(" and ")}.`;
  return AGENTS_BLOCK.replace("\n\n**The commit gate**", `\n\n${sentence}\n\n**The commit gate**`);
}

/** Write or refresh the Baesian block in `AGENTS.md`, leaving everything outside the markers alone. */
export function writeAgentsBlock(toplevel: string, vault?: { rules: string; notes: string[] }): BlockResult {
  const path = join(toplevel, "AGENTS.md");
  const block = agentsBlock(vault);
  if (!existsSync(path)) {
    writeFileSync(path, `# Agent instructions\n\n${block}\n`);
    return "created";
  }
  const text = readFileSync(path, "utf8");
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (start < 0 || end < start) {
    writeFileSync(path, `${text.replace(/\s*$/, "")}\n\n${block}\n`);
    return "appended";
  }
  const next = text.slice(0, start) + block + text.slice(end + END.length);
  if (next === text) return "unchanged";
  writeFileSync(path, next);
  return "updated";
}

/** Claude Code reads CLAUDE.md, not AGENTS.md. Warn when CLAUDE.md exists and doesn't import it. */
export function claudeMdMissesAgents(toplevel: string): boolean {
  const path = join(toplevel, "CLAUDE.md");
  return existsSync(path) && !/@AGENTS\.md/.test(readFileSync(path, "utf8"));
}

/** One field of a card draft, as the template shows it and the MCP filing tool's schema describes it (D167). */
export interface CardField {
  field: string;
  /** What the template shows as its value. */
  value: string;
  /** Its note: the template's comment on its line, and its description in the filing tool's schema. */
  note: string;
  /** Commented out in the template. */
  optional?: true;
  /** The template's comment when it isn't the note: a note that runs over several fields' lines, or none ("") */
  line?: string;
  /** Not in the template, only in the tool's schema. */
  template?: false;
}

/**
 * The card's fields, with their notes, in the template's order: one table, so `baesian template` and the MCP filing
 * tool's schema can't drift apart (D167).
 */
export const CARD_FIELDS: readonly CardField[] = [
  { field: "title", value: '""', note: 'a neutral short name: "Where the access token lives"' },
  { field: "question", value: '""', note: "the decision, as a neutral question" },
  { field: "doing", value: '""', note: "what you were doing when it came up: \"writing the server's file watcher\"" },
  { field: "topic", value: '""', note: "area/subject, naming this one question; reuse one from `baesian topics` only for the same question" },
  { field: "touches", value: "[]", note: "any of: schema, public-api, dependency, infra, user-facing, publishes, security, privacy, money, data-loss" },
  { field: "reverse", value: '""', note: "how costly it is to undo: cheap, moderate or one-way" },
  { field: "proposal", value: '""', note: "your pick, in a few words" },
  { field: "proposal_then", value: '""', note: "what happens if it's chosen" },
  { field: "alternative", value: '""', note: "the strongest alternative, in a few words" },
  { field: "alternative_then", value: '""', note: "what happens if it's chosen" },
  { field: "crux", value: '""', note: "the one question the choice turns on" },
  { field: "crux_proposal", value: '""', note: 'the answer that leads to your pick: "If it does"' },
  { field: "crux_alternative", value: '""', note: "the answer that leads to the alternative: \"If it doesn't\"" },
  { field: "crux_preference", value: "true", optional: true, note: "the crux is about what the reviewer values, not a fact" },
  { field: "crux_fact", value: '""', optional: true, note: "what the reviewer needs to choose, kept neutral: the only context they see first" },
  { field: "rationale", value: '""', optional: true, note: "why you pick the proposal" },
  {
    field: "wrong_if", value: '""', optional: true,
    note: "what would show your pick is wrong: required if reverse is one-way, touches includes security or privacy, or a premise is set",
    line: "(what would show your pick is wrong: required if reverse is one-way,",
  },
  {
    field: "check", value: '""', optional: true,
    note: "where to look to check wrong_if: required with it",
    line: " touches includes security or privacy, or a premise is set; check says where to look)",
  },
  { field: "premise", value: '""', optional: true, note: "a claim an option rests on that nobody has checked; give premise_option and premise_check with it", line: "(a claim an option rests on that nobody has checked," },
  { field: "premise_option", value: "proposal", optional: true, note: "which option the premise rests on: proposal or alternative", line: " which option rests on it," },
  { field: "premise_check", value: '""', optional: true, note: "how to check the premise", line: " and how to check it)" },
  { field: "acted", value: '""', optional: true, note: "what you've already built for one option; give acted_option with it", line: "(what you've already built for one option," },
  { field: "acted_option", value: "proposal", optional: true, note: "which option you've already built for: proposal or alternative", line: " and which)" },
  { field: "serves", value: '""', optional: true, note: "the criterion your pick serves, when the crux is a preference" },
  { field: "also_considered", value: "[]", optional: true, note: "other options, by name" },
  { field: "rules", value: "[R-xxxxx]", optional: true, note: "rules this decision bears on" },
  { field: "proposal_breaks", value: "[]", optional: true, note: "decisions or rules your pick would replace or break" },
  { field: "alternative_breaks", value: "[]", optional: true, note: "decisions or rules the alternative would replace or break", line: "" },
  { field: "level", value: "blocking", optional: true, note: "provisional by default; hard by default for publishes, security, privacy, money, data-loss; a minimum only if the card is shown" },
  { field: "depends_on", value: "[B-xxxxx]", optional: true, note: "the cards this decision builds on", line: "" },
  { field: "deck", value: "storage-layer", optional: true, note: "your branch's deck by default" },
  { field: "supersedes", value: "", template: false, note: "a decision this card argues against, filed with new; it becomes superseded once this card resolves" },
  { field: "modules_touched", value: "", template: false, note: "how many modules the decision touches" },
  { field: "confidence", value: "", template: false, note: "your confidence in your pick, from 0 to 1: recorded, not used for routing" },
  { field: "domain", value: "", template: false, note: "routing tags" },
  { field: "evidence", value: "", template: false, note: "links that bear on the decision" },
  {
    field: "secret_reason", value: "", template: false,
    note: "why you file a card that looks like it holds a secret: in a hosted repo filing refuses one without it (B-jfkv9). Kept on the card, where reviewers see it",
  },
];

function templateLine(f: CardField): string {
  const head = f.optional ? `# ${f.field}: ${f.value}` : `${f.field}: ${f.value}`;
  const comment = f.line ?? (f.optional ? `(${f.note})` : `# ${f.note}`);
  return comment ? `${head.padEnd(f.optional ? 27 : 23)}${comment}` : head;
}

export const CARD_TEMPLATE = `---
${CARD_FIELDS.filter((f) => f.template !== false).map(templateLine).join("\n")}
# Below the closing line, optionally: background, shown with your case once the reviewer has chosen.
---
`;
