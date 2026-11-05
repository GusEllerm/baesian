---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Which branch is the trunk: Say it (B-jr8mk)."
created: 2026-11-05
updated: 2026-11-05
tags:
  - baesian
  - decision
aliases:
  - B-jr8mk
card: B-jr8mk
revision: 1
title: Which branch is the trunk
question: Should the state the branches panel reads say which branch is the repo's default, instead of the panel guessing that main is the trunk?
answer: Say it
response: accept
not_chosen:
  - Keep guessing
answered: 2026-11-05T20:17:46.667Z
answered_by: GusEllerm
topic: client/branches/trunk
deck: branches-view
level: provisional
reverse: cheap
touches:
  - public-api
filed: 2026-11-05T20:15:49.191Z
filed_by: claude-code
branch: v1/next
---

# Which branch is the trunk

Should the state the branches panel reads say which branch is the repo's default, instead of the panel guessing that main is the trunk?

**Decided:** Say it, the agent's pick. The command line reads the repo's default branch (the remote's HEAD, or the branch init ran on) and the state carries it, synced like the branch names it already holds. The panel puts that branch on top, and never gives it an end state.

**Not chosen:** Keep guessing. The panel takes main, then master, then the branch with the earliest and latest events as the trunk. A repo whose trunk is develop or trunk gets it wrong until it's recognised.

**It turned on:** Is a repo whose default branch isn't main or master common enough to send one more field? Yes: Say it. No: Keep guessing.

**The fact given:** The service already keeps branch names, from each card (B-nkbqs). The guess got this repo's history right only because its trunk is main.

**The agent's case:** One field ends a class of wrong drawings, and it's a fact the command line can read in a millisecond.

Answered by GusEllerm on 2026-11-05, through Baesian (card B-jr8mk, revision 1). Filed by claude-code on v1/next, in the deck “The branches panel, redrawn”.

The record is in `.baesian/cards/B-jr8mk/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.
