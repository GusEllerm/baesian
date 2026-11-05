---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "What a merge record says it brought: Record it (B-w41p7)."
created: 2026-11-05
updated: 2026-11-05
tags:
  - baesian
  - decision
aliases:
  - B-w41p7
card: B-w41p7
revision: 1
title: What a merge record says it brought
question: Should the command line record everything a merge actually brought into a branch, including a fast-forward that follows it, or should the panel infer it?
answer: Record it
response: accept
not_chosen:
  - The panel infers it
answered: 2026-11-05T20:17:26.044Z
answered_by: GusEllerm
topic: gate/merges/fast-forwards
deck: branches-view
level: provisional
reverse: moderate
touches:
  - schema
filed: 2026-11-05T20:15:46.951Z
filed_by: claude-code
branch: v1/next
---

# What a merge record says it brought

Should the command line record everything a merge actually brought into a branch, including a fast-forward that follows it, or should the panel infer it?

**Decided:** Record it, the agent's pick. The merge record names the tip that landed, and a later fast-forward of the same branch into the same target updates it (or adds a record), checked against git's ancestry when it's written. The panel draws what's recorded, with no guess.

**Not chosen:** The panel infers it. The merge record stays as it is, and the panel draws commits made within 60 seconds after a merge as part of it, saying so in their callout.

**It turned on:** Should the panel ever draw a merge Baesian didn't record? No: Record it. Yes, labelled as inferred: The panel infers it.

**The fact given:** Found by the loop: git shows f823982 and c15577a were fast-forwards into v1/next, and the commits made 25 s and 17 s later (91e3781, d737b71) reached v1/next through a second fast-forward the merge hook didn't record. The record format changes either way only with the proposal.

**The agent's case:** A merge record that misses what landed makes every view built on it guess; the hook already runs at the moment it can see the truth.

Answered by GusEllerm on 2026-11-05, through Baesian (card B-w41p7, revision 1). Filed by claude-code on v1/next, in the deck “The branches panel, redrawn”.

The record is in `.baesian/cards/B-w41p7/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.
