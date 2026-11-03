---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Labelling audits ahead of the answer: Like any card until you choose (B-y531h)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-y531h
card: B-y531h
revision: 1
title: Labelling audits ahead of the answer
question: Should an audit card say it's a sample of what went ahead without you before you choose, or read like any other card until then?
answer: Like any card until you choose
response: accept
not_chosen:
  - Marked as an audit from the start
answered: 2026-11-03T17:02:39.577Z
answered_by: Gus Ellerm
topic: routing/audit-display/label
deck: routing
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-03T16:43:38.107Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-wcbec What an audit card shows before you choose|B-wcbec]]"
  - "[[B-87tkc What counts as a miss on an audit|B-87tkc]]"
---

# Labelling audits ahead of the answer

Should an audit card say it's a sample of what went ahead without you before you choose, or read like any other card until then?

**Decided:** Like any card until you choose, the agent's pick. Then nothing on an audit says it's held back, drawn or already built until you've chosen; the reveal then says it was held back, and came back as a sample.

**Not chosen:** Marked as an audit from the start. Then a line above the question says it's a sample of what went ahead without you, without naming the option; you choose knowing an answer against the agent overturns built work.

**It turned on:** Does knowing a card is an audit change how you'd choose on it? If it does: Like any card until you choose. If it doesn't, and you'd rather know: Marked as an audit from the start.

**The fact given:** D151 has audits answered blind: you choose, then see what the agent took and what's built, and decide whether to overturn. A miss is a final answer that overturns the pick, or “you should have asked me” (B-87tkc), so the blind choice is recorded but isn't the miss.

**First chose:** Marked as an audit from the start, then switched once the agent's pick was shown.

**The agent's case:** Knowing work is already built is the anchor D151 keeps out of the blind choice; the reveal says everything before anything is overturned.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-y531h, revision 1). Filed by claude-code on v1/next, in the deck “Routing and preferences”.

The record is in `.baesian/cards/B-y531h/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Built provisionally as the proposal (M8b, Client Build item 14): `isHeld()` hides the "Already built" facet, the waiting badge and the gate record until the reveal. The alternative is one line on the card.
