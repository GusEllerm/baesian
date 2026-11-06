---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "A branch pushed to the remote's default branch: Record it at the push (B-h7rsv)."
created: 2026-11-06
updated: 2026-11-06
tags:
  - baesian
  - decision
aliases:
  - B-h7rsv
card: B-h7rsv
revision: 1
title: A branch pushed to the remote's default branch
question: Should pushing one branch to the remote's default branch (git push origin v1/next:main) be recorded as that branch merged into it?
answer: Record it at the push
response: accept
not_chosen:
  - Only when main moves here, as now
answered: 2026-11-06T02:40:20.523Z
answered_by: GusEllerm
topic: gate/merges/pushes
deck: branches-view
level: provisional
reverse: moderate
touches:
  - user-facing
  - infra
filed: 2026-11-05T23:54:28.127Z
filed_by: claude-code
branch: worktree-wf_7ec3a0ab-1e8-8
---

# A branch pushed to the remote's default branch

Should pushing one branch to the remote's default branch (git push origin v1/next:main) be recorded as that branch merged into it?

**Decided:** Record it at the push, the agent's pick. A pre-push hook, added to Baesian's hook block, records 'v1/next merged into main' when a push moves the remote's default branch to a branch's tip, as a fast-forward is. The drawer shows it once it's pushed.

**Not chosen:** Only when main moves here, as now. Pushes are never recorded: v1/next stays drawn as open, 'No merge recorded', until someone brings local main up to it, which records one merge of v1/next into main (the sweep fixed that recording: it made 28 before).

**It turned on:** Is pushing a branch to the remote's main how merges happen in your repos? Yes, often: Record it at the push. Rarely: main moves by merges: Only when main moves here, as now.

**The fact given:** In this repo origin/main moves only by 'update by push' (its reflog): v1/next is pushed to main, and local main is at f15697e, two days behind. Baesian's hooks are pre-commit, commit-msg, post-commit, post-merge and post-rewrite: none sees a push. A pre-push hook runs before the push lands and can be bypassed with --no-verify; GitHub's own merges are found at the next pull, as now.

**The agent's case:** It's how this repo ships, and the drawer otherwise shows its main branch as never merged.

Answered by GusEllerm on 2026-11-06, through Baesian (card B-h7rsv, revision 1). Filed by claude-code on worktree-wf_7ec3a0ab-1e8-8, in the deck “The branches panel, redrawn”.

The record is in `.baesian/cards/B-h7rsv/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

From the sweep's finding D10 (a choice: B-jr8mk chose the remote's HEAD as the trunk; merges are found only by the hooks that run). Not built in the sweep.
