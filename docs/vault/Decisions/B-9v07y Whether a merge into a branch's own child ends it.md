---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Whether a merge into a branch's own child ends it: Never ends it (B-9v07y)."
created: 2026-11-06
updated: 2026-11-06
tags:
  - baesian
  - decision
aliases:
  - B-9v07y
card: B-9v07y
revision: 1
title: Whether a merge into a branch's own child ends it
question: Should a merge from a branch into one that began from it (a sync) end the branch it came from, when nothing happens on it after?
answer: Never ends it
response: accept
not_chosen:
  - A last merge out ends it, as now
answered: 2026-11-06T02:41:11.527Z
answered_by: GusEllerm
topic: client/branches/sync-ends
deck: branches-view
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-05T23:54:07.347Z
filed_by: claude-code
branch: worktree-wf_7ec3a0ab-1e8-8
---

# Whether a merge into a branch's own child ends it

Should a merge from a branch into one that began from it (a sync) end the branch it came from, when nothing happens on it after?

**Decided:** Never ends it, the agent's pick. A merge into a branch that began from it ends nothing: v1/next keeps its Now tag, stays its worktrees' parent, isn't counted as merged, and its end words don't cite it. Any other last merge out ends its branch, as now.

**Not chosen:** A last merge out ends it, as now. Whatever the target, a branch's last merge out ends it if nothing follows: a parent synced into a child is drawn merged into it, the child as its parent, and later starts guessed from a sibling, until the parent moves again.

**It turned on:** Can a merge into a branch that began from you be the end of you? (a preference) No: Never ends it. Yes, if nothing follows: A last merge out ends it, as now.

**The fact given:** On 2026-11-05 from 13:56 to 14:16 and from 14:37 to 15:27 (local) the drawer drew v1/next as merged into a worktree, inverted: v1/next's line ended at the sync, its Now tag went, the status said '24/25 branches have merged', and the next worktree 'began, from worktree acdb431'. The records were fast-forwards of new worktrees to v1/next (a separate card asks whether those are merges at all); a real sync, main merged into a feature with work of its own, would do the same if main then went quiet. Client Build item 26 says the rule as built: 'whatever the target'.

**The agent's case:** The branch a sync comes from is the older, longer-lived one; its going quiet for an hour isn't its end. The rule as built was written for a lane merged into an older or newer peer, not into its own child.

Answered by GusEllerm on 2026-11-06, through Baesian (card B-9v07y, revision 1). Filed by claude-code on worktree-wf_7ec3a0ab-1e8-8, in the deck “The branches panel, redrawn”.

The record is in `.baesian/cards/B-9v07y/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

From the sweep's findings G-1, G-10 and IF-9 (choices: the code follows Client Build item 26's rule). Not built in the sweep. Whoever builds it follows your answer: `branchModel()` in client/src/lanes.ts would skip, for a lane's end and its "after" words, a merge out into a lane whose parent chain leads back to it.
