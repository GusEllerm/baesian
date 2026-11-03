---
type: design
status: draft
authority: proposes
summary: "Proposal P17, its six cards accepted as D170–D175: how the vault adapter (M6) writes one note per decision and per rule from the record at each commit, changes them later, embeds one Bases query in the Decision Log, keeps them out of livedocs' checks, takes no rules from notes, links decks and cards to the vault, and what it means for this repo's hand-written Decision Log."
created: 2026-11-03
tags: [baesian, design, vault]
---

# Vault Adapter

> **Status: proposal P17 (2026-11-03). Its six cards were accepted as D170–D175 the same day, each the agent's pick; the rest is the agent's, standing unless the user overturns it.** An agent drafted it for M6 from [[Baesian Design#With a vault: the adapter]] and the code as it stands. Every recommendation is the agent's. Each open choice is marked **For the user**, with its strongest alternative; six are drafted as decision cards for the deck `vault-adapter`. Where the proposal would change the design's text, it says so.

The vault adapter makes a vault (Markdown in the repo, with Obsidian as its interface) show the decisions Baesian records. It's milestone M6, and part of v1 (D125). The record in `.baesian/` stays the source of truth. The notes are its view in the vault. A repo without a vault is unaffected (D8).

## The proposal in brief

- **Notes are written at commit, from the record.** After the pre-commit hook copies new verdicts into the record, it writes a note for each decision the record holds that has none yet, and stages it. `baesian sync` does the same. Nothing else writes notes. The client never does.
- **One note per decision, in `Decisions/`,** named by card ID and title: `B-3akjw How an answer becomes a rule.md`. The frontmatter holds what the table shows. The body is the decision as a person reads it.
- **One note per rule, in `Rules/`,** named by rule ID and the rule's first words.
- **A note is rendered from the record alone.** Two branches that write the same note write the same bytes, so they merge cleanly.
- **A note changes only by its frontmatter and a dated section added at the end:** superseded, answer changed, reopened or withdrawn; for a rule, retired.
- **The Decision Log embeds one `base` code block,** inserted once by `baesian init --vault`, with views for decisions in force, rules in force, and everything. `init` also turns Bases on.
- **Each note says `livedocs: snapshot` in its own frontmatter,** so livedocs never binds it, and Baesian never edits livedocs' config.
- **Rules come only from the client.** Rule notes show them; the gate never reads rules from notes. The vault's routing notes reach agents as guidance, through `AGENTS.md`.
- **Links go both ways.** A deck's context_notes resolve to vault notes and show their `summary:` line. Card IDs in notes become links in the client, and aliases make them findable in Obsidian.
- **In this repo,** turning the adapter on writes 33 notes for the decisions already made through cards. From then on, a card decision gets no D-row. D-numbers carry on for decisions made in conversation.

## What stays as decided

- **D8:** standalone first. Without `vault` in `.baesian/config.json`, the adapter does nothing.
- **D27:** only git's phases are relied on. Notes are written at a commit, never at a harness event.
- **D32 and D62:** only the client resolves. A note never records an answer of its own; it renders one the record holds.
- **D34 and D37:** the record is written by `baesian file`, the pre-commit hook and `baesian sync`. The client never writes into a working tree.
- **D43:** one note per item, never an aggregate, written on whichever branch holds the item. The Decision Log embeds a Bases query. Decision and rule notes are livedocs snapshots. Marking a decision superseded is the one kind of edit (§4 asks to widen this).
- **D108:** the note formats are free to change until v1.
- **D110 and D119:** a rule is saved when you accept a draft in the client, and retired by an answer.
- **D136:** a public repo's record keeps the full card text. The notes copy it, so they expose nothing the record doesn't.

## 1. When notes are written

### The trigger

The pre-commit hook (`runHook`) already calls `Store.syncRecord`, then stages the record. With a vault configured, it then:
1. opens the record it just updated, read-only, the way CI does (`Store.overRecord`);
2. writes a note for each card there that has been resolved and has no note, and updates the notes whose card has changed since (§4);
3. stages what it wrote, and adds it to what a blocked commit unstages (`unstageOurs`, D122).

`baesian sync` does the same, for verdicts that arrive after a branch's last commit.

The trigger is a missing note, not a new verdict. So turning the adapter on writes a note for every decision already in the record, and a deleted note comes back at the next commit. To undo a decision, you answer a card. Deleting its note does nothing.

### Which branch

The branch being committed. Its record holds the cards it filed or attached to, and everything it inherited from main (D37). So a decision's note lands on every branch that holds its card, as D43 asks. Each copy is rendered from the same immutable files, so the copies are the same bytes, and git merges two identical additions without a conflict.

- **A late answer,** given after its branch merged, arrives with main's next commit, since main's record holds the card.
- **A branch cut before the adapter was turned on** writes nothing until it merges the config change, because the config is committed per branch.

### Which decisions

- **A note for each card that is or was resolved:** the proposal accepted, the alternative chosen, or your own answer (`correction`). Conflict cards (D35) count.
- **No note for a card never resolved:** open, returned, deferred, rerouted, withdrawn before an answer, or, under P14, held.
- **No decision note for a rule draft** (D110). Its rule gets a rule note, which links to the decision it came from.

The work is linear in the decisions, like every command since the scale test: one listing of each folder, and the frontmatter of each note.

In a repo connected to the hosted service, only signed answers count (D138). The adapter reads status through the store, so it follows whatever the store counts.

**For the user (card vault-1): when notes are written.** Recommended: in pre-commit and `baesian sync`, as above. It's the git phase everyone shares, and nobody has to remember a step. The strongest alternative is a new command, run when someone wants the vault brought up to date, with `baesian verify` warning in CI when the vault lags the record. Then no commit carries vault files its author didn't stage, apart from the record; but the vault is only as current as someone's memory. The crux: should every commit's vault agree with its record, or may it lag until someone asks?

Also considered, and not recommended:
- **writing as you answer:** the client writes into no working tree (D34), and the server's checkout may be on any branch;
- **writing when `wait` or `inbox` delivers the answer:** only branches with a listening agent would get notes, and they'd sit uncommitted.

## 2. The decision note

### Path and name

`<vault>/Decisions/<card ID> <title>.md`.

- **The title is the first revision's.** A later revision may retitle a card, but the first revision never changes. So every branch names the note the same way, and a link to it can be built from any copy of the card.
- **Titles are neutral.** The template asks for a short name that doesn't give the outcome ("How an answer becomes a rule"), so a note's name stays right when its answer changes. (D43's example, "Use SQLite for run metadata", predates that rule.)
- **Clean names.** The characters Obsidian can't use in a name or a link are removed (`* " \ / < > : | ? # ^ [ ]`), spaces are collapsed, and the name is cut at a word boundary to 80 characters.
- **Found by ID.** The adapter finds a card's note by the ID at the start of its name. A note renamed by hand isn't duplicated, as long as it keeps the ID.
- **An alias for the ID.** `aliases: [B-3akjw]` makes Obsidian's link picker offer the note when you type the ID. It then writes `[[B-3akjw How an answer becomes a rule|B-3akjw]]`. Plain-text mentions of the ID in other notes show as unlinked mentions in the note's backlinks (Obsidian help, "Aliases").

**For the user (card vault-2): how notes are named.** Recommended: ID and title, as above. Names read well on GitHub and in git's output. The strongest alternative is the ID alone (`Decisions/B-3akjw.md`). A typed `[[B-3akjw]]` then links, which suits agents writing notes, and links between decision notes need no other card's title. But the file list and GitHub show bare IDs, and the title appears only inside the note and the table. The crux: will people and agents link decision notes by typing the card ID, or find them by name? The answer applies to rule notes too.

### Frontmatter

Flat, like the rest of the vault: strings, and lists of strings. The vault's own keys come first, then the decision's.

| Key | Value |
|---|---|
| `type` | `decision` |
| `status` | `active` (the card is resolved), `superseded`, `reopened` or `withdrawn` (§4) |
| `authority` | `log`: each note is a row of the Decision Log, made a note |
| `livedocs` | `snapshot` (§6) |
| `summary` | "<title>: <answer> (<card ID>)." |
| `created`, `updated` | the date of the first answer, and of the latest change |
| `tags` | `[baesian, decision]` |
| `aliases` | `[<card ID>]` |
| `card`, `revision` | the card ID, and the revision answered |
| `title`, `question` | the answered revision's |
| `answer`, `response` | what was decided, in the card's words or yours; `accept`, `alternative` or `correction` |
| not_chosen | the card's options that weren't chosen: one, or two for a `correction` |
| `answered`, answered_by | the verdict's time and reviewer. The time is an ISO timestamp kept as text, so the table sorts by it either way |
| `topic`, `deck`, `level`, `reverse`, `touches` | as on the card |
| `filed`, filed_by, `branch` | the card's creation time, agent and branch |
| depends_on, `supersedes`, superseded_by | wikilinks to those decisions' notes |

Left out on purpose: anything that differs by branch or by clone. That means no commits, ledger entries, attachments or waiting agents. The client shows those. In a note they'd make two branches' copies differ, and the merge conflicts D43 avoids would come back.

### Body

The order follows the client's reveal: the question, what was decided, then the rest. For this repo's B-3akjw (D109), it would read:

```markdown
# How an answer becomes a rule

When you mark an answer as a rule, who writes the rule, and what does it cover?

**Decided:** the agent drafts it for you to confirm. Then the agent later files a card with the
rule's wording and the gate facts it covers; the rule exists once you accept it.

**Not chosen:** you write it as you answer (the agent's pick). Then the toggle opens a line
prefilled with the decision; …

**It turned on:** must a new rule let matching commits through the gate, without a card, from the
day it's made? If it must, the agent drafts it. If that can wait, you write it.
**The fact given:** a rule's gate patterns are the gate's fact IDs, such as dep:pytest-*. …
**Comment:** "I think users will not want to provision the time to write out a sufficient rule."
**The agent's case:** a rule is yours, and the moment you decide is when you know what you mean by it. …

Answered by Gus Ellerm on 2026-11-01, through Baesian (card B-3akjw, revision 1). Filed by
claude-code on main, in the deck finishing-m4. Context: [[…the deck's context notes…]].
The record is in .baesian/cards/B-3akjw/. To change this decision, answer the card again or file
one that supersedes it: editing this note changes nothing.

## Background

(the card's body, as the agent wrote it)
```

Lines appear only when their field is set: the fact, the comment, the agent's case, and a line for first_choice when you switched after the reveal (D88).

## 3. The rule note

`<vault>/Rules/<rule ID> <first words>.md`: the rule's first words, cut at a word boundary to 60 characters, cleaned as above.

- **Frontmatter:** `type: rule`; `status: active` or `retired`; `authority: specifies`, since a rule is in force until it's retired; `livedocs: snapshot`; `summary`, the rule's first sentence; `created`, `updated`, `tags: [baesian, rule]`, `aliases`; then `rule`, `topic`, `covers`, from_card (a wikilink to the decision note), accepted_by and `accepted`; and once retired, `retired`, retired_by and retired_on (a wikilink to the card it was retired on).
- **Body:** the rule as accepted; the decision it was made from; who accepted it and when; and the gate facts it acknowledges without a card ("`dep:pytest-*`"). It ends by saying that editing the note changes no rule (§7).

### A gap to close first

Rule notes are rendered from the rules the branch's record holds. Today a rule, and its retirement, reach only the record of the worktree the server runs in: `Store.saveRule` copies the rule into that store's own record, and `Store.syncRecord` copies only cards, verdicts and ledger entries.

As I read `checkCommit` and `evaluate`, CI checks each commit against the rules in that commit's own record. So a fact a rule covers passes the local gate, which reads the live layer, but could fail in CI on a branch whose record lacks the rule. No test covers it yet.

M6 would have the pre-commit hook copy every rule and retirement into the record, as [[File Formats]] already says the record holds them. The test for it comes first, since it matters without a vault too.

*Since fixed (2026-11-03):* `Store.syncRecord` now copies every rule, retirement and topic alias into the branch's record, with a test that a rule saved in another worktree covers its fact in this branch's record.

## 4. When a decision changes

After a note is written, its card can change in four ways. Each changes the note's frontmatter and adds one dated section at the end. Nothing already in the body is rewritten.

| What happened | Frontmatter | Section added |
|---|---|---|
| **Superseded:** a card that `supersedes` it resolved, or a conflict card chose the other side (D35) | `status: superseded`, superseded_by | `## Superseded on <date>`, linking the new decision and its answer |
| **Answer changed** (D81): a later answer chose something else | `answer`, `response`, not_chosen, `answered`, answered_by | `## Changed on <date>`: now this, was that, and the comment |
| **Reopened:** a later answer sent it back (a question, more context, see it run, defer, not my area) | `status: reopened` | `## Reopened on <date>`, with the response and comment |
| **Withdrawn** after it was resolved, or its parent was rejected (D14) | `status: withdrawn` | `## Withdrawn on <date>`, and the reason |

A rule note has one change: **retired** (D119), with `status: retired` and a `## Retired on <date>` section linking the card it was retired on.

- **Deterministic.** The sections are rendered from the record, in order. A note written today is the same bytes as one written last week and extended since. So two branches that extended a note the same way merge cleanly.
- **A real conflict stays one.** Two branches that superseded one decision differently conflict at merge, as D43 expects.
- **A conflict that isn't real resolves itself.** If one branch wrote a note before an answer changed, and another wrote it after, git sees two different additions. Take either side: the commit that resolves the merge runs the adapter, which adds whatever section is missing.
- **Hand edits survive.** Keys the adapter doesn't own are kept, and text a person added stays where they put it.

This widens D43's "one edit" from superseding to the four changes above. D81, D14 and D119 came after D43, and each changes what a note should say.

**For the user (card vault-3): how a written note changes.** Recommended: frontmatter and a dated section, as above. The note stays a record of what was decided and when, like the hand-written log, and nothing a person adds is lost. The strongest alternative is to rewrite the whole note from the record at each change. It then always reads as the decision stands now, with its history only in git, and anything a person added to it is lost at the next change. The crux: will people add their own writing to decision and rule notes?

## 5. The Decision Log's query, and enabling Bases

### The block

`baesian init --vault` inserts one section into the vault's `Decision Log.md`, before its first second-level heading, when the note exists and doesn't already hold the query. Otherwise it prints the section to paste. It never rewrites it after that.

````markdown
## Decided through Baesian

One note per decision in `Decisions/`, and per rule in `Rules/`, written by Baesian from the record.

```base
filters:
  or:
    - file.inFolder("Decisions")
    - file.inFolder("Rules")
properties:
  note.answer:
    displayName: Decided
  note.answered:
    displayName: Answered
  note.covers:
    displayName: Gate facts
views:
  - type: table
    name: Decisions in force
    filters:
      and:
        - 'note.type == "decision"'
        - 'note.status == "active"'
    order:
      - file.name
      - note.answer
      - note.answered
      - note.topic
    sort:
      - property: note.answered
        direction: DESC
  - type: table
    name: Rules in force
    filters:
      and:
        - 'note.type == "rule"'
        - 'note.status == "active"'
    order:
      - file.name
      - note.summary
      - note.covers
      - note.accepted
    sort:
      - property: note.accepted
        direction: DESC
  - type: table
    name: Everything
    order:
      - file.name
      - note.type
      - note.status
      - note.answer
      - note.updated
    sort:
      - property: note.updated
        direction: DESC
```
````

- **The embed shows its first view,** so "Decisions in force" shows by default. The other two are a click away.
- **The type filters** keep out anything else in those folders, such as a folder note.
- **The rules need no link each.** The design has the Working Agreement link to each rule note. With the "Rules in force" view, one link to the Decision Log does it. `init` doesn't edit a Working Agreement. In this repo, that edit goes through a card (§10).

### What I checked

Through Context7 (`/websites/obsidian_md_help`, the official Obsidian help, on 2026-11-03):
- a `base` code block embeds a base in a note, and `![[File.base]]` embeds a `.base` file ("Create a base", "Views");
- filters take `and`, `or` and `not`; file.inFolder() includes subfolders; frontmatter keys are `note.<key>` ("Bases syntax", "Functions");
- a view has `type: table`, `name`, `filters`, `order` and `groupBy`, and `properties` sets each column's `displayName`; tables need Obsidian 1.9 or later ("Views");
- when a base is embedded, `this` is the note that embeds it;
- an alias makes the link picker write `[[name|alias]]`, rather than resolving a typed `[[alias]]` ("Aliases").

Not in the syntax page: the `sort` key. Its form (`property` and `direction`) comes from a working base in another of the user's vaults (globus-cluster-docs, `Changes/All changes.base`). It stays *unverified* until the block is opened in Obsidian. Obsidian 1.12.7 is installed on this machine.

### Enabling Bases

Bases is a core plugin with the ID `bases`. That ID is taken from the `core-plugins.json` of 13 of the user's other vaults. This vault's file, written by `livedocs new-vault`, doesn't mention it. `init --vault` would:
- **set `"bases": true`** when `<vault>/.obsidian/core-plugins.json` exists in its object form, keeping the other keys and their order, as two-space JSON the way Obsidian writes it;
- **add `"bases"`** when the file is in the older list form;
- **do nothing, and say so,** when the vault has no `.obsidian/`. Creating that folder would give Obsidian settings nobody chose.

The Working Agreement says to leave `.obsidian/` alone unless you mean to change it; running `init --vault` is meaning to. *Unverified:* whether Obsidian 1.12 turns Bases on in a vault whose file doesn't mention it. Setting the key makes it certain.

**For the user (no card): a code block or a `.base` file.** Recommended: the code block in the Decision Log, as D43 has it. The alternative is a `.base` file Baesian owns, embedded with one line, `![[Decisions.base]]`. The log then holds one line instead of about 50 lines of YAML, and the base opens as a page of its own. But GitHub shows that line as bare text, where it now shows the query.

## 6. livedocs

- **Each note is a snapshot by its own frontmatter.** livedocs 0.2 treats a note as a snapshot if its frontmatter has `livedocs: snapshot`, or if a snapshot_globs entry in its config matches the note's path. A snapshot binds nothing and never blocks. This vault already uses both: globs for `Sessions/` and `Templates/`, and the flag on the Decision Log and the research notes.
- **They're stamped by the commit that adds them.** The committed pre-commit hook runs Baesian's block before livedocs' (D54). So the notes Baesian writes and stages are in the index when livedocs stamps the staged notes.
- **Each stamp adds a line** to the vault's `stamps.jsonl`, as any new note does. *To check:* how two branches' added stamp lines merge. It's livedocs' question, and true of every note today, but the adapter makes it more common.
- **Code names in a card's body are copied into its note.** As a snapshot, the note binds none of them.

**For the user (card vault-6): how notes are kept out of livedocs' checks.** Recommended: the flag in each note. Baesian never edits livedocs' config, and the flag is inert in a vault without livedocs. It also leaves the design's open question on decision drift open note by note: a hard decision could one day be written without the flag. The strongest alternative is the design's own: `init --vault` adds `Decisions/*` and `Rules/*` to livedocs' snapshot_globs. Notes stay a line shorter, but checking any one decision note against the code would mean moving it or narrowing the globs. The crux: might you want livedocs to check some decision notes against the code later?

## 7. Reading rules and routing from the vault

The design says the adapter "reads routing rules and conventions from the vault's `specifies` notes (by default the Working Agreement and Code Conventions) and its `Rules/` notes". Since then, three decisions have narrowed what may count as a rule or a routing setting:
- a rule is saved only when you accept a draft in the client (D110);
- v1's gate routes on rules over each card's stated facts, deterministically (D145);
- a repo's preferences are files only the client writes (D147).

A Working Agreement is prose, so the gate can't read it deterministically. A rule note is a file anyone can commit, agents included. If the gate read it, its `covers` patterns would acknowledge gate facts with no card (D24).

So the proposal reads the vault in one direction only, as guidance:
- **The gate's rules come only from the store** (`Store.rules`). Rule notes are their view. A rule note edited or added by hand changes nothing, and the note says so.
- **Agents are pointed to the routing notes.** With a vault configured, the `AGENTS.md` block (`writeAgentsBlock`) gains one sentence naming them: by default `Working Agreement.md` and `Code Conventions.md` at the vault's root, whichever exist, and the `Rules/` folder. Agents read them when deciding whether to file. The plugin's skill says the same.
- **Filing doesn't parse them.** A routing setting the gate obeys belongs in the repo's preferences (P14), which only the client writes.

This changes the design's text: "reads routing rules" becomes "points agents to them".

**For the user (card vault-4): whether vault notes can make rules.** Recommended: only rules accepted in the client count, as above. The strongest alternative: a note in `Rules/` with `covers` patterns counts as a rule. You could then write a rule in Obsidian, but so could anyone who commits, agents included. The crux: should a note committed to the repo be able to change what the gate lets through, without an answer in the client? The card touches security, so filing makes it hard (D144).

## 8. Links both ways

### From decks to the vault

- **context_notes (`DeckMeta`) hold wikilinks,** set by `baesian deck --note`.
- **The server resolves each one as Obsidian does.** `[[Name]]` matches a note by file name anywhere in the vault, the shortest path if several match. `[[Folder/Name]]` matches by path. A `#heading` or `|text` part is kept for display.
- **The client shows each note's `summary:` line** with the deck's briefing, as the design says. `ApiState` gains, for each link, the resolved path and its summary, or that the note is missing.
- **Without a vault,** the links show as plain text.

### From the vault to cards

- **In the client:** a card ID in any text the client shows from the vault becomes a link to that card. The server can also find the hand-written notes that mention a card's ID, and the client can list them with the card's context ("Mentioned in [[Hosted Service]]"). IDs are random and prefixed, so a match is reliable enough for D71. That list is optional for M6, and a matter for the client's design.
- **In Obsidian:** each decision note's alias is its ID, so typing the ID in a link finds it, and plain mentions show as unlinked mentions. Decision notes link to each other (depends_on, `supersedes`, superseded_by) and to their deck's context notes. So in the graph, they sit beside the design they came from.
- **Not linked: commits.** They differ by branch (§2), so the client shows them, as today.

## 9. Without Obsidian, or without a vault

- **No vault configured:** nothing changes. No notes, no edits, no reading (D8).
- **A vault, but no Obsidian:** notes are still written. They're plain Markdown, and GitHub shows their frontmatter as a table. The `base` block shows as a YAML code block, which still says what it lists. `init` leaves a missing `.obsidian/` alone. The snapshot flag is inert without livedocs.
- **The vault folder is gone,** renamed or deleted: the pre-commit hook warns and writes nothing, but doesn't block the commit. `baesian verify` repeats the warning.

## 10. This repo's Decision Log

The log is hand-written: 155 D-rows, the P-rows, and the agent-decision bullets. 33 of the D-rows came from cards: D109–D116, D118–D122, D133–D151 and D153. 28 of them cite the card's ID; D118–D122 say only "decision card". They match the 33 resolved cards in this repo's record. The log already says: "This vault uses D-numbers for the user's decisions and P-numbers for proposals until Baesian can run its own decisions (D21). After that, decisions carry card IDs (D18, D19)."

When M6 lands:
1. **`baesian init --vault docs/vault`** records the vault, turns Bases on, and inserts the query section above "Accepted (user)". (Today `Store.init` writes the config only when it doesn't exist, so in an already set-up repo, `init` ignores `--vault`. M6 fixes that.)
2. **The next commit writes 33 decision notes,** one per resolved card in the record. Each matches a D-row. The notes can't name their D-numbers, since the record doesn't know them, but each D-row cites its card, so the link runs one way.
3. **The paragraph on D-numbers is updated by hand,** to say that decisions made on cards are notes from then on.

**For the user (card vault-5): numbered rows for decisions made on cards.** Recommended: no new D-row for a card decision. It's listed by the query and cited by its card ID. It's what the log already says will happen, and one record per decision can't disagree with itself. D-numbers carry on for decisions made in conversation, which have no card; P-numbers for proposals; and the agent-decision bullets as they are. The strongest alternative: a D-row for every decision, cards included. D-numbers then stay one sequence that every note can cite, but each card decision is written twice, in two places that can disagree. The crux, a preference: do you want every decision in one numbered list, or is a card ID enough for those made on cards?

Also considered: moving all 155 rows into notes, so the log is only a query. It would make the conversation decisions into notes written by hand in a format Baesian generates, and it would move history that many notes cite by D-number. Not recommended.

Either way, two edits to the Working Agreement follow, and it changes only through a decision card (D22). Its session protocol says to log every decision in the Decision Log; for card decisions, the notes would do that. And it would gain one line pointing to the rules, in the Decision Log's "Rules in force". Both would go with card vault-5's answer.

## 11. What changes in the code and the formats

Names that don't exist yet are in plain text.
- **A vault module,** src/vault.ts: rendering decision and rule notes from a record, their names, finding a note by ID, the changes in §4, the `base` section, enabling Bases, and resolving wikilinks.
- **The pre-commit hook** (`runHook`): after `Store.syncRecord`, it writes and stages the notes, and lists them for `unstageOurs`.
- ~~**`Store.syncRecord`** also copies rules and retirements (§3).~~ Done, with topic aliases.
- **`baesian sync`** writes notes too, and says which.
- **`baesian init --vault`** records the vault in an existing config; turns Bases on; inserts the Decision Log's section; and adds the vault sentence to the `AGENTS.md` block.
- **`baesian verify`** warns when a resolved card in the record has no note, or the vault is missing. A warning, not a failure, since the notes are a view.
- **The server** resolves context_notes, and can find mentions of card IDs.
- **[[File Formats]]** gains two files, the decision note and the rule note: written by Baesian, and changed only as §4 says.
- **No new config key, and no new dependency.** `yaml` already reads frontmatter (D49).

## 12. Tests

Vitest, against real temporary git repos and linked worktrees, like the rest of the suite.
- **Rendering:** a resolved card gives the expected path, frontmatter and body, for each response (`accept`, `alternative`, `correction`); a conflict card; no decision note for a rule draft.
- **Names:** removed characters; the 80-character cut; the first revision's title kept after a retitle; a note renamed by hand isn't duplicated.
- **Determinism:** two worktrees on two branches, holding one card, write byte-identical notes, and `git merge` of the two is clean. A note written fresh after an answer change equals one written before it and extended.
- **The hook:** pre-commit writes and stages notes for newly resolved cards. A commit the gate blocks unstages them (D122). Nothing is written without `vault`. A missing vault warns and doesn't block. The first commit writes every missing note once; the next writes nothing.
- **Changes:** superseded, changed, reopened, withdrawn and retired, each idempotent. Text added by hand in the middle of a note survives. Two branches superseding one decision differently do conflict at merge, and taking either side of a stale-note conflict ends in the right note.
- **Rules reach every record:** a rule accepted while the server runs in another worktree reaches this branch's record at its next commit, and `baesian verify` then acknowledges what it covers. This tests the gap in §3, first and without a vault.
- **`init --vault`:** an existing config gains `vault`; Bases is turned on in both forms of `core-plugins.json`, keeping the other keys; no `.obsidian/` is created; the Decision Log's section is inserted once, or printed when there's no log.
- **Links:** resolving wikilinks (by name, by path, with a heading, with display text, missing, two notes with one name); the summary line in `ApiState`; mentions found in hand-written notes, and not in generated ones.
- **livedocs, when it's on PATH** (skipped otherwise, like M3a's smoke test): a commit carrying generated notes passes the livedocs gate, and they're stamped as snapshots.
- **By hand, once:** open this vault in Obsidian 1.12. Check that Bases is on, and that the query renders its three views, sorted. That's the check for the `sort` key.
- **Dogfooding:** this repo's 33 notes, and the decisions after them.

## Decisions for the user

Filed as cards in deck vault-adapter on 2026-11-03.

| Card | The question | Recommended | Strongest alternative |
|---|---|---|---|
| vault-1, B-ypdgz: **D170** | When are notes written? | in pre-commit and `baesian sync`, from the record | a command someone runs |
| vault-2, B-1j3yf: **D171** | How are notes named? | card ID and title | card ID alone |
| vault-3, B-s480j: **D172** | How does a written note change? | frontmatter, and a dated section added | rewritten from the record |
| vault-4, B-qg3jx: **D173** | Can vault notes make rules? | no: only the client's rules count | a `Rules/` note with `covers` is a rule |
| vault-5, B-s3v3x: **D174** | Do card decisions still get D-rows here? | no: notes and card IDs | a D-row for every decision |
| vault-6, B-1t7fw: **D175** | How are notes kept out of livedocs' checks? | a flag in each note | snapshot globs in livedocs' config |
| (no card) | Where does the query live? | a `base` code block in the Decision Log | a `.base` file, embedded |

The rest is the agent's to decide while building, and will be logged as agent decisions: the exact sanitising, the section wording, the column choice, and the order of the frontmatter keys.

## As built (M6, 2026-11-03)

M6 builds this proposal in `src/vault.ts` ([[src-vault]]); the formats are in [[File Formats#Vault notes (M6)]]. Where the build goes beyond the text above, or differs from it:
- **One more section, `Answered again`,** for a decision reopened and then resolved with the same answer, so the note doesn't say "reopened" with nothing after it. A reopening also comes from the agent's one reply (D89) and from the card it builds on being decided otherwise (D80), besides an answer that sends it back.
- **Sections are found by their heading,** so a person may edit the text under one without Baesian adding it again. A missing section goes in its place among those already there, or at the end.
- **The pre-commit hook leaves a note with someone's unstaged edit as it is,** and says so, since staging it would commit their unfinished edit. A note whose only unstaged change is Baesian's own (after a blocked commit, or `baesian sync`) is staged as usual.
- **A rule note's body names the card it came from by ID,** not as a link: every branch's record holds the rule, but not always that card, and the body must be the same bytes everywhere. Its frontmatter links it.
- **Frontmatter links** go only to cards that have a note, or are the bare ID; body links are built from the card's first revision, as names are.
- **`init --vault`** also refuses a vault outside the repo, leaves a vault with `.obsidian/` but no `core-plugins.json` alone, and writes no notes: the next commit, or `baesian sync`, does.
- **Not built:** finding hand-written mentions of card IDs (§8, optional).
- **Still to check by hand:** the query's three views in Obsidian 1.12, and their `sort` key (§5).
