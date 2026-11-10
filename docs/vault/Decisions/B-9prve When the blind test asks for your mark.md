---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "When the blind test asks for your mark: On a card of its own after each answer (B-9prve)."
created: 2026-11-10
updated: 2026-11-10
tags:
  - baesian
  - decision
aliases:
  - B-9prve
card: B-9prve
revision: 2
title: When the blind test asks for your mark
question: In the blind test, should your guess about each card (real, or rebuilt from a past one?) be asked as you answer it, or on a card of its own after?
answer: On a card of its own after each answer
response: alternative
not_chosen:
  - As you answer it, before you confirm
answered: 2026-11-10T22:49:16.090Z
answered_by: GusEllerm
topic: calibration/practice-test-mark
deck: calibration
level: hard
reverse: cheap
touches:
  - user-facing
filed: 2026-11-10T21:40:25.790Z
filed_by: claude-code
branch: worktree-agent-a5d5c9b1a132cee22
depends_on:
  - "[[B-xx49m Where the blind test runs|B-xx49m]]"
---

# When the blind test asks for your mark

In the blind test, should your guess about each card (real, or rebuilt from a past one?) be asked as you answer it, or on a card of its own after?

**Decided:** On a card of its own after each answer, the alternative. Then once you confirm, a small card asks the same question before the next card comes; your answer is already on its way, and guessing is a step between cards.

**Not chosen:** As you answer it, before you confirm, the agent's pick. Then the reveal and the written answers ask "Blind test: was this card rebuilt from a past one?" with No, Maybe and Sure (keys 1 to 3), and your answer waits until you've picked one; guess and answer go together, in one step.

**It turned on:** Should guessing whether a card was rebuilt be part of answering it, or a step after it? (a preference) Part of answering it: As you answer it, before you confirm. A step after it: On a card of its own after each answer.

**The fact given:** The blind test checks whether practice cards can be spotted before they ship (D83, B-xx49m). While it runs, about 1 in 4 cards in your deck is a past card Baesian rebuilt, until ten have come, so about forty cards in all. For each card you answer, you also guess whether it was rebuilt: No, Maybe or Sure. That guess is the mark. If your Maybes and Sures land on rebuilt cards more often than chance would, they count as spotted and practice cards are dropped (B-bb7ga).

**The agent's case:** Asked as you answer, the guess is made with the whole card in view, the pick and its case included, which is where a rebuilt card would give itself away; and it adds no screen between cards.

**Wrong if:** you find yourself guessing without looking, to get the answer sent. **To check:** how many cards you guess Maybe or Sure in the test, against what chance would give.

Answered by GusEllerm on 2026-11-10, through Baesian (card B-9prve, revision 2). Filed by claude-code on worktree-agent-a5d5c9b1a132cee22, in the deck “How Baesian learns from your answers”.

The record is in `.baesian/cards/B-9prve/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Built on the branch as the proposal, provisional until you answer. A card you answered in chat isn't marked, since you'd know it was real. A card you reopen and change is marked again, and the latest mark counts. Under the proposal, Esc or the switch keep the mark you'd chosen; going back to the choice clears it.
