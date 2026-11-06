---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Which setup the README leads with: The hosted client first (B-k3451)."
created: 2026-11-06
updated: 2026-11-06
tags:
  - baesian
  - decision
aliases:
  - B-k3451
card: B-k3451
revision: 1
title: Which setup the README leads with
question: Should the README's setup lead with the hosted client at baesian.dev, or with the local client a repo serves itself?
answer: The hosted client first
response: accept
not_chosen:
  - The local client first
answered: 2026-11-06T19:08:04.229Z
answered_by: GusEllerm
topic: docs/readme/setup-order
deck: branch-v1-next
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-06T19:01:26.599Z
filed_by: claude-code
branch: v1/next
---

# Which setup the README leads with

Should the README's setup lead with the hosted client at baesian.dev, or with the local client a repo serves itself?

**Decided:** The hosted client first, the agent's pick. Then setup reads: sign up at baesian.dev, install the CLI, `baesian init`, `baesian login`, the plugin; answer from a laptop or a phone. Serving the client yourself (`baesian serve`, nothing leaves the machine) follows as the other way.

**Not chosen:** The local client first. Then setup reads: install the CLI, `baesian init`, `baesian serve`, the plugin; everything stays on your machine. Linking to baesian.dev for the phone and CI's check follows as an option.

**It turned on:** Is the README for people who'll answer from anywhere, or for people trying it on their own machine first? (a preference) Anywhere: The hosted client first. Their own machine first: The local client first.

**The fact given:** baesian.dev is live with open sign-up, passkeys, the phone layout and CI's pinned check; others can't link a repo yet, since the CLI isn't published and the repo is private. The local client needs no account, works offline, and doesn't do phones or CI's check of signed answers. Today's README leads with the local install.

Answered by GusEllerm on 2026-11-06, through Baesian (card B-k3451, revision 1). Filed by claude-code on v1/next, in the deck “Decisions on v1/next”.

The record is in `.baesian/cards/B-k3451/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The README is being rewritten for the new client: a new GIF, and the branches figure made from Baesian's own history.
