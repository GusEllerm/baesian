---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Which repo holds the service's code: In this repo, beside the CLI (B-pjw5y)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-pjw5y
card: B-pjw5y
revision: 1
title: Which repo holds the service's code
question: Should the hosted service's code live in this repo beside the CLI, or in a separate repo of its own?
answer: In this repo, beside the CLI
response: accept
not_chosen:
  - A separate private repo
answered: 2026-11-03T16:55:15.611Z
answered_by: Gus Ellerm
topic: hosted/service-repo
deck: hosted
level: blocking
reverse: moderate
touches:
  - public-api
  - infra
filed: 2026-11-03T15:26:48.799Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-17wn9 Where the website's client gets its state|B-17wn9]]"
  - "[[B-rca1z Where the hosted service runs|B-rca1z]]"
---

# Which repo holds the service's code

Should the hosted service's code live in this repo beside the CLI, or in a separate repo of its own?

**Decided:** In this repo, beside the CLI, the agent's pick. The service is a folder of this repo with its own package, importing the schemas and the store's logic directly; one CI tests the CLI and the service against the same formats. If this repo is published, the service's code goes with it.

**Not chosen:** A separate private repo. The service lives in a repo of its own and takes Baesian's schemas and store logic as a package or a copy, so format changes land in two places. Its code stays private when this repo is published, and agents working on the CLI don't see it.

**It turned on:** If this repo is published, should the hosted service's code be published with it? (a preference) Yes: In this repo, beside the CLI. No: A separate private repo.

**The fact given:** This repo is private today and has no licence; M10 adds a licence and publishes. npm gets only dist/, so the service's code isn't in the CLI's package either way. The relay runs the store's logic over each project's files (B-17wn9), and schemas are strict on both sides (D157), so the CLI and the service change formats together until v1 (D108). The service's keys live in Workers secrets, not in code. D129 chose central hosting over a self-hostable server first; public code can be read by anyone, and run by anyone if the licence allows.

**First chose:** A separate private repo, then switched once the agent's pick was shown.

**The agent's case:** Until v1 the formats move together, and one repo keeps the store logic the relay runs from drifting away from the CLI's. Published code also lets users check what the service enforces and collects, beside D141's public list of fields.

**Wrong if:** You'd rather nobody could run their own copy of the service, or the service grows code that shouldn't be public, such as its abuse rules. **To check:** Choose M10's licence with the service in mind; before publishing, review the service's folder for anything that shouldn't be public.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-pjw5y, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-pjw5y/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

P15 doesn't say where the service's code goes. It's a module boundary, so it's a card under AGENTS.md. How releases reach Cloudflare is a separate question (hosted/deploy-trigger).

**What ties the service to the CLI's code.**
- *The store's logic:* B-17wn9 has the relay work out each project's state as `baesian serve` does, so the store's logic is split from Node's file system to run on Workers.
- *The formats:* every file carries a format number (D156) and a newer one is refused (D157), so the service, the CLI and CI must agree. Until v1, formats change freely and nothing is kept compatible (D108).
- *The client:* the website serves the same React app as `baesian serve` (P15 section 7).

**What changes with the repo.**
- *The gate:* the gate's default infra patterns include `wrangler.toml`, `wrangler.json` and `wrangler.jsonc` (`DEFAULT_INFRA`), so in this repo a change to the service's Cloudflare configuration is an infra fact needing a card or an ack. In a repo of its own, that repo would need Baesian set up too.
- *Publishing:* checked 2026-11-03 with `gh repo view`: this repo is private and has no licence. `package.json` publishes only `dist`. Whether the repo itself goes public at v1 is M10's question; this card only decides whether the service goes with it.
- *Agents:* in this repo, agents working on the CLI can read and change the service's code. Its signing key stays out of their reach either way, in Workers secrets (P15 section 4).

The third option, building here and splitting out before publishing, keeps formats together through M9 and defers the publishing question to M10. Splitting later needs a history rewrite of the service's folder, such as with git filter-repo (the agent's knowledge).
