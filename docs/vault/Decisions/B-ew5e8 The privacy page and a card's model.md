---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "The privacy page and a card's model: Name it beside the agent (B-ew5e8)."
created: 2026-11-10
updated: 2026-11-10
tags:
  - baesian
  - decision
aliases:
  - B-ew5e8
card: B-ew5e8
revision: 1
title: The privacy page and a card's model
question: Should the privacy page name the model an agent ran on among what the service keeps of a card, now that cards record it?
answer: Name it beside the agent
response: accept
not_chosen:
  - Leave the page as it is
answered: 2026-11-10T20:24:49.113Z
answered_by: GusEllerm
topic: calibration/card-model-privacy
deck: calibration
level: hard
reverse: cheap
touches:
  - privacy
  - user-facing
filed: 2026-11-10T20:23:37.617Z
filed_by: claude-code
branch: worktree-agent-a2797a2623e7d4991
depends_on:
  - "[[B-k0w7d Where a card's model comes from|B-k0w7d]]"
---

# The privacy page and a card's model

Should the privacy page name the model an agent ran on among what the service keeps of a card, now that cards record it?

**Decided:** Name it beside the agent, the agent's pick. Then the page's list reads “… the agent that filed it and the model it ran on, the machine it came from …”, with the policy's date moved to the release that ships it.

**Not chosen:** Leave the page as it is. Then the model is kept as one of the card's fields, under “each card's full text”, and the page's list names the agent alone.

**It turned on:** Should the page's list of what a card carries name every field the service can read, or only the ones that say who filed it and where? (a preference) Every one: Name it beside the agent. Who and where are enough: Leave the page as it is.

**The fact given:** The page (/privacy, dated 2026-11-06) lists “each card's full text and its revisions, withdrawals, attachments and decks, the agent that filed it, the machine it came from, the name of the branch it was filed on, and when”. A card's model is a name like “claude-opus-5-5”, written by the plugin from what the harness says; it goes to the service with the card and is deleted with its text.

**The agent's case:** The list already names the agent, so a reader would take it as complete; naming the model keeps it so, at the cost of one line and a new date.

**Wrong if:** The page is meant to list kinds of data rather than fields, so naming one more field makes it read as narrower than it is. **To check:** Whether each item in the page's list of what your agents file is a field or a kind of data.

Answered by GusEllerm on 2026-11-10, through Baesian (card B-ew5e8, revision 1). Filed by claude-code on worktree-agent-a2797a2623e7d4991, in the deck “How Baesian learns from your answers”.

The record is in `.baesian/cards/B-ew5e8/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

B-k0w7d made `source_model` a card field, filled in by Baesian from the harness through the plugin. It travels with the card to the relay like every other field, and retention removes it with the card's text. Nothing on the privacy page changes until this is answered; the vault's note on the policy is acknowledged meanwhile, since "each card's full text" covers it.
