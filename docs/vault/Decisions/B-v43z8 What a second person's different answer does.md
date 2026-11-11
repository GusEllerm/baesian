---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "What a second person's different answer does: Someone settles it (B-v43z8)."
created: 2026-11-11
updated: 2026-11-11
tags:
  - baesian
  - decision
aliases:
  - B-v43z8
card: B-v43z8
revision: 1
title: What a second person's different answer does
question: When a member answers a card someone else decided, and chooses differently, does someone settle it with both answers kept, or does the latest answer decide?
answer: Someone settles it
response: accept
not_chosen:
  - The latest answer decides
answered: 2026-11-11T18:05:21.114Z
answered_by: GusEllerm
topic: reviewers/second-answer
deck: reviewers
level: hard
reverse: moderate
touches:
  - user-facing
filed: 2026-11-11T17:50:43.936Z
filed_by: claude-code
branch: v1/next
---

# What a second person's different answer does

When a member answers a card someone else decided, and chooses differently, does someone settle it with both answers kept, or does the latest answer decide?

**Decided:** Someone settles it, the agent's pick. Then nothing changes until the difference is raised. Then the card's reviewer gets the two answers as a card, unnamed until they choose; an owner settles what they can't. The answer not taken stays with the decision, with its reason.

**Not chosen:** The latest answer decides. Then the card's answer becomes the second person's at once, as it would today, and its agent is told the answer changed and who changed it. The earlier answer stays in the record as an earlier answer.

**It turned on:** When two people on a project answer the same card differently, should the second answer replace the first? (a preference) No: someone settles it: Someone settles it. Yes: the latest decides: The latest answer decides.

**The fact given:** Today the latest answer on a card decides it, whoever gives it, and the agent gets a brief saying the answer changed, by whom, and which commits were built on the old one. People differ often: on patches scored by more than one reviewer, 15% to 37% had conflicting scores, and the objection usually came second; this project's own blind agreement with its agent was 59% when last measured. Cochrane's rule for two reviewers is to set beforehand how a disagreement is settled, and to keep both original answers. Settling adds a step, and a card, each time two people differ.

**The agent's case:** With several people, a changed answer stops being one person changing their mind. Letting the last to look decide makes the outcome depend on who looked last, and sends the agent to rework on a difference nobody has weighed. A named person settling it, with the other view kept, is how every process the research found ends a disagreement.

Answered by GusEllerm on 2026-11-11, through Baesian (card B-v43z8, revision 1). Filed by claude-code on v1/next, in the deck “What several reviewers on a project means”. Context: [[Several Reviewers]], [[Several Reviewers - Research]].

The record is in `.baesian/cards/B-v43z8/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The sources are in `docs/vault/Research/Several Reviewers - Research.md`, question 3: the conflicting scores are Hirao et al. (IEEE TSE 2020), on OpenStack and Qt; the 59% is this repo's record as of 2026-11-05 (75 of 128 blind choices).
