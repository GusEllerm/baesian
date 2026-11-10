---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Where a card's model comes from: From the harness, through the plugin (B-k0w7d)."
created: 2026-11-10
updated: 2026-11-10
tags:
  - baesian
  - decision
aliases:
  - B-k0w7d
card: B-k0w7d
revision: 1
title: Where a card's model comes from
question: Should a card record the model that filed it from what the harness reports, or from what the agent says it is?
answer: From the harness, through the plugin
response: accept
not_chosen:
  - From the agent's own word
answered: 2026-11-10T19:58:00.428Z
answered_by: GusEllerm
topic: calibration/card-model
deck: calibration
level: blocking
reverse: moderate
touches:
  - schema
  - user-facing
filed: 2026-11-10T19:56:58.200Z
filed_by: claude-code
branch: v1/next
---

# Where a card's model comes from

Should a card record the model that filed it from what the harness reports, or from what the agent says it is?

**Decided:** From the harness, through the plugin, the agent's pick. Then the plugin's hooks note the model when a session starts and whenever it switches, and `baesian file` writes it on the card; a card filed without the plugin, or before the harness has named a model, has none.

**Not chosen:** From the agent's own word. Then every card has a `model` field the agent fills in, as it states its other facts, under any harness, with or without the plugin.

**It turned on:** Is the model an agent names for itself good enough to sort your answers by? Not good enough: From the harness, through the plugin. Good enough: From the agent's own word.

**The fact given:** Claude Code tells a plugin's hooks the model when a session starts (it can be missing, after /clear for one) and whenever it switches; Codex tells every hook. Neither puts it where the commands an agent runs can read it, so the plugin would keep it for them. Every one of this repo's 168 counted cards came from claude-code, and none says which model.

**The agent's case:** The model will decide when a row's record starts over and how your calibration is split, so a wrong one misleads both. The critique's first finding was that the gate already rests too much on what agents say about their own cards; the harness knows the model for certain.

**Wrong if:** Many cards are filed without the plugin, so most would have no model. **To check:** After a week, the share of cards filed with no model.

Answered by GusEllerm on 2026-11-10, through Baesian (card B-k0w7d, revision 1). Filed by claude-code on v1/next, in the deck “How Baesian learns from your answers”.

The record is in `.baesian/cards/B-k0w7d/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The calibration critique ([[Profiles and Collective Steering - Critique]]) found that cards don't record their model, so a model change resets nothing: answers given to one model keep counting toward letting the next one decide alone.

What the model would be used for, once recorded: a row's count for loosening starts again when the model changes (the card on when Baesian proposes moving a row depends on this one), and the calibration panel can show agreement per model.

Under the proposal, the CLI finds its session's model by the session ID Claude Code and Codex give the commands an agent runs (`CLAUDE_CODE_SESSION_ID`, `CODEX_THREAD_ID`), in a small file the plugin's hooks keep in the clone's git directory, never committed. A subagent that runs on another model inside a Claude Code session would be recorded with its session's model, since Claude Code's hooks don't name a subagent's model.

The field is new in the card format, which needs no migration before v1 (D108).
