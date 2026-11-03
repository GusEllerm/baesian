---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Whether an answer names the card it answers by digest: The answer names the card's digest (B-f571v)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-f571v
card: B-f571v
revision: 1
title: Whether an answer names the card it answers by digest
question: In a hosted repo, should a signed answer carry the digest of the card revision it answers, so verify can tell if the card changed after it was answered?
answer: The answer names the card's digest
response: accept
not_chosen:
  - The card's ID and revision, as now
answered: 2026-11-03T20:05:58.306Z
answered_by: Gus Ellerm
topic: hosted/answer-card-digest
deck: hosted
level: hard
reverse: cheap
touches:
  - security
  - schema
filed: 2026-11-03T17:48:37.931Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-sar41 What makes an answer count in a hosted repo|B-sar41]]"
  - "[[B-na7je Proof that a person answered a hard card|B-na7je]]"
---

# Whether an answer names the card it answers by digest

In a hosted repo, should a signed answer carry the digest of the card revision it answers, so verify can tell if the card changed after it was answered?

**Decided:** The answer names the card's digest, the agent's pick. Each verdict the service signs carries card_digest, the SHA-256 of the revision's file as the relay received it. verify counts it only when the record's card has those bytes, so a card rewritten after its answer is unanswered.

**Not chosen:** The card's ID and revision, as now. A verdict names its card and revision only (P16 section 7). A card file rewritten after it was answered keeps the answer; the relay's copy, until retention deletes it, is the only record of what you saw.

**It turned on:** Can a card's file change after you answer it without verify seeing? If it can: The answer names the card's digest. If it can't: The card's ID and revision, as now.

**The fact given:** Card files are written once by convention (D34), but an agent can edit the live layer, and the record before it's committed. verify reads each commit's record, and has nothing to compare a card file with but that record. A verdict's signature, and a hard card's passkey proof, cover the verdict's bytes, which name the card's ID and revision but not its text. The relay keeps the card's text until retention deletes it (D137, B-9jqt4).

**First chose:** The card's ID and revision, as now, then switched once the agent's pick was shown.

**The agent's case:** An answer that can be moved onto other words isn't proof of what you approved. With the digest in the verdict, the service's signature and the passkey's proof cover the question itself, and an answer copied from another repo's card with the same ID doesn't count.

**Wrong if:** Card files legitimately change after an answer, or the relay can't keep the exact bytes it received until it signs the answer. **To check:** Look for any code that rewrites a card revision file (D157 says old files are read, never rewritten), and at how M9b's relay stores uploads.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-f571v, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-f571v/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Found while building M9a. A signature covers a file's bytes, not its name or what it refers to. M9a already makes each signed file count only where its bytes say it belongs: a verdict copied under another card's name, or a relay's gate record copied into another card's folder, counts nowhere (`Store.judge`). What's left is the card the verdict points at: its ID and revision are in the signed bytes, its content isn't.

**What the proposal adds.** One field on `Verdict`, `card_digest`, set by the relay from the card file it received; `Store.judge` compares it with `Store.bytes` of `cards/<id>/r<n>.md`. Since the passkey's challenge is the verdict's digest (P16 section 7), a hard card's proof then covers the card's text too. The relay's gate record could carry the same field; its `draw_proof` already covers the card's digest.

**The weaker alternative considered.** verify could fail any commit that changes or deletes a write-once file already in the record. That catches a card rewritten after an earlier commit, but not one rewritten before the first commit that holds it.
