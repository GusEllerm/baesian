---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "How a drafted rule reaches you: As a card in your queue (B-vskfr)."
created: 2026-11-01
updated: 2026-11-01
tags:
  - baesian
  - decision
aliases:
  - B-vskfr
card: B-vskfr
revision: 1
title: How a drafted rule reaches you
question: How should an agent put a drafted rule to you for confirmation?
answer: As a card in your queue
response: accept
not_chosen:
  - In a list of rules to confirm
answered: 2026-11-01T19:32:45.099Z
answered_by: Gus Ellerm
topic: client/rule-drafts
deck: finishing-m4
level: blocking
reverse: moderate
touches:
  - user-facing
  - schema
filed: 2026-11-01T19:31:21.837Z
filed_by: claude-code
branch: main
depends_on:
  - "[[B-3akjw How an answer becomes a rule|B-3akjw]]"
---

# How a drafted rule reaches you

How should an agent put a drafted rule to you for confirmation?

**Decided:** As a card in your queue, the agent's pick. Then `baesian rule` files a card from the decision, with the rule's wording and gate patterns on it; accepting it saves the rule, and the other option keeps the decision a one-off.

**Not chosen:** In a list of rules to confirm. Then drafted rules wait in a list under More and on the empty desk, apart from your decisions, each with Accept and Decline.

**It turned on:** Should confirming a rule take its turn in your queue, like a decision, or wait until you go looking? Take its turn: As a card in your queue. Wait until you look: In a list of rules to confirm.

**The fact given:** A card brings what decisions already have: notifications, the path, undo, and the agent's one reply. A list would need its own.

**The agent's case:** One way of answering for everything, and a rule is checked as carefully as any decision.

Answered by Gus Ellerm on 2026-11-01, through Baesian (card B-vskfr, revision 1). Filed by claude-code on main, in the deck “Finishing M4: rules and topic merging”.

The record is in `.baesian/cards/B-vskfr/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

You decided that the agent drafts a rule, with the gate patterns it covers, and you confirm it (the card before this one). What starts a draft is D16's toggle, "make this a rule", on an answer: the verdict carries `make_rule`, and `baesian wait` and `baesian inbox` would tell the agent to draft one. The toggle isn't in the client yet; it's needed either way.

Either way, a confirmed rule is written to `rules/<id>.md` with its wording, topic, `covers`, `from_card` and `accepted_by`.
