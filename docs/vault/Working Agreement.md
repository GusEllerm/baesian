---
type: conventions
status: active
authority: specifies
summary: "How agents and the user work on Baesian: session protocol, which decisions go to the user as decision cards, frontmatter, and writing rules. Accepted as D22."
created: 2026-10-23
updated: 2026-10-23
reviewed: 2026-10-23
tags: [baesian, conventions]
---

# Working Agreement

> Status note: adapted from the personal-website Working Agreement. The user accepted it as drafted on 2026-10-23 (D22). Change it through a decision card.

## Session protocol

- **Start:** read [[Home]] and follow its reading order, then read the newest note in `Sessions/`.
- **End, if anything changed:**
  1. add `Sessions/YYYY-MM-DD Topic.md` from the [[Session log]] template;
  2. update "Current status" in [[Home]], including its "as of" date;
  3. log every decision in [[Decision Log]], saying who made it;
  4. list open decision cards in the session summary to the user.

## Decision cards

Decisions are split by consequence. This is Baesian's own routing rule (D11), applied to this repo by hand until Baesian can run it.

| Kind | Examples | Who decides | How |
|---|---|---|---|
| **The user decides** (one-way doors, or anything architectural) | the card, deck and verdict formats (they are Baesian's public interface); the `.baesian/` layout; CLI and MCP tool names; integrations; new runtime dependencies; anything public-facing; scope | the user | A decision card. Blocking ones go out at once (at most four per batch); the rest are batched at the end of the session. |
| **The agent decides** (two-way doors, local) | naming inside a module, test structure, refactors that keep interfaces | the working agent | Logged as `[agent decision]` with a one-line reason, and listed in the session summary so the user can overturn it |

A card follows the [[Decision Card]] template and fits on one screen:

- the decision, as a question;
- why now;
- options, including the strongest alternative;
- recommendation and reasons;
- cost to reverse;
- what is needed from the user.

Never present a proposal as agreed. Never make a "user decides" choice without asking, even when the answer looks obvious.

**Dogfooding (D21):** once Baesian v1 works, this repo's decision cards go through Baesian instead of the chat.

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
