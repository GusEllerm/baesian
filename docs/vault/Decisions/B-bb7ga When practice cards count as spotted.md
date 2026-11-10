---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "When practice cards count as spotted: Only if your marks beat guessing (B-bb7ga)."
created: 2026-11-10
updated: 2026-11-10
tags:
  - baesian
  - decision
aliases:
  - B-bb7ga
card: B-bb7ga
revision: 1
title: When practice cards count as spotted
question: In the blind test, should practice cards count as spotted only if your marks beat guessing, or as soon as you're sure of one?
answer: Only if your marks beat guessing
response: accept
not_chosen:
  - As soon as you're sure of one
answered: 2026-11-10T20:19:05.424Z
answered_by: GusEllerm
topic: calibration/practice-spotted
deck: calibration
level: blocking
reverse: cheap
touches:
  - user-facing
filed: 2026-11-10T20:15:46.609Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-kb5yt Measuring whether you defer to the agent's case|B-kb5yt]]"
---

# When practice cards count as spotted

In the blind test, should practice cards count as spotted only if your marks beat guessing, or as soon as you're sure of one?

**Decided:** Only if your marks beat guessing, the agent's pick. Then they're spotted, and dropped, if the cards you mark maybe or sure are practice cards more often than guessing would make them, at 95%: marking ten of forty, five right; a card you're sure of is one mark among the rest.

**Not chosen:** As soon as you're sure of one. Then one practice card you mark as sure is enough to drop them, as is a pattern of marks that beats guessing.

**It turned on:** Should one practice card you're sure of be enough to drop them all? (a preference) It shouldn't: Only if your marks beat guessing. It should: As soon as you're sure of one.

**The fact given:** D71 drops a feature that can't be shown consistently. With ten practice cards among forty, marking ten at random finds two or three. A practice card you recognise measures nothing; the others still can.

**The agent's case:** One card you recognise costs that card's answer, not the measure; a pattern means you can tell practice cards apart, which is what would make the count worthless.

**Wrong if:** Once they ship, you notice practice cards in use often enough to answer them differently. **To check:** Practice cards you say you noticed, in the month after they ship.

Answered by GusEllerm on 2026-11-10, through Baesian (card B-bb7ga, revision 1). Filed by claude-code on v1/next, in the deck “How Baesian learns from your answers”.

The record is in `.baesian/cards/B-bb7ga/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The test (a card of its own) mixes ten practice cards with real ones, and you mark each card "no", "maybe" or "sure" for whether you think it was rebuilt. The design is in [[Practice Cards]].

Under the proposal, "beats guessing" is a one-sided Fisher's exact test over every card in the test: those you marked maybe or sure against those you didn't, and practice against real, so wrong marks count against you. With forty cards: marking five, four right is spotted; marking ten, five right; marking fifteen, seven right.
