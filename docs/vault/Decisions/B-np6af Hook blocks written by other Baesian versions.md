---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Hook blocks written by other Baesian versions: Any released version's block (B-np6af)."
created: 2026-11-10
updated: 2026-11-10
tags:
  - baesian
  - decision
aliases:
  - B-np6af
card: B-np6af
revision: 1
title: Hook blocks written by other Baesian versions
question: Does the gate count a hook block that another released Baesian wrote as Baesian's own, or only the block this version writes?
answer: Any released version's block
response: accept
not_chosen:
  - Only this version's, as now
answered: 2026-11-10T21:09:47.058Z
answered_by: GusEllerm
topic: release/init-hook-acks/other-versions
deck: release-v1
level: hard
reverse: cheap
touches:
  - security
  - infra
filed: 2026-11-10T21:07:18.512Z
filed_by: claude-code
branch: v1/next
---

# Hook blocks written by other Baesian versions

Does the gate count a hook block that another released Baesian wrote as Baesian's own, or only the block this version writes?

**Decided:** Any released version's block, the agent's pick. Then each release carries the digest of every hook block a released Baesian wrote; a commit that only adds or swaps one of them needs no ack, in the commit gate and in `baesian verify`.

**Not chosen:** Only this version's, as now. Then a block from another release counts as any change to a hook: the commit needs a card or an ack, and CI on another release fails a commit made by a teammate's `baesian init` until it's acked.

**It turned on:** Will people commit to a repo on a different Baesian release from each other, or from its CI? Yes, routinely: Any released version's block. Rarely: Only this version's, as now.

**The fact given:** B-g6ywj: Baesian's own hook block passes the gate with no ack, judged by `onlyBaesianBlock()` as exactly the block this version's `baesian init` writes. Its text changed three times from 2026-11-03 to 2026-11-05. B-7sjec (hard): the hooks stay committed, and changes to them are gated. Every block runs `baesian hook <name>`.

**The agent's case:** Once people install from npm, teammates, CI and whoever runs `init` will often be a release apart, and an ack on text Baesian wrote records nothing anyone decided, which is why B-g6ywj let it through.

**Wrong if:** A block an old release wrote turns out to be flawed, and the list lets it back in without a card. **To check:** The list of released blocks in the code, and whether a release ever withdrew one.

Answered by GusEllerm on 2026-11-10, through Baesian (card B-np6af, revision 1). Filed by claude-code on v1/next, in the deck “Publishing v1: npm, the plugin, what v1 promises, and the formats review”. Context: [[Release v1]].

The record is in `.baesian/cards/B-np6af/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Part of M10's plan, [[Release v1]], finding F4 of the formats review. A narrower question on B-g6ywj's subject: B-g6ywj decided that Baesian's own block passes; this asks what "own" means across releases.
