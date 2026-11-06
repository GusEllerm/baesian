---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "What the drawer's opening counts count: Say what each counts (B-zshw5)."
created: 2026-11-06
updated: 2026-11-06
tags:
  - baesian
  - decision
aliases:
  - B-zshw5
card: B-zshw5
revision: 1
title: What the drawer's opening counts count
question: Should the drawer's opening sentence say that its count of merged branches includes branches with no cards?
answer: Say what each counts
response: accept
not_chosen:
  - As now
answered: 2026-11-06T02:42:57.056Z
answered_by: GusEllerm
topic: client/branches/status-counts
deck: branches-view
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-05T23:54:25.086Z
filed_by: claude-code
branch: worktree-wf_7ec3a0ab-1e8-8
---

# What the drawer's opening counts count

Should the drawer's opening sentence say that its count of merged branches includes branches with no cards?

**Decided:** Say what each counts, the agent's pick. Then '150 cards on 9 branches … 26 branches have merged, 19 of them with commits but no cards.' The counts are the same; the words say what they count.

**Not chosen:** As now. Then '150 cards on 9 branches: … 26 branches have merged.' The first counts branches with cards, the second every branch drawn that merged.

**It turned on:** Does '150 cards on 9 branches … 26 branches have merged' read as a contradiction? (a preference) Yes: Say what each counts. No: As now.

**The fact given:** In this repo's history 26 branches have merged, and 19 of them are worktrees with commits citing cards but no cards of their own. The footer already says how many branches have commits only.

**The agent's case:** More branches merging than the sentence says exist stops a reader; four words fix it.

Answered by GusEllerm on 2026-11-06, through Baesian (card B-zshw5, revision 1). Filed by claude-code on worktree-wf_7ec3a0ab-1e8-8, in the deck “The branches panel, redrawn”.

The record is in `.baesian/cards/B-zshw5/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

From the sweep's finding IF-17 (a choice: Client Build item 26 shows the sentence as built). Not built in the sweep.
