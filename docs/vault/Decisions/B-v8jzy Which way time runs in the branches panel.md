---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Which way time runs in the branches panel: A vertical drawer on a computer (B-v8jzy)."
created: 2026-11-05
updated: 2026-11-05
tags:
  - baesian
  - decision
aliases:
  - B-v8jzy
card: B-v8jzy
revision: 2
title: Which way time runs in the branches panel
question: On a computer, should the branches history be the vertical list in a drawer you open beside the desk, or time running across in lanes?
answer: A vertical drawer on a computer
response: accept
not_chosen:
  - Time running across on a computer
answered: 2026-11-05T20:35:54.080Z
answered_by: GusEllerm
topic: client/branches/orientation
deck: branches-view
level: provisional
reverse: moderate
touches:
  - user-facing
filed: 2026-11-05T20:15:42.752Z
filed_by: claude-code
branch: v1/next
---

# Which way time runs in the branches panel

On a computer, should the branches history be the vertical list in a drawer you open beside the desk, or time running across in lanes?

**Decided:** A vertical drawer on a computer, the agent's pick. One drawing everywhere. On a computer, a Branches button in the header, the menu item, or the B key opens a drawer from the right, 480 px wide (wider, 880 px, puts each row on one line); the desk moves aside and stays whole, so 'Open it on the desk' shows the card there. On a phone the same list fills the screen. The across view isn't built.

**Not chosen:** Time running across on a computer. Two drawings from one model: lanes side by side over time on a computer, as the first design had it, and the vertical list on phones and touch screens.

**It turned on:** Is a list you can read row by row worth losing the side-by-side view of parallel branches? (a preference) Yes: A vertical drawer on a computer. No: Time running across on a computer.

**The fact given:** You said the vertical view reads more clearly, and asked to see it run on a computer: the demo is drawer/index.html in the design loop's folder. What the drawer does worse, by its builder: with parallel worktrees their rows interleave and you tell them apart by each row's text, not by stacked lanes; rows are evenly spaced, so long gaps in time disappear; there's no week at a glance. With this repo's history it needs 3 gutter lines.

**The agent's case:** The panel is mostly read to answer 'what happened, and what came of my answers', which a list answers row by row, and one drawing is less to maintain. B is a new key the client doesn't use yet.

Answered by GusEllerm on 2026-11-05, through Baesian (card B-v8jzy, revision 2). Filed by claude-code on v1/next, in the deck “The branches panel, redrawn”.

The record is in `.baesian/cards/B-v8jzy/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

To try it: `open .../scratchpad/branches-loop/drawer/index.html` (and `variant-parallel.html` beside it, with four worktrees at once).
