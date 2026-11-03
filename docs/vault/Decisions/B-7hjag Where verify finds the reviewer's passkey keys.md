---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "Where verify finds the reviewer's passkey keys: Pinned in CI, beside the service key (B-7hjag)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-7hjag
card: B-7hjag
revision: 1
title: Where verify finds the reviewer's passkey keys
question: Should baesian verify trust the reviewer's passkey keys from CI's protected settings, or from the record, with each new key vouched for by a trusted one?
answer: Pinned in CI, beside the service key
response: accept
not_chosen:
  - In the record, each new key vouched for
answered: 2026-11-03T04:00:20.463Z
answered_by: Gus Ellerm
topic: formats/passkey-keys
deck: formats-v1
level: hard
reverse: moderate
touches:
  - schema
  - security
filed: 2026-11-03T03:53:02.753Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-na7je Proof that a person answered a hard card|B-na7je]]"
  - "[[B-vbqdy Where CI gets the key it checks answers with|B-vbqdy]]"
---

# Where verify finds the reviewer's passkey keys

Should baesian verify trust the reviewer's passkey keys from CI's protected settings, or from the record, with each new key vouched for by a trusted one?

**Decided:** Pinned in CI, beside the service key, the agent's pick. Each passkey key you answer hard cards with is listed in CI's protected settings, as the service's key is (D142), with a copy in the record. Adding a new passkey means adding it there by hand.

**Not chosen:** In the record, each new key vouched for. Your first key is trusted once it's committed. Each later key needs a proof from a key already trusted, so the service can't add one alone. Losing every passkey means resetting the keys by hand.

**It turned on:** Will you add new passkeys often enough that editing CI's settings each time is a burden? If rarely: Pinned in CI, beside the service key. If often: In the record, each new key vouched for.

**The fact given:** A synced passkey (iCloud Keychain, Google Password Manager) is one key across your devices; a security key or another platform's passkey is a new one. A commit can't change CI's protected settings, but it can add files to the record.

**The agent's case:** It's the strongest anchor, the one D142 chose for the service's key, so a hard-card proof holds even against the service's operator (D139). With synced passkeys, most people would add a key rarely.

**Wrong if:** You add or replace passkeys more than a few times a year, or a second reviewer joins and needs CI access to enrol. **To check:** Count passkey enrolments per account on the service over the first months of dogfooding.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-7hjag, revision 1). Filed by claude-code on v1/next, in the deck “Formats for v1”. Context: [[Formats for v1]], [[File Formats]].

The record is in `.baesian/cards/B-7hjag/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

D139 has the passkey sign hard-card answers, checked offline against your public key in the repo, so that the proof doesn't rest on the service. Both options keep a copy of the key in the record. They differ in what verify trusts when a key appears there. The key and proof files are in [[Formats for v1]], section 7.
