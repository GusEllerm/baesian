---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "The setting for product behaviour: Move it to “never without me” (B-np56n)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-np56n
card: B-np56n
revision: 1
title: The setting for product behaviour
question: Where should the setting for product behaviour be now?
answer: Move it to “never without me”
response: accept
not_chosen:
  - Keep it at “stop and ask”
answered: 2026-11-03T17:46:50.889Z
answered_by: Gus Ellerm
topic: preferences/user-facing/b-k7xac
deck: preferences
level: provisional
reverse: cheap
filed: 2026-11-03T17:45:37.830Z
filed_by: baesian
branch: v1/next
---

# The setting for product behaviour

Where should the setting for product behaviour be now?

**Decided:** Move it to “never without me”, the agent's pick. Then a new preference file moves it: agents never go ahead on these without your answer.

**Not chosen:** Keep it at “stop and ask”. Then nothing changes, and Baesian proposes a move on this row again only from new answers.

**It turned on:** Was that answer a sign of this kind of decision, or a one-off? A sign of the kind: Move it to “never without me”. A one-off: Keep it at “stop and ask”.

**The fact given:** “Product behaviour” is at “stop and ask”. On B-k7xac, “What a vertical swipe does on a long card, on a phone”, your final answer went against the agent's pick. Misses on this row at “stop and ask”: 1 in 1 final answer.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-np56n, revision 1). Filed by baesian on v1/next, in the deck “Your preferences”.

The record is in `.baesian/cards/B-np56n/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Baesian files this itself from the record, with no model (B-y6jn6): one stop up after a miss on a row. A miss is a final answer that overturns the agent's pick, or one marked “you should have asked me” (B-87tkc). Accepting writes a new preference file; Baesian never moves a row on its own.
