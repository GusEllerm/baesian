---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Finding a card's commits after history is rewritten: Search the history for the card's trailer (B-9v5xj)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-9v5xj
card: B-9v5xj
revision: 1
title: Finding a card's commits after history is rewritten
question: When a rebase or a squash merge rewrites history, how should Baesian find the commits that built on a card?
answer: Search the history for the card's trailer
response: accept
not_chosen:
  - Keep a fingerprint in each ledger entry
answered: 2026-11-03T01:58:34.619Z
answered_by: Gus Ellerm
topic: ledger/rewritten-history
deck: stability
level: provisional
reverse: cheap
touches:
  - schema
filed: 2026-11-03T00:49:56.408Z
filed_by: claude-code
branch: overnight/2026-11-03
---

# Finding a card's commits after history is rewritten

When a rebase or a squash merge rewrites history, how should Baesian find the commits that built on a card?

**Decided:** Search the history for the card's trailer, the agent's pick. Then when a brief needs them, Baesian looks for `Baesian-Card: <id>` in the history of the branch and the branch it merged into, and lists what it finds; ledger entries whose commit is gone are marked as rewritten. No format change.

**Not chosen:** Keep a fingerprint in each ledger entry. Then each ledger entry also records the commit's patch-id, which survives a rebase, and a post-rewrite hook adds entries for rewritten commits. Links survive rebases even if a message loses its trailer, but a squash still breaks them. A ledger format change.

**It turned on:** Will the commits that end up on main keep their `Baesian-Card` trailers? If they will: Search the history for the card's trailer. If they won't, and rebases are the rewrite that matters: Keep a fingerprint in each ledger entry.

**The fact given:** GitHub builds a squash commit's message from a repo setting: by default the pull request's title and its list of commits; it can be set to the title alone, or the title and description, which leave the commits' trailers out. GitHub's docs don't say whether the default keeps trailers. A rebase keeps each commit's message. GitHub runs no hooks when it merges. Today a rework brief (D81) can list commits that no longer exist after either.

**The agent's case:** The trailers are already what says a commit builds on a card. Reading them where they are survives rebases, and squashes that keep the commits' messages, with no new format, and the ledger still records what was committed.

**Wrong if:** the repos that use Baesian mostly squash with the title-only or title-and-description setting. **To check:** a squash merge on GitHub of a branch with two Baesian-Card commits, under each setting.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-9v5xj, revision 1). Filed by claude-code on overnight/2026-11-03, in the deck “Stability before v1”.

The record is in `.baesian/cards/B-9v5xj/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Design only: nothing is built for this card overnight. Found by the agent while reviewing the ledger (2026-11-01), parked until now. Ledger entries are written by the post-commit hook from each commit's `Baesian-Card` trailers (D15, D120); rework briefs (D81) and the client's reveal list them.
