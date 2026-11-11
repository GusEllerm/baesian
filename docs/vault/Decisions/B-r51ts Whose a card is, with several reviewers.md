---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Whose a card is, with several reviewers: Every member's (B-r51ts)."
created: 2026-11-11
updated: 2026-11-11
tags:
  - baesian
  - decision
aliases:
  - B-r51ts
card: B-r51ts
revision: 1
title: Whose a card is, with several reviewers
question: With several members on a project, is each card one member's to answer, by name, or every member's until one of them answers?
answer: Every member's
response: alternative
not_chosen:
  - One member's, by name
answered: 2026-11-11T18:04:46.676Z
answered_by: GusEllerm
topic: reviewers/whose-card
deck: reviewers
level: hard
reverse: moderate
touches:
  - user-facing
filed: 2026-11-11T17:50:24.893Z
filed_by: claude-code
branch: v1/next
---

# Whose a card is, with several reviewers

With several members on a project, is each card one member's to answer, by name, or every member's until one of them answers?

**Decided:** Every member's, the alternative. Then each card is in every member's queue, and the first to answer decides it for all. Nothing is assigned, passed or covered; a card leaves every queue when it's answered.

**Not chosen:** One member's, by name, the agent's pick. Then each card has one reviewer at a time. It's in their queue alone; the others see it listed as with them. It can be passed on, and goes to a next person when its reviewer is away and an agent waits.

**It turned on:** When a card waits, should it always be one named person's to answer, or should anyone on the project be able to clear it? (a preference) One named person's: One member's, by name. Anyone's: Every member's.

**The fact given:** In a randomised experiment at Meta, naming one reviewer where only a team had been assigned cut time in review by 11.6%, with no sign of rushed reviews. A request by email got a reply from 38% of people addressed alone and 14% of those addressed with fourteen others. Task tools (Linear, Asana, Front) allow one assignee. Approval tools mostly do the opposite: on GitHub, Azure and Slack, any one of a named few can approve, and the first to act decides. With one person's, a card can wait on someone who's away, so it needs a way to move; with everyone's, each member is notified of every card.

**Comment:** "It seems simpler to me to make cards available to all members. To route a card to  a specific person could block development until they action it right? Perhaps there is a middle ground, cards are sent to others and team members can see that?"

**The agent's case:** An agent's wait should name a person. The evidence that a request to a group is slower is direct, and feeling personally accountable is one of the few things shown to reduce deference to an automated proposal. It also keeps each person's calibration their own: with everyone's, who answers a card is whoever was there.

Answered by GusEllerm on 2026-11-11, through Baesian (card B-r51ts, revision 1). Filed by claude-code on v1/next, in the deck “What several reviewers on a project means”. Context: [[Several Reviewers]], [[Several Reviewers - Research]].

The record is in `.baesian/cards/B-r51ts/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The sources are in `docs/vault/Research/Several Reviewers - Research.md`, question 1: Meta's experiment is Rigby et al. (arXiv 2312.17169), and the email study is Blair, Thompson and Wuensch (2005).
