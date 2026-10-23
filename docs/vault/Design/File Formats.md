---
type: design
status: draft
authority: specifies
summary: "Baesian's file formats (proposal P12): card revisions, verdicts, withdrawals, ledger entries, decks, rules, topic aliases, attachments and config; where each lives, and which are immutable. Defined in src/schema.ts."
created: 2026-10-23
updated: 2026-10-23
reviewed: 2026-10-23
tags: [baesian, design, formats]
---

# File Formats

> **Status: proposal P12.** These formats are implemented as described here. The user accepts or changes them before the 0.1.0 release; until then nothing outside this repo depends on them.

The definitions are the Zod schemas in `src/schema.ts`. This note describes them for people, and livedocs binds it to them: a change to a schema blocks the commit until this note is reconciled.

## Rules that apply to every file

- **Immutable.** Every file except the config files, the inbox cursors and the presence heartbeat is written once and never edited (D34). The store writes with an exclusive create, so a second write fails. Status is computed from the files, never stored.
- **Flat.** Frontmatter and JSON have no nested objects. Lists of strings are fine. Empty lists and unset fields are left out when writing.
- **IDs.** Cards are `B-` plus five Crockford base32 characters (`B-7f3kq`), and rules are `R-` plus five. The alphabet is lowercase and has no `i`, `l`, `o` or `u` (D51). A new ID is checked against the live layer and retried on collision (`newId`).
- **Two layers (D34).** Everything is written to the live layer, `.git/baesian/`. The record, `.baesian/` in the worktree, receives copies of the files for the cards the branch filed or attached to (D37).

## Files

| File | Schema | Live | Record | Written by |
|---|---|---|---|---|
| `cards/<id>/r<n>.md` | `CardMeta` + body | yes | yes | `baesian file`, `baesian revise` |
| `cards/<id>/withdrawn.json` | `Withdrawal` | yes | yes | `baesian withdraw` |
| `cards/<id>/fallback-<suffix>.json` | `Fallback` | yes | yes | `baesian wait`, on a blocking card with no verdict (D46) |
| `verdicts/<id>-r<n>-<suffix>.json` | `Verdict` | yes | on sync | the client only (D32) |
| `ledger/<id>-<suffix>.md` | `LedgerMeta` + body | yes | on sync | the git gate (M3) |
| `decks/<deck>.md` | `DeckMeta` + body | yes | yes, with its cards | `baesian deck`; the branch deck on first use |
| `rules/<id>.md` | `RuleMeta` + body | yes | yes | the client (M4) |
| `topics/alias-<suffix>.json` | `TopicAlias` | yes | yes | the client (M4) |
| `attachments/<id>-<suffix>.json` | `Attachment` | yes | no | `baesian attach` |
| `cursors/<branch>.json` | — | yes (mutable) | no | `baesian inbox` |
| `presence.json` | `Presence` | yes (mutable) | no | the client's heartbeat (D41) |
| `config.json` | `Config` | no | yes (mutable) | `baesian init` |
| `~/.config/baesian/config.json` | `UserConfig` | — | — | the user; never in a repo |

## Card revision

A card is a directory of revisions. Each revision is a whole card: the agent's reply to a returned card is a new revision, not an edit.

Frontmatter (`CardMeta`):

| Field | Type | Notes |
|---|---|---|
| `type` | `card` | |
| `id`, `revision` | card ID, integer ≥ 1 | filled in by Baesian |
| `title` | string | the decision, as a question |
| `proposal` | string | what the agent recommends |
| `alternatives` | list | the other options considered |
| `topic` | optional slash-separated key | `storage/run-metadata`; canonicalised through aliases (D38, D44) |
| `deck` | deck ID | defaults to the branch deck, `branch-<branch>` (D29) |
| `level` | `provisional` \| `blocking` \| `hard` | defaults to `hard` when `touches` includes `publishes`, `security`, `money` or `data-loss` (D42), otherwise `provisional` |
| `touches` | list of facts | the D11 checklist: `schema`, `public-api`, `dependency`, `infra`, `user-facing`, `publishes`, `security`, `money`, `data-loss`. Also decides which gate facts a `Baesian-Card:` trailer covers (D53) |
| `modules_touched` | optional integer | |
| `depends_on` | list of card IDs | rejecting one of them withdraws this card (D14) |
| `supersedes` | optional card ID | for arguing against a resolved decision; that decision becomes `superseded` once this card resolves |
| `conflict_of`, `caught_at` | optional | conflict cards only: the decisions in conflict, and where it was caught (`filing`, `merge`, `late`; D45) |
| `confidence` | optional 0–1 | recorded, not used for routing (D3) |
| `domain`, `evidence` | lists | routing tags; links |
| `source_agent`, `source_branch`, `source_worktree`, `created` | | filled in by Baesian |

Body: Markdown sections, in the shape of the Decision Card template: Context, Recommendation, **Strongest alternative** (required, D12), Why now, Cost to reverse, Needed from the reviewer. Only the strongest alternative is checked.

What an agent writes is a **draft** (`CardDraft`): the same frontmatter without the fields Baesian fills in. `deck` and `level` are optional.

## Verdict

One file per response (`Verdict`). There can be several per revision: "not my area" then another reviewer's answer, or a deferral then a decision.

| Field | Notes |
|---|---|
| `card`, `revision` | a verdict on an old revision is rejected as stale |
| `response` | `accept`, `alternative`, `correction` → resolved; `reject`, `question`, `need_context` → returned; `not_my_area` → rerouted; `defer` → deferred |
| `choice` | required for `alternative` and `correction` |
| `comment` | required for `question` and `defer` |
| `make_rule` | the "make this a rule" toggle (D16) |
| `reviewer`, `at` | `at` is strictly increasing per card, so the latest verdict is unambiguous |

## The others

- **Withdrawal** (`Withdrawal`): `card`, `reason`, `by`, `at`. One per card.
- **Ledger entry** (`LedgerMeta`): `card`, `branch`, optional `commit`, `at`. The body names the symbols that depend on the decision, in backticks (D15).
- **Deck** (`DeckMeta`): `id`, `title`, optional `branch` and `from` (the source document, relative to the repo), `context_notes` (vault wikilinks), `created`. The body is the briefing. Membership isn't stored: it's computed from the cards' `deck` fields, so a deck never needs editing.
- **Rule** (`RuleMeta`): `id`, optional `topic`, `covers` (gate fact-ID globs such as `dep:pytest-*`, which the gate acknowledges automatically; D24), optional `from_card`, `accepted_by`, `created`. The body is the rule.
- **Topic alias** (`TopicAlias`): `from`, `to`, `by`, `at`.
- **Attachment** (`Attachment`): `card`, `agent`, `branch`, `worktree`, `at`. Live only: it matters for priority and inbox delivery, not for the record.
- **Fallback** (`Fallback`): `card`, `revision`, `reason` (`timeout` or `away`), `agent`, `at`. Written when an agent proceeds on a blocking card without a verdict, so the client can show it. Never written for a hard card, which doesn't proceed.
- **Presence** (`Presence`): `client`, `at`. The client rewrites it every 30 seconds, by writing a temporary file and renaming it, so readers never see half a file. `baesian wait` treats it as follows:
  - more than 90 seconds old (`PRESENCE_STALE_MS`): the reviewer is away;
  - missing: unknown, because the client has never run.
- **Config** (`Config`): optional `vault`, and optional detector paths: `gate_schema` and `gate_infra` replace the defaults, and `gate_ignore` adds to them. It's committed, so it holds only what's shared by everyone working on the repo. Keys stay flat, like everything else.
- **User config** (`UserConfig`): optional `notify` (a shell command run for blocking and hard cards, with the card as JSON on stdin) and `os_notify` (default true). Its location is `$BAESIAN_CONFIG`, or `$XDG_CONFIG_HOME/baesian/config.json`, or `~/.config/baesian/config.json`. It's personal for two reasons:
  - a `notify` command in a committed file would run on every clone of the repo;
  - a phone-push token would be in the repo.

  This is a change from the first draft, part of P12.

## Commit trailers (D52)

These aren't files, but they're part of the same public interface. They go in the commit message's final trailer block, parsed with git's own rules (`git interpret-trailers --parse`, in `parseTrailers`):

- **`Baesian-Card: <id>`**, one line per card; comma-separated IDs are accepted too. The commit builds on the card. It covers the commit's detected facts whose kind is in the card's `touches` (D53). The post-commit hook writes a ledger entry for it.
- **`Baesian-Ack: <fact-id> <reason>`** acknowledges a detected decision as a two-way door. The fact ID is the one the gate prints (`dep:httpx`, `schema:<path>`, `infra:<path>`, and later `api:<symbol>`). The reason is required.

## Open points for P12

- **`source_worktree` is an absolute path,** and it's committed in the record. It's machine-specific and mildly private. Alternatives: the worktree's directory name, or leave it out and rely on `source_branch`.
- **Verdict file names** use a random suffix. A timestamp prefix would make `ls` show them in order. Order already comes from `at`, so this is cosmetic.
- **Conflict links** (D45) aren't defined yet. They arrive with the client (M4).
- **`notify` moved from the committed config to the user config** (above). This needs the user's acceptance, like the rest of P12.
