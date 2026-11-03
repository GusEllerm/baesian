---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "The Working Agreement once decisions run through Baesian: Rewrite the lines that changed (B-jjgpd)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-jjgpd
card: B-jjgpd
revision: 1
title: The Working Agreement once decisions run through Baesian
question: Now that card decisions are written as notes (D174), should the Working Agreement be rewritten to describe how this repo works today, or keep its text from D22 with a dated amendment?
answer: Rewrite the lines that changed
response: accept
not_chosen:
  - Keep D22's text, add a dated amendment
answered: 2026-11-03T13:15:50.683Z
answered_by: Gus Ellerm
topic: vault/working-agreement
deck: vault-adapter
level: blocking
reverse: cheap
touches:
  - user-facing
filed: 2026-11-03T05:01:51.617Z
filed_by: claude-code
branch: v1/next
---

# The Working Agreement once decisions run through Baesian

Now that card decisions are written as notes (D174), should the Working Agreement be rewritten to describe how this repo works today, or keep its text from D22 with a dated amendment?

**Decided:** Rewrite the lines that changed, the agent's pick. Step 3 of the session protocol says to log decisions made in conversation and agent decisions in the Decision Log, while decisions made on cards are written as notes by Baesian; it points to the rules in force in the log's table; and the decision-card section says this repo's cards go through Baesian (D21), not "by hand until Baesian can run it".

**Not chosen:** Keep D22's text, add a dated amendment. The agreement stays as accepted in D22, with one dated paragraph at the top saying what changed: card decisions are notes (D174), cards go through Baesian (D21), and the rules in force are in the Decision Log's table. The old lines stay, read through the amendment.

**It turned on:** Should the Working Agreement read as the rules in force today, or as the agreement accepted in D22 plus its changes? (a preference) As the rules in force: Rewrite the lines that changed. As D22 plus its changes: Keep D22's text, add a dated amendment.

**The fact given:** The agreement says it changes only through a decision card (D22). Its step 3 says to log every decision in the Decision Log; the decision-card section says Baesian's routing rule is applied here by hand until Baesian can run it, and that cards go through Baesian once v1 works. Git keeps every earlier version, and the Decision Log records each change.

**The agent's case:** Agents read the agreement at the start of every session; lines that no longer hold, corrected only by a paragraph elsewhere, are the ones an agent follows by mistake. Git and the Decision Log already keep the history.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-jjgpd, revision 1). Filed by claude-code on v1/next, in the deck “The vault adapter”. Context: [[Vault Adapter]], [[Baesian Design]].

The record is in `.baesian/cards/B-jjgpd/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Turning the vault adapter on writes a note for each of the 53 decisions made on cards so far, and the Decision Log gains a Bases query listing them (P17 §10). D174 settled that card decisions get no more D-rows; P17 noted that the Working Agreement's session protocol then needs updating, through a card, since it says to log every decision in the Decision Log.
