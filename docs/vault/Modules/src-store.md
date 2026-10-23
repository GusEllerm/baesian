---
type: module
status: active
authority: describes
summary: "src/store.ts: the Store class, which reads and writes both layers, enforces write-once files, computes card status, and runs the filing check."
created: 2026-10-23
updated: 2026-10-23
reviewed: 2026-10-23
tags: [baesian, module]
---

# src/store.ts

`Store` is the only code that touches Baesian's files. `Store.open` finds the repo with `openRepo`. The live layer is `LIVE_DIR` inside git's common directory, and the record is `RECORD_DIR` in the worktree ([[File Formats]]).

## Writing

- **`Store.fileCard`** validates a draft, checks for possible duplicates, assigns an ID and writes revision 1. It writes into the live layer and copies the card and its deck into the worktree's record.
  - **The filing check:** `Store.matches` returns open cards and resolved decisions with the same canonical topic, or a title similar enough (`SIMILAR_TITLE`). Any match raises `PossibleDuplicate` unless the caller forces it.
  - **Hard by default:** a draft without a `level` whose facts include one of `HARD_BY_DEFAULT` becomes `hard`.
- **`Store.reviseCard`** writes the next revision, and only for a card whose status is `returned`.
- **`Store.attach`** records an `Attachment`, and copies the card's revisions into this worktree's record. **`Store.waiting`** counts the filer plus the attachments.
- **`Store.withdraw`** writes the card's single `Withdrawal`.
- **`Store.addVerdict`** is for the client only. It rejects stale revisions, and keeps `at` strictly increasing per card.
- **`Store.recordFallback`** notes that an agent proceeded on a blocking card without a verdict (D46). **`Store.fallbacks`** lists them.
- **`Store.touchPresence`** writes the client's heartbeat atomically, and **`Store.presence`** reads it. A missing or unreadable file means "unknown", never an error.
- **`Store.syncRecord`** copies verdicts and ledger entries for the cards the record already holds, plus everything in their card directories: revisions, withdrawals and fallbacks (D37).

All of these go through a private write-once helper that uses an exclusive create. Nothing is ever edited in place.

## Reading

- **`Store.status`** is computed, in this order:
  1. withdrawn (by the agent, or because a `depends_on` parent was rejected);
  2. superseded (a resolved card `supersedes` it);
  3. otherwise, the latest verdict on the latest revision: resolved, returned, rerouted or deferred; or open if there's none.
- **`PENDING`** is the set of statuses that still need the reviewer. **`Store.decision`** gives what was decided for a resolved card.
- **`Store.canonicalTopic`** follows `TopicAlias` files. **`Store.topics`** lists the canonical topics in use.
- **`Store.inbox`** returns verdicts on the branch's cards (filed or attached) that are newer than a per-branch cursor, and advances the cursor unless peeking.
- **`Store.branchDeckId`** and **`Store.ensureBranchDeck`** give each branch its default deck.

## Not here yet

The hooks and ledger writing (M3), and rules and aliases written by the client (M4). Waiting lives in `waitForVerdict` ([[src-cli]]).
