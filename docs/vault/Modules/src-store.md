---
type: module
status: active
authority: describes
summary: "src/store.ts: the Store class, which reads and writes both layers, enforces write-once files, computes card status, and runs the filing check."
created: 2026-10-23
updated: 2026-11-03
reviewed: 2026-10-23
tags: [baesian, module]
---

# src/store.ts

`Store` is the only code that touches Baesian's files. `Store.overRecord` opens a read-only view of a committed record, which is how CI reads it ([[src-verify]]). `Store.open` finds the repo with `openRepo`. The live layer is `LIVE_DIR` inside git's common directory, and the record is `RECORD_DIR` in the worktree ([[File Formats]]).

## Errors

The store's errors are classes, so the MCP server can give each a code ([[src-mcp]]); the CLI prints their messages and exits 1, or 3 for a duplicate:
- `NotARepo` (from `openRepo`): the directory isn't in a git repository;
- `NotSetUp` (`Store.requireInit`): there's no live layer, so `baesian init` hasn't run;
- `ValidationError`: the card fails its schema or a filing rule;
- `PossibleDuplicate`: an open card or a resolved decision may cover it, with the matches;
- `NoCard`: no card with that ID;
- `NotAllowed`: the card's state, or who asks, doesn't allow it: revising a card that isn't returned, a second reply, a rule nobody asked for, withdrawing another agent's card or one already withdrawn;
- `NoDeck`: the card names a deck that doesn't exist.

## Writing

- **`Store.fileCard`** validates a draft, checks for possible duplicates, assigns an ID and writes revision 1. It writes into the live layer and copies the card and its deck into the worktree's record.
  - **The filing rules:** `filingProblems()` rejects a draft whose two options are really one, whose crux doesn't decide between them (D74), that lacks `wrong_if` and `check` when a facet asks for them (D77), or that has half a facet (D75). The store also rejects IDs in `depends_on`, `rules` or the `_breaks` lists that don't exist. The body is optional context, and none of these rules apply to it (D92).
  - **Warnings:** `filingWarnings()` notes long fields in the result's `warnings`, and any field, or the body, that looks like it holds a secret (B-vqn69), naming the field and what the text looks like, never the text. The card is filed anyway. `Store.reviseCard` warns the same way.
  - **The filing check:** `Store.matches` returns open cards and resolved decisions with the same canonical topic, or a title similar enough (`SIMILAR_TITLE`). Any match raises `PossibleDuplicate` unless the caller forces it.
  - **Hard by default:** a draft whose facts include one of `HARD_BY_DEFAULT` becomes `hard`, whatever `level` it asks for: an agent may raise a card's level, never lower it (D144). The result's `hardBecause` names the facts. Only a repo's preference settings may lower it, once they exist (D146).
- **`Store.reviseCard`** writes the next revision, and only for a card whose status is `returned`.
- **`Store.mergeTopics`** writes a topic alias (D44, D111) from one topic's canonical key to another's, so aliases never form a cycle. It refuses two topics that are already one, and a target no card uses. Aliases are immutable: a merge can't be undone.
- **Rules from answers (D16, D109, D110):** `Store.ruleAsked` says whether the latest verdict on a decision carries `make_rule` and no draft exists yet. `Store.draftRule` files the draft: a card built from the decision, in its topic and deck, that `depends_on` it and carries `rule` and `rule_covers`. When the reviewer accepts the draft, or answers it with their own wording, `Store.addVerdict` saves the rule (`saveRule`), once per decision.
- **Retiring a rule (D119):** a verdict's `retire_rules` names rules the chosen option breaks. `Store.addVerdict` refuses it, writing nothing, unless the verdict chooses an option (`accept` or `alternative`), that option's `_breaks` lists each rule, and none is retired yet. It then writes a `RuleRetirement` beside each rule and copies it into the record.
- **`Store.replyToCard`** writes the agent's one reply (D89, D104): the next revision, a copy of the last plus `reply`. It's allowed only when `Store.canReply` says so: the latest answer went against the pick (`alternative` or `correction`), and no revision has had a reply. The reply reopens the card. The D81 brief counts the answer the reply was to as the earlier one.
- **`Store.attach`** records an `Attachment` (with no folder path, D121), and copies the card's revisions into this worktree's record. **`Store.waiting`** counts the filer plus the attachments.
- **`Store.withdraw`** writes the card's single `Withdrawal`, and only for the agent that filed the card or one attached to it; a second withdrawal is refused too (`NotAllowed`). Agents name themselves, so this guards against mistakes, not against an agent set on it.
- **`Store.addVerdict`** is for the client only. It rejects stale revisions, and keeps `at` strictly increasing per card.
- **`Store.recordFallback`** notes that an agent proceeded on a blocking card without a verdict (D46). **`Store.fallbacks`** lists them.
- **`Store.writeLedger`** records that a commit builds on a card (D15). The post-commit hook calls it, and **`Store.ledger`** lists a card's entries, oldest first. A changed answer's brief merges them with the history's trailers (D81, B-9v5xj; below).
- **`Store.touchPresence`** writes the client's heartbeat atomically, and **`Store.presence`** reads it. A missing or unreadable file means "unknown", never an error.
- **`Store.startWaiting`** writes an agent's waiting marker (D90), with a temporary file and a rename, and returns its `since` and a handle to refresh it and to stop, which removes it. If the same agent already has a fresh marker on the card, from an earlier run of a sliced wait (D101), it picks that one up again, keeping its `since`. **`Store.waitingOn`** lists a card's markers, each stale once it's older than `WAITING_STALE_MS` (90 seconds, as presence). The markers are mutable, like presence; everything else is written once.
- **`Store.syncRecord`** copies verdicts and ledger entries for the cards the record already holds, plus everything in their card directories: revisions, withdrawals and fallbacks (D37). It also copies every rule, retirement and topic alias, which apply to the whole repo: the client saves them into the record of the worktree it runs in, the local gate reads them from the live layer, and CI reads each commit's own record, so without this a rule passed locally and failed in CI on any other branch.

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
- **`Store.briefs`** says what an agent should be told beyond the verdict, computed from the records and never stored (`Brief`). Each names who wrote its texts, the reviewer of each answer and the parent's agent and branch, so an agent reads them quoted with their authors (D169):
  - `parent-decided-otherwise`: a parent went the other way, so this card is returned (D80);
  - `answer-changed`: the answer changed after an earlier one had resolved the card (D81). It lists the commits built on it before the change (`BriefCommit`); only commits that cite the card, so a lower bound. Since a rebase or a squash merge rewrites commits, and the ledger's hashes go stale, they're found by their trailers (B-9v5xj): `readHistory` ([[src-gate]]) gives the commits on any branch, local or remote-tracking, whose `Baesian-Card` trailers cite the card, authored before the change (a rebase keeps the author's date, and a rework made after the change isn't listed). Each is named by the branch the ledger says it was made on, or else the branch the search found it on; a ledger entry made on a detached HEAD, as git's post-commit runs during a rebase, doesn't count. Then come the ledger's entries whose commit is on no branch now, marked `rewritten`. The history is read once per view, and cached per process while the branches stay put. The ledger itself is unchanged.
- **`Store.view`** runs a function over one consistent read of the live layer: each file is read once, and the list of cards, each card's verdict files and each card's claimants (`Store.claimants`: the cards that supersede it or name it in a conflict) are built once. With a `report`, a file that can't be read is reported and skipped instead of thrown; the server reads that way ([[src-server]]). Without one, a bad file still throws, so the CLI stays loud. The CLI's `list`, `show`, `inbox`, `topics`, each poll of `wait`, and filing's checks read through a view: a card's status reads the others, and reading afresh made them quadratic ([[2026-11-03 Scale Test]]). A view must not span a write it then reads back: filing ends its view before writing.
- **`Store.inbox`** returns `InboxItem`s newer than a per-branch cursor, and advances the cursor unless peeking. They cover verdicts on the branch's cards (filed or attached), and dependents returned by a parent's verdict, listed under the dependent's ID. Each carries its brief. Items that `baesian wait` has already delivered are skipped. With a `session` (the harness's session id, which the plugin's hooks pass), the session keeps a cursor of its own, so each session on the branch hears each verdict once (B-ghhym, provisional). A session's first read saves its place, starting from the branch's cursor, which keeps up with the newest any session has read; so a new session isn't handed old verdicts, and one session reading first can't take another's. What `wait` delivered stays delivered for every session.
- **`Store.markDelivered`** is how `wait` says what it delivered: the verdict it printed, and those behind its briefs. They're listed in the cursor file's `delivered`, beside its time, which doesn't move, so older verdicts on other cards stay in the inbox. Once `inbox` has shown everything newer than the cursor, the cursor moves past it all and the list empties.
- **`Store.branchDeckId`** and **`Store.ensureBranchDeck`** give each branch its default deck.
- **`Store.rules`** reads every rule, each with its retirement if it has one. The gate uses the `covers` globs of rules that aren't retired to acknowledge facts automatically.

## Not here yet

Rules and aliases written by the client (M4). Waiting lives in `waitForVerdict` ([[src-cli]]), and the hooks in `runHook` ([[src-gate]]).
