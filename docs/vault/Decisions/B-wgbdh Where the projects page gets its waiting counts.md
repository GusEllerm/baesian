---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Where the projects page gets its waiting counts: Asked of each project (B-wgbdh)."
created: 2026-11-11
updated: 2026-11-11
tags:
  - baesian
  - decision
aliases:
  - B-wgbdh
card: B-wgbdh
revision: 1
title: Where the projects page gets its waiting counts
question: Should your projects page read how many cards wait for you in each project from the accounts database, where each project keeps its count up to date, or ask each project when the page opens?
answer: Asked of each project
response: alternative
not_chosen:
  - Kept in the accounts database
answered: 2026-11-11T03:40:13.112Z
answered_by: GusEllerm
topic: website/waiting-counts
deck: projects-page
level: hard
reverse: moderate
touches:
  - schema
  - public-api
  - privacy
filed: 2026-11-11T03:39:07.696Z
filed_by: claude-code
branch: v1/next
---

# Where the projects page gets its waiting counts

Should your projects page read how many cards wait for you in each project from the accounts database, where each project keeps its count up to date, or ask each project when the page opens?

**Decided:** Asked of each project, the alternative. Then a new address, GET /v1/projects/{project}/waiting, counts from the project's own store; the projects page lists your projects at once and asks every one of them in parallel, each request waking that project's relay.

**Not chosen:** Kept in the accounts database, the agent's pick. Then the accounts database keeps, for each project and account, how many cards wait and at which levels, written by the project whenever that changes; GET /v1/account returns them with your projects, in its one request; the privacy policy lists the counts.

**It turned on:** Should opening your projects page cost one request however many projects you have, or ask each project afresh for an exact count? One request: Kept in the accounts database. Ask each afresh: Asked of each project.

**The fact given:** Each project's relay already works out the cards waiting for you, for its notifications: open cards and drawn audits, with their levels. The projects page reads your account and its projects in one request to the accounts database, 0.2 to 0.7 seconds. Asking a project wakes its relay, 0.1 to 0.8 seconds each, in parallel. You have 2 projects. A stored count is a new table in the accounts database, added by a migration, and could be out of date if a project's write to it failed, until that project next changes. Once cards go to several people, the counts differ by person, so either way they're kept or asked per account. The privacy policy lists everything the service keeps; a stored count is a new item there, counts and levels only, as a notification already says them.

**The agent's case:** The page stays one request however many projects you have, and the counts come with the list, so nothing pops in a moment later. The project that changes is the one that writes, right after it works out what's waiting for its notifications, and the alarm that does that already tries again when something fails.

**Wrong if:** a count on the projects page disagrees with what the project's desk shows. **To check:** open each project from the projects page for a week and compare the count with the desk.

Answered by GusEllerm on 2026-11-11, through Baesian (card B-wgbdh, revision 1). Filed by claude-code on v1/next, in the deck “What the projects page shows of each project's waiting cards”.

The record is in `.baesian/cards/B-wgbdh/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The count is "waiting for you": what the desk's queue holds and a notification counts, not cards answered or held back. A project's row is written when a card is filed, answered, withdrawn, revised or drawn as an audit, and once when the project first wakes after this ships, so existing projects get theirs.
