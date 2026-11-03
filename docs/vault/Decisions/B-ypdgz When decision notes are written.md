---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "When decision notes are written: In pre-commit and baesian sync (B-ypdgz)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-ypdgz
card: B-ypdgz
revision: 1
title: When decision notes are written
question: Should the vault's decision and rule notes be written by the pre-commit hook, as the record is, or only by a command someone runs?
answer: In pre-commit and baesian sync
response: accept
not_chosen:
  - Only by a command someone runs
answered: 2026-11-03T04:12:33.312Z
answered_by: Gus Ellerm
topic: vault/note-timing
deck: vault-adapter
level: blocking
reverse: cheap
touches:
  - user-facing
filed: 2026-11-03T03:51:55.484Z
filed_by: claude-code
branch: v1/next
---

# When decision notes are written

Should the vault's decision and rule notes be written by the pre-commit hook, as the record is, or only by a command someone runs?

**Decided:** In pre-commit and baesian sync, the agent's pick. Each commit brings the vault up to date with its record: a note for each resolved card it holds that has none, staged with it. Notes can arrive in an unrelated commit, as new verdicts already do.

**Not chosen:** Only by a command someone runs. Notes appear when a person or agent runs a new command, in a commit they choose. The vault can lag the record, and baesian verify could warn in CI when it does.

**It turned on:** Should every commit's vault agree with its record, or may it lag until someone asks? If every commit should agree: In pre-commit and baesian sync. If it may lag: Only by a command someone runs.

**The fact given:** The pre-commit hook already copies new verdicts into .baesian/ in whichever commit comes next (D37). Baesian's part of the hook runs before livedocs', so livedocs would stamp notes it writes in the same commit. The client never writes into a working tree (D34).

**The agent's case:** It's the git phase every agent and person shares (D27), it puts each note on every branch whose record holds the card, as D43 asks, and nobody has to remember a step.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-ypdgz, revision 1). Filed by claude-code on v1/next, in the deck “The vault adapter”. Context: [[Vault Adapter]], [[Baesian Design]].

The record is in `.baesian/cards/B-ypdgz/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Writing from the record, in the hook that already updates the record, means a note is always on the branch that holds its card, and two branches write the same bytes. Turning the adapter on writes notes for every decision already made. The details, and the two other moments considered, are in [[Vault Adapter#1. When notes are written]].
