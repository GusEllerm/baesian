---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "Whether the service can read card text: Readable, deleted after delivery (B-kypkm)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-kypkm
card: B-kypkm
revision: 1
title: Whether the service can read card text
question: Should the hosted service be able to read the text of the cards it relays?
answer: Readable, deleted after delivery
response: accept
not_chosen:
  - End-to-end encrypted
answered: 2026-11-03T01:43:50.466Z
answered_by: Gus Ellerm
topic: hosted/card-text
deck: hosted
level: hard
reverse: moderate
touches:
  - security
  - schema
  - user-facing
filed: 2026-11-03T01:37:26.823Z
filed_by: claude-code
branch: overnight/2026-11-03
---

# Whether the service can read card text

Should the hosted service be able to read the text of the cards it relays?

**Decided:** Readable, deleted after delivery, the agent's pick. TLS and encryption at rest, a secret scan before upload, and card text deleted after it's answered. The gate can run on the service, and notifications and support can show text. An encryption field is reserved.

**Not chosen:** End-to-end encrypted. Only your devices hold the key, wrapped by your passkeys; the service sees sizes, timing and IDs. The gate runs on the agent's machine, notifications carry no text, and losing every passkey loses relayed cards.

**It turned on:** Will any feature need to read cards on the server, the classification gate included? Yes, or probably: Readable, deleted after delivery. No: End-to-end encrypted.

**The fact given:** The repo's record keeps every decision either way (D127); the relay holds only what's waiting. A gate run on the service is out of the agent's reach; run on the agent's machine, it's beside the agent. Encryption keys in a browser come from passkeys (WebAuthn PRF), which work with iCloud Keychain in Safari 18+ and Chrome on Android, but not Windows Hello. This is the same question as decision 4 in the sliders synthesis.

**First chose:** End-to-end encrypted, then switched once the agent's pick was shown.

**The agent's case:** The gate's safest home is where cards are relayed (the sliders note, B4 I4), and deleting text after delivery shrinks what a breach exposes to what's waiting. Reserving the field keeps encryption open without a migration.

**Wrong if:** The gate is settled to run on the agent's machine and nothing else needs to read cards on the server, or early users say they won't put private-repo cards on a readable server. **To check:** The sliders decisions 2 to 4, and the first outside users' answer before publishing.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-kypkm, revision 1). Filed by claude-code on overnight/2026-11-03, in the deck “The hosted service”.

The record is in `.baesian/cards/B-kypkm/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The relay passes cards up from the agent's machine and answers down to it (D127). Whether it can read what it passes decides where the classification gate can run (D131), what a notification can say, and how much a breach of the service would expose. Strand B5 found end-to-end encryption workable but costly: key recovery, uneven passkey support, and no server-side features. See [[Hosted Service]], section 1, and [[Hosted Service - Strand B5 Prior Art and Security]], F4 and R1.
