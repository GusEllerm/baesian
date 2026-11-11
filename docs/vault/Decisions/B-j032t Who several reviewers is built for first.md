---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Who several reviewers is built for first: A few developers on one repo (B-j032t)."
created: 2026-11-11
updated: 2026-11-11
tags:
  - baesian
  - decision
aliases:
  - B-j032t
card: B-j032t
revision: 1
title: Who several reviewers is built for first
question: Should several reviewers be built first for a few developers each running their own agents, or for a group whose members own different kinds of decision?
answer: A few developers on one repo
response: accept
not_chosen:
  - A group with kinds of decision
answered: 2026-11-11T18:03:09.519Z
answered_by: GusEllerm
topic: reviewers/first-team
deck: reviewers
level: hard
reverse: moderate
touches:
  - user-facing
filed: 2026-11-11T17:50:21.987Z
filed_by: claude-code
branch: v1/next
---

# Who several reviewers is built for first

Should several reviewers be built first for a few developers each running their own agents, or for a group whose members own different kinds of decision?

**Decided:** A few developers on one repo, the agent's pick. Then the first build is members and whose card it is: a card goes to whoever runs its agent, with no map to write. The map from kinds of decision to people, and cover, come second.

**Not chosen:** A group with kinds of decision. Then the first build includes the map: each kind of decision or area names its person, and a card goes there whoever runs the agent. Developers with no map to write get theirs second.

**It turned on:** Which team do you want using this first: developers who each steer their own agents, or people who each own a kind of decision? (a preference) Developers with their own agents: A few developers on one repo. Owners of kinds of decision: A group with kinds of decision.

**The fact given:** Your shared repo, chorus_conservancy, has collaborators and runs Baesian in personal mode; a second person can't join a project today. The research group with persistent agents on shared machines is listed as later in the design. With developers first, a second member can join and be asked the right cards with nothing written down. With owners of kinds first, someone writes a map before it's useful, and it's the case no existing tool handles: every tool found routes by file path or by service, never by kind of decision.

**The agent's case:** It's the team you already have, and the one that needs no setup: the research found that routing machinery adds little where people know whom to ask. The map is an addition on top of it, not a different design, so nothing built first is thrown away.

Answered by GusEllerm on 2026-11-11, through Baesian (card B-j032t, revision 1). Filed by claude-code on v1/next, in the deck “What several reviewers on a project means”. Context: [[Several Reviewers]], [[Several Reviewers - Research]].

The record is in `.baesian/cards/B-j032t/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The proposal is `docs/vault/Design/Several Reviewers.md`, and its stages are: members and whose card it is; the map and cover; two answers. This card decides which of the first two comes first. Either way both are built.
