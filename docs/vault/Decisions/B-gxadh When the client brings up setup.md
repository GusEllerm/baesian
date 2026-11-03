---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "When the client brings up setup: Once, in front of the cards (B-gxadh)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-gxadh
card: B-gxadh
revision: 1
title: When the client brings up setup
question: With no preference file, should the client offer the setup survey once in front of the cards, or only where you go looking for it?
answer: Once, in front of the cards
response: accept
not_chosen:
  - Only from your preferences and the empty desk
answered: 2026-11-03T17:02:25.668Z
answered_by: Gus Ellerm
topic: routing/first-setup/offer
deck: routing
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-03T16:43:37.943Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-5na1k When a repo first sets its sliders|B-5na1k]]"
---

# When the client brings up setup

With no preference file, should the client offer the setup survey once in front of the cards, or only where you go looking for it?

**Decided:** Once, in front of the cards, the agent's pick. Then the first time a browser opens a repo with no preference file, an offer card comes before the first card (not while an agent has stopped for you); Start or Not now, and it isn't offered again, though your preferences start it again.

**Not chosen:** Only from your preferences and the empty desk. Then nothing comes before the cards; the empty desk and your preferences offer the survey, and a repo stays on “Today” in shadow until you look for it.

**It turned on:** Is a one-time card in front of your first cards worth the interruption, to get setup done in one sitting? (a preference) If it is: Once, in front of the cards. If you'd rather go to it yourself: Only from your preferences and the empty desk.

**The fact given:** B-5na1k chose setup from example decisions, in one sitting. Every repo starts in shadow, holding nothing back, until you turn holding on (D148). The offer is kept per browser, so a second browser offers it again until a preference file exists.

**The agent's case:** Setup in one sitting is what B-5na1k chose; an offer you skip with one key costs less than a setting nobody finds, and most people keep the setting they're first offered.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-gxadh, revision 1). Filed by claude-code on v1/next, in the deck “Routing and preferences”.

The record is in `.baesian/cards/B-gxadh/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Built provisionally as the proposal (M8b, Client Build item 17). Changing it is a few lines in `Desk.tsx` (`offerDue`): the survey itself, and "Find a preset from example decisions" in your preferences, stay either way.
