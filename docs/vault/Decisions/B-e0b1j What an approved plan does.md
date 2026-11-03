---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "What an approved plan does: Make it a deck, and ask for its cards (B-e0b1j)."
created: 2026-11-02
updated: 2026-11-02
tags:
  - baesian
  - decision
aliases:
  - B-e0b1j
card: B-e0b1j
revision: 1
title: What an approved plan does
question: When you approve a plan in Claude Code, what should the plugin do with it?
answer: Make it a deck, and ask for its cards
response: accept
not_chosen:
  - Nothing automatic
answered: 2026-11-02T00:34:00.167Z
answered_by: Gus Ellerm
topic: adapters/plan-approval
deck: m5-adapters
level: blocking
reverse: cheap
touches:
  - user-facing
filed: 2026-11-01T21:09:07.728Z
filed_by: claude-code
branch: main
---

# What an approved plan does

When you approve a plan in Claude Code, what should the plugin do with it?

**Decided:** Make it a deck, and ask for its cards, the agent's pick. Then the hook runs `baesian deck --from` on the plan, so the plan becomes the deck's briefing, and tells the agent to file the plan's hard-to-undo decisions into that deck before it builds.

**Not chosen:** Nothing automatic. Then the plan stays in the session, and the skill reminds the agent to file cards as decisions come up, as AGENTS.md already says.

**It turned on:** Once you've approved a plan, do its hard-to-undo decisions still need to come to you one by one? Yes, the hard ones: Make it a deck, and ask for its cards. No, approval settles them: Nothing automatic.

**The fact given:** Approving a plan in Claude Code is one yes for the whole plan. The hook sees the plan only after you approve it, and never approves it itself.

**The agent's case:** One yes covers many decisions; the hard-to-undo ones are what Baesian exists to put to you separately, each with its alternative.

Answered by Gus Ellerm on 2026-11-02, through Baesian (card B-e0b1j, revision 1). Filed by claude-code on main, in the deck “M5: harness adapters”.

The record is in `.baesian/cards/B-e0b1j/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

**What's documented, and what isn't.** Claude Code runs a `PostToolUse` hook on `ExitPlanMode` once a plan is approved, with the plan as `tool_response.plan`, and the hook can add a note to the agent's context. What happens on a rejected plan isn't documented. The agent will test the hook in a real session, with you approving a plan, before relying on it. The hook never runs before the plan is approved, so it can't approve one.
