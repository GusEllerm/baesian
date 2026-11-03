---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "What the local client does in a hosted repo: It opens the website for the project (B-k216t)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-k216t
card: B-k216t
revision: 1
title: What the local client does in a hosted repo
question: In a repo connected to the hosted service, what should baesian serve offer?
answer: It opens the website for the project
response: accept
not_chosen:
  - It still answers, as today
answered: 2026-11-03T01:48:17.905Z
answered_by: Gus Ellerm
topic: hosted/local-client
deck: hosted
level: blocking
reverse: cheap
touches:
  - user-facing
  - public-api
filed: 2026-11-03T01:37:27.339Z
filed_by: claude-code
branch: overnight/2026-11-03
---

# What the local client does in a hosted repo

In a repo connected to the hosted service, what should baesian serve offer?

**Decided:** It opens the website for the project, the agent's pick. In a hosted repo, baesian serve opens the project's page on the website, and every answer comes from there, signed. The local client stays as it is for repos without the service (D8).

**Not chosen:** It still answers, as today. Then baesian serve works in hosted repos as it does now, offline included. Its answers are written on the machine and uploaded later; they can't carry the service's signature, so they can't count where signed answers are required.

**It turned on:** Will you need to answer cards in a hosted repo while the website is unreachable? Rarely: It opens the website for the project. Often enough to matter: It still answers, as today.

**The fact given:** Agents keep working offline either way: filing, the commit gate and baesian verify don't need the website (D127). Only answering would wait. Both clients are the same React app (D32), so the choice is about where answers may come from, not about building a second client.

**The agent's case:** One path for answers keeps every answer in a hosted repo signed, with no exceptions to explain.

**Wrong if:** Dogfooding shows answers held up by an outage or a flight, or the website feels slow beside the terminal in coupled mode. **To check:** Log attempts to answer while the relay is unreachable, in dogfooding.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-k216t, revision 1). Filed by claude-code on overnight/2026-11-03, in the deck “The hosted service”.

The record is in `.baesian/cards/B-k216t/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

`baesian serve` is today's local client, on 127.0.0.1 with a fresh token (D62, D97, D103). In a hosted repo, the website is also a client. If answers must be signed (H3), an answer given locally can't count until something signs it. See [[Hosted Service]], section 9.
