---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: 'What counts as a miss on an audit: Only an overturn, or "should have asked" (B-87tkc).'
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-87tkc
card: B-87tkc
revision: 1
title: What counts as a miss on an audit
question: On an audit, should a blind choice that differs from the agent's pick count as a miss, or only a final answer that overturns it?
answer: Only an overturn, or "should have asked"
response: accept
not_chosen:
  - A different blind choice, or "should have asked"
answered: 2026-11-03T13:39:17.858Z
answered_by: Gus Ellerm
topic: routing/miss-definition
deck: routing
level: provisional
reverse: cheap
touches:
  - user-facing
  - schema
filed: 2026-11-03T13:36:47.295Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-wcbec What an audit card shows before you choose|B-wcbec]]"
  - "[[B-0pfbf Whether the gate holds cards back|B-0pfbf]]"
---

# What counts as a miss on an audit

On an audit, should a blind choice that differs from the agent's pick count as a miss, or only a final answer that overturns it?

**Decided:** Only an overturn, or "should have asked", the agent's pick. A miss is an audit whose final answer, after the reveal, overturns the agent's pick, or one you mark "you should have asked me". A differing blind choice you then switch from is reported beside them, not counted.

**Not chosen:** A different blind choice, or "should have asked". A miss is an audit whose blind choice differs from the agent's pick, or one you mark "you should have asked me", even if you keep the pick after the reveal. Every disagreement before the agent's case counts.

**It turned on:** When your blind choice differs but the agent's case then wins you over, did holding the card back cost you anything? (a preference) No, the outcome was the same: Only an overturn, or "should have asked". Yes, I want that call myself: A different blind choice, or "should have asked".

**The fact given:** Of this repo's 53 answers with a blind choice, 20 differed from the agent's pick, and 19 of those ended on the agent's pick once its case was shown. On an audit the reveal also shows what's built (D151). Both answers are kept either way, so the report can be recomputed.

**The agent's case:** Counting blind disagreements would, at this repo's rate, flag a miss on over a third of audits, nearly all of which would have ended the same way if shown; the toggle still catches the cards you wanted to see whatever you chose.

**Wrong if:** On audits, you often keep the agent's pick only because of what's built, without marking "you should have asked me". **To check:** While dogfooding: how often an audit whose blind choice differs ends on keep, and what the comments on those answers say.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-87tkc, revision 1). Filed by claude-code on v1/next, in the deck “Routing and preferences”.

The record is in `.baesian/cards/B-87tkc/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

P14's decision 9 asked whether "you should have asked me" counts as a miss beside a different blind choice, or the blind choice alone ([[Routing and Preferences]], section 3, "Audit cards"). Both options here count the toggle, which P16 proposes as should_have_asked on the verdict ([[Formats for v1]], section 5); P14's own alternative, the blind choice alone with no toggle, is listed as also considered. The record raised a sharper question: D151 keeps two answers on every audit, the blind choice and the final one, and on this repo's cards they often differ. An overturn here means a final answer of alternative, correction or reject.

The figures are this repo's verdicts so far: design decisions, nearly all filed blocking or hard, every one shown. Held cards will be the kinds a repo cares least about, so their disagreement rate may be lower. At the rate here (33 of 53 blind choices matched), P14's rule for proposing to loosen a shown row, 29 matching blind choices in a row, has about a one-in-a-million chance of firing.
