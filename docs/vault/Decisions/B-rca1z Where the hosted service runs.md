---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Where the hosted service runs: Cloudflare Workers, an object per repo (B-rca1z)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-rca1z
card: B-rca1z
revision: 1
title: Where the hosted service runs
question: Which kind of platform should the hosted service run on, when it's time to set it up?
answer: Cloudflare Workers, an object per repo
response: accept
not_chosen:
  - A small server of its own
answered: 2026-11-03T01:46:48.355Z
answered_by: Gus Ellerm
topic: hosted/platform
deck: hosted
level: hard
reverse: moderate
touches:
  - infra
  - money
  - dependency
filed: 2026-11-03T01:37:27.469Z
filed_by: claude-code
branch: overnight/2026-11-03
---

# Where the hosted service runs

Which kind of platform should the hosted service run on, when it's time to set it up?

**Decided:** Cloudflare Workers, an object per repo, the agent's pick. Each repo's relay is its own Durable Object with private SQLite storage, so repos are kept apart by construction. About $5 a month at small scale and no servers to patch; the relay's code is tied to Cloudflare's API.

**Not chosen:** A small server of its own. A Fly.io machine or a VPS running Node with SQLite or Postgres: portable, and the same runtime as the CLI. You patch it, back it up, and keep repos apart in code or with row policies.

**It turned on:** Is being tied to one vendor's API acceptable, in exchange for less operations work and isolation built in? (a preference) Acceptable: Cloudflare Workers, an object per repo. Not acceptable: A small server of its own.

**The fact given:** Prices as published on 2026-11-03: Workers Paid is $5 a month minimum with 10 million requests included, and the free plan includes SQLite Durable Objects. Fly.io's smallest machine is $2.19 a month (256 MB) or $6.70 (1 GB), with no free tier for new organisations. Hetzner starts at €5.99 a month excluding VAT. No money is spent and no account is opened until a separate card says so.

**The agent's case:** One person running a service for others gains most from isolation built in and nothing to patch, at a price near the floor.

**Wrong if:** The relay needs something Durable Objects can't do well, such as long jobs or a classifier model, or Cloudflare's limits bite in a prototype. **To check:** A prototype of upload and pull on the free plan, before choosing.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-rca1z, revision 1). Filed by claude-code on overnight/2026-11-03, in the deck “The hosted service”.

The record is in `.baesian/cards/B-rca1z/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The relay stores each repo's log of files and serves the website. B5 compared Cloudflare's Durable Objects, Fly.io and a VPS on cost and isolation. A small Baesian relay would sit near $5 a month on any of them. See [[Hosted Service]], section 8, and [[Hosted Service - Strand B5 Prior Art and Security]], F22 and F23.
