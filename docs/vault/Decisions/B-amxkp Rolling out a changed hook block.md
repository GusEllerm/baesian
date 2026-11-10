---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Rolling out a changed hook block: The old block for a release (B-amxkp)."
created: 2026-11-10
updated: 2026-11-10
tags:
  - baesian
  - decision
aliases:
  - B-amxkp
card: B-amxkp
revision: 1
title: Rolling out a changed hook block
question: When a release changes the hook block `baesian init` writes, does it write the new block at once, or keep writing the one before for a release?
answer: The old block for a release
response: accept
not_chosen:
  - The new block at once
answered: 2026-11-10T22:46:43.595Z
answered_by: GusEllerm
topic: release/init-hook-acks/changed-blocks
deck: release-v1
level: provisional
reverse: cheap
touches:
  - infra
filed: 2026-11-10T22:31:21.442Z
filed_by: claude-code
branch: worktree-agent-a1284583994d73299
depends_on:
  - "[[B-np6af Hook blocks written by other Baesian versions|B-np6af]]"
  - "[[B-c0e0d Which Baesian a repo's CI runs|B-c0e0d]]"
  - "[[B-4p43b When a release changes a format|B-4p43b]]"
---

# Rolling out a changed hook block

When a release changes the hook block `baesian init` writes, does it write the new block at once, or keep writing the one before for a release?

**Decided:** The old block for a release, the agent's pick. Then a release that changes a block lists the new one but `baesian init` keeps writing the one before; the next release writes the new one; CI pinned a release behind, and a teammate a release behind, know every block a commit adds, as formats roll out under B-4p43b.

**Not chosen:** The new block at once. Then the release that changes a block writes it straight away; a commit made with it needs an ack in CI pinned to an earlier release, and in a teammate's older gate, until CI's pin moves to the new release.

**It turned on:** Should running `baesian init` with a newer release ever fail CI pinned to the release before it? (a preference) No: The old block for a release. Yes, until the pin moves: The new block at once.

**The fact given:** A release lists the hook blocks of the releases before it (`RELEASED_BLOCKS`, B-np6af), never those after: a block only a newer release wrote counts as a change to the hook, which needs a card or an ack. CI runs the release its pin names, moved by a commit (B-c0e0d). Every release so far, v0.1.0 to v0.1.10, wrote the same six blocks, and no change is planned. B-4p43b answered the same question for file formats: the old one for a release.

**The agent's case:** One release of overlap, as formats have under B-4p43b: a teammate's `baesian init` on a newer release never fails CI pinned a release behind. The cost is a release's wait before a changed block reaches repos.

**Wrong if:** A block must change at once, for a fix that can't wait a release. **To check:** The release notes of the first release that changes a block, and CI runs in repos pinned a release behind it.

Answered by GusEllerm on 2026-11-10, through Baesian (card B-amxkp, revision 1). Filed by claude-code on worktree-agent-a1284583994d73299, in the deck “Publishing v1: npm, the plugin, what v1 promises, and the formats review”. Context: [[Release v1]].

The record is in `.baesian/cards/B-amxkp/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Found while building M10 step 5 ([[Release v1]], finding 4). B-np6af's list lets a block from any earlier release through, so a teammate a release *behind* is fine. The other direction isn't: with CI pinned (B-c0e0d), CI is usually the older side, so the first commit of a teammate who upgraded and ran `baesian init` after a block change would need an ack there. Nothing is built on either option: it decides what a future release that changes a block does. Recognising a block by its shape was set aside, since the gate's point (B-7sjec, B-g6ywj) is that only text Baesian wrote passes without an ack.
