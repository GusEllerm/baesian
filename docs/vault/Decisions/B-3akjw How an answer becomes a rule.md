---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "How an answer becomes a rule: The agent drafts it for you to confirm (B-3akjw)."
created: 2026-11-01
updated: 2026-11-01
tags:
  - baesian
  - decision
aliases:
  - B-3akjw
card: B-3akjw
revision: 1
title: How an answer becomes a rule
question: When you mark an answer as a rule, who writes the rule, and what does it cover?
answer: The agent drafts it for you to confirm
response: alternative
not_chosen:
  - You write it as you answer
answered: 2026-11-01T19:30:07.910Z
answered_by: Gus Ellerm
topic: client/rules
deck: finishing-m4
level: blocking
reverse: moderate
touches:
  - user-facing
filed: 2026-11-01T19:28:20.268Z
filed_by: claude-code
branch: main
---

# How an answer becomes a rule

When you mark an answer as a rule, who writes the rule, and what does it cover?

**Decided:** The agent drafts it for you to confirm, the alternative. Then the agent later files a card with the rule's wording and the gate facts it covers; the rule exists once you accept it.

**Not chosen:** You write it as you answer, the agent's pick. Then the toggle opens a line prefilled with the decision; you edit and send it, and the rule is saved at once with the card's topic, covering no gate facts yet.

**It turned on:** Must a new rule let matching commits through the gate, without a card, from the day it's made? If that can wait: You write it as you answer. If it must: The agent drafts it for you to confirm.

**The fact given:** A rule's gate patterns are the gate's fact IDs, such as dep:pytest-*. The agent sees them in every gate report; you don't.

**Comment:** "I think users will not want to provision the time to write out a sufficient rule."

**The agent's case:** A rule is yours, and the moment you decide is when you know what you mean by it. Gate patterns can follow as a separate step.

Answered by Gus Ellerm on 2026-11-01, through Baesian (card B-3akjw, revision 1). Filed by claude-code on main, in the deck “Finishing M4: rules and topic merging”.

The record is in `.baesian/cards/B-3akjw/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

D16 decided that rules are proposed two ways: a "make this a rule" toggle on any answer, and cards mined from decisions made the same way repeatedly. The verdict already carries `make_rule`, and the server accepts it, but nothing turns it into a rule: no rule file is ever written. Round 5 doesn't show the toggle.

A rule today (`rules/<id>.md`) is its text, an optional topic, `covers` (gate fact patterns that the gate then acknowledges by itself, D24), `from_card` and `accepted_by`. Rules also show on related cards in the path, where agents cite them (D79), and that works without `covers`.
