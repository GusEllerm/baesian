---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "A choice answered in chat: File it, marked seen (B-hswmx)."
created: 2026-11-06
updated: 2026-11-06
tags:
  - baesian
  - decision
aliases:
  - B-hswmx
card: B-hswmx
revision: 1
title: A choice answered in chat
question: When the reviewer answers a choice in chat, should it go into Baesian's record as a card?
answer: File it, marked seen
response: accept
not_chosen:
  - Log it, as now
answered: 2026-11-06T03:44:31.824Z
answered_by: GusEllerm
topic: cards/answered-in-chat
deck: branch-v1-next
level: provisional
reverse: moderate
touches:
  - schema
  - user-facing
filed: 2026-11-06T03:20:05.882Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-qrdhh Holding agents to filing cards|B-qrdhh]]"
---

# A choice answered in chat

When the reviewer answers a choice in chat, should it go into Baesian's record as a card?

**Decided:** File it, marked seen, the agent's pick. Then the agent files the card with your chat answer as its pick, marked seen; you confirm it in the client with one tap. It joins the record and can become a rule; calibration leaves it out.

**Not chosen:** Log it, as now. Then the agent writes it in the Decision Log as a D-row naming you. It isn't in the record, can't become a rule or be matched by the gate, and calibration never sees it.

**It turned on:** Should what you decide in conversation count in Baesian's record and rules? (a preference) Yes: one record: File it, marked seen. No: chat stays chat: Log it, as now.

**The fact given:** B-qrdhh now sends an agent back to file a card when it asks you to choose in chat, but sometimes you've already answered there. Only a person resolves a card, in the client (D32). Calibration counts a card only when you choose before seeing the agent's pick; a choice discussed in chat is already seen. This repo's chat decisions so far are D-rows (D180, D181).

**The agent's case:** Rules and the gate's matching come only from cards; a seen mark keeps calibration honest, and one tap keeps the person, not the agent, as the one who resolves it.

Answered by GusEllerm on 2026-11-06, through Baesian (card B-hswmx, revision 1). Filed by claude-code on v1/next, in the deck “Decisions on v1/next”.

The record is in `.baesian/cards/B-hswmx/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Follows B-qrdhh r2, which said this would come as its own card.
