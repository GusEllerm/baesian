---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "The form of CI's pinned keys: The trust files' JSON, a line each (B-0gr7g)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-0gr7g
card: B-0gr7g
revision: 1
title: The form of CI's pinned keys
question: Should the keys CI pins be the trust files' JSON, a line each, or an allowed-signers file with the passkeys in a setting beside it?
answer: The trust files' JSON, a line each
response: accept
not_chosen:
  - An allowed-signers file, passkeys beside it
answered: 2026-11-03T20:05:11.937Z
answered_by: Gus Ellerm
topic: hosted/ci-pin-format
deck: hosted
level: hard
reverse: cheap
touches:
  - security
  - public-api
  - infra
filed: 2026-11-03T17:48:36.868Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-vbqdy Where CI gets the key it checks answers with|B-vbqdy]]"
  - "[[B-7hjag Where verify finds the reviewer's passkey keys|B-7hjag]]"
  - "[[B-grj9v How the service's signatures are encoded|B-grj9v]]"
---

# The form of CI's pinned keys

Should the keys CI pins be the trust files' JSON, a line each, or an allowed-signers file with the passkeys in a setting beside it?

**Decided:** The trust files' JSON, a line each, the agent's pick. BAESIAN_TRUST holds each trust file's JSON on a line (service keys, revocations, passkeys), or BAESIAN_TRUST_FILE names a file of them, copied from .baesian/trust/. CI compares the record's copy with them field by field.

**Not chosen:** An allowed-signers file, passkeys beside it. One setting holds git's allowed-signers lines for the service's keys, which ssh-keygen -Y verify and git read as they are; a second holds the passkey keys and the website's origin, which those lines can't carry.

**It turned on:** Will anyone use CI's pinned keys with tools other than Baesian? If not: The trust files' JSON, a line each. If so: An allowed-signers file, passkeys beside it.

**The fact given:** D160 makes each signature checkable by hand with ssh-keygen -Y verify, which reads an allowed-signers file. A service key file's public_key is already in that file's form, so one line, written by hand, makes one. Allowed-signers lines can't carry the website's origin and relying party, which passkey proofs are checked against (P16 section 7), nor the passkey keys, which aren't SSH keys. Either way the pin is set by hand in CI's protected settings (D142), and a key added later (D159) is one more line.

**The agent's case:** One format for the record's copy and the pin, so checking that they agree is a plain comparison, and one setting holds everything CI trusts.

**Wrong if:** People pinning keys by hand find JSON lines error-prone, or someone auditing a public record wants to hand CI's pin to ssh-keygen as it is. **To check:** While dogfooding, count CI runs failed by a malformed pin, and ask whoever audits a record which tools they used.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-0gr7g, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-0gr7g/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

D142 and D159 put the trust root in CI's protected settings, outside the repo, with a copy in the record, and say the two must agree. They don't say what the setting holds. P16 section 7 lists the record's copy as JSON files under `trust/`.

**As built (the proposal).** `BAESIAN_TRUST` is the JSON of each trust file, one per line; blank lines and `#` comments are skipped. `BAESIAN_TRUST_FILE` names a file of the same lines, for a protected file on a self-hosted runner. A pin that's set but empty or unreadable stops the run, so a misnamed variable can't turn the checks off. A service key or passkey key in the record that the pin doesn't hold, field for field, fails the commit.

**The alternative in practice.** Two settings, one in git's format and one of Baesian's own, and verify would read the origin and relying party from the second. A person checking by hand could pass the first to `ssh-keygen -Y verify -f` directly. Under the proposal they write the allowed-signers line themselves, as [[src-verify#Checking an answer by hand]] shows: `baesian namespaces="baesian" <public_key>`.

Before v1 either is cheap to change (D108); after it, the pin is part of every hosted repo's CI.
