---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Revising a seen card before it's confirmed: Withdraw and refile, as now (B-fjbt5)."
created: 2026-11-06
updated: 2026-11-06
tags:
  - baesian
  - decision
aliases:
  - B-fjbt5
card: B-fjbt5
revision: 1
title: Revising a seen card before it's confirmed
question: When the reviewer changes their chat answer before confirming a seen card, should the agent revise the card or replace it?
answer: Withdraw and refile, as now
response: alternative
not_chosen:
  - Revise it while it's open
answered: 2026-11-06T15:37:38.333Z
answered_by: GusEllerm
topic: cards/answered-in-chat/revise
deck: branch-v1-next
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-06T15:37:13.028Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-hswmx A choice answered in chat|B-hswmx]]"
---

# Revising a seen card before it's confirmed

When the reviewer changes their chat answer before confirming a seen card, should the agent revise the card or replace it?

**Decided:** Withdraw and refile, as now, the alternative. Then the agent withdraws the seen card and files a new one that supersedes it. Each rewording leaves a withdrawn card in the record and the deck.

**Not chosen:** Revise it while it's open, the agent's pick. Then `baesian revise` takes a new revision of an open seen card, with the new chat words; the client shows the latest, and the reviewer confirms that one. One card, its history in its revisions.

**It turned on:** Should one decision reworded in chat stay one card? (a preference) Yes: one card: Revise it while it's open. No: each wording its own: Withdraw and refile, as now.

**The fact given:** Today only a returned card takes a new revision; an open one can only be withdrawn. On 2026-11-06 the README's name section was reworded twice in chat before it was confirmed, leaving B-bvyfk and B-xrvqa withdrawn and B-3vchs open. A seen card has no blind choice to protect, which is why open cards aren't revised otherwise.

Answered by GusEllerm on 2026-11-06, through Baesian (card B-fjbt5, revision 1). Filed by claude-code on v1/next, in the deck “Decisions on v1/next”.

The record is in `.baesian/cards/B-fjbt5/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.
