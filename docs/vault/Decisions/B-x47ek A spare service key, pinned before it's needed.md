---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "A spare service key, pinned before it's needed: Pin a spare key now (B-x47ek)."
created: 2026-11-10
updated: 2026-11-10
tags:
  - baesian
  - decision
aliases:
  - B-x47ek
card: B-x47ek
revision: 1
title: A spare service key, pinned before it's needed
question: Should hosted repos' CI pin a second, unused service signing key now, so replacing the service's key doesn't break their CI?
answer: Pin a spare key now
response: accept
not_chosen:
  - One key, pinned again if replaced
answered: 2026-11-10T21:10:15.442Z
answered_by: GusEllerm
topic: release/trust/spare-key
deck: release-v1
level: hard
reverse: cheap
touches:
  - security
  - user-facing
filed: 2026-11-10T21:07:24.280Z
filed_by: claude-code
branch: v1/next
---

# A spare service key, pinned before it's needed

Should hosted repos' CI pin a second, unused service signing key now, so replacing the service's key doesn't break their CI?

**Decided:** Pin a spare key now, the agent's pick. Then you make a second Ed25519 key and keep its private half offline; `baesian ci` prints its line beside the current key's; if the service's key must be replaced, it switches to the spare and hosted repos' CI keeps passing.

**Not chosen:** One key, pinned again if replaced. Then only the key in use is pinned, as now; replacing it fails every hosted repo's CI on answers the new key signs, until each owner runs `baesian ci` again and updates BAESIAN_TRUST.

**It turned on:** If the service's signing key had to be replaced, should hosted repos' CI keep passing without their owners acting? (a preference) Yes: Pin a spare key now. No: owners should act: One key, pinned again if replaced.

**The fact given:** D142: CI trusts only the service keys pinned in its settings (BAESIAN_TRUST), outside the repo; a key in the record that isn't pinned fails the run, and a pinned key the record doesn't hold yet doesn't (`pinProblems()`). The service signs with one Ed25519 key, a Worker secret. A key file can carry valid_after and valid_before, and a revocation file ends trust in a key from its time. A spare is only as safe as where its private half is kept.

**The agent's case:** Today a replaced key breaks CI in every hosted repo at once, and v1 brings more of them; one spare kept offline turns the likeliest emergency into a quiet switch.

**Wrong if:** The spare's private half leaks while unused, so it must be revoked and every pin changed anyway. **To check:** Where the spare is kept; a rehearsal that signs with it in a test project and runs `baesian verify`.

Answered by GusEllerm on 2026-11-10, through Baesian (card B-x47ek, revision 1). Filed by claude-code on v1/next, in the deck “Publishing v1: npm, the plugin, what v1 promises, and the formats review”. Context: [[Release v1]].

The record is in `.baesian/cards/B-x47ek/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Part of M10's plan, [[Release v1]], finding F5 of the formats review. Building it means the service publishes the spare's public key (never using it), and `baesian ci` prints both lines.
