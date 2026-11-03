---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Whether Baesian writes the config's format: Write it, first in the file (B-xmwmq)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-xmwmq
card: B-xmwmq
revision: 1
title: Whether Baesian writes the config's format
question: When Baesian writes .baesian/config.json, should it write format 1 in it, or leave the key for people to add?
answer: Write it, first in the file
response: accept
not_chosen:
  - Never write it
answered: 2026-11-03T16:55:58.326Z
answered_by: Gus Ellerm
topic: formats/config-format
deck: formats-v1
level: provisional
reverse: cheap
touches:
  - schema
filed: 2026-11-03T13:42:23.523Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-f8k47 Where a file's format version lives|B-f8k47]]"
---

# Whether Baesian writes the config's format

When Baesian writes .baesian/config.json, should it write format 1 in it, or leave the key for people to add?

**Decided:** Write it, first in the file, the agent's pick. Then baesian init writes { "format": 1 } in a new repo, and init --vault writes it beside the vault. A config without it still reads as format 1.

**Not chosen:** Never write it. Then init writes {} as before, and the key appears only if a person adds it. A config without it reads as format 1, and a later format 2 writes 2.

**It turned on:** Should a file Baesian writes but people also edit say its format, as the files only Baesian writes do? If it should: Write it, first in the file. If people's files shouldn't: Never write it.

**The fact given:** format is optional in Config, UserConfig and card drafts, which people write by hand (D156). A file with no format reads as format 1, so either way old and new configs read the same. Baesian writes config.json in two places: baesian init, once per repo, and init --vault, which rewrites it keeping its other keys. Baesian never writes the personal config or a draft.

**The agent's case:** D156 says every file Baesian writes carries its format, and config.json is one it writes. Writing it costs one line and tells whoever edits the file which format it's in.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-xmwmq, revision 1). Filed by claude-code on v1/next, in the deck “Formats for v1”. Context: [[Formats for v1]], [[File Formats]].

The record is in `.baesian/cards/B-xmwmq/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Built as the proposal on the branch, as a two-way door: `Store.init` and `Store.setVault` write `format` first, since the config has no `type`. Reversing it is deleting `format: newestFormat("config")` from those two writes, and the test that checks `init`'s output. Existing configs, this repo's included, are untouched until `init --vault` next rewrites one.
