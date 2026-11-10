---
type: session
status: active
livedocs: snapshot
summary: "2026-11-10: M10 planned by a planning agent for the lead: the formats review before v1 (D108, D124), publishing the CLI to npm and the plugin from the repo's marketplace, what v1 means, and the docs, in [[Release v1]]; thirteen cards filed in deck release-v1. Nothing built."
created: 2026-11-10
tags: [baesian, session]
---

# 2026-11-10: the M10 release plan

A planning agent, sent by the lead, on `v1/next`. Another builder worked on practice cards in a separate worktree; nothing here touches code.

## Goal

A plan for M10 the lead can hand to builders, with every decision in it that the [[Working Agreement]] gives the user put as a card.

## What was done

- **Read:** Home, the Working Agreement, D108 and D124, [[Formats for v1]], [[File Formats]], the plugin (`plugins/baesian/`, `.claude-plugin/marketplace.json`), package.json, the deploy and CI workflows, the README and `docs/setup.md`.
- **Checked:**
  - `npm view baesian` and `npm view @baesian/cli`: both 404, so neither is taken.
  - `npm pack --dry-run`: 111 files, 1.07 MB, the client included, the website and the service left out.
  - Current docs through Context7: npm's trusted publishing and staged publishing, setup-node's publishing workflow, Claude Code's plugin marketplaces and versions, and Codex's plugin marketplace sources and manifest search order.
- **The formats review:** what changed since D124, ten findings, five of them cards.
- **Wrote** [[Release v1]]: the findings, the publishing steps in order with the card each waits on, and what builders do once each is answered.
- **Made the deck `release-v1`** and filed thirteen cards in it: B-emtd9, B-n15wk, B-pw9ak, B-xr2fa, B-h0vyy, B-4kj4d, B-4p43b, B-c0e0d, B-np6af, B-866d2, B-x47ek, B-480t1, B-yj9wc.

## Decisions

None made: every choice is a card, or is the plan's recommendation, for builders once those cards are answered.

## Next

The user answers the deck `release-v1`; the lead hands the steps in [[Release v1#The steps, in order]] to builders. Step 2, a test that reads every release tag's record with v1's schemas, waits on no card.
