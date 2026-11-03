---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "Where CI gets the key it checks answers with: Pinned in CI, outside the repo (B-vbqdy)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-vbqdy
card: B-vbqdy
revision: 1
title: Where CI gets the key it checks answers with
question: Where should baesian verify in CI get the public key it checks answers' signatures against?
answer: Pinned in CI, outside the repo
response: accept
not_chosen:
  - A file in the repo only
answered: 2026-11-03T01:48:04.915Z
answered_by: Gus Ellerm
topic: hosted/ci-trust-root
deck: hosted
level: hard
reverse: cheap
touches:
  - security
  - infra
filed: 2026-11-03T01:37:27.741Z
filed_by: claude-code
branch: overnight/2026-11-03
---

# Where CI gets the key it checks answers with

Where should baesian verify in CI get the public key it checks answers' signatures against?

**Decided:** Pinned in CI, outside the repo, the agent's pick. CI is given the service's key in its own protected settings, which a commit can't change. A copy in the repo serves checks on your machine, and the two must agree. One setting per repo, made once by hand.

**Not chosen:** A file in the repo only. The service's keys are listed in a file in .baesian/, and the commit gate treats any change to it as needing a hard card. One place, nothing to set in CI, and it works anywhere offline.

**It turned on:** Is a check whose key lives in the repo enough when agents make most of the commits? Not enough: Pinned in CI, outside the repo. Enough: A file in the repo only.

**The fact given:** Git keeps an allowed-signers file in the repo only where every commit is signed, so only trusted committers can change it. In Baesian repos, agents commit, and the commit gate runs on their machine. CI reads each commit's own files, so one commit could add a key and an answer signed by it, unless verify checks each change to the file against the keys before it.

**The agent's case:** A trust root a commit can't change closes the add-a-key-and-sign loop without new logic in verify.

**Wrong if:** Setting a key in each repo's CI proves a barrier for users, or checking key changes against the previous keys proves sound in testing. **To check:** Try forging an answer in a test repo under each option.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-vbqdy, revision 1). Filed by claude-code on overnight/2026-11-03, in the deck “The hosted service”.

The record is in `.baesian/cards/B-vbqdy/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

A signature check is only as strong as the place its trusted key comes from. If answers must be signed (H3), `baesian verify` needs the service's public key, and the question is whether an agent's commit could change it. See [[Hosted Service]], section 4, and [[Hosted Service - Strand B5 Prior Art and Security]], F15.
