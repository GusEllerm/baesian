---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "A new branch moved up to another's tip: Where it began (B-c4efj)."
created: 2026-11-06
updated: 2026-11-06
tags:
  - baesian
  - decision
aliases:
  - B-c4efj
card: B-c4efj
revision: 1
title: A new branch moved up to another's tip
question: When a branch with nothing of its own yet is fast-forwarded to another branch's tip, should Baesian record it as that branch merged into it, or as where the new branch began?
answer: Where it began
response: accept
not_chosen:
  - A merge, as now
answered: 2026-11-06T02:41:01.654Z
answered_by: GusEllerm
topic: gate/merges/branch-starts
deck: branches-view
level: provisional
reverse: cheap
touches:
  - user-facing
  - schema
filed: 2026-11-05T23:54:05.824Z
filed_by: claude-code
branch: worktree-wf_7ec3a0ab-1e8-8
---

# A new branch moved up to another's tip

When a branch with nothing of its own yet is fast-forwarded to another branch's tip, should Baesian record it as that branch merged into it, or as where the new branch began?

**Decided:** Where it began, the agent's pick. No merge is recorded when the branch that moved has no card or citing commit of its own yet: it began there, and the drawer shows its dashed start once. One with work of its own brought up to another is still a merge.

**Not chosen:** A merge, as now. Each is recorded 'v1/next merged into worktree X', with v1/next's cards, and drawn as an arrowhead into the worktree just above its dashed start. The same catch-up by rebase or reset, or a worktree made from v1/next, records nothing.

**It turned on:** Is a fresh branch catching up to another before any work of its own a merge? (a preference) No: it's where the branch began: Where it began. Yes: git moved the ref, so record it: A merge, as now.

**The fact given:** This repo has three: fe44812 into worktree ac8eb81 (5 cards), 23df187 into acdb431 (10) and 952d56b into ad02aa3 (10), each a builder's worktree made from origin/main (d737b71) and fast-forwarded to v1/next as it started; all their cards were filed on v1/next. Each draws as a merge directly above the same worktree's start from v1/next: one moment, two drawings. They recur for every builder started from a stale base since the post-merge hook was added (4f1b43c). The records also make v1/next's end read 'No merge recorded after Thu 5 Nov, 15:02' (a separate card asks whether such a merge ends anything).

**The agent's case:** Git can tell: the branch had no card and no citing commit of its own, and where it was is on the other branch's own line. Recording a start as a merge draws the start twice, and the drawn merge says the worktree took ten cards it never had.

Answered by GusEllerm on 2026-11-06, through Baesian (card B-c4efj, revision 1). Filed by claude-code on worktree-wf_7ec3a0ab-1e8-8, in the deck “The branches panel, redrawn”.

The record is in `.baesian/cards/B-c4efj/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

From the sweep's findings G-5 and D2 (choices: the code does what B-w41p7 built, a fast-forward to a branch is that branch's merge), and what follows from them, G-4 (the doubled drawing) and IF-18 (a merge's note says a branch's start is drawn "just before its first card or commit", where it's drawn just before this merge in). Not built in the sweep: the sweep changed no choice. Whoever builds it follows your answer: `findMerges()` in src/merges.ts would skip a named fast-forward whose target had nothing of its own, and the note's words would follow.
