---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Held-back cards nobody answers: their text on the relay: 90 days, then only its metadata (B-ec3kj)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-ec3kj
card: B-ec3kj
revision: 1
title: "Held-back cards nobody answers: their text on the relay"
question: Should the relay delete the text of a card the gate held back and nobody answered after 90 days, or keep it until it's answered?
answer: 90 days, then only its metadata
response: accept
not_chosen:
  - Until it's answered or withdrawn
answered: 2026-11-03T13:34:47.892Z
answered_by: Gus Ellerm
topic: hosted/held-text-retention
deck: hosted
level: hard
reverse: cheap
touches:
  - security
  - data-loss
  - user-facing
filed: 2026-11-03T13:32:15.483Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-kypkm Whether the service can read card text|B-kypkm]]"
  - "[[B-0pfbf Whether the gate holds cards back|B-0pfbf]]"
  - "[[B-9rycs Held-back cards at merge|B-9rycs]]"
  - "[[B-k216t What the local client does in a hosted repo|B-k216t]]"
---

# Held-back cards nobody answers: their text on the relay

Should the relay delete the text of a card the gate held back and nobody answered after 90 days, or keep it until it's answered?

**Decided:** 90 days, then only its metadata, the agent's pick. A held card nobody answers loses its text on the relay 90 days after it arrives; the website lists it without text, and the record keeps it. Cards in your queue, audit cards included, keep their text until answered or withdrawn.

**Not chosen:** Until it's answered or withdrawn. Held cards keep their text until someone answers them or they're withdrawn, so any can be opened and answered on the website at any time. If the gate holds most cards back, most card text stays on the service while the project exists.

**It turned on:** Will you open held-back cards on the website months after they were filed? Rarely: 90 days, then only its metadata. Yes, sometimes: Until it's answered or withdrawn.

**The fact given:** Under the gate, cards below a row's setting are held back: they skip your queue, the agent goes ahead, and they count as settled at merge (D148, D150). A random sample comes back as audit cards; the rest can be answered later. A held card is never answered unless it's drawn or opened, so deleting text once answered (D137) never deletes it. The repo's record keeps every card either way. In a hosted repo answers come only from the website (D143).

**First chose:** Until it's answered or withdrawn, then switched once the agent's pick was shown.

**The agent's case:** Without a cap, the cards the gate holds back, likely most of them once it enforces, would stay on the service for good, which undoes D137's point. Audits and second looks mostly happen soon after a card is filed.

**Wrong if:** Held cards are opened or answered more than 90 days after filing, or the shadow period shows few cards would be held, so the cap protects little. **To check:** In dogfooding under enforce, log the age of each held card when it's opened on the website; in the shadow period, the share of cards that would be held.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-ec3kj, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-ec3kj/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

P15 proposed deleting an undelivered card's text after 90 days ([[Hosted Service]], section 1, "Retention"), before the gate's decisions. Since then cards can be held back (D148), and held cards are settled at merge without an answer (D150). So "deleted once answered" (D137) leaves them on the relay indefinitely unless something else deletes them.

Cards in your queue are kept under both options: an open card still needs an answer before merge (D31), and in a hosted repo the website is the only place to give it (D143). Deleting a queue card's text would leave it unanswerable. The difference between the options is only the held cards that nobody draws or opens.

Under the first option, a held card older than 90 days can't be opened on the website, though the record has it. Whether the CLI could upload its text again for a late answer is left for later.

The period for answered cards is a separate question (hosted/answered-text-retention).
