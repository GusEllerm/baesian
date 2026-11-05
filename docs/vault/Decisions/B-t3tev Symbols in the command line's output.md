---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Symbols in the command line's output: Symbols and colour (B-t3tev)."
created: 2026-11-05
updated: 2026-11-05
tags:
  - baesian
  - decision
aliases:
  - B-t3tev
card: B-t3tev
revision: 1
title: Symbols in the command line's output
question: On a terminal, should the command line mark outcomes with symbols (✓ ✗ ! →) as well as colour?
answer: Symbols and colour
response: accept
not_chosen:
  - Colour only
answered: 2026-11-05T19:54:52.731Z
answered_by: GusEllerm
topic: cli/output/symbols
deck: cli-output
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-05T19:52:31.597Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-eyrt5 How the command line's output is laid out|B-eyrt5]]"
---

# Symbols in the command line's output

On a terminal, should the command line mark outcomes with symbols (✓ ✗ ! →) as well as colour?

**Decided:** Symbols and colour, the agent's pick. A headline starts with ✓ (done), ✗ (blocked or failed), ! (needs attention) or → (a next step), in its colour; where the terminal can't show them, ok, x, ! and -> instead. Agents never see either.

**Not chosen:** Colour only. Headlines carry their outcome in colour and words alone. Readers who can't tell red from green, or whose terminal shows no colour, rely on the words, which say it anyway.

**It turned on:** Is a shape beside the colour worth the extra character on every headline? (a preference) Yes: Symbols and colour. No: Colour only.

**The fact given:** Symbols carry the outcome without colour, which helps colour-blind readers and terminals without colour. They appear only on a terminal, never in what agents read.

**The agent's case:** A blocked commit and a passing one look the same today; a ✗ is the one strong signal the audit's proposal adds, and it doesn't rest on colour.

Answered by GusEllerm on 2026-11-05, through Baesian (card B-t3tev, revision 1). Filed by claude-code on v1/next, in the deck “What the command line prints”.

The record is in `.baesian/cards/B-t3tev/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.
