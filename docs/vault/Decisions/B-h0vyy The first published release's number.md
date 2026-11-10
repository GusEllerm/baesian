---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "The first published release's number: 1.0.0 (B-h0vyy)."
created: 2026-11-10
updated: 2026-11-10
tags:
  - baesian
  - decision
aliases:
  - B-h0vyy
card: B-h0vyy
revision: 1
title: The first published release's number
question: Is the first release on npm 1.0.0, ending D108's freedom to change formats in place, or a 0.x that keeps it until a later 1.0?
answer: 1.0.0
response: accept
not_chosen:
  - 0.2.0, and 1.0 later
answered: 2026-11-10T21:08:46.813Z
answered_by: GusEllerm
topic: release/v1/number
deck: release-v1
level: hard
reverse: one-way
touches:
  - publishes
  - public-api
  - schema
filed: 2026-11-10T21:07:10.455Z
filed_by: claude-code
branch: v1/next
---

# The first published release's number

Is the first release on npm 1.0.0, ending D108's freedom to change formats in place, or a 0.x that keeps it until a later 1.0?

**Decided:** 1.0.0, the agent's pick. Then the first npm release is 1.0.0, tagged v1.0.0; from then on a format change needs a new format number and an upgrade (D108, D156); the README's pre-release note goes.

**Not chosen:** 0.2.0, and 1.0 later. Then the first npm release is 0.2.0; formats may still change in place until a later 1.0.0, so people who install it are told a later release may not read what this one wrote; the README keeps its pre-release note.

**It turned on:** Are you ready to keep every file Baesian writes readable by later releases, from the first one people install? (a preference) Yes: 1.0.0. Not yet: 0.2.0, and 1.0 later.

**The fact given:** D108: no compatibility between versions until a v1 is published; then each format change needs a version and a migration. Since D124 (2026-11-02) about thirty formats were added or changed in place: preference files, gate records, signatures, passkey proofs, the relay's entry, merges, the card's model, among others. Tags v0.1.0 to v0.1.10 deployed the service; nothing is on npm. Under semver a 0.x minor version may break things.

**The agent's case:** Every file now carries a format number and a way to read older ones (D156, D157); the formats review found nothing that must change in place before freezing; and the service already holds people's projects, whose records a 1.0 promises to keep reading.

**Wrong if:** A format needs changing in place within weeks of the release. **To check:** The formats review in [[Release v1]], and the cards filed on formats after the release.

Answered by GusEllerm on 2026-11-10, through Baesian (card B-h0vyy, revision 1). Filed by claude-code on v1/next, in the deck “Publishing v1: npm, the plugin, what v1 promises, and the formats review”. Context: [[Release v1]].

The record is in `.baesian/cards/B-h0vyy/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Part of M10's plan, [[Release v1]], section "What v1 means". The user's own note to agents, "don't design for Baesian version skew until a v1 is published (D108)", stops applying the day v1 is published, whichever number it has if it's the one that ends D108.
