---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "What a card's level records: The level in force at filing (B-4ewdp)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-4ewdp
card: B-4ewdp
revision: 1
title: What a card's level records
question: Should a card's level be the level in force, set by the gate at filing, or the level the agent asked for, raised by the floors?
answer: The level in force at filing
response: accept
not_chosen:
  - The level asked for, raised by floors
answered: 2026-11-03T16:55:46.768Z
answered_by: Gus Ellerm
topic: formats/card-level
deck: routing
level: provisional
reverse: moderate
touches:
  - schema
filed: 2026-11-03T15:55:59.767Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-chq61 Whether an agent's level keeps a card from being held|B-chq61]]"
  - "[[B-pn3g1 How low security cards may go|B-pn3g1]]"
---

# What a card's level records

Should a card's level be the level in force, set by the gate at filing, or the level the agent asked for, raised by the floors?

**Decided:** The level in force at filing, the agent's pick. The card's level is what the gate gave it: a shown card's level, or provisional for a held one, whose agent goes ahead. The level asked for is kept in the gate record. Every reader of level works unchanged.

**Not chosen:** The level asked for, raised by floors. Then level on the card stays what the agent asked for; the level in force is computed from it and the gate records. The commit gate, wait, notifications and the client each switch to that computed level.

**It turned on:** Should the card file alone say how the card is handled, or only together with its gate record? The card alone: The level in force at filing. With its record: The level asked for, raised by floors.

**The fact given:** P16 section 3 says level stays the level asked for, raised by the hard floors. Since then, card B-chq61 has a held card's agent go ahead whatever level it asked for, and D146 lets a repo lower security to provisional; so with P16's reading, a held card asked as hard would block the commit gate, and lowering security couldn't change the card. In a hosted repo the relay's record can raise the level later (D158), and the level in force is then the higher of the card's and the relay's.

**The agent's case:** The card is written once, at filing, when the CLI's gate has just run; recording its outcome there keeps every reader as it is, and the agent's own ask is still kept, in the record.

**Wrong if:** The relay often disagrees with the CLI in hosted repos, so the card's level is often not the level in force. **To check:** In M9, how often the relay's record gives a card a different level from the CLI's.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-4ewdp, revision 1). Filed by claude-code on v1/next, in the deck “Routing and preferences”.

The record is in `.baesian/cards/B-4ewdp/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Built this way in M8a, as P14 section 5 first had it ("CardMeta's level stays the level in force, now set by the gate at filing"). With no preference file, "Today" in shadow gives every card the level it would have had before the gate: hard for a hard-by-default fact, otherwise the level asked for or provisional. A test runs every combination of facts, levels and reversibility to check that. `baesian verify` rechecks that a card's level is the level its gate record gives.
