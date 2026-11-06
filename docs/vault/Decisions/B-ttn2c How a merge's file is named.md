---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How a merge's file is named: Name it by the target too (B-ttn2c)."
created: 2026-11-06
updated: 2026-11-06
tags:
  - baesian
  - decision
aliases:
  - B-ttn2c
card: B-ttn2c
revision: 1
title: How a merge's file is named
question: Should a merge's file be named by its commit, the branch merged and its target, rather than its commit and the branch merged alone?
answer: Name it by the target too
response: accept
not_chosen:
  - Keep commit and branch
answered: 2026-11-06T02:40:00.753Z
answered_by: GusEllerm
topic: gate/merges/file-names
deck: branches-view
level: provisional
reverse: moderate
touches:
  - schema
  - public-api
filed: 2026-11-05T23:52:53.671Z
filed_by: claude-code
branch: worktree-wf_7ec3a0ab-1e8-8
---

# How a merge's file is named

Should a merge's file be named by its commit, the branch merged and its target, rather than its commit and the branch merged alone?

**Decided:** Name it by the target too, the agent's pick. Then merges/<commit>-<key>.json, the key a hash of the branch and its target. One branch fast-forwarded into two branches at one commit is two files, on every machine and the relay. The relay checks the new name on upload. Files already written keep their old names; the panel counts one record found under both names once.

**Not chosen:** Keep commit and branch. The first merge of a branch at a commit is the only one kept: a second, into another branch at the same commit, is dropped on the machine that found it, and replaced by the first wherever they meet on the relay.

**It turned on:** Can one branch, at one commit, merge into two different branches? Yes, it happens: Name it by the target too. Not in practice: Keep commit and branch.

**The fact given:** Yes, by fast-forward or rebase: both land at the merged branch's own commit. Two builder worktrees started from one v1/next tip each record 'v1/next merged into worktree' at that commit; a branch fast-forwarded into main and into a release branch does too. With today's name the second is lost, on its machine and on the relay (reproduced in the sweep, and through the relay's upload).

**The agent's case:** A merge is a branch into a target at a commit: naming it by all three is what makes the same merge one file, and two merges two. It's a hash, so no name needs escaping.

Answered by GusEllerm on 2026-11-06, through Baesian (card B-ttn2c, revision 1). Filed by claude-code on worktree-wf_7ec3a0ab-1e8-8, in the deck “The branches panel, redrawn”.

The record is in `.baesian/cards/B-ttn2c/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Built on the sweep's branch, as the card says (`mergeFile()` in src/store.ts, the upload check in service/src/uploads.ts), with a test that fails before it: one branch fast-forwarded into main and into release records two merges. Under D108 nothing old is migrated: files already on machines and the relay keep the names they had, and the panel counts a record found under both names once (`mergeKey()` in the client).
