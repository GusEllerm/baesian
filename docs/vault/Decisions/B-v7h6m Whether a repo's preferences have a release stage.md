---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Whether a repo's preferences have a release stage: No stage in v1 (B-v7h6m)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-v7h6m
card: B-v7h6m
revision: 1
title: Whether a repo's preferences have a release stage
question: Should the preferences carry a release stage that moves several rows together when you ship, or do you change presets or rows yourself?
answer: No stage in v1
response: accept
not_chosen:
  - A release stage in the preferences
answered: 2026-11-03T13:47:01.785Z
answered_by: Gus Ellerm
topic: routing/release-stage
deck: routing
level: provisional
reverse: cheap
touches:
  - schema
  - user-facing
filed: 2026-11-03T13:36:48.515Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-refpb Where a repo's preferences are kept|B-refpb]]"
---

# Whether a repo's preferences have a release stage

Should the preferences carry a release stage that moves several rows together when you ship, or do you change presets or rows yourself?

**Decided:** No stage in v1, the agent's pick. Shipping changes nothing by itself. To be asked more about public interfaces and data formats once you have users, you switch preset or move those rows; each change is a new preference file.

**Not chosen:** A release stage in the preferences. The preference file gains a stage: prototype, pre-release or released. Moving to released raises chosen rows, such as public interfaces and data formats, one stop over your own settings, in one change.

**It turned on:** When you ship, would you rather flip one setting than move the rows that matter yourself? (a preference) I'd move them myself: No stage in v1. One setting, please: A release stage in the preferences.

**The fact given:** Practitioners treat interfaces and schemas as costlier to change once others depend on them (Hyrum's law; Google's reviews differ at alpha, beta and GA). A preference file holds every row (P16), so switching preset replaces rows you moved by hand. No study tests a stage setting.

**First chose:** A release stage in the preferences, then switched once the agent's pick was shown.

**The agent's case:** A stage is a second dial over the rows, one more thing to explain and to record in each gate record; moving two or three rows when you ship is a small cost, and a stage can be added later.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-v7h6m, revision 1). Filed by claude-code on v1/next, in the deck “Routing and preferences”.

The record is in `.baesian/cards/B-v7h6m/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The second half of P14's decision 17 ([[Routing and Preferences]], section 5, "Not needed before v1"). The research proposes a repo-level stage that moves several rows together, from Fowler, Hyrum's law and Google's release stages ([[Preference Sliders and the Gate]], section 3, "Modifiers, not axes", and section 8, decision 12). The first half, a novelty fact, isn't carded: D145 has v1's gate route on each card's stated facts only, so that the CLI, the relay and CI reach the same answer, and novelty would be derived from a record that differs between them.
