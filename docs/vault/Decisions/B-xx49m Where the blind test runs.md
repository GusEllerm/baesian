---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Where the blind test runs: In your deck, as you work (B-xx49m)."
created: 2026-11-10
updated: 2026-11-10
tags:
  - baesian
  - decision
aliases:
  - B-xx49m
card: B-xx49m
revision: 1
title: Where the blind test runs
question: Should the blind test mix its ten practice cards into the cards you answer as you work, or show them in one sitting among past cards shown as they were?
answer: In your deck, as you work
response: accept
not_chosen:
  - One sitting of past cards
answered: 2026-11-10T20:18:52.282Z
answered_by: GusEllerm
topic: calibration/practice-test
deck: calibration
level: blocking
reverse: cheap
touches:
  - user-facing
filed: 2026-11-10T20:15:44.612Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-kb5yt Measuring whether you defer to the agent's case|B-kb5yt]]"
---

# Where the blind test runs

Should the blind test mix its ten practice cards into the cards you answer as you work, or show them in one sitting among past cards shown as they were?

**Decided:** In your deck, as you work, the agent's pick. Then about 1 in 4 of your cards is practice until ten have come; after each card you answer, you mark whether you think it was rebuilt, and none says it was practice until the tenth is done, when you see the result.

**Not chosen:** One sitting of past cards. Then you answer twenty past cards in one go, ten rebuilt and ten as they were, marking each; it takes about a quarter of an hour, and tests the swapped pick and its case, not a card that looks old among new ones.

**It turned on:** Should the test catch you recognising a card as one you've answered before? It should: In your deck, as you work. It needn't: One sitting of past cards.

**The fact given:** In use, practice cards come among new cards, so a card you remember answering is practice; in a sitting of past cards, every card is one you've answered. At this repo's pace, 171 answers in ten days, forty cards come in two or three days.

**The agent's case:** The test should look for the tells practice cards will have in use, and the likeliest is a card that looks old among new ones, which a sitting of past cards can't show.

**Wrong if:** Knowing the test is on changes how you answer your real cards, or the ten take weeks to come. **To check:** How long the ten take, and whether your blind agreement on real cards during the test differs from before it.

Answered by GusEllerm on 2026-11-10, through Baesian (card B-xx49m, revision 1). Filed by claude-code on v1/next, in the deck “How Baesian learns from your answers”.

The record is in `.baesian/cards/B-xx49m/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

D83 sets the test: ten rebuilt cards mixed with real ones, before practice cards ship; B-kb5yt adds that you mark which you think were rebuilt. The design is in [[Practice Cards]].

Under either option you start the test yourself, and you know it's on: the test asks whether you can spot practice cards when you're looking for them, which is the strict case D71 needs. Each mark is "no", "maybe" or "sure". What counts as spotted is a card of its own.

Under the proposal, the real cards are your real work: your answers go to their agents as usual, and the mark after each is the only extra. The practice cards' answers count for the test only, not in your calibration, since you were looking for them.
