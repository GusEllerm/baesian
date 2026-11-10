---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "When Baesian proposes moving a row: One test, both ways (B-jtsfh)."
created: 2026-11-10
updated: 2026-11-10
tags:
  - baesian
  - decision
aliases:
  - B-jtsfh
card: B-jtsfh
revision: 1
title: When Baesian proposes moving a row
question: Should Baesian propose tightening a row after any one miss, or only once the row's record says misses are likely more than 1 in 10?
answer: One test, both ways
response: accept
not_chosen:
  - The same test down, any miss up
answered: 2026-11-10T19:58:25.646Z
answered_by: GusEllerm
topic: routing/slider-triggers
deck: calibration
level: blocking
reverse: cheap
touches:
  - user-facing
filed: 2026-11-10T19:57:39.754Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-y6jn6 Whether Baesian proposes slider moves in v1|B-y6jn6]]"
  - "[[B-k0w7d Where a card's model comes from|B-k0w7d]]"
---

# When Baesian proposes moving a row

Should Baesian propose tightening a row after any one miss, or only once the row's record says misses are likely more than 1 in 10?

**Decided:** One test, both ways, the agent's pick. Baesian proposes a move once it's 95% sure which side of 1 in 10 a row's miss rate is, from every final answer since the row last moved: down once misses are likely under it (28 answers with none, 45 with one, 60 with two), up once they're likely over it (a miss in your first two answers, 3 in 10, 5 in 20).

**Not chosen:** The same test down, any miss up. Then loosening uses the same test, and every miss still proposes tightening, as now.

**It turned on:** After one miss on a row with a good record, should Baesian propose tightening it? (a preference) Only if misses look common: One test, both ways. Every time: The same test down, any miss up.

**The fact given:** Baesian has filed 8 tightening proposals, one for each miss on a row. You accepted the first 4 (3 November) and declined the next 4, all on user-facing (5 and 6 November), which has 4 misses in 42 final answers. 10 of this repo's 168 final answers are misses.

**First chose:** The same test down, any miss up, then switched once the agent's pick was shown.

**The agent's case:** A proposal you keep declining teaches you to decline it. The test still tightens fast on a row that starts badly, but one miss after a long clean run no longer asks you to tighten.

**Wrong if:** A single miss on a row turns out to be the first of several, and the test took a few more to propose tightening. **To check:** The misses on each row before the test proposed tightening it.

Answered by GusEllerm on 2026-11-10, through Baesian (card B-jtsfh, revision 1). Filed by claude-code on v1/next, in the deck “How Baesian learns from your answers”.

The record is in `.baesian/cards/B-jtsfh/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

B-y6jn6 decided that Baesian proposes slider moves from the record: one stop up after any miss, one stop down after 29 final answers in a row without one. The critique ([[Profiles and Collective Steering - Critique]]) found the loosening count isn't valid as built, and both options here replace it:

- The count resets after every proposal and after every miss, so at a true miss rate of exactly 1 in 10, 29 clean answers in a row come eventually (about one count in 21). The "under about 1 in 9" the proposal quotes is a bound applied to a streak picked after the fact.
- The replacement is a posterior over every final answer since the row last moved (a uniform prior, Beta): a miss no longer wipes out the clean answers before it, it adds to what's needed. With no misses it's 28 answers, as near as makes no difference to today's 29.
- Checked after every answer, it proposes loosening within 200 answers 91% of the time at a true rate of 1 in 20, 18% at exactly 1 in 10, and 2% at 3 in 20 (simulated).
- If cards record their model (B-k0w7d), the count also starts again when the model changes.

Eight rows are tested separately, so some row will cross a 95% line by chance more often than 1 in 20; a proposal is only a proposal, and loosening still takes the passkey (D163).
