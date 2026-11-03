---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "Where a file's format version lives: A version in every file (B-f8k47)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-f8k47
card: B-f8k47
revision: 1
title: Where a file's format version lives
question: From v1, should each file carry its own format version, or should each store declare one version for all its files?
answer: A version in every file
response: accept
not_chosen:
  - One version per store
answered: 2026-11-03T04:04:01.758Z
answered_by: Gus Ellerm
topic: formats/version-field
deck: formats-v1
level: blocking
reverse: one-way
touches:
  - schema
filed: 2026-11-03T03:53:02.110Z
filed_by: claude-code
branch: v1/next
---

# Where a file's format version lives

From v1, should each file carry its own format version, or should each store declare one version for all its files?

**Decided:** A version in every file, the agent's pick. Every file Baesian writes gets format: 1, numbered per kind of file. Readers upgrade older files in memory and never rewrite one, so old commits, signatures and passkey proofs stay valid as written.

**Not chosen:** One version per store. A format file in .baesian/ and .git/baesian/ declares the version of everything in it. A migration rewrites every file in one commit, and the service signs again what it had signed.

**It turned on:** Will a migration ever need to rewrite files that are already written? If it never will: A version in every file. If it may: One version per store.

**The fact given:** Files are written once (D34). CI checks each commit against its own record, so old commits keep old files. Answers carry the service's signature over their exact bytes (D138), and hard-card answers also a passkey's (D139).

**The agent's case:** Immutable, signed files can't be rewritten without losing what makes them trustworthy, so each must say what it is for as long as it exists. A per-store marker suits a database that migrates in place, which the record isn't.

**Wrong if:** A format change after v1 can only be expressed by rewriting files already written, such as a change to what an existing field means on every card. **To check:** Sketch the first likely format 2, the research rows in preference files (P14 item 16), as an in-memory upgrade from format 1, and see whether any file needs rewriting.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-f8k47, revision 1). Filed by claude-code on v1/next, in the deck “Formats for v1”. Context: [[Formats for v1]], [[File Formats]].

The record is in `.baesian/cards/B-f8k47/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

From v1 on, a format change needs a version and a migration (D108). Where the version lives decides what a migration is: an upgrade applied as each file is read, or a rewrite of the store. The proposal, its fields and the reasons are in [[Formats for v1]], section 1.
