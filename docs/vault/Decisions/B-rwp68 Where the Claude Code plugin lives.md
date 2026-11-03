---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "Where the Claude Code plugin lives: In this repo, beside the CLI (B-rwp68)."
created: 2026-11-02
updated: 2026-11-02
tags:
  - baesian
  - decision
aliases:
  - B-rwp68
card: B-rwp68
revision: 1
title: Where the Claude Code plugin lives
question: Should the Claude Code plugin live in this repo, beside the CLI, or in a repo of its own?
answer: In this repo, beside the CLI
response: accept
not_chosen:
  - In a repo of its own
answered: 2026-11-02T00:33:28.209Z
answered_by: Gus Ellerm
topic: adapters/plugin-home
deck: m5-adapters
level: blocking
reverse: moderate
touches:
  - user-facing
filed: 2026-11-01T21:09:07.584Z
filed_by: claude-code
branch: main
---

# Where the Claude Code plugin lives

Should the Claude Code plugin live in this repo, beside the CLI, or in a repo of its own?

**Decided:** In this repo, beside the CLI, the agent's pick. Then the plugin sits in plugins/claude-code/, with a marketplace file at the repo's root; it versions with the CLI, and its tests run with the rest.

**Not chosen:** In a repo of its own. Then a separate repo holds the plugin and its marketplace; it releases on its own, and follows the CLI's commands and output from outside.

**It turned on:** Will the plugin's hooks have to change whenever the CLI's commands or output do? Mostly, yes: In this repo, beside the CLI. Rarely: In a repo of its own.

**The fact given:** The hooks run `baesian inbox` when a session starts and `baesian deck --from` on an approved plan, and pass on what they print. People install a plugin from a marketplace: `claude plugin marketplace add <repo>`, then `claude plugin install`.

**The agent's case:** The hooks are thin wrappers over the CLI's output, so they break together; one repo keeps them tested together.

Answered by Gus Ellerm on 2026-11-02, through Baesian (card B-rwp68, revision 1). Filed by claude-code on main, in the deck “M5: harness adapters”.

The record is in `.baesian/cards/B-rwp68/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The plugin, per [[Baesian Design#Getting it into harnesses]]: a skill that teaches an agent to file good cards, a `SessionStart` hook that brings the inbox into the session, a hook on an approved plan, and a `/baesian` command. Everything it does goes through the CLI; without the plugin, `AGENTS.md` still covers the same ground (D27: adapters only make things faster).
