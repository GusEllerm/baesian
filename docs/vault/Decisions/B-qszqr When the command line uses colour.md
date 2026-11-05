---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "When the command line uses colour: The command line decides, plainly for agents (B-qszqr)."
created: 2026-11-05
updated: 2026-11-05
tags:
  - baesian
  - decision
aliases:
  - B-qszqr
card: B-qszqr
revision: 1
title: When the command line uses colour
question: How should the command line decide whether to colour its output?
answer: The command line decides, plainly for agents
response: accept
not_chosen:
  - Node's own defaults
answered: 2026-11-05T19:54:25.584Z
answered_by: GusEllerm
topic: cli/output/colour
deck: cli-output
level: provisional
reverse: cheap
touches:
  - user-facing
  - public-api
filed: 2026-11-05T19:52:04.328Z
filed_by: claude-code
branch: v1/next
---

# When the command line uses colour

How should the command line decide whether to colour its output?

**Decided:** The command line decides, plainly for agents, the agent's pick. Colour only on a terminal, never when an agent's harness runs the command (Claude Code, Codex and others say so in their environment), never under NO_COLOR, even if FORCE_COLOR is also set; FORCE_COLOR turns it on otherwise. Two global flags, --color and --no-color, override all of it. Node's styleText only paints.

**Not chosen:** Node's own defaults. Node's styleText decides: colour on a terminal, off under NO_COLOR, and FORCE_COLOR wins over NO_COLOR, printing a warning when both are set. No flags of Baesian's own. A harness that runs commands in a pseudo-terminal gets colour codes in its text.

**It turned on:** Must an agent's harness never receive colour codes, even when it runs commands in a pseudo-terminal? Yes: The command line decides, plainly for agents. No: harnesses can strip them: Node's own defaults.

**The fact given:** Tested by the audit: Node's styleText colours its output under Claude Code's CLAUDECODE=1 when stdout is a pseudo-terminal. Its stream check exists only from Node 22.8, while Baesian supports Node 22 and later. NO_COLOR's own convention is that it turns colour off whatever else is set.

**The agent's case:** Colour codes in an agent's context are noise it pays for in every read, and the agent can't see the colour anyway. Opting out should always win.

Answered by GusEllerm on 2026-11-05, through Baesian (card B-qszqr, revision 1). Filed by claude-code on v1/next, in the deck “What the command line prints”.

The record is in `.baesian/cards/B-qszqr/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The flags are new public options, so they're part of this card; environment variables alone would leave a person no quick way to see the plain output an agent gets.
