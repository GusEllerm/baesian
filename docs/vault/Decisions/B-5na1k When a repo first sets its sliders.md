---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "When a repo first sets its sliders: At setup, from example decisions (B-5na1k)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-5na1k
card: B-5na1k
revision: 1
title: When a repo first sets its sliders
question: Should a repo choose its first preset at setup, from example decisions, or once about 20 of its own cards are answered, from those?
answer: At setup, from example decisions
response: alternative
not_chosen:
  - After about 20 of your own cards
answered: 2026-11-03T13:45:42.975Z
answered_by: Gus Ellerm
topic: routing/first-setup
deck: routing
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-03T13:36:47.976Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-0pfbf Whether the gate holds cards back|B-0pfbf]]"
---

# When a repo first sets its sliders

Should a repo choose its first preset at setup, from example decisions, or once about 20 of its own cards are answered, from those?

**Decided:** At setup, from example decisions, the alternative. Then baesian init, or creating the project on the website, asks about a few example decisions and picks a preset. It runs in shadow from the first card, and setup is done in one sitting.

**Not chosen:** After about 20 of your own cards, the agent's pick. A new repo runs "Today" in shadow. Once about 20 cards are answered, the client asks of up to five "would you have been fine not seeing this one?", suggests a preset, and shows what it would have held.

**It turned on:** Can you say which decisions you'd be fine not seeing before you've seen any of your own cards? No, I'd need my own: After about 20 of your own cards. Yes, examples will do: At setup, from example decisions.

**The fact given:** Every repo starts in shadow, with every card shown (D148); enforcing is a preference change only you make (D147). The client can recompute what any preset would have held from past cards. People make up preferences when asked in the abstract; in one app-permission study, five or fewer questions assigned a profile, and people adopted 78.7% of its recommendations. This repo has 56 answered cards.

**Comment:** "I think a quick well constructed survey in the baesian format would be a good way to identify the closest preset."

**The agent's case:** With no cards there's nothing real to ask about, and waiting costs nothing, since every card is shown in shadow either way.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-5na1k, revision 1). Filed by claude-code on v1/next, in the deck “Routing and preferences”.

The record is in `.baesian/cards/B-5na1k/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

P14's decision 13 ([[Routing and Preferences]], section 4). P14's alternative enforced the preset from the start; D148 has since put a shadow period first in every case, so both options here start in shadow, and what's left is when the first preset is chosen and from what. In a hosted repo, turning enforcing on takes your passkey (D163). Under "Today" the gate's shadow records hold nothing back, since every row is shown, so what a looser preset would have held comes from re-running the rules over past cards. Which presets exist is P14 item 14, a card of its own. Evidence: [[Preference Sliders and the Gate]], section 6, "Why elicitation is a few questions, not a grid".
