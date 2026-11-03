---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How the store's logic runs on the relay: One store, two kinds of storage (B-0ag7h)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-0ag7h
card: B-0ag7h
revision: 1
title: How the store's logic runs on the relay
question: Should the relay run the whole store over its own storage, through one file interface, or share only the store's reading logic and write files its own way?
answer: One store, two kinds of storage
response: accept
not_chosen:
  - Shared reading, the relay's own writes
answered: 2026-11-03T20:31:49.494Z
answered_by: Gus Ellerm
topic: hosted/relay-store-split
deck: hosted
level: blocking
reverse: moderate
touches:
  - public-api
filed: 2026-11-03T20:28:38.756Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-17wn9 Where the website's client gets its state|B-17wn9]]"
  - "[[B-pjw5y Which repo holds the service's code|B-pjw5y]]"
---

# How the store's logic runs on the relay

Should the relay run the whole store over its own storage, through one file interface, or share only the store's reading logic and write files its own way?

**Decided:** One store, two kinds of storage, the agent's pick. The store reaches the live layer through a small synchronous interface: a folder on your machine, a SQLite table on the relay. The relay files and answers through the same code as the CLI and baesian serve; git and the record stay local.

**Not chosen:** Shared reading, the relay's own writes. What turns files into state (status, the snapshot, the gate's checks) becomes functions over files already read, which both call. The relay writes answers, rules and preference files with code of its own; the store's file calls stay.

**It turned on:** Should an answer given on the website go through exactly the code an answer given in the local client does? (a preference) Yes, one path: One store, two kinds of storage. Not worth the change now: Shared reading, the relay's own writes.

**The fact given:** The store is about 1,800 lines, with 50 direct file-system calls and 11 git calls. Answering does more than write a file: Store.addVerdict refuses stale revisions, retires rules, writes a preference file when a slider proposal is accepted, and files convention cards (D161). A Durable Object's SQLite storage is synchronous, as the store's file calls are. The relay has no git and no record. B-17wn9 decided that the relay runs the store's logic and serves the state as baesian serve does.

**First chose:** Shared reading, the relay's own writes, then switched once the agent's pick was shown.

**The agent's case:** Answers are where the two would drift: every rule about what an answer does would be written twice. One interface, with git kept on the Node side, lets the relay reuse it all, and lets the store's tests run against both kinds of storage.

**Wrong if:** The store's file calls don't map onto rows cleanly (atomic links, directory listings, mutable files), so the interface grows Node-shaped, or the change destabilises the CLI. **To check:** Run the existing store tests against the SQLite storage, and count the interface's methods once it's built.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-0ag7h, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-0ag7h/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

B-17wn9's answer says the store's logic "is split from Node's file system to run there"; this card asks where the split goes. It's a module boundary, and it changes the store's constructor, so it's carded before the work starts.

**The proposal in more detail** (the agent's design): an interface of perhaps eight methods, such as reading, listing a folder, creating a file once, replacing a mutable file and removing one. `Store` takes one for the live layer. On your machine it's the folder `.git/baesian/`, as now, with the record and git beside it; on the relay it's a table keyed by path, and the parts that need git (the record, worktrees, commit history) aren't there. The relay's log of entries (P16 section 8) is written beside that table, in the same transaction.

**The alternative in more detail:** `Store.view()`'s reading and `snapshot()` would take parsed files, not a folder. The relay would parse its rows and call them. Writes on the relay (answers, rules, rule retirements, topic merges, preference changes, the relay's gate record) would be its own functions, tested against the store's behaviour.
