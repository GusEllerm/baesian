---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Numbered rows for decisions made on cards: No new D-rows for card decisions (B-s3v3x)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-s3v3x
card: B-s3v3x
revision: 1
title: Numbered rows for decisions made on cards
question: Once a note is written for each card decision, should this repo's Decision Log still get a numbered D-row for each one?
answer: No new D-rows for card decisions
response: accept
not_chosen:
  - A D-row for every decision, cards included
answered: 2026-11-03T04:13:51.588Z
answered_by: Gus Ellerm
topic: vault/decision-log-rows
deck: vault-adapter
level: blocking
reverse: cheap
touches:
  - user-facing
filed: 2026-11-03T03:51:56.550Z
filed_by: claude-code
branch: v1/next
---

# Numbered rows for decisions made on cards

Once a note is written for each card decision, should this repo's Decision Log still get a numbered D-row for each one?

**Decided:** No new D-rows for card decisions, the agent's pick. Card decisions appear as notes, listed by the log's Bases table and cited by card ID. D-rows carry on for decisions made in conversation. The 33 card decisions already logged keep their rows.

**Not chosen:** A D-row for every decision, cards included. D-numbers stay one complete sequence that every note can cite. Each card decision is written twice, as a hand-written row and as a generated note, and the two can disagree.

**It turned on:** Do you want every decision in one numbered list, or is a card ID enough for those made on cards? (a preference) If a card ID is enough: No new D-rows for card decisions. If you want one numbered list: A D-row for every decision, cards included.

**The fact given:** The log says D-numbers last until Baesian runs its own decisions; after that, decisions carry card IDs (D18, D19, D21). 33 of the rows from D109 to D153 came from cards, most citing the card's ID. Notes across the vault cite decisions by D-number.

**First chose:** A D-row for every decision, cards included, then switched once the agent's pick was shown.

**The agent's case:** It's what the log already says will happen, and one record of each decision can't disagree with itself.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-s3v3x, revision 1). Filed by claude-code on v1/next, in the deck “The vault adapter”. Context: [[Vault Adapter]], [[Baesian Design]].

The record is in `.baesian/cards/B-s3v3x/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Either answer means two edits to the Working Agreement, which changes only through a card (D22): its session protocol says to log every decision in the Decision Log, and it would point to the rules in the log's table. See [[Vault Adapter#10. This repo's Decision Log]].
