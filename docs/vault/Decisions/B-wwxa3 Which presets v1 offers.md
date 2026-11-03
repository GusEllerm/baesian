---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Which presets v1 offers: Three presets, as starting guesses (B-wwxa3)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-wwxa3
card: B-wwxa3
revision: 1
title: Which presets v1 offers
question: Should v1 offer two looser presets beside "Today" as starting guesses, or only "Today" until this repo's shadow record shows what fits?
answer: Three presets, as starting guesses
response: accept
not_chosen:
  - Only "Today" until the record shows what fits
answered: 2026-11-03T13:43:04.759Z
answered_by: Gus Ellerm
topic: routing/presets
deck: routing
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-03T13:36:48.158Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-0pfbf Whether the gate holds cards back|B-0pfbf]]"
  - "[[B-pn3g1 How low security cards may go|B-pn3g1]]"
---

# Which presets v1 offers

Should v1 offer two looser presets beside "Today" as starting guesses, or only "Today" until this repo's shadow record shows what fits?

**Decided:** Three presets, as starting guesses, the agent's pick. Then "Today" shows everything, as now. "Fewer interruptions" holds dependencies, infrastructure and anything else for sampling. "Hands-off" holds every row but security, two at "let the agent decide". Security stays "never without me" in all.

**Not chosen:** Only "Today" until the record shows what fits. Then v1 offers "Today" and changes row by row, each shown with what it would have held of your recent cards. Named looser presets come once this repo's shadow record shows which rows you'd let go.

**It turned on:** Is a guessed looser preset worth offering, when most people keep the setting they're first offered? (a preference) Yes, as a starting point: Three presets, as starting guesses. No, wait for evidence: Only "Today" until the record shows what fits.

**The fact given:** In one app-permission study, people adopted 78.7% of a suggested profile's recommendations and later changed 5.1%. Applied to this repo's 56 cards, "Fewer interruptions" would hold 2 and "Hands-off" 34, before agents' levels raise any (D144); agents filed 30 of them as blocking. Only you turn enforcing on, after the shadow period (D147, D148).

**The agent's case:** A few named presets are what people can choose between well, and the shadow period shows what one would have held before it holds anything, so a poor guess costs a look, not a miss.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-wwxa3, revision 1). Filed by claude-code on v1/next, in the deck “Routing and preferences”.

The record is in `.baesian/cards/B-wwxa3/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

P14's decision 14 ([[Routing and Preferences]], section 4, the presets table). In full: "Fewer interruptions" puts dependencies, delivery and infrastructure, and anything else at "check a sample"; "Hands-off" puts public interfaces, data formats, infrastructure and product behaviour at "check a sample", and dependencies and anything else at "let the agent decide". A preference file records every row and the preset it started from, so changing a preset later changes no file already written ([[Formats for v1]], section 2). The figures apply each preset's rows to this repo's 56 cards, strictest row winning, one-way cards shown; agents' levels would keep most of them shown, since 30 were filed blocking and 20 hard. The idea also considered, a setting suggested row by row from your answers, needs more cards per row than this repo has for dependencies (4) or infrastructure (3).
