---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How a held card opened from the list is shown: Blind first, like an audit (B-s8mbg)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-s8mbg
card: B-s8mbg
revision: 1
title: How a held card opened from the list is shown
question: When you open a held card from the “Held back” list, should it be answered blind first like an audit, or show what's built and why it was held before you choose?
answer: Blind first, like an audit
response: accept
not_chosen:
  - What's built and why, before you choose
answered: 2026-11-03T17:01:53.004Z
answered_by: Gus Ellerm
topic: routing/held-list-display
deck: routing
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-03T16:43:22.527Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-wcbec What an audit card shows before you choose|B-wcbec]]"
  - "[[B-9rycs Held-back cards at merge|B-9rycs]]"
---

# How a held card opened from the list is shown

When you open a held card from the “Held back” list, should it be answered blind first like an audit, or show what's built and why it was held before you choose?

**Decided:** Blind first, like an audit, the agent's pick. Then a held card from the list hides what its agent built until you've chosen, then shows it, and you keep it or overturn it, as on an audit.

**Not chosen:** What's built and why, before you choose. Then the agent's pick stays hidden (D86), but “Already built” and the setting that held it back show first, as on an open card.

**It turned on:** On a held card you chose to open, should your first answer be one made without knowing what's built? (a preference) If so: Blind first, like an audit. If what's built should inform it: What's built and why, before you choose.

**The fact given:** An open card already shows “Already built” before you choose (D75), and it names the option built. On a held card the agent has always gone ahead with its pick, so what's built gives the pick away. Answers on held cards count toward the record either way (B-87tkc).

**First chose:** What's built and why, before you choose, then switched once the agent's pick was shown.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-s8mbg, revision 1). Filed by claude-code on v1/next, in the deck “Routing and preferences”.

The record is in `.baesian/cards/B-s8mbg/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Built provisionally as the proposal (M8b, Client Build item 14): every held card, audit or not, goes through `isHeld()`. Self-chosen held cards aren't a random sample, so they measure less than audits do whichever way this goes.
