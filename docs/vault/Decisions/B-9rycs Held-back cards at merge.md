---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Held-back cards at merge: Held counts as settled at merge (B-9rycs)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-9rycs
card: B-9rycs
revision: 1
title: Held-back cards at merge
question: When the gate holds a card back, may its branch merge without your answer, or must every held card be answered or deferred first?
answer: Held counts as settled at merge
response: accept
not_chosen:
  - Answer held cards before merge
answered: 2026-11-03T01:55:52.991Z
answered_by: Gus Ellerm
topic: routing/held-at-merge
deck: routing
level: blocking
reverse: moderate
touches:
  - schema
filed: 2026-11-03T01:38:35.809Z
filed_by: claude-code
branch: overnight/2026-11-03
---

# Held-back cards at merge

When the gate holds a card back, may its branch merge without your answer, or must every held card be answered or deferred first?

**Decided:** Held counts as settled at merge, the agent's pick. A new held status, set by the gate record, which the merge gate accepts. You can answer any held card later, and audits do. Revises D31; the gate writes no verdict, so D32 stands.

**Not chosen:** Answer held cards before merge. D31 stands. Holding back only moves a card out of the live queue into a batch you clear before merge, so the agent isn't interrupted but every decision is still answered.

**It turned on:** Do you want to answer every filed decision on a branch before it merges? (a preference) No, only what my settings ask for: Held counts as settled at merge. Yes, every one: Answer held cards before merge.

**The fact given:** D31 requires every card a branch cites to be resolved or deferred before merge, and only the client resolves (D32). Today nothing is held back, so every filed card needs your answer.

**The agent's case:** If held cards still need answers at merge, holding back saves interruptions but not your time, which is most of what sliders are for.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-9rycs, revision 1). Filed by claude-code on overnight/2026-11-03, in the deck “Routing and preferences”.

The record is in `.baesian/cards/B-9rycs/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Under P14, a held card is filed and committed like any other; the agent proceeds as on a provisional card and cites it in its commits. The question is only what the merge gate (checkMerge) asks of it. Design: [[Routing and Preferences]], section 3.
