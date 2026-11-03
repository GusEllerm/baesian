---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "How a rule found in your answers reaches you: Baesian asks first, on a fixed card (B-8sx1w)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-8sx1w
card: B-8sx1w
revision: 1
title: How a rule found in your answers reaches you
question: When Baesian finds a pattern in your answers, should it first ask whether you want a rule, or have an agent draft the rule straight away?
answer: Baesian asks first, on a fixed card
response: accept
not_chosen:
  - An agent drafts it straight away
answered: 2026-11-03T04:09:26.365Z
answered_by: Gus Ellerm
topic: formats/mined-rules
deck: formats-v1
level: blocking
reverse: moderate
touches:
  - schema
filed: 2026-11-03T03:53:03.231Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-3akjw How an answer becomes a rule|B-3akjw]]"
  - "[[B-vskfr How a drafted rule reaches you|B-vskfr]]"
---

# How a rule found in your answers reaches you

When Baesian finds a pattern in your answers, should it first ask whether you want a rule, or have an agent draft the rule straight away?

**Decided:** Baesian asks first, on a fixed card, the agent's pick. Baesian files a fixed card listing the decisions: "Make these one rule?" Yes asks an agent for the wording and patterns, which come back as a second card (D110). One new card field, and no other new state.

**Not chosen:** An agent drafts it straight away. Baesian flags the pattern to the next agent at a stopping point, which drafts the rule. You get one card, with the wording and the decisions it came from. Needs a record of flagged and dismissed patterns.

**It turned on:** When your answers form a pattern, would you rather say first whether a rule is wanted at all? (a preference) Yes, ask me first: Baesian asks first, on a fixed card. No, show me the wording: An agent drafts it straight away.

**The fact given:** Today a rule takes two answers: the "make this a rule" box on a decision, then the drafted rule (D109, D110). Baesian already files conflict cards itself, with fixed wording and no model (D65, D94).

**First chose:** An agent drafts it straight away, then switched once the agent's pick was shown.

**The agent's case:** It reuses the box's path exactly, so mining needs no agent until you say yes, and declining leaves nothing behind but your answer.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-8sx1w, revision 1). Filed by claude-code on v1/next, in the deck “Formats for v1”. Context: [[Formats for v1]], [[File Formats]].

The record is in `.baesian/cards/B-8sx1w/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

D16's second route to a rule, convention cards mined from your answers, is still to be built, and D126 asks for its format before v1. How Baesian finds a pattern, the card's fixed wording, and how accepting it leads to a saved rule are in [[Formats for v1]], section 6.
