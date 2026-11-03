---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Where the website's client gets its state: The relay serves the state, as baesian serve does (B-17wn9)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-17wn9
card: B-17wn9
revision: 1
title: Where the website's client gets its state
question: Should the relay work out each project's state and serve it as baesian serve does, or send the browser the files and let it work out the state?
answer: The relay serves the state, as baesian serve does
response: accept
not_chosen:
  - The browser works out the state from the files
answered: 2026-11-03T13:36:12.755Z
answered_by: Gus Ellerm
topic: hosted/relay-api
deck: hosted
level: blocking
reverse: moderate
touches:
  - public-api
filed: 2026-11-03T13:32:01.823Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-kypkm Whether the service can read card text|B-kypkm]]"
  - "[[B-rca1z Where the hosted service runs|B-rca1z]]"
  - "[[B-k216t What the local client does in a hosted repo|B-k216t]]"
  - "[[B-sa8tg Which gate record holds a card back when hosted|B-sa8tg]]"
---

# Where the website's client gets its state

Should the relay work out each project's state and serve it as baesian serve does, or send the browser the files and let it work out the state?

**Decided:** The relay serves the state, as baesian serve does, the agent's pick. The relay runs the store's logic over each project's files and serves a snapshot and change events, as baesian serve does (D96), so the client reads both the same way. The store's logic is split from Node's file system to run there.

**Not chosen:** The browser works out the state from the files. The relay serves only its file log, the one the CLI pulls, and the browser runs the store's logic over those files. The client then has a second way to load. Encrypting card text later wouldn't move this logic.

**It turned on:** Is encrypting card text, so the service can't read it, likely to come back after v1? Unlikely: The relay serves the state, as baesian serve does. Quite possibly: The browser works out the state from the files.

**The fact given:** The website and baesian serve show the same React app (P15, section 7); today it reads a snapshot and change events (D96) through five endpoints. The relay works out card status anyway: it gates each card on arrival (D158), counts what's waiting for notifications, and deletes text once answered (D137). The store reads files through Node's file system today, so its logic is split out either way. Encrypting card text later would also take the gate off the relay (D158).

**First chose:** The browser works out the state from the files, then switched once the agent's pick was shown.

**The agent's case:** The relay needs the store's status logic anyway, for the gate, notifications and deletion, so serving the snapshot from it adds little, and one way of loading keeps the website and the local client the same code.

**Wrong if:** Encrypting card text comes back on the table, or working out a snapshot on every change shows up in the Durable Object's CPU time or the bill. **To check:** A load test with a few hundred cards in one project, measuring the object's CPU time per change; and the first outside users' view on private repos, which is D137's check too.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-17wn9, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-17wn9/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

P15 left this open after H1 ([[Hosted Service]], section 1, "What follows for the relay's API"). D137 made the first option possible: the service can read what it relays. The machine-facing protocol (upload by path, "everything after sequence N", versioned at /v1/) is the same under both; this card is about what the website's own client reads.

What the client reads today: `GET /api/state` (the snapshot, `ApiState`), `GET /api/events` (Server-Sent Events), and `POST` to `/api/verdicts`, `/api/aliases` and `/api/presence` (D96). On the relay, the writes become the signed ones (D138), with the passkey step for hard cards (D139).

Some of the snapshot comes from things neither the relay nor a browser has: the commits a rework brief lists come from git history (B-9v5xj), and a deck's context notes are resolved in the vault (M6). Under either option those need another source, or are left out on the website.

Under the first option, the Durable Object keeps the project's files in its SQLite storage (D140) and recomputes the snapshot when one arrives; change events can ride a hibernating WebSocket. Under the second, the browser pulls the same log the CLI does and keeps its own copy. If encryption were added later, the first option would move the snapshot into the browser then; the second already has it there.
