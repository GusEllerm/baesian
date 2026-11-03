---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "Which commands the MCP server offers: All twelve agent commands (B-r78qy)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-r78qy
card: B-r78qy
revision: 1
title: Which commands the MCP server offers
question: Which of the CLI's agent commands should Baesian's MCP server offer as tools?
answer: All twelve agent commands
response: accept
not_chosen:
  - The design's three tools
answered: 2026-11-03T04:10:28.812Z
answered_by: Gus Ellerm
topic: mcp/tool-set
deck: mcp-server
level: blocking
reverse: moderate
touches:
  - public-api
filed: 2026-11-03T03:45:50.311Z
filed_by: claude-code
branch: v1/next
---

# Which commands the MCP server offers

Which of the CLI's agent commands should Baesian's MCP server offer as tools?

**Decided:** All twelve agent commands, the agent's pick. Twelve tools, one per agent command, named for the action: file_card, wait_for_verdict, check_inbox, show_card and the rest. An agent can do everything without a shell, and each tool is tested against its command.

**Not chosen:** The design's three tools. Then file_card, get_verdict (which can wait) and list_resolved (since a time), as the design lists them. Revising, replying, rules, attaching and withdrawing stay in the CLI, so those need a shell.

**It turned on:** Will agents use the MCP server where they can't, or don't, run the CLI? They will: All twelve agent commands. They won't: The design's three tools.

**The fact given:** D128 makes the local MCP server 'usually the better way in' to the hosted service, beside the CLI. Claude Code and Codex both have a shell; some harnesses and sandboxed modes offer MCP tools without one (which ones isn't checked). Each tool's schema sits in the model's context unless the harness defers it. Tool names become a public interface once v1 ships.

**The agent's case:** An agent that files through MCP but must revise or reply through its shell has two interfaces to keep straight, and a harness without a shell would get half of Baesian. Each tool is a thin wrapper over the store code its command already uses, so the other nine cost little.

**Wrong if:** Agents with MCP always have a shell as well, and the extra tools crowd the model's context or confuse it. **To check:** In rehearse, count calls per tool over a few sessions in each harness, and how often agents mix the tools and the CLI.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-r78qy, revision 1). Filed by claude-code on v1/next, in the deck “The MCP server”.

The record is in `.baesian/cards/B-r78qy/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The twelve are file, revise, reply, rule, attach, withdraw, wait, inbox, show, list, topics and template. People's commands (init, serve, sync, verify) and the gate preview stay CLI-only. The table of tools, their inputs, outputs and errors is in [[MCP Server#3. The tools]].
