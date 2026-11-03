---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Proof that a person answered a hard card: A passkey signature on hard cards (B-na7je)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-na7je
card: B-na7je
revision: 1
title: Proof that a person answered a hard card
question: Should an answer to a hard card also carry a signature from the reviewer's own passkey?
answer: A passkey signature on hard cards
response: accept
not_chosen:
  - The service's signature only
answered: 2026-11-03T01:46:40.258Z
answered_by: Gus Ellerm
topic: hosted/hard-card-proof
deck: hosted
level: hard
reverse: moderate
touches:
  - security
  - schema
  - user-facing
filed: 2026-11-03T01:37:27.210Z
filed_by: claude-code
branch: overnight/2026-11-03
---

# Proof that a person answered a hard card

Should an answer to a hard card also carry a signature from the reviewer's own passkey?

**Decided:** A passkey signature on hard cards, the agent's pick. Answering a hard card asks for your face, fingerprint or PIN, and the passkey signs that answer. baesian verify checks it offline against your public key in the repo; the proof doesn't rest on the service.

**Not chosen:** The service's signature only. Hard cards are answered like the others, signed by the service: one signature format and no keys of yours in the repo. Whoever controls the service could mint an answer to a hard card.

**It turned on:** Should proof that a person approved a hard card hold even if the service itself is misused or compromised? It should: A passkey signature on hard cards. The service's word is enough: The service's signature only.

**The fact given:** Hard cards are spending money, security, deleting data and publishing (D42). You run the service for others (D129), so its operator, or anyone who takes it over, could sign any answer. A passkey signature covers the answer's exact bytes and records that the device verified you. It rests on WebAuthn details that are easy to get wrong, and a synced passkey's key is held by Apple or Google.

**First chose:** The service's signature only, then switched once the agent's pick was shown.

**The agent's case:** For the cards that matter most, proof that doesn't depend on trusting the operator, and the check also stops an agent answering through a signed-in browser.

**Wrong if:** The extra check makes hard cards slow enough that you put them off, or passkey signing fails on the devices you use. **To check:** Time to answer hard cards in dogfooding, before and after; a test on your phone and laptop.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-na7je, revision 1). Filed by claude-code on overnight/2026-11-03, in the deck “The hosted service”.

The record is in `.baesian/cards/B-na7je/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

A WebAuthn assertion is a signature by your passkey over data that includes the server's challenge. If the challenge is a hash of the answer, the passkey signs the answer itself, and anyone with your public key can check it later. W3C's Secure Payment Confirmation uses the same idea for payments. See [[Hosted Service]], section 4, and [[Hosted Service - Strand B5 Prior Art and Security]], F13.
