---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Whether a seen card can be held back: Always shown (B-d860s)."
created: 2026-11-06
updated: 2026-11-06
tags:
  - baesian
  - decision
aliases:
  - B-d860s
card: B-d860s
revision: 1
title: Whether a seen card can be held back
question: Should the repo's preferences be able to hold back a card you've already answered in chat?
answer: Always shown
response: accept
not_chosen:
  - Held like any card
answered: 2026-11-06T04:51:22.361Z
answered_by: GusEllerm
topic: cards/answered-in-chat/held
deck: branch-v1-next
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-06T04:26:31.161Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-hswmx A choice answered in chat|B-hswmx]]"
---

# Whether a seen card can be held back

Should the repo's preferences be able to hold back a card you've already answered in chat?

**Decided:** Always shown, the agent's pick. Then a seen card always comes to the client for its one tap, whatever the preferences, and counts toward no row's burn-in; a hard one still needs the tap before a commit builds on it.

**Not chosen:** Held like any card. Then the preferences may hold a seen card back like any other: it counts as settled at merge on the agent's word that you answered in chat, without your tap, and toward the row's burn-in.

**It turned on:** Should an agent's word that you answered in chat ever stand without your tap? (a preference) No: always the tap: Always shown. Yes, where my preferences hold cards: Held like any card.

**The fact given:** B-hswmx decided a seen card is confirmed in the client with one tap. The repo's preferences can hold a card back instead of showing it: a held card counts as settled at merge, the reviewer may answer it later, and it counts toward its row's burn-in, which measures choices made blind.

Answered by GusEllerm on 2026-11-06, through Baesian (card B-d860s, revision 1). Filed by claude-code on v1/next, in the deck “Decisions on v1/next”.

The record is in `.baesian/cards/B-d860s/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The builder read "you confirm it in the client" as needing the card to reach the client, so it didn't file this; it's filed now so the call is yours.
