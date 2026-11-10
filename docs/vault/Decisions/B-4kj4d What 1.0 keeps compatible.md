---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "What 1.0 keeps compatible: Files, relay, and agents' commands (B-4kj4d)."
created: 2026-11-10
updated: 2026-11-10
tags:
  - baesian
  - decision
aliases:
  - B-4kj4d
card: B-4kj4d
revision: 1
title: What 1.0 keeps compatible
question: "From 1.0, what does each later 1.x keep working: only Baesian's files and the relay's protocol, or also the commands agents are told to run?"
answer: Files, relay, and agents' commands
response: accept
not_chosen:
  - Files and the relay only
answered: 2026-11-10T21:12:59.528Z
answered_by: GusEllerm
topic: release/v1/promise
deck: release-v1
level: provisional
reverse: moderate
touches:
  - public-api
  - schema
filed: 2026-11-10T21:07:12.854Z
filed_by: claude-code
branch: v1/next
---

# What 1.0 keeps compatible

From 1.0, what does each later 1.x keep working: only Baesian's files and the relay's protocol, or also the commands agents are told to run?

**Decided:** Files, relay, and agents' commands, the agent's pick. Then a later 1.x reads every file and trailer, keeps the relay's /v1/ API, and keeps the commands, flags, exit codes and MCP tools that AGENTS.md and the plugin tell agents to use; other output may change.

**Not chosen:** Files and the relay only. Then a later 1.x reads every file and trailer and keeps the relay's /v1/ API; commands, flags and exit codes may change in any release, and repos run `baesian init` again to refresh what AGENTS.md tells agents.

**It turned on:** Will agents often follow instructions an older Baesian committed, while running a newer one? Yes, often: Files, relay, and agents' commands. Rarely: Files and the relay only.

**The fact given:** `baesian init` commits a block to AGENTS.md naming commands and `baesian wait`'s exit codes (0, 4, 5, 6, 7, 8); updating the command line doesn't rewrite it. The plugin's hooks print the installed command line's own instructions. D108, D156 and D157 already make files versioned from v1. The relay's protocol is versioned in its address, /v1/ (B-7z97x). The MCP server's twelve tools mirror the commands.

**The agent's case:** Agents read instructions written by whichever Baesian last ran `init` in the repo, so the commands and exit codes those name are as public as the files; breaking them silently sends agents the wrong way.

Answered by GusEllerm on 2026-11-10, through Baesian (card B-4kj4d, revision 1). Filed by claude-code on v1/next, in the deck “Publishing v1: npm, the plugin, what v1 promises, and the formats review”. Context: [[Release v1]].

The record is in `.baesian/cards/B-4kj4d/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Part of M10's plan, [[Release v1]], section "What v1 means". Either way the docs gain a short compatibility statement, and the tests a check that each release reads the records of the releases before it.
