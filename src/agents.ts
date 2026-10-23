import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Tier 1 (D27): plain instructions any harness can read. `baesian init` keeps this block in AGENTS.md.

export const BEGIN = "<!-- baesian:begin -->";
export const END = "<!-- baesian:end -->";

export const AGENTS_BLOCK = `${BEGIN}
## Decisions (Baesian)

Design decisions that are hard to undo go to a person as cards; you don't make them silently. Run
\`baesian inbox\` before starting work: it shows new verdicts on this branch's cards.

**File a card** (\`baesian template > card.md\`, fill it in, \`baesian file card.md\`) when a decision
changes a schema or on-disk format; changes a public API, URL scheme or module boundary; adds a runtime
dependency; changes CI, infrastructure or deployment; is user-facing; publishes something; touches
security or privacy; spends money; deletes or overwrites stored data; or would break something to
reverse. Otherwise decide yourself. Every card states its strongest alternative. Reuse topics from
\`baesian topics\`.

**The commit gate** detects some of these decisions (dependencies, schemas and migrations, CI and
deploy files) and blocks a commit until each one is covered. Either cite a card whose \`touches\`
include it, \`Baesian-Card: <id>\`, or, for a two-way door, acknowledge it with a reason:
\`Baesian-Ack: dep:httpx <why this is fine>\`. When it blocks, the gate prints the lines to paste.
\`baesian check\` previews it before you commit. Trailers go at the end of the message, after a blank
line.

- \`level: provisional\` (the default): carry on with your proposal. \`blocking\`: run \`baesian wait <id>\`
  before building on it. \`hard\` (the default for publishing, security, money and data loss): never
  proceed without a verdict.
- \`baesian wait <id>\` exits 0 when resolved (use the decision); 4 when answered otherwise (returned:
  read the comment, then \`baesian revise <id>\` or \`baesian withdraw <id>\`); 5 with no verdict yet
  (proceed provisionally); 6 with no verdict on a hard card (don't proceed: park the task or stop).
- If \`baesian file\` exits 3, the decision may already be open or decided: attach with
  \`baesian attach <id>\`, or follow the decision. File with \`--new\` only to argue against one, and set
  \`supersedes:\`.
- Commits that build on a card carry the trailer \`Baesian-Card: <id>\`. The gate blocks a commit that
  builds on a rejected card, or on a hard card that isn't resolved yet.
- Never record a verdict yourself: only a person answers, in the Baesian client.
${END}`;

export type BlockResult = "created" | "appended" | "updated" | "unchanged";

/** Write or refresh the Baesian block in `AGENTS.md`, leaving everything outside the markers alone. */
export function writeAgentsBlock(toplevel: string): BlockResult {
  const path = join(toplevel, "AGENTS.md");
  if (!existsSync(path)) {
    writeFileSync(path, `# Agent instructions\n\n${AGENTS_BLOCK}\n`);
    return "created";
  }
  const text = readFileSync(path, "utf8");
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (start < 0 || end < start) {
    writeFileSync(path, `${text.replace(/\s*$/, "")}\n\n${AGENTS_BLOCK}\n`);
    return "appended";
  }
  const next = text.slice(0, start) + AGENTS_BLOCK + text.slice(end + END.length);
  if (next === text) return "unchanged";
  writeFileSync(path, next);
  return "updated";
}

/** Claude Code reads CLAUDE.md, not AGENTS.md. Warn when CLAUDE.md exists and doesn't import it. */
export function claudeMdMissesAgents(toplevel: string): boolean {
  const path = join(toplevel, "CLAUDE.md");
  return existsSync(path) && !/@AGENTS\.md/.test(readFileSync(path, "utf8"));
}

export const CARD_TEMPLATE = `---
title: ""            # the decision, as a question
proposal: ""         # what you recommend
alternatives: []     # the other options you considered
# topic: area/subject   (reuse one from \`baesian topics\`)
touches: []          # any of: schema, public-api, dependency, infra, user-facing, publishes, security, money, data-loss
# level: blocking       (provisional by default; hard by default for publishes, security, money, data-loss)
# depends_on: [B-xxxxx]
# deck: storage-layer   (your branch's deck by default)
---

## Context

## Recommendation

## Strongest alternative

## Why now

## Cost to reverse

## Needed from the reviewer
`;
