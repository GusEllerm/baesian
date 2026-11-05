---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How the command line's output is laid out: One system, two renderings (B-eyrt5)."
created: 2026-11-05
updated: 2026-11-05
tags:
  - baesian
  - decision
aliases:
  - B-eyrt5
card: B-eyrt5
revision: 1
title: How the command line's output is laid out
question: Should the command line's output follow one small system, the same words for agents and people with styling only in a terminal, or keep today's text with only its worst problems fixed?
answer: One system, two renderings
response: accept
not_chosen:
  - Fix only the worst problems
answered: 2026-11-05T19:53:37.836Z
answered_by: GusEllerm
topic: cli/output/style
deck: cli-output
level: provisional
reverse: moderate
touches:
  - user-facing
  - public-api
filed: 2026-11-05T19:51:59.574Z
filed_by: claude-code
branch: v1/next
---

# How the command line's output is laid out

Should the command line's output follow one small system, the same words for agents and people with styling only in a terminal, or keep today's text with only its worst problems fixed?

**Decided:** One system, two renderings, the agent's pick. Every command uses six patterns: a headline saying what happened, aligned fields, rows with a header, `next:` lines with the exact command to run (IDs filled in), notes and warnings, and errors that end with a next step. Agents and the MCP tools get plain text, never wrapped and never coloured; a terminal gets the same words with styling. `init` ends with the commit to make. About 60 to 100 tests change their expected text; the plugin's hooks keep working (two error phrases it matches stay).

**Not chosen:** Fix only the worst problems. Today's text stays as it is, except the long lines are shortened, the missing next steps are added and the raw validation errors are summarised. Each command keeps its own shape, and nothing is styled.

**It turned on:** Is consistent, styled output worth a few days and 60 to 100 test updates? (a preference) Yes: One system, two renderings. No: Fix only the worst problems.

**The fact given:** About 3 to 4 builder-days, in three phases: the next steps, the styling, then `list`, help and errors. What agents read changes too (headlines first, `next:` lines), but stays plain text; `--json` doesn't change.

**The agent's case:** The user asked for output that feels like part of the product. The patterns help agents as much as people (a headline first, the next command filled in), and styling costs agents nothing because they never see it.

Answered by GusEllerm on 2026-11-05, through Baesian (card B-eyrt5, revision 1). Filed by claude-code on v1/next, in the deck “What the command line prints”.

The record is in `.baesian/cards/B-eyrt5/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

`baesian init` today:

```
live layer:  .git/baesian/  (shared by every worktree, not committed)
record:      .baesian/  (commit this)
git gate:    pre-commit created, commit-msg created, post-commit created, post-merge created, post-rewrite created in .githooks/
             core.hooksPath set to .githooks (each clone runs `baesian init` once)
AGENTS.md:   instructions created
preferences: none yet. Run `baesian serve`: the client asks about a few example decisions and suggests how much should reach you.
```

Proposed, as an agent reads it (a terminal adds a ✓, bold labels and the commands in colour):

```
set up Baesian in this repo, in shared mode
  live layer:   .git/baesian/  shared by every worktree, never committed
  record:       .baesian/      committed with the code
  git gate:     .githooks/     pre-commit, commit-msg, post-commit, post-merge and post-rewrite
  agents:       AGENTS.md      instructions added
  preferences:  none yet       the client suggests them, from a few example decisions
next: baesian serve  # open the client, and choose how much should reach you
next: git add .baesian .githooks AGENTS.md && git commit -m "Use Baesian"
```

The full comparison, 13 outputs on dark and light terminals: `scratchpad/cli-ux/after.html` on the lead agent's machine.
