---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How long one waiting call lasts: 100 seconds, as the CLI (B-3njn3)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-3njn3
card: B-3njn3
revision: 1
title: How long one waiting call lasts
question: How long should one call of the MCP server's waiting tool last?
answer: 100 seconds, as the CLI
response: accept
not_chosen:
  - The whole budget in one call
answered: 2026-11-03T04:10:57.661Z
answered_by: Gus Ellerm
topic: mcp/wait-length
deck: mcp-server
level: blocking
reverse: cheap
touches:
  - public-api
filed: 2026-11-03T03:45:50.685Z
filed_by: claude-code
branch: v1/next
---

# How long one waiting call lasts

How long should one call of the MCP server's waiting tool last?

**Decided:** 100 seconds, as the CLI, the agent's pick. Then wait_for_verdict waits at most 100 seconds per call, as baesian wait does (D101). With the reviewer still there it returns 'again', and the agent calls again, up to six times in the 9-minute budget.

**Not chosen:** The whole budget in one call. One call waits up to 9 minutes, reporting progress every 30 seconds. The registration raises Codex's tool limit to 10 minutes, and the agent makes one call instead of up to six.

**It turned on:** Is a model turn for each 100 seconds of waiting a cost worth configuring harnesses to avoid? (a preference) It isn't: 100 seconds, as the CLI. It is: The whole budget in one call.

**The fact given:** MCP calls aren't bound by the 2-minute shell limit behind D101's slices. Claude Code allows an MCP call about 28 hours by default, but drops a stdio call after 30 minutes without progress; Codex allows 300 seconds unless tool_timeout_sec raises it. Each 'again' costs the agent a model turn. The marker, budget and fallback are the same either way.

**First chose:** The whole budget in one call, then switched once the agent's pick was shown.

**The agent's case:** It behaves like baesian wait in every harness, with the same code and the same meanings, and with nothing to configure in a file both harnesses read. The extra turns are few and short.

**Wrong if:** Agents lose track of the loop and stop after the first 'again', or the turns spent waiting show up as a real cost. **To check:** In rehearse, count MCP waits that stop before a verdict, a fallback or the end of the budget, and measure the tokens each wait uses.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-3njn3, revision 1). Filed by claude-code on v1/next, in the deck “The MCP server”.

The record is in `.baesian/cards/B-3njn3/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Cancelling a call removes the waiting marker under either option, and progress is reported when the harness asks for it. See [[MCP Server#4. Waiting within a tool call]].
