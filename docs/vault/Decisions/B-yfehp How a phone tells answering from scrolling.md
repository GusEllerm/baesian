---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How a phone tells answering from scrolling: Hold the card until it lifts, then drag (B-yfehp)."
created: 2026-11-05
updated: 2026-11-05
tags:
  - baesian
  - decision
aliases:
  - B-yfehp
card: B-yfehp
revision: 1
title: How a phone tells answering from scrolling
question: On a phone, how should you answer a card by gesture, so that scrolling a long card never answers it?
answer: Hold the card until it lifts, then drag
response: accept
not_chosen:
  - Swipe sideways at once, or hold for all four
answered: 2026-11-05T13:44:59.252Z
answered_by: GusEllerm
topic: client/phone-gestures
deck: branch-v1-next
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-05T13:35:34.932Z
filed_by: claude-code
branch: v1/next
---

# How a phone tells answering from scrolling

On a phone, how should you answer a card by gesture, so that scrolling a long card never answers it?

**Decided:** Hold the card until it lifts, then drag, the agent's pick. A drag anywhere on a card scrolls. Holding the card still for a moment lifts it off the desk, which dims; then dragging toward any of the four answers names it at that edge of the screen, and letting go chooses it. Every card takes all four, long or short. Taps on the options and the two buttons still answer. The arrows go from touch screens.

**Not chosen:** Swipe sideways at once, or hold for all four. A quick sideways swipe chooses an option as it does now, a vertical drag scrolls, and holding lifts the card for all four answers. Two ways to choose sideways, the quicker one with no hold.

**It turned on:** Is a moment's hold before every gestured answer worth never answering by accident while scrolling? (a preference) Yes: Hold the card until it lifts, then drag. No: Swipe sideways at once, or hold for all four.

**The fact given:** Today (B-k7xac) a card longer than the screen scrolls vertically and answers only sideways, with Other answer and Can't judge as buttons; a card that fits takes all four swipes and doesn't scroll. Cards on the website are usually longer than a phone's screen. A prototype of both, with the hold at 250, 350 or 500 ms, is at https://claude.ai/artifact/KoY15gGSDhqxwkhgEAQFum (private to you).

**The agent's case:** It's your design, and it settles what B-k7xac split by card length: one rule for every card, and a scroll can't become an answer. The hold also gives the lifted card a moment to show what each direction means, which the arrows did badly on a phone.

Answered by GusEllerm on 2026-11-05, through Baesian (card B-yfehp, revision 1). Filed by claude-code on v1/next, in the deck “Decisions on v1/next”.

The record is in `.baesian/cards/B-yfehp/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Reported on 2026-11-05 from answering the setup deck on a phone: up and down never answered (the cards were long, so they scrolled); touching text didn't scroll while touching an empty spot did; and the left and right arrows still showed, though a phone has no arrow keys. The proposal is the user's own design: a long press to say you're about to answer, with the card lifting slightly off the desk as feedback, then a drag in one of four directions with a signal of the answer, then letting go.

Details for the build, not part of the choice: a light vibration where the phone allows it when the card lifts and when a drag reaches its answer; a hold cancelled by moving more than a few pixels, which then scrolls; the long press never opens the text menu or selects text; the desktop keeps the keys, the mouse drag and the two-finger swipe as they are.
