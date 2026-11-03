---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "The filing tool's input: Fields, with a schema (B-sq20r)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-sq20r
card: B-sq20r
revision: 1
title: The filing tool's input
question: In what form should the MCP server's filing tool take a card?
answer: Fields, with a schema
response: accept
not_chosen:
  - One Markdown document
answered: 2026-11-03T04:10:40.279Z
answered_by: Gus Ellerm
topic: mcp/card-input
deck: mcp-server
level: blocking
reverse: moderate
touches:
  - public-api
filed: 2026-11-03T03:45:50.500Z
filed_by: claude-code
branch: v1/next
---

# The filing tool's input

In what form should the MCP server's filing tool take a card?

**Decided:** Fields, with a schema, the agent's pick. Then file_card takes the card's fields as JSON arguments, with a schema generated from the store's card schema and the template's notes. The harness shows each field's guidance, and an error names the field.

**Not chosen:** One Markdown document. Then file_card takes one string in the template's format, parsed as baesian file parses it. Agents write one format for the CLI and the tool, and the tool's schema is a single text field.

**It turned on:** Do agents fill in a card better field by field than as the template's Markdown? Field by field: Fields, with a schema. As Markdown: One Markdown document.

**The fact given:** Today agents copy baesian template: YAML frontmatter with a comment on each field, and background below it. An MCP tool describes its arguments with a JSON Schema that the harness shows the model; the store's card schema can produce one, and the template's notes can describe each field. Either form would be checked by the same filing code.

**The agent's case:** A schema is how harnesses expect tools to take structured input: the model sees each field's note, required fields are marked, and an error points at one field. Generating it from the store's schema and the template's notes keeps the two from drifting.

**Wrong if:** Cards filed through the schema come back for missing context, or fail validation, more often than cards written from the template. **To check:** In dogfooding, compare invalid_card errors and need-more-context answers for cards filed each way.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-sq20r, revision 1). Filed by claude-code on v1/next, in the deck “The MCP server”.

The record is in `.baesian/cards/B-sq20r/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

revise_card takes a card the same way, so this decides both. Under either option the template stays, and card_template returns it. See [[MCP Server#Inputs and outputs]].
