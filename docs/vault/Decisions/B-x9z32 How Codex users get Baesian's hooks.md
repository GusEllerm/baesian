---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "How Codex users get Baesian's hooks: The same plugin (B-x9z32)."
created: 2026-11-02
updated: 2026-11-02
tags:
  - baesian
  - decision
aliases:
  - B-x9z32
card: B-x9z32
revision: 1
title: How Codex users get Baesian's hooks
question: Should Codex users get Baesian's hooks by installing the plugin Claude Code uses, or from the repo itself?
answer: The same plugin
response: accept
not_chosen:
  - From the repo
answered: 2026-11-02T03:36:05.801Z
answered_by: Gus Ellerm
topic: adapters/codex-install
deck: m5-adapters
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-02T03:34:27.220Z
filed_by: claude-code
branch: main
depends_on:
  - "[[B-rwp68 Where the Claude Code plugin lives|B-rwp68]]"
---

# How Codex users get Baesian's hooks

Should Codex users get Baesian's hooks by installing the plugin Claude Code uses, or from the repo itself?

**Decided:** The same plugin, the agent's pick. Each person installs the plugin once (`codex plugin marketplace add`, then `codex plugin add baesian@baesian`) and trusts its hooks. Its folder is renamed from `plugins/claude-code/` to `plugins/baesian/`. The plan hook does nothing in Codex.

**Not chosen:** From the repo. Then `baesian init` writes the hooks into the repo's `.codex/hooks.json`, committed. Anyone who opens the repo in Codex is asked to trust them, with nothing to install.

**It turned on:** Should a repo turn Baesian's hooks on for everyone who opens it in Codex, or should each person choose to install them? (a preference) Each person installs them: The same plugin. The repo turns them on: From the repo.

**The fact given:** Codex reads Claude Code's plugin and marketplace files: Codex 0.154 installed this repo's plugin unchanged, in a scratch Codex home. Codex also reads hooks from a repo's `.codex/hooks.json`, and runs hooks from either place only after the person reviews and trusts them. Claude Code users install the plugin. Codex's end-of-turn hook expects a different reply from Claude Code's, so the hook script answers each in its own form either way.

**The agent's case:** One install story for both harnesses, one set of hooks to test, and no harness config committed to every repo. Hooks in a repo are commands every clone is asked to run, which is why notify commands stay out of committed config.

Answered by Gus Ellerm on 2026-11-02, through Baesian (card B-x9z32, revision 1). Filed by claude-code on main, in the deck “M5: harness adapters”.

The record is in `.baesian/cards/B-x9z32/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

What carries over to Codex: the skill (as `$baesian`), the session-start and next-message hooks, which print plain text, and the end-of-turn hook, which needs a Codex form (`decision: "block"` with a reason; Codex ignores Claude Code's `additionalContext` there). Codex has no plan approval like Claude Code's, so the plan hook's matcher never fires.

What isn't checked yet: the hooks running inside a Codex session. That needs a trusted hook and a model, which is what rehearse's runs provide.
