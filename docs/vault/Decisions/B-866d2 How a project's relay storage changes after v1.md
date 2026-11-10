---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How a project's relay storage changes after v1: Numbered migrations, on wake (B-866d2)."
created: 2026-11-10
updated: 2026-11-10
tags:
  - baesian
  - decision
aliases:
  - B-866d2
card: B-866d2
revision: 1
title: How a project's relay storage changes after v1
question: "After 1.0, how do the tables in each project's relay storage change: by numbered migrations run as a project wakes, or only ever by adding?"
answer: Numbered migrations, on wake
response: accept
not_chosen:
  - Only ever add
answered: 2026-11-10T21:13:08.087Z
answered_by: GusEllerm
topic: release/relay/object-migrations
deck: release-v1
level: provisional
reverse: moderate
touches:
  - schema
filed: 2026-11-10T21:07:21.470Z
filed_by: claude-code
branch: v1/next
---

# How a project's relay storage changes after v1

After 1.0, how do the tables in each project's relay storage change: by numbered migrations run as a project wakes, or only ever by adding?

**Decided:** Numbered migrations, on wake, the agent's pick. Then each project's storage records its schema version in its meta table; a release adds numbered migrations, run in one transaction the first time a project wakes after a deploy, which may change or drop columns.

**Not chosen:** Only ever add. Then tables and columns are only added, as now (`CREATE TABLE IF NOT EXISTS`); a change that needs a column changed or dropped is made as a new table beside the old one, which stays.

**It turned on:** Will a later release need to change or drop something already stored in a project's tables? Likely: Numbered migrations, on wake. Unlikely: Only ever add.

**The fact given:** Each project's Durable Object makes its tables with `CREATE TABLE IF NOT EXISTS`: files, log, meta, pending, before_linking, five retention tables and three notification tables. Nothing records which release made them, and nothing alters them. The accounts database has numbered migrations, five so far, applied by the deploy before the new code, adding only. The service is live, holding real projects, this repo's among them.

**The agent's case:** A version in the meta table costs one row and keeps every later choice open; without it, the first change that isn't an addition can't tell which projects still have the old shape.

Answered by GusEllerm on 2026-11-10, through Baesian (card B-866d2, revision 1). Filed by claude-code on v1/next, in the deck “Publishing v1: npm, the plugin, what v1 promises, and the formats review”. Context: [[Release v1]].

The record is in `.baesian/cards/B-866d2/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Part of M10's plan, [[Release v1]], finding F3 of the formats review. The relay's files themselves (the live layer it holds) are covered by the file formats' own numbers (D156); this is the tables around them.
