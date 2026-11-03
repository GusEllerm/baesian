---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "What a public repo's decision record keeps: The full text, with a warning at filing (B-vqn69)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-vqn69
card: B-vqn69
revision: 1
title: What a public repo's decision record keeps
question: In a public repo, should the committed decision record keep each card's full text, or only what was decided?
answer: The full text, with a warning at filing
response: accept
not_chosen:
  - Only what was decided
answered: 2026-11-03T01:51:11.750Z
answered_by: Gus Ellerm
topic: release/public-record
deck: release
level: hard
reverse: one-way
touches:
  - publishes
  - security
filed: 2026-11-03T01:31:28.397Z
filed_by: claude-code
branch: overnight/2026-11-03
---

# What a public repo's decision record keeps

In a public repo, should the committed decision record keep each card's full text, or only what was decided?

**Decided:** The full text, with a warning at filing, the agent's pick. Then the record stays as it is: every card, its reasons and the reviewer's comments, committed with the code; `baesian file` warns on likely secrets, and the instructions tell agents and reviewers it's public.

**Not chosen:** Only what was decided. Then a public repo's record keeps each question, its two options and the answer; reasons, bodies and comments stay in the live layer and on the hosted service, so history shows what was decided, not the discussion.

**It turned on:** Should a repo's readers be able to see why each decision went the way it did? (a preference) If they should: The full text, with a warning at filing. If only the people working on it should: Only what was decided.

**The fact given:** The record is pushed with the code. It holds what agents wrote, sometimes error output and file paths, and the reviewer's comments, verbatim. Git keeps every pushed version, so pushed text can't be taken back.

**First chose:** Only what was decided, then switched once the agent's pick was shown.

**The agent's case:** The reasons are the record's value: a decision without them can't be checked or revisited. Warnings and plain instructions address what shouldn't be there.

**Wrong if:** agents put secrets or private details into cards despite the warning. **To check:** a scan of this repo's record for paths, tokens and output pasted into cards.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-vqn69, revision 1). Filed by claude-code on overnight/2026-11-03, in the deck “Before release: privacy and security”.

The record is in `.baesian/cards/B-vqn69/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

From the overnight privacy and security review: see Reviews/2026-11-03 Privacy and Security, section E1. Best settled with the hosted service's design, since the relay (D127) already holds the full text.
