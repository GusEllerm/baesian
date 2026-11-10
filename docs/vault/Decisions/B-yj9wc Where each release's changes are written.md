---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Where each release's changes are written: GitHub Releases, from the tag (B-yj9wc)."
created: 2026-11-10
updated: 2026-11-10
tags:
  - baesian
  - decision
aliases:
  - B-yj9wc
card: B-yj9wc
revision: 1
title: Where each release's changes are written
question: "Where do people read what changed in each release: GitHub Releases made from the tag, or a CHANGELOG.md in the repo?"
answer: GitHub Releases, from the tag
response: accept
not_chosen:
  - A CHANGELOG.md
answered: 2026-11-10T21:11:03.147Z
answered_by: GusEllerm
topic: release/docs/release-notes
deck: release-v1
level: hard
reverse: cheap
touches:
  - publishes
  - user-facing
filed: 2026-11-10T21:07:29.001Z
filed_by: claude-code
branch: v1/next
---

# Where each release's changes are written

Where do people read what changed in each release: GitHub Releases made from the tag, or a CHANGELOG.md in the repo?

**Decided:** GitHub Releases, from the tag, the agent's pick. Then the deploy workflow makes a GitHub Release for each tag, with notes written in the release commit (format changes, what to run again, Codex's hooks to trust again); npm's page links to it.

**Not chosen:** A CHANGELOG.md. Then each release commit adds a section to CHANGELOG.md at the repo's root, which ships in the npm package too; nothing else is published.

**It turned on:** Should the notes on each release ship inside the package people install? (a preference) No: GitHub Releases, from the tag. Yes: A CHANGELOG.md.

**The fact given:** Nothing records changes release by release today; the vault's session logs and Decision Log hold the history. An upgrade can ask people to act: run `baesian init` again for new hook blocks, update the plugin, and in Codex trust its hooks again. Making a GitHub Release needs the workflow's `contents: write`; the deploy has `contents: read`.

**The agent's case:** A page per tag sits beside the code it describes and costs nothing in the package; the release commit is already where the version is set (B-3femd).

Answered by GusEllerm on 2026-11-10, through Baesian (card B-yj9wc, revision 1). Filed by claude-code on v1/next, in the deck “Publishing v1: npm, the plugin, what v1 promises, and the formats review”. Context: [[Release v1]].

The record is in `.baesian/cards/B-yj9wc/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Part of M10's plan, [[Release v1]], section "The docs".
