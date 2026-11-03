---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Whether an agent's level keeps a card from being held: The row holds it; a hold answers the agent (B-chq61)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-chq61
card: B-chq61
revision: 1
title: Whether an agent's level keeps a card from being held
question: When an agent files a card as blocking on a row set to hold cards back, should the row still hold it, or should the agent's level bring it to you?
answer: The row holds it; a hold answers the agent
response: accept
not_chosen:
  - The agent's level brings it to you
answered: 2026-11-03T13:44:30.743Z
answered_by: Gus Ellerm
topic: routing/agent-level-and-holds
deck: routing
level: blocking
reverse: moderate
touches:
  - user-facing
filed: 2026-11-03T13:38:03.588Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-vf0w2 Who may lower what reaches you|B-vf0w2]]"
  - "[[B-0pfbf Whether the gate holds cards back|B-0pfbf]]"
  - "[[B-wwxa3 Which presets v1 offers|B-wwxa3]]"
---

# Whether an agent's level keeps a card from being held

When an agent files a card as blocking on a row set to hold cards back, should the row still hold it, or should the agent's level bring it to you?

**Decided:** The row holds it; a hold answers the agent, the agent's pick. Whether a card is shown or held is the row's alone, floors apart. A held card tells a waiting agent to go ahead with its pick, as settled at merge (D150). The agent's level still raises a shown card: blocking on a "tell me" row is blocking.

**Not chosen:** The agent's level brings it to you. A level the agent sets is a minimum on held rows too, as P14 has it: a blocking card is always shown, and the agent waits. AGENTS.md tells agents to set a level only when they will truly stop and wait, so the rows can hold the rest.

**It turned on:** When an agent marks a card as one it will wait on, should that override your setting for its kind of decision? If it shouldn't: The row holds it; a hold answers the agent. If it should: The agent's level brings it to you.

**The fact given:** Under D144 an agent may only raise a card's level, and P14 reads a raised level as a minimum even on held rows. Agents filed 30 of this repo's first 56 cards as blocking, most because the answer shapes work to come, and 20 as hard, all but a few through a hard-by-default fact. Applied to those 56 cards, "Fewer interruptions" would hold 0 and "Hands-off" at most 6; leaving agents' levels out, 2 and 34. Floors (security, money, data loss, publishing) are untouched either way.

**First chose:** The agent's level brings it to you, then switched once the agent's pick was shown.

**The agent's case:** Your rows are the only place you say which kinds of decision you want to see, and they should decide that. The agent's level answers a different question, how long it waits when a card is shown; letting it also decide what's shown means the presets do nothing, however agents are told.

**Wrong if:** Agents mark cards blocking because they know something about a particular decision that its facts don't carry, so held cards that an agent marked blocking turn out to be misses more often than others. **To check:** In the shadow record, compare the miss rate of audited cards the agent had marked blocking with the rest.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-chq61, revision 1). Filed by claude-code on v1/next, in the deck “Routing and preferences”.

The record is in `.baesian/cards/B-chq61/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Found while drafting P14's remaining cards. D144 settled that the filing agent may only escalate: it states the facts and may raise a card's level, never lower it, and only the repo's settings hold a card back. P14 (section 1, "What moves a card off its row's position") reads an agent's level as a minimum everywhere, so a card the agent files as blocking is shown even on a row set to "let the agent decide".

The counts come from this repo's record before the M8 and M9 cards were filed: 56 cards, of which agents filed 30 as blocking, 20 as hard and 6 as provisional. The preset counts re-run P14's draft presets over those cards (card B-wwxa3 has the presets).

Either way the agent's own judgement still reaches the gate through the facts it states and `reverse` (a one-way card is never held, under card B-yebnn's recommendation). The proposal keeps D144's "only the repo's settings hold a card back" and reads the agent's level as how long it waits when shown; the alternative keeps P14's reading and moves the burden to the instructions agents follow.
