---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Coming round on a question of what you value: Count it as a miss (B-ab06a)."
created: 2026-11-10
updated: 2026-11-10
tags:
  - baesian
  - decision
aliases:
  - B-ab06a
card: B-ab06a
revision: 1
title: Coming round on a question of what you value
question: On a card whose crux is a preference, should a blind choice against the agent's pick count as a miss even when you come round to the pick?
answer: Count it as a miss
response: accept
not_chosen:
  - Only overturns count, as now
answered: 2026-11-10T19:58:51.566Z
answered_by: GusEllerm
topic: routing/misses-preference-crux
deck: calibration
level: blocking
reverse: cheap
touches:
  - user-facing
filed: 2026-11-10T19:57:41.093Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-87tkc What counts as a miss on an audit|B-87tkc]]"
---

# Coming round on a question of what you value

On a card whose crux is a preference, should a blind choice against the agent's pick count as a miss even when you come round to the pick?

**Decided:** Count it as a miss, the agent's pick. Then on a preference crux your blind choice is what counts: a choice against the agent's pick is a miss whatever you answer after its case, and rows with many such cards loosen later.

**Not chosen:** Only overturns count, as now. Then a miss stays a final answer against the agent's pick, or one marked “you should have asked me”, on every card (B-87tkc), and coming round is reported beside the misses.

**It turned on:** On a question of what you value, which answer is yours: the one before the agent's case, or the one after? (a preference) The one before: Count it as a miss. The one after: Only overturns count, as now.

**The fact given:** Of 80 blind choices on preference cruxes, 33 went against the agent's pick and 28 of those ended on it. Counting them would add 28 misses to the 10 counted now, across 168 final answers. B-87tkc, which counts only overturns, was decided for every card, before preference cruxes were counted apart.

**The agent's case:** On a question of fact, the agent's case can hold something you lacked, and coming round is being corrected. On what you value it can't, so coming round there is being persuaded, and counting final answers loosens a row faster the better the agent argues.

Answered by GusEllerm on 2026-11-10, through Baesian (card B-ab06a, revision 1). Filed by claude-code on v1/next, in the deck “How Baesian learns from your answers”.

The record is in `.baesian/cards/B-ab06a/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

B-87tkc chose to count only overturns, on the reasoning that a card you came round on would have ended the same way had it been held. The critique ([[Profiles and Collective Steering - Critique]]) measured this repo's record on 5 November: on preference cruxes, blind agreement was at chance (27 of 53; it's 47 of 80 now), and nearly every blind disagreement ended on the agent's pick.

Under the proposal, B-87tkc still stands for cruxes of fact. Both answers are kept on every card either way, so the record can be recounted under either rule.

The agent marks a crux as a preference itself (`crux_preference`), so a preference crux filed as one of fact escapes this. That's the critique's wider point about inputs agents control, not something this card fixes.
