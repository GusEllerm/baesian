---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "What a card's reversibility does at the gate: One-way is never held (B-yebnn)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-yebnn
card: B-yebnn
revision: 1
title: What a card's reversibility does at the gate
question: Should a card's stated reversibility only keep one-way cards from being held, or move one-way cards a stop stricter and cheap ones a stop looser?
answer: One-way is never held
response: accept
not_chosen:
  - One stop either way
answered: 2026-11-03T13:41:18.779Z
answered_by: Gus Ellerm
topic: routing/reversibility
deck: routing
level: hard
reverse: moderate
touches:
  - user-facing
  - security
filed: 2026-11-03T13:36:47.788Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-vf0w2 Who may lower what reaches you|B-vf0w2]]"
  - "[[B-jqqa1 What the v1 gate runs on|B-jqqa1]]"
---

# What a card's reversibility does at the gate

Should a card's stated reversibility only keep one-way cards from being held, or move one-way cards a stop stricter and cheap ones a stop looser?

**Decided:** One-way is never held, the agent's pick. A card the agent marks one-way is shown at least at "tell me but carry on". Nothing else moves for reversibility: the row's position decides, and a cheap card gets no discount.

**Not chosen:** One stop either way. A one-way card moves one stop stricter and a cheap one one stop looser, so a cheap card on a "tell me" row is held and may be drawn for audit. Floors still win. Within a kind, cheap cards reach you less.

**It turned on:** Is the agent's statement that a decision is cheap to undo reliable enough to let a card skip your queue? No, not on its own: One-way is never held. Yes, it's concrete enough: One stop either way.

**The fact given:** The agent states reverse; no detector checks it. Under "Today", the one-stop rule would hold the 19 of this repo's 56 cards that are cheap with no floor, unless the agent set a higher level. D144: the agent may only raise a card's level, and only the repo's settings hold a card back. Practitioners route decisions by how hard they are to undo (Bezos's one-way and two-way doors).

**The agent's case:** Raising one-way cards only escalates, as D144 allows, and costs little; a discount for cheap cards would let the agent's unchecked word take a card out of your queue.

**Wrong if:** In shadow, the cards agents call cheap are ones you'd have chosen the same way far more often than the moderate ones on the same row. **To check:** The shadow report: blind choices matching the agent, split by reverse within each row.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-yebnn, revision 1). Filed by claude-code on v1/next, in the deck “Routing and preferences”.

The record is in `.baesian/cards/B-yebnn/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

P14's decision 12 ([[Routing and Preferences]], section 1, "What moves a card off its row's position"). The symmetric rule is the research's (B1 I10, [[Preference Sliders and the Gate]], section 4). Under it a one-way card on a held row moves up one stop, which may still be held; under the proposal it's shown. The gate record's reason has one-way as a value ([[Formats for v1]], section 3); the symmetric rule would need cheap as well. Of this repo's 56 cards, 21 say cheap, 33 moderate and 2 one-way. The 19 figure counts no level set by the agent; 13 of those 19 were filed blocking, which would keep them shown (D144).
