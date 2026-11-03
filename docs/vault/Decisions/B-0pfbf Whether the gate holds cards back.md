---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Whether the gate holds cards back: Hold some back, after a shadow period (B-0pfbf)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-0pfbf
card: B-0pfbf
revision: 1
title: Whether the gate holds cards back
question: Should the routing gate hold some filed cards back from you, or only order and batch your queue?
answer: Hold some back, after a shadow period
response: accept
not_chosen:
  - Sort and batch only
answered: 2026-11-03T01:54:31.302Z
answered_by: Gus Ellerm
topic: routing/hide-or-sort
deck: routing
level: blocking
reverse: moderate
touches:
  - user-facing
filed: 2026-11-03T01:38:35.368Z
filed_by: claude-code
branch: overnight/2026-11-03
---

# Whether the gate holds cards back

Should the routing gate hold some filed cards back from you, or only order and batch your queue?

**Decided:** Hold some back, after a shadow period, the agent's pick. Cards below a row's setting skip your queue; the agent proceeds, and a random sample comes back as audits. A shadow period first shows what would have been held, with every card still shown.

**Not chosen:** Sort and batch only. Every filed card reaches you. Sliders set only order, batching and notifications. Nothing is missed and no audits are needed; the queue stays as long as filing makes it.

**It turned on:** Will you accept that a few decisions you'd have overturned never reach you, if that rate is measured and shown? (a preference) Yes, if it's measured: Hold some back, after a shadow period. No, I want to see every one: Sort and batch only.

**The fact given:** People accept 93% of agent permission prompts, and alert acceptance falls with each extra reminder. A gate's worst misses go unseen, and bounding one kind's miss rate below 10% takes 29 clean audits.

**The agent's case:** Reviewing everything alike spends attention without buying safety, and the shadow period gives the real miss rate before anything is held.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-0pfbf, revision 1). Filed by claude-code on overnight/2026-11-03, in the deck “Routing and preferences”.

The record is in `.baesian/cards/B-0pfbf/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

P14 proposes per-repo sliders whose two lowest positions hold cards back: the agent proceeds, the card is recorded with a new held status, and a random sample returns as audit cards. The strongest alternative is B4's design F, where nothing is ever hidden. Evidence: [[Preference Sliders and the Gate]], sections 1 and 5. Design: [[Routing and Preferences]], section 2.
