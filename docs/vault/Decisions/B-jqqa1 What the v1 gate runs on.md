---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "What the v1 gate runs on: Rules over stated facts only (B-jqqa1)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-jqqa1
card: B-jqqa1
revision: 1
title: What the v1 gate runs on
question: Should v1's gate route on rules over each card's stated facts alone, or also use a classifier model for the cards rules can't place well?
answer: Rules over stated facts only
response: accept
not_chosen:
  - Rules plus a classifier
answered: 2026-11-03T01:52:16.701Z
answered_by: Gus Ellerm
topic: routing/gate-mechanism
deck: routing
level: hard
reverse: moderate
touches:
  - dependency
  - security
  - money
filed: 2026-11-03T01:38:35.590Z
filed_by: claude-code
branch: overnight/2026-11-03
---

# What the v1 gate runs on

Should v1's gate route on rules over each card's stated facts alone, or also use a classifier model for the cards rules can't place well?

**Decided:** Rules over stated facts only, the agent's pick. Deterministic, offline and free; the CLI, relay and CI reach the same answer, and verify can recheck it. It can't read nuance. The gate record keeps room for a model later.

**Not chosen:** Rules plus a classifier. A model such as Jev or a Haiku-class one scores cards rules place poorly. More nuance; card text goes to a vendor, and thresholds need your labelled cards and re-tuning per model version.

**It turned on:** Will rules over the stated facts leave many cards they place poorly? Few: Rules over stated facts only. Many: Rules plus a classifier.

**The fact given:** In Claude Code's auto mode a model stage cut false alarms from 8.5% to 0.4% but raised misses from 6.6% to 17%. No model is shown to predict a person's card verdicts. Jev costs about $0.00008 a card.

**First chose:** Rules plus a classifier, then switched once the agent's pick was shown.

**The agent's case:** Rules need no vendor or dependency and can be rechecked by verify; shadow mode shows how many cards they misplace before any model is added.

**Wrong if:** In shadow mode, many cards the rules would hold back are ones you chose against the agent on. **To check:** The shadow report's per-row rate of blind choices against the agent on would-be-held cards.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-jqqa1, revision 1). Filed by claude-code on overnight/2026-11-03, in the deck “Routing and preferences”.

The record is in `.baesian/cards/B-jqqa1/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The research found no classifier validated on whether a person wants to see a card, and Jev's calibration evidence is the vendor's plus one single-author benchmark. Sending card text to TypeSafe or another vendor makes it a sub-processor of code context. Evidence: [[Preference Sliders and the Gate]], section 5. Design: [[Routing and Preferences]], section 2.
