---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "What a project's page shows while it loads: Show the last copy, then refresh (B-3va5g)."
created: 2026-11-11
updated: 2026-11-11
tags:
  - baesian
  - decision
aliases:
  - B-3va5g
card: B-3va5g
revision: 1
title: What a project's page shows while it loads
question: When you open a project you've already had open in this tab, should its page show the cards from that visit at once while it refreshes, or wait for a fresh copy as it does now?
answer: Show the last copy, then refresh
response: accept
not_chosen:
  - Wait for a fresh copy
answered: 2026-11-11T03:40:54.906Z
answered_by: GusEllerm
topic: website/project-state-kept
deck: website-speed
level: hard
reverse: cheap
touches:
  - user-facing
filed: 2026-11-11T03:32:28.883Z
filed_by: claude-code
branch: v1/next
---

# What a project's page shows while it loads

When you open a project you've already had open in this tab, should its page show the cards from that visit at once while it refreshes, or wait for a fresh copy as it does now?

**Decided:** Show the last copy, then refresh, the agent's pick. Then the desk appears as soon as you open the project, from the copy this tab already had, marked as refreshing; the fresh copy replaces it about 1.5 seconds later, and answering waits until it has, so you never answer a card someone answered elsewhere in the meantime.

**Not chosen:** Wait for a fresh copy. Then only your account and the list of projects are kept between pages; each project's cards are fetched afresh every time you open it, about 1.5 seconds with the duplicate fetch fixed, before the desk appears.

**It turned on:** Is seeing a project's cards at once worth their being briefly out of date, with answering held until they're fresh? (a preference) Yes: Show the last copy, then refresh. No: Wait for a fresh copy.

**The fact given:** Opening a project now takes about 2.3 seconds before its desk shows. Its state is 894 KB (215 KB sent): the whole project, every card ever filed, 784 KB of it the cards' text. It takes 1.4 to 1.5 seconds, and then comes a second time (0.8 seconds) through a bug that gets fixed either way. Going back to your projects and opening it again costs the same: nothing is kept. While a project's page is open, its live connection brings every change within a moment. The latest answer on a card is the one that counts, so an answer given to an out-of-date copy of a card someone has since answered elsewhere would replace theirs.

**First chose:** Wait for a fresh copy, then switched once the agent's pick was shown.

**The agent's case:** The delay you noticed is between pages in one tab, and the account page is already instant there because its copy is kept and refreshed behind it. A project's copy from earlier in the same tab is only as old as when you left it, and comes current within about 1.5 seconds; holding answers until then removes the one risk.

**Wrong if:** you reach for a card before answering is let through, often enough that the held swipe feels broken. **To check:** how often in a week the desk was still refreshing when you tried to answer.

Answered by GusEllerm on 2026-11-11, through Baesian (card B-3va5g, revision 1). Filed by claude-code on v1/next, in the deck “How the website keeps what it has loaded”.

The record is in `.baesian/cards/B-3va5g/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Measured on baesian.dev on 2026-11-10, in Chrome on a Mac, for the Baesian project (217 cards): `/state` took 1,377 to 1,483 ms and then was fetched again (832 to 843 ms) because the live connection's first message arrives before the first fetch has recorded its version. Presence, practice answers and paused machines are only asked for after that. The first load of the site also fetches the account twice at once. Both duplicates are bugs and are fixed whichever you pick.

Either way, only the open tab keeps anything: a reload or a new tab starts empty. Whether to keep cards on the device between visits is its own question, on a card of its own.
