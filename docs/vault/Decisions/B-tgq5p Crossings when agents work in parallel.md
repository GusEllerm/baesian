---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Crossings when agents work in parallel: Fixed rows, gaps where curves cross (B-tgq5p)."
created: 2026-11-05
updated: 2026-11-05
tags:
  - baesian
  - decision
aliases:
  - B-tgq5p
card: B-tgq5p
revision: 1
title: Crossings when agents work in parallel
question: When parallel branches can't all sit next to the lane they came from, should rows stay fixed and curves pass over other branches with a gap, or should branches move rows over time so nothing crosses?
answer: Fixed rows, gaps where curves cross
response: accept
not_chosen:
  - Rows that move
answered: 2026-11-05T20:18:03.654Z
answered_by: GusEllerm
topic: client/branches/crossings
deck: branches-view
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-05T20:15:51.034Z
filed_by: claude-code
branch: v1/next
---

# Crossings when agents work in parallel

When parallel branches can't all sit next to the lane they came from, should rows stay fixed and curves pass over other branches with a gap, or should branches move rows over time so nothing crosses?

**Decided:** Fixed rows, gaps where curves cross, the agent's pick. A branch keeps its row from start to merge. Where a fork or merge must pass another live branch, its curve widens with the rows it spans and the branch it passes shows a small gap. Shortest branches sit nearest their parent; held and unmerged ones go outermost.

**Not chosen:** Rows that move. A branch moves to whichever row is free as others start and end, so no curve ever crosses a live branch, but its line steps sideways as you scroll.

**It turned on:** Is a straight line per branch worth an occasional crossing? (a preference) Yes: Fixed rows, gaps where curves cross. No: Rows that move.

**The fact given:** Measured on made-up histories: four parallel worktrees with held branches give 4 crossings with fixed rows, the minimum when their times overlap; six branches alive at once give none. This repo's history has no crossings either way.

**The agent's case:** A branch that keeps its line is easy to follow by eye; crossings are rare, marked, and only where branches really ran at once.

Answered by GusEllerm on 2026-11-05, through Baesian (card B-tgq5p, revision 1). Filed by claude-code on v1/next, in the deck “The branches panel, redrawn”.

The record is in `.baesian/cards/B-tgq5p/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.
