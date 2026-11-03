---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Where you merge duplicate topics: On the card, when its topic is near another (B-mbzsj)."
created: 2026-11-01
updated: 2026-11-01
tags:
  - baesian
  - decision
aliases:
  - B-mbzsj
card: B-mbzsj
revision: 2
title: Where you merge duplicate topics
question: Where in the client should you merge two topics that mean the same thing?
answer: On the card, when its topic is near another
response: accept
not_chosen:
  - A list of topics in the More menu
answered: 2026-11-01T19:34:24.354Z
answered_by: Gus Ellerm
topic: client/topics
deck: finishing-m4
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-01T19:28:20.361Z
filed_by: claude-code
branch: main
---

# Where you merge duplicate topics

Where in the client should you merge two topics that mean the same thing?

**Decided:** On the card, when its topic is near another, the agent's pick. Then a card whose topic is close to an existing one asks "Same topic as storage/run-metadata?", and one click merges them.

**Not chosen:** A list of topics in the More menu. Then every topic, with how many cards use it; you pick two and merge them, whenever you look.

**It turned on:** Will you notice duplicate topics while answering cards, or only when you look over all of them? While answering: On the card, when its topic is near another. Only looking over them: A list of topics in the More menu.

**The fact given:** Topics split when two agents name one subject differently, such as client/auth and server/session-token for where the token lives. Then a repeat question isn't caught when it's filed, the earlier answer isn't shown on the card, and two branches deciding it differently aren't flagged at merge. It hasn't happened in this repo yet.

**The agent's case:** A duplicate is easiest to judge with the card in front of you, and it's caught before it spreads. But the card can only offer the merges that look near; a split like client/auth and server/session-token shows up only in a list.

Answered by Gus Ellerm on 2026-11-01, through Baesian (card B-mbzsj, revision 2). Filed by claude-code on main, in the deck “Finishing M4: rules and topic merging”.

The record is in `.baesian/cards/B-mbzsj/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

**When it occurs.** Topic keys are free-form (D44), and every agent names its own. Two cards about one subject end up under two keys when the names differ: `client/auth` and `server/session-token`, or `storage/run-metadata` and `db/runs`. `baesian file` warns an agent only when the new key is within two edits of an existing one, or ends the same way (`storage/run-metadata` and `db/run-metadata`), and the agent can keep its own key anyway.

**Why it matters.** Topics are what Baesian matches on:
- **filing:** a card on the same topic as an open or settled one is stopped as a possible duplicate (D36), so a repeat on a split topic gets through, and you answer it twice;
- **the card:** the precedent shown is the newest settled decision on the same topic;
- **merging a branch:** two branches that settled the same topic differently become a conflict card (D45), but not if the topics differ.

**How often.** Not yet seen here: this repo has four cards. It grows with the number of agents and sessions naming topics on their own. Today shows the opposite case too: the agent split `client/rules` on purpose, because its follow-on card has a different subject, and merging those would be wrong. Merges need your judgment either way; nothing merges by itself.
