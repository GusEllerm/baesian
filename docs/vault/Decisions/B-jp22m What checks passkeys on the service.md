---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "What checks passkeys on the service: SimpleWebAuthn on the service (B-jp22m)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-jp22m
card: B-jp22m
revision: 1
title: What checks passkeys on the service
question: Should the service run its passkey checks with the SimpleWebAuthn library, or with Baesian's own code on Web Crypto, shared with baesian verify?
answer: SimpleWebAuthn on the service
response: accept
not_chosen:
  - Baesian's own code, shared with verify
answered: 2026-11-03T16:50:33.692Z
answered_by: Gus Ellerm
topic: hosted/passkey-library
deck: hosted
level: hard
reverse: moderate
touches:
  - dependency
  - security
filed: 2026-11-03T15:26:48.485Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-na7je Proof that a person answered a hard card|B-na7je]]"
  - "[[B-9tk9m How people sign up and sign in|B-9tk9m]]"
  - "[[B-7hjag Where verify finds the reviewer's passkey keys|B-7hjag]]"
  - "[[B-rca1z Where the hosted service runs|B-rca1z]]"
---

# What checks passkeys on the service

Should the service run its passkey checks with the SimpleWebAuthn library, or with Baesian's own code on Web Crypto, shared with baesian verify?

**Decided:** SimpleWebAuthn on the service, the agent's pick. Then @simplewebauthn/server handles passkey sign-up, sign-in and each hard-card proof on the service; baesian verify keeps its own small check of saved proofs, tested against proofs the library accepted. One dependency, with ten of its own.

**Not chosen:** Baesian's own code, shared with verify. Baesian writes one WebAuthn module on Web Crypto, parsing CBOR and COSE keys and checking client and authenticator data, used by the service and by baesian verify. No new dependency and one implementation, all Baesian's to get right.

**It turned on:** Which do you trust more with passkey checks: a widely used library and its dependencies, or a small module Baesian owns, which verify needs anyway? (a preference) The library: SimpleWebAuthn on the service. Baesian's own module: Baesian's own code, shared with verify.

**The fact given:** baesian verify must check hard-card proofs offline in the CLI with no new dependency (P16 section 7, D139, D159), so Baesian writes an assertion check either way. Signing up a passkey also needs CBOR and COSE key parsing. @simplewebauthn/server 14.0.3 (MIT) has 10 direct dependencies and about 9.3 million downloads a week; its README lists Cloudflare Workers among 'other compatible runtimes', and nobody has tried it there for Baesian. A bug in verify could accept a forged hard-card answer; two implementations that disagree would refuse real ones.

**The agent's case:** Parsing a new passkey is the hard part, and a library used this widely has met more authenticators than Baesian's tests will. verify's offline check is small enough to own, and testing it against the library's results catches the two disagreeing.

**Wrong if:** SimpleWebAuthn doesn't run on Workers without workarounds, or its dependencies lean on Node APIs that Workers only stubs. **To check:** Before building on it, a prototype that signs up and signs with a phone passkey and a laptop passkey through SimpleWebAuthn, in wrangler dev and on a deployed Worker.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-jp22m, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-jp22m/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Every account has a passkey (D153), and hard-card answers carry the reviewer's passkey signature, checked offline by `baesian verify` (D139). So the service runs WebAuthn's two ceremonies: registration, when a passkey is added, and authentication, at sign-in and on each hard-card answer, with the challenge set to the verdict's SHA-256 digest (P16 section 7). [[Sign-in for the Hosted Service]] F14 named SimpleWebAuthn and said it "needs a test on Workers"; a runtime dependency is a card under AGENTS.md.

**What the work is.**
- *Registration:* decode the attestation object (CBOR), read the authenticator data, and turn the COSE public key into the SPKI form P16's passkey key files store. With attestation set to "none", no certificate chains are checked (the agent's reading of WebAuthn, *unverified* against the spec here).
- *Authentication:* check the client data's type, challenge and origin, the relying party's hash and the user-verified flag in the authenticator data, and the signature over the authenticator data and the client data's hash (B5 F13). This is what verify does too, in Node.
- *The algorithms:* Workers' Web Crypto has ECDSA, RSASSA PKCS1 v1.5 and Ed25519 (Sign-in research, F14).

**What was checked** (2026-11-03): npm lists `@simplewebauthn/server` 14.0.3, MIT, last published 2026-09-25, with ten direct dependencies (`@peculiar/asn1-*` packages, `@peculiar/x509`, `@levischuck/tiny-cbor`, `@hexagon/base64`, `reflect-metadata`), and 9,340,105 downloads in the week to 2026-11-02 (npm's API). Its docs list "Node LTS 22.x and higher" and "Deno v2.4.x and higher"; the README adds "other compatible runtimes (Cloudflare Workers, Bun, etc...)". A search found no Workers-specific bug reports, which proves little. `@passwordless-id/webauthn` 2.4.1 (MIT) has about 83,000 downloads a week; its runtime support wasn't checked.

**Under either option,** verify's own check is written and tested. The difference is whether the service shares it, or uses the library and verify is tested against the library's output.

Sources: SimpleWebAuthn server docs <https://simplewebauthn.dev/docs/packages/server> (through Context7) and README <https://github.com/MasterKale/SimpleWebAuthn>; npm registry entries and download counts, read 2026-11-03; [[Sign-in for the Hosted Service]], F14; [[Formats for v1]], section 7.
