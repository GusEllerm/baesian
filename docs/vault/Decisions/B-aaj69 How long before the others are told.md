---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How long before the others are told: After half an hour (B-aaj69)."
created: 2026-11-11
updated: 2026-11-11
tags:
  - baesian
  - decision
aliases:
  - B-aaj69
card: B-aaj69
revision: 1
title: How long before the others are told
question: When an agent has stopped for a card and the member it was sent to hasn't answered, should the other members be told after ten minutes, or after half an hour?
answer: After half an hour
response: alternative
not_chosen:
  - After ten minutes
answered: 2026-11-11T19:55:16.201Z
answered_by: GusEllerm
topic: reviewers/others-told-after
deck: reviewers-joining
level: hard
reverse: cheap
touches:
  - user-facing
filed: 2026-11-11T19:29:19.706Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-tzdjn Who's told when a card comes in|B-tzdjn]]"
---

# How long before the others are told

When an agent has stopped for a card and the member it was sent to hasn't answered, should the other members be told after ten minutes, or after half an hour?

**Decided:** After half an hour, the alternative. Then the other members hear of a blocking or hard card only once it has waited thirty minutes. A provisional card never notifies the others on its own. Passing a card on tells them at once.

**Not chosen:** After ten minutes, the agent's pick. Then a blocking or hard card still waiting ten minutes after it arrived is notified to every other member. A provisional card never notifies the others on its own. Passing a card on tells them at once.

**It turned on:** How long should the person a card was sent to have, before the rest of the team is interrupted for it? (a preference) Ten minutes: After ten minutes. Half an hour: After half an hour.

**The fact given:** You chose that the member a card was sent to is told at once, and the others only if it's still waiting after a while (B-tzdjn). The member it was sent to hears of a blocking or hard card ten seconds after it arrives, as now. An agent waiting on a blocking card gives up after nine minutes and carries on with its pick; on a hard card it waits until someone answers. Whoever is on the desk sees every card as it arrives, whatever they're notified of. PagerDuty's default before it tries the next person is thirty minutes. In one study, clinicians accepted 30% fewer reminders for each extra one they got. Either way, a member gets at most four notifications an hour from a project, as now.

**The agent's case:** You answered 'every member's' so that development doesn't wait on one person. A hard card's agent waits for as long as nobody answers, and ten minutes is about when a blocking card's agent gives up. The person who runs an agent is usually at their desk; ten minutes of silence mostly means they're away.

Answered by GusEllerm on 2026-11-11, through Baesian (card B-aaj69, revision 1). Filed by claude-code on v1/next, in the deck “Several reviewers: who's told, who joins, who's trusted”. Context: [[Several Reviewers]], [[Several Reviewers - Research]].

The record is in `.baesian/cards/B-aaj69/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Whichever is chosen is one number in the service (`OTHERS_AFTER_MS`); the rest of who's told is as B-tzdjn has it.
