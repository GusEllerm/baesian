---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "What a ledger entry keeps: Just the commit (B-93n5e)."
created: 2026-11-02
updated: 2026-11-02
tags:
  - baesian
  - decision
aliases:
  - B-93n5e
card: B-93n5e
revision: 1
title: What a ledger entry keeps
question: Should each ledger entry keep the list of files its commit changed?
answer: Just the commit
response: accept
not_chosen:
  - Keep the file list
answered: 2026-11-02T03:38:26.639Z
answered_by: Gus Ellerm
topic: formats/ledger-entry
deck: file-formats
level: blocking
reverse: cheap
touches:
  - schema
filed: 2026-11-02T03:34:04.964Z
filed_by: claude-code
branch: main
---

# What a ledger entry keeps

Should each ledger entry keep the list of files its commit changed?

**Decided:** Just the commit, the agent's pick. An entry names the card, the branch and the commit, in a few lines. What the commit changed comes from git, while the commit exists.

**Not chosen:** Keep the file list. As now: each entry also lists every file its commit changed, so the record still says what was built on a decision after the commit itself is gone.

**It turned on:** Will you need to know what a commit changed after the commit itself is gone? No: git has it: Just the commit. Yes: branches get squashed or rebased: Keep the file list.

**The fact given:** A ledger entry is written for each card a commit cites, and today lists every file the commit changed: the last commit here cited four cards, so its list of 49 files was written four times. Nothing in Baesian reads the list; the gate and the agent's briefs use only the commit's hash. A squash merge or a rebase replaces a commit's hash, and the old commit can disappear once its branch is deleted. This repo commits straight to main.

**The agent's case:** Nothing reads the list, it's repeated for every card a commit cites, and the record is pushed with the repo. The vault adapter can ask git for what a commit changed.

Answered by Gus Ellerm on 2026-11-02, through Baesian (card B-93n5e, revision 1). Filed by claude-code on main, in the deck “The remaining file formats, before 0.1.0”.

The record is in `.baesian/cards/B-93n5e/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The ledger is how Baesian knows which commits built on which decisions (a `Baesian-Card` trailer on the commit writes an entry). The commit's hash is what the gate prints, and what an agent's brief lists when an answer changes after commits were built on it.

Squash merges and rebases are a separate problem for the hash itself, which would point at a commit that's gone. That's parked for the review just before publishing, since dogfooding stays on this repo until v1.
