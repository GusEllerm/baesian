---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How a sync is drawn: One drawing (B-gm915)."
created: 2026-11-06
updated: 2026-11-06
tags:
  - baesian
  - decision
aliases:
  - B-gm915
card: B-gm915
revision: 1
title: How a sync is drawn
question: Should a merge from a branch into one that began from it be drawn differently from a merge back?
answer: One drawing
response: accept
not_chosen:
  - A sync drawn its own way
answered: 2026-11-06T02:41:26.883Z
answered_by: GusEllerm
topic: client/branches/sync-drawing
deck: branches-view
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-05T23:54:09.084Z
filed_by: claude-code
branch: worktree-wf_7ec3a0ab-1e8-8
---

# How a sync is drawn

Should a merge from a branch into one that began from it be drawn differently from a merge back?

**Decided:** One drawing, the agent's pick. Every merge is the same solid curve with an arrowhead on its target's line, as now: which way it went is the arrowhead's column and the row's words ('main merged into feat/login').

**Not chosen:** A sync drawn its own way. A merge into a branch that began from the other is drawn apart, a thinner or open-headed curve, with its own entry under 'What the marks mean', so a reader can tell 'main into a branch' from 'a branch into main' without reading the words.

**It turned on:** Can a reader tell a sync from a merge back by the arrowhead's column and the words? (a preference) Yes, that's enough: One drawing. No, it needs its own look: A sync drawn its own way.

**The fact given:** The design loop left sync styling out because its data had none ('Every merge has one drawing, and the arrow gives its direction'). This repo now has three syncs, all fast-forwards of new worktrees to v1/next (a separate card asks whether those are merges at all); a sync with work on both sides, main merged into a feature, is drawn the same way.

**The agent's case:** Syncs are rare once a fresh branch's catch-up isn't recorded; one drawing keeps the key short, and the arrowhead already says which branch received.

Answered by GusEllerm on 2026-11-06, through Baesian (card B-gm915, revision 1). Filed by claude-code on worktree-wf_7ec3a0ab-1e8-8, in the deck “The branches panel, redrawn”.

The record is in `.baesian/cards/B-gm915/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

From the sweep's finding G-11 (a choice: the design loop's D21 and spec section 9). Not built in the sweep.
