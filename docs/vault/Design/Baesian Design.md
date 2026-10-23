---
type: design
status: draft
authority: specifies
summary: "The Baesian design (v0.5): git as the state machine; cards, decks and responses; one client; routing on impact and reversibility; where cards come from (documents, mid-task, the commit gate); verdict delivery and the merge gate; parallel agents; two-layer storage and the vault adapter; open questions and the v1 order."
created: 2026-10-23
updated: 2026-10-23
reviewed: 2026-10-23
tags: [baesian, design]
---

# Baesian Design

*Swipe review for agent decisions. (Informally: Agent Tinder.)*

> **Status (2026-10-23): v0.5.**
> - Everything below is decided (D1–D42 in [[Decision Log]]) except the open questions.
> - Schemas, file names and trailer formats are illustrative. They are settled when the store is built (D33 step 1).
> - The first target is coding agents; research agents come later (D2).

## The idea

Coding and research agents make a stream of design decisions: which library to use, which schema, which baseline, which statistical test, whether an approximation is acceptable. Most of these decisions are fine. A few are quietly wrong, and nobody looks at them until much later.

Baesian turns those decisions into **cards** and places them in a **queue**. A developer or domain expert works through the queue in a swipe-style client, and each verdict goes back to the agent that asked. The agent's proposal is its *prior*, and the expert's swipe is the evidence that updates it. Verdicts that generalise become project rules, so the queue should shrink as the project's taste gets written down.

It works across a spectrum:
- **Coupled:** planning and implementing are interleaved, and you are present.
- **Autonomous:** you plan, then agents implement for a long stretch while you're away.

Today is mostly the coupled end. Baesian should also help move toward the autonomous end, and measure when that's safe (see Learning conventions).

## Where it fits

Baesian is one part of a design pattern for agentic engineering:

| Part | Keeps true | Authority | Last word |
|---|---|---|---|
| The vault (Markdown in the repo, Obsidian as the interface) | Project memory across sessions | | |
| livedocs (vault-drift) | Notes that *describe* the code | `describes`: reality wins | The code |
| Baesian | Notes that *decide* things | `specifies`: the note wins, once accepted | The human |

The live-docs design deliberately left decisions, specs and invariants to "a different system" (its decision D4). Baesian is that system.

Principles:

- **Git is the state machine (D27).**
  - Baesian relies only on git's phases: the working tree, a commit, a push or PR, a merge. Every harness and every human shares those.
  - Harness phases are never relied on: plan mode, session start and stop, skills, subagents. Each one is at most an adapter that makes things faster.
- **Only the client resolves (D32).** Agents propose; verdicts come only from the Baesian client, and an agent never records a verdict on anyone's behalf. That's what lets the Decision Log be trusted.
- **Standalone first (D8).** Baesian works in any git repo, with no vault, livedocs or Obsidian. The vault adapter makes it seamless with the vault workflow.
- **Agents report facts; people give verdicts.** Routing is computed from checkable facts the agent states, not from a confidence score it guesses.
- **Never present a proposal as agreed.** A decision becomes accepted only through a verdict.

### Tiers

| Tier | What | Holds for |
|---|---|---|
| **0: relied on** | The store, the CLI (`file`, `wait`, `inbox`, `deck`), the git gate, CI | Any agent or human that commits |
| **1: plain instructions** | An `AGENTS.md` block: when to file, run `baesian inbox` before starting work, add trailers | Any harness that reads instruction files |
| **2: adapters** | The Claude Code plugin (skill, `SessionStart`, `ExitPlanMode` hook), Codex hooks, the MCP server | One harness each; faster, never required |

## Core pieces

### 1. Cards

A card is one decision small enough to judge in about 10 seconds, with more detail available when the reviewer wants it. A card is a Markdown file:
- **Frontmatter** holds the machine fields. It stays flat, so the file reads well in Obsidian and in any editor.
- **The body** follows the shape of the Decision Card template.
- **Revisions are immutable.** Each revision is a new file (see Storage), and a card's status is computed from its verdicts rather than stored.

```markdown
---
type: card
id: B-7f3k
revision: 1
deck: storage-layer
title: "Use SQLite for the run-metadata store?"
topic: storage/run-metadata   # optional; autocompleted from existing topics (D38)
proposal: SQLite (WAL mode)
alternatives: [Postgres, Parquet files]
touches: [schema, dependency] # impact facts, from a fixed checklist
modules_touched: 2
level: provisional            # provisional | blocking | hard (D42)
depends_on: [B-2m9q]
confidence: 0.7               # recorded; not used for routing until verdicts calibrate it
domain: [software, data-engineering]
evidence: [link-to-diff, link-to-benchmark]
source_agent: claude-code
source_branch: feat/run-store
source_worktree: "..."
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
```

- **Strongest alternative (D12).** It is required on every card, for two reasons. It makes the card quicker to judge. And a strong case for another option is a better uncertainty signal than the agent's self-reported confidence. When there is no credible alternative, the card says so.
- **IDs (D18, D19).** Card IDs are short random strings with a prefix, such as `B-7f3k`, so parallel agents can file without colliding. A decision keeps its card ID for its whole life, from proposal to acceptance.

### 2. Decks

Decisions rarely come alone, and a reviewer who arrives cold can't judge them well (D5). A **deck** groups related cards behind a **briefing card** that grounds the reviewer before they decide anything. By default there is one deck per branch; agents can also name decks explicitly (D29).

```markdown
---
type: deck
id: storage-layer
branch: feat/run-store
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

- **The briefing can draw on the vault.** With the vault adapter, the client shows the `summary:` line of each linked note, which vault notes already carry for triage.
- **The escape hatch also works at the deck level** (D6). After reading the briefing, the reviewer can answer "not for me" or "need more context" before spending time on any card.
- **Cards in a deck depend on each other.** Rejecting `B-7f3k` (SQLite) automatically withdraws a card about WAL settings, through `depends_on` (D14). After re-proposing, the agent re-files whichever dependents still make sense.
- **Briefings matter even with a single reviewer.** By the time you open the queue, you've lost the context the decisions were made in.

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
 ├──deferred at merge, with a reason──► deferred ──► open
 └──parent rejected, or no longer needed──► withdrawn
```

The **need-more-context rate** directly measures card quality. What reviewers ask for can be fed back into the card-filing instructions.

### 4. The client

There is one client for every situation, so it feels consistent and polished (D32).

- **A local web app.** It's a stdlib server like the style vote, serving a responsive UI. **The desktop layout comes first**, because coupled mode is where the work is today. Arrow keys are the swipe gestures, and the full context and diff sit beside the card. The phone layout uses the same app.
- **Coupled and autonomous differ only in whether the card is blocking:**

  | | Coupled | Autonomous |
  |---|---|---|
  | Card | Blocking | Non-blocking |
  | Agent | Runs `baesian wait B-7f3k` and pauses | Proceeds provisionally, recording what it builds in the ledger |
  | You | Get a notification and answer in the client beside your terminal | Work through the queue later, on your phone |

- **`baesian wait` works in any harness.** It's a shell command that blocks until a verdict arrives, with a timeout, because harness commands have time limits (10 minutes in Claude Code). It returns early with "reviewer away" if the client's heartbeat is stale (D41). What the agent does next depends on the card's level (D42):
  - **blocking:** it waits again, or falls back to its proposal and proceeds provisionally;
  - **hard:** it never proceeds without a verdict. It parks that task and does other work, or stops.

  The MCP server's `get_verdict(wait=…)` is an adapter over the same mechanism.
- **Presence (D41).** While the client is open, it touches a heartbeat file in the live layer every 30 seconds. That gives two benefits:
  - agents don't idle until the timeout when you've stepped away;
  - notifications can go to your desktop or your phone depending on whether you're there.
- **Notifications (D40).** Both kinds link straight to the card:
  - the client tab raises a browser notification when it's open;
  - `baesian file` raises an OS notification for a blocking or hard card.

  A configurable `notify` command receives the card as JSON. That's how phone push (ntfy, Pushover) or Slack get wired in later, without Baesian owning push infrastructure.
- **Decisions made in conversation still go through the client.** If you tell the agent "use Postgres" in chat, it files a card with Postgres as the proposal, and you confirm it with one swipe.
- **Sorted by priority** (see Routing). It's one queue across all worktrees, with each card labelled by branch and agent.
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
- deletes or overwrites stored data;
- how many modules it touches.

**Reversibility facts:** what reversing the decision later would break (a data migration, public URLs, published statements, dependent code), and what already depends on it.

An agent can't fudge these the way it can fudge a number, and the reviewer can audit them.

- **File a card when any impact fact is true, or reversal would break something.** This is a one-way door. Don't skip the card because the answer looks obvious.
- **Otherwise the agent decides.** This is a two-way door. The agent logs the choice with a one-line reason, and a sample comes back as audit cards ("overturn?").
- **Choose a level (D42):**
  - **provisional** (the default): the agent proceeds on its proposal, and the card waits in the queue, grouped by deck (by default one per branch; D29);
  - **blocking**, when proceeding would be expensive to undo: it notifies at once, at most four at a time. The agent waits while you're there, and proceeds provisionally if you're away;
  - **hard**, when the decision must never proceed without a verdict. Spending money, touching security or privacy, deleting or overwriting stored data, and publishing make a card hard by default.

**Priority, in order:**
1. blocking cards;
2. then by impact, cost to reverse, and how fast dependents are accumulating;
3. then raised by:
   - close alternatives (a strong case for the runner-up);
   - agents disagreeing about the same decision (D35);
   - the number of agents waiting on the card, because each one is idle compute (D36).

Over time, verdict history calibrates each agent. If an agent recommends confidently and is overruled 40% of the time, that is useful information.

## Where cards come from

The question is less *who* files a card than *when*: asking costs least before implementation and more at each later stage. v1 has three sources (D23, D28):

| When | Source | Strength | Weakness |
|---|---|---|---|
| **Before implementing** | A deck built from a document that proposes decisions | Cheapest time to change course; the document is the briefing | Only covers decisions the document mentions |
| **Mid-task** | The agent files when it reaches a one-way door, following the D11 checklist | Full context, so the card is good | Relies on the agent noticing it is making a decision |
| **Commit time** | The gate detects decision types mechanically | Catches what the agent didn't notice; works for any agent | Only the types it knows; can't write the card |

Later: an **after-the-fact reviewer**. This is an independent agent that reads a branch's diff, extracts implicit decisions, and supplies the D11 audit sample.

### Decks from documents

A plan is a document, not a phase (D28). `baesian deck --from <file>` builds a deck from anything that proposes decisions: a plan file, a design note, an issue, a PR description. The document becomes the briefing. It works for a five-line plan in an interleaved session as well as for a long plan before an autonomous run.

Adapters can call it automatically where a harness has a plan moment:
- **Claude Code:** a `PostToolUse` hook with matcher `ExitPlanMode`.
  - The hook receives the approved plan as `tool_response.plan`, and can return `additionalContext` listing the cards it filed.
  - Never use `PreToolUse` returning `allow` here: for `ExitPlanMode`, that auto-approves the plan and skips the user's prompt.
  - Source: <https://code.claude.com/docs/en/hooks>, read by a docs-checking subagent on 2026-10-23.
  - *Unverified:* there's no worked example of the matcher (confirm with `claude --debug`); behaviour on a rejected plan isn't documented.
- **Codex:** its hooks (<https://learn.chatgpt.com/docs/hooks>) have no plan-mode event. `update_plan` is covered by `PostToolUse` but is called repeatedly, so it isn't a clean trigger (*unverified*).

### The git gate

This is the livedocs pattern applied to decisions. The gate reports a fact ("this commit adds `httpx`"). The agent that made the commit writes the card, because it has the context.

- **It runs as two hooks** in `.githooks/`, beside the livedocs gate:
  - **`pre-commit`** copies new verdicts and ledger entries for the branch's cards into the record, and stages them (D37);
  - **`commit-msg`** reads the trailers and checks coverage, because only it can see the message.

  The split is forced by git: files staged by `commit-msg` don't land in the commit (tested on git 2.55, 2026-10-23). CI runs the same check on every commit in a PR (D24).
- **Detectors (D25)**, each a D11 checklist item turned into a mechanical check:
  - **Dependencies:** a package added to or removed from a manifest (`pyproject.toml`, `package.json`, …). Lockfile-only changes are benign.
  - **Schema and migrations:** changes under configurable paths (`migrations/`, `*.sql`, schema files).
  - **CI, infra and deploy config:** workflow files, Dockerfiles, deploy config.
  - **Exported API signatures:** a public function's or class's signature changed. This uses drift's fingerprints when drift is installed, and is off without it (D8).
- **Covered means (D24, D26)** the commit carries one of two trailers:
  - `Baesian-Card: <id>` for a filed card. A filed card is enough, unless it's marked blocking, in which case it needs a verdict first;
  - `Baesian-Ack: <fact> — <reason>`, an agent decision, logged like any two-way-door decision.
- **Automatic acks:** benign changes, and changes an accepted rule already answers. For example, a rule saying "pytest plugins don't need a card" covers adding one.
- **Verdict delivery (D30).** Every gate run prints the verdicts resolved since the last commit on this branch.
  - A commit whose `Baesian-Card:` trailer points at a **rejected** card is blocked, and the gate shows the rework brief.
  - So an agent can't keep building on an overturned decision without noticing, in any harness.
- **Precision matters here.** This is unlike livedocs, where precision was only overhead. Every false trigger costs an ack, and agents learn to rubber-stamp a noisy gate. Measure each detector's rate of acks to cards.

### The merge gate

Merge is where reversibility drops sharply. Before it, a provisional decision is cheap to change; after it, other work builds on `main` (D4).

So CI on a PR checks that every card referenced by the branch's commits is **resolved, or explicitly deferred with a reason** (D31). The deferral is recorded, for example "decide after the benchmark". Two more checks:

- **Conflict cards (D38).** CI compares the branch's decisions with `main`'s record. The same topic answered differently becomes a conflict card, which must be resolved before merge like any other.
- **Record lag (D37).** If a verdict arrived after the branch's last commit, the record doesn't have it yet. The gate says "run `baesian sync` and commit".

The two gates split the work:
- **Commit gate:** decisions are surfaced (filed).
- **Merge gate:** decisions are answered (resolved).

## Provisional decisions and the assumption ledger

In non-blocking mode, the agent proceeds on its proposal while the card waits. That makes reversibility depend on time (D4): a SQLite choice overturned after 10 minutes is a small edit, but after 3 days it's a migration.

- **The ledger has two parts (D15):**
  - **Commit trailers.** Every commit that builds on a provisional decision carries `Baesian-Card: B-7f3k`. The git gate checks them.
  - **Ledger entries.** These are small immutable files naming the symbols in backticks, which tell a rework brief what to revisit. The client shows them as the card's "Implemented in" section. When livedocs is installed, Baesian can reuse its mention resolution to turn the names into symbols. (*To check:* whether livedocs's resolver can be called on files outside the vault.)
- **Rising priority.** A card's priority rises as its ledger grows.
- **Rework briefs.** When a verdict overturns a decision, Baesian turns the ledger into a rework brief listing the symbols and commits to revisit. It's delivered at the branch's next commit (D30), or sooner by an adapter.

## Learning conventions

The most valuable output may be standing rules, not individual verdicts (D7). A reviewer who rejects "mock the database in tests" once shouldn't see that card again next week.

- **Two ways to propose a rule (D16):**
  - **The toggle.** Any response can be marked "make this a rule", for when the reviewer already knows the verdict is general.
  - **Convention cards.** Baesian mines verdict history and files "Make this a rule?" cards. It looks for the same kind of decision decided the same way twice, or a reviewer comment that states a rule.
- **Rules apply at once.** An accepted rule takes effect immediately in every worktree, through the live layer (D34). It's also written to the record, and with the vault adapter, as a rule note on the default branch (D39).
- **How rules are used:**
  - filing reads them, and doesn't file cards they already answer;
  - the gate acks changes they cover.
- **Success looks like** fewer cards per branch as the project matures.

**From coupled toward autonomous.** You can let an agent run longer when two things are true:
- fewer decisions need you, because rules absorb the repeated ones;
- its provisional decisions are rarely overturned.

Both are in the verdict data. When a kind of decision is rarely overturned, it can be downgraded to a two-way door, which is the D11 audit sample doing its calibration job. A metric like **autonomy horizon** (commits between blocking cards) shows when longer runs are safe.

## Parallel agents and worktrees

Many agents may work on one project at once, in separate worktrees or as subagents in the same one. Worktrees keep code apart, but decisions have to be shared while the work is happening:
- the client needs one queue across every worktree;
- a waiting agent needs its verdict;
- a rule should apply everywhere at once.

The two-layer store (D34, under Storage) handles that. On top of it:

- **Conflicting proposals become one decision (D35).** Agents in different worktrees may propose different answers to the same decision. The client merges their cards into one decision with competing proposals, showing each agent's proposal and its strongest alternative. You choose once, and the losing branches get rework briefs.
  - **Detection:** the same topic key; ledgers that touch the same paths or symbols; the same gate fact on two branches (for example, competing dependencies); similar text at filing.
  - **Disagreement is a feature.** Independent agents disagreeing is the strongest uncertainty signal there is, so it raises priority.
- **Check before filing; attach instead of duplicating (D36, D38).** Before filing, `baesian file` searches two places:
  - open cards across all worktrees;
  - **resolved decisions**, on `main` and in other branches' records.

  On a match with an open card, the agent attaches to it as a dependency. On a match with a resolved decision, the agent follows that decision or argues on the card. Most contradictions are caught here, before they're built. A card's priority counts the agents waiting on it.
- **Topic keys (D38).** These are optional keys such as `time/format`, which the CLI autocompletes from the keys already in use. They make matching deterministic. The merge gate turns "same topic, different answer" into a conflict card. Contradictions that neither keys nor text matching catch are a residual miss class: measure them, and leave them to the later after-the-fact reviewer.
- **No orchestrator is needed.** Any agent on any branch files for itself. Subagents are a harness concept (D27), so nothing relies on them.

## Storage and the vault adapter

### Two layers (D34)

```
.git/baesian/                  # LIVE: git's common directory, shared by every worktree of this clone; not committed
  cards/B-7f3k/r1.md           # one immutable file per card revision
  verdicts/B-7f3k-r1.json      # one immutable file per verdict
  ledger/B-7f3k-<ts>.md        # one immutable file per ledger entry
  decks/storage-layer.md
  rules/R-9c2a.md              # accepted rules, in force at once
  presence.json                # the client's heartbeat (D41)

.baesian/                      # RECORD: committed on the branch
  config.json                  # optional; with the adapter: { "vault": "docs/vault", ... }
  cards/  verdicts/  ledger/   # copies for the cards this branch's commits reference
  rules/                       # accepted rules
```

- **The live layer** is what the client, `baesian wait` and every agent read and write. It's found with `git rev-parse --git-common-dir`, so all worktrees of a clone share it. Nothing in it is merged, and the client never writes into an agent's working tree.
- **The record layer** travels with the code. The merge gate and CI read only the record, so they need nothing from the live layer. It's written in three ways (D37):
  - `baesian file`, and attaching to a card, write the card into the agent's own worktree;
  - `pre-commit` copies in new verdicts and ledger entries for cards the branch already holds;
  - `baesian sync` is the fallback, for verdicts that arrived after the branch's last commit.
- **No conflicts, ever.** Every card revision, verdict and ledger entry is its own immutable file, and IDs are random. Parallel writes can't collide, and merges can't conflict. Status is computed from the files, never edited in place.
- **It's a seam for later.** The live layer is a local backend now. It can become the hosted queue service, for multiple machines or the expert marketplace, without changing the record.

Nothing outside these two directories is needed. A repo with no vault, no livedocs and no Obsidian still gets the full loop (D8).

### With a vault: the adapter

`baesian init --vault docs/vault` records the vault in `.baesian/config.json`. The adapter then does the following:

- **Reads routing rules and conventions** from the vault's `specifies` notes (by default the Working Agreement and Code Conventions) and its `Rules/` notes.
- **Writes each accepted rule as its own note** (`Rules/R-9c2a ….md`), which the Working Agreement links to. It never edits hand-written prose (D39).
- **Owns a marked block in the Decision Log** (D17). The adapter regenerates that block from the record, in three sections: accepted, proposed, and agent decisions. Hand-written rows outside the markers, such as decisions that never went through a card, are left alone. Existing vaults need no migration. The log is a `livedocs: snapshot` note, so it never blocks a commit.
- **Writes only on the default branch (D39).** Generated Markdown written on two branches would conflict at merge, and GitHub's server-side merges ignore custom merge drivers. So:
  - feature branches write only the immutable record files, which can't conflict;
  - the vault's views are regenerated on the default branch, at its next commit or with `baesian sync`.
- **Resolves links both ways.**
  - A deck's `context_notes` are vault wikilinks, and the client shows each linked note's `summary:` line.
  - Vault notes cite cards by ID, and the client links each ID to its card.

The cards themselves aren't in the vault, so Obsidian doesn't show them. The generated notes are the vault's view of them.

The personal-website and live-docs vaults already run this decision process by hand. With the adapter, it changes like this:

| Today | With Baesian |
|---|---|
| The agent writes decision cards (the Decision Card template) into the chat | The agent files cards with `baesian file`; you answer in the client |
| The Working Agreement splits one-way doors (the human decides) from two-way doors (the agent decides) | The same split is the routing rule, read from the Working Agreement |
| One decision carries three IDs: proposal P3, card DC-01, accepted G6 | One card ID; only the status changes |
| Decision Log rows are added by hand | Baesian's block of the Decision Log is generated from the record |
| `[agent decision]` entries that the human may overturn | `Baesian-Ack` trailers, sampled as audit cards |
| Blocking cards go out at once (at most four); the rest wait for the session end | Blocking cards notify at once; the rest wait in the queue, grouped by deck or branch |
| The session summary lists open cards | The queue; verdicts reach the agent at its next commit, or sooner through an adapter |
| Architecture reviews are distilled into cards by hand | `baesian deck --from` the review; its summary becomes the briefing |
| The style vote: a local server that saves ballots as JSON | The pattern for the client's server |

### A project, start to finish

1. **Create the vault.** `livedocs new-vault docs/vault --scaffold-modules` sets up the vault and the livedocs gate.
2. **Add Baesian.** `baesian init --vault docs/vault` installs the git gate, writes the `AGENTS.md` block, and points the adapter at the vault. Harness adapters are optional extras.
3. **The agent works.**
   - It builds decks from its plans, and files cards when it reaches a one-way door.
   - It adds trailers to its commits.
   - The gate catches what it missed.
4. **You answer in the client.** If you're there, it sits beside your terminal; if you're away, you use your phone.
5. **Verdicts reach the agent** at its next commit, or sooner through an adapter.
   - Rules apply at once in every worktree.
   - At merge, CI checks that the branch's decisions are answered.
6. **Over time:**
   - livedocs keeps the `describes` notes true to the code;
   - accepted rules accumulate in the `specifies` notes;
   - fewer cards get filed;
   - agents can run longer.

## Getting it into harnesses

- **Every harness (tiers 0 and 1):** the CLI, the git gate, CI, and the `AGENTS.md` block. This is the whole product; everything below only makes it faster.
- **Claude Code plugin (tier 2):**
  - a skill that teaches the agent to file good cards, reading the project's rules;
  - a `SessionStart` hook that injects `baesian inbox`;
  - the `ExitPlanMode` hook that calls `baesian deck --from`;
  - a `/baesian` command;
  - the MCP server.
- **Codex (tier 2):** MCP configuration, and its hooks for the same session-start injection. Codex reads `AGENTS.md` natively.
- **The MCP server (tier 2):** `file_card`, `get_verdict(wait=…)`, `list_resolved(since=…)`, as a view over the live layer.

## Open questions

- **Card quality:** how to stop agents from filing too many cards, or vague ones. The need-more-context rate measures card quality; what threshold should trigger changes to the instructions?
- **Deck boundaries:** when an agent should name a deck rather than use the branch default.
- **Identity and trust:** whose verdict counts, how to weight reviewers, and how this relates to trust scoring.
- **Reviewer disagreement:** two reviewers give different verdicts on the same card.
- **Semantic contradictions:** incompatible decisions that neither topic keys nor text matching catch (D38). How common are they? Measure first; the after-the-fact reviewer is the planned answer.
- **Views after GitHub merges:** a PR merged on GitHub runs no local hook. So the vault's views lag until the next commit on `main`, or a `baesian sync`. Is a CI job that commits the regenerated views worth it?
- **Topic-key drift:** agents may coin near-duplicate keys (`time/format`, `timestamps/format`). Autocomplete helps; does the client also need a way to merge keys?
- **Decision drift:** livedocs could flag when the code behind an accepted decision changes ("is B-7f3k still honoured?"). Two catches:
  - It only works for notes in the vault.
  - Dated notes already dominated its acks (P25 in live-docs).

  Should the adapter write accepted decisions into the vault as bound notes, or only generate the log?
- **Phone access:** the client runs locally. Reaching it from a phone needs the LAN or a tunnel.
- **Feedback loop:** whether verdicts should train routing and confidence calibration, and whether they could be a dataset in their own right.
- **Science vs software:** research decisions (methods, assumptions, interpretations) probably need their own card types. A timestamped log of analysis decisions with expert sign-off is close to a pre-registration and audit trail. Deferred until after the coding-agent version (D2).

## First version

The order is decided (D33). The universal pieces come first, so you can dogfood in coupled mode from the first week:

1. **The store and the CLI:**
   - both layers, with the immutable file formats and topic keys;
   - `init`, `file` (the duplicate and resolved-decision check, the OS notification, the `notify` command), `wait` (presence-aware, with levels), `inbox`, `deck --from`, `sync`.
2. **The git gate:**
   - `pre-commit` writes the record; `commit-msg` checks trailers, applies automatic acks and delivers verdicts;
   - the CI check, including the merge gate and conflict cards;
   - detectors in this order: dependencies, then schema and migrations, then CI/infra/deploy, then exported signatures (drift, optional).
3. **The client:**
   - a local stdlib server;
   - a responsive UI, desktop first, with arrow-key gestures;
   - decks, the response panel, and merged conflicting proposals;
   - the presence heartbeat and browser notifications.
4. **Adapters:** the Claude Code plugin (skill, `SessionStart` and `ExitPlanMode` hooks) and Codex hooks.
5. **The vault adapter:**
   - rules read from the Working Agreement and from rule notes;
   - one note per accepted rule;
   - the Decision Log block;
   - all writes only on the default branch.
6. **The MCP server,** as a view over the live layer.

Then dogfood it (D21) on this repo and on personal-website, which already runs decision cards by hand, so there's a before and after. Track:
- how often verdicts change what the agent does;
- the overturn rate;
- the need-more-context rate;
- time per card;
- cards per branch, and the autonomy horizon, over time.
