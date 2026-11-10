---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How old a card is when it comes back as practice: From a week to a month old (B-j583c)."
created: 2026-11-10
updated: 2026-11-10
tags:
  - baesian
  - decision
aliases:
  - B-j583c
card: B-j583c
revision: 1
title: How old a card is when it comes back as practice
question: Should practice cards come only from cards answered 7 to 30 days ago, which the relay still holds, or also from older cards it keeps longer for practice?
answer: From a week to a month old
response: accept
not_chosen:
  - Older cards, kept for practice
answered: 2026-11-10T20:18:17.657Z
answered_by: GusEllerm
topic: calibration/practice-sources
deck: calibration
level: hard
reverse: cheap
touches:
  - privacy
  - user-facing
filed: 2026-11-10T20:15:41.434Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-kb5yt Measuring whether you defer to the agent's case|B-kb5yt]]"
---

# How old a card is when it comes back as practice

Should practice cards come only from cards answered 7 to 30 days ago, which the relay still holds, or also from older cards it keeps longer for practice?

**Decided:** From a week to a month old, the agent's pick. Then a card can come back as practice from a week after you answered it until the relay drops its text, 30 days after every machine has it; nothing is kept longer, and the blind test shows whether a week is long enough.

**Not chosen:** Older cards, kept for practice. Then before the relay drops an answered card's text, it keeps the cards practice can use for a year, for practice only, so they can come back months later; the rule on how long the relay keeps text, and the privacy page, change to say so.

**It turned on:** Would you recognise a card you answered a few weeks ago? Rarely: From a week to a month old. Often: Older cards, kept for practice.

**The fact given:** The relay drops an answered card's text 30 days after every machine has it; older cards are only in the repo's record. You've answered 171 of agents' cards here since 1 November, 89 of them on 3 November. Today 80 could be practice cards: 44 answered over a week ago, none over two weeks.

**The agent's case:** Recognising a card gives practice away, but the blind test can measure that with the cards the relay already holds. Keeping text longer changes what the privacy page promises, which is worth doing only if a week proves too soon.

**Wrong if:** In the blind test you recognise practice cards whose originals you answered weeks before. **To check:** The blind test's marks, by how long before each practice card its original was answered.

Answered by GusEllerm on 2026-11-10, through Baesian (card B-j583c, revision 1). Filed by claude-code on v1/next, in the deck “How Baesian learns from your answers”.

The record is in `.baesian/cards/B-j583c/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

D83 builds practice cards from past cards, and B-kb5yt's premise is that you can't tell them apart from real ones. The likeliest tell is recognising one: in use, practice cards come among new cards, so a card you remember answering is practice. The design is in [[Practice Cards]].

The two options differ because of the relay's retention (B-9jqt4, and the rule R-1sxpy): an answered card's text, and its answers, go 30 days after every machine has it. So on the website, practice can only use the last month's cards unless something keeps more. Locally, the record has every card, but this repo is linked, so it's answered on the website.

The lower bound, a week, is the agent's guess; the blind test checks it.
