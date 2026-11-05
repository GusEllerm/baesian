---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How an idle agent hears its cards are answered: It leaves a wait running, and wakes when it ends (B-xnae9)."
created: 2026-11-05
updated: 2026-11-05
tags:
  - baesian
  - decision
aliases:
  - B-xnae9
card: B-xnae9
revision: 1
title: How an idle agent hears its cards are answered
question: When an agent ends its turn with cards still waiting, how should it hear that they've been answered?
answer: It leaves a wait running, and wakes when it ends
response: accept
not_chosen:
  - "As now: answers come in with your next message"
answered: 2026-11-05T13:27:28.123Z
answered_by: GusEllerm
topic: plugin/waking-on-answers
deck: branch-v1-next
level: provisional
reverse: cheap
touches:
  - public-api
  - user-facing
filed: 2026-11-05T13:24:40.240Z
filed_by: claude-code
branch: v1/next
---

# How an idle agent hears its cards are answered

When an agent ends its turn with cards still waiting, how should it hear that they've been answered?

**Decided:** It leaves a wait running, and wakes when it ends, the agent's pick. Then `baesian wait` takes several card IDs, or `--deck`, and returns when all are answered, or sooner when one comes back to the agent. The skill tells the agent to leave it running in the background when it ends a turn with cards open; Claude Code wakes the agent when a background command ends, so it acts on your answers without a message from you. Harnesses without that, such as Codex, work as now.

**Not chosen:** As now: answers come in with your next message. The agent stays idle until you write to it, and the hook then brings the answers in. You choose when it starts again, and it spends nothing meanwhile.

**It turned on:** Should an agent start working again by itself when your answers arrive? (a preference) Yes: It leaves a wait running, and wakes when it ends. No: As now: answers come in with your next message.

**The fact given:** Today the plugin brings answers in when a session starts, when you send a message, and when a turn ends if any arrived during it. In Claude Code, a command an agent runs in the background wakes it when the command finishes, even after its turn ended. `baesian wait` listens on the relay's socket, and returns within moments of an answer. A waiting agent uses no tokens until it wakes.

**The agent's case:** You answered the setup deck and then had to tell the session. Waking when the whole set is answered, rather than at each card, keeps an agent from starting on half the answers.

Answered by GusEllerm on 2026-11-05, through Baesian (card B-xnae9, revision 1). Filed by claude-code on v1/next, in the deck “Decisions on v1/next”.

The record is in `.baesian/cards/B-xnae9/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Asked on 2026-11-05. Meanwhile, as a trial, this session leaves a background wait on this card and its neighbour (a shell loop over `baesian wait`), so it wakes when both are answered.
