---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "How generated notes are kept out of livedocs' checks: A flag in each note's frontmatter (B-1t7fw)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-1t7fw
card: B-1t7fw
revision: 1
title: How generated notes are kept out of livedocs' checks
question: Should Baesian mark each decision and rule note as a livedocs snapshot in its frontmatter, or add snapshot globs for their folders to livedocs' config?
answer: A flag in each note's frontmatter
response: accept
not_chosen:
  - Snapshot globs in livedocs' config
answered: 2026-11-03T04:15:14.652Z
answered_by: Gus Ellerm
topic: vault/livedocs-snapshots
deck: vault-adapter
level: blocking
reverse: cheap
touches:
  - schema
filed: 2026-11-03T03:51:56.851Z
filed_by: claude-code
branch: v1/next
---

# How generated notes are kept out of livedocs' checks

Should Baesian mark each decision and rule note as a livedocs snapshot in its frontmatter, or add snapshot globs for their folders to livedocs' config?

**Decided:** A flag in each note's frontmatter, the agent's pick. Each note says "livedocs: snapshot" itself, and Baesian never edits livedocs' config. A note that should one day be checked against the code, a hard decision say, can be written without the flag.

**Not chosen:** Snapshot globs in livedocs' config. Then baesian init --vault adds Decisions/* and Rules/* to livedocs' snapshot globs, as the design says. Notes stay a line shorter; checking any one decision note would mean moving it or narrowing the globs.

**It turned on:** Might you want livedocs to check some decision notes against the code later? If you might: A flag in each note's frontmatter. If you won't: Snapshot globs in livedocs' config.

**The fact given:** livedocs 0.2 treats a note as a snapshot if a snapshot glob in its config matches it, or its frontmatter says livedocs: snapshot. This vault uses both. The design's open questions ask whether binding hard decisions is worth the acks.

**First chose:** Snapshot globs in livedocs' config, then switched once the agent's pick was shown.

**The agent's case:** It keeps the open question on decision drift open note by note, needs nothing from livedocs' config, and the flag does nothing in a vault without livedocs.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-1t7fw, revision 1). Filed by claude-code on v1/next, in the deck “The vault adapter”. Context: [[Vault Adapter]], [[Baesian Design]].

The record is in `.baesian/cards/B-1t7fw/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Both ways, livedocs stamps each new note as a snapshot in the commit that adds it, since Baesian's part of the pre-commit hook runs first. See [[Vault Adapter#6. livedocs]].
