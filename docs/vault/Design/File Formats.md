---
type: design
status: active
authority: specifies
summary: "Baesian's file formats (accepted as D124): card revisions (with the M4 card content: question, trigger, two options, crux, facets), verdicts, withdrawals, ledger entries, decks, rules, topic aliases, attachments, waiting markers and config; preference files and gate records (M8); the hosted service's proof (M9a): the account field, OpenSSH signature files, passkey proofs and the trust files; where each lives, which are immutable, and the format number every file carries (D156, D157). Defined in src/schema.ts."
created: 2026-10-23
updated: 2026-11-03
reviewed: 2026-10-23
tags: [baesian, design, formats]
---

# File Formats

> **Status: accepted (D124, 2026-11-02).** These formats are implemented as described here, and the user has accepted them: the card revision and verdict tables and the open points D105–D107 (2026-11-01), then the open points found in the other files, D119–D121, and the rest of the other files (2026-11-02). Compatibility between Baesian versions isn't a concern until a v1 is published (D108), so these formats stay free to change until then. Every file now carries a format number (D156, D157, 2026-11-03), so from v1 a change to one is a new format, with an upgrade from the one before. A review of them, for git workflows and for what the record exposes, comes just before publishing.

The definitions are the Zod schemas in `src/schema.ts`. This note describes them for people, and livedocs binds it to them: a change to a schema blocks the commit until this note is reconciled.

## Rules that apply to every file

- **A format number (D156).** Every file Baesian writes carries `format`, an integer from 1, right after `type` in JSON and in frontmatter (first, in the config, which has no `type`). It's numbered per kind of file: a card format 2 would leave verdicts at 1. v1 writes `format: 1` everywhere. In `Config`, `UserConfig` and a card draft (`CardDraft`), which people write by hand, it's optional; a draft's `format` is the draft's own, and Baesian sets the revision's. The kinds and their upgrades are in one table, `FILE_KINDS`, and `newestFormat()` gives the one Baesian writes.
- **Reading a format (D156, D157).** `upgradeFile()` brings a file's fields to the newest format of its kind, in memory, before its schema checks them; a file is never rewritten for it. Files are written once, and CI checks each commit against its own record (`checkCommit()`), so an old commit's files must stay readable as they are.
  - **No `format`:** the file was written before v1, and reads as format 1. That changes nothing, except that an inbox cursor gains the `type` it lacked. So `baesian verify` passes over a commit whose record predates the field.
  - **An older format:** each later format comes with one upgrade function in its kind's entry, applied in turn. There are none yet.
  - **A newer format** than this Baesian reads is refused, with `NewerFormat`: "cards/B-7f3kq/r1.md has card format 2; this Baesian reads up to 1: upgrade Baesian". It's refused as a bad file is. Inside a view that reports problems (the server's snapshot) it's reported and skipped; elsewhere it throws, so the CLI and `baesian verify` stop with the message. Where an unreadable file already means "unknown" (presence, the server file, the last port), one in a newer format is ignored too.
  - **Schemas stay strict otherwise.** A `format` that isn't a whole number from 1, or an unknown key, fails the schema as before.
  - **Mutable files** (the cursors, presence, waiting markers, the server file and the last port) are written in the newest format the next time they're written.
- **Immutable.** Every file except the config files, the inbox cursors, the presence heartbeat, the waiting markers and the server file is written once and never edited (D34). The store writes each whole to a temporary file and links it into place, which fails if it exists, so a second write fails and no reader sees half a file. Status is computed from the files, never stored.
- **Flat.** Frontmatter and JSON have no nested objects. Lists of strings are fine. Empty lists and unset fields are left out when writing.
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
| `decks/<deck>.md` | `DeckMeta` + body | yes | yes, with its cards | `baesian deck`; the branch deck on first use |
| `rules/<id>.md` | `RuleMeta` + body | yes | yes, at once in the client's worktree, and on sync in every other | the client (M4) |
| `rules/<id>-retired.json` | `RuleRetirement` | yes | yes, as rules | the client, with an answer that breaks the rule (D119) |
| `topics/alias-<suffix>.json` | `TopicAlias` | yes | yes, as rules | the client (M4) |
| `attachments/<id>-<suffix>.json` | `Attachment` | yes | no | `baesian attach` |
| `cursors/<branch>.json` | `Cursor` (`at`, and `delivered`: what `wait` has delivered since) | yes (mutable) | no | `baesian inbox`, and `baesian wait` |
| `cursors/<branch>/<session>.json` | `Cursor` (`at`): one session's own place in the branch's inbox (B-ghhym, provisional) | yes (mutable) | no | `baesian inbox --session`, run by the plugin's hooks |
| `presence.json` | `Presence` | yes (mutable) | no | the client's heartbeat (D41) |
| `waiting/<id>-<suffix>.json` | `Waiting` | yes (mutable) | no | `baesian wait`, while it waits (D90) |
| `server.json` | `ServerInfo` | yes (mutable, readable only by the user) | no | `baesian serve`, while it runs (D97) |
| `port.json` | `LastPort` | yes (mutable) | no | `baesian serve`, kept after it stops (D103) |
| `config.json` | `Config` | no | yes (mutable) | `baesian init` |
| `~/.config/baesian/config.json` | `UserConfig` | — | — | the user; never in a repo |
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
| `proposal`, `proposal_then` | strings | yes | the agent's pick, named in a few words, and what happens if it's chosen |
| `alternative`, `alternative_then` | strings | yes | the strongest alternative (D12, D93), and what happens if it's chosen |
| `also_considered` | list | | other options the agent considered, by name; not shown on the card (D93) |
| `crux` | string | yes | the one question the choice turns on (D74) |
| `crux_proposal`, `crux_alternative` | strings | yes | the answer that leads to each option ("If it does", "If it doesn't") |
| `crux_preference` | boolean | | the crux is about what the reviewer values, not a fact |
| `crux_fact` | string | | a fact that bears on the crux |
| `rationale` | string | | why the agent picks the proposal (D77) |
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
| `reply` | optional string | | the agent's one reply to an answer that went against its pick (D89, D104): a fact or a check. Only `baesian reply` sets it, on a revision that is otherwise the one before; a draft can't carry it |
| `rule`, `rule_covers` | optional string; list of gate patterns | | a drafted rule (D16, D109, D110): its wording, and the gate facts it answers (`dep:pytest-*`, `schema:migrations/*`). A card that carries one asks you to make it a rule. Only `baesian rule` sets them, on a card that builds on the decision you asked a rule of; a draft can't carry them |
| `convention` | optional `same-choice` \| `rule-words` | | a convention card (D161): which signal found the pattern. Only Baesian sets it; a draft can't carry it |
| `pref_row`, `pref_from`, `pref_to` | optional row; positions | all or none | a slider proposal (B-y6jn6): the row and the move. Only Baesian sets them; accepting the card writes a preference file |
| `confidence` | optional 0–1 | | recorded, not used for routing (D3) |
| `domain`, `evidence` | lists | | routing tags; links |
| `source_agent`, `source_branch`, `created` | | | filled in by Baesian. `source_agent` is free text, so it can name a persistent agent rather than the harness. The folder a card was filed from isn't recorded (D105) |

**Body:** optional Markdown context, shown with the agent's reasoning (D92). Nothing in it is checked.

What an agent writes is a **draft** (`CardDraft`): the same frontmatter without the fields Baesian fills in. `deck` and `level` are optional, and so is `format`, the draft's own format (1), which `baesian template` doesn't show and the MCP filing tool doesn't take.

**Filing** (`filingProblems()`, and the store's reference check) rejects:
- a missing required field;
- options that aren't really two: `proposal` and `alternative` the same, ignoring case and spacing;
- a crux that doesn't discriminate: `crux_proposal` and `crux_alternative` the same (D74);
- `wrong_if` or `check` missing when a facet asks for them (D77);
- a facet with only some of its fields (D75);
- IDs in `depends_on`, `rules` or the `_breaks` lists that don't exist.

**Warnings** (`filingWarnings()`): no length limit has been measured yet, so long fields file anyway, with a note. The limits are 60 characters for the title and option names, 160 for the question, crux and `doing`, and 240 for a `then`. A field or the body that looks like it holds a secret also gets a note, since the record is committed with the code (B-vqn69): a private-key header, an AWS access key ID, a GitHub or Slack token, a JWT, a `token=`, `key=` or `secret=` query parameter with a long value, or an assignment like `api_key = <long value>`. The note names the field and what the text looks like, never the text, and the card files anyway.

**Conflict cards** are filed by Baesian itself, with no model (D65). They carry a fixed crux (D94): "Was the newer decision made with context the older one lacked?" "If it wasn't" keeps the base branch's decision; "if it was" keeps the branch's. Each option's `_breaks` names the decision it would replace.

## Verdict

One file per response (`Verdict`). There can be several per revision: "not my area" then another reviewer's answer, or a deferral then a decision. The file is named for its `at` first, in compact form (`20261101T093012.345Z-B-7f3kq-r1-x4k2m.json`, D107): a listing of `verdicts/` is in the order they were given. The store finds a card's verdicts by parsing the name.

| Field | Notes |
|---|---|
| `card`, `revision` | a verdict on an old revision is rejected as stale |
| `response` | `accept`, `alternative`, `correction` → resolved; `reject`, `question`, `need_context`, `see_it_run` → returned; `not_my_area` → rerouted; `defer` → deferred. `see_it_run` (D85) asks the agent for a demo, a screenshot or a running preview |
| `choice` | required for `alternative` and `correction` |
| `comment` | required for `question` and `defer`. A disagreement's optional reason (D87) goes here |
| `first_choice` | optional: `proposal` or `alternative`, the option chosen before the agent's pick was shown (D86, D88) |
| `make_rule` | the "make this a rule" toggle (D16) |
| `retire_rules` | optional: rules the chosen option breaks, retired with this answer (D119). Only on `accept` or `alternative`, and only rules that option's `_breaks` lists and that aren't retired yet |
| `should_have_asked` | optional: "you should have asked me" (D151, B-87tkc), only on a card the gate held back, or in shadow would have; it counts as a miss on the card's row |
| `reviewer`, `client`, `at` | `client` names the client that wrote it (D62). `at` is strictly increasing per card, so the latest verdict is unambiguous |
| `account` | optional: in a hosted repo, the stable ID of the account that answered (`AccountId`), beside its handle in `reviewer`; the hosted client's `client` is `hosted-desktop` or `hosted-phone` (M9a) |
| `project`, `card_digest` | optional: in a hosted repo, set by the relay: the project it was given in (`ProjectId`, B-tf9fc), and the SHA-256 of the card revision's file as the relay received it, in lowercase hex (B-f571v). [[#The hosted service's proof (M9a)]] says how they're checked |

## The others

Each also has `type` and `format` (D156), not repeated below.

- **Withdrawal** (`Withdrawal`): `card`, `reason`, `by`, `at`. One per card.
- **Ledger entry** (`LedgerMeta`): `card`, `branch`, optional `commit`, `at`. One per card a commit cites. The body is one line naming the commit (D120): what the commit changed is git's to say. Entries written before D120 also list the commit's files.
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
- **Config** (`Config`): optional `format`, which `baesian init` writes first; optional `vault` (the vault adapter's folder, relative to the repo root and inside it, set by `baesian init --vault`; M6); optional `service` and `project`, set together when the repo is linked to the hosted service: its origin, and the project's random ID there (`ProjectId`, P16 section 8; linking is M9d's); and optional detector paths: `gate_schema` and `gate_infra` replace the defaults, `gate_ignore` adds to them, and `gate_api` lists the public modules that turn on the `api:` detector (D59). It's committed, so it holds only what's shared by everyone working on the repo. Keys stay flat, like everything else.
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
| `profile` | slug | | the preset it started from (B-wwxa3) |
| `replaces` | file name | yes but on the first | the file it was made from: a change from an older view is refused (`StalePreferences`) |
| `from_card` | card ID | | the slider proposal it came from (B-y6jn6) |
| `survey_see`, `survey_fine` | lists of rows | | the setup survey's answers (B-5na1k): the rows whose example you wanted to see, and those you'd be fine not seeing |
| `reason` | string | | your note |
| `by`, `client`, `at` | | yes | who, which client (D62), when |

**Gate record** (`GateRecord`), one per card revision and writer, beside the card, written once. The CLI's (`by: cli`) counts locally; in a hosted repo only the relay's will hold a card back (D158, M9).

| Field | Notes |
|---|---|
| `type`, `format` | `gate`; 1 |
| `card`, `revision`, `by`, `gate` | the revision it gated, `cli` or `relay`, and the rules' version, `rules-1` |
| `mode`, `preferences` | copied from the preference file it applied, named; with none, `shadow` and no name |
| `touches`, `reverse`, `asked`, `source` | what it read: the facts, reversibility and the level the draft asked for; and `agent`, `baesian` (a card Baesian files) or `answer` (a revision after an answer, or a reply), the last two always shown |
| `row`, `position`, `outcome`, `level`, `reason` | the strictest row and its position; `shown` or `held` (in shadow, what it would have done); the level when shown; and what set it: `row`, `floor`, `one-way`, `agent`, `baesian`, `answer` or `error` |
| `draw`, `p`, `held_before`, `burn_in`, `drawn` | when held: the card's draw (`drawOf()`), its chance, the row's held cards the gate counted before it, whether that's within the burn-in, and whether it was drawn for audit |
| `draw_proof` | the relay's signature its draw came from, on the relay's record only (M9) |
| `at` | when it ran |

A classifier's model, score and threshold are reserved (D145): the schema is strict, so a v1 reader refuses a record that sets them.

**Status `held`** is computed, never stored: the revision's gate record says held, enforcing, and the revision has no verdict (D150). It isn't in `PENDING`, and the merge gate accepts it.

## The hosted service's proof (M9a)

In a hosted repo only what the service signs counts: every answer, rule, rule retirement, topic merge and preference change (D138), and the relay's gate record (D158). Each names the project it was made in, `project` (B-tf9fc), set by the relay, since one key signs every project's files. [[Formats for v1]] section 7 is the design; `src/trust.ts`, `src/sshsig.ts` and `src/passkey.ts` check it ([[src-trust]]), and the store skips what doesn't count ([[src-store#The hosted service's proof (M9a)]]). Every file here is written once, by the service, and the CLI writes it into the live layer as it pulls (M9d). Nothing here changes a repo that isn't hosted.

**Signature files (D160).** `<file>.sig`, beside each signed file in both layers: OpenSSH's own signature format (PROTOCOL.sshsig), armored as `ssh-keygen -Y sign` writes it, over the file's exact bytes, so no canonical form is needed. The namespace is `baesian` (`NAMESPACE`), the key Ed25519 and the hash SHA-512 or SHA-256. It carries no `format` field: its format is SSHSIG's own version, 1, and a later version is refused by name (`NewerFormat`, kind `signature`). Signed: verdicts, rules (`rules/<id>.md`), rule retirements, topic aliases, preference files, the relay's gate records (`cards/<id>/gate-r<n>-relay.json`) and passkey key files. [[src-verify#Checking an answer by hand]] shows how to check one with `ssh-keygen -Y verify`.

**A file counts** (`Store.judge`) when its `.sig` is a trusted service key's signature in the `baesian` namespace, made while the key was valid at the file's own time (`at`; a rule's `created`) and before any revocation of it; when it's where its bytes say it belongs; when its `project` is the one the repo's config names (B-tf9fc), so a file copied from another of your repos counts nowhere else, and one in a repo whose config names no project doesn't count; for a verdict, when its `card_digest` is the SHA-256 of the card revision's file here (B-f571v), so an answer counts only on the text it answered, and a card rewritten after its answer is unanswered; and, when it needs one, its passkey proof checks. A signature covers the bytes, not the name, so a verdict must be named for its own time, card and revision, a rule or retirement for its rule, a preference file for its own time, and a relay's gate record must be in its card's folder, named for its revision: a copy under another name counts nowhere. A verdict needs one when the revision it answers is hard (the level in force, `Store.levelOf`), whatever its response, since a deferral settles a card at merge too (D139). A preference file needs one when it lets more cards past you than the newest counting file before it, or "Today" in shadow with none: a row moved toward held, enforcing turned on, or a lower `rate_agent_decides`, `rate_sample` or `burn_in`, which brings fewer held cards back to you (D163, B-shndb, `loosening()`). It's compared with that file, not the one its `replaces` names, so a change can't make itself look like tightening.

**Passkey proof** (`PasskeyProof`, D139, D163), `<file without .json>.passkey.json` beside a verdict or a preference file:

| Field | Notes |
|---|---|
| `type`, `format` | `passkey-proof`; 1 |
| `file` | the file it proves, by name, in the same folder |
| `credential` | the passkey's credential ID, base64url |
| `authenticator_data`, `client_data`, `signature` | WebAuthn's assertion as the browser returned it, base64url |

Its client data must be `webauthn.get`, from the service key's `origin`, not in another site's frame, with the challenge the SHA-256 digest of the file's bytes (P16 section 7); its authenticator data must carry the hash of the key's `rp_id` and the user-present and user-verified flags; and its signature must check under a trusted passkey key with the file's `account` and the proof's `credential`, by its COSE algorithm: ES256, EdDSA or RS256 (`PASSKEY_ALGS`).

**The trust files** (D142, D159), in `trust/`, copied into every branch's record by `Store.syncRecord`:

| File | Fields |
|---|---|
| `trust/service-<key>.json` (`ServiceKey`) | `type` `service-key`, `format`; `key`, a slug; `public_key`, `ssh-ed25519 AAAA…` with no comment, as an allowed-signers line takes it; `origin` and `rp_id`, the website's origin and WebAuthn relying party; `valid_after`, and optional `valid_before` |
| `trust/service-<key>-revoked.json` (`ServiceKeyRevocation`) | `type` `service-key-revocation`, `format`, `key`, `reason`, `at`: a file signed at or after `at` doesn't count |
| `trust/passkey-<suffix>.json` (`PasskeyKey`), with a `.sig` | `type` `passkey-key`, `format`, `account`, `handle`, `credential`, `public_key` (SubjectPublicKeyInfo, base64url), `alg` (COSE: -7, -8 or -257), `enrolled` |

**What makes a repo hosted** (`Store.hosted`): keys pinned in CI's settings, whatever the record says, so a commit that drops the record's copy can't switch the checks off (D142); or else a service key in the layer's `trust/`. Pinned, the keys are CI's alone, and the record's copy must match them (`pinProblems()`). Unpinned, the layer's copy is used, its passkey keys only once the service signed them. Revocations count wherever they are, since they only take trust away. M9d adds the config's `service` field as a local switch too.

**The pin** (`pinnedTrust()`): `BAESIAN_TRUST` holds the trust files' JSON, one per line, as `parseTrust()` reads them, with blank lines and `#` comments skipped; or `BAESIAN_TRUST_FILE` names a file of the same lines, for a protected file on a runner. Both may be set. At least one service key must be among them. A pin that's set but empty, or that can't be read, stops every command with `BadTrust`: a misconfigured pin must never turn the checks off quietly.

**The relay's gate record** (D158) is the CLI's format (`GateRecord`, [[#Routing]]) with `by: relay`, signed, and when it holds a card, `draw_proof`: the service's SSH signature, unarmored, in the namespace `baesian-draw` (`DRAW_NAMESPACE`), over `drawMessage()`'s text: `<id> r<revision> <SHA-256 of the card revision's bytes, hex>` and a newline. The draw is the SHA-256 of the raw Ed25519 signature, its first six bytes read as a number from 0 to 1, as `drawOf()` reads the CLI's hash (`drawOfProof()`). Ed25519 is deterministic, so the relay can't redraw, and nobody without its key can predict a draw.

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
| `depends_on`, `supersedes`, `superseded_by`, `conflict_of` | links to those decisions' notes |

**Decision note body:** the title, the question, then one paragraph each, only when set: **Decided** (with what follows from it), **Not chosen** (one or two), **It turned on** (the crux, and the answer that leads to each option), **The fact given**, **Comment**, **First chose** (when the reviewer switched after the agent's pick was shown, D88), **The agent's case**, **The agent's reply**. Then who answered, when, and on which card and revision; who filed it, on which branch and in which deck, and the deck's context notes as links; where the record is, and that editing the note changes nothing. Last, `## Background`, the card's body.

**Rule note frontmatter:** `type: rule`; `format: 1`, the rule note format (D156); `status` (`active` or `retired`); `authority: specifies`; `livedocs: snapshot`; `summary` (the rule's first sentence); `created`, `updated`; `tags: [baesian, rule]`; `aliases: [<rule ID>]`; then `rule` (the rule ID), `topic`, `covers`, `from_card` (a link), `accepted_by`, `accepted` (ISO); and once retired, `retired` (ISO), `retired_by`, `retired_on` (a link to the card it was retired on).

**Rule note body:** the rule's first words as a heading, the rule as a quote, who accepted it and when and from which decision (by ID, since every branch's record holds the rule but not always that card), the gate facts it lets through without a card, and that editing the note changes no rule.

## Commit trailers (D52)

These aren't files, but they're part of the same public interface. They go in the commit message's final trailer block, parsed with git's own rules (`git interpret-trailers --parse`, in `parseTrailers`):

- **`Baesian-Card: <id>`**, one line per card; comma-separated IDs are accepted too. The commit builds on the card. It covers the commit's detected facts whose kind is in the card's `touches` (D53). The post-commit hook writes a ledger entry for it. A changed answer's brief finds the card's commits by this trailer in the history of every branch (B-9v5xj), so they're still found after a rebase, or a squash whose message keeps the trailer in its last paragraph; a ledger entry whose commit is on no branch now is shown as rewritten.
- **`Baesian-Ack: <fact-id> <reason>`** acknowledges a detected decision as a two-way door. The fact ID is the one the gate prints (`dep:httpx`, `schema:<path>`, `infra:<path>`, and later `api:<symbol>`). The reason is required.

## Decided points of P12 (2026-11-01, 2026-11-02)

- **D105:** cards don't record the folder they were filed from (`source_worktree` is gone).
- **D106:** `notify` lives only in the personal config, as above.
- **D107:** verdict files are named timestamp first.
- **D119** (2026-11-02): a rule is retired by an answer that breaks it, in a file beside the rule.
- **D120:** a ledger entry names just the commit.
- **D121:** attachments don't record the folder.
- **Conflict links** (D45), once open here, are the card fields `conflict_of` and `caught_at`.
