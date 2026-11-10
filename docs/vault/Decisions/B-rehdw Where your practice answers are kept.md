---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Where your practice answers are kept: On the service, for every device (B-rehdw)."
created: 2026-11-10
updated: 2026-11-10
tags:
  - baesian
  - decision
aliases:
  - B-rehdw
card: B-rehdw
revision: 1
title: Where your practice answers are kept
question: Should the service keep your practice answers, so every device you answer on shares them, or should they stay in the browser you gave them in?
answer: On the service, for every device
response: accept
not_chosen:
  - In each browser only
answered: 2026-11-10T20:17:56.088Z
answered_by: GusEllerm
topic: calibration/practice-storage
deck: calibration
level: hard
reverse: cheap
touches:
  - schema
  - public-api
  - privacy
  - user-facing
filed: 2026-11-10T20:15:39.162Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-kb5yt Measuring whether you defer to the agent's case|B-kb5yt]]"
---

# Where your practice answers are kept

Should the service keep your practice answers, so every device you answer on shares them, or should they stay in the browser you gave them in?

**Decided:** On the service, for every device, the agent's pick. Then the relay keeps them in a table of their own, outside the log machines read, behind an address only a signed-in browser can use, and the privacy page lists them; without the website, they're in the clone's live layer.

**Not chosen:** In each browser only. Then they stay in the browser you answered in, as your time per card does: nothing new on the service, but each device has its own practice row, and a card practised on one device can come back on another.

**It turned on:** Is one practice record across your devices worth the service keeping it? (a preference) It is: On the service, for every device. It isn't: In each browser only.

**The fact given:** Of this repo's 194 answers, 133 came from the local client, 26 from the website on a desktop and 35 on a phone. Practice cards come about once in 20 cards. Your time per card is kept in each browser only; what the service keeps is listed on its privacy page.

**The agent's case:** A practice card every 20 answers, split between a phone and a desk, would leave each browser's count too thin to read for months; one record also keeps a card from coming back as practice twice.

**Wrong if:** You answer nearly every card on one device, so one browser's record would be as full. **To check:** Which client your answers come from over the next month.

Answered by GusEllerm on 2026-11-10, through Baesian (card B-rehdw, revision 1). Filed by claude-code on v1/next, in the deck “How Baesian learns from your answers”.

The record is in `.baesian/cards/B-rehdw/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

D83 put practice answers in the live layer only: never a verdict, never in the record, never sent to an agent. Both options keep to that. The design is in [[Practice Cards]].

Under the proposal, each practice answer is one small file: the card it was rebuilt from and its revision, your blind choice, your final answer's kind and option, when, and which client. Never what you typed into "Why?" or "Other answer", which go nowhere on a practice card. On the relay it's a table in the project's own object, like its retention and notification tables, so it's never in the log a machine reads, and `baesian sync` never brings it down. `inbox`, `wait`, the MCP tools and the plugin's hooks read only cards and verdicts. It's deleted with the project, and kept in the clone if the repo is linked later.

The blind test's marks are kept in the same place as the answers.
