---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Whether privacy is a fact of its own: A privacy fact and row of its own (B-z3agk)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-z3agk
card: B-z3agk
revision: 1
title: Whether privacy is a fact of its own
question: Should privacy and personal data stay inside the one security fact, or become a fact and a slider row of their own?
answer: A privacy fact and row of its own
response: alternative
not_chosen:
  - One security fact, as now
answered: 2026-11-03T13:40:18.839Z
answered_by: Gus Ellerm
topic: routing/privacy-fact
deck: routing
level: hard
reverse: moderate
touches:
  - schema
  - security
filed: 2026-11-03T13:36:47.598Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-pn3g1 How low security cards may go|B-pn3g1]]"
---

# Whether privacy is a fact of its own

Should privacy and personal data stay inside the one security fact, or become a fact and a slider row of their own?

**Decided:** A privacy fact and row of its own, the alternative. A new privacy fact for personal data, with its own row and floor, so either can stay at "never without me" while the other is lowered. Agents must tell the two apart. Cards, the template and the preference file change.

**Not chosen:** One security fact, as now, the agent's pick. The security fact keeps covering privacy, as D11's checklist reads, and they share one row. A repo that lowers security to "tell me but carry on" (D146) lowers privacy cards with it. The facts stay nine.

**It turned on:** Would you ever want decisions about personal data routed differently from other security decisions? (a preference) No, the same way: One security fact, as now. Yes, sometimes: A privacy fact and row of its own.

**The fact given:** D146 lets a repo lower security, privacy included, to "tell me but carry on", never held. 20 of this repo's 56 cards touch security; by the agent's reading, 4 are mainly about personal data. No detector checks either. The sources the research read that cover both treat them apart, and GDPR asks for an assessment before risky processing. After v1, a new fact is a card format 2 (D156).

**The agent's case:** Under D146 they share a default and a floor, so a split changes nothing until someone lowers security; it would ask agents to draw a line nothing checks, and format numbers (D156) let it be added later.

**Wrong if:** A repo lowers its security row while its agents make decisions about personal data that you'd want to stop for. **To check:** Whether any repo lowers the security row, and how many of its security cards are about personal data.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-z3agk, revision 1). Filed by claude-code on v1/next, in the deck “Routing and preferences”.

The record is in `.baesian/cards/B-z3agk/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

P14's decision 11 ([[Routing and Preferences]], section 1). D11's checklist item reads "touches security or privacy", and the card format has one security fact for both. In the research, B2 found personal data kept for a person on legal grounds, and security often kept without blocking, so the two may want different floors; B1 and B4 floor both ([[Preference Sliders and the Gate]], section 3). The four cards the agent counts as mainly about personal data are B-7bk6y (usage counts), B-kypkm (card text on the service), B-e907q (a card naming its machine) and B-vqn69 (a public repo's record). P16's preference file has seven rows, with row_security for both ([[Formats for v1]], section 2).
