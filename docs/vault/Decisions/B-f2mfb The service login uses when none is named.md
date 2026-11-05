---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "The service login uses when none is named: Default to https://baesian.dev (B-f2mfb)."
created: 2026-11-05
updated: 2026-11-05
tags:
  - baesian
  - decision
aliases:
  - B-f2mfb
card: B-f2mfb
revision: 1
title: The service login uses when none is named
question: When `baesian login` links a repo and no service is named, should it use https://baesian.dev?
answer: Default to https://baesian.dev
response: accept
not_chosen:
  - Keep requiring it to be named
answered: 2026-11-05T13:16:23.725Z
answered_by: GusEllerm
topic: cli/login-default-service
deck: setup
level: provisional
reverse: moderate
touches:
  - public-api
  - user-facing
filed: 2026-11-05T13:13:39.495Z
filed_by: claude-code
branch: v1/next
---

# The service login uses when none is named

When `baesian login` links a repo and no service is named, should it use https://baesian.dev?

**Decided:** Default to https://baesian.dev, the agent's pick. Then `baesian login` links a repo with no flags. Someone running their own service names it once, with `--service` or `$BAESIAN_SERVICE`; after that the repo's config holds it.

**Not chosen:** Keep requiring it to be named. A first login without `--service` stops and says to give it, as now. A repo goes to baesian.dev only after someone typed that address.

**It turned on:** Should a repo be linked to the hosted service without anyone typing its address? (a preference) Yes: Default to https://baesian.dev. No: Keep requiring it to be named.

**The fact given:** Before you approve, `baesian login` sends the service a random project ID and this machine's hostname, and shows a page on the service that names it and asks for your passkey. Only after that does the first sync send every card and answer in the repo.

**The agent's case:** The approval page names the service and takes a passkey before any card leaves the machine, so typing the address adds a step without adding a choice. People running their own service are the exception, and the flag stays for them.

Answered by GusEllerm on 2026-11-05, through Baesian (card B-f2mfb, revision 1). Filed by claude-code on v1/next, in the deck “Setting up a repo with the hosted service”.

The record is in `.baesian/cards/B-f2mfb/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Today `baesian login` in an unlinked repo with neither `--service` nor `$BAESIAN_SERVICE` stops with "this repo isn't linked to the service yet: name it with `baesian login --service <url>`". A linked repo already takes the service from its config, so the default only matters at the first link.
