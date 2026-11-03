---
type: design
status: draft
authority: proposes
summary: "Proposal P16, its eight cards accepted as D156–D163: every on-disk format change v1 needs before versioning starts (D108): a format number in every file, preference files, gate records and the held status, audit and convention cards, reviewer accounts, signatures and passkey proofs and how verify checks them, and the relay's files with the encryption field reserved; eight open choices are drafted as cards in deck formats-v1."
created: 2026-11-03
tags: [baesian, design, formats]
---

# Formats for v1

> **Status: proposal P16 (2026-11-03). Its eight cards were accepted as D156–D163 the same day, each the agent's pick; the rest is the agent's, standing unless the user overturns it. Section 1, the format numbers, is built.** An agent drafted it from D108 and D124–D155, [[Routing and Preferences]] (P14) and [[Hosted Service]] (P15). Only what cites a D-number is decided. Everything else is the agent's recommendation. The eight open choices that matter most are drafted as cards in deck formats-v1 ([[#10. Decisions for the user]]). Once decided, each change is described in [[File Formats]] and defined in `src/schema.ts`.

From v1 on, a change to an on-disk format needs a version and a migration (D108). So every format change v1 needs is designed here, while formats are still free. [[File Formats]] stays the description of what's built. This note proposes what changes.

**How to read it.** Names in backticks exist in the code today. New files, fields and commands are in plain text. Every file follows [[File Formats#Rules that apply to every file]]: written once unless marked mutable, flat, and with status computed, never stored.

## In brief

- **A format number in every file** (D108). Readers upgrade older files in memory and never rewrite one, so signatures and old commits stay valid.
- **Preference files** (D146–D148): one file per change, holding every row's position. Only the client writes them, and the service signs them when hosted.
- **Gate records** (D144, D145, D148, D150): one per card revision and per writer, beside the card. Each records what the gate read, the settings it applied, its outcome, whether it ran in shadow, and the audit draw.
- **A held status** (D150), computed in `Store.status` from the gate record. The merge gate accepts it.
- **Audit cards need no new file** (D151). The blind choice and the final answer already have fields. One optional flag is proposed.
- **Convention cards** (D126). Baesian finds patterns in your answers with no model and files a fixed "make these one rule?" card. Saying yes runs the rule-draft path that already exists (D109, D110).
- **Who answered** (D138, D139, D153): an account field on everything a person writes, a signature file beside each, a passkey proof beside hard-card answers, and the keys verify trusts, pinned in CI (D142).
- **The relay** (D127, D128, D137): two config fields, a local state file, a personal grant file, and the relay's entry format, with the encryption field reserved.

## What stays as it is

Every format in [[File Formats]] stays as accepted (D124), apart from the changes named below. In particular:
- **Card revisions** keep every field. `level` keeps the meaning D144 gave it: the level the agent asked for, raised by the hard floors.
- **Verdicts** keep `first_choice` and `make_rule`. Audits and convention cards reuse them.
- **Rules, rule retirements and topic aliases** keep their fields, and so do the rule-draft fields `rule` and `rule_covers`.
- **Ledger entries, decks, attachments, fallbacks, withdrawals, presence, waiting markers, the server file and the last port** are unchanged, but for the format number.
- **Commit trailers** (D52) are unchanged. They need no version: a new meaning would get a new trailer name.

## 1. A format number in every file (D108)

> **Built (2026-11-03), as D156 and D157 decided,** with one change from this section: no record is rewritten at v1. A file with no `format` was written before v1, and reads as format 1, so old commits stay readable as they are (the main session's decision, replacing the last point below). [[File Formats#Rules that apply to every file]] describes it, `FILE_KINDS`, `upgradeFile()` and `NewerFormat` in `src/schema.ts` define it, and [[src-store]] says how the store reads and writes it.

| Field | Type | Required | Meaning |
|---|---|---|---|
| format | integer ≥ 1 | yes, in every file Baesian writes; optional in `Config`, `UserConfig` and card drafts (`CardDraft`), which people write by hand | the version of this kind of file's format. v1 writes 1 everywhere |

- **Numbered per kind of file.** A change to the card format makes cards format 2 and leaves verdicts at 1. The field sits right after `type`, in JSON and in frontmatter.
- **Old files are read, never rewritten.** Each later format comes with an upgrade from the one before, applied in memory as a file is read. Writers write only the newest. The reasons:
  - files are written once (D34);
  - CI checks each commit against its own record (`checkCommit()`), so old commits keep old files;
  - signatures and passkey proofs cover a file's exact bytes (D138, D139).

  So a file must say what it is for as long as it exists. Mutable local files (cursors, presence, waiting markers, the server and relay state) are rewritten in the new format the next time they're written.
- **Where the number lives,** in each file or once per store: **decision,** card formats-1: in each file (D156).
- **Newer files are refused,** with a message naming the format and the Baesian that reads it: "this record has card format 2; this Baesian reads up to 1: upgrade it". Schemas stay strict, as now. **Decision:** card formats-2: refused (D157). As built, the message names the file: "cards/B-7f3kq/r1.md has card format 2; this Baesian reads up to 1: upgrade Baesian".
- **The inbox cursors** (`cursors/<branch>.json`) get a schema, with `type` and format. They're the only files Baesian writes that have none.
- **The relay's protocol** carries its own version, in its address (section 8).
- **Before v1,** no migration is written (D108). ~~At v1, this repo's record, the only one there is (D117), is rewritten once by a throwaway script, so v1 starts with every file at format 1.~~ Replaced: a file with no `format` reads as format 1, and nothing is rewritten, since CI checks every commit against its own committed record.

## 2. Preference files (D146, D147, D148)

- **Path:** preferences/{at}-{suffix}.json, in the live layer and the record. It's named timestamp first, like verdicts (D107).
- **Written once.**
- **Written by** the client only, through a new local server endpoint beside `POST /api/verdicts`. In a hosted repo the relay writes it, from a signed-in session, with a signature file beside it (section 7). Never in `Config` (D147).

| Field | Type | Required | Meaning |
|---|---|---|---|
| type | preferences | yes | |
| format | 1 | yes | |
| mode | shadow or enforce | yes | shadow records what the gate would hold, and holds nothing (D148) |
| row_public_api, row_schema, row_dependency, row_infra, row_user_facing, row_security, row_privacy, row_other | each one of agent-decides, sample, tell-me, stop-and-ask, never-without-me | yes, all eight (row_privacy since card B-z3agk) | each row's position, on P14's scale. row_other is for cards with no fact. row_security may not be below tell-me (D146) |
| rate_agent_decides, rate_sample | number from 0 to 1 | yes | the chance that a held card at each of the two low positions is drawn for audit |
| burn_in | integer ≥ 0 | yes | how many of each row's first held cards are all drawn |
| profile | string | no | the preset it started from |
| replaces | file name | yes, except on the first | the preference file this change was made from |
| from_card | card ID | no | the slider-move card it came from (section 6) |
| reason | string | no | the person's note |
| by, account, client, at | strings; timestamp | by, client and at yes; account when hosted | who changed it, their account (section 7), which client wrote it (D62), and when |

- **The newest is in force:** the newest by name locally, or by the relay's sequence when hosted. The rest are the history.
- **Every row is required,** rather than "missing means the default". So a file means the same thing whatever a later Baesian's presets are. A row added later, such as P14's research rows (item 16), is a format 2, whose upgrade fills it in.
- **Money, data loss and publishing have no key.** They're fixed at "never without me" (D146).
- **A change made from an old view is refused.** If its replaces isn't the newest file, it's refused, as a verdict on a stale revision is (409). So two tabs can't silently undo each other. *Strongest alternative, not drafted as a card:* each file records one row's move, and the settings in force are every move applied in order. That merges moves made at once, but verify would have to replay the whole history to know the settings.
- **The values** (the presets, the audit rates and the burn-in) are P14 items 10 and 14, still open. The file holds whatever they become.
- **Does loosening take your passkey?** In a hosted repo, a change that lets more cards past you could also need your passkey, and carry its proof, as a hard-card answer does. **Decision:** card formats-8.

## 3. Gate records (D144, D145, D148, D150)

The gate runs at filing, over each card's stated facts (D145). Its record is stored rather than computed, because the settings it applied and its draw must be fixed when it runs.

- **Paths:**
  - cards/{id}/gate-r{n}-cli.json, written by `baesian file`, `baesian revise` and the MCP server's file_card, through `Store.fileCard` and `Store.reviseCard`;
  - cards/{id}/gate-r{n}-relay.json, in a hosted repo, written by the relay when the card arrives, with a signature file beside it.
- **Both written once,** in the live layer and the record. `Store.syncRecord` already copies everything in a card's folder.

| Field | Type | Required | Meaning |
|---|---|---|---|
| type | gate | yes | |
| format | 1 | yes | |
| card, revision | card ID; integer | yes | the revision it gated |
| by | cli or relay | yes | where it ran |
| gate | string | yes | the rules' version, such as rules-1 |
| mode | shadow or enforce | yes | copied from the preferences; shadow when there are none |
| preferences | file name | no | the preference file it applied. Absent when there was none, so the "Today" preset applied, in shadow (P14) |
| touches, reverse | list of facts; cheap, moderate or one-way | yes | what it read from the card |
| asked | provisional, blocking or hard | no | the level the draft asked for. Absent when the draft set none. An agent's level only raises the outcome (D144), so a draft that sets provisional asks to be shown |
| row, position | row name; position | yes | the strictest row the card fell in, and that row's position. The fixed rows are money, data_loss and publishes |
| outcome | shown or held | yes | in shadow, what it would have done |
| level | provisional, blocking or hard | when shown | the level it showed the card at |
| reason | row, floor, one-way, agent, baesian, answer or error | yes | what set the outcome: the row's position; a floor (D146); the one-way rule (P14 item 12, open); the agent's level (D144); a card Baesian filed, always shown; a revision that follows your answer, always shown; or the gate failing, which shows the card |
| drawn, p | boolean; number from 0 to 1 | when held | whether it was drawn for audit, and the chance it had |
| burn_in | boolean | no | it was drawn because its row's first held cards are all drawn |
| draw_proof | string | on the relay's record | the relay's signature the draw came from (below) |
| model, score, threshold | | reserved | for a classifier later (D145). A v1 reader refuses a record that sets them |
| at | timestamp | yes | when it ran |

- **One per revision and per writer.** A card the agent revises after its parent was decided otherwise (D80) is a new decision, so it's gated again. A revision that follows your answer, or a reply (D104), is shown.
- **The level in force** is the highest of the card's `level` and the levels in its gate records that count. The card file isn't changed, since it's written once. The commit gate's check for hard cards (in `evaluate()`) reads the level in force, not the card's alone. That's a change of behaviour, not of format.
- **The draw.**
  - The CLI computes it from the card's ID and revision: a hash, read as a number between 0 and 1. So verify can recompute it.
  - The relay computes it from its own signature over the card's ID, revision and file digest, stored as draw_proof. Ed25519 signatures are deterministic, so verify can recompute this draw too. But nobody without the service's key can predict it, so an agent can't choose card IDs that won't be drawn.
- **When records disagree,** the card is shown, at the higher level, and the client reports the mismatch (P14).
- **Which record counts in a hosted repo,** only the relay's signed one or the CLI's too: **decision,** card formats-3. Locally the CLI's counts, on D62's convention, as a verdict does.
- **verify rechecks it.** For each gate record that counts, `verify()` checks two things. The preference file it names must be in the record, and signed when hosted. And the rules must give the same outcome, level and draw from the card and that file. A record that doesn't match fails, like an uncovered fact.

## 4. The held status (D150)

`Status` gains held. `Store.status` computes it. Nothing stores it.

- **A card is held** when two things are true: the gate record that counts for its latest revision says held, under enforce; and the card has no verdict on any revision. A shadow record never makes a card held.
- **It's checked after** withdrawn, superseded and returned by a parent (D14, D80), and before the latest verdict. Any verdict ends it. An answered held card is resolved, returned, deferred or rerouted like any other.
- **`PENDING` doesn't include it,** so held cards stay out of the queue and out of the lists of cards that need you, unless drawn for audit (section 5).
- **`checkMerge()` accepts it,** with a note, as it accepts a deferred card (D150). No verdict is written, so D32 stands.
- **`baesian wait` returns at once** on a held card, as "no verdict yet" (exit 5). Agents need no new exit code (P14).
- **The agent's reading of D150:** a held card drawn for audit still counts as settled at merge ("any held card can be answered later, and audits do"). An audit that overturns a merged decision then meets P14's open question on overturns after merge.

## 5. Audit cards (D151)

An audit card is a held card whose gate record says drawn. It needs no new file and no new card field.

**What's shown blind,** before you choose, is what any card shows before the reveal (D86):
- the stakes line, from `level` and `reverse`;
- the title, `doing` and the question;
- the two options, each with its `then`, sides shuffled;
- the crux, its two answers, and `crux_fact`.

A label says it's an audit of a decision the agent went ahead on, without saying which option it took.

**What's hidden until you've chosen,** because on a held card each one gives away the agent's pick: the pick itself, `rationale`, `serves`, the body, the "already acted" facet (`acted`, `acted_option`), the ledger's commits, and the gate record.

**The two answers are kept** in fields `Verdict` already has:
- `first_choice` is your blind choice (D88's field);
- the response and `choice` are your final answer, after seeing what's built. accept keeps the agent's pick; alternative or correction overturns it, with the rework the ledger feeds (D15, D81).

**The same flow for every held card,** drawn or opened from the "Held back" list. So the verdict needs no flag saying which. Whether a card was drawn is in its gate record.

**One optional field, if P14 item 9 counts it as a miss:** should_have_asked, a boolean on `Verdict`, set only on held cards ("you should have asked me", P14). It's proposed now so that the first measurement doesn't need a verdict format 2.

**Unanswered audits** are computed (drawn, held, no verdict), never stored, and never count as fine.

## 6. Convention cards (D126)

D16 gives rules two routes: the "make this a rule" box on an answer, and convention cards mined from your answers. The first is built:
1. the box sets `make_rule` on the verdict;
2. an agent drafts the rule and its gate patterns with `baesian rule` (`Store.draftRule`, D109);
3. the draft reaches you as a card, and accepting it saves the rule (D110).

This section designs the second route so that it reuses the first.

### How a candidate is found

Baesian looks with no model, as it does for conflict cards (D65). It looks after a verdict resolves a card, wherever Baesian next reads that verdict: in the local server when it records it, or in the CLI when it pulls it from the relay. There are two signals, from [[Baesian Design#Learning conventions]]:
- **The same kind of decision, decided the same way:** at least two resolved decisions in the same area (the first segment of their canonical topic) whose chosen answers are alike, by the similarity the filing check uses for titles.
- **A comment that states a rule:** an answer whose comment uses rule words, such as "always", "never", "from now on" or "in general".

A decision is evidence for one convention card at most. So a pattern you've declined is proposed again only from new decisions. The thresholds and the word list are the agent's guesses, to tune while dogfooding.

### The card

A convention card is an ordinary card that Baesian files itself, with fixed wording, as it files conflict cards (D94) and builds rule drafts (`Store.draftRule`).

| Field | Value |
|---|---|
| title | "A pattern in your answers on {area}" |
| question | "Should these {n} decisions become one rule?" |
| doing | "reading your answers for patterns" |
| topic | conventions/{area}/{the first decision's ID}: one question per pattern (D112) |
| proposal, proposal_then | "Draft a rule from these": an agent drafts the rule and its gate patterns, and it comes back to you to confirm |
| alternative, alternative_then | "Keep them separate": nothing is saved, and these decisions aren't proposed again |
| crux, crux_proposal, crux_alternative | "Would you decide the next one like these the same way, unasked?"; "If so"; "If it depends" |
| crux_fact | the evidence: each decision's title and what you chose, or the comment |
| depends_on | the decisions it came from |
| level, reverse, touches | provisional; cheap; none |
| source_agent | baesian |
| convention | **new:** which signal found it, same-choice or rule-words. Only Baesian sets it; a draft can't carry it |

**Accepting it counts as asking for a rule.** The client sets `make_rule` on the verdict. So `Store.ruleAsked` is true for the convention card, the inbox tells an agent, and the agent runs `baesian rule` on it. The draft that follows depends on the convention card. Accepting the draft saves `rules/<id>.md`, whose `from_card` names the convention card, and through that card's `depends_on`, the decisions. So `RuleMeta`, `Verdict` and the draft fields don't change. The only new field is convention.

**Which agent drafts it.** Today the inbox tells only the agents on the card's own branch. For a convention card it tells any agent in the repo that runs `baesian inbox`, whatever its branch, since the evidence can span branches. The check `Store.draftRule` already makes, one draft per decision, stops a second agent drafting it too.

**Whether Baesian asks first like this,** or an agent drafts the rule straight away so you see one card instead of two: **decision,** card formats-6.

### Slider moves, if P14 is accepted

P14 proposes "move this slider?" cards that Baesian files from the audit record (P14 section 3). They aren't decided. If they're accepted, they're convention cards too, with three new fields, which only Baesian sets:

| Field | Type | Meaning |
|---|---|---|
| pref_row | a row name, as in the preference file | the row to move |
| pref_from, pref_to | positions | the move |

Accepting one writes a new preference file whose from_card names the card. The evidence goes in `crux_fact`, so you see it before choosing.

## 7. Who answered, and the proof (D138, D139, D142, D153)

### The reviewer's account

In a hosted repo, the relay writes everything a person writes, from a signed-in session (P15).

| Field | Where | Meaning |
|---|---|---|
| account (**new**, optional) | `Verdict`, `RuleMeta`, `RuleRetirement`, `TopicAlias`, preference files | the stable ID of the signed-in account. It's Baesian's own ID, never a Globus identity, because a Globus account's primary identity can change (D153; [[Sign-in for the Hosted Service]], F3) |
| `reviewer`, `accepted_by`, `by` (unchanged) | the same files | locally, git's `user.name` (`reviewerName()`); hosted, the account's handle |
| `client` (unchanged) | `Verdict`, preference files | new values for the hosted client: hosted-desktop and hosted-phone (D130) |
| `at` (unchanged) | the same files | hosted, the relay's clock, so a key's validity is checked against a time the agent didn't write |

Locally nothing changes: D62's convention and audit trail stand.

### Signature files

- **Path:** the signed file's path with .sig added, in the same layers.
- **Written once,** by the relay. The CLI writes it into the live layer when it pulls, and `Store.syncRecord` copies it with its file.
- **Signed files:** verdicts, rules, rule retirements, topic aliases, preference files, the relay's gate records, and passkey key files.
- **What's signed:** the file's exact bytes, so no canonical form is needed (P15).
- **The encoding,** OpenSSH's signature format or a small JSON file: **decision,** card formats-5.

### Passkey proofs on hard-card answers (D139)

- **Path:** verdicts/{the verdict's file name, without .json}.passkey.json, beside the verdict, in both layers.
- **Written once,** by the relay, from the browser's assertion.

| Field | Type | Required | Meaning |
|---|---|---|---|
| type | passkey-proof | yes | |
| format | 1 | yes | |
| file | file name | yes | the verdict it proves |
| credential | base64url | yes | the passkey's credential ID |
| authenticator_data, client_data, signature | base64url | yes | WebAuthn's assertion, as the browser returned it |

The relay sets the WebAuthn challenge to the SHA-256 digest of the verdict file's bytes. The verdict holds its card, revision and time, so the challenge is unique without a separate nonce. If card formats-8 goes that way, a preference change that loosens gets the same proof beside it.

### The keys verify trusts (D142)

All in the live layer and the record, under trust/, written once, and copied into every branch's record by `Store.syncRecord`:

| File | Fields | Written by |
|---|---|---|
| trust/service-{key}.json | type service-key; format; key, its ID; public_key, Ed25519; origin and rp_id, the website's origin and WebAuthn relying party, for passkey checks; valid_after; valid_before, optional | the CLI, from the relay, at sign-in and sync |
| trust/service-{key}-revoked.json | type service-key-revocation; format; key; reason; at | the same |
| trust/passkey-{suffix}.json, with a .sig | type passkey-key; format; account; handle; credential; public_key, SPKI in base64url; alg, its COSE number; enrolled | the same, when you enrol a passkey on the website |

The service's key is pinned in CI's protected settings, outside the repo, and the record's copy serves checks on your machine (D142). **Where verify finds the passkey keys,** pinned in CI too, or in the record with each new key vouched for by one already trusted: **decision,** card formats-4. Under the second, a passkey key file also names the key that vouched for it, with that key's proof beside it.

### How `baesian verify` checks them

**What makes a repo hosted.** In CI, the pinned keys do. When CI's settings pin a key, verify requires signatures whatever `Config` says, so a commit that removes the service from `Config` can't switch the checks off. Locally, `Config`'s service field turns them on for the commit gate, and CI is the backstop.

In a hosted repo, `verify()` checks every person-written file in each commit's record, as `checkCommit()` reads it. The commit gate checks the staged record the same way. A file counts when:
1. its .sig is present;
2. the signature matches the file's bytes, under a key CI pins (locally, the record's copy), valid at the file's own time and not revoked before it;
3. the record's service keys match CI's pinned keys. A key in the record that CI doesn't pin fails the run (D142);
4. for an answer on a hard card (the level in force on the revision it answers), a passkey proof is beside it, and:
   - its client data has the type webauthn.get, the pinned origin, and a challenge equal to the verdict's digest;
   - its authenticator data has the relying party's hash and the user-verified flag;
   - its signature checks under a trusted passkey key for the verdict's account;
5. for a held card, its gate record counts (card formats-3) and rechecks (section 3).

**A file that doesn't count is ignored, not an error** (D138). A verdict written on the machine is skipped, with a note. A card left without an answer that counts is then unanswered, and the merge gate fails as it does today. pre-commit copies into the record only files that count (P15).

Nothing here needs the network, so CI works offline (D127). Node's own crypto can check Ed25519, ECDSA and RSA signatures, so no new dependency is needed (the agent's knowledge, *unverified* against Node's documentation here).

## 8. What the relay needs in files (D127, D128, D137)

### `Config`

| Field | Type | Required | Meaning |
|---|---|---|---|
| service | URL | no; set with project | the hosted service's address |
| project | string | no; set with service | the project's random ID on the service. It's no secret, since `.baesian/config.json` is committed |

### Relay state (new, live layer only)

- **Path:** relay.json in the live layer.
- **Mutable,** rewritten through a temporary file and a rename, as presence is.
- **Written by** the CLI whenever it syncs. Never in the record, and never sent.

| Field | Type | Meaning |
|---|---|---|
| type, format | relay; 1 | |
| service, project | as in `Config` | which relay this state is for |
| pulled | integer | the last sequence number pulled |
| uploaded | list of paths | the live-layer files the relay has acknowledged |
| at | timestamp | the last sync |

### The machine's grant (new, personal)

- **Path:** grants/{project}.json in Baesian's user config directory, beside the file `UserConfig` describes, readable only by the user (mode 0600).
- **Mutable.** Written by the new command baesian login, and removed by baesian logout (P15). Never in a repo.
- **Fields:** type grant, format, service, project, machine (the name the website shows), access_token, access_expires, refresh_token.

Where tokens are kept, this file or the OS keychain, is still P15's open choice. With a keychain, this file holds no token.

### The relay's entry, with the encryption field reserved (D137)

The relay keeps one entry per file, in an append-only log, and sends entries down in this form. It's part of the relay's protocol, a public interface at v1, versioned in its address (/v1/).

| Field | Meaning |
|---|---|
| seq | the repo's sequence number for it |
| path | the file's path in the live layer |
| format | the file's format number |
| size, digest | its length, and its SHA-256 digest |
| body | its bytes, in base64. Dropped once it's delivered and its card resolved (D137); the rest of the entry is kept |
| sig | the signature file's bytes, for the signed kinds |
| machine | which signed-in machine uploaded it, if a machine did (card formats-7) |
| at | when the relay accepted it |
| enc | **reserved** for encryption (D137). Absent in v1. A v1 reader refuses an entry that sets it, so an encrypted entry from a later version fails loudly rather than being read as text |

- **Signatures cover the plaintext file's bytes,** through its digest. So if entries are encrypted later, the browser can supply the digest, and the service can still sign it without reading the file.
- **No file on disk carries the encryption field.** Files in the repo are plaintext either way.
- **`Presence` and `Waiting` are unchanged,** but for the format number. In a hosted repo their values also travel through the relay (P15).
- **Whether a card names its machine,** or only the relay knows: **decision,** card formats-7.

## 9. Every new or changed file

| File or format | Layers | Once or mutable | Written by | Serves |
|---|---|---|---|---|
| format, in every file (built) | all | — | whatever writes the file | D108, D156, D157 |
| preferences/{at}-{suffix}.json | live, record | once | the client; hosted, the relay | D146–D148 |
| cards/{id}/gate-r{n}-cli.json | live, record | once | `Store.fileCard`, `Store.reviseCard` | D144, D145, D148 |
| cards/{id}/gate-r{n}-relay.json | live, record | once | the relay | D138, D145 |
| `Status`: held | computed | — | `Store.status` | D150 |
| `Verdict`: should_have_asked | live, record | once | the client | D151; P14 item 9 |
| `CardMeta`: convention; pref_row, pref_from, pref_to | live, record | once | Baesian only | D126; P14 |
| account, on `Verdict`, `RuleMeta`, `RuleRetirement`, `TopicAlias` and preference files | live, record | once | the relay | D138, D153 |
| {file}.sig | live, record | once | the relay | D138 |
| verdicts/{name}.passkey.json | live, record | once | the relay | D139 |
| trust/service-{key}.json and its revocation | live, record, CI's settings | once | the CLI, from the relay | D142 |
| trust/passkey-{suffix}.json | live, record | once | the CLI, from the relay | D139 |
| `Config`: service, project | record | mutable | `baesian init`, baesian login | D127 |
| relay.json | live | mutable | the CLI | D127 |
| grants/{project}.json | personal | mutable | baesian login | D128 |
| the relay's entry, with enc reserved | the relay | once | the relay | D127, D137 |
| cursors, with a schema (built: `Cursor`) | live | mutable | `baesian inbox`, `baesian wait` | D108 |

**Behaviour that changes with them,** not formats:
- **`Store.syncRecord` copies preference and trust files, and rules, into every branch's record,** so CI rechecks each commit with what the local gate saw. Today a rule reaches only the record of the worktree where it was saved, so this branch's record has no rules at all.
- **The local server** gains an endpoint to write a preference file.
- **`baesian file`** prints the gate's outcome.
- **The `AGENTS.md` block** says that a held card means "proceed, as provisional", and that agents never write preference files, the relay's gate records, signatures or trust files.

## 10. Decisions for the user

Filed as cards in deck formats-v1 on 2026-11-03, in the order they're best answered:

| Card | Topic | Question | Recommended | Strongest alternative |
|---|---|---|---|---|
| formats-1, B-f8k47: **D156** | formats/version-field | Where does a file's format version live? | in every file | once per store |
| formats-2, B-v7zn5: **D157** | formats/newer-format | What does an older Baesian do with a newer file? | refuse it, naming the version | read what it knows |
| formats-3, B-sa8tg: **D158** | formats/hosted-gate-record | Which gate record holds a card back in a hosted repo? | only the relay's signed one | the CLI's, rechecked by verify |
| formats-4, B-7hjag: **D159** | formats/passkey-keys | Where does verify find the reviewer's passkey keys? | pinned in CI | in the record, each new key vouched for by an old one |
| formats-5, B-grj9v: **D160** | formats/signature-encoding | How are the service's signatures encoded? | OpenSSH signatures | a small JSON file |
| formats-6, B-8sx1w: **D161** | formats/mined-rules | How does a rule found in your answers reach you? | Baesian asks first | an agent drafts it at once |
| formats-7, B-e907q: **D162** | formats/card-machine | Does a card name the machine that filed it? | only the relay knows | a field on every card |
| formats-8, B-8yxrt: **D163** | formats/preference-proof | Does loosening a preference take your passkey? | yes | the service's signature only |

**The agent's choices in this note, not drafted as cards,** for the user to overturn:
- a preference file holds every row, and a change made from an old view is refused (section 2);
- a gate record per revision and per writer, with the draw as in section 3;
- one held status for drawn and undrawn cards, and the reading of D150 in section 4;
- should_have_asked, proposed now (section 5);
- the convention signals and their thresholds, and convention cards reaching every branch's inbox (section 6);
- account as Baesian's own ID, and `at` set by the relay (section 7);
- the passkey challenge as the verdict's digest, with no separate nonce (section 7);
- ~~this repo's record rewritten once at v1 (section 1)~~: replaced, a file with no format reads as format 1.

**Still open in P14 and P15, and only held by these formats:** P14 items 9, 10 and 12 to 17; P15's grant scope and token storage, retention periods, notification text, and the relay's API boundary.

## Open questions

- **Overturns after merge** (P14): an audit can overturn a merged decision, and where its rework brief goes isn't settled.
- **Several reviewers** (P15): the account field is ready for them. Whose passkey keys are trusted, and who may change preferences, aren't.
- **Forks and mirrors** share the project ID in `Config` (P15).
- **Agents seeing their draws** (P14): the CLI's draw is visible at once. Under formats-3's recommendation the relay's isn't, until it's pulled.
- **Recovery after losing every passkey** depends on formats-4.
