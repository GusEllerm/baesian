---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How the plugin runs the CLI: The one on PATH, checked (B-pw9ak)."
created: 2026-11-10
updated: 2026-11-10
tags:
  - baesian
  - decision
aliases:
  - B-pw9ak
card: B-pw9ak
revision: 1
title: How the plugin runs the CLI
question: Do the plugin's hooks and MCP server run the `baesian` on PATH, or the release the plugin came with, through npx?
answer: The one on PATH, checked
response: accept
not_chosen:
  - npx baesian@<its own version>
answered: 2026-11-10T21:13:16.665Z
answered_by: GusEllerm
topic: release/plugin/cli
deck: release-v1
level: blocking
reverse: cheap
touches:
  - public-api
  - user-facing
filed: 2026-11-10T21:07:05.811Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-n15wk How the docs install the CLI|B-n15wk]]"
---

# How the plugin runs the CLI

Do the plugin's hooks and MCP server run the `baesian` on PATH, or the release the plugin came with, through npx?

**Decided:** The one on PATH, checked, the agent's pick. Then the plugin keeps running `baesian`; at a session's start it compares `baesian --version` with its own version and, when they differ or it's missing, tells the agent once to ask you to install or update.

**Not chosen:** npx baesian@<its own version>. Then the plugin's hooks and MCP server run `npx --yes baesian@<the plugin's version>`, so their half always matches the plugin; agents' own commands and the git hooks still run the `baesian` on PATH, which may be another release.

**It turned on:** Should one agent session ever run two releases of Baesian, the plugin's and yours? (a preference) No: The one on PATH, checked. Yes, if the plugin's half always matches: npx baesian@<its own version>.

**The fact given:** Today the hooks run `baesian` from PATH and say nothing when it's missing; the MCP server's command is `baesian mcp`. Claude Code and Codex update a plugin only when its version changes, and neither updates the command line. The hooks use flags such as `inbox --session`. npx downloads a release the first time it runs it; the hooks' time limit is 30 seconds. Claude Code's plugin bin/ folder reaches its Bash tool, not git's hooks.

**The agent's case:** One session, one release: agents' commands, the gate and the plugin all run the same `baesian`. A version check turns a mismatch into one clear message, rather than a hook failing on a flag it expected.

Answered by GusEllerm on 2026-11-10, through Baesian (card B-pw9ak, revision 1). Filed by claude-code on v1/next, in the deck “Publishing v1: npm, the plugin, what v1 promises, and the formats review”. Context: [[Release v1]].

The record is in `.baesian/cards/B-pw9ak/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Part of M10's plan, [[Release v1]], section "Publishing the plugin". The plugin versions with the CLI (D114, B-rwp68), so each release sets the plugin's version to the release's; until a person updates both, they can differ.
