---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Who a card reaches first: Whoever runs the agent (B-2n7s4)."
created: 2026-11-11
updated: 2026-11-11
tags:
  - baesian
  - decision
aliases:
  - B-2n7s4
card: B-2n7s4
revision: 1
title: Who a card reaches first
question: When no map names anyone for a card, should it go first to the member running its agent, or to the project's owner, who passes it on?
answer: Whoever runs the agent
response: accept
not_chosen:
  - The project's owner
answered: 2026-11-11T18:05:31.800Z
answered_by: GusEllerm
topic: reviewers/first-reviewer
deck: reviewers
level: hard
reverse: cheap
touches:
  - user-facing
filed: 2026-11-11T17:50:41.007Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-r51ts Whose a card is, with several reviewers|B-r51ts]]"
---

# Who a card reaches first

When no map names anyone for a card, should it go first to the member running its agent, or to the project's owner, who passes it on?

**Decided:** Whoever runs the agent, the agent's pick. Then a card is its agent's person's: the account whose machine filed it. It reaches an owner only from a shared machine, or when that person has left. Teammates see it listed, and can answer it themselves once it's decided.

**Not chosen:** The project's owner. Then every card lands with an owner first, who answers it or passes it to a member. One person sees every decision as it's made; the others get what's passed to them.

**It turned on:** Should a card reach the person closest to the work first, or one person who sees them all? (a preference) The person closest to the work: Whoever runs the agent. One person who sees them all: The project's owner.

**The fact given:** Each machine signs in as one account, so the relay knows whose agent filed a card. In DORA's 2019 survey, teams whose changes were approved by a body outside the team were 2.6 times likelier to be low performers, with no evidence of fewer failed changes. Reviewers who know the area review faster and give deeper feedback (a Microsoft study of 873 programmers). On the other side: GitHub stops whoever asked its coding agent for a pull request from approving it, and Linear puts a triage inbox in front of a team, where one person accepts or assigns everything. Either way, the merge gate and code review still show a teammate what was decided on a branch.

**The agent's case:** The person steering the agent has the context, and is usually the one waiting on it. Sending everything through one person makes them the bottleneck the research warns about, and it's the same person every time, which is how volume turns into rubber-stamping. The team still sees every decision: at merge, in review, and on the desk.

Answered by GusEllerm on 2026-11-11, through Baesian (card B-2n7s4, revision 1). Filed by claude-code on v1/next, in the deck “What several reviewers on a project means”. Context: [[Several Reviewers]], [[Several Reviewers - Research]].

The record is in `.baesian/cards/B-2n7s4/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

This card assumes a card is one member's (B-r51ts). The sources are in `docs/vault/Research/Several Reviewers - Research.md`, questions 1 and 2: DORA's Accelerate State of DevOps 2019; Bacchelli and Bird (ICSE 2013); GitHub's documentation of its Copilot cloud agent; Linear's of triage.
