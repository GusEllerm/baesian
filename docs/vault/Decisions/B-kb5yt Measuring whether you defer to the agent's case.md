---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Measuring whether you defer to the agent's case: Practice cards with planted picks (B-kb5yt)."
created: 2026-11-10
updated: 2026-11-10
tags:
  - baesian
  - decision
aliases:
  - B-kb5yt
card: B-kb5yt
revision: 1
title: Measuring whether you defer to the agent's case
question: To learn whether you come round to agents' picks because they're right, should Baesian mix practice cards with planted picks into your deck, or ask you why when you come round?
answer: Practice cards with planted picks
response: accept
not_chosen:
  - One tap for why you came round
answered: 2026-11-10T19:58:10.077Z
answered_by: GusEllerm
topic: calibration/deference
deck: calibration
level: blocking
reverse: cheap
touches:
  - user-facing
  - schema
filed: 2026-11-10T19:57:51.527Z
filed_by: claude-code
branch: v1/next
---

# Measuring whether you defer to the agent's case

To learn whether you come round to agents' picks because they're right, should Baesian mix practice cards with planted picks into your deck, or ask you why when you come round?

**Decided:** Practice cards with planted picks, the agent's pick. Then about 1 in 20 cards in your deck is a past card rebuilt as D83 has it, whose shown pick Baesian chose; your calibration shows how often you come round to a planted pick against a real one. A practice card is never sent to an agent or kept in the record, and says it was practice once you've answered. A blind test, ten rebuilt cards among real ones, comes first.

**Not chosen:** One tap for why you came round. Then when you come round to the agent's pick, the client asks why in one optional tap (a fact I lacked, the case convinced me, either is fine), kept with your answer and shown in your calibration; every card in your deck is one an agent filed.

**It turned on:** When you come round to an agent's pick, can you tell whether it was a fact or the agent's confidence? Not reliably: Practice cards with planted picks. Well enough: One tap for why you came round.

**The fact given:** On this repo, 52 of 60 blind choices against the agent's pick ended on its pick. D83 decided practice cards are built from past cards by swapping their options, live only, and that a blind test comes before they ship; none has been built. At 1 in 20, this repo's 168 cards would have come with about 8 practice cards.

**The agent's case:** Asking catches only the deference you notice. A planted pick measures it without asking: if you come round to picks Baesian chose as often as to agents' real ones, coming round says little about the agent.

**Wrong if:** You spot rebuilt cards in the blind test, or come round to planted picks so rarely that the count says nothing. **To check:** The blind test's result, then the planted picks you came round to after a month.

Answered by GusEllerm on 2026-11-10, through Baesian (card B-kb5yt, revision 1). Filed by claude-code on v1/next, in the deck “How Baesian learns from your answers”.

The record is in `.baesian/cards/B-kb5yt/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The critique ([[Profiles and Collective Steering - Critique]]) asked, as its measurement question, whether a reviewer who comes round after reading the agent's case is being corrected or deferring. Both options try to answer it; they aren't exclusive, and the tap could come later beside practice cards.

How a planted pick and its case are built from a past card (which of its options is shown as the pick, and with what case) is settled with the blind test, since that decides whether practice cards ship at all.

The tap would add an optional field to a verdict, which needs no migration before v1 (D108). Practice cards add nothing to the record.
