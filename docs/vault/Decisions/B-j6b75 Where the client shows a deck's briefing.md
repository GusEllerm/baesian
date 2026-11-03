---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "Where the client shows a deck's briefing: Before the deck's first card, once (B-j6b75)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-j6b75
card: B-j6b75
revision: 2
title: Where the client shows a deck's briefing
question: When does the reviewer see a deck's briefing and its context notes' summaries?
answer: Before the deck's first card, once
response: accept
not_chosen:
  - Only when you ask, from the deck's name
answered: 2026-11-03T13:19:07.754Z
answered_by: Gus Ellerm
topic: client/deck-briefing
deck: vault-adapter
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-03T04:59:18.229Z
filed_by: claude-code
branch: v1/next
---

# Where the client shows a deck's briefing

When does the reviewer see a deck's briefing and its context notes' summaries?

**Decided:** Before the deck's first card, once, the agent's pick. Then the first card you reach from a deck with a briefing comes after a briefing card, with the briefing and each context note's summary; one swipe or key moves on, it shows once per deck, and the deck's name in the breadcrumbs still reopens it.

**Not chosen:** Only when you ask, from the deck's name. Then nothing comes between you and a deck's first card; the deck's name in the breadcrumbs above each card opens the briefing and the notes' summaries, as built now.

**It turned on:** Should a deck's briefing come before its first card, whether you asked for it or not? If it should: Before the deck's first card, once. If not: Only when you ask, from the deck's name.

**The fact given:** In this repo, 56 cards came in 11 decks over three days, about five cards per deck, so a briefing card once per deck is about one in every five cards. Every deck was a named one; none was a branch's default deck (r1 said most were). Seven decks carry a briefing, of 18 to 60 words, two of them naming vault notes; four have none and would show no briefing card. The queue orders cards by area and rarity, not by deck, so a deck's later cards can come up apart from its first.

**The agent's case:** It's rare enough not to tax the queue, it puts the context in front of you when you start on the deck's questions, and anything you've read is one swipe away from gone. Decks without a briefing cost nothing.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-j6b75, revision 2). Filed by claude-code on v1/next, in the deck “The vault adapter”. Context: [[Vault Adapter]], [[Baesian Design]].

The record is in `.baesian/cards/B-j6b75/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

**r2, after "need more context":** the reviewer asked how often a briefing would come up if it came before every deck, and leaned towards showing it by default if that's rare. The counts above answer it. r1's case rested on most decks being a branch's default deck with a one-line briefing, which isn't so here, so the pick changes to the briefing card.

What's built (M6) is the panel from the deck's name (`DeckPanel`), which stays either way. Under the proposal, which decks you've been briefed on is kept in the browser, per deck, so reopening the client doesn't show them again; the hosted service would keep it per account. The design's deck-level escape hatch (D6), "not for me" or "need more context" before any card, would sit naturally on the briefing card, but isn't part of this choice.
