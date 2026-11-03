---
type: decision
format: 1
status: reopened
authority: log
livedocs: snapshot
summary: "What a vertical swipe does on a long card, on a phone: It should scroll until the top or bottom is fully in view. Once it is fully in view you should be able to drag further to initiate that action. For example take a long card - I scroll to the bottom. I am at the bottom, I scroll further, and it enters the more context flow ect. If I scroll to the top, then pull further, it enters the question, correction, rejection flow etc (B-k7xac)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-k7xac
card: B-k7xac
revision: 1
title: What a vertical swipe does on a long card, on a phone
question: On a phone, what should swiping up or down on a card longer than the screen do?
answer: It should scroll until the top or bottom is fully in view. Once it is fully in view you should be able to drag further to initiate that action. For example take a long card - I scroll to the bottom. I am at the bottom, I scroll further, and it enters the more context flow ect. If I scroll to the top, then pull further, it enters the question, correction, rejection flow etc.
response: correction
not_chosen:
  - Scroll it, only when the card is longer than the screen
  - Always scroll, on every card
answered: 2026-11-03T17:45:37.644Z
answered_by: Gus Ellerm
topic: client/phone-vertical-swipe
deck: hosted
level: blocking
reverse: cheap
touches:
  - user-facing
filed: 2026-11-03T17:43:17.444Z
filed_by: claude-code
branch: v1/next
---

# What a vertical swipe does on a long card, on a phone

On a phone, what should swiping up or down on a card longer than the screen do?

**Decided:** It should scroll until the top or bottom is fully in view. Once it is fully in view you should be able to drag further to initiate that action. For example take a long card - I scroll to the bottom. I am at the bottom, I scroll further, and it enters the more context flow ect. If I scroll to the top, then pull further, it enters the question, correction, rejection flow etc, the reviewer's own answer.

**Not chosen:** Scroll it, only when the card is longer than the screen, the agent's pick. Then a card that fits takes all four swipes, as the gesture table has them; on a longer one, up and down scroll, and Other answer and Can't judge at its foot do what those swipes do.

**Not chosen:** Always scroll, on every card. Then on a phone, up and down never answer: sideways swipes choose, and Other answer and Can't judge are always buttons.

**It turned on:** Does it matter more that a swipe does the same thing on every card, or that up and down answer where they can? (a preference) Where they can: Scroll it, only when the card is longer than the screen. The same on every card: Always scroll, on every card.

**The fact given:** Most cards are longer than a phone's screen: at 390×844, a card with a premise and what's built already is. On a desktop, a two-finger swipe up or down already scrolls the desk when it has somewhere to scroll, and answers when it hasn't. Swiping up or down only opens a panel (writing, or can't judge), which Cancel closes; it never sends anything.

**The agent's case:** It keeps D130's four-way swipe wherever a card fits, and it is the same rule as the desktop's two-finger swipe.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-k7xac, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-k7xac/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Built as the proposal on the phone-layout branch (`client/src/Desk.tsx`: the card is dragged only sideways while the desk scrolls). Switching to the alternative is a one-line change: the card's drag axis is always sideways below the phone's width.

A third option was set aside: keep all four swipes on every card, and scroll a long card inside a fixed-height frame. Scrolling inside a card that is itself dragged fights the drag, and a phone's whole screen is the natural thing to scroll.

## Reopened on 2026-11-03

claude-code replied to the answer, once: "On a card that fits the screen, pushing the card up opens Other answer (question, correction, rejection) and pulling it down opens Can't judge (more context). Under this answer, on a long card, pushing up past the bottom opens more context and pulling down past the top opens Other answer, so the same finger movement does opposite things depending on the card's length. Keeping the short card's directions at a long card's edges (push up past the bottom for Other answer, pull down past the top for Can't judge) would avoid that."

Until the card is answered again, this decision isn't in force.
