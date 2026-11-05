---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Naming who filed each card in baesian list: Once, in the headline, when they all share it (B-gff98)."
created: 2026-11-05
updated: 2026-11-05
tags:
  - baesian
  - decision
aliases:
  - B-gff98
card: B-gff98
revision: 1
title: Naming who filed each card in baesian list
question: When every card baesian list shows was filed by the same agent on the same branch, should the list say so once, or on every row as now?
answer: Once, in the headline, when they all share it
response: accept
not_chosen:
  - On every row, as now
answered: 2026-11-05T19:54:44.815Z
answered_by: GusEllerm
topic: cli/output/list-attribution
deck: cli-output
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-05T19:52:07.287Z
filed_by: claude-code
branch: v1/next
---

# Naming who filed each card in baesian list

When every card baesian list shows was filed by the same agent on the same branch, should the list say so once, or on every row as now?

**Decided:** Once, in the headline, when they all share it, the agent's pick. The headline says "all filed by claude-code on main (an agent), in deck branch-main", and the rows are columns: ID, status, level, topic, and the title, still in quotes. Rows by different authors name theirs in a column of its own.

**Not chosen:** On every row, as now. Each row keeps "title by claude-code on main (an agent): …", about 150 characters a row, which wraps on most terminals.

**It turned on:** Does each title need its author beside it, when one author wrote them all? No: Once, in the headline, when they all share it. Yes: On every row, as now.

**The fact given:** D169 has Baesian quote text agents wrote and name who wrote it, so an agent's words are never read as Baesian's. Titles stay in quotes either way; only where the author's name appears changes.

**The agent's case:** Naming the author once still says who wrote every quoted title, and the list becomes something you can scan.

Answered by GusEllerm on 2026-11-05, through Baesian (card B-gff98, revision 1). Filed by claude-code on v1/next, in the deck “What the command line prints”.

The record is in `.baesian/cards/B-gff98/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Today:

```
B-6pmvp  returned   hard         title by claude-code on main (an agent): "Where the session token lives"  [auth/session-token-storage; deck branch-main]
```

Proposed:

```
5 cards: 3 resolved, 1 returned to its agent, 1 withdrawn
  all filed by claude-code on main (an agent), in deck branch-main
  id       status     level        topic                       title
  B-6pmvp  returned   hard         auth/session-token-storage  "Where the session token lives"
```
