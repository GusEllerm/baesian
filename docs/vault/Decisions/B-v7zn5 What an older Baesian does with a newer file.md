---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "What an older Baesian does with a newer file: Refuse it, naming the version needed (B-v7zn5)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-v7zn5
card: B-v7zn5
revision: 1
title: What an older Baesian does with a newer file
question: When Baesian meets a file in a newer format than it knows, should it refuse it, or read the fields it knows and skip the rest?
answer: Refuse it, naming the version needed
response: accept
not_chosen:
  - Read what it knows, skip the rest
answered: 2026-11-03T04:08:53.595Z
answered_by: Gus Ellerm
topic: formats/newer-format
deck: formats-v1
level: blocking
reverse: moderate
touches:
  - schema
filed: 2026-11-03T03:53:02.315Z
filed_by: claude-code
branch: v1/next
---

# What an older Baesian does with a newer file

When Baesian meets a file in a newer format than it knows, should it refuse it, or read the fields it knows and skip the rest?

**Decided:** Refuse it, naming the version needed, the agent's pick. Schemas stay strict. A newer file fails with "this record has card format 2; this Baesian reads up to 1: upgrade it". CI must run a Baesian at least as new as the agents' and the service's.

**Not chosen:** Read what it knows, skip the rest. Unknown fields are skipped, and a new format may only add fields. An older CI or CLI keeps working on a newer record, but may miss what a new field says.

**It turned on:** Could a field added later change what a file means to a reader that skips it? If it could: Refuse it, naming the version needed. If additions never change meaning: Read what it knows, skip the rest.

**The fact given:** Every schema is strict today, so an unknown field fails to parse. CI runs whichever Baesian its workflow installs, which can lag the agents' and the service's. The hosted service runs one version for everyone (D129).

**The agent's case:** Status and both gates are computed from these files, so a skipped field could make an answer that doesn't count look as if it does, or a card look settled when it isn't. A clear failure costs an upgrade; a silent misreading costs trust in the record.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-v7zn5, revision 1). Filed by claude-code on v1/next, in the deck “Formats for v1”. Context: [[Formats for v1]], [[File Formats]].

The record is in `.baesian/cards/B-v7zn5/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

D108 ruled out tolerant parsing before v1. After v1, readers and writers of different versions will meet: CI, agents' machines and the service upgrade at different times. This card decides what the older one does. The proposal is in [[Formats for v1]], section 1.
