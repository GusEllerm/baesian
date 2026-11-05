---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Where a passkey's line for CI is shown: On the account page, beside each passkey, any time (B-yj5d5)."
created: 2026-11-05
updated: 2026-11-05
tags:
  - baesian
  - decision
aliases:
  - B-yj5d5
card: B-yj5d5
revision: 1
title: Where a passkey's line for CI is shown
question: Where should the website show a passkey's line for CI's `BAESIAN_TRUST`?
answer: On the account page, beside each passkey, any time
response: accept
not_chosen:
  - Once, when the passkey is made, as now
answered: 2026-11-05T13:18:55.636Z
answered_by: GusEllerm
topic: hosted/passkey-ci-line
deck: setup
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-05T13:13:42.143Z
filed_by: claude-code
branch: v1/next
---

# Where a passkey's line for CI is shown

Where should the website show a passkey's line for CI's `BAESIAN_TRUST`?

**Decided:** On the account page, beside each passkey, any time, the agent's pick. Sign-up shows only the recovery code. When you set up CI, or add a passkey, you copy its line from the account page; there's nothing to keep from the day you signed up.

**Not chosen:** Once, when the passkey is made, as now. You save the line at sign-up, before you have a repo or know what CI pins. Your copy is independent of the service: if it later showed a different key, yours would disagree.

**It turned on:** Is a copy saved when the passkey was made worth keeping, as a check on the service's later copies? (a preference) No: On the account page, beside each passkey, any time. Yes: Once, when the passkey is made, as now.

**The fact given:** The line holds the passkey's public key, the account's ID and handle, and when it was made; it can't be used to sign in. The same line reaches the repo's record from the relay, so CI's pin can be compared with it.

**The agent's case:** A public key needs no shown-once treatment, and asking a new person to save a line for a CI setting they haven't met yet is the hardest moment to ask it. The comparison it allows only catches a service that changed a key between sign-up and setup.

Answered by GusEllerm on 2026-11-05, through Baesian (card B-yj5d5, revision 1). Filed by claude-code on v1/next, in the deck “Setting up a repo with the hosted service”.

The record is in `.baesian/cards/B-yj5d5/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

On 2026-11-05 you compared the line saved at sign-up with the relay's copy before pinning it, and they matched. That comparison is what the alternative keeps.
