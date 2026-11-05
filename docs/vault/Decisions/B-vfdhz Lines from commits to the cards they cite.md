---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Lines from commits to the cards they cite: Light them when you pick a card (B-vfdhz)."
created: 2026-11-05
updated: 2026-11-05
tags:
  - baesian
  - decision
aliases:
  - B-vfdhz
card: B-vfdhz
revision: 1
title: Lines from commits to the cards they cite
question: Should the branches panel stop drawing a dotted line from each commit to the card it cites, and light a card's commits when you pick it instead?
answer: Light them when you pick a card
response: accept
not_chosen:
  - Keep the lines, shorter
answered: 2026-11-05T20:17:37.235Z
answered_by: GusEllerm
topic: client/branches/commit-links
deck: branches-view
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-05T20:15:45.055Z
filed_by: claude-code
branch: v1/next
---

# Lines from commits to the cards they cite

Should the branches panel stop drawing a dotted line from each commit to the card it cites, and light a card's commits when you pick it instead?

**Decided:** Light them when you pick a card, the agent's pick. Commits are small ticks on their own branch. Picking a card colours the commits that cite it, in the lanes and the whole-history strip, and lists them in the callout as buttons. No lines are drawn.

**Not chosen:** Keep the lines, shorter. Each commit keeps a dotted line to its card, drawn only between neighbouring rows, and bundled where many share a path; lines across many rows are dropped.

**It turned on:** Do the lines help someone read the panel, once the commits sit on their own branches? No: Light them when you pick a card. Yes: Keep the lines, shorter.

**The fact given:** Today's panel draws 275 of them: 58 cross other lanes (up to 6 rows and 4,000 px), and 217 arcs on the same lane pile into a solid grey band. All three critics backed removing them. D181, as approved, has the lines.

**The agent's case:** The question a reader asks is which commits a card led to; answering it on demand shows exactly those, where lines for every pair bury them.

Answered by GusEllerm on 2026-11-05, through Baesian (card B-vfdhz, revision 1). Filed by claude-code on v1/next, in the deck “The branches panel, redrawn”.

The record is in `.baesian/cards/B-vfdhz/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.
