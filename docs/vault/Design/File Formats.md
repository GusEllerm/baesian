---
type: design
status: active
authority: specifies
summary: "Baesian's file formats (accepted as D124): card revisions (with the M4 card content: question, trigger, two options, crux, facets), verdicts, withdrawals, ledger entries, decks, rules, topic aliases, attachments, waiting markers and config; where each lives, and which are immutable. Defined in src/schema.ts."
created: 2026-10-23
updated: 2026-11-03
reviewed: 2026-10-23
tags: [baesian, design, formats]
---

# File Formats

> **Status: accepted (D124, 2026-11-02).** These formats are implemented as described here, and the user has accepted them: the card revision and verdict tables and the open points D105–D107 (2026-11-01), then the open points found in the other files, D119–D121, and the rest of the other files (2026-11-02). Compatibility between Baesian versions isn't a concern until a v1 is published (D108), so these formats stay free to change until then. A review of them, for git workflows and for what the record exposes, comes just before publishing.

The definitions are the Zod schemas in `src/schema.ts`. This note describes them for people, and livedocs binds it to them: a change to a schema blocks the commit until this note is reconciled.

## Rules that apply to every file

- **Immutable.** Every file except the config files, the inbox cursors, the presence heartbeat, the waiting markers and the server file is written once and never edited (D34). The store writes with an exclusive create, so a second write fails. Status is computed from the files, never stored.
- **Flat.** Frontmatter and JSON have no nested objects. Lists of strings are fine. Empty lists and unset fields are left out when writing.
- **IDs.** Cards are `B-` plus five Crockford base32 characters (`B-7f3kq`), and rules are `R-` plus five. The alphabet is lowercase and has no `i`, `l`, `o` or `u` (D51). A new ID is checked against the live layer and retried on collision (`newId`).
- **Two layers (D34).** Everything is written to the live layer, `.git/baesian/`. The record, `.baesian/` in the worktree, receives copies of the files for the cards the branch filed or attached to (D37).

## Files

| File | Schema | Live | Record | Written by |
|---|---|---|---|---|
| `cards/<id>/r<n>.md` | `CardMeta` + body | yes | yes | `baesian file`, `baesian revise` |
| `cards/<id>/withdrawn.json` | `Withdrawal` | yes | yes | `baesian withdraw` |
| `cards/<id>/fallback-<suffix>.json` | `Fallback` | yes | yes | `baesian wait`, on a blocking card with no verdict (D46) |
| `verdicts/<at>-<id>-r<n>-<suffix>.json` | `Verdict` | yes | on sync | the client only (D32); named timestamp first, so a listing is in order (D107) |
| `ledger/<id>-<suffix>.md` | `LedgerMeta` + body | yes | on sync | the git gate (M3) |
| `decks/<deck>.md` | `DeckMeta` + body | yes | yes, with its cards | `baesian deck`; the branch deck on first use |
| `rules/<id>.md` | `RuleMeta` + body | yes | yes, at once in the client's worktree, and on sync in every other | the client (M4) |
| `rules/<id>-retired.json` | `RuleRetirement` | yes | yes, as rules | the client, with an answer that breaks the rule (D119) |
| `topics/alias-<suffix>.json` | `TopicAlias` | yes | yes, as rules | the client (M4) |
| `attachments/<id>-<suffix>.json` | `Attachment` | yes | no | `baesian attach` |
| `cursors/<branch>.json` | — (`at`, and `delivered`: what `wait` has delivered since) | yes (mutable) | no | `baesian inbox`, and `baesian wait` |
| `cursors/<branch>/<session>.json` | — (`at`): one session's own place in the branch's inbox (B-ghhym, provisional) | yes (mutable) | no | `baesian inbox --session`, run by the plugin's hooks |
| `presence.json` | `Presence` | yes (mutable) | no | the client's heartbeat (D41) |
| `waiting/<id>-<suffix>.json` | `Waiting` | yes (mutable) | no | `baesian wait`, while it waits (D90) |
| `server.json` | `ServerInfo` | yes (mutable, readable only by the user) | no | `baesian serve`, while it runs (D97) |
| `port.json` | `LastPort` | yes (mutable) | no | `baesian serve`, kept after it stops (D103) |
| `config.json` | `Config` | no | yes (mutable) | `baesian init` |
| `~/.config/baesian/config.json` | `UserConfig` | — | — | the user; never in a repo |

## Card revision

A card is a directory of revisions. Each revision is a whole card: the agent's reply to a returned card is a new revision, not an edit.

The fields below come from the decisions about card content (D66, D73–D79, D92–D95). Frontmatter stays flat, so the crux and the facets are prefixed keys rather than nested objects.

Frontmatter (`CardMeta`):

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `card` | | |
| `id`, `revision` | card ID, integer ≥ 1 | | filled in by Baesian |
| `title` | string | yes | a neutral short name, not a question ("Where the access token lives"). A settled decision is shown as its title plus its outcome |
| `question` | string | yes | the decision, as a neutral question |
| `doing` | string | yes | one short line, in the agent's voice, on what it was doing when the decision came up (D73) |
| `topic` | slash-separated key | yes (D66) | `storage/run-metadata`; canonicalised through aliases (D38, D44). It names one question (D112): a second card on it is a possible duplicate, the earlier answer is its precedent, and two branches answering it differently conflict at merge. A follow-on question gets its own, narrower topic |
| `deck` | deck ID | | defaults to the branch deck, `branch-<branch>` (D29) |
| `level` | `provisional` \| `blocking` \| `hard` | | defaults to `hard` when `touches` includes `publishes`, `security`, `money` or `data-loss` (D42), otherwise `provisional` |
| `touches` | list of facts | | the D11 checklist: `schema`, `public-api`, `dependency`, `infra`, `user-facing`, `publishes`, `security`, `money`, `data-loss`. Also decides which gate facts a `Baesian-Card:` trailer covers (D53) |
| `reverse` | `cheap` \| `moderate` \| `one-way` | yes (D95) | how costly the decision is to undo. It decides the stakes line and feeds rarity |
| `proposal`, `proposal_then` | strings | yes | the agent's pick, named in a few words, and what happens if it's chosen |
| `alternative`, `alternative_then` | strings | yes | the strongest alternative (D12, D93), and what happens if it's chosen |
| `also_considered` | list | | other options the agent considered, by name; not shown on the card (D93) |
| `crux` | string | yes | the one question the choice turns on (D74) |
| `crux_proposal`, `crux_alternative` | strings | yes | the answer that leads to each option ("If it does", "If it doesn't") |
| `crux_preference` | boolean | | the crux is about what the reviewer values, not a fact |
| `crux_fact` | string | | a fact that bears on the crux |
| `rationale` | string | | why the agent picks the proposal (D77) |
| `wrong_if`, `check` | strings | when a facet asks | what would show the pick is wrong, and where to look. Required when `reverse` is `one-way`, when `touches` includes `security`, or when `premise` is set (D77) |
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
| `confidence` | optional 0–1 | | recorded, not used for routing (D3) |
| `domain`, `evidence` | lists | | routing tags; links |
| `source_agent`, `source_branch`, `created` | | | filled in by Baesian. `source_agent` is free text, so it can name a persistent agent rather than the harness. The folder a card was filed from isn't recorded (D105) |

**Body:** optional Markdown context, shown with the agent's reasoning (D92). Nothing in it is checked.

What an agent writes is a **draft** (`CardDraft`): the same frontmatter without the fields Baesian fills in. `deck` and `level` are optional.

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
| `reviewer`, `client`, `at` | `client` names the client that wrote it (D62). `at` is strictly increasing per card, so the latest verdict is unambiguous |

## The others

- **Withdrawal** (`Withdrawal`): `card`, `reason`, `by`, `at`. One per card.
- **Ledger entry** (`LedgerMeta`): `card`, `branch`, optional `commit`, `at`. One per card a commit cites. The body is one line naming the commit (D120): what the commit changed is git's to say. Entries written before D120 also list the commit's files.
- **Deck** (`DeckMeta`): `id`, `title`, optional `branch` and `from` (the source document, relative to the repo), `context_notes` (vault wikilinks), `created`. The body is the briefing. Membership isn't stored: it's computed from the cards' `deck` fields, so a deck never needs editing.
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
- **Config** (`Config`): optional `vault`, and optional detector paths: `gate_schema` and `gate_infra` replace the defaults, `gate_ignore` adds to them, and `gate_api` lists the public modules that turn on the `api:` detector (D59). It's committed, so it holds only what's shared by everyone working on the repo. Keys stay flat, like everything else.
- **User config** (`UserConfig`): optional `notify` (a shell command run for blocking and hard cards, with the card as JSON on stdin) and `os_notify` (default true). Its location is `$BAESIAN_CONFIG`, or `$XDG_CONFIG_HOME/baesian/config.json`, or `~/.config/baesian/config.json`. It's personal for two reasons:
  - a `notify` command in a committed file would run on every clone of the repo;
  - a phone-push token would be in the repo.

  This is a change from the first draft, part of P12.

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
