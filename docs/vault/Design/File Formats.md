---
type: design
status: active
authority: specifies
summary: "Baesian's file formats (accepted as D124): card revisions (with the M4 card content: question, trigger, two options, crux, facets; a choice answered in chat, marked seen, B-hswmx), verdicts, withdrawals, ledger entries, decks, rules, topic aliases, attachments, waiting markers and config; preference files, with what the commit gate looks at (B-qkek1), and gate records (M8); the hosted service's proof (M9a): the account field, OpenSSH signature files, passkey proofs, the trust files and the project line CI pins beside them (B-mar8x); the relay's entry (M9b); the accounts database's tables (M9c); relay.json and the machine's grant (M9d); merges, found by the hooks (D181), with the tip that landed and the commits they brought (B-w41p7); the default branch the CLI sends the relay (B-jr8mk); personal mode's config and before-linking snapshot (B-4rwyz); where each lives, which are immutable, and the format number every file carries (D156, D157). Defined in src/schema.ts."
created: 2026-10-23
updated: 2026-11-05
reviewed: 2026-10-23
tags: [baesian, design, formats]
---

# File Formats

> **Status: accepted (D124, 2026-11-02).** These formats are implemented as described here, and the user has accepted them: the card revision and verdict tables and the open points D105–D107 (2026-11-01), then the open points found in the other files, D119–D121, and the rest of the other files (2026-11-02). Compatibility between Baesian versions isn't a concern until a v1 is published (D108), so these formats stay free to change until then. Every file now carries a format number (D156, D157, 2026-11-03), so from v1 a change to one is a new format, with an upgrade from the one before. A review of them, for git workflows and for what the record exposes, comes just before publishing.

The definitions are the Zod schemas in `src/schema.ts`. This note describes them for people, and livedocs binds it to them: a change to a schema blocks the commit until this note is reconciled.

## Rules that apply to every file

- **A format number (D156).** Every file Baesian writes carries `format`, an integer from 1, right after `type` in JSON and in frontmatter (first, in the config, which has no `type`). It's numbered per kind of file: a card format 2 would leave verdicts at 1. v1 writes `format: 1` everywhere. In `Config`, `UserConfig` and a card draft (`CardDraft`), which people write by hand, it's optional; a draft's `format` is the draft's own, and Baesian sets the revision's. The kinds and their formats are in one table, `FILE_KINDS`; `newestFormat()` gives the newest Baesian reads, and `writtenFormat()` the one it writes (below).
- **Reading a format (D156, D157).** `upgradeFile()` brings a file's fields to the newest format of its kind, in memory, before its schema checks them; a file is never rewritten for it. Files are written once, and CI checks each commit against its own record (`checkCommit()`), so an old commit's files must stay readable as they are.
- **Writing a new format: the old one for a release (B-4p43b).** A format after a kind's first is an entry in its kind's `formats` (`LaterFormat`): `since`, the release that first reads it; `up`, the upgrade to it; and `down`, the way back. The release that adds it reads it and still writes the format before; the releases after it write it. Every writer writes through **`asWritten()`**, which takes the fields, made and checked in the newest format, back to **`writtenFormat()`**, the newest format a release before this one reads; so a teammate, a machine or CI one release behind is never given a file it refuses, and the entry is the whole of a kind's rollout. `newestFormat()` is what this Baesian reads, and its schemas check. The release is `VERSION`, in src/version.ts, which `npm version` sets from package.json. The relay serves no CLI too old to read what's written (`minimumRelease()`, [[#The relay (M9b)]]). The plugin's hooks, plain JavaScript, write the session's model by hand, in the format this release writes, which a test holds them to. No kind has a format 2 yet.
  - **No `format`:** the file was written before v1, and reads as format 1. That changes nothing, except that an inbox cursor gains the `type` it lacked. So `baesian verify` passes over a commit whose record predates the field.
  - **An older format:** each later format comes with one upgrade function in its kind's entry, applied in turn. There are none yet.
  - **A newer format** than this Baesian reads is refused, with `NewerFormat`: "cards/B-7f3kq/r1.md has card format 2; this Baesian reads up to 1: upgrade Baesian". It's refused as a bad file is. Inside a view that reports problems (the server's snapshot) it's reported and skipped; elsewhere it throws, so the CLI and `baesian verify` stop with the message. Where an unreadable file already means "unknown" (presence, the server file, the last port), one in a newer format is ignored too.
  - **Schemas stay strict otherwise.** A `format` that isn't a whole number from 1, or an unknown key, fails the schema as before.
  - **Mutable files** (the cursors, presence, waiting markers, the server file and the last port) are written in the newest format the next time they're written.
- **Immutable.** Every file except the config files, the inbox cursors, the presence heartbeat, the waiting markers and the server file is written once and never edited (D34). The store writes each whole to a temporary file and links it into place, which fails if it exists, so a second write fails and no reader sees half a file. Status is computed from the files, never stored.
- **Flat.** Frontmatter and JSON have no nested objects. Lists of strings are fine. Empty lists and unset fields are left out when writing, except a preference file's empty `gate_schema` or `gate_infra`, which means the gate looks for none (B-qkek1).
- **IDs.** Cards are `B-` plus five Crockford base32 characters (`B-7f3kq`), and rules are `R-` plus five. The alphabet is lowercase and has no `i`, `l`, `o` or `u` (D51). A new ID is checked against the live layer and retried on collision (`newId`).
- **Two layers (D34).** Everything is written to the live layer, `.git/baesian/`. The record, `.baesian/` in the worktree, receives copies of the files for the cards the branch filed or attached to (D37).

## Files

| File | Schema | Live | Record | Written by |
|---|---|---|---|---|
| `cards/<id>/r<n>.md` | `CardMeta` + body | yes | yes | `baesian file`, `baesian revise` |
| `cards/<id>/withdrawn.json` | `Withdrawal` | yes | yes | `baesian withdraw` |
| `cards/<id>/fallback-<suffix>.json` | `Fallback` | yes | yes | `baesian wait`, on a blocking card with no verdict (D46) |
| `cards/<id>/gate-r<n>-cli.json` | `GateRecord` | yes | yes | the gate, at filing: `Store.fileCard`, `Store.reviseCard`, `Store.replyToCard`, `Store.draftRule` (M8; [[#Routing]]) |
| `preferences/<at>-<suffix>.json` | `Preferences` | yes | yes, in every branch's record on sync, as rules | the client only (D147), through the local server, or by accepting a slider proposal |
| `verdicts/<at>-<id>-r<n>-<suffix>.json` | `Verdict` | yes | on sync | the client only (D32); named timestamp first, so a listing is in order (D107) |
| `ledger/<id>-<suffix>.md` | `LedgerMeta` + body | yes | on sync | the git gate (M3) |
| `merges/<commit>-<key>.json` | `MergeEvent` | yes | no | the hooks, when a branch is merged (D181); a later fast-forward of it, as another (B-w41p7) |
| `default-branch.json` | `DefaultBranch` | on the relay only (mutable) | no | the CLI, sending it at a sync when git's answer changed (B-jr8mk) |
| `decks/<deck>.md` | `DeckMeta` + body | yes | yes, with its cards | `baesian deck`; the branch deck on first use |
| `rules/<id>.md` | `RuleMeta` + body | yes | yes, at once in the client's worktree, and on sync in every other | the client (M4) |
| `rules/<id>-retired.json` | `RuleRetirement` | yes | yes, as rules | the client, with an answer that breaks the rule (D119) |
| `topics/alias-<suffix>.json` | `TopicAlias` | yes | yes, as rules | the client (M4) |
| `attachments/<id>-<suffix>.json` | `Attachment` | yes | no | `baesian attach` |
| `cursors/<branch>.json` | `Cursor` (`at`, and `delivered`: what `wait` has delivered since) | yes (mutable) | no | `baesian inbox`, and `baesian wait` |
| `cursors/<branch>/<session>.json` | `Cursor` (`at`): one session's own place in the branch's inbox (B-ghhym, provisional) | yes (mutable) | no | `baesian inbox --session`, run by the plugin's hooks |
| `models/<session>.json` | `SessionModel` (`model`, `at`): the model a harness session runs on, as the harness last named it to the plugin's hooks (B-k0w7d); `<session>` is the session's ID as `slug()` makes it (`modelPath()`) | yes (mutable, replaced whole) | no | the plugin's hooks, directly (`noteModel()` in `plugins/baesian/hooks/baesian.mjs`): at `SessionStart` when Claude Code names the model, at `PostModelSwitch`, and in Codex at every hook that runs `new-verdicts.mjs`; read by `baesian file` and the MCP server's filing tools |
| `presence.json` | `Presence` | yes (mutable) | no | the client's heartbeat (D41) |
| `waiting/<id>-<suffix>.json` | `Waiting` | yes (mutable) | no | `baesian wait`, while it waits (D90) |
| `server.json` | `ServerInfo` | yes (mutable, readable only by the user) | no | `baesian serve`, while it runs (D97) |
| `port.json` | `LastPort` | yes (mutable) | no | `baesian serve`, kept after it stops (D103) |
| `config.json` | `Config` | in personal mode only, in place of the record's (B-4rwyz; mutable) | yes (mutable), except in personal mode | `baesian init`; `baesian login` links the repo (M9d) |
| `~/.config/baesian/config.json` | `UserConfig` | — | — | the user; never in a repo |
| `relay.json` | `RelayState` | yes (mutable) | no | the CLI, whenever it syncs with the relay (M9d; [[#The CLI's side of the relay (M9d)]]) |
| `before-linking.json` | `BeforeLinkingSnapshot` | yes, in personal mode (mutable) | no | `baesian login`, when it links a personal clone ([[#Personal mode (B-4rwyz)]]) |
| `~/.config/baesian/grants/<project>.json` | `MachineGrant` | — | — | `baesian login`, at each refresh, and `baesian logout` removes it; readable only by the user (B-gq8j1); never in a repo |
| `<file>.sig` | OpenSSH's signature format (D160) | yes | yes, with its file | the hosted service, beside each file a person writes ([[#The hosted service's proof (M9a)]]) |
| `verdicts/<name>.passkey.json`, `preferences/<name>.passkey.json` | `PasskeyProof` | yes | yes, with its file | the hosted service, from the browser's assertion (D139, D163) |
| `trust/service-<key>.json`, `trust/service-<key>-revoked.json` | `ServiceKey`, `ServiceKeyRevocation` | yes | yes, in every branch's record on sync | the CLI, from the service (M9d); pinned in CI too (D142) |
| `trust/passkey-<suffix>.json` | `PasskeyKey`, with a `.sig` | yes | yes, as the service's keys | the service, when you enrol a passkey; pinned in CI by hand (D159) |

## Card revision

A card is a directory of revisions. Each revision is a whole card: the agent's reply to a returned card is a new revision, not an edit.

The fields below come from the decisions about card content (D66, D73–D79, D92–D95). Frontmatter stays flat, so the crux and the facets are prefixed keys rather than nested objects.

Frontmatter (`CardMeta`):

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `card` | | |
| `format` | integer ≥ 1 | | the card format, 1 (D156); filled in by Baesian |
| `id`, `revision` | card ID, integer ≥ 1 | | filled in by Baesian |
| `title` | string | yes | a neutral short name, not a question ("Where the access token lives"). A settled decision is shown as its title plus its outcome |
| `question` | string | yes | the decision, as a neutral question |
| `doing` | string | yes | one short line, in the agent's voice, on what it was doing when the decision came up (D73) |
| `topic` | slash-separated key | yes (D66) | `storage/run-metadata`; canonicalised through aliases (D38, D44). It names one question (D112): a second card on it is a possible duplicate, the earlier answer is its precedent, and two branches answering it differently conflict at merge. A follow-on question gets its own, narrower topic |
| `deck` | deck ID | | defaults to the branch deck, `branch-<branch>` (D29) |
| `level` | `provisional` \| `blocking` \| `hard` | | the level in force, set by the gate at filing (M8): a shown card's level, the level the draft asked for raised by its row; a held card's `provisional`, since its agent goes ahead. A draft's `level` is what the agent asks for, and is kept in the gate record. With no preference file, `hard` when `touches` includes `publishes`, `security`, `privacy`, `money` or `data-loss` (D42, D144; privacy since card B-z3agk), otherwise the level asked for or `provisional`, as before the gate |
| `touches` | list of facts | | the D11 checklist: `schema`, `public-api`, `dependency`, `infra`, `user-facing`, `publishes`, `security`, `privacy` (personal data, split from security by card B-z3agk), `money`, `data-loss`. Also decides which gate facts a `Baesian-Card:` trailer covers (D53) |
| `reverse` | `cheap` \| `moderate` \| `one-way` | yes (D95) | how costly the decision is to undo. It decides the stakes line and feeds rarity |
| `proposal`, `proposal_then` | strings | yes | the agent's pick, named in a few words, and what happens if it's chosen, read after "then" (B-b0dzp) |
| `alternative`, `alternative_then` | strings | yes | the strongest alternative (D12, D93), and what happens if it's chosen, read after "then" |
| `also_considered` | list | | other options the agent considered, by name; not shown on the card (D93) |
| `crux` | string | yes | the one question the choice turns on (D74) |
| `crux_proposal`, `crux_alternative` | strings | yes | the answer that leads to each option ("If it does", "If it doesn't") |
| `crux_preference` | boolean | | the crux is about what the reviewer values, not a fact |
| `crux_fact` | string | | a fact that bears on the crux |
| `rationale` | string | | why the agent picks the proposal (D77) |
| `alternative_rationale` | string | | the agent's best case for the alternative, in its rationale's voice, as if the alternative were its pick (B-sy0kz). Never shown on the card itself, nor by `baesian show` or the decision's vault note: it's the case a practice card gives its planted pick when the card comes back with its options swapped ([[Practice Cards]], B-kb5yt), and only a card that carries one can come back. The template asks for it beside `rationale` (`CARD_FIELDS`). New in format 1, with no migration before v1 (D108) |
| `wrong_if`, `check` | strings | when a facet asks | what would show the pick is wrong, and where to look. Required when `reverse` is `one-way`, when `touches` includes `security` or `privacy`, or when `premise` is set (D77) |
| `premise`, `premise_option`, `premise_check` | string; `proposal` or `alternative`; string | all or none | a claim an option rests on that nobody has checked, which option, and the check (D75) |
| `acted`, `acted_option` | string; `proposal` or `alternative` | both or neither | what the agent has already built, and for which option (D75) |
| `serves` | string | | the criterion the agent's pick serves, for a preference crux (D75) |
| `rules` | list of rule IDs | | the rules the card bears on (D79) |
| `proposal_breaks`, `alternative_breaks` | lists of card or rule IDs | | the decisions or rules each option would replace or break, as the agent declares them; the client's path lights them |
| `modules_touched` | optional integer | | |
| `depends_on` | list of card IDs | | rejecting one of them withdraws this card (D14) |
| `supersedes` | optional card ID | | for arguing against a resolved decision; that decision becomes `superseded` once this card resolves |
| `conflict_of`, `caught_at` | optional | | conflict cards only: the decisions in conflict, and where it was caught (`filing`, `merge`, `late`; D45) |
| `answered_in_chat` | optional string | | a choice the reviewer already answered in conversation (B-hswmx): what they said, quoted and short. It marks the card **seen**: its pick, `proposal`, is their answer; the gate always shows it, as `source: chat`; the client shows what they said and the pick, nothing hidden, and confirms it with one tap; and every verdict on it is marked `seen`. It's in the record, and can become a rule and be matched by the gate, like any card; calibration leaves it out of every measure (`answeredInChat()`). Only a person resolves it, in the client (D32). A draft carries it; an agent sets it only when the reviewer has already answered |
| `reply` | optional string | | the agent's one reply to an answer that went against its pick (D89, D104): a fact or a check. Only `baesian reply` sets it, on a revision that is otherwise the one before; a draft can't carry it |
| `rule`, `rule_covers` | optional string; list of gate patterns | | a drafted rule (D16, D109, D110): its wording, and the gate facts it answers (`dep:pytest-*`, `schema:migrations/*`). A card that carries one asks you to make it a rule. Only `baesian rule` sets them, on a card that builds on the decision you asked a rule of; a draft can't carry them |
| `secret_reason` | optional string | | why a card that looks like it holds a secret was filed anyway (B-jfkv9). In a hosted repo filing refuses such a card without it; `baesian file --secret-reason` and the MCP tools' field set it |
| `convention` | optional `same-choice` \| `rule-words` | | a convention card (D161): which signal found the pattern. Only Baesian sets it; a draft can't carry it |
| `pref_row`, `pref_from`, `pref_to` | optional row; positions | all or none | a slider proposal (B-y6jn6): the row and the move. Only Baesian sets them; accepting the card writes a preference file |
| `confidence` | optional 0–1 | | recorded, not used for routing (D3) |
| `domain`, `evidence` | lists | | routing tags; links |
| `source_agent`, `source_branch`, `created` | | | filled in by Baesian. `source_agent` is free text, so it can name a persistent agent rather than the harness. The folder a card was filed from isn't recorded (D105) |
| `source_model` | optional string, at most 200 characters | | filled in by Baesian, never a draft (B-k0w7d): the model the revision's filer ran on, from its harness session's `models/<session>.json` (`Store.sessionModel`), by the session the harness gives the commands an agent runs (`modelSessions()`: `CLAUDE_CODE_SESSION_ID`; in Codex `CODEX_SESSION_ID`, then `CODEX_THREAD_ID`). Absent when the card was filed without the plugin, outside a harness session, or before the harness named a model. Each revision records its own filer's: a revision or a reply from a session with no model known has none, whatever the first had. A card filed again under a new ID at a sync keeps it. New in format 1, with no migration before v1 (D108) |

**Body:** optional Markdown context, shown with the agent's reasoning (D92). Nothing in it is checked.

What an agent writes is a **draft** (`CardDraft`): the same frontmatter without the fields Baesian fills in. `deck` and `level` are optional, and so is `format`, the draft's own format (1), which `baesian template` doesn't show and the MCP filing tool doesn't take.

**Filing** (`filingProblems()`, and the store's reference check) rejects:
- a missing required field;
- options that aren't really two: `proposal` and `alternative` the same, ignoring case and spacing;
- a crux that doesn't discriminate: `crux_proposal` and `crux_alternative` the same (D74);
- `wrong_if` or `check` missing when a facet asks for them (D77);
- a facet with only some of its fields (D75);
- IDs in `depends_on`, `rules` or the `_breaks` lists that don't exist;
- an `answered_in_chat` that is the alternative's name, ignoring case and spacing: a card answered in chat has the reviewer's answer as its pick (B-hswmx).

**Warnings** (`filingWarnings()`): no length limit has been measured yet, so long fields file anyway, with a note. The limits are 60 characters for the title and option names, 160 for the question, crux and `doing`, and 240 for a `then` and for `answered_in_chat`. An `answered_in_chat` that names the alternative, as whole words, and not the pick is asked about: "Not SQLite" names the option it turns down, so a program can't tell (B-hswmx). A field or the body that looks like it holds a secret also gets a note, since the record is committed with the code (B-vqn69): a private-key header, an AWS access key ID, a GitHub or Slack token, a JWT, a `token=`, `key=` or `secret=` query parameter with a long value, or an assignment like `api_key = <long value>`. The note names the field and what the text looks like, never the text, and the card files anyway. **In a hosted repo** (its config names a project), where a card goes to the service as it's filed, such a card is refused instead, and nothing is written, unless the draft gives `secret_reason` (B-jfkv9): the refusal names each field and the kind, never the text (`LooksLikeSecret`, found by `secretsIn()`).

**Conflict cards** are filed by Baesian itself, with no model (D65). They carry a fixed crux (D94): "Was the newer decision made with context the older one lacked?" "If it wasn't" keeps the base branch's decision; "if it was" keeps the branch's. Each option's `_breaks` names the decision it would replace.

## Verdict

One file per response (`Verdict`). There can be several per revision: "not my area" then another reviewer's answer, or a deferral then a decision. The file is named for its `at` first, in compact form (`20261101T093012.345Z-B-7f3kq-r1-x4k2m.json`, D107): a listing of `verdicts/` is in the order they were given. The store finds a card's verdicts by parsing the name.

| Field | Notes |
|---|---|
| `card`, `revision` | a verdict on an old revision is rejected as stale |
| `response` | `accept`, `alternative`, `correction` → resolved; `reject`, `question`, `need_context`, `see_it_run` → returned; `not_my_area` → rerouted; `defer` → deferred. `see_it_run` (D85) asks the agent for a demo, a screenshot or a running preview |
| `choice` | required for `alternative` and `correction` |
| `comment` | required for `question` and `defer`. A disagreement's optional reason (D87) goes here |
| `first_choice` | optional: `proposal` or `alternative`, the option chosen before the agent's pick was shown (D86, D88). Never with `seen` |
| `seen` | optional `true`: the revision it answers was answered in chat (`answered_in_chat`, B-hswmx), so the reviewer had seen the pick, their own answer, and there was no blind choice. The store sets it on every verdict on such a revision, whatever the client sends, and refuses one that gives `first_choice` there, or `seen` on any other; the client can't send it (`VERDICT_FIELDS`). Calibration leaves the card out |
| `make_rule` | the "make this a rule" toggle (D16) |
| `retire_rules` | optional: rules the chosen option breaks, retired with this answer (D119). Only on `accept` or `alternative`, and only rules that option's `_breaks` lists and that aren't retired yet |
| `should_have_asked` | optional: "you should have asked me" (D151, B-87tkc), only on a card the gate held back, or in shadow would have; it counts as a miss on the card's row |
| `reviewer`, `client`, `at` | `client` names the client that wrote it (D62). `at` is strictly increasing per card, so the latest verdict is unambiguous |
| `account` | optional: in a hosted repo, the stable ID of the account that answered (`AccountId`), beside its handle in `reviewer`; the hosted client's `client` is `hosted-desktop` or `hosted-phone` (M9a) |
| `project`, `card_digest` | optional: in a hosted repo, set by the relay: the project it was given in (`ProjectId`, B-tf9fc), and the SHA-256 of the card revision's file as the relay received it, in lowercase hex (B-f571v). [[#The hosted service's proof (M9a)]] says how they're checked |

## Practice entry (B-rehdw)

Your answers on practice cards, and the blind test that comes before them ([[Practice Cards]], B-kb5yt): `PracticeEntry`, kind `practice` in `FILE_KINDS`, format 1. Never a verdict, never in the record or the relay's log, and never read by anything an agent runs. In a clone that isn't linked, one JSON file each in the live layer's `practice/` (`PRACTICE_DIR`), named `<at, compact>-<8 hex>.json`, written once by `baesian serve` (`writePractice()`); on the hosted service, one row each of the project's practice table (`PracticeTable`). Either way written only through `practiceEntry()`, from what the client sends (`ApiPracticeInput`, `PRACTICE_FIELDS`). Never what you typed: only the kind of answer.

| Field | Notes |
|---|---|
| `type`, `format` | `practice`; 1 |
| `kind` | `test-start`: you started the blind test (B-xx49m), once. `answer`: your answer on a practice card. `mark`: in the blind test, your guess about a card you answered, practice or real, given on a card of its own after the answer (B-9prve) |
| `card`, `revision` | `answer`: the card the practice card was rebuilt from, and its revision; `mark`: the card guessed about, or for a practice card the one it was rebuilt from |
| `answered` | `answer`: when that card's final answer was given, for B-j583c's check |
| `blind` | `answer`, optional: your blind choice against the planted pick, `planted` or `other`; none for a written answer or "can't judge" |
| `final` | `answer`: `planted`, `other`, `write` or `pass` (a written answer, or "can't judge") |
| `test`, `mark`, `practice` | `answer`: `test`, `true` when it came in the blind test. `mark`: the guess, `no`, `maybe` or `sure` (`PracticeMark`, B-bb7ga), and `practice`, `true` when the card was a practice card, so a card answered in the test and rebuilt in it later keeps its two guesses apart |
| `reviewer`, `account`, `client`, `at` | set by the server: who (and on the hosted service their account), the client (`web`, `hosted-desktop` or `hosted-phone`), and when |

## The others

Each also has `type` and `format` (D156), not repeated below.

- **Withdrawal** (`Withdrawal`): `card`, `reason`, `by`, `at`. One per card.
- **Ledger entry** (`LedgerMeta`): `card`, `branch`, optional `commit`, `at`. One per card a commit cites. The body is one line naming the commit (D120), `ledgerBody()`: what the commit changed is git's to say, and its subject and message stay on the machine (D181). Entries written before D120 also list the commit's files. `branch` is the branch the commit was made on, a rebase's too, though HEAD is detached while it runs (D181). Since D181 an entry goes up to the relay, and comes down to the project's other machines, when its body is exactly that line (`isLedgerBody()`) and it names its commit; one listing files stays on the machine.
- **Merge** (`MergeEvent`, D181): `branch`, merged into `into`; `commit`, where it landed on `into`: the merge commit, the squash commit, or for a fast-forward the commit the branch moved to, in full; **`tip`** (B-w41p7), the commit that landed from `branch`'s side, in full: a merge commit's other parent, the commit a fast-forward or a rebase onto the branch moved to, the tip a squash squashed (for a squash or rebase made elsewhere, the branch's newest commit its change matched by patch ID); `at`, when, as git says it (a fast-forward found as it happens: then; one found later, in a pull, no earlier than its last commit, nor than the ledger's entries for its commits, which are written as each commit is made); `cards`, the IDs it brought, sorted (in shared mode the cards whose `source_branch` is `branch` that came into `into`'s record; where the record isn't committed, the cards its commits cite); **`commits`** (B-w41p7), the commits made on `branch` that cite cards which it brought, in full, oldest first, **checked against git's ancestry when it's written**: reachable from `tip` and not from `into` before it, kept to those the ledger says were made on `branch` (the live layer's entries, and in shared mode the record's at the new commit, for another machine's that haven't come down yet). A commit listed there is part of this merge whatever its time; so is `tip`, whose own ledger entry, where it wasn't known, is read from its trailers. Named `merges/<commit>-<key>.json`, `key` the first 12 hex digits of the SHA-256 of `branch` and `into` (`mergeFile()`, B-ttn2c, after the bug sweep of 2026-11-05 found a second merge of one branch at one commit, into another target, lost), so the same merge found on two machines is one file, two targets are two, and a branch's name never needs escaping; files written before keep their names (D108). **A later fast-forward of the same branch into the same target** is a merge of its own, at the commit it landed on, so it's another file: nothing is rewritten, and the relay takes it as any new file, keeping the first as it was. It's recorded when it brings a card or a commit citing one; one that brings neither isn't. Live only, written by the hooks (`Store.writeMerge`, [[src-gate#src/merges.ts: finding merges (D181)]]); it goes up to the relay and comes down to the project's other machines, and where two machines said the same merge differently, the relay's first copy stands. Never a commit's subject or message. Format 1 still: before v1 a format changes in place (D108), and its number moves only from v1 on (D156, D157). A merge recorded before B-w41p7 has no `tip` and reads with `commits` empty; nothing migrates it.
- **Default branch** (`DefaultBranch`, B-jr8mk): `branch`, the repo's default branch, a name as git allows one (`BranchName`), and nothing else. `default-branch.json`, which a machine sends the relay at a sync when what git says has changed since it last sent it (`RelayState.default_branch`); never written in a machine's own live layer, which reads git each time (`Store.defaultBranch`, `defaultBranch()` in `src/git.ts`: the remote's HEAD, else `init.defaultBranch` where that branch exists, else the branch the repo's first commit was made on, from its reflog), nor in the record. On the relay it's mutable state, replaced by the next one sent, never logged or signed, kept while the project is. The state carries it as `defaultBranch`.
- **Deck** (`DeckMeta`): `id`, `title`, optional `branch` and `from` (the source document, relative to the repo, and only when it's in the repo), `context_notes` (vault wikilinks), `created`. The body is the briefing. Membership isn't stored: it's computed from the cards' `deck` fields, so a deck never needs editing.
- **The account (M9a).** A rule, a rule retirement, a topic alias and a preference file each also take an optional `account`, as a verdict does: in a hosted repo the service sets it beside the handle in `accepted_by` or `by` ([[#The hosted service's proof (M9a)]]).
- **Rule** (`RuleMeta`): `id`, optional `topic`, `covers` (gate fact-ID globs such as `dep:pytest-*`, which the gate acknowledges automatically; D24), optional `from_card`, `accepted_by`, `created`. The body is the rule. It's saved when you accept a rule draft (D110): the draft's wording, or yours if you answer with your own, its patterns and topic, `from_card` naming the decision it came from, and you as `accepted_by`. One rule per decision.
- **Rule retirement** (`RuleRetirement`, D119): `rule`, `card` (the card it was retired on), `by`, `at`. Written when an answer chooses an option that breaks the rule and you tick "Retire this rule". The rule file stays; the gate and the client skip a retired rule. Replacing a rule is retiring it and making a new one.
- **Topic alias** (`TopicAlias`): `from`, `to`, `by`, `at`. Written when you merge two topics on a card (D111): `from` is the card's topic and `to` the one it looked like, both canonical, so aliases never form a cycle.
- **Attachment** (`Attachment`): `card`, `agent`, `branch`, `at`. Live only: it matters for priority and inbox delivery, not for the record. No folder path (D121): git checks a branch out in only one worktree, so the branch names it.
- **Fallback** (`Fallback`): `card`, `revision`, `reason` (`timeout` or `away`), `agent`, `at`. Written when an agent proceeds on a blocking card without a verdict, so the client can show it. Never written for a hard card, which doesn't proceed.
- **Presence** (`Presence`): `client`, `at`. The client rewrites it every 30 seconds, by writing a temporary file and renaming it, so readers never see half a file. `baesian wait` treats it as follows:
  - more than 90 seconds old (`PRESENCE_STALE_MS`): the reviewer is away;
  - missing: unknown, because the client has never run.
- **Waiting marker** (`Waiting`, D90): `card`, `revision`, `agent`, `since`, `at`. `baesian wait` writes it when it starts, and rewrites it every 30 seconds (with a temporary file and a rename, as presence does). A run that ends with exit 7 (D101) leaves it for the next run to pick up; any other ending removes it. `since` is when the wait first began, across runs. A marker more than 90 seconds old means the agent stopped waiting: the card says so, and drops back to its place in the queue. Several agents can wait on one card, each with its own marker. `baesian wait` writes it from M4 step 3.
- **Server file** (`ServerInfo`, D97): `pid`, `port`, `token`, `started`. `baesian serve` writes it atomically, readable only by the user, and removes it when it stops. The token is new on every start. Another `serve` uses it to find a running server, and ignores it if that process has gone or doesn't answer.
- **Last port** (`LastPort`, D103): `port`. The port the last server listened on, kept after it stops so the next one can start on the same address, and the browser keeps what it stored for that address. No secret. An unreadable file is ignored, and a port in use falls back to one the system picks.
- **Inbox cursor** (`Cursor`): `at`, the time of the newest verdict the branch has read (empty before the first), and optional `delivered`, what `baesian wait` has delivered since, as `<card> <verdict's card> <verdict's at>`; a session's cursor has only `at`. Mutable, replaced whole (in a folder, a temporary file and a rename, as presence is). Cursors written before v1 had neither `type` nor `format`, and still read.
- **Config** (`Config`): optional `format`, which `baesian init` writes first; optional `vault` (the vault adapter's folder, relative to the repo root and inside it, set by `baesian init --vault`; M6); optional `service` and `project`, set together when the repo is linked to the hosted service: its origin, and the project's random ID there (`ProjectId`, P16 section 8; linking is M9d's). It's committed, so it holds only what's shared by everyone working on the repo. Keys stay flat, like everything else.
  - **`user_facing`** (B-bf29j): the paths whose edits are user-facing, as globs read as the gate reads them, at least one. The plugin's PreToolUse hook on edits reads it, without the CLI, and reminds the agent once a session for each matching file that a decision there goes to the person as a card (B-qrdhh). It never blocks and is no gate fact, so it lives here, where agents set it in a commit; there's no built-in list, so a repo that declares none gets no reminder. This repo's: the client's components and styles, `client/index.html`, the command line's output and help (`src/cli.ts`, `src/style.ts`), and the service's emails (`service/src/mail.ts`).
  - **`gate_schema`, `gate_infra`, `gate_ignore` and `gate_api` are no longer read (B-qkek1).** What the commit gate looks at is in the preference files now ([[#Routing]]), which only the client writes, since agents edit this file: on 2026-11-05 a commit that set `gate_ignore` to `["**"]` here and added a dependency passed `baesian verify` with no card or ack. A config that still has them reads, but nothing uses them, and `baesian check`, the commit gate and `baesian verify` (once, for HEAD) warn: "`.baesian/config.json` still has gate_schema, which the gate no longer reads (B-qkek1)…", saying to set it in the client's preferences panel, under "What the gate looks for", if the built-in lists don't cover it, then delete it from the config (`staleGateKeys()`, `configWarnings()`). Before v1 there's nothing to migrate (D108). Until the move was built, a change to any of them was a gate fact, `infra:.baesian/config.json`; now it changes nothing, so it's no fact.
- **User config** (`UserConfig`): optional `format`, never written by Baesian; optional `notify` (a shell command run for blocking and hard cards, with the card as JSON on stdin) and `os_notify` (default true). Its location is `$BAESIAN_CONFIG`, or `$XDG_CONFIG_HOME/baesian/config.json`, or `~/.config/baesian/config.json`. It's personal for two reasons:
  - a `notify` command in a committed file would run on every clone of the repo;
  - a phone-push token would be in the repo.

  This is a change from the first draft, part of P12.

## Routing

The gate at filing (M8: D144–D151, [[Routing and Preferences]], [[Formats for v1]] sections 2 to 4; [[src-routing]]). Rows, positions and presets are in `src/routing.ts`.

**Preference file** (`Preferences`), one per change, written once, by the client only (D147). The newest by name is in force; the rest are the history. With none, the gate runs "Today" in shadow, which routes as before the gate.

| Field | Type | Required | Notes |
|---|---|---|---|
| `type`, `format` | `preferences`; 1 | yes | |
| `mode` | `shadow` \| `enforce` | yes | shadow records what the gate would hold back, and holds nothing (D148) |
| `row_public_api`, `row_schema`, `row_dependency`, `row_infra`, `row_user_facing`, `row_security`, `row_privacy`, `row_other` | each `agent-decides`, `sample`, `tell-me`, `stop-and-ask` or `never-without-me` | yes, all eight | security and privacy no lower than `tell-me` (D146, B-z3agk). Spending, destroying data and publishing have no key: always "never without me" |
| `rate_agent_decides`, `rate_sample` | 0 to 1 | yes | the chance a held card is drawn for audit at each low position (B-fgc4y: 0.1 and 1/3 to start) |
| `burn_in` | integer ≥ 0 | yes | how many of each row's first held cards are all drawn (10 to start) |
| `gate_schema`, `gate_infra` | lists of globs | | what the commit gate counts as a schema, and as CI, infra or deploys (B-qkek1): each replaces its built-in list, `DEFAULT_SCHEMA` or `DEFAULT_INFRA`. Left out, it's the built-in list; empty, the gate looks for none |
| `gate_api` | list of globs, at least one | | the public modules: the `api:` detector runs only when there are some (D59), and needs livedocs |
| `gate_ignore` | list of globs, at least one | | paths the gate never looks at, beside `DEFAULT_IGNORE`, which always applies |
| `profile` | slug | | the preset it started from (B-wwxa3) |
| `replaces` | file name | yes but on the first | the file it was made from: a change from an older view is refused (`StalePreferences`) |
| `from_card` | card ID | | the slider proposal it came from (B-y6jn6) |
| `survey_see`, `survey_fine` | lists of rows | | the setup survey's answers (B-5na1k): the rows whose example you wanted to see, and those you'd be fine not seeing |
| `reason` | string | | your note |
| `by`, `client`, `at` | | yes | who, which client (D62), when |

**What the commit gate looks at (B-qkek1)** is in the preference file in force, as the rows are: the commit gate, `baesian check` and the hooks read the newest file in the live layer, and `baesian verify` the newest in each commit's own record; in a hosted repo only one that counts ([[#The hosted service's proof (M9a)]]), so a commit can't make the gate see less with a file of its own. Unlike the rows, a list left out means the built-in one: the built-in lists are Baesian's detectors, which change with its code, and every file written before the move has none. A change sends whole lists; one equal to the built-in list, in any order, is written as left out (`pathSetting()`), and a change that sends none keeps the file in force's (`Store.writePreferences`). The built-in schema list counts `**/schema.ts` as a schema (Drizzle's and Convex's, and Zod schemas of files on disk, like Baesian's own), which carried this repo's `gate_schema` of `src/schema.ts` over when the config's keys stopped being read.

**Gate record** (`GateRecord`), one per card revision and writer, beside the card, written once. The CLI's (`by: cli`) counts locally; in a hosted repo only the relay's will hold a card back (D158, M9).

| Field | Notes |
|---|---|
| `type`, `format` | `gate`; 1 |
| `card`, `revision`, `by`, `gate` | the revision it gated, `cli` or `relay`, and the rules' version, `rules-1` |
| `mode`, `preferences` | copied from the preference file it applied, named; with none, `shadow` and no name |
| `touches`, `reverse`, `asked`, `source` | what it read: the facts, reversibility and the level the draft asked for; and `agent`, `baesian` (a card Baesian files), `answer` (a revision after an answer, or a reply) or `chat` (a card the reviewer answered in chat, B-hswmx, unless it follows an answer), the last three always shown |
| `row`, `position`, `outcome`, `level`, `reason` | the strictest row and its position; `shown` or `held` (in shadow, what it would have done); the level when shown; and what set it: `row`, `floor`, `one-way`, `agent`, `baesian`, `answer`, `chat` or `error` |
| `draw`, `p`, `held_before`, `burn_in`, `drawn` | when held: the card's draw (`drawOf()`), its chance, the row's held cards the gate counted before it, whether that's within the burn-in, and whether it was drawn for audit |
| `draw_proof` | the relay's signature its draw came from, on the relay's record only (M9) |
| `at` | when it ran |

A classifier's model, score and threshold are reserved (D145): the schema is strict, so a v1 reader refuses a record that sets them.

**Status `held`** is computed, never stored: the revision's gate record says held, enforcing, and the revision has no verdict (D150). It isn't in `PENDING`, and the merge gate accepts it.

## The hosted service's proof (M9a)

In a hosted repo only what the service signs counts: every answer, rule, rule retirement, topic merge and preference change (D138), and the relay's gate record (D158). Each names the project it was made in, `project` (B-tf9fc), set by the relay, since one key signs every project's files. [[Formats for v1]] section 7 is the design; `src/trust.ts`, `src/sshsig.ts` and `src/passkey.ts` check it ([[src-trust]]), and the store skips what doesn't count ([[src-store#The hosted service's proof (M9a)]]). Every file here is written once, by the service, and the CLI writes it into the live layer as it pulls (M9d). Nothing here changes a repo that isn't hosted.

**Signature files (D160).** `<file>.sig`, beside each signed file in both layers: OpenSSH's own signature format (PROTOCOL.sshsig), armored as `ssh-keygen -Y sign` writes it, over the file's exact bytes, so no canonical form is needed. The namespace is `baesian` (`NAMESPACE`), the key Ed25519 and the hash SHA-512 or SHA-256. It carries no `format` field: its format is SSHSIG's own version, 1, and a later version is refused by name (`NewerFormat`, kind `signature`). Signed: verdicts, rules (`rules/<id>.md`), rule retirements, topic aliases, preference files, the relay's gate records (`cards/<id>/gate-r<n>-relay.json`) and passkey key files. [[src-verify#Checking an answer by hand]] shows how to check one with `ssh-keygen -Y verify`.

**A file counts** (`Store.judge`) when its `.sig` is a trusted service key's signature in the `baesian` namespace, made while the key was valid at the file's own time (`at`; a rule's `created`) and before any revocation of it; when it's where its bytes say it belongs; when its `project` is the one the repo's config names (B-tf9fc), so a file copied from another of your repos counts nowhere else, and one in a repo whose config names no project doesn't count; for a verdict, when its `card_digest` is the SHA-256 of the card revision's file here (B-f571v), so an answer counts only on the text it answered, and a card rewritten after its answer is unanswered; and, when it needs one, its passkey proof checks. A signature covers the bytes, not the name, so a verdict must be named for its own time, card and revision, a rule or retirement for its rule, a preference file for its own time, and a relay's gate record must be in its card's folder, named for its revision: a copy under another name counts nowhere. A verdict needs one when the revision it answers is hard (the level in force, `Store.levelOf`), whatever its response, since a deferral settles a card at merge too (D139). A preference file needs one when it lets more cards past you than the newest counting file before it, or "Today" in shadow with none: a row moved toward held, enforcing turned on, a lower `rate_agent_decides`, `rate_sample` or `burn_in`, which brings fewer held cards back to you, or a commit gate that sees less: a schema, infra or API list that no longer covers every path the one before did, or more paths ignored, told by comparing the globs exactly, and counted as loosening when it can't be told (D163, B-shndb, B-qkek1, `loosening()`, `pathsLoosening()`). It's compared with that file, not the one its `replaces` names, so a change can't make itself look like tightening.

**Passkey proof** (`PasskeyProof`, D139, D163), `<file without .json>.passkey.json` beside a verdict or a preference file:

| Field | Notes |
|---|---|
| `type`, `format` | `passkey-proof`; 1 |
| `file` | the file it proves, by name, in the same folder |
| `batch` | optional, the batch form (B-a6xpc): the SHA-256 digest, lowercase hex, of every file one tap confirmed, this one's among them, in the order the relay wrote them |
| `credential` | the passkey's credential ID, base64url |
| `authenticator_data`, `client_data`, `signature` | WebAuthn's assertion as the browser returned it, base64url |

Its client data must be `webauthn.get`, from the service key's `origin`, not in another site's frame, with the challenge the SHA-256 digest of the file's bytes (P16 section 7); its authenticator data must carry the hash of the key's `rp_id` and the user-present and user-verified flags; and its signature must check under a trusted passkey key with the file's `account` and the proof's `credential`, by its COSE algorithm: ES256, EdDSA or RS256 (`PASSKEY_ALGS`).

**The batch form** (B-a6xpc): when one tap of the passkey confirms several answers waiting on the website, it signs them all at once. The challenge is then the SHA-256 digest, base64url, of the batch's message (`batchMessage()`, `batchChallenge()`): the line `baesian-batch`, then each file's digest in lowercase hex, one per line, each line ending in a newline. Every file the tap confirmed gets its own proof, each holding the same `batch` list and the same assertion, which is the signature they share; a file proves itself by its own digest being in that list, and the rest of the checks are as above. The first line keeps the forms apart: no verdict or preference file reads so, so a batch's assertion proves no file in the single form, and a file's digest is no batch's challenge. A tap that confirms one file alone uses the single form. It's format 1 still: before v1 a format changes in place (D108), and its number moves only from v1 on (D156, D157); a proof without `batch` reads as it always did.

**The trust files** (D142, D159), in `trust/`, copied into every branch's record by `Store.syncRecord`:

| File | Fields |
|---|---|
| `trust/service-<key>.json` (`ServiceKey`) | `type` `service-key`, `format`; `key`, a slug; `public_key`, `ssh-ed25519 AAAA…` with no comment, as an allowed-signers line takes it; `origin` and `rp_id`, the website's origin and WebAuthn relying party; `valid_after`, and optional `valid_before` |
| `trust/service-<key>-revoked.json` (`ServiceKeyRevocation`) | `type` `service-key-revocation`, `format`, `key`, `reason`, `at`: a file signed at or after `at` doesn't count |
| `trust/passkey-<suffix>.json` (`PasskeyKey`), with a `.sig` | `type` `passkey-key`, `format`, `account`, `handle`, `credential`, `public_key` (SubjectPublicKeyInfo, base64url), `alg` (COSE: -7, -8 or -257), `enrolled` |

**What makes a repo hosted** (`Store.hosted`): keys pinned in CI's settings, whatever the record says, so a commit that drops the record's copy can't switch the checks off (D142); or else a service key in the layer's `trust/`. Pinned, the keys are CI's alone, and the record's copy must match them (`pinProblems()`), and the project is the pinned one, whatever the config names (B-mar8x). Unpinned, the layer's copy is used, its passkey keys only once the service signed them. Revocations count wherever they are, since they only take trust away. M9d adds the config's `service` field as a local switch too.

**The pin** (`pinnedTrust()`): `BAESIAN_TRUST` holds the repo's project and the trust files' JSON, one per line, as `parseTrust()` reads them, with blank lines and `#` comments skipped; or `BAESIAN_TRUST_FILE` names a file of the same lines, for a protected file on a runner. Both may be set. Among them must be at least one service key and the project's line (`pinComplete()`). A pin that's set but empty, that can't be read, or that lacks either stops every command with `BadTrust`, saying to run `baesian ci`, which prints every line from what the service sent (B-pt52b): a misconfigured pin must never turn the checks off quietly.

**The project's line** (`PinnedProject`, B-mar8x), one per pin, and only ever in CI's pin, never a file in `trust/`:

```json
{"type":"project","format":1,"project":"p-c81yx9gdvfr9yjsfdsrp"}
```

| Field | Notes |
|---|---|
| `type`, `format` | `project`; 1. Its format is numbered as a file's is (`FILE_KINDS`, kind `project`), and a newer one is refused by name (D157) |
| `project` | the repo's project, as `.baesian/config.json` names it (`ProjectId`) |

A pin names one project: two lines naming different projects, in one setting or across both, stop the command. With it, `baesian verify` fails a commit whose config names another project, and finds the commit that linked the repo to the pinned one once, from the tip it checks, by ancestry ([[src-verify#In a hosted repo (M9a)]]). `projectLine()` writes it, as `baesian ci` prints it.

**The relay's gate record** (D158) is the CLI's format (`GateRecord`, [[#Routing]]) with `by: relay`, signed, and when it holds a card, `draw_proof`: the service's SSH signature, unarmored, in the namespace `baesian-draw` (`DRAW_NAMESPACE`), over `drawMessage()`'s text: `<id> r<revision> <SHA-256 of the card revision's bytes, hex>` and a newline. The draw is the SHA-256 of the raw Ed25519 signature, its first six bytes read as a number from 0 to 1, as `drawOf()` reads the CLI's hash (`drawOfProof()`). Ed25519 is deterministic, so the relay can't redraw, and nobody without its key can predict a draw.

## The relay (M9b)

The relay ([[service]]; [[Formats for v1]] section 8, [[Hosted Service]] section 1) keeps each project's live layer in its Durable Object, one row per file, and beside it an append-only log of the files written once. Its protocol is versioned by its address: every address starts `/v1/projects/{project}/` (B-7z97x). Before v1 it changes freely (D108).

**The CLI's release (B-4p43b).** Every request the CLI makes to the service carries `baesian-version: <release>` (`RELEASE_HEADER`). A machine's request to a project's address from a Baesian older than the relay serves (`minimumRelease()`: the oldest release that reads every format this one writes, never before 1.0.0, `FIRST_STABLE`) is refused before anything else with 426 and `{ error, minimum, release }`, the error naming the release to install; one that names no release is from before the header, 0.1.x, refused from 1.0.0.

**The service's keys (B-x47ek).** `GET /v1/keys`, for anyone: `{ service, spare }`, each a list of service key files (`ServiceKey`): the key the service signs with, and the spare it publishes and never signs with, whose line CI pins beside its key; `problem` when a spare is named but can't be read. The spare's file is the one the relay writes in a project's `trust/` the day it switches to it; until then it's in no project's files.

**Each project's tables (B-866d2)** are numbered: the meta table's key `schema` holds the project's schema version, and the object runs the migrations after it as it wakes, in one transaction (`OBJECT_MIGRATIONS`, [[service]]). Migration 1 is the tables below, with `practice` (B-rehdw); a project made before migrations has none, and reads as version 0. Migration 2 adds `built`, the state as last built (B-evrec); migration 3, the members' tables and columns below (P20).

**The relay's entry** (`RelayEntry`, read with `readRelayEntry()`), as `GET …/log?after={seq}` sends them, in `{ entries, head, more }`, at most 1,000 at a time:

| Field | Notes |
|---|---|
| `seq` | the project's sequence number for it: from 1, strictly increasing, never reused |
| `path` | the file's path in the live layer |
| `format` | the file's own format number; 1 for a file that names none (D156). The entry has no `type` or `format` of its own: its version is the `/v1/` in its address |
| `size`, `digest` | its length in bytes, and the lowercase hex SHA-256 of its bytes |
| `body` | its bytes, base64. Dropped once it's delivered and its card resolved (D137, retention is M9f's); the rest of the entry stays |
| `sig` | its `.sig`'s bytes, base64, for a kind the service signs. A `.sig` is never an entry of its own |
| `machine` | the machine whose upload it was (D162); absent on what the relay wrote |
| `before_linking` | `true` on an answer, rule, rule retirement, topic merge or preference file a person wrote before the repo was linked, which a machine uploaded at first link (B-3zjjx, M9e): it has no `sig`, and each machine counts it only where its own record at the linking commit holds it (B-45xz8). Absent otherwise |
| `at` | when the relay accepted it, by its clock |
| `enc` | **reserved** for encryption (D137): absent in v1, and an entry that sets it is refused by name, so an encrypted entry from a later version fails loudly |

What's logged: every file written once, uploaded or written by the relay. What isn't: waiting markers, presence and the default branch, which are mutable state the state carries, and signatures, which ride in their files' entries. The first write to a project logs the service's key, `trust/service-<key>.json`, before anything it signed. Each card revision the relay accepts is followed by its gate record, `cards/<id>/gate-r<n>-relay.json`.

**Uploads** (`PUT …/files/{path}`, a machine only) take the kinds an agent writes: card revisions, the CLI's gate records (`by: cli`), withdrawals, fallbacks, attachments, decks, and waiting markers (mutable; `DELETE` removes one); and what the hooks write (D181): ledger entries, whose body must be exactly the line naming the commit's short ID and the card and which must name their commit, for a card already there; and merges, whose path must be named for their commit and branch, of one branch into another. And the repo's default branch (B-jr8mk), `default-branch.json`: only a branch's name, as git allows one, mutable, replaced by the next one sent, never removed (`DELETE` takes only a waiting marker). Each is read through its kind's schema and must match its path. The same bytes again do nothing; other bytes at a path are refused (409), as a second exclusive create is. **The answers from before linking** (B-3zjjx, M9e) are the one exception, and only until anything in `verdicts/`, `rules/`, `topics/` or `preferences/` has the service's signature, that is, until the project's first answer on the website: a verdict, a rule, a rule's retirement, a topic merge or a preference file, through its kind's schema, matching its path (a verdict or preference file named for its own time; a verdict's card revision, and a retirement's rule, already there), naming no account or project. The relay keeps it unsigned, and lists it in its object's own table `before_linking`, apart from the log, which marks its entry. After the window closes, one is refused with 403 and `before_linking: "closed"`.

**Live updates** (`GET …/live`, a WebSocket): the message `{"type":"changed","version":N}` on opening, and whenever the project's version moves; `ping` is answered `pong`. The version is the state's `version`.

**Running the relay locally** (no Cloudflare account): from `service/`, `npm ci` (after the root's), then `npm run dev-vars`, which writes `service/.dev.vars`, ignored by git, with a fresh signing key, the stand-in's grants for the project `proj-dev` and Turnstile's test secret, and prints a `curl` line for a machine and one for a person; `npm run migrate:local` once, to make the local accounts database; then `npm run build` from the root, for the website it serves (M9e), and `npm run dev` (`wrangler dev`) serves it at `http://localhost:8787/`. Emails are simulated: logged, and saved under `service/.wrangler/tmp/email/`. `npm run test:service` from the root runs the service's tests in workerd. Deployed, only real sign-ins count (M9c).

**Retention's state** (M9f, B-9jqt4, B-ec3kj, [[service#Retention (service/src/retention.ts)]]): five more tables in each project's object, kept by `RetentionLedger`, never logged, signed or sent. When a card's text goes, its files' rows (and their `.sig`s, and its waiting markers, and its ledger entries, D181) are deleted from `files`; their `log` rows stay, so `GET log` sends each entry without `body` or `sig`, and an upload of the same path is still known. A merge's row goes once every card it names has gone, and every commit it lists had ledger entries here that went with their cards' text, none left (`retention_commits`), so once every card its commits cite has gone too (B-w41p7); one naming no card and no commit stays, and so does one listing a commit whose ledger entries never came (B-15v62): nothing ties it to a card's text. The default branch stays while the project does.

| Table | One row per | Columns |
|---|---|---|
| `retention_sent` | machine (its grant's ID; a stand-in machine as `dev:<name>`) | `seq`, the furthest a `GET log` reply sent it; `at` |
| `retention_delivered` | card found delivered | `seq`, the card's last entry then; `at`, when it was found (ms) |
| `retention_removed` | card whose text went | `revision`, `level` (in force), `ended` (`answered`, `withdrawn` or `held`), `filed`, `settled`, `removed` (ISO times), `size` (its files' bytes) |
| `retention_held` | writer and row | `n`: held cards' gate records removed, still counted by the burn-in |
| `retention_commits` | commit whose ledger entries went with their cards' text (B-15v62) | `commit_id` |

The state (`ApiState`) carries the removed cards as `removed`, a list of `ApiRemovedCard`: `id`, `revision`, `level`, `ended`, `filed`, `settled`, `removed`. Only the relay sets it.

**Notifications' state** (M9e step 2, B-advkh, [[service#Notifications (service/src/notify.ts)]]): four more tables in each project's object, apart from its files and log, never logged, signed or sent, kept by `PushLedger`. Times are milliseconds since 1970.

| Table | One row per | Columns |
|---|---|---|
| `push_arrivals` | card revision a machine uploaded | `card`, `revision`; `machine`, the uploading machine's name; `arrived`; `settled`, when it stopped waiting for anyone (or, in a project with no members known, when a notification told it, it was seen, or it never would notify), else null; `handed`, when whoever it was sent to passed it on, else null (P20, migration 3). Settled rows go after an hour |
| `push_told` | arrival settled for one member (P20, migration 3) | `card`, `revision`, `account`; `at`, when a notification told them of it, they saw it while present, or it was never to notify them. Rows go with their arrival, and with a member who leaves |
| `push_sent` | notification sent | `at`; `account`, the member it went to (migration 3; null on a row from before); kept an hour, for each member's cap |
| `push_pauses` | machine that filed a burst | `machine`; `cards`, how many new cards it filed in the window; `since`, the window's first; `until`, when its cards notify again; kept an hour after |

**Whom each card was sent to, and who's there** (P20, B-2n7s4, B-tzdjn, [[service#Whom a card is sent to (P20, B-2n7s4, B-tzdjn; service/src/sent-to.ts)]]): two more tables in each project's object, made by migration 3, the relay's own notes: in no file, never logged, signed or sent to a machine. The state says whom each card's latest revision was sent to, as `ApiCard.sent_to`, an account; only the relay sets it.

| Table | One row per | Columns |
|---|---|---|
| `sent_to` | card revision a machine uploaded (`SentTo`) | `card`, `revision`; `account`, the member whose machine uploaded it, or null for nobody in particular, the project's owners: a card only owners answer, a machine that names no account, or a member who has since left; `at`. Rows go when the card's text does |
| `presence_of` | member who has been at the desk (`MemberPresence`) | `account`; `client`, `phone` or `desktop`; `at`, their last heartbeat. Kept a day; there for 90 seconds |

**Answers proved by the passkey** (M9c, [[service#Answers that take the passkey (D139, D163, M9c)]]): the relay writes a verdict or preference file that needs a proof only with it, in the same transaction, each as its own entry: the file and its `sig`, then `<file>.passkey.json`. A passkey key file is `trust/passkey-<suffix>.json` with the suffix the first 12 hex digits of the SHA-256 of its credential ID (`keyFileName()`), so every project holds the same bytes at the same path; it's put in each project of its account, signed, before any proof made with it.

## Accounts (M9c)

Accounts live in one D1 database, `baesian-accounts`, bound as `ACCOUNTS` (B-ytdt2), apart from the projects' objects. Its tables are made by the migrations in `service/migrations/` (`wrangler d1 migrations apply`), and read and written by `Accounts` ([[service#Accounts (service/src/accounts.ts)]]). Every secret is kept only as its SHA-256, hex: session and machine tokens, emailed codes, recovery codes, and flow secrets. No IP address or location is stored anywhere (B-7bq05). Times are ISO 8601, UTC. Before v1 the tables change freely (D108); from then, a change is a new migration.

| Table | One row per | Columns |
|---|---|---|
| `accounts` | account | `id`, Baesian's own (`acct-…`), never a Globus identity (D153); `handle`, unique regardless of case; `created`; `closed`, when its owner deleted it, which closes it for 14 days before it's deleted (B-b46z3, `0005_account_deletion.sql`, M9f), or null |
| `emails` | email address | `address`, lowercased; `account`; `verified`, when a code to it was checked (null for an address Globus gave); `created` |
| `passkeys` | passkey | `credential`, its ID, base64url; `account`; `cose`, its key as COSE, base64url, which assertions are checked with; `spki` and `alg`, the same key as its key file has it (`PasskeyKey`); `counter`; `transports`, JSON; `name`; `enrolled`; `last_used` |
| `recovery_codes` | account | `hash` of the saved recovery code (B-jzgy4), replaced when it's used; `created` |
| `globus_identities` | linked Globus identity | `sub`, the ID token's subject; `account`, one each way; `linked` |
| `flows` | flow in progress | `id`, the hash of the secret its browser holds; `kind`: `signup`, `recover`, `signin`, `fresh`, `enrol`, `globus` or `restore` (a closed account's passkey sign-in, for five minutes, M9f); `email`, `account`, `handle` as it goes; `code_hash` of its emailed code and `attempts` on it; `verified`; `challenge`, a passkey ceremony's; `globus_sub`; `data`, a Globus round trip's state, nonce, PKCE verifier and binding; `created`, `expires`. Cleared a day after they expire |
| `sessions` | sign-in in a browser | `hash` of its cookie; `id`, which the list shows; `account`; `name`, the browser's short name; `created`; `last_used`; `verified`, its last passkey check; `expires`, 90 days on (B-vtr1r) |
| `projects` | project | `id`, as `.baesian/config.json` has it; `owner`, the account that made it and holds it, whose deletion deletes it; `name`, what its owner called it when approving its first machine, or later on the website: 1 to 60 characters (B-zqkwk, `0002_project_names.sql`, M9e); `created`. The service never learns the repo's own name |
| `members` | member of a project (P20, `0006_members.sql`) | `project`; `account`; `role`, `owner` or `member` (B-rxbss); `joined`; `added_by`, the owner whose link they joined by, or null for the account that made the project, or once that owner's account is deleted. Every project's `owner` is in it, as an owner, from the day the project was made. Any member reads the project and answers its cards (B-r51ts) |
| `invites` | link that adds one member (B-jsady) | `hash` of its code, which is shown once and never kept; `project`; `created_by`, the owner who made it; `created`; `expires`, seven days on; `used_by` and `used`, once someone has joined by it. No address is kept: the owner sends the link themselves. A row goes a day after it's used or it expires (`Accounts.clearEnded`) |
| `grants` | machine grant (B-84e0d) | `id`; `account`; `project`; `machine`, its name; `access_hash` and `access_expires`; `refresh_hash`; `created`; `last_used`; `revoked` |
| `spent_tokens` | refresh token used | `hash`; `grant_id`; `spent`: one presented again revokes its grant (RFC 9700) |
| `device_codes` | machine asking to sign in (RFC 8628) | `hash` of its device code; `user_code`, the code a person types; `project`; `machine`; `created`, `expires`; `last_poll`; `approved_by`; `denied`; `issued` |
| `push_subscriptions` | browser that gets notifications (M9e step 2, `0003_push_subscriptions.sql`) | `id`; `account`; `endpoint`, unique, its push service's address for it: one row per browser, moved to the account that subscribed it last; `p256dh` and `auth`, the keys a push is encrypted to (RFC 8291), base64url; `name`, the browser's, as a sign-in's; `created`; `last_sent`, the last push its push service took. Deleted when its push service answers 404 or 410; at most 20 an account (`PUSH_MAX`) |
| `usage_events` | counted event (D141, B-7nq85, `0004_usage_counts.sql`) | `usage_id`, the account's; `project`, the project's usage key; `kind`, one of the ten in `USAGE_KINDS`; `hour`, UTC, `YYYY-MM-DDTHH`; `fields`, JSON, only the kind's own fields (`usageProblem()`). An error has no `usage_id` or `project`. Kept 90 days (`USAGE_RAW_DAYS`) |
| `usage_daily` | day, kind, field and value | `day`; `kind`; `field`, empty for the count of events; `value`, as text; `count`. What's left of the events after 90 days: no ID, key or hour |

**Usage counts' columns elsewhere** (`0004_usage_counts.sql`): `accounts.usage_id`, the account's pseudonymous ID, random (`u-…`), made at its first counted event, and dropped when it opts out; `accounts.usage_opt_out`, when it opted out, or null while it's counted; `projects.usage_key`, the project's random key (`k-…`), made at its first counted event. Neither is derived from anything.

**Deleting an account** (M9f, B-b46z3, [[service#Deleting an account (service/src/deletion.ts)]]) sets `accounts.closed`, deletes its `sessions`, `push_subscriptions` and `flows`, and revokes its `grants`, and every member's grants on the projects it holds, which close with it (P20); restoring it clears `closed`. Fourteen days on, the daily job deletes its rows from every table above but `usage_daily`, each named (`Accounts.erase`), after emptying the object of each project it holds (`Accounts.projectsHeldBy`): its memberships and the links it made go, the projects it was only a member of stay, and the members it added there are no longer marked as added by it (`added_by` cleared). The same job clears what has ended: sign-ins past their time, grants revoked or lapsed more than a day ago with their spent tokens, and flows and device codes a day past expiry (`Accounts.clearEnded`).

**The session cookie** is `__Host-baesian-session`, its value a random token: `Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=7776000` (90 days); the service ends it sooner, after 30 days unused (B-vtr1r). A Globus round trip's binding cookie is `__Host-baesian-globus`, SameSite=Lax, for 10 minutes.

## The CLI's side of the relay (M9d)

What a machine keeps of the hosted service ([[src-sync]]; [[Formats for v1]] section 8). Before v1 these change freely (D108).

**`Config`** gains **`first_commit`**: the repo's first commit, a full commit ID, written by `baesian login` when it links the repo (B-5gnea), and set only with `service` and `project`. A checkout whose history doesn't start there is a copy, not the repo, and doesn't sync; a shallow clone can't see it, and skips the check. Changing `service`, `project` or `first_commit` is a gate fact, `infra:.baesian/config.json` (B-w4g6c).

**`relay.json`** (`RelayState`), in the live layer only, mutable, replaced whole after every sync (`Storage.replace`), never in the record and never sent:

| Field | Notes |
|---|---|
| `type`, `format` | `relay`, 1 |
| `service`, `project` | the relay it's for, as the config names it; one for another relay is started afresh |
| `pulled` | the last sequence number pulled from the log |
| `uploaded` | the live layer's files the relay has: those it acknowledged an upload of (201 or 200), and the agent-written files pulled from it. What a sync pushes is every agent-written file not listed: at first link, everything (B-6k0rk) |
| `default_branch` | optional: the repo's default branch as this machine last sent it (B-jr8mk). A sync that pushes sends `default-branch.json` when git now says otherwise, and only then, so two machines that read it differently don't take turns; the relay keeps the latest |
| `at` | the last sync |

**The machine's grant** (`MachineGrant`), `grants/<project>.json` in the folder of the personal config (`$BAESIAN_CONFIG`'s, else `$XDG_CONFIG_HOME/baesian/`, else `~/.config/baesian/`), one per machine and project (B-84e0d). Created with mode 0600 in a folder made 0700 (B-gq8j1), and written whole, through a temporary file renamed over the old; each refresh writes the new tokens before they're used. `grants/<project>.json.lock` is held while it's refreshed. Never in a repo, and its tokens are never printed.

| Field | Notes |
|---|---|
| `type`, `format` | `grant`, 1 |
| `service`, `project` | what the grant is for: the service's origin and the project |
| `machine` | this machine's name, as the website shows it (the hostname, or `--machine`) |
| `access_token`, `access_expires` | the bearer token for the relay, and when it expires (an hour after it's issued) |
| `refresh_token` | used once, for the next pair (RFC 9700) |

**What a pull writes:** each entry's file into the live layer with an exclusive create, its `.sig` first, as if it had been written there; only in the folders the relay holds (`cards`, `decks`, `verdicts`, `rules`, `topics`, `preferences`, `trust`, `attachments`, and since D181 `ledger` and `merges`), and only when its bytes match the entry's size and digest. Where this machine wrote other bytes at the path first, the relay's copy replaces this machine's, in the worktree's record too, since it's everyone's; for a merge, quietly.

## Personal mode (B-4rwyz)

The user decided B-4rwyz: one person can use Baesian in a repo whose collaborators don't, and then nothing of Baesian's is committed. Before v1 these change freely (D108).

- **The config** is the clone's own: `config.json` in the live layer (`PERSONAL_CONFIG`), the same `Config` in the same format, in place of `.baesian/config.json`. Its being there is what makes a clone personal (`Store.personal`). There's no record: the live layer plays its part, and `/.baesian/` is in the clone's `.git/info/exclude`, so a stray one is never committed. A vault, whose notes are committed, isn't set.
- **`before-linking.json`** (`BeforeLinkingSnapshot`), in the live layer only, written once per project when `baesian login` links a personal clone, never committed or sent. It stands for the record at the linking commit, which a personal clone has none of (B-45xz8): an unsigned answer counts as from before linking when its blob ID is the one kept here.

| Field | Notes |
|---|---|
| `type`, `format` | `before-linking`, 1 |
| `project` | the project the clone was linked to; linking to another takes a new snapshot |
| `at` | when it was taken |
| `object_format` | `sha1` or `sha256`, the repo's, which each blob ID was taken in |
| `files` | each unsigned verdict, rule, retirement, topic merge and preference file, by its path in the layer, with its git blob ID |

- **`baesian-cited.json`**, beside the worktree's index, as `baesian-staged.json` is: the cards a commit cites, which `commit-msg` notes once it has taken their trailers out of the message, with the tree being committed, for `post-commit` to write the ledger from ([[src-gate#Personal mode (B-4rwyz)]]). It lasts one commit, so it has no format.
- **Git's own settings, in the clone:** `.git/baesian/git.config` (`PERSONAL_GIT_CONFIG`), a git config file that sets `core.hooksPath` to the clone's own hooks, `.git/baesian/hooks/`, absolute; and, at the end of the clone's `.git/config`, `[include] path = baesian/git.config` (`PERSONAL_INCLUDE`), so Baesian's value is read last and wins. The clone's own `core.hooksPath`, in `.git/config`, is left as the team sets it, and names the folder whose hooks run after Baesian's ([[src-gate#Personal mode (B-4rwyz)]]). `baesian.repohooks`, which an older `init --personal` wrote, is read once to put the team's setting back, then unset.
- **Commit trailers** are written as ever, and taken out of the message by the `commit-msg` hook once the gate has checked them ([[#Commit trailers (D52)]]).

## Vault notes (M6)

With `vault` set, the vault adapter writes two more files, in the vault rather than in Baesian's layers ([[Vault Adapter]], D170–D175; `src/vault.ts`, [[src-vault]]). They're views of the record: the pre-commit hook and `baesian sync` write them, from the branch's record and nothing else, and the gate never reads them (D173).

| File | One per | Written |
|---|---|---|
| `<vault>/Decisions/<card ID> <title>.md` | card that is or was resolved (`accept`, `alternative`, `correction`), conflict cards included; not a rule draft | when its card first resolves, and extended as it changes |
| `<vault>/Rules/<rule ID> <first words>.md` | rule, retired or not | when the rule is saved, and extended when it's retired |

**Names (D171).** The card's first revision's title, or the rule's first words, with `* " \ / < > : | ? # ^ [ ]` removed, spacing collapsed, and cut at a word boundary to 80 characters for a title and 60 for a rule; a trailing dot or space is dropped. A note is found by the ID at the start of its name, anywhere under its folder, so one renamed or moved by hand keeps its ID and isn't written again.

**How a note changes (D172).** The body is rendered once, from the card's first resolving answer, and never rewritten. The frontmatter is rendered afresh from the record each time: the keys below, in this order, then any key a person added, whose value is kept; a person's own `tags` and `aliases` are kept beside Baesian's. Each change adds one section at the end, `## <What> on <YYYY-MM-DD>`, the date in UTC: `Changed`, `Reopened`, `Answered again`, `Superseded`, `Withdrawn`; for a rule, `Retired`. A section already there is found by its heading. Everything is rendered from immutable files, so a note written fresh is the same bytes as one written earlier and extended since. A note written before v1, with no `format`, gains it at its next update; one in a newer format than this Baesian writes is left as it is, with a warning (D157). Lists of links (`depends_on` and the like) hold wikilinks, `"[[<card ID> <title>|<card ID>]]"`, or the bare ID for a card with no note.

**Decision note frontmatter:**

| Key | Value |
|---|---|
| `type`, `format`, `status` | `decision`; the decision note format, 1 (D156); `active` (resolved), `superseded`, `withdrawn`, or `reopened` (open again: returned, deferred, rerouted, or replied to) |
| `authority`, `livedocs` | `log`; `snapshot`, so livedocs binds nothing in it (D175) |
| `summary` | `<title>: <answer> (<card ID>).` |
| `created`, `updated` | the date of the first answer, and of the latest change |
| `tags`, `aliases` | `[baesian, decision]`; `[<card ID>]` |
| `card`, `revision`, `title`, `question` | the card, and the revision the latest resolving answer was on, with its title and question |
| `answer`, `response`, `not_chosen` | what was decided, how (`accept`, `alternative`, `correction`), and the options not chosen: one, or both for a `correction` |
| `answered`, `answered_by` | the latest resolving verdict's time (ISO, as text) and reviewer |
| `topic`, `deck`, `level`, `reverse`, `touches` | as on that revision; the topic canonical |
| `filed`, `filed_by`, `branch` | the first revision's time, agent and branch |
| `filed_model` | the first revision's `source_model`, when it has one (B-k0w7d); the body's "Filed by" line names it in brackets after the agent |
| `depends_on`, `supersedes`, `superseded_by`, `conflict_of` | links to those decisions' notes |

**Decision note body:** the title, the question, then one paragraph each, only when set: **Decided** (with what follows from it), **Not chosen** (one or two), **It turned on** (the crux, and the answer that leads to each option), **The fact given**, **Comment**, **Answered in chat first** (what the reviewer said, which the agent filed as its pick, B-hswmx), **First chose** (when the reviewer switched after the agent's pick was shown, D88), **The agent's case**, **The agent's reply**. Then who answered, when, and on which card and revision; who filed it, on which branch and in which deck, and the deck's context notes as links; where the record is, and that editing the note changes nothing. Last, `## Background`, the card's body.

**Rule note frontmatter:** `type: rule`; `format: 1`, the rule note format (D156); `status` (`active` or `retired`); `authority: specifies`; `livedocs: snapshot`; `summary` (the rule's first sentence); `created`, `updated`; `tags: [baesian, rule]`; `aliases: [<rule ID>]`; then `rule` (the rule ID), `topic`, `covers`, `from_card` (a link), `accepted_by`, `accepted` (ISO); and once retired, `retired` (ISO), `retired_by`, `retired_on` (a link to the card it was retired on).

**Rule note body:** the rule's first words as a heading, the rule as a quote, who accepted it and when and from which decision (by ID, since every branch's record holds the rule but not always that card), the gate facts it lets through without a card, and that editing the note changes no rule.

## Commit trailers (D52)

These aren't files, but they're part of the same public interface. They go in the commit message's final trailer block, parsed with git's own rules (`git interpret-trailers --parse`, in `parseTrailers`):

- **`Baesian-Card: <id>`**, one line per card; comma-separated IDs are accepted too. The commit builds on the card. It covers the commit's detected facts whose kind is in the card's `touches` (D53). The post-commit hook writes a ledger entry for it. A changed answer's brief finds the card's commits by this trailer in the history of every branch (B-9v5xj), so they're still found after a rebase, or a squash whose message keeps the trailer in its last paragraph; a ledger entry whose commit is on no branch now is shown as rewritten.
- **`Baesian-Ack: <fact-id> <reason>`** acknowledges a detected decision as a two-way door. The fact ID is the one the gate prints (`dep:httpx`, `schema:<path>`, `infra:<path>`, and later `api:<symbol>`). The reason is required.
- **In personal mode** (B-4rwyz) both are written the same, and the `commit-msg` hook takes them out of the message once the gate has let the commit through, so the shared history never shows them: the cards cited go to the clone's ledger, which an amend or a rebase carries over to the commits it makes, and acks are kept nowhere.

## Decided points of P12 (2026-11-01, 2026-11-02)

- **D105:** cards don't record the folder they were filed from (`source_worktree` is gone).
- **D106:** `notify` lives only in the personal config, as above.
- **D107:** verdict files are named timestamp first.
- **D119** (2026-11-02): a rule is retired by an answer that breaks it, in a file beside the rule.
- **D120:** a ledger entry names just the commit.
- **D121:** attachments don't record the folder.
- **Conflict links** (D45), once open here, are the card fields `conflict_of` and `caught_at`.
