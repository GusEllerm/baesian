---
type: design
status: draft
authority: specifies
summary: "The Baesian design (v0.4): cards, decks and responses; routing on impact and reversibility; the assumption ledger; learning conventions; how agents read verdicts; the .baesian/ store and the vault adapter; open questions and a first version."
created: 2026-10-23
updated: 2026-10-23
reviewed: 2026-10-23
tags: [baesian, design]
---

# Baesian Design

*Swipe review for agent decisions. (Informally: Agent Tinder.)*

> **Status (2026-10-23): v0.4.**
> - Everything below is decided (D1–D21 in [[Decision Log]]) except the open questions.
> - The schemas are illustrative; field names are settled when the schema is built (D20 step 1).
> - The first target is coding agents; research agents come later (D2).

## The idea

Coding and research agents make a stream of design decisions: which library to use, which schema, which baseline, which statistical test, whether an approximation is acceptable. Most of these decisions are fine. A few are quietly wrong, and nobody looks at them until much later.

Baesian turns those decisions into **cards** and places them in a **queue**. A developer or domain expert works through the queue with a swipe-style interface, and each verdict goes back to the agent that asked. The agent's proposal is its *prior*, and the expert's swipe is the evidence that updates it. Verdicts that generalise become project conventions, so the queue should shrink as the project's taste gets written down.

## Where it fits

Baesian is one part of a design pattern for agentic engineering:

| Part | Keeps true | Authority | Last word |
|---|---|---|---|
| The vault (Markdown in the repo, Obsidian as the interface) | Project memory across sessions | | |
| livedocs (vault-drift) | Notes that *describe* the code | `describes`: reality wins | The code |
| Baesian | Notes that *decide* things | `specifies`: the note wins, once accepted | The human |

The live-docs design deliberately left decisions, specs and invariants to "a different system" (its decision D4). Baesian is that system.

Principles:

- **Standalone first.** Baesian keeps its state in `.baesian/` and works in any repo. The vault adapter makes it seamless with the vault workflow (D8).
- **Agents report facts; people give verdicts.** Routing is computed from checkable facts the agent states, not from a confidence score it guesses.
- **The guarantee lives in the framework, not the agent.** Hooks, the git gate and CI enforce the rules, so they hold for any agent that commits.
- **Never present a proposal as agreed.** A decision becomes accepted only through a verdict.

## Core pieces

### 1. Cards

A card is one decision small enough to judge in about 10 seconds, with more detail available when the reviewer wants it. A card is a Markdown file in `.baesian/cards/`:
- **Frontmatter** holds the machine fields. It stays flat, so the file reads well in Obsidian and in any editor.
- **The body** follows the shape of the Decision Card template.

```markdown
---
type: card
id: B-7f3k
deck: storage-layer
status: open                  # open | returned | resolved | withdrawn | superseded
revision: 1
title: "Use SQLite for the run-metadata store?"
proposal: SQLite (WAL mode)
alternatives: [Postgres, Parquet files]
touches: [schema, dependency] # impact facts, from a fixed checklist
modules_touched: 2
blocking: false
depends_on: [B-2m9q]
confidence: 0.7               # recorded; not used for routing until verdicts calibrate it
domain: [software, data-engineering]
evidence: [link-to-diff, link-to-benchmark]
source_agent: claude-code
source_session: "..."
created: 2026-10-23
---

## Context
Postgres is available but adds an ops dependency.

## Recommendation
SQLite in WAL mode: one writer, modest volume, nothing new to operate.

## Strongest alternative
Parquet files: the analysis step is all columnar scans, and DuckDB reads Parquet directly.

## Why now
The writer is done. The reader is next, and it fixes the storage format.

## Cost to reverse
Cheap today. Once the reader ships: a data migration and a rewrite of `RunStore`.

## Needed from the reviewer
Pick one.

## Implemented in
*(The agent fills this in as it builds on the decision: symbols in backticks, plus commits.)*
```

The **strongest alternative** is required on every card (D12), for two reasons:
- It makes the card quicker to judge.
- A strong case for another option is a better uncertainty signal than the agent's self-reported confidence.

When there is no credible alternative, the card says so.

**Card IDs** are short random strings with a prefix, such as `B-7f3k` (D19). Parallel sessions and worktrees can then file cards without colliding. A decision keeps its card ID for its whole life, from proposal to acceptance (D18).

### 2. Decks

Decisions rarely come alone, and a reviewer who arrives cold can't judge them well (D5). A **deck** groups related cards behind a **briefing card** that grounds the reviewer before they decide anything. Decks live in `.baesian/decks/`.

```markdown
---
type: deck
id: storage-layer
status: open
cards: [B-7f3k, B-h4xd, B-q8nw]
context_notes: ["[[Pipeline Design]]", "[[Architecture Principles]]"]
---

## Goal
Persist run metadata for the analysis pipeline.

## State
The writer is done; nothing reads from it yet.

## Constraints
Single process, ~50k rows/day, no new ops dependencies if avoidable.

## Already decided
B-2m9q: rows are Pydantic models.
```

- **The briefing can draw on the vault.** With the vault adapter, the UI shows the `summary:` line of each linked note, which vault notes already carry for triage.
- **The escape hatch also works at the deck level** (D6). After reading the briefing, the reviewer can answer "not for me" or "need more context" before spending time on any card.
- **Cards in a deck depend on each other.** Rejecting `B-7f3k` (SQLite) automatically withdraws a card about WAL settings, through `depends_on` (D14). After re-proposing, the agent re-files whichever dependents still make sense.
- **Briefings matter even with a single reviewer.** By the time you open the queue, you've lost the session's context.

### 3. Responses

A response is structured, not just a thumbs up or down (D6, D13). Some responses close the card. Others send it back to the agent, so a card can become a short thread instead of a single vote.

| Gesture | Response | Effect |
|---|---|---|
| Right | Accept the proposal | **Resolves** |
| Left | Reject, with an optional reason ("I don't think this is a good idea") | **Returns**: the agent re-proposes or withdraws |
| Up | Pick an alternative, or write a correction | **Resolves** with the reviewer's choice |
| Up | Ask: "Have you considered X?" | **Returns**: the agent evaluates X and replies on the card |
| Down | Need more context | **Returns**: the agent re-files with what was missing |
| Down | Not my area | **Reroutes** to another reviewer |

Each gesture has a different speed:
- **Right and Left** are swipe-speed.
- **Up** opens a panel and takes longer. That's fine, because the written responses are the most useful feedback.
- **Down** is the escape hatch for a reviewer who doesn't feel informed enough to decide. It asks which of its two meanings applies, because the two route differently.

Any response can also be marked **"make this a rule"** (D16; see Learning conventions).

```json
{ "card": "B-7f3k", "revision": 1, "response": "question",
  "comment": "Have you looked at DuckDB over Parquet? The analysis step is all columnar scans.",
  "reviewer": "...", "at": "..." }
```

Card lifecycle:

```
open ──accept / alternative / correction──► resolved ──later decision──► superseded
 │
 ├──reject / question / need context──► returned ──agent replies──► open (revision + 1)
 ├──not my area──► rerouted ──► open
 └──parent rejected, or no longer needed──► withdrawn
```

The **need-more-context rate** directly measures card quality. What reviewers ask for can be fed back into the card-filing skill.

### 4. The queue and interface

- **Two views:**
  - a mobile-first swipe view for quick triage;
  - a desktop view with the briefing, the full context and the diff.
- **Sorted by priority** (see Routing).
- **Routed to reviewers by domain tag.** Later, this connects to an external pool of experts (see the expert marketplace idea).

## Routing: when to file a card

Route on **impact** and **reversibility**, both stated as facts (D3, D11). Self-reported confidence is a weak signal. It is recorded, but not used until verdict history has calibrated it.

**Impact facts.** A fixed checklist; the agent answers each item:
- changes a schema or on-disk data format;
- changes a public API, URL scheme or module boundary;
- adds a runtime dependency;
- is user-facing or public;
- touches security or privacy;
- spends money;
- how many modules it touches.

**Reversibility facts:** what reversing the decision later would break (a data migration, public URLs, published statements, dependent code), and what already depends on it.

An agent can't fudge these the way it can fudge a number, and the reviewer can audit them.

- **File a card when any impact fact is true, or reversal would break something.** This is a one-way door. Don't skip the card because the answer looks obvious.
- **Otherwise the agent decides.** This is a two-way door. The agent logs the choice with a one-line reason, and a sample comes back as audit cards ("overturn?").
- **Make a card blocking only when proceeding would be expensive to undo.** Blocking cards go out at once, at most four at a time. The rest are batched into a deck at the end of the session.

**Priority:** blocking cards first, then by impact, cost to reverse, and how fast dependents are accumulating. Close alternatives (a strong case for the runner-up) raise priority.

Over time, verdict history calibrates each agent. If an agent recommends confidently and is overruled 40% of the time, that is useful information.

## Provisional decisions and the assumption ledger

In non-blocking mode, the agent proceeds on its proposal while the card waits. That makes reversibility depend on time (D4): a SQLite choice overturned after 10 minutes is a small edit, but after 3 days it's a migration.

- **The ledger has two parts (D15):**
  - **Commit trailers.** Every commit that builds on a provisional decision carries a trailer such as `Baesian-Card: B-7f3k`. git makes this part reliable, and a commit hook can check for it, so the guarantee lives in the framework.
  - **Card notes.** The card's "Implemented in" section names the symbols in backticks, which tells a rework brief what to revisit. When livedocs is installed, Baesian can reuse its mention resolution to turn those names into symbols. (*To check:* whether livedocs's resolver can be called on files outside the vault.)
- **Rising priority.** A card's priority rises as its ledger grows.
- **Rework briefs.** When a verdict overturns a decision, Baesian turns the ledger into a rework brief listing the symbols and commits to revisit, and injects it into the next session.
- **The Stop hook** warns when a session ends with blocking cards still open, or with provisional decisions whose ledgers have grown large.

## Learning conventions

The most valuable output may be standing rules, not individual verdicts (D7). A reviewer who rejects "mock the database in tests" once shouldn't see that card again next week.

- **Two ways to propose a rule (D16):**
  - **The toggle.** Any response can be marked "make this a rule", for when the reviewer already knows the verdict is general.
  - **Convention cards.** Baesian mines verdict history and files "Make this a rule?" cards. It looks for the same kind of decision decided the same way twice, or a reviewer comment that states a rule.
- **Where rules go.** An accepted convention is appended to the project's rules: `.baesian/rules.md` when standalone, or the vault's `specifies` notes through the adapter.
- **How rules are used.** The card-filing skill reads those rules before filing, and doesn't file cards they already answer.
- **Success looks like** cards per session falling as the project matures.

## How agents read results

These patterns can be combined:

1. **MCP server.** Tools such as `file_card`, `get_verdict(id, wait=…)`, `list_resolved(since=…)`. Works in any agent host that supports MCP.
2. **Non-blocking with provisional decisions (the default).** The agent files a card, proceeds on its proposal, and records what it builds on that proposal in the ledger. When a contradicting verdict arrives, the agent gets a rework brief.
3. **Blocking.** The agent waits on `get_verdict` with a timeout, and falls back to its prior if no verdict arrives.
4. **Filesystem-native.**
   - Cards and decks are Markdown files in `.baesian/`.
   - Verdicts go in an append-only `.baesian/verdicts.jsonl`.
   - Both can be diffed and audited, and work offline. The MCP server is a view over these files.
5. **Context injection via hooks.** At session start, a hook adds newly resolved verdicts and rework briefs to the agent's context, so the agent doesn't have to poll.

## Storage and the vault adapter

### Standalone: `.baesian/`

```
.baesian/
  config.json              # optional; with the adapter: { "vault": "docs/vault", ... }
  cards/B-7f3k.md
  decks/storage-layer.md
  verdicts.jsonl           # append-only, like livedocs's stamps.jsonl
  rules.md                 # routing rules and conventions, when there's no vault
```

Nothing outside `.baesian/` is needed. A repo with no vault, no livedocs and no Obsidian still gets the full loop (D8).

### With a vault: the adapter

`baesian init --vault docs/vault` records the vault in `.baesian/config.json`. The adapter then does four things:

- **Reads routing rules and conventions** from the vault's `specifies` notes (by default the Working Agreement and Code Conventions) instead of `rules.md`.
- **Writes accepted conventions back** to those notes.
- **Owns a marked block in the Decision Log** (D17). The adapter regenerates that block from cards and verdicts, in three sections: accepted, proposed, and agent decisions. Hand-written rows outside the markers, such as decisions that never went through a card, are left alone. Existing vaults need no migration. The log is a `livedocs: snapshot` note, so it never blocks a commit.
- **Resolves links both ways.**
  - A deck's `context_notes` are vault wikilinks, and the UI shows each linked note's `summary:` line.
  - Vault notes cite cards by ID, and the UI links each ID to its card.

`.baesian/` sits outside the vault, so Obsidian doesn't show the cards themselves. The generated notes are the vault's view of them.

The personal-website and live-docs vaults already run this decision process by hand. With the adapter, it changes like this:

| Today | With Baesian |
|---|---|
| The agent writes decision cards (the Decision Card template) into the chat | The agent files cards into `.baesian/cards/` |
| The Working Agreement splits one-way doors (the human decides) from two-way doors (the agent decides) | The same split is the routing rule, read from the Working Agreement |
| One decision carries three IDs: proposal P3, card DC-01, accepted G6 | One card ID; only the status changes |
| Decision Log rows are added by hand | Baesian's block of the Decision Log is generated from cards and verdicts |
| `[agent decision]` entries that the human may overturn | Logged agent decisions, sampled as audit cards |
| Blocking cards go out at once (at most four); the rest wait for the session end | Queue priority, plus end-of-session decks |
| The session summary lists open cards | The queue; a hook injects resolved verdicts at session start |
| Architecture reviews are distilled into cards by hand | A review files a deck, and its summary becomes the briefing |
| The style vote: a local server that saves ballots as JSON | The pattern for the swipe UI's backend |

### A project, start to finish

1. **Create the vault.** `livedocs new-vault docs/vault --scaffold-modules` sets up the vault, the git gate and the Claude Code adapter.
2. **Add Baesian.** `baesian init --vault docs/vault` creates `.baesian/`, points it at the vault, and installs the plugin and hooks.
3. **The agent works.** It logs two-way doors and turns one-way doors into cards, grouped into decks.
4. **You review.** You swipe through the queue on your phone. Verdicts land in `verdicts.jsonl`, and the vault's Decision Log is regenerated.
5. **The next session picks up the results:**
   - it starts with resolved verdicts and any rework briefs in context;
   - livedocs keeps the `describes` notes true to the code;
   - accepted conventions accumulate in the `specifies` notes, so fewer cards get filed.

## Getting it into Claude Code and Codex

- **Shared core:** the MCP server and the queue service with its web UI. Both hosts support MCP, so the same server works in both.
- **Claude Code:** a **plugin** that bundles:
  - the MCP server;
  - a skill that teaches the agent when and how to file a good card, reading the project's routing rules and conventions;
  - hooks:
    - at session start, inject resolved verdicts and rework briefs;
    - at Stop, batch the session's non-blocking cards into a deck and warn about open blocking cards;
  - a `/baesian` command to view the queue from the terminal.
- **Codex:** MCP configuration plus an `AGENTS.md` block with the same rules (`livedocs init` already writes one), and the equivalent skill or hook mechanisms if Codex supports them.
- **Standalone:** a small CLI (`baesian init`, `file`, `respond`, `wait`, `log`) for scripts, CI and other agent harnesses.

## Open questions

- **Card quality:** how to stop agents from filing too many cards, or vague ones. The need-more-context rate measures card quality; what threshold should trigger changes to the skill?
- **Deck boundaries:** how the agent decides which decisions belong together.
- **Identity and trust:** whose verdict counts, how to weight reviewers, and how this relates to trust scoring.
- **Conflicts:** two reviewers disagree, or a verdict arrives after the agent has moved on.
- **Latency:** what an agent should do while waiting minutes or days for a verdict, beyond growing the ledger.
- **Decision drift:** livedocs could flag when the code behind an accepted decision changes ("is B-7f3k still honoured?"). Two catches:
  - It only works for notes in the vault.
  - Dated notes already dominated its acks (P25 in live-docs).

  Should the adapter write accepted decisions into the vault as bound notes, or only generate the log?
- **Phone access:** the swipe UI runs locally. Reaching it from a phone needs the LAN or a tunnel.
- **Feedback loop:** whether verdicts should train routing and confidence calibration, and whether they could be a dataset in their own right.
- **Science vs software:** research decisions (methods, assumptions, interpretations) probably need their own card types. A timestamped log of analysis decisions with expert sign-off is close to a pre-registration and audit trail. Deferred until after the coding-agent version (D2).

## Possible first version

The order is decided (D20):

1. The card and deck schema in `.baesian/`, with `verdicts.jsonl`.
2. The `baesian` CLI: `init [--vault]`, `file`, `respond`, `wait`, and `log`.
3. Hooks: inject resolved verdicts at session start; batch cards and warn at Stop. This is the simplest way for verdicts to reach the agent, so it comes before the MCP server.
4. A minimal swipe UI over the queue: a local stdlib server, like the style vote.
5. A Claude Code plugin that bundles 1–4 and the card-filing skill.
6. The vault adapter: rules read from the Working Agreement, conventions written back, the Decision Log generated.
7. The MCP server (`file_card` / `get_verdict` / `list_resolved`) as a view over the files.
8. Dogfood it (D21) on this repo's own vault and on personal-website, which already runs decision cards by hand, so there's a before and after. Track:
   - how often verdicts change what the agent does;
   - the overturn rate;
   - the need-more-context rate;
   - time per card;
   - cards per session over time.
