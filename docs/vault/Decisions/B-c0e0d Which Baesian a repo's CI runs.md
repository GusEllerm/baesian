---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Which Baesian a repo's CI runs: Pinned, moved by a commit (B-c0e0d)."
created: 2026-11-10
updated: 2026-11-10
tags:
  - baesian
  - decision
aliases:
  - B-c0e0d
card: B-c0e0d
revision: 1
title: Which Baesian a repo's CI runs
question: Do the CI steps `baesian ci` prints run the latest Baesian release each time, or the release that printed them, pinned in the repo?
answer: Pinned, moved by a commit
response: accept
not_chosen:
  - The latest release
answered: 2026-11-10T21:09:16.525Z
answered_by: GusEllerm
topic: release/ci/version
deck: release-v1
level: hard
reverse: cheap
touches:
  - infra
  - user-facing
  - security
filed: 2026-11-10T21:07:16.503Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-4p43b When a release changes a format|B-4p43b]]"
---

# Which Baesian a repo's CI runs

Do the CI steps `baesian ci` prints run the latest Baesian release each time, or the release that printed them, pinned in the repo?

**Decided:** Pinned, moved by a commit, the agent's pick. Then the steps run `npx --yes baesian@<version>`, the release that printed them; a repo moves its CI to a new release in a commit, by running `baesian ci` again.

**Not chosen:** The latest release. Then the steps run `npx --yes baesian@latest`, as today's unpinned `npx baesian` does, so every repo's CI takes each release the day it's out, its new checks and formats included, without a commit.

**It turned on:** Should a new Baesian release be able to change a repo's CI result without a commit in that repo? (a preference) No: Pinned, moved by a commit. Yes: The latest release.

**The fact given:** `baesian ci` prints steps that run `npx baesian verify`, unpinned, so each run fetches the latest release. `baesian verify` runs with the repo's pinned keys (BAESIAN_TRUST) and decides whether a commit's answers count. D157: CI must read every format the service and the agents write. This repo's own CI runs its own build (`node dist/bin.js`).

**First chose:** The latest release, then switched once the agent's pick was shown.

**The agent's case:** A pin makes CI's result depend on the commit alone, and keeps a bad or compromised release from reaching every repo's merge gate at once; with a release of format overlap, a pin one release behind still passes.

**Wrong if:** A pinned CI meets a file from the service in a newer format, and fails until the repo moves its pin. **To check:** CI runs in hosted repos after the first release that changes a format, under the answer to the format-rollout card.

Answered by GusEllerm on 2026-11-10, through Baesian (card B-c0e0d, revision 1). Filed by claude-code on v1/next, in the deck “Publishing v1: npm, the plugin, what v1 promises, and the formats review”. Context: [[Release v1]].

The record is in `.baesian/cards/B-c0e0d/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Part of M10's plan, [[Release v1]], sections "Publishing the CLI to npm" and the formats review's F6. It builds on the format-rollout card: if releases write a new format at once, a pinned CI fails on the service's first newer file.

## Reopened on 2026-11-10

It builds on [[B-4p43b When a release changes a format|B-4p43b]], which was decided otherwise: "New one at once".

Until the card is answered again, this decision isn't in force.
