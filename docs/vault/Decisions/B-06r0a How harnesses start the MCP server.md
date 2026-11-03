---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How harnesses start the MCP server: The plugin registers it (B-06r0a)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-06r0a
card: B-06r0a
revision: 1
title: How harnesses start the MCP server
question: How should Claude Code and Codex be told to start Baesian's MCP server?
answer: The plugin registers it
response: accept
not_chosen:
  - Each person adds it
answered: 2026-11-03T04:04:17.723Z
answered_by: Gus Ellerm
topic: mcp/registration
deck: mcp-server
level: hard
reverse: moderate
touches:
  - security
  - user-facing
  - public-api
filed: 2026-11-03T03:45:50.135Z
filed_by: claude-code
branch: v1/next
---

# How harnesses start the MCP server

How should Claude Code and Codex be told to start Baesian's MCP server?

**Decided:** The plugin registers it, the agent's pick. The plugin gets a .mcp.json that runs baesian mcp. Installing the plugin starts the server in every session, in both harnesses, and a plugin update can change what it runs.

**Not chosen:** Each person adds it. The plugin carries no server. The README gives one command per harness (claude mcp add, codex mcp add) to run baesian mcp; those who want the tools add them, and the hooks work either way.

**It turned on:** Should installing the plugin also turn on the MCP tools? (a preference) It should: The plugin registers it. It should be a separate step: Each person adds it.

**The fact given:** Claude Code starts a plugin's MCP servers automatically when the plugin is enabled; Codex reads a plugin's .mcp.json too (whether it asks first isn't checked). The server runs as you, in every repo you open, and lists its tools in each session; Claude Code defers them when there are many. It can't answer cards. A repo's own .mcp.json, which neither option uses, loads without asking in claude -p runs.

**The agent's case:** One install gives the hooks and the tools together. The server adds no capability the CLI lacks, since it can't answer, and the person still chose to install the plugin, unlike a server a repo names for itself.

**Wrong if:** People install the plugin for its hooks and don't want the tools, the tools cost noticeable context in repos that don't use Baesian, or a harness starts plugin servers without the person's consent. **To check:** In rehearse, start a session in a repo without Baesian and measure the tools' context in each harness; check whether Codex asks before starting a plugin's server.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-06r0a, revision 1). Filed by claude-code on v1/next, in the deck “The MCP server”.

The record is in `.baesian/cards/B-06r0a/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The command, baesian mcp, is the same either way, and either way `baesian init` never writes a .mcp.json into a repo. The security reasoning (stdio only, no port, fixed descriptions, no answering tool) is in [[MCP Server#1. Transport, starting and registering]] and [[MCP Server#5. What the server must never do]].
