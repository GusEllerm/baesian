---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "What an audit card shows before you choose: Choose first, then see what's built (B-wcbec)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-wcbec
card: B-wcbec
revision: 1
title: What an audit card shows before you choose
question: On an audit card, should you see which option the agent took and what's built before you choose, or only after?
answer: Choose first, then see what's built
response: accept
not_chosen:
  - Show the agent's option first, as now
answered: 2026-11-03T01:57:08.356Z
answered_by: Gus Ellerm
topic: routing/audit-display
deck: routing
level: blocking
reverse: cheap
touches:
  - user-facing
  - schema
filed: 2026-11-03T01:38:35.919Z
filed_by: claude-code
branch: overnight/2026-11-03
---

# What an audit card shows before you choose

On an audit card, should you see which option the agent took and what's built before you choose, or only after?

**Decided:** Choose first, then see what's built, the agent's pick. The audit hides the agent's option until you choose, then shows it and what's built, and you decide whether to overturn. Both answers are kept. Revises D86 for audit cards only.

**Not chosen:** Show the agent's option first, as now. D86 stands: the option taken and "Already built" show as facts, and you answer "overturn?" with them in view. One step, but your choice is made knowing what's done.

**It turned on:** Should an audit measure whether you'd have chosen differently, or only whether it's worth overturning now? Whether I'd have chosen differently: Choose first, then see what's built. Only whether to overturn now: Show the agent's option first, as now.

**The fact given:** Seeing an automated choice first anchors people on it. The gate's miss rate is the share of held cards you'd have chosen differently on. What's built bears on the cost of overturning.

**The agent's case:** The two steps keep the miss measure unanchored and still put what's built in front of you before anything is overturned, as D88 does for switching.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-wcbec, revision 1). Filed by claude-code on overnight/2026-11-03, in the deck “Routing and preferences”.

The record is in `.baesian/cards/B-wcbec/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

An audit card is a held card drawn at random and brought back to your queue. D86 hides the agent's pick on every card, but keeps an audit card's option and "Already built" visible because they're facts. The research's measure of what the gate misses assumes a blind choice. Design: [[Routing and Preferences]], section 3. Evidence: [[Preference Sliders and the Gate]], decision 7.
