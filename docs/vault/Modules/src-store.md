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

`Store` is the only code that touches Baesian's files. `Store.overRecord` opens a read-only view of a committed record, which is how CI reads it ([[src-verify]]). `Store.open` finds the repo with `openRepo`. The live layer is `LIVE_DIR` inside git's common directory, and the record is `RECORD_DIR` in the worktree ([[File Formats]]).

## Writing

- **`Store.fileCard`** validates a draft, checks for possible duplicates, assigns an ID and writes revision 1. It writes into the live layer and copies the card and its deck into the worktree's record.
  - **The filing rules:** `filingProblems()` rejects a draft whose two options are really one, whose crux doesn't decide between them (D74), that lacks `wrong_if` and `check` when a facet asks for them (D77), or that has half a facet (D75). The store also rejects IDs in `depends_on`, `rules` or the `_breaks` lists that don't exist. The body is optional context, and nothing in it is checked (D92).
  - **Warnings:** `filingWarnings()` notes long fields in the result's `warnings`. The card is filed anyway.
  - **The filing check:** `Store.matches` returns open cards and resolved decisions with the same canonical topic, or a title similar enough (`SIMILAR_TITLE`). Any match raises `PossibleDuplicate` unless the caller forces it.
  - **Hard by default:** a draft without a `level` whose facts include one of `HARD_BY_DEFAULT` becomes `hard`.
- **`Store.reviseCard`** writes the next revision, and only for a card whose status is `returned`.
- **`Store.attach`** records an `Attachment`, and copies the card's revisions into this worktree's record. **`Store.waiting`** counts the filer plus the attachments.
- **`Store.withdraw`** writes the card's single `Withdrawal`.
- **`Store.addVerdict`** is for the client only. It rejects stale revisions, and keeps `at` strictly increasing per card.
- **`Store.recordFallback`** notes that an agent proceeded on a blocking card without a verdict (D46). **`Store.fallbacks`** lists them.
- **`Store.writeLedger`** records that a commit builds on a card (D15). The post-commit hook calls it, and **`Store.ledger`** lists a card's entries, oldest first. A changed answer's brief lists them (D81).
- **`Store.touchPresence`** writes the client's heartbeat atomically, and **`Store.presence`** reads it. A missing or unreadable file means "unknown", never an error.
- **`Store.startWaiting`** writes an agent's waiting marker (D90), with a temporary file and a rename, and returns its `since` and a handle to refresh it and to stop, which removes it. If the same agent already has a fresh marker on the card, from an earlier run of a sliced wait (D101), it picks that one up again, keeping its `since`. **`Store.waitingOn`** lists a card's markers, each stale once it's older than `WAITING_STALE_MS` (90 seconds, as presence). The markers are mutable, like presence; everything else is written once.
- **`Store.syncRecord`** copies verdicts and ledger entries for the cards the record already holds, plus everything in their card directories: revisions, withdrawals and fallbacks (D37).

All of these go through a private write-once helper that uses an exclusive create. Nothing is ever edited in place.

**`Store.ensureBranchDeck`** creates the branch's deck on first use. If another agent on the branch creates it at the same moment, the exclusive create fails, and that's taken as success, since the deck now exists. The server's four-writer test found this race.

## Reading

- **`Store.status`** is computed, in this order:
  1. withdrawn (by the agent, or because a `depends_on` parent was rejected);
  2. superseded: a resolved card `supersedes` it, or a resolved conflict card names it in `conflict_of` and chose the other decision (D35);
  3. returned, when a `depends_on` parent's latest verdict chose something other than its proposal (`alternative` or `correction`) after this card's latest revision and its own latest verdict (D80);
  4. otherwise, the latest verdict on the latest revision: resolved, returned (including `see_it_run`), rerouted or deferred; or open if there's none.
- **`PENDING`** is the set of statuses that still need the reviewer. **`Store.decision`** gives what was decided for a resolved card.
- **`Store.canonicalTopic`** follows `TopicAlias` files. **`Store.topics`** lists the canonical topics in use.
- **`Store.briefs`** says what an agent should be told beyond the verdict, computed from the records and never stored (`Brief`):
  - `parent-decided-otherwise`: a parent went the other way, so this card is returned (D80);
  - `answer-changed`: the answer changed after an earlier one had resolved the card. It lists the ledger's commits from before the change; only commits that cite the card, so a lower bound (D81).
- **`Store.view`** runs a function over one consistent read of the live layer: each file is read once, and a file that can't be read is reported and skipped instead of thrown. The server reads through it ([[src-server]]). Outside a view, a bad file throws, so the CLI stays loud.
- **`Store.inbox`** returns `InboxItem`s newer than a per-branch cursor, and advances the cursor unless peeking. They cover verdicts on the branch's cards (filed or attached), and dependents returned by a parent's verdict, listed under the dependent's ID. Each carries its brief.
- **`Store.branchDeckId`** and **`Store.ensureBranchDeck`** give each branch its default deck.
- **`Store.rules`** reads accepted rules. The gate uses their `covers` globs to acknowledge facts automatically.

## Not here yet

Rules and aliases written by the client (M4). Waiting lives in `waitForVerdict` ([[src-cli]]), and the hooks in `runHook` ([[src-gate]]).
