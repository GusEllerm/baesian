---
type: conventions
status: active
authority: specifies
summary: "How agents and the user work on Baesian: session protocol, which decisions go to the user as decision cards, frontmatter, and writing rules. Accepted as D22."
created: 2026-10-23
updated: 2026-11-03
reviewed: 2026-10-23
tags: [baesian, conventions]
---

# Working Agreement

> Status note: adapted from the personal-website Working Agreement. The user accepted it as drafted on 2026-10-23 (D22), and the lines on logging decisions and on decision cards were rewritten on 2026-11-03, once decisions ran through Baesian (card B-jjgpd). Change it through a decision card.

## Session protocol

- **Start:** read [[Home]] and follow its reading order, then read the newest note in `Sessions/`.
- **End, if anything changed:**
  1. add `Sessions/YYYY-MM-DD Topic.md` from the [[Session log]] template;
  2. update "Current status" in [[Home]], including its "as of" date;
  3. log decisions made in conversation, and agent decisions, in [[Decision Log]], saying who made them. Decisions made on cards need no entry: Baesian writes each as a note in `Decisions/`, which the log lists (D174);
  4. list open decision cards in the session summary to the user.

## Decision cards

Decisions are split by consequence: Baesian's own routing rule (D11). This repo's decision cards go through Baesian (D21): agents file them as `AGENTS.md` says, and the user answers them in the client.

| Kind | Examples | Who decides | How |
|---|---|---|---|
| **The user decides** (one-way doors, or anything architectural) | the card, deck and verdict formats (they are Baesian's public interface); the `.baesian/` layout; CLI and MCP tool names; integrations; new runtime dependencies; anything public-facing; scope | the user | A decision card, filed with `baesian file`, in a deck when several belong together. A blocking or hard card is waited on before building on it. |
| **The agent decides** (two-way doors, local) | naming inside a module, test structure, refactors that keep interfaces | the working agent | Logged as `[agent decision]` with a one-line reason, and listed in the session summary so the user can overturn it |

A card is drafted from `baesian template`: the decision as a neutral question, the two options with what follows from each, the one question the choice turns on (the crux) and what the user needs to answer it, the agent's case, and the cost to reverse.

Never present a proposal as agreed. Never make a "user decides" choice without asking, even when the answer looks obvious.

**Rules in force** are listed in the [[Decision Log]]'s "Rules in force" view, one note each in `Rules/`. They come from answers in the client, and the gate reads them from Baesian, not from the notes (D173).

## Frontmatter

Keep frontmatter flat: `type`, `status` (draft/active/superseded/retired), `authority` (describes/specifies/log/reference), `summary`, `created`, `updated`, `reviewed`, `tags`.

- `specifies` binds only when the note is `active` or `accepted`. A `draft` or `proposed` note is a proposal, not a rule.
- `summary` is for triage: `grep -rh '^summary:' docs/vault/`.

## Writing rules

- Use absolute dates and wikilinks.
- Cite URLs for external facts, and mark anything you didn't check as *unverified*.
- Update an existing note rather than creating a near-duplicate. When a note is replaced, set `status: superseded` and link to the replacement.
- Name code in backticks, by symbol, so livedocs can bind it ([[Home#How to write a note that stays true]]).
- Leave `.obsidian/` alone unless you mean to change it.
