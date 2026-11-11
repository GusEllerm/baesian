---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Which cards take two answers: Only the kinds a team marks (B-1yeqe)."
created: 2026-11-11
updated: 2026-11-11
tags:
  - baesian
  - decision
aliases:
  - B-1yeqe
card: B-1yeqe
revision: 1
title: Which cards take two answers
question: Should a card take two members' answers, each blind to the other, only on the kinds of decision a team marks, or on every hard card?
answer: Only the kinds a team marks
response: accept
not_chosen:
  - Every hard card
answered: 2026-11-11T18:06:10.180Z
answered_by: GusEllerm
topic: reviewers/two-answers
deck: reviewers
level: hard
reverse: cheap
touches:
  - user-facing
filed: 2026-11-11T17:50:46.193Z
filed_by: claude-code
branch: v1/next
---

# Which cards take two answers

Should a card take two members' answers, each blind to the other, only on the kinds of decision a team marks, or on every hard card?

**Decided:** Only the kinds a team marks, the agent's pick. Then one answer decides a card unless its kind is marked. Nothing is marked to start; a team marks, say, security or data loss, and those cards need two members who agree, or a third to settle it. It's built last.

**Not chosen:** Every hard card. Then every hard card needs two members' answers once a project has two members: security, privacy, money, data loss, publishing, and whatever a repo's settings raise to hard. The agent waits for both, and for a third when they differ.

**It turned on:** Is one person's answer enough on a hard card, unless a team says otherwise? (a preference) Yes, unless a team marks the kind: Only the kinds a team marks. No: hard cards take two: Every hard card.

**The fact given:** In systematic reviews, one screener missed about 1 relevant study in 10 and two independent screeners about 3 in 100, with more false alarms and more time. Reading mammograms twice helped in older studies and showed no significant gain in newer ones; reviewers of radiology suggest it only for high-risk cases. A second check that sees the first's answer, or the same automated recommendation, made no measurable difference; Baesian's would be blind to both. An agent can't proceed on a hard card until it's answered. In this repo, product behaviour and privacy are raised to hard, so both of today's cards were hard. On a project of two, 'every hard card' means both people answer each one.

**The agent's case:** The evidence favours doubling by risk, not everywhere, and a team knows which of its misses are costly better than a default does. 'Hard' already means the agent stops; making every such stop wait for two people slows the cards that block the most, and on a project of two it makes each one both people's job.

Answered by GusEllerm on 2026-11-11, through Baesian (card B-1yeqe, revision 1). Filed by claude-code on v1/next, in the deck “What several reviewers on a project means”. Context: [[Several Reviewers]], [[Several Reviewers - Research]].

The record is in `.baesian/cards/B-1yeqe/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The sources are in `docs/vault/Research/Several Reviewers - Research.md`, question 2: single against dual screening is Gartlehner et al. (2020) and Waffenschmidt et al. (2019); double reading, Taylor and Potts (2008), Posso et al. (2017), Geijer and Geijer (2018); checks that aren't independent, Westbrook et al. (2021) and Skitka et al. (2000).
