---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "Which gate record holds a card back when hosted: Only the relay's signed record (B-sa8tg)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-sa8tg
card: B-sa8tg
revision: 1
title: Which gate record holds a card back when hosted
question: In a hosted repo, should a card count as held only when the service's signed gate record says so, or also on the record the CLI wrote at filing?
answer: Only the relay's signed record
response: accept
not_chosen:
  - The CLI's record, rechecked by verify
answered: 2026-11-03T03:58:49.962Z
answered_by: Gus Ellerm
topic: formats/hosted-gate-record
deck: formats-v1
level: hard
reverse: moderate
touches:
  - schema
  - security
filed: 2026-11-03T03:53:02.529Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-jqqa1 What the v1 gate runs on|B-jqqa1]]"
  - "[[B-9rycs Held-back cards at merge|B-9rycs]]"
  - "[[B-sar41 What makes an answer count in a hosted repo|B-sar41]]"
---

# Which gate record holds a card back when hosted

In a hosted repo, should a card count as held only when the service's signed gate record says so, or also on the record the CLI wrote at filing?

**Decided:** Only the relay's signed record, the agent's pick. The relay gates each card on arrival, with its own clock and draw, and signs its record. The CLI's record guides the agent at once. A card the relay hasn't gated isn't held in CI, so it needs an answer before merge.

**Not chosen:** The CLI's record, rechecked by verify. The CLI's record counts. baesian verify recomputes it from the card, the signed preference file it names, and a draw from the card's ID, so holding a card back needs no relay and works fully offline.

**It turned on:** In a hosted repo, should the agent's own machine be able to make a card count as settled at merge? If it shouldn't: Only the relay's signed record. If that's fine: The CLI's record, rechecked by verify.

**The fact given:** A held card counts as settled at merge, with no answer (D150). The gate reads the card's facts, level and reverse, the preference file in force, and a random draw. The card's time and ID are written on the agent's machine.

**First chose:** The CLI's record, rechecked by verify, then switched once the agent's pick was shown.

**The agent's case:** Holding a card back stands in for an answer at merge, and in a hosted repo only signed answers count (D138). The facts are the agent's either way, but the relay fixes which settings applied, and draws where the agent can't choose.

**Wrong if:** Cards filed offline routinely reach merge before the relay has gated them, so held cards in hosted repos keep needing answers. **To check:** While dogfooding a hosted repo, count the cards whose CLI record said held but which had no relay record when their branch merged.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-sa8tg, revision 1). Filed by claude-code on v1/next, in the deck “Formats for v1”. Context: [[Formats for v1]], [[File Formats]].

The record is in `.baesian/cards/B-sa8tg/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The gate runs in the CLI at filing and again on the relay when the card arrives (P14). Locally the CLI's record is all there is. In a hosted repo the two can differ, and the relay's can be signed. The gate record's fields, the draw and how verify rechecks it are in [[Formats for v1]], sections 3 and 4.
