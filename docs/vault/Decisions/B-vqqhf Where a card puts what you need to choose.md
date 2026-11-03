---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "Where a card puts what you need to choose: In the crux's fact (B-vqqhf)."
created: 2026-11-02
updated: 2026-11-02
tags:
  - baesian
  - decision
aliases:
  - B-vqqhf
card: B-vqqhf
revision: 1
title: Where a card puts what you need to choose
question: Where should an agent put what you need in order to choose, when its case and the card's body show only after you choose?
answer: In the crux's fact
response: accept
not_chosen:
  - Show the body before you choose
answered: 2026-11-02T00:34:29.260Z
answered_by: Gus Ellerm
topic: cards/before-you-choose
deck: dogfooding
level: blocking
reverse: cheap
touches:
  - user-facing
  - public-api
filed: 2026-11-01T21:06:18.657Z
filed_by: claude-code
branch: main
---

# Where a card puts what you need to choose

Where should an agent put what you need in order to choose, when its case and the card's body show only after you choose?

**Decided:** In the crux's fact, the agent's pick. AGENTS.md and the template say that what you need to choose goes in crux_fact, a line or two shown under the crux before you choose; the body stays background, shown with the agent's case after.

**Not chosen:** Show the body before you choose. Then the card gets a "More context" disclosure before the choice; agents write context as they like, but it can carry their leaning before you've chosen (D86).

**It turned on:** Can an agent's background be shown before you choose without steering you toward its pick? Not reliably: In the crux's fact. If it's kept neutral: Show the body before you choose.

**The fact given:** Until today the client showed a card's body nowhere, though D92 meant it to show with the agent's case after you choose; now it does. The topics card came back because its context was in neither place you could see before choosing.

**The agent's case:** You choose before seeing the agent's pick and case (D86), so its leaning can't anchor you. A body the agent writes tends to argue for its pick, so showing it early would undo that. A line or two of fact under the crux is easier to keep neutral.

Answered by Gus Ellerm on 2026-11-02, through Baesian (card B-vqqhf, revision 1). Filed by claude-code on main, in the deck “Findings from dogfooding”.

The record is in `.baesian/cards/B-vqqhf/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

**What happened.** The topics card's first revision came back as "I need more context: when would this occur?" The answer was in neither of the places you see before choosing: not in the crux's fact, and not in the body, which the client didn't show at all. The second revision put it in the crux's fact, and you answered it.

**What shows when.** Before you choose: the stakes, what the agent was doing, the question, the crux and its fact, the two options with what each does, and the facets (an unverified premise, work already done). After you choose: the agent's pick, its case (rationale, and what would show it wrong), and now the body, under "More from" the agent, open by itself when it's the only reasoning.

**With your pick,** the change is words: `AGENTS.md` and the template's `crux_fact` line would say it's for what the reviewer needs to choose, kept neutral, and the body for background.
