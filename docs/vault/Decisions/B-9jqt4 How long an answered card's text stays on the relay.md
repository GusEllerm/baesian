---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How long an answered card's text stays on the relay: Keep it 30 days after delivery (B-9jqt4)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-9jqt4
card: B-9jqt4
revision: 1
title: How long an answered card's text stays on the relay
question: Once a card is answered and every machine has the answer, should the relay delete its text at once, or keep it 30 days for the website?
answer: Keep it 30 days after delivery
response: accept
not_chosen:
  - Delete it once delivered
answered: 2026-11-03T13:33:28.707Z
answered_by: Gus Ellerm
topic: hosted/answered-text-retention
deck: hosted
level: hard
reverse: cheap
touches:
  - security
  - data-loss
  - user-facing
filed: 2026-11-03T13:32:02.326Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-kypkm Whether the service can read card text|B-kypkm]]"
  - "[[B-k216t What the local client does in a hosted repo|B-k216t]]"
---

# How long an answered card's text stays on the relay

Once a card is answered and every machine has the answer, should the relay delete its text at once, or keep it 30 days for the website?

**Decided:** Keep it 30 days after delivery, the agent's pick. For 30 days after every machine has pulled the answer, the website still shows the card, so you can change your answer (D81) or look back at recent decisions. Then only its IDs, times, sizes and levels stay on the relay.

**Not chosen:** Delete it once delivered. The text goes as soon as every machine has pulled the answer, often seconds after you give it. The website then shows only that the card was answered, so an answer can't be changed there once the agent has it.

**It turned on:** Will you want to change answers, or look back at recent ones, on the website after the agent has them? Yes, sometimes: Keep it 30 days after delivery. Rarely: Delete it once delivered.

**The fact given:** The repo's record keeps every card either way (D127), and a public repo's record is public (D136). In P15, baesian wait long-polls the relay, so an answer often reaches the machine within seconds. In a hosted repo answers come only from the website (D143). Changing an answer after the agent has acted sends a rework brief (D81). D137 deletes text once a card is answered without saying how soon: P15 proposed 30 days; P16 reads it as at once.

**The agent's case:** Answers arrive within seconds, so deleting at delivery would end changed answers (D81) in hosted repos. A month's window keeps them, and bounds what a breach adds to a month of decided cards, most of which are in the repo's record anyway.

**Wrong if:** Nobody changes an answer or opens a decided card on the website more than a day or two after it was delivered. **To check:** In dogfooding, log how long after delivery a card is opened or answered again on the website.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-9jqt4, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-9jqt4/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

P15 proposed the periods as the agent's suggestions, not sourced norms ([[Hosted Service]], section 1, "Retention"). D137 then settled that card text is deleted once answered, and [[Formats for v1]] (P16, section 8) wrote the relay's entry as dropping its body "once it's delivered and its card resolved". The two readings differ only in how soon; this card asks which.

"Delivered" here means every machine with a grant for the project has pulled the answer. A machine that never syncs again holds deletion until its grant lapses (P15 proposes 30 days unused).

What stays after the text goes: the entry's path, sequence number, size, digest, machine and time (P16, section 8, and D162). The relay needs them to refuse a different file at a path it has seen, and for usage counts (D141).

The cards whose text "once answered" never deletes, held cards nobody answers, are a separate question (hosted/held-text-retention).
