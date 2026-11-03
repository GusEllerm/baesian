---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "Whether a card names the machine that filed it: Only the relay knows (B-e907q)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-e907q
card: B-e907q
revision: 1
title: Whether a card names the machine that filed it
question: Should each card record the name of the machine it was filed from, or should only the service know which machine uploaded it?
answer: Only the relay knows
response: accept
not_chosen:
  - Each card names its machine
answered: 2026-11-03T04:00:48.588Z
answered_by: Gus Ellerm
topic: formats/card-machine
deck: formats-v1
level: hard
reverse: moderate
touches:
  - schema
  - security
filed: 2026-11-03T03:53:03.480Z
filed_by: claude-code
branch: v1/next
---

# Whether a card names the machine that filed it

Should each card record the name of the machine it was filed from, or should only the service know which machine uploaded it?

**Decided:** Only the relay knows, the agent's pick. The relay records which signed-in machine uploaded each file, and the website shows it and spots bursts. The committed record names no machine, as cards name no folder (D105).

**Not chosen:** Each card names its machine. A machine field on every card, from the grant's name, so git, CI and the local client can show where a card came from. A public repo's record keeps every name, in its history for good.

**It turned on:** Will you need to know which machine filed a card when reading the record without the service? If not: Only the relay knows. If so: Each card names its machine.

**The fact given:** A public repo's record keeps every card's full text (D136). The sign-in page names each machine by its hostname (P15). After deleting card text, the relay keeps IDs and timestamps (D137, P15).

**First chose:** Each card names its machine, then switched once the agent's pick was shown.

**The agent's case:** The service already knows the machine behind every upload, and needs it for rate limits. The record is often public, and a hostname says more about a person's setup than a decision needs.

**Wrong if:** Looking into a bad card needs its machine after the relay's metadata is gone, or in git without the service. **To check:** While dogfooding on two machines, note each time you wanted a card's machine, and whether the website had it.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-e907q, revision 1). Filed by claude-code on v1/next, in the deck “Formats for v1”. Context: [[Formats for v1]], [[File Formats]].

The record is in `.baesian/cards/B-e907q/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

P15 left this open (section 10 there). D105 dropped the folder a card was filed from and said a machine name would be its own decision. The relay's entry, which would hold the machine under the first option, is in [[Formats for v1]], section 8.
