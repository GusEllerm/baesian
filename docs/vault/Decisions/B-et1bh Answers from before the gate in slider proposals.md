---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: 'Answers from before the gate in slider proposals: Count them, as "Today" showed them (B-et1bh).'
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-et1bh
card: B-et1bh
revision: 1
title: Answers from before the gate in slider proposals
question: Should answers on cards filed before the gate count toward Baesian's slider proposals?
answer: Count them, as "Today" showed them
response: accept
not_chosen:
  - Count only cards the gate saw
answered: 2026-11-03T16:57:40.762Z
answered_by: Gus Ellerm
topic: routing/slider-history
deck: routing
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-03T15:56:00.271Z
filed_by: claude-code
branch: v1/next
---

# Answers from before the gate in slider proposals

Should answers on cards filed before the gate count toward Baesian's slider proposals?

**Decided:** Count them, as "Today" showed them, the agent's pick. Cards filed before the gate count on their rows at "tell me but carry on", as "Today" showed them. Rows with 29 kept picks in a row, or a miss, get a proposal with your first answer after M8 is merged.

**Not chosen:** Count only cards the gate saw. The record starts empty at the merge. No proposal comes until 29 new final answers on a row, or a miss on one, are given on cards filed through the gate.

**It turned on:** Do the answers you gave before the gate say how you'd want each row set now? They do: Count them, as "Today" showed them. Not without the gate: Count only cards the gate saw.

**The fact given:** Of this repo's 61 answers with a blind choice, all but one final answer kept the agent's pick (card B-y6jn6). Those cards were all shown, under the rows "Today" sets, and agents filed most of them as blocking or hard. A proposal is a card you accept or decline; Baesian never moves a row itself, and declining one waits for new answers on the row.

**First chose:** Count only cards the gate saw, then switched once the agent's pick was shown.

**The agent's case:** They were answered under the very setting the proposals start from, and the report counts them too (as beforeGate), so leaving them out would waste the record the proposals were decided on.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-et1bh, revision 1). Filed by claude-code on v1/next, in the deck “Routing and preferences”.

The record is in `.baesian/cards/B-et1bh/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Built this way in M8a (`countedCards()`), so on the first answer after M8 is merged here, Baesian may file a loosening card for each row with 29 kept picks in a row, and a tightening card for the row of the one overturn. Under the alternative, `countedCards()` would skip cards with no gate record for the proposals, and the report would still show them.
