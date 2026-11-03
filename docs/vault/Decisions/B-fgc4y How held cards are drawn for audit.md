---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How held cards are drawn for audit: A fixed chance per position (B-fgc4y)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-fgc4y
card: B-fgc4y
revision: 1
title: How held cards are drawn for audit
question: Should held cards be drawn for audit at a fixed chance per position, or from a fixed number of audits each week?
answer: A fixed chance per position
response: accept
not_chosen:
  - A fixed number of audits a week
answered: 2026-11-03T13:42:07.155Z
answered_by: Gus Ellerm
topic: routing/audit-rates
deck: routing
level: blocking
reverse: moderate
touches:
  - schema
  - user-facing
filed: 2026-11-03T13:36:47.441Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-0pfbf Whether the gate holds cards back|B-0pfbf]]"
  - "[[B-refpb Where a repo's preferences are kept|B-refpb]]"
  - "[[B-sa8tg Which gate record holds a card back when hosted|B-sa8tg]]"
---

# How held cards are drawn for audit

Should held cards be drawn for audit at a fixed chance per position, or from a fixed number of audits each week?

**Decided:** A fixed chance per position, the agent's pick. Each held card is drawn with its position's chance, starting at 1 in 10 for "let the agent decide" and 1 in 3 for "check a sample", and a row's first 10 held cards are all drawn. Audits grow with what's held.

**Not chosen:** A fixed number of audits a week. About five audits a week across all rows, spread by row, whatever agents file. Your audit load stays flat; each card's chance is set from how many were held the week before, and recorded with it.

**It turned on:** Should the number of audits you answer grow with how much agents file, or stay the same each week? (a preference) Grow with filing: A fixed chance per position. Stay the same: A fixed number of audits a week.

**The fact given:** Bounding a row's miss rate under 10% takes 29 audits with no miss. With a row's first 10 all drawn, that's about 67 held cards at 1 in 3, or 200 at 1 in 10. At five a week over six rows, it's about 35 weeks per row. A fixed chance can be rechecked from the card and the preference file; a weekly budget, like the burn-in, needs the count of earlier held cards.

**First chose:** A fixed number of audits a week, then switched once the agent's pick was shown.

**The agent's case:** A fixed chance is set when the card is filed, from the preference file alone, and audits each row in proportion to what it holds back, which is where misses add up. The values are guesses, kept in the preference file to tune.

**Wrong if:** Audits arrive faster than you answer them, so many stay unanswered. **To check:** The report's unanswered audits per week while dogfooding, against the audits drawn.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-fgc4y, revision 1). Filed by claude-code on v1/next, in the deck “Routing and preferences”.

The record is in `.baesian/cards/B-fgc4y/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

P14's decision 10 ([[Routing and Preferences]], section 2, "How a position becomes an outcome"). The preference file holds rate_agent_decides, rate_sample and burn_in ([[Formats for v1]], section 2), and the gate record holds drawn, p and burn_in (section 3). A budget would replace the two rates with a weekly number and a rule for each card's chance. A nonzero chance at the lowest position keeps every held card's miss rate estimable, since every unit needs some chance of selection (ISA 530). The burn-in starts strict and loosens with evidence, as Meta's RADAR did. In a hosted repo the relay draws from its own signature (D158), so under either option the agent can't choose which cards are drawn. Evidence: [[Preference Sliders and the Gate]], sections 1 and 6.
