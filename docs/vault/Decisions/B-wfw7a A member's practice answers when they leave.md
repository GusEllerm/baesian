---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "A member's practice answers when they leave: They go at once (B-wfw7a)."
created: 2026-11-14
updated: 2026-11-14
tags:
  - baesian
  - decision
aliases:
  - B-wfw7a
card: B-wfw7a
revision: 1
title: A member's practice answers when they leave
question: When a member leaves a project, or an owner removes them, should their practice answers in it go at once, or stay while the project does?
answer: They go at once
response: accept
not_chosen:
  - They stay while the project does
answered: 2026-11-14T14:35:38.370Z
answered_by: GusEllerm
topic: reviewers/leaving/practice-answers
deck: reviewers-privacy
level: hard
reverse: one-way
touches:
  - privacy
  - data-loss
filed: 2026-11-14T05:04:45.966Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-rehdw Where your practice answers are kept|B-rehdw]]"
---

# A member's practice answers when they leave

When a member leaves a project, or an owner removes them, should their practice answers in it go at once, or stay while the project does?

**Decided:** They go at once, the agent's pick. Then leaving or being removed deletes your practice answers and blind-test marks in that project, along with your heartbeat and what you were told, which go already. The policy says what's yours alone goes when you leave. If you come back, you take the blind test again.

**Not chosen:** They stay while the project does. Then they stay, read by nobody, until the project is deleted. If you come back by a new link, your practice record and blind test are where you left them. The policy says so.

**It turned on:** Should someone who leaves a project and comes back find their practice record where they left it? (a preference) No, leaving clears it: They go at once. Yes, it waits for them: They stay while the project does.

**The fact given:** Practice answers are a person's own (B-rehdw). Only the person who gave them reads them, never another member or a machine, and they name a card by its ID alone, keeping none of its text. A member who has left can't read theirs unless they rejoin. Leaving already deletes their latest heartbeat and which cards they were told of. Their answers on real cards stay, with their handle, until each card's text goes. Whichever is chosen, deleting an account deletes its practice answers in every project (B-b46z3).

**The agent's case:** Kept after leaving, they serve nobody, since the person can't read them and no one else ever may. Leaving is the natural point to let go of what's yours alone in a project, and the policy can then say so in one line. Coming back is rare, and the only cost is taking the blind test again.

**Wrong if:** Members are often removed and added back, for example by an owner tidying the list, so records are lost by accident. **To check:** Whether anyone you'd add expects to step out of a project and back in.

Answered by GusEllerm on 2026-11-14, through Baesian (card B-wfw7a, revision 1). Filed by claude-code on v1/next, in the deck “The privacy policy, for members”. Context: [[Privacy Policy]], [[Several Reviewers]].

The record is in `.baesian/cards/B-wfw7a/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Found while checking the privacy policy's lines against the code. When a member leaves, the relay forgets their heartbeat and what they were told, but not their practice answers.

The same gap is in deleting an account. A deleted member's practice answers in projects they only joined would stay while those projects do. The policy says deleting an account deletes "practice answers included", so that part is being fixed without a card, as B-b46z3 decided.
