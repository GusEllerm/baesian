---
type: module
status: active
authority: describes
summary: "src/vault.ts: the vault adapter (M6, P17, D170–D175). It renders one note per decision and per rule from a branch's record, extends a note when its decision changes, finds notes by ID, inserts the Decision Log's Bases query, turns Bases on, and resolves a deck's wikilinks for the client."
created: 2026-11-03
updated: 2026-11-03
reviewed: 2026-11-03
tags: [baesian, module]
---

# src/vault.ts

The design is [[Vault Adapter]] (P17). With `vault` in `.baesian/config.json`, the adapter keeps a view of the record in the vault: one note per decision in `Decisions/`, and one per rule in `Rules/` (`DECISIONS`, `RULES`). The record stays the source of truth. Without a vault, nothing here runs (D8). The note formats are in [[File Formats#Vault notes (M6)]].

## Where the vault is

`vaultOf` reads the config, and refuses a vault that `vaultPathProblem` rejects: an absolute path, or one outside the repo. `cleanVaultPath` keeps the path relative, with forward slashes and no trailing slash.

## Which notes (D170)

`Reading` is one read of a record, inside `Store.view`. Its history of a card walks the card's immutable files in time order: its verdicts, a reply's revision, its withdrawal (`Store.withdrawal`), the verdicts of the cards it `depends_on`, and those of the cards that supersede it or name it in a conflict.
- **A card gets a note once an answer resolved it,** whatever happened after: `accept`, `alternative` or `correction`, conflict cards included. A card withdrawn before any answer gets none, and neither does a rule draft (D110). `notedIds` lists them, for `baesian verify`.
- **Every rule gets a note,** retired or not.

## Names (D171)

- **`decisionNoteName`:** the card ID and its first revision's title, which never changes, so every branch names a note the same way.
- **`ruleNoteName`:** the rule ID and the rule's first words.
- **`cleanName`** removes what Obsidian can't use in a name or a link (`* " \ / < > : | ? # ^ [ ]`), collapses spacing, cuts at a word boundary (`TITLE_MAX` is 80, `RULE_WORDS_MAX` 60), and drops a trailing dot or space.
- **A note is found by the ID at the start of its name** (`noteIdOf`), anywhere under its folder, so a note renamed or moved by hand isn't written twice.

## A note, and how it changes (D172)

A note is its frontmatter, its body, and dated sections at the end.
- **The body** is rendered from the card's first resolving answer, and never changes: the question, what was decided and what wasn't, the crux, the lines the card and verdict set, who answered and when, and the card's body as background. A rule's body is the rule, who accepted it, and the gate facts it covers.
- **The frontmatter** is rendered afresh each time from the record: the keys the adapter owns, in a fixed order, then any key a person added. Tags and aliases a person added are kept.
- **A section is added for each change** the history finds after the first answer: `Changed` (another answer), `Reopened` (an answer that sent it back, the agent's one reply, or the card it builds on decided otherwise), `Answered again` (resolved again with the same answer after a reopening), `Superseded`, `Withdrawn` (by its agent, or because the card it builds on was rejected), and, for a rule, `Retired`. Each heading is `## <What> on <date>`, the date in UTC.

`extendNote` brings an existing note up to date: it renders the owned keys, keeps the rest, and adds each missing section in its place among those already there, matched by heading, or at the end. Nothing in the body is rewritten, so text a person added stays where they put it. Since everything is rendered from immutable files, a note written fresh is the same bytes as one written earlier and extended since. So two branches that hold the same files write the same note, and git merges two identical additions cleanly.

The body names other cards in links built from their first revisions (`[[B-x Title|B-x]]`), or by ID where a branch's record may not hold them: a rule's note names the card it came from only by ID in its body, since every branch's record has the rule but not always the card. The frontmatter links them where it can, since it's rendered afresh.

## Writing

- **`planNotes`** gives each note the record calls for (`PlannedNote`): its path, what it holds now, and what it should hold. A note whose frontmatter can't be read is left alone, with a warning.
- **`writeNotes`** writes the changed ones, for the worktree's record (`Store.overRecord`). A `mayWrite` callback can hold one back. A vault that isn't there is a warning, and nothing is written (`NotesResult.unusable`).

The pre-commit hook (`runHook`, [[src-gate]]) and `baesian sync` ([[src-cli]]) call `writeNotes`. Nothing else writes notes, and the client never does.

## `baesian init --vault`

`initVault` records the vault with `Store.setVault`, which keeps the config's other keys, then:
- **`enableBases`** turns on Obsidian's Bases core plugin in `.obsidian/core-plugins.json`: `"bases": true` in its object form, keeping the other keys in order, or `"bases"` added to its older list form. It never creates `.obsidian/` or the file.
- **`insertLogQuery`** inserts `DECISION_LOG_SECTION`, the `base` code block from P17 §5, into the vault's `Decision Log.md` (`DECISION_LOG`), before its first second-level heading. It does it once: a log that already has the heading or a base over `Decisions` is left alone. With no log, `init` prints the section to paste.
- **`vaultGuidance`** gives the `AGENTS.md` block its sentence (D173): the vault's routing notes that exist (`ROUTING_NOTES`, through `routingNotes`) and its `Rules/` folder. `agentsBlock` in `src/agents.ts` adds it.

The gate never reads the vault: its rules come only from the store (`Store.rules`).

## Links from decks (P17 §8)

`contextNotes` gives the server ([[src-server]]) a deck's context notes as `ApiContextNote`s.
- **`parseWikilink`** splits `[[Folder/Name#Heading|text]]`; a bare name is a target.
- **`resolveWikilink`** matches as Obsidian does: `[[Name]]` by file name anywhere in the vault, `[[Folder/Name]]` by path, ignoring case; the shortest path if several match.
- **`listNotes`** lists the vault's Markdown notes, skipping hidden folders and symlinks.
- Each link resolves to its note's path and its `summary:` line, or is `missing`. Without a vault, it's plain text.

## In `baesian verify`

`vaultWarnings` warns, without failing, when the commit's record holds decisions or rules with no note in the vault, or the vault isn't in the commit ([[src-verify]]).

## Tests

`test/vault.test.ts` renders notes against real repos and linked worktrees: each kind of answer, names, every change and its idempotence, hand edits, byte-identical notes from two branches and a clean merge, a real conflict, either side of a stale one, `init --vault`, `baesian sync`, `baesian verify`, and wikilinks. `test/vault-hooks.test.ts` commits through the real hooks: notes staged, unstaged by a blocked commit, a person's unstaged edit left alone, no vault, a missing vault, and, when livedocs is on PATH, the livedocs gate stamping the notes as snapshots.
