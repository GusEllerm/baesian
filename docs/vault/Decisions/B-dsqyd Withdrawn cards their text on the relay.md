---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Withdrawn cards: their text on the relay: 30 days after delivery, as answered (B-dsqyd)."
created: 2026-11-04
updated: 2026-11-04
tags:
  - baesian
  - decision
aliases:
  - B-dsqyd
card: B-dsqyd
revision: 1
title: "Withdrawn cards: their text on the relay"
question: Once a card is withdrawn and every machine has the withdrawal, should the relay keep its text 30 more days, as an answered card's, or delete it then?
answer: 30 days after delivery, as answered
response: accept
not_chosen:
  - Deleted once delivered
answered: 2026-11-04T20:03:21.499Z
answered_by: Gus Ellerm
topic: hosted/withdrawn-text-retention
deck: hosted
level: hard
reverse: cheap
touches:
  - data-loss
  - privacy
  - user-facing
filed: 2026-11-04T20:02:13.460Z
filed_by: claude-code
branch: worktree-agent-a0bd0dd57881ac741
depends_on:
  - "[[B-9jqt4 How long an answered card's text stays on the relay|B-9jqt4]]"
  - "[[B-ec3kj Held-back cards nobody answers their text on the relay|B-ec3kj]]"
---

# Withdrawn cards: their text on the relay

Once a card is withdrawn and every machine has the withdrawal, should the relay keep its text 30 more days, as an answered card's, or delete it then?

**Decided:** 30 days after delivery, as answered, the agent's pick. Its text stays 30 days after every machine in the project has the withdrawal, then only its ID, times, sizes and level, as an answered card's (B-9jqt4). Meanwhile, cards related to it still name it on the website.

**Not chosen:** Deleted once delivered. Its text goes at the relay's next daily check after every machine has the withdrawal. Cards related to it then show it without its title, as a withdrawn card whose text is gone; the repo's record still has it.

**It turned on:** Do you want withdrawn cards named on the website, beside the cards related to them, for a month after they're withdrawn? Yes, for a month: 30 days after delivery, as answered. No, they're finished: Deleted once delivered.

**The fact given:** A card is withdrawn by its agent, or by Baesian when a card it builds on is rejected (D14). A withdrawn card can't be answered, so the reason B-9jqt4 keeps an answered card's text for 30 days, changing your answer (D81), doesn't apply; the website shows a withdrawn card only as a named link on the path of cards that build on it or conflict with it. B-ec3kj said cards in the queue keep their text 'until answered or withdrawn' without saying how soon after; P15 had proposed 30 days for 'resolved or withdrawn'. The repo's record keeps every card either way. Until this is answered, the relay keeps withdrawn cards' text.

**The agent's case:** One rule for every finished card is easier to state in the privacy policy and to check, and a month of withdrawn cards adds little to what a breach exposes beside a month of answered ones.

**Wrong if:** Withdrawn cards are rarely linked from other cards, so keeping them a month shows nothing anyone uses. **To check:** In dogfooding, count withdrawn cards that other cards depend on or conflict with.

Answered by Gus Ellerm on 2026-11-04, through Baesian (card B-dsqyd, revision 1). Filed by claude-code on worktree-agent-a0bd0dd57881ac741, in the deck “The hosted service”.

The record is in `.baesian/cards/B-dsqyd/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Retention is being built from B-9jqt4 ("Keep it 30 days after delivery") and B-ec3kj ("90 days, then only its metadata"). Neither says when a withdrawn card's text goes: B-9jqt4 is about answered cards, and B-ec3kj about held cards nobody answers, with queue cards kept "until answered or withdrawn".

"Delivered" is read as for an answered card: every machine whose grant for the project is live (not signed out, not lapsed after 30 days unused) has pulled the relay's log past the card's last entry. The relay checks once a day.

The draft privacy policy ([[Privacy Policy]]) marks this row ⟨withdrawn⟩ until it's answered.
