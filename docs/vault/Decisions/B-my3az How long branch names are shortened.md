---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How long branch names are shortened: Seven for IDs, whole words otherwise (B-my3az)."
created: 2026-11-06
updated: 2026-11-06
tags:
  - baesian
  - decision
aliases:
  - B-my3az
card: B-my3az
revision: 1
title: How long branch names are shortened
question: Should the drawer shorten long branch names that share a prefix to seven characters of what differs, words or not?
answer: Seven for IDs, whole words otherwise
response: accept
not_chosen:
  - Seven characters, as now
answered: 2026-11-06T02:42:49.535Z
answered_by: GusEllerm
topic: client/branches/short-names
deck: branches-view
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-05T23:54:12.786Z
filed_by: claude-code
branch: worktree-wf_7ec3a0ab-1e8-8
---

# How long branch names are shortened

Should the drawer shorten long branch names that share a prefix to seven characters of what differs, words or not?

**Decided:** Seven for IDs, whole words otherwise, the agent's pick. A name whose differing part is a hex ID keeps seven characters ('worktree a0bd0dd'); one made of words keeps whole words, up to 28 characters ('feature checkout-and-payments…'). Details show the full name, as now.

**Not chosen:** Seven characters, as now. A name over 20 characters that shares a prefix keeps a word of it and seven characters of the rest: 'feature/checkout-and-payments-refactor' shows as 'feature checkou' in the Now tag, rows, starts and the opening sentence.

**It turned on:** Will people name branches with long shared prefixes, like feature/ or their own name? Yes: Seven for IDs, whole words otherwise. Rarely: Seven characters, as now.

**The fact given:** The rule was built for this repo's worktree-agent-<hex> names. Many teams prefix branches by kind (feature/, fix/) or person (gus/). Nothing overflows either way; the full name is in each detail.

**The agent's case:** Cutting a word mid-way makes a name harder to recognise than it is long.

Answered by GusEllerm on 2026-11-06, through Baesian (card B-my3az, revision 1). Filed by claude-code on worktree-wf_7ec3a0ab-1e8-8, in the deck “The branches panel, redrawn”.

The record is in `.baesian/cards/B-my3az/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

From the sweep's finding IF-16 (a choice: `shortNames()` does what its comment says). Not built in the sweep.
