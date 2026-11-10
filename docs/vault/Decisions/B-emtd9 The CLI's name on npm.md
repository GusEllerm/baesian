---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "The CLI's name on npm: baesian (B-emtd9)."
created: 2026-11-10
updated: 2026-11-10
tags:
  - baesian
  - decision
aliases:
  - B-emtd9
card: B-emtd9
revision: 1
title: The CLI's name on npm
question: Under what name is Baesian's command line published on npm?
answer: baesian
response: accept
not_chosen:
  - "@baesian/cli, under an npm org"
answered: 2026-11-10T21:08:25.991Z
answered_by: GusEllerm
topic: release/npm/name
deck: release-v1
level: hard
reverse: one-way
touches:
  - publishes
  - public-api
filed: 2026-11-10T21:07:03.632Z
filed_by: claude-code
branch: v1/next
---

# The CLI's name on npm

Under what name is Baesian's command line published on npm?

**Decided:** baesian, the agent's pick. Then people run `npm install -g baesian`; the command stays `baesian`; the hint in the hook block `baesian init` commits (`npm i -g baesian`) and `baesian ci`'s `npx baesian` are right as they are.

**Not chosen:** @baesian/cli, under an npm org. Then you make the npm organisation baesian; people run `npm install -g @baesian/cli`; the command stays `baesian`; later packages can share the scope; the hook hint and `baesian ci`'s steps change to the scoped name.

**It turned on:** Will Baesian publish more than one package on npm? Not that I can see: baesian. Probably: @baesian/cli, under an npm org.

**The fact given:** On 2026-11-10 `npm view baesian` and `npm view @baesian/cli` both returned 404: neither is taken. `bayesian` is taken (0.0.1). A package can't be renamed once published, and a version number once used is never reused, even after unpublishing. The command's name comes from `bin` whatever the package is called. Whether the npm organisation name baesian is free wasn't checked: that needs a login.

**First chose:** @baesian/cli, under an npm org, then switched once the agent's pick was shown.

**The agent's case:** v1 publishes one package, the command line with the client it serves; the service deploys to Cloudflare and the plugin installs from the repo. An unscoped name is shorter in every doc, hook message and CI step, and matches the command.

**Wrong if:** A second npm package becomes likely within a year, or someone takes the @baesian scope and confuses people. **To check:** The plan's list of what's published ([[Release v1]]); npm's page for the organisation baesian.

Answered by GusEllerm on 2026-11-10, through Baesian (card B-emtd9, revision 1). Filed by claude-code on v1/next, in the deck “Publishing v1: npm, the plugin, what v1 promises, and the formats review”. Context: [[Release v1]].

The record is in `.baesian/cards/B-emtd9/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Part of M10's plan, [[Release v1]], section "Publishing the CLI to npm". The package's other settings (`private`, `files`, `bin`, `engines`, `repository`) follow from the plan and need no card; this is only the name.
