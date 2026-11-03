---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "How people sign up and sign in: Passkey accounts, with Globus as a way in (B-9tk9m)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-9tk9m
card: B-9tk9m
revision: 2
title: How people sign up and sign in
question: What should a person use to create an account and sign in on the hosted website?
answer: Passkey accounts, with Globus as a way in
response: accept
not_chosen:
  - Globus Auth for everyone
answered: 2026-11-03T02:44:52.592Z
answered_by: Gus Ellerm
topic: hosted/sign-in
deck: hosted
level: hard
reverse: moderate
touches:
  - security
  - user-facing
  - dependency
filed: 2026-11-03T01:37:26.937Z
filed_by: claude-code
branch: overnight/2026-11-03
depends_on:
  - "[[B-na7je Proof that a person answered a hard card|B-na7je]]"
  - "[[B-rca1z Where the hosted service runs|B-rca1z]]"
---

# How people sign up and sign in

What should a person use to create an account and sign in on the hosted website?

**Decided:** Passkey accounts, with Globus as a way in, the agent's pick. Sign up with a passkey and an email, or through Globus with a university, Google, ORCID or GitHub login. Every account has a passkey, so sign-in works when Globus is down. Baesian runs email recovery for accounts without Globus.

**Not chosen:** Globus Auth for everyone. Everyone signs in through Globus: university SSO, or Google, ORCID or GitHub. Recovery and MFA are the provider's; a passkey is added for hard cards. No new sign-ins while Globus is down; its terms for non-research users are unconfirmed.

**It turned on:** Which matters more: that no account depends on Globus, or that Baesian runs no account recovery of its own? (a preference) That no account depends on Globus: Passkey accounts, with Globus as a way in. That Baesian runs no recovery: Globus Auth for everyone.

**The fact given:** Either way, the service keeps each reviewer's passkey for hard cards and issues machine tokens itself; Globus has no device flow. Globus gives university SSO (InCommon, eduGAIN), and Google, ORCID or GitHub for others, but not company SSO. Its FAQ says it can't serve commercial users free; nothing says whether sign-in for a tool like this counts. Its planned outages (up to an hour in October 2026) stop sign-ins to apps that use it.

**The agent's case:** Passkeys are needed anyway for hard cards (B-na7je), so passkey sign-in costs little and keeps every account working without Globus. Globus still gives researchers their institution's login and recovery, and developers, the first users (D2), aren't sent through a research broker.

**Wrong if:** Nearly all accounts come in through Globus and Globus confirms free use for anyone, so Baesian's email recovery serves few people; or linking two ways in causes account mix-ups. **To check:** Ask support@globus.org about terms for a non-research tool used by people at companies; in dogfooding, count sign-ups by route and recovery requests.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-9tk9m, revision 2). Filed by claude-code on overnight/2026-11-03, in the deck “The hosted service”.

The record is in `.baesian/cards/B-9tk9m/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Running sign-in ourselves is partly unavoidable: whatever handles sign-in, the service keeps each reviewer's passkey for hard cards (B-na7je) and issues the machine tokens for baesian login, and Globus has no device flow for the CLI anyway. Passkeys already remove the riskiest part of running accounts, stored passwords, so what Globus would take on is account recovery and identity checks for the people who use it, plus their university's SSO (not a company's). This revision therefore offers Globus beside passkeys, or Globus for everyone; the evidence and sources are in [[Sign-in for the Hosted Service]].
