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

- **Immutable.** Every file except `config.json`, the inbox cursors and (later) the presence heartbeat is written once and never edited (D34). The store writes with an exclusive create, so a second write fails. Status is computed from the files, never stored.
- **Flat.** Frontmatter and JSON have no nested objects. Lists of strings are fine. Empty lists and unset fields are left out when writing.
- **IDs.** Cards are `B-` plus five Crockford base32 characters (`B-7f3kq`), and rules are `R-` plus five. The alphabet is lowercase and has no `i`, `l`, `o` or `u` (D51). A new ID is checked against the live layer and retried on collision (`newId`).
- **Two layers (D34).** Everything is written to the live layer, `.git/baesian/`. The record, `.baesian/` in the worktree, receives copies of the files for the cards the branch filed or attached to (D37).

## Files

| File | Schema | Live | Record | Written by |
|---|---|---|---|---|
| `cards/<id>/r<n>.md` | `CardMeta` + body | yes | yes | `baesian file`, `baesian revise` |
| `cards/<id>/withdrawn.json` | `Withdrawal` | yes | yes | `baesian withdraw` |
| `verdicts/<id>-r<n>-<suffix>.json` | `Verdict` | yes | on sync | the client only (D32) |
| `ledger/<id>-<suffix>.md` | `LedgerMeta` + body | yes | on sync | the git gate (M3) |
| `decks/<deck>.md` | `DeckMeta` + body | yes | yes, with its cards | `baesian deck`; the branch deck on first use |
| `rules/<id>.md` | `RuleMeta` + body | yes | yes | the client (M4) |
| `topics/alias-<suffix>.json` | `TopicAlias` | yes | yes | the client (M4) |
| `attachments/<id>-<suffix>.json` | `Attachment` | yes | no | `baesian attach` |
| `cursors/<branch>.json` | — | yes (mutable) | no | `baesian inbox` |
| `config.json` | `Config` | no | yes (mutable) | `baesian init` |

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
| `touches` | list of facts | the D11 checklist: `schema`, `public-api`, `dependency`, `user-facing`, `publishes`, `security`, `money`, `data-loss` |
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
- **Rule** (`RuleMeta`): `id`, optional `topic` and `from_card`, `accepted_by`, `created`. The body is the rule.
- **Topic alias** (`TopicAlias`): `from`, `to`, `by`, `at`.
- **Attachment** (`Attachment`): `card`, `agent`, `branch`, `worktree`, `at`. Live only: it matters for priority and inbox delivery, not for the record.
- **Config** (`Config`): optional `vault` and `notify`.

## Open points for P12

- **`source_worktree` is an absolute path,** and it's committed in the record. It's machine-specific and mildly private. Alternatives: the worktree's directory name, or leave it out and rely on `source_branch`.
- **Verdict file names** use a random suffix. A timestamp prefix would make `ls` show them in order. Order already comes from `at`, so this is cosmetic.
- **Presence** (`presence.json`, D41) and **conflict links** (D45) aren't defined yet. They arrive with the client (M4).
