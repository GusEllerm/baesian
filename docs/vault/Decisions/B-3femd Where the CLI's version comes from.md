---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Where the CLI's version comes from: Bumped in package.json (B-3femd)."
created: 2026-11-06
updated: 2026-11-06
tags:
  - baesian
  - decision
aliases:
  - B-3femd
card: B-3femd
revision: 1
title: Where the CLI's version comes from
question: Should `baesian --version` report the release tag, and where should that number come from?
answer: Bumped in package.json
response: accept
not_chosen:
  - Read from git at build
answered: 2026-11-06T20:22:11.721Z
answered_by: GusEllerm
topic: release/cli-version
deck: branch-v1-next
level: provisional
reverse: cheap
touches:
  - user-facing
  - infra
filed: 2026-11-06T20:17:34.336Z
filed_by: claude-code
branch: v1/next
---

# Where the CLI's version comes from

Should `baesian --version` report the release tag, and where should that number come from?

**Decided:** Bumped in package.json, the agent's pick. Then each release commit sets package.json's version to the tag's (0.1.9 for v0.1.9), and the deploy checks they match; `baesian --version` and the service report it.

**Not chosen:** Read from git at build. Then the build stamps the version from `git describe --tags` (v0.1.8-3-g1673e3e between releases); package.json stays 0.0.0 until the CLI is published to npm.

**It turned on:** Should a build between releases say exactly which commit it is? (a preference) No: the release it's for: Bumped in package.json. Yes: tag and commit: Read from git at build.

**The fact given:** Today package.json says 0.0.0, so `baesian --version` prints 0.0.0, while the tags (v0.1.0 to v0.1.8) deploy the service. The CLI isn't on npm yet; publishing it is part of v1's release (M10), and npm needs package.json's version then either way.

Answered by GusEllerm on 2026-11-06, through Baesian (card B-3femd, revision 1). Filed by claude-code on v1/next, in the deck “Decisions on v1/next”.

The record is in `.baesian/cards/B-3femd/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.
