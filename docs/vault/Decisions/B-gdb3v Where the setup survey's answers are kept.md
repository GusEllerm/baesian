---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Where the setup survey's answers are kept: In the preference file it writes (B-gdb3v)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-gdb3v
card: B-gdb3v
revision: 1
title: Where the setup survey's answers are kept
question: Where should the setup survey's answers be kept, once they've picked the first preset?
answer: In the preference file it writes
response: accept
not_chosen:
  - Not kept, only the preset
answered: 2026-11-03T17:00:58.027Z
answered_by: Gus Ellerm
topic: formats/survey-answers
deck: routing
level: provisional
reverse: cheap
touches:
  - schema
  - user-facing
filed: 2026-11-03T15:56:00.102Z
filed_by: claude-code
branch: v1/next
---

# Where the setup survey's answers are kept

Where should the setup survey's answers be kept, once they've picked the first preset?

**Decided:** In the preference file it writes, the agent's pick. The preference file the survey writes gains two optional lists, survey_see and survey_fine: the rows whose example you wanted to see, and those you'd be fine not seeing. Its profile names the preset they picked. No new kind of file.

**Not chosen:** Not kept, only the preset. The survey's answers pick the preset and are dropped; the preference file records only its profile. Comparing the survey with your later answers would need the survey taken again.

**It turned on:** Will the survey's answers be worth comparing with your answers on real cards later? Yes, keep them: In the preference file it writes. No, the preset is enough: Not kept, only the preset.

**The fact given:** Card B-5na1k chose a short survey at setup, in Baesian's own card format, to pick the closest preset. The survey is six example decisions, one per row the presets differ on, each asked "Would you be fine not seeing a decision like this one, and checking a sample afterwards?". A preference file is written once, by the client only (D147); after v1 an added field is a format 2 (D156).

**The agent's case:** Two short optional lists cost nothing now, and they're the only record of what you said before you'd seen any of your own cards, which is what the shadow period tests.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-gdb3v, revision 1). Filed by claude-code on v1/next, in the deck “Routing and preferences”.

The record is in `.baesian/cards/B-gdb3v/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Built this way in M8a: `POST /api/preferences` takes `survey_see` and `survey_fine`, and with no `preset` named, picks the one they suggest (`suggestPreset()`, the stricter on a tie). The survey's items and question are in `GET /api/presets`. The survey's UI is M8b's.
