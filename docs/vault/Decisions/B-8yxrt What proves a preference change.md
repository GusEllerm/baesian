---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "What proves a preference change: Loosening takes your passkey (B-8yxrt)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-8yxrt
card: B-8yxrt
revision: 1
title: What proves a preference change
question: In a hosted repo, should a change that lets more cards past you also take your passkey, or is the service's signature enough?
answer: Loosening takes your passkey
response: accept
not_chosen:
  - The service's signature only
answered: 2026-11-03T04:02:47.642Z
answered_by: Gus Ellerm
topic: formats/preference-proof
deck: formats-v1
level: hard
reverse: moderate
touches:
  - schema
  - security
filed: 2026-11-03T03:53:03.734Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-refpb Where a repo's preferences are kept|B-refpb]]"
  - "[[B-na7je Proof that a person answered a hard card|B-na7je]]"
---

# What proves a preference change

In a hosted repo, should a change that lets more cards past you also take your passkey, or is the service's signature enough?

**Decided:** Loosening takes your passkey, the agent's pick. A change that moves any row toward held, or turns enforcing on, asks for your passkey and keeps its proof beside the file. verify checks it as it checks a hard-card answer (D139). Tightening needs no prompt.

**Not chosen:** The service's signature only. Every preference change is signed by the service, like any answer (D147), with no passkey prompt when you move a slider. An agent driving your signed-in browser could loosen a row.

**It turned on:** Is letting cards past you as consequential as answering a hard card? If it is: Loosening takes your passkey. If it isn't: The service's signature only.

**The fact given:** A held card counts as settled at merge, with no answer (D150). Today only hard-card answers take the passkey (D139). P15 notes that an agent driving a signed-in browser could answer provisional and blocking cards.

**First chose:** The service's signature only, then switched once the agent's pick was shown.

**The agent's case:** One loosened row can settle many future cards without you, so it's at least as consequential as one hard answer. Tightening can't hide anything, so it stays free.

**Wrong if:** You change sliders often enough that the passkey prompt becomes a reason not to tune them. **To check:** Count preference changes per month while dogfooding, and how many of them loosen a row.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-8yxrt, revision 1). Filed by claude-code on v1/next, in the deck “Formats for v1”. Context: [[Formats for v1]], [[File Formats]].

The record is in `.baesian/cards/B-8yxrt/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

D147 has the service sign preference files in a hosted repo. D139 adds the passkey only for hard-card answers. Since D150, a loosened row settles cards without an answer, which is what this card weighs. The preference file and the proof file are in [[Formats for v1]], sections 2 and 7.
