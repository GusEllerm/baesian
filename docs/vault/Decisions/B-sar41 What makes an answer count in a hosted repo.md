---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "What makes an answer count in a hosted repo: Only signed answers count (B-sar41)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-sar41
card: B-sar41
revision: 1
title: What makes an answer count in a hosted repo
question: In a repo that uses the hosted service, should an answer count only when it carries the service's signature?
answer: Only signed answers count
response: accept
not_chosen:
  - Signatures recorded, not required
answered: 2026-11-03T01:45:50.465Z
answered_by: Gus Ellerm
topic: hosted/answer-signatures
deck: hosted
level: hard
reverse: moderate
touches:
  - security
  - schema
filed: 2026-11-03T01:37:27.081Z
filed_by: claude-code
branch: overnight/2026-11-03
---

# What makes an answer count in a hosted repo

In a repo that uses the hosted service, should an answer count only when it carries the service's signature?

**Decided:** Only signed answers count, the agent's pick. The service signs every answer, rule and topic merge, and baesian verify and the commit gate check them offline. A verdict file written on the machine is ignored. Revises D62 for hosted repos.

**Not chosen:** Signatures recorded, not required. Answers are signed when the service writes them, but an unsigned verdict file still counts, as under D62 today. Nothing breaks if a signature is missing; a forged answer is caught only by its client field and audit.

**It turned on:** Is an agent writing an answer file itself a risk worth blocking, now that the service can sign? Worth blocking: Only signed answers count. Not worth blocking: Signatures recorded, not required.

**The fact given:** Agents run as you, so they can write any file in .git/baesian, a verdict included; D62 accepted that because one machine couldn't prevent it. With the service, the signing key lives off the machine. Requiring signatures means an answer given outside the website, offline or in the local client, wouldn't count in a hosted repo. Repos without the service keep D62 either way.

**First chose:** Signatures recorded, not required, then switched once the agent's pick was shown.

**The agent's case:** It makes D32's 'only the client resolves' enforceable where it can be, so the record can be trusted, at the cost of offline answers in hosted repos.

**Wrong if:** Answering offline or in the local client turns out to matter more than forgery, or missing signatures block real work in dogfooding. **To check:** In dogfooding, count answers attempted while the relay was unreachable, and verify failures from missing signatures.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-sar41, revision 1). Filed by claude-code on overnight/2026-11-03, in the deck “The hosted service”.

The record is in `.baesian/cards/B-sar41/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

D62 kept "only the client resolves" (D32) as a convention, because on one machine agents can write anything the client can. The hosted service changes that: it can sign what a person writes with a key the agent never sees, and `baesian verify` can check the signature offline. See [[Hosted Service]], section 4, and [[Hosted Service - Strand B5 Prior Art and Security]], F13 to F15.
