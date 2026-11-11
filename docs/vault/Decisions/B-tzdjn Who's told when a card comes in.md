---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Who's told when a card comes in: Sent to one, open to all (B-tzdjn)."
created: 2026-11-11
updated: 2026-11-11
tags:
  - baesian
  - decision
aliases:
  - B-tzdjn
card: B-tzdjn
revision: 1
title: Who's told when a card comes in
question: With every member able to answer a card, should it be sent first to the member running its agent, with the others seeing whose it is, or to every member alike?
answer: Sent to one, open to all
response: accept
not_chosen:
  - Sent to all alike
answered: 2026-11-11T18:11:19.237Z
answered_by: GusEllerm
topic: reviewers/sent-to
deck: reviewers-joining
level: hard
reverse: cheap
touches:
  - user-facing
filed: 2026-11-11T18:10:42.432Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-r51ts Whose a card is, with several reviewers|B-r51ts]]"
  - "[[B-2n7s4 Who a card reaches first|B-2n7s4]]"
---

# Who's told when a card comes in

With every member able to answer a card, should it be sent first to the member running its agent, with the others seeing whose it is, or to every member alike?

**Decided:** Sent to one, open to all, the agent's pick. Then a card leads the queue of whoever runs its agent, and they alone are told at once. Every member sees it, marked as sent to them, and can answer it; the others are told only if it's still waiting after a while.

**Not chosen:** Sent to all alike. Then every member is told of every card at once, and it's in every queue in the same place. Nothing says who it was sent to; a card shows only whose agent filed it.

**It turned on:** When a card comes in, should one member be told first, or every member at once? (a preference) One first: Sent to one, open to all. Everyone at once: Sent to all alike.

**The fact given:** You answered that a card is every member's (B-r51ts), and that it reaches whoever runs its agent first (B-2n7s4); on the first you wrote 'Perhaps there is a middle ground, cards are sent to others and team members can see that?'. Either way any member can answer, so no card waits on one person. A request by email got a reply from 38% of people addressed alone and 14% of those addressed with fourteen others. Gerrit shows, for each change, who is expected to act now; GitHub tells a whole team by default, and added a setting to tell only the members picked. Clinicians accepted 30% fewer reminders for each extra one they got. With one told first, the others hear of a waiting card later; a blocking card's agent gives up after nine minutes and carries on, as now.

**The agent's case:** It's the middle ground you described, and it keeps what the research says about asking a group: someone is expected to look, by name, and everyone can see who. It also keeps notifications to what needs you: on a project of four, sent to all alike is four times the notifications for the same cards.

Answered by GusEllerm on 2026-11-11, through Baesian (card B-tzdjn, revision 1). Filed by claude-code on v1/next, in the deck “Several reviewers: who's told, who joins, who's trusted”. Context: [[Several Reviewers]], [[Several Reviewers - Research]].

The record is in `.baesian/cards/B-tzdjn/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

On your question, "To route a card to a specific person could block development until they action it right?": only a hard card makes its agent wait. A blocking card's agent gives up after nine minutes and carries on with its pick (D46), and a provisional one never waits. With every member able to answer, a hard card waits for whichever member comes first.

How long "a while" is, and whether it's shorter when an agent has stopped, is for the build to propose.
