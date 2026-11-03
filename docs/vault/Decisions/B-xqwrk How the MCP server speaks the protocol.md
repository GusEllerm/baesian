---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "How the MCP server speaks the protocol: The official SDK, v2 (B-xqwrk)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-xqwrk
card: B-xqwrk
revision: 1
title: How the MCP server speaks the protocol
question: Should Baesian's MCP server use the official TypeScript SDK, or implement the part of the protocol it needs itself?
answer: The official SDK, v2
response: accept
not_chosen:
  - Baesian's own small implementation
answered: 2026-11-03T04:05:03.616Z
answered_by: Gus Ellerm
topic: mcp/protocol-library
deck: mcp-server
level: blocking
reverse: moderate
touches:
  - dependency
filed: 2026-11-03T03:45:49.972Z
filed_by: claude-code
branch: v1/next
---

# How the MCP server speaks the protocol

Should Baesian's MCP server use the official TypeScript SDK, or implement the part of the protocol it needs itself?

**Decided:** The official SDK, v2, the agent's pick. Adds @modelcontextprotocol/server and its core package, which need only the zod Baesian already has. Its serveStdio speaks both protocol eras, and each SDK release follows the spec's changes.

**Not chosen:** Baesian's own small implementation. No new dependency. Baesian writes JSON-RPC over stdio for both eras, initialize and server/discover, in a few hundred lines with tests, and follows each spec revision itself.

**It turned on:** Is following MCP's revisions by hand cheaper than taking a fast-moving dependency? It isn't cheaper: The official SDK, v2. It is cheaper: Baesian's own small implementation.

**The fact given:** MCP's 2026-07-28 revision replaced the initialize handshake with per-request metadata and a server/discover method. Codex still opens with initialize by default; Claude Code asks for the new revision and falls back. So the server must speak both. SDK v2 (2.0.0 in July 2026, 2.4.0 on 2026-10-23) does; it depends only on zod ^4.2 and its own core package, 8.4 MB unpacked. Baesian needs only tools, over stdio.

**The agent's case:** Serving two protocol eras while the spec is still moving is what an SDK is for, and v2 costs two packages that share Baesian's zod. By hand, every revision becomes Baesian's work, with the risk of a quiet mismatch with one harness.

**Wrong if:** SDK upgrades break the server more often than the spec's changes would have, or its size matters to people installing Baesian. **To check:** Count SDK upgrades that need code changes from M7 to M10, and compare npm pack sizes with and without it.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-xqwrk, revision 1). Filed by claude-code on v1/next, in the deck “The MCP server”.

The record is in `.baesian/cards/B-xqwrk/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The server has to serve Codex, which opens with the 2025 handshake, and Claude Code, which probes for 2026-07-28, at once. The SDK's v2 split into small packages; v1 brought express, hono and 15 more. What the hand-written subset would cover, and the sources, are in [[MCP Server#9. The official SDK, or the protocol by hand]].
