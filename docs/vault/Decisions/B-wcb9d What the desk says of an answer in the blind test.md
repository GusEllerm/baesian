---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "What the desk says of an answer in the blind test: Only that it's recorded, on every card (B-wcb9d)."
created: 2026-11-10
updated: 2026-11-10
tags:
  - baesian
  - decision
aliases:
  - B-wcb9d
card: B-wcb9d
revision: 1
title: What the desk says of an answer in the blind test
question: During the blind test, should the desk say only that each answer is recorded, or say each answer was sent to its agent, a rebuilt card's too?
answer: Only that it's recorded, on every card
response: accept
not_chosen:
  - Sent to its agent, on every card
answered: 2026-11-10T22:45:39.674Z
answered_by: GusEllerm
topic: calibration/practice-test-words
deck: calibration
level: hard
reverse: cheap
touches:
  - user-facing
filed: 2026-11-10T21:40:48.650Z
filed_by: claude-code
branch: worktree-agent-a5d5c9b1a132cee22
depends_on:
  - "[[B-xx49m Where the blind test runs|B-xx49m]]"
  - "[[B-zw55w Whether a practice card says an agent has stopped|B-zw55w]]"
---

# What the desk says of an answer in the blind test

During the blind test, should the desk say only that each answer is recorded, or say each answer was sent to its agent, a rebuilt card's too?

**Decided:** Only that it's recorded, on every card, the agent's pick. Then every card's toast in the test says "Recording it in 5 s", then "Recorded.", and a card reopened from the path says "It's recorded."; none says which went to an agent, or that Baesian proposed something from it, until the test ends.

**Not chosen:** Sent to its agent, on every card. Then every card's toast says "Sending to claude-code" and "Sent to claude-code.", as outside the test, a rebuilt card's too, though nothing was sent; the desk reads as it always does.

**It turned on:** Until the test ends, may a rebuilt card say its answer went to an agent? (a preference) No: Only that it's recorded, on every card. Yes, until it ends: Sent to its agent, on every card.

**The fact given:** B-xx49m decided no card says it was practice until the tenth rebuilt card is answered. B-zw55w decided a practice card may say an agent has stopped until you've answered it, and says no agent was waiting once you have. Either way, real cards' answers go to their agents as usual during the test.

**The agent's case:** It keeps rebuilt cards hidden without saying anything untrue once you've answered, as B-zw55w has it, at the cost of not naming the agent on real cards while the test runs.

**Wrong if:** you lose track of which real answers went to agents during the test. **To check:** whether you open the path to see where an answer went while the test runs.

Answered by GusEllerm on 2026-11-10, through Baesian (card B-wcb9d, revision 1). Filed by claude-code on worktree-agent-a5d5c9b1a132cee22, in the deck “How Baesian learns from your answers”.

The record is in `.baesian/cards/B-wcb9d/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Built on the branch as the proposal, provisional until you answer. A real card's answer on the website that waits for your passkey still says so, as any hard card's does: rebuilt cards are never hard, so that tells nothing a hard card's level doesn't already. Once the test ends, the path says which cards were practice.
