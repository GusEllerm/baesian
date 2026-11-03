---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Preferences when a repo has several reviewers: One set per repo in v1 (B-93n77)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-93n77
card: B-93n77
revision: 1
title: Preferences when a repo has several reviewers
question: With more than one reviewer on a repo, should v1 keep one set of sliders, or also let each reviewer ask to see more for themselves?
answer: One set per repo in v1
response: accept
not_chosen:
  - Personal additions, strictest wins
answered: 2026-11-03T13:46:29.331Z
answered_by: Gus Ellerm
topic: routing/several-reviewers
deck: routing
level: provisional
reverse: cheap
touches:
  - user-facing
  - schema
filed: 2026-11-03T13:36:48.338Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-refpb Where a repo's preferences are kept|B-refpb]]"
---

# Preferences when a repo has several reviewers

With more than one reviewer on a repo, should v1 keep one set of sliders, or also let each reviewer ask to see more for themselves?

**Decided:** One set per repo in v1, the agent's pick. Every reviewer works from the repo's sliders (D131). Anyone who wants to see more moves a row for everyone. A personal layer waits until repos have several reviewers, as a new kind of file.

**Not chosen:** Personal additions, strictest wins. Each reviewer may raise rows for themselves, never lower them, and a card is shown, not held, if anyone's setting asks for it. v1 gains a personal preference file and a gate-record field naming whose setting applied.

**It turned on:** Will a repo using v1 have more than one person answering its cards? Rarely, in v1: One set per repo in v1. Yes, often: Personal additions, strictest wins.

**The fact given:** D131 set sliders per repo and rejected sliders per person. P15 proposes one owner per hosted project in v1, with inviting others left open. Locally, each verdict names its reviewer. After v1, adding the layer means a new kind of file and a gate-record format 2 (D156).

**First chose:** Personal additions, strictest wins, then switched once the agent's pick was shown.

**The agent's case:** With one owner per project in P15's v1 there's no one for a personal layer to serve yet, and adding it later is a new file rather than a change to the ones v1 writes.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-93n77, revision 1). Filed by claude-code on v1/next, in the deck “Routing and preferences”.

The record is in `.baesian/cards/B-93n77/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

P14's decision 15 ([[Routing and Preferences]], section 4). The research's version: anyone may ask to see more, and only the repo may let the agent decide more ([[Preference Sliders and the Gate]], section 8, decision 16). Risk criteria differ by developer and team (Shihab), which is the case for the layer. Two linked questions stay open with it: whose verdicts count toward a row's misses, and whether rows route to different people. Who may change the repo's preferences, and whose passkey signs them, is open in P15 ([[Hosted Service]], "Members"; [[Formats for v1]], open questions). The alternative revises D131 in part.
