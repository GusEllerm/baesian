---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Confirming several hard answers at once: One tap signs a batch (B-a6xpc)."
created: 2026-11-05
updated: 2026-11-05
tags:
  - baesian
  - decision
aliases:
  - B-a6xpc
card: B-a6xpc
revision: 1
title: Confirming several hard answers at once
question: When you answer several hard cards in a row, how should your passkey confirm them, so it isn't asked for at every card?
answer: One tap signs a batch
response: accept
not_chosen:
  - One tap opens a window
answered: 2026-11-05T13:27:02.157Z
answered_by: GusEllerm
topic: hosted/hard-card-proof/several
deck: branch-v1-next
level: hard
reverse: moderate
touches:
  - security
  - schema
  - user-facing
filed: 2026-11-05T13:24:38.141Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-na7je Proof that a person answered a hard card|B-na7je]]"
---

# Confirming several hard answers at once

When you answer several hard cards in a row, how should your passkey confirm them, so it isn't asked for at every card?

**Decided:** One tap signs a batch, the agent's pick. A hard answer waits on the desk, marked as waiting for your passkey, while you go on to the next card. When no hard card is left in front of you, or you choose to, one tap signs every waiting answer together, and each answer's proof names that signature. `baesian verify` still checks offline that your passkey signed each answer (D139). Agents waiting on those cards hear once you tap.

**Not chosen:** One tap opens a window. After a tap, hard answers for the next few minutes need none; the service records that your passkey was checked when the window opened. Nothing waits. CI can check only that the service says a window was open, not that your passkey covered the answer.

**It turned on:** Must each hard answer carry your passkey's own signature, checkable without trusting the service? Yes, as D139 decided: One tap signs a batch. No: a recent passkey check at the service is enough: One tap opens a window.

**The fact given:** D139 put the passkey's signature on each hard answer so the proof doesn't rest on the service, and to tell your answer from an agent's at your keyboard. Within a window, anything driving your browser, a script or an agent using browser tools, could answer hard cards without a tap. The prompt already takes several signatures for one answer ('Step 1 of 2').

**The agent's case:** A batch keeps what D139 bought at one tap per sitting rather than per card, and asks nothing of the service's sessions or clock. Its cost is that answers wait for the tap, about a minute over a deck.

**Wrong if:** Hard cards come one at a time through the day, so a batch is nearly always one answer. **To check:** The usage counts' card_answered events, once there are enough: how often two hard answers come within a few minutes of each other.

Answered by GusEllerm on 2026-11-05, through Baesian (card B-a6xpc, revision 1). Filed by claude-code on v1/next, in the deck “Decisions on v1/next”.

The record is in `.baesian/cards/B-a6xpc/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Asked on 2026-11-05, after the setup deck's two hard cards each took a passkey prompt (and, in the installed app, a phone scan each).

**The proposal in more detail.** The passkey's challenge becomes a digest over the list of waiting answers' digests; the proof file beside each answer gives the list and the one assertion. A new form of the passkey proof, so a format change before v1. The desk shows "2 answers waiting for your passkey" with a button, and asks by itself when the last hard card in view is answered.
