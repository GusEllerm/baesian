---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Which cards go up when a repo is first linked: Everything (B-6k0rk)."
created: 2026-11-04
updated: 2026-11-04
tags:
  - baesian
  - decision
aliases:
  - B-6k0rk
card: B-6k0rk
revision: 1
title: Which cards go up when a repo is first linked
question: When a repo is first linked, should the CLI upload every card in its live layer, or only the cards still waiting on you, with the decks and rules they need?
answer: Everything
response: alternative
not_chosen:
  - Only what's still waiting
answered: 2026-11-04T15:52:36.242Z
answered_by: Gus Ellerm
topic: hosted/first-upload
deck: hosted
level: hard
reverse: moderate
touches:
  - privacy
  - user-facing
filed: 2026-11-04T15:45:50.996Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-9jqt4 How long an answered card's text stays on the relay|B-9jqt4]]"
  - "[[B-kypkm Whether the service can read card text|B-kypkm]]"
---

# Which cards go up when a repo is first linked

When a repo is first linked, should the CLI upload every card in its live layer, or only the cards still waiting on you, with the decks and rules they need?

**Decided:** Everything, the alternative. Every card, answer and deck in the live layer goes up, so the website and every other machine see the repo's whole history from the start. The relay keeps a card's text until 30 days after delivery, then drops it (B-9jqt4).

**Not chosen:** Only what's still waiting, the agent's pick. Open and held cards, their decks and the repo's rules go up. Resolved and withdrawn cards stay in git's record and on your machines; the website starts with what needs you, and less of the repo's history reaches the service.

**It turned on:** Do you want the website to show the decisions made before a repo was linked? No, git has them: Only what's still waiting. Yes: Everything.

**The fact given:** This repo's live layer holds 112 cards, none waiting now. The record, committed with the code, keeps every card and answer either way, so every clone has them. The relay keeps a card's text until 30 days after it's delivered (B-9jqt4), and IDs, times and levels longer, for usage counts (D141). Other machines get what the relay holds when they sync. Answers from before linking aren't signed by the service (card hosted/pre-link-answers).

**The agent's case:** The service's job is what's waiting (D127); the history is already in git. Uploading only what needs you sends less of the repo's text to a third party, and the website opens on the work, not a backlog of finished decisions.

**Wrong if:** You want to search or review a repo's earlier decisions on the website, or another machine needs old cards it can't get from the record. **To check:** After linking this repo, note whether you look for past decisions on the website, and whether any machine misses a card.

Answered by Gus Ellerm on 2026-11-04, through Baesian (card B-6k0rk, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-6k0rk/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

After the first upload, every new file in the live layer goes up as it's written, whichever option is chosen; this card is only about what's already there when a repo is linked. Under the proposal, an old card that's revised or reopened later goes up then, with what it needs.
