---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How your projects page hears of new cards: Told by each project (B-gty71)."
created: 2026-11-11
updated: 2026-11-11
tags:
  - baesian
  - decision
aliases:
  - B-gty71
card: B-gty71
revision: 1
title: How your projects page hears of new cards
question: While your projects page is open, should each project tell it when its cards change, or should the page ask every project again every half minute?
answer: Told by each project
response: accept
not_chosen:
  - Asked every half minute
answered: 2026-11-11T16:13:16.781Z
answered_by: GusEllerm
topic: website/inbox-updates
deck: projects-page
level: hard
reverse: cheap
touches:
  - user-facing
filed: 2026-11-11T16:12:37.023Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-wgbdh Where the projects page gets its waiting counts|B-wgbdh]]"
---

# How your projects page hears of new cards

While your projects page is open, should each project tell it when its cards change, or should the page ask every project again every half minute?

**Decided:** Told by each project, the agent's pick. Then the page holds a live connection to each of your projects, the one a project's desk already uses, and asks a project for its count again whenever it says it changed. A new card shows within a second or two.

**Not chosen:** Asked every half minute. Then the page asks every project for its count every 30 seconds while it's in view, and when its window comes back to the front. A new card shows within half a minute, and nothing is held open.

**It turned on:** Should a card filed while you're looking at your projects page show within a second or two, or is within half a minute soon enough? (a preference) A second or two: Told by each project. Half a minute is enough: Asked every half minute.

**The fact given:** Today the page asks each project for its count when it opens, and again when its tab comes back into view after being hidden. There's no timer, so a card filed while the page stays in view doesn't show until you reload. Each project already has a live connection that says when anything in it changes; a project's desk uses it. Holding one open costs next to nothing while the project is quiet, and the page would hold one per project (you have 2). While an agent waits on a card, its project says it changed every 30 seconds. Asking a project for its count takes 0.5 to 0.7 seconds of its work today, and much less once the state is kept (B-evrec).

**The agent's case:** You'd just been told a card was filed, looked at the page, and it wasn't there: half a minute is long enough that you'd still reload. A project's desk already updates the moment a card arrives, and the projects page sits one click above it, so it should be no staler. The connection is one the service already has, and the page asks for a count only when something changed, where a timer asks every project every half minute whether anything did or not.

**Wrong if:** a count on the projects page is behind the project's desk by more than a few seconds while both are open. **To check:** open the projects page and a project's desk side by side, file a card, and watch both.

Answered by GusEllerm on 2026-11-11, through Baesian (card B-gty71, revision 1). Filed by claude-code on v1/next, in the deck “What the projects page shows of each project's waiting cards”.

The record is in `.baesian/cards/B-gty71/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Either way the page keeps asking when it opens and when its tab comes back into view, and shows what the tab last heard until the answer comes. With the live connection, the page reopens a connection that drops (a laptop waking, a network change) and asks that project again as it does, as a project's desk does.
