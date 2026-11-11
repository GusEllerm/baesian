---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Who changes a project's settings and rules: Only its owners (B-rxbss)."
created: 2026-11-11
updated: 2026-11-11
tags:
  - baesian
  - decision
aliases:
  - B-rxbss
card: B-rxbss
revision: 1
title: Who changes a project's settings and rules
question: On a project with several members, may any member change the gate's settings and accept rules, or only its owners?
answer: Only its owners
response: accept
not_chosen:
  - Any member
answered: 2026-11-11T18:13:58.176Z
answered_by: GusEllerm
topic: reviewers/settings-and-rules
deck: reviewers-joining
level: hard
reverse: cheap
touches:
  - user-facing
filed: 2026-11-11T18:10:51.875Z
filed_by: claude-code
branch: v1/next
---

# Who changes a project's settings and rules

On a project with several members, may any member change the gate's settings and accept rules, or only its owners?

**Decided:** Only its owners, the agent's pick. Then a project can have more than one owner. Owners change the gate's settings, accept rules, add and remove members, and settle a difference two members can't. A member's request for a rule goes to an owner as a card.

**Not chosen:** Any member. Then every member can change the settings and accept rules, as the one reviewer can now; letting more cards past still takes that member's passkey. Owners only add and remove members.

**It turned on:** Do a project's settings and rules belong to everyone on it, or to the people who run it? (a preference) The people who run it: Only its owners. Everyone on it: Any member.

**The fact given:** The gate's settings decide which cards are held back, for every agent in the repo, and a rule binds every agent. Today whoever answers can change both; letting more past takes their passkey. Five coding agents' team controls (Claude Code, Codex, Cursor, Factory, Devin) work the same way: the team's admins set the limits, and a person may only tighten them for themselves. On a project of two or three peers, 'only its owners' means the others ask, unless they're made owners too.

**The agent's case:** Settings and rules act on everyone's agents, so changing them is a different act from answering a card. Every team control the research found keeps it with the people who run the team. Peers lose nothing: a project can have several owners, so a small team can make everyone one.

Answered by GusEllerm on 2026-11-11, through Baesian (card B-rxbss, revision 1). Filed by claude-code on v1/next, in the deck “Several reviewers: who's told, who joins, who's trusted”. Context: [[Several Reviewers]], [[Several Reviewers - Research]].

The record is in `.baesian/cards/B-rxbss/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

You answered that a different answer is settled by someone (B-v43z8): on either option, an owner settles what two members can't.
