---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How low security cards may go: Lowest is tell me but carry on (B-pn3g1)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-pn3g1
card: B-pn3g1
revision: 1
title: How low security cards may go
question: May a repo's settings lower security and privacy cards to "tell me but carry on", or do they stay fixed at "never without me"?
answer: Lowest is tell me but carry on
response: accept
not_chosen:
  - Fixed at never without me
answered: 2026-11-03T01:52:48.484Z
answered_by: Gus Ellerm
topic: routing/security-floor
deck: routing
level: hard
reverse: moderate
touches:
  - security
filed: 2026-11-03T01:38:36.030Z
filed_by: claude-code
branch: overnight/2026-11-03
---

# How low security cards may go

May a repo's settings lower security and privacy cards to "tell me but carry on", or do they stay fixed at "never without me"?

**Decided:** Lowest is tell me but carry on, the agent's pick. Security stays hard by default (D42), but a repo may lower it to provisional: never held back, and answered before merge (D31). Money, data loss and publishing stay fixed at never without me.

**Not chosen:** Fixed at never without me. All four hard-by-default kinds are floors no setting lowers. The agent never proceeds on a security or privacy card without your answer, as D42 has it.

**It turned on:** Can a security decision in your repos do harm before its branch merges? Rarely; harm comes after merge: Lowest is tell me but carry on. Yes, it can: Fixed at never without me.

**The fact given:** GitLab's security review doesn't block work, and Microsoft's final security review comes before release. In one two-site comparison, hard stops on the most severe alerts saw 100% compliance against 34%.

**The agent's case:** The merge gate already stops unanswered cards before main, so lowering security only spares the agent idling; it never hides a security card.

**Wrong if:** A repo deploys, publishes or shares secrets from branches before merge, so a provisional security decision can take effect early. **To check:** Whether the repo's CI or deploy config runs from branches other than main, and whether branches are pushed to shared remotes.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-pn3g1, revision 1). Filed by claude-code on overnight/2026-11-03, in the deck “Routing and preferences”.

The record is in `.baesian/cards/B-pn3g1/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

No setting in P14 holds a security, money, data-loss or publishing card back. This card asks only whether security may be provisional (the agent carries on, you answer before merge) rather than hard (the agent waits). Evidence: [[Preference Sliders and the Gate]], decisions 9 and 10. Design: [[Routing and Preferences]], section 4.
