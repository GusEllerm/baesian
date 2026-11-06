---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How wide a run of text runs: It spans its box (B-5s5h2)."
created: 2026-11-06
updated: 2026-11-06
tags:
  - baesian
  - decision
aliases:
  - B-5s5h2
card: B-5s5h2
revision: 1
title: How wide a run of text runs
question: Should a run of text span the box it sits in, or carry its own cap on line length?
answer: It spans its box
response: accept
not_chosen:
  - Text carries its measure
answered: 2026-11-06T03:45:19.719Z
answered_by: GusEllerm
topic: client/text-measure
deck: branch-v1-next
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-06T03:20:04.136Z
filed_by: claude-code
branch: v1/next
---

# How wide a run of text runs

Should a run of text span the box it sits in, or carry its own cap on line length?

**Decided:** It spans its box, the agent's pick. Then no text carries a cap in ch or rem; where lines would run too long, the box is sized instead (the card's column, a page's width), so text and its box share one edge.

**Not chosen:** Text carries its measure. Then headings and paragraphs keep a cap of about 32–70 characters, as typographic practice suggests, so lines stay short however wide the box; some text stops short of its box's edge.

**It turned on:** Should text line up with the edge of the box it sits in? (a preference) Yes: one edge: It spans its box. No: line length first: Text carries its measure.

**The fact given:** The client capped some text in ch or rem: a card's question at 32ch stopped about halfway across the card on an iPad mini, and the website's pages had the same until 2026-11-05. Caps keep lines short in a wide box; sizing the box does the same for everything in it, except where one box holds text of several sizes.

**The agent's case:** It's what the reviewer has asked for each time it came up, in chat; as a card it can become a rule every agent sees.

Answered by GusEllerm on 2026-11-06, through Baesian (card B-5s5h2, revision 1). Filed by claude-code on v1/next, in the deck “Decisions on v1/next”.

The record is in `.baesian/cards/B-5s5h2/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

You've said this in chat more than once (2026-11-05: "the issue with text not spanning the width of the container…", and the card's question). It was kept only in the lead agent's private memory. If you agree, tick "make this a rule" so it's in force for every agent and a fix can cite it.
