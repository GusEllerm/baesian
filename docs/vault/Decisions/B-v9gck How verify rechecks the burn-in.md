---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How verify rechecks the burn-in: The record keeps the count it saw (B-v9gck)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-v9gck
card: B-v9gck
revision: 1
title: How verify rechecks the burn-in
question: How should baesian verify recheck a held card's burn-in, when a row's earlier held cards may be on other branches?
answer: The record keeps the count it saw
response: accept
not_chosen:
  - Count only this branch's record
answered: 2026-11-03T16:56:30.784Z
answered_by: Gus Ellerm
topic: routing/burn-in-recheck
deck: routing
level: provisional
reverse: moderate
touches:
  - schema
filed: 2026-11-03T15:55:59.933Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-fgc4y How held cards are drawn for audit|B-fgc4y]]"
  - "[[B-sa8tg Which gate record holds a card back when hosted|B-sa8tg]]"
---

# How verify rechecks the burn-in

How should baesian verify recheck a held card's burn-in, when a row's earlier held cards may be on other branches?

**Decided:** The record keeps the count it saw, the agent's pick. Each gate record keeps held_before, the row's earlier held cards, counted across branches. verify rechecks the draw from it, the card and the preference file, but can't confirm the count. When hosted, the relay's own count holds a card back (D158).

**Not chosen:** Count only this branch's record. The burn-in counts the held cards in the branch's own record, which verify can recount. A row's first 10 held cards are then counted per branch, so each branch starts its own burn-in, and more cards are drawn in a repo with many branches.

**It turned on:** Is a count verify can't confirm acceptable locally, when the hosted relay will keep its own? Yes, as a verdict is trusted locally: The record keeps the count it saw. No, verify must recount it: Count only this branch's record.

**The fact given:** P16 section 3 says verify rechecks the draw from the card and the preference file alone, but card B-fgc4y's burn-in (a row's first 10 held cards all drawn) depends on earlier held cards on any branch. Locally, verdicts and gate records rest on D62's convention: an agent could edit either. An agent that raised held_before would skip a burn-in audit, not hold a card that would otherwise be shown.

**The agent's case:** It keeps the burn-in as decided, a row's first held cards in the repo, and puts every input of the draw in the record, which M9's relay draw needs too.

**Wrong if:** Held cards' records are edited by agents to skip audits. **To check:** While dogfooding, compare each record's held_before with a recount over the live layer.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-v9gck, revision 1). Filed by claude-code on v1/next, in the deck “Routing and preferences”.

The record is in `.baesian/cards/B-v9gck/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Built this way in M8a. The record also keeps the draw itself (`draw`) and the source the gate read (`source`: an agent's card, Baesian's own, or a revision after an answer), so the relay's draw (D158) can be recorded in the same fields, with its proof in `draw_proof`.
