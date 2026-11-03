---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "Where the commit gate's hooks live: Keep them committed, and gate changes to them (B-7sjec)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-7sjec
card: B-7sjec
revision: 1
title: Where the commit gate's hooks live
question: Should the commit gate's hooks stay committed with the repo, or be installed into each clone's own git folder?
answer: Keep them committed, and gate changes to them
response: accept
not_chosen:
  - Install them into each clone's .git/hooks
answered: 2026-11-03T01:50:52.082Z
answered_by: Gus Ellerm
topic: release/hook-location
deck: release
level: hard
reverse: moderate
touches:
  - security
  - infra
filed: 2026-11-03T01:31:28.190Z
filed_by: claude-code
branch: overnight/2026-11-03
---

# Where the commit gate's hooks live

Should the commit gate's hooks stay committed with the repo, or be installed into each clone's own git folder?

**Decided:** Keep them committed, and gate changes to them, the agent's pick. Then hooks stay in .githooks/ (D54); a change to a hook counts as an infra decision at the gate and in CI, so a pull request that changes one needs a card or an ack, and shows up in review.

**Not chosen:** Install them into each clone's .git/hooks. Then the hooks hold only `baesian hook <name>`, so a pull request can't change what runs; every clone runs `baesian init` to get them, and livedocs' hook would need the same.

**It turned on:** Will people commit on branches from contributors they don't fully trust? If rarely: Keep them committed, and gate changes to them. If often, as open-source maintainers do: Install them into each clone's .git/hooks.

**The fact given:** Hooks in .githooks/ run on every commit made with that branch checked out, so a pull request that edits one can run code on a reviewer's machine. livedocs' pre-commit hook lives there too. Nothing runs from a fresh clone until `baesian init` sets core.hooksPath.

**First chose:** Install them into each clone's .git/hooks, then switched once the agent's pick was shown.

**The agent's case:** Versioned hooks are what every hook manager does, and they keep each clone in step; making hook changes a gated decision puts them in front of a person, which is the risk.

**Wrong if:** the repos that use Baesian take pull requests from people the maintainers don't know. **To check:** whether the dogfooding repos (this one, then personal-website) accept outside contributions.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-7sjec, revision 1). Filed by claude-code on overnight/2026-11-03, in the deck “Before release: privacy and security”.

The record is in `.baesian/cards/B-7sjec/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

From the overnight privacy and security review: see Reviews/2026-11-03 Privacy and Security, finding 3. The fallback's `eval` in the hooks is safe: its command comes from the clone's own git config, quoted when written.
