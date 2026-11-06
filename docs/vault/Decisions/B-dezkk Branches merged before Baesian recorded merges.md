---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Branches merged before Baesian recorded merges: The history scan finds them (B-dezkk)."
created: 2026-11-06
updated: 2026-11-06
tags:
  - baesian
  - decision
aliases:
  - B-dezkk
card: B-dezkk
revision: 1
title: Branches merged before Baesian recorded merges
question: Should a one-time scan record merges git shows but no hook saw (made before the merge hooks existed), so their branches aren't drawn as loose?
answer: The history scan finds them
response: accept
not_chosen:
  - Leave them loose, as now
answered: 2026-11-06T02:43:44.629Z
answered_by: GusEllerm
topic: gate/merges/before-hooks
deck: branches-view
level: provisional
reverse: cheap
touches:
  - user-facing
  - schema
filed: 2026-11-05T23:54:29.609Z
filed_by: claude-code
branch: worktree-wf_7ec3a0ab-1e8-8
---

# Branches merged before Baesian recorded merges

Should a one-time scan record merges git shows but no hook saw (made before the merge hooks existed), so their branches aren't drawn as loose?

**Decided:** The history scan finds them, the agent's pick. The history scan planned for first link also records, once, a merge for each branch whose citing commits reached another by a merge commit no hook saw, at that commit, as a pull would. aaba362 is drawn merged, not loose.

**Not chosen:** Leave them loose, as now. A branch merged before the hooks existed has commits but no record: it's drawn loose, in the column after the lanes, 'no cards of its own', with nothing inferred (B-w41p7 chose recording over inferring).

**It turned on:** Is a merge read from git's ancestry once, after the fact, as good as one a hook saw? Yes, for the past: The history scan finds them. No: only what was seen: Leave them loose, as now.

**The fact given:** In this repo one branch is drawn loose: worktree-agent-aaba362's two commits (339af8f, 0d27b82, each citing a card) were merged into overnight/2026-11-03 at 377ec9c on 2 Nov, then into main at f15697e, before the hooks were added. D108 decided not to migrate old records. The scan would read merge commits' parents, which is what the pull path already does for merges made elsewhere.

**The agent's case:** A merge commit is a record git made; reading it once for the past is what a pull does for merges made on GitHub.

Answered by GusEllerm on 2026-11-06, through Baesian (card B-dezkk, revision 1). Filed by claude-code on worktree-wf_7ec3a0ab-1e8-8, in the deck “The branches panel, redrawn”.

The record is in `.baesian/cards/B-dezkk/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

From the sweep's finding D11 (a choice: records before D181 were backfilled once; nothing infers from git's ancestry). Not built in the sweep.
