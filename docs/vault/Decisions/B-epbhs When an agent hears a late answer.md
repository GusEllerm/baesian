---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "When an agent hears a late answer: The difference in these options is how we manage the timing of when responses are given back to the agent right. I worry that if it is instant, the interruption can cause messiness in the agents workflow, leading to files being missed etc. So waiting till a natural stopping point might be better? (B-epbhs)."
created: 2026-11-02
updated: 2026-11-02
tags:
  - baesian
  - decision
aliases:
  - B-epbhs
card: B-epbhs
revision: 2
title: When an agent hears a late answer
question: When you answer a card after its agent has stopped waiting, when should the agent act on your answer?
answer: The difference in these options is how we manage the timing of when responses are given back to the agent right. I worry that if it is instant, the interruption can cause messiness in the agents workflow, leading to files being missed etc. So waiting till a natural stopping point might be better?
response: correction
not_chosen:
  - At once, without your writing to it
  - When you next write to it
answered: 2026-11-02T00:45:54.084Z
answered_by: Gus Ellerm
topic: waiting/late-answers
deck: m5-adapters
level: blocking
reverse: cheap
touches:
  - user-facing
  - public-api
filed: 2026-11-02T00:38:10.927Z
filed_by: claude-code
branch: main
---

# When an agent hears a late answer

When you answer a card after its agent has stopped waiting, when should the agent act on your answer?

**Decided:** The difference in these options is how we manage the timing of when responses are given back to the agent right. I worry that if it is instant, the interruption can cause messiness in the agents workflow, leading to files being missed etc. So waiting till a natural stopping point might be better?, the reviewer's own answer.

**Not chosen:** At once, without your writing to it, the agent's pick. You answer in the client, and that's all. Within seconds the agent is woken, even mid-task, and acts on your answer, changing course if you chose against its pick. A command left running in the background wakes it.

**Not chosen:** When you next write to it. You answer in the client; the agent carries on with its pick until you next send it a message. Your answer arrives with that message, and the agent acts on it then. Nothing runs in the background.

**It turned on:** Should an agent be interrupted mid-task to act on an answer you've just given? (a preference) Yes, act at once: At once, without your writing to it. No, wait for my next message: When you next write to it.

**The fact given:** A wait lasts 9 minutes; then the agent carries on with its pick. Either option brings a later answer to it; they differ in when it acts. Today it acts only when it next runs `baesian inbox`, at the start of work, or when you tell it to.

**The agent's case:** You answer in the client, so writing to the agent as well is a second step that's easy to skip, as just happened. An answer that goes against a provisional pick is cheapest to act on early, before more is built on it.

**Wrong if:** Agents woken mid-task lose track of what they were doing, or you'd rather give several answers before any agent acts on them.

Answered by Gus Ellerm on 2026-11-02, through Baesian (card B-epbhs, revision 2). Filed by claude-code on main, in the deck “M5: harness adapters”.

The record is in `.baesian/cards/B-epbhs/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

**How each works.** *At once:* after a wait runs out, the agent leaves `baesian inbox --wait` running in the background, a new option that ends when a verdict arrives on any of the branch's cards and prints it. Claude Code wakes the agent when a background command ends. *At your next message:* the plugin runs `baesian inbox --quiet` each time you send one, and adds any new verdicts to it.

**Why not the wait itself.** `baesian wait` runs in 100-second slices (D101). Left in the background, each slice that ends would wake the agent just to start it again, and it stops at once when the client says you're away.

**In both options** the plugin's `SessionStart` hook brings new verdicts into a new session, and `/baesian` makes the agent check when you want it to. Harnesses that don't wake the agent when a background command ends (Codex, as far as is known) get only those.
