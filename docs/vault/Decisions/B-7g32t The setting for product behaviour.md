---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "The setting for product behaviour: Move it to “stop and ask” (B-7g32t)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-7g32t
card: B-7g32t
revision: 1
title: The setting for product behaviour
question: Where should the setting for product behaviour be now?
answer: Move it to “stop and ask”
response: accept
not_chosen:
  - Keep it at “tell me but carry on”
answered: 2026-11-03T17:01:37.172Z
answered_by: Gus Ellerm
topic: preferences/user-facing/b-5na1k
deck: preferences
level: provisional
reverse: cheap
filed: 2026-11-03T16:49:50.516Z
filed_by: baesian
branch: v1/next
---

# The setting for product behaviour

Where should the setting for product behaviour be now?

**Decided:** Move it to “stop and ask”, the agent's pick. Then a new preference file moves it: agents wait for your answer on these while you're there.

**Not chosen:** Keep it at “tell me but carry on”. Then nothing changes, and Baesian proposes a move on this row again only from new answers.

**It turned on:** Was that answer a sign of this kind of decision, or a one-off? A sign of the kind: Move it to “stop and ask”. A one-off: Keep it at “tell me but carry on”.

**The fact given:** “Product behaviour” is at “tell me but carry on”. On B-5na1k, “When a repo first sets its sliders”, your final answer went against the agent's pick. Misses on this row at “tell me but carry on”: 2 in 14 final answers.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-7g32t, revision 1). Filed by baesian on v1/next, in the deck “Your preferences”.

The record is in `.baesian/cards/B-7g32t/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Baesian files this itself from the record, with no model (B-y6jn6): one stop up after a miss on a row. A miss is a final answer that overturns the agent's pick, or one marked “you should have asked me” (B-87tkc). Accepting writes a new preference file; Baesian never moves a row on its own.
