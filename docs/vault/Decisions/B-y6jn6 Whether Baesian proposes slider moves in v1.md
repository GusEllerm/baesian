---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Whether Baesian proposes slider moves in v1: Proposals from the record (B-y6jn6)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-y6jn6
card: B-y6jn6
revision: 1
title: Whether Baesian proposes slider moves in v1
question: Should v1 file "move this slider?" cards from each row's record, or only show the record and leave moving rows to you?
answer: Proposals from the record
response: alternative
not_chosen:
  - Only the report in v1
answered: 2026-11-03T13:47:34.669Z
answered_by: Gus Ellerm
topic: routing/slider-proposals
deck: routing
level: blocking
reverse: cheap
touches:
  - user-facing
  - schema
filed: 2026-11-03T13:38:03.750Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-87tkc What counts as a miss on an audit|B-87tkc]]"
  - "[[B-wwxa3 Which presets v1 offers|B-wwxa3]]"
---

# Whether Baesian proposes slider moves in v1

Should v1 file "move this slider?" cards from each row's record, or only show the record and leave moving rows to you?

**Decided:** Proposals from the record, the alternative. Baesian files a "move this slider?" card itself: one stop up after a miss on a row, one stop down after 29 answers in a row without one. Accepting writes a new preference file. Cards gain three fields for the row and the move.

**Not chosen:** Only the report in v1, the agent's pick. The client shows each row's record: cards shown and held, audits and misses, how often you kept the agent's pick. You move rows yourself. Baesian files no slider cards, and cards gain no slider fields until a later format.

**It turned on:** Should Baesian prompt you to move a slider, or is a row's record enough for you to move it yourself? (a preference) The record is enough: Only the report in v1. Prompt me: Proposals from the record.

**The fact given:** P14 loosens a row after 29 answers in a row without a miss, the count that bounds a miss rate under 10%. On shown rows it counts blind choices matching the agent's pick: here 36 of 61, so 29 in a row would come less than once in a million. Counting final answers, all but one of the 61 kept the pick. Tightening after any miss fires often if a differing blind choice counts as one (card B-87tkc). After v1, adding the fields is a card format 2 (D156).

**The agent's case:** The triggers can't be tuned until a repo has a shadow record, and a proposal that fires constantly, or never, teaches you to ignore it. The report gives the same numbers, and a move you make yourself needs no card.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-y6jn6, revision 1). Filed by claude-code on v1/next, in the deck “Routing and preferences”.

The record is in `.baesian/cards/B-y6jn6/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

P14 (section 3, "Convention cards for routing") has Baesian file slider proposals itself, from the record, with no model, as it files conflict cards, and section 5 gives them three card fields: pref_row, pref_from and pref_to. None of P14's numbered decisions covered them, and P16 left them undecided.

The rates are this repo's: 61 answers with a blind choice, 36 matching the agent's pick before its case was shown; of the 25 that differed, 24 ended on the agent's pick after the reveal. Under the alternative, what counts as a miss (card B-87tkc) decides whether the proposals fire.
