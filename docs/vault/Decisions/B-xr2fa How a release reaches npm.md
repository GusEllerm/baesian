---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How a release reaches npm: CI publishes on the tag (B-xr2fa)."
created: 2026-11-10
updated: 2026-11-10
tags:
  - baesian
  - decision
aliases:
  - B-xr2fa
card: B-xr2fa
revision: 1
title: How a release reaches npm
question: When you tag a release on main, does CI publish the command line to npm by itself, or stage it there for you to approve?
answer: CI publishes on the tag
response: accept
not_chosen:
  - CI stages it, you approve
answered: 2026-11-10T21:08:38.099Z
answered_by: GusEllerm
topic: release/npm/publishing
deck: release-v1
level: hard
reverse: moderate
touches:
  - publishes
  - infra
  - security
filed: 2026-11-10T21:07:08.588Z
filed_by: claude-code
branch: v1/next
---

# How a release reaches npm

When you tag a release on main, does CI publish the command line to npm by itself, or stage it there for you to approve?

**Decided:** CI publishes on the tag, the agent's pick. Then the deploy workflow, once the service is deployed, publishes the package to npm by trusted publishing, with no token stored and with provenance; the tag on main stays the only step, as for the service.

**Not chosen:** CI stages it, you approve. Then the same workflow runs `npm stage publish`, with provenance; nothing is public until you approve the staged version on npmjs.com or with `npm stage approve`, with your 2FA; the service still goes live on the tag alone.

**It turned on:** Should a tag pushed to main be enough, alone, to put a new version before everyone who installs Baesian? (a preference) Yes: CI publishes on the tag. No: a second step, with my 2FA: CI stages it, you approve.

**The fact given:** Trusted publishing lets one named workflow file in GusEllerm/baesian publish with short-lived credentials, and npm adds provenance by itself (the repo must be public, as it is). It needs npm 11.5.1 or later (staging, 11.15.0) on the runner, and package.json's `repository` matching the repo exactly; package.json has none today. The service already goes live from a tag on main (B-bk20v). A published version can be deprecated, but its number is never reused.

**The agent's case:** It ships the CLI as the service already ships (B-bk20v): one tag, the service first and then the CLI that talks to it. With tokens disallowed on the package, a tag on main is already the guarded step.

**Wrong if:** Someone who can push a tag to main, or edit the deploy workflow, could publish a version nobody reviewed. **To check:** Who can push tags and change .github/workflows/ on GusEllerm/baesian (rulesets); the package's access settings on npmjs.com (tokens disallowed).

Answered by GusEllerm on 2026-11-10, through Baesian (card B-xr2fa, revision 1). Filed by claude-code on v1/next, in the deck “Publishing v1: npm, the plugin, what v1 promises, and the formats review”. Context: [[Release v1]].

The record is in `.baesian/cards/B-xr2fa/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Part of M10's plan, [[Release v1]], section "Publishing the CLI to npm". npm's docs (docs.npmjs.com/trusted-publishers, docs.npmjs.com/staged-publishing, checked through Context7 on 2026-11-10) say a trusted publisher can be limited to staging only, and recommend disallowing tokens on the package either way. setup-node's docs recommend Node 24 for the publishing job and its npm cache off (`package-manager-cache: false`), since a poisoned cache could reach the job's credentials. Whether a trusted publisher can be set up before the package's first version exists wasn't confirmed: if it can't, the first version is published or staged by hand, and CI takes over from the second.
