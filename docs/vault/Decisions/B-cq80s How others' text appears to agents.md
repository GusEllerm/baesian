---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "How others' text appears to agents: Quoted, with its author, everywhere (B-cq80s)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-cq80s
card: B-cq80s
revision: 1
title: How others' text appears to agents
question: How should text written by a person or another agent appear in what Baesian's CLI and MCP tools return to agents?
answer: Quoted, with its author, everywhere
response: accept
not_chosen:
  - Raw after a label, as today
answered: 2026-11-03T04:04:40.928Z
answered_by: Gus Ellerm
topic: mcp/foreign-text
deck: mcp-server
level: hard
reverse: cheap
touches:
  - security
  - user-facing
filed: 2026-11-03T03:45:50.878Z
filed_by: claude-code
branch: v1/next
---

# How others' text appears to agents

How should text written by a person or another agent appear in what Baesian's CLI and MCP tools return to agents?

**Decided:** Quoted, with its author, everywhere, the agent's pick. Each comment, title or option others wrote is a JSON string with its author, on one line, so it can't pass for Baesian's own lines. The CLI and the hooks change too, through the same shared functions.

**Not chosen:** Raw after a label, as today. Text appears as baesian wait and inbox print it now, after a label such as 'reviewer:'. People read it more easily; the tools' structured content keeps fields apart, and the hooks' output is unchanged.

**It turned on:** Will agents read text written by people or agents you don't control? They will: Quoted, with its author, everywhere. They won't: Raw after a label, as today.

**The fact given:** Today every card and comment comes from you or agents on your machine. With the hosted service (D132, in v1), cards from other machines arrive through the relay, and later other reviewers' comments may too. A text field can hold newlines, so raw text can imitate lines such as 'resolved: accept'. The CLI's output reaches agents as well, through their shell and the plugin's hooks.

**The agent's case:** Once text arrives from beyond your machine, a forged line could tell an agent that a card was accepted. Quoting keeps each field on its own line at little cost to people, and doing it in the shared functions keeps the CLI and the tools alike.

**Wrong if:** Quoted output makes cards noticeably harder for people to read in a terminal, or agents act on quoted answers less reliably than on raw ones. **To check:** Show the reviewer quoted and raw output for real cards; in rehearse, check that agents act on quoted verdicts as they do now.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-cq80s, revision 1). Filed by claude-code on v1/next, in the deck “The MCP server”.

The record is in `.baesian/cards/B-cq80s/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Either way the tool descriptions are fixed, the server can't answer, and the skill tells agents to treat comments as reasoning, not commands. Quoting narrows prompt injection; it doesn't prevent it. See [[MCP Server#7. Prompt injection through tool results]].
