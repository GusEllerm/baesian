---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "How the service's signatures are encoded: OpenSSH signatures (B-grj9v)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-grj9v
card: B-grj9v
revision: 1
title: How the service's signatures are encoded
question: Should the service's signatures on answers be OpenSSH signature files, or a small JSON signature file of Baesian's own?
answer: OpenSSH signatures
response: accept
not_chosen:
  - A small JSON signature file
answered: 2026-11-03T04:09:05.984Z
answered_by: Gus Ellerm
topic: formats/signature-encoding
deck: formats-v1
level: blocking
reverse: moderate
touches:
  - schema
filed: 2026-11-03T03:53:02.976Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-sar41 What makes an answer count in a hosted repo|B-sar41]]"
---

# How the service's signatures are encoded

Should the service's signatures on answers be OpenSSH signature files, or a small JSON signature file of Baesian's own?

**Decided:** OpenSSH signatures, the agent's pick. Each signed file gets a .sig beside it in OpenSSH's format, with the namespace baesian, which ssh-keygen -Y verify can check by hand. Keys can be listed in git's allowed-signers form.

**Not chosen:** A small JSON signature file. Each signed file gets a .sig.json: the key's ID, the algorithm and a base64 Ed25519 signature, like the passkey proof's file. Only Baesian's code checks it, and it can carry more fields later.

**It turned on:** Will anyone check an answer's signature without Baesian's own code? If someone will: OpenSSH signatures. If only Baesian will: A small JSON signature file.

**The fact given:** Both sign the file's exact bytes with Ed25519. Hard-card answers also carry a passkey proof (D139), a WebAuthn assertion with fields of its own, in a separate file either way.

**The agent's case:** A standard format lets anyone audit a public record's answers with tools they already have, as git's SSH commit signing does. Baesian's own parser for it is small.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-grj9v, revision 1). Filed by claude-code on v1/next, in the deck “Formats for v1”. Context: [[Formats for v1]], [[File Formats]].

The record is in `.baesian/cards/B-grj9v/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

P15 left the encoding open (section 4 there). Signed files are kept forever, so after v1 verify reads whichever encoding is chosen for as long as the record exists. The signature files are in [[Formats for v1]], section 7.
