---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Whether a practice card says an agent has stopped: As the cards around it do (B-zw55w)."
created: 2026-11-10
updated: 2026-11-10
tags:
  - baesian
  - decision
aliases:
  - B-zw55w
card: B-zw55w
revision: 1
title: Whether a practice card says an agent has stopped
question: When the cards around it say an agent has stopped for you, should a practice card say so too, or never show that, being a card no agent is waiting on?
answer: As the cards around it do
response: accept
not_chosen:
  - Never, since no agent waits on it
answered: 2026-11-10T20:19:25.291Z
answered_by: GusEllerm
topic: calibration/practice-waiting
deck: calibration
level: blocking
reverse: cheap
touches:
  - user-facing
filed: 2026-11-10T20:15:48.555Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-kb5yt Measuring whether you defer to the agent's case|B-kb5yt]]"
---

# Whether a practice card says an agent has stopped

When the cards around it say an agent has stopped for you, should a practice card say so too, or never show that, being a card no agent is waiting on?

**Decided:** As the cards around it do, the agent's pick. Then a practice card says its agent has stopped when the real card before it does, and says no agent was waiting once you've answered it; practice cards can come among a deck an agent waits on.

**Not chosen:** Never, since no agent waits on it. Then a practice card never says an agent has stopped, and comes only among cards nobody is waiting on, so while agents wait on whole decks, practice cards come rarely.

**It turned on:** Until you've answered it, may a practice card say an agent is waiting when none is? (a preference) Yes, until I've answered: As the cards around it do. No: Never, since no agent waits on it.

**The fact given:** D90 made "stopped" true: it shows only while an agent's waiting marker is fresh. AGENTS.md tells agents to wait on their open cards, or a whole deck, until answered, so a deck's cards often all say "stopped". Until you've answered it, a practice card already shows a pick no agent made.

**First chose:** Never, since no agent waits on it, then switched once the agent's pick was shown.

**The agent's case:** A practice card has to look like the cards around it until you've answered; a missing "stopped" in a deck where every other card has one would give it away more surely than anything on the card.

**Wrong if:** Knowing practice cards can say "stopped" makes you trust it less on real cards. **To check:** Whether, after they ship, you still answer cards that say "stopped" first.

Answered by GusEllerm on 2026-11-10, through Baesian (card B-zw55w, revision 1). Filed by claude-code on v1/next, in the deck “How Baesian learns from your answers”.

The record is in `.baesian/cards/B-zw55w/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

A practice card shows what its original showed when it was filed, apart from which option is the pick and its case (D83, B-kb5yt). The waiting badge is the one live fact on a card: whether an agent is waiting on it now. A practice card has no agent. The design is in [[Practice Cards]].

The deck a practice card shows stays its original's either way: its `doing` line names the original's work, which a borrowed deck would contradict. Under either option the desk never puts a practice card first in a sitting or last.
