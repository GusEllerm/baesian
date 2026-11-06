---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How an option's outcome reads after 'then': Agents write it to follow 'then' (B-b0dzp)."
created: 2026-11-06
updated: 2026-11-06
tags:
  - baesian
  - decision
aliases:
  - B-b0dzp
card: B-b0dzp
revision: 1
title: How an option's outcome reads after 'then'
question: Should the card fix an option's outcome that starts with a capital after 'then', or should agents write it to follow 'then'?
answer: Agents write it to follow 'then'
response: accept
not_chosen:
  - The card lowercases it
answered: 2026-11-06T03:06:18.185Z
answered_by: GusEllerm
topic: client/card/option-then
deck: branch-v1-next
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-06T03:04:44.444Z
filed_by: claude-code
branch: v1/next
---

# How an option's outcome reads after 'then'

Should the card fix an option's outcome that starts with a capital after 'then', or should agents write it to follow 'then'?

**Decided:** Agents write it to follow 'then', the agent's pick. The template and the skill say proposal_then and alternative_then continue a sentence after 'then'. `baesian file` warns when one starts with a capital, so the agent looks again (it may keep a name like GitHub). Cards already filed keep their capitals.

**Not chosen:** The card lowercases it. The card lowercases the outcome's first letter after 'then', unless its first word is all capitals or code. Every card reads right, old ones too, but a name loses its capital: 'then baesian records…'.

**It turned on:** Should the card change what an agent wrote, so it reads right? (a preference) No: show it as written: Agents write it to follow 'then'. Yes: for reading: The card lowercases it.

**The fact given:** The card shows 'then' in front of each option's outcome. Agents often start the outcome with a capital: B-15v62 reads 'then The relay notes…'. A program can't tell a name (Baesian, GitHub) from an ordinary first word, so lowercasing gets names wrong, and a warning at filing can only ask the agent.

**The agent's case:** The text is the agent's; fixing it at the source keeps names right, and the warning catches it where it's written.

Answered by GusEllerm on 2026-11-06, through Baesian (card B-b0dzp, revision 1). Filed by claude-code on v1/next, in the deck “Decisions on v1/next”.

The record is in `.baesian/cards/B-b0dzp/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Seen in the user's screenshot of B-15v62 on an iPad mini (2026-11-05). The lead agent first put this choice to the user in chat, which should have been this card.
