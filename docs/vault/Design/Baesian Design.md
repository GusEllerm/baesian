---
type: design
status: draft
authority: specifies
summary: "The Baesian design (v0.5): git as the state machine; cards, decks and responses; one client; routing on impact and reversibility; where cards come from (documents, mid-task, the commit gate); verdict delivery and the merge gate; parallel agents; two-layer storage and the vault adapter; open questions and the v1 order."
created: 2026-10-23
updated: 2026-11-05
reviewed: 2026-10-23
tags: [baesian, design]
---

# Baesian Design

*Swipe review for agent decisions. (Informally: Agent Tinder.)*

> **Status (2026-10-23): v0.5.**
> - Everything below is decided (D1–D46 in [[Decision Log]]) except the open questions.
> - The examples below are illustrative. The exact formats are in [[File Formats]] (proposal P12); trailer formats are settled in M3.
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
| **1: plain instructions** | An `AGENTS.md` block: when to file, run `baesian inbox` before starting work and when a task is finished (D116), add trailers | Any harness that reads instruction files |
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

Two more actions work on any card, at any time:
- **"Make this a rule"** can mark any response (D16; see Learning conventions).
- **"Conflicts with…"** links two decisions and creates a conflict card (D45). It's how the reviewer reports a contradiction nothing flagged, so these late finds are counted too.

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

What the client may show, and where each piece of it comes from, is in [[Client Data Contract]] (draft). Under D71 it shows only what Baesian can stand behind, and drops the rest.

- **A local web app.** It's a stdlib server like the style vote, serving a responsive UI. **The desktop layout comes first**, because coupled mode is where the work is today. Arrow keys are the swipe gestures, and the full context and diff sit beside the card. The phone layout uses the same app.
- **Coupled and autonomous differ only in whether the card is blocking:**

  | | Coupled | Autonomous |
  |---|---|---|
  | Card | Blocking | Non-blocking |
  | Agent | Runs `baesian wait B-7f3k` and pauses | Proceeds provisionally, recording what it builds in the ledger |
  | You | Get a notification and answer in the client beside your terminal | Work through the queue later, on your phone |

- **`baesian wait` works in any harness.** It's a shell command that blocks until a verdict arrives. Harness commands have time limits (Claude Code's default is 2 minutes), so each run lasts at most 100 seconds. While the reviewer is there, a run that ends exits 7, and the agent runs it again, up to a 9-minute budget in all (D101). It returns early with "reviewer away" if the client's heartbeat is stale (D41). What the agent does next depends on the card's level (D42):
  - **blocking:** it waits again, or falls back to its proposal and proceeds provisionally;
  - **hard:** it never proceeds without a verdict. It parks that task and does other work, or stops.

  The MCP server's `wait_for_verdict` is an adapter over the same mechanism, in calls of at most 100 seconds, as `baesian wait` runs (D168).
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
  - **hard**, when the decision must never proceed without a verdict. Spending money, touching security or privacy, deleting or overwriting stored data, and publishing make a card hard, whatever level the agent asks for: an agent may raise a card's level, never lower it (D144).

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
- **Claude Code:** a `PostToolUse` hook with matcher `ExitPlanMode` (D115).
  - The hook receives the approved plan as `tool_response.plan`, pipes it to `baesian deck --from -`, and returns `additionalContext` telling the agent to file the plan's hard-to-undo decisions into the new deck. It files no cards itself (D65): approving the plan was one yes for all of it, and its hard-to-undo decisions still come to you one by one.
  - Never use `PreToolUse` returning `allow` here: for `ExitPlanMode`, that auto-approves the plan and skips the user's prompt.
  - Source: <https://code.claude.com/docs/en/hooks>, read by a docs-checking subagent on 2026-10-23, and again on 2026-11-01 (`tool_response` holds `plan` and `filePath`).
  - *Unverified:* behaviour on a rejected plan isn't documented; it's to be tested in a real session.
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
  - `Baesian-Card: <id>` for a filed card. A filed card is enough, unless it's **hard**, in which case it needs a verdict first; this is how the gate enforces "never proceed" (D46). A blocking card whose wait timed out, or found the reviewer away, is recorded on the card as provisional, so the filed card covers the commit. The merge gate still requires its verdict;
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
  - **Ledger entries.** These are small immutable files naming the symbols in backticks, which tell a rework brief what to revisit. The client shows them as the card's "Implemented in" section. (Whether the client shows commits at all is open: they count only commits that cite the card. See [[Client Data Contract#The hard parts]] and D71.) When livedocs is installed, Baesian can reuse its mention resolution to turn the names into symbols. (*To check:* whether livedocs's resolver can be called on files outside the vault.)
- **Rising priority.** A card's priority rises as its ledger grows.
- **Rework briefs.** When a verdict overturns a decision, Baesian turns the ledger into a rework brief listing the symbols and commits to revisit. It's delivered at the branch's next commit (D30), or sooner by an adapter.

## Learning conventions

The most valuable output may be standing rules, not individual verdicts (D7). A reviewer who rejects "mock the database in tests" once shouldn't see that card again next week.

- **Two ways to propose a rule (D16):**
  - **The toggle.** Any response can be marked "make this a rule", for when the reviewer already knows the verdict is general.
  - **Convention cards.** Baesian mines verdict history and files "Make this a rule?" cards. It looks for the same kind of decision decided the same way twice, or a reviewer comment that states a rule.
- **Rules apply at once.** An accepted rule takes effect immediately in every worktree, through the live layer (D34). It's also written to the record, and with the vault adapter, as its own rule note (D43).
- **How rules are used:**
  - filing reads them, and doesn't file cards they already answer;
  - the gate acks changes they cover.
- **How a rule ends (D119):** by an answer. When the option you choose breaks one of your rules, the reveal offers "Retire this rule". To retire one nothing breaks, you ask an agent to file a card whose pick breaks it. The rule stays on record, marked retired, and the gate stops acknowledging what it covered. Replacing a rule is retiring it and making a new one.
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
- **Topic keys (D38, D44).** These are optional, free-form keys such as `time/format`, which the CLI autocompletes from the keys already in use. They make matching deterministic. The merge gate turns "same topic, different answer" into a conflict card. Drift is handled twice:
  - **at filing,** `baesian file` warns on near-matches ("did you mean `time/format`?");
  - **in the client,** the reviewer can merge two keys. Each merge is an immutable alias file, and all matching uses the canonical key.
- **The semantic residual (D45).** Some contradictions neither keys nor text matching catch. Every conflict card records where it was caught: at filing, at merge, or late, through "conflicts with…". The late rate is the residual. It's reviewed after the first stretch of dogfooding, which decides when the after-the-fact reviewer gets built.
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
  topics/alias-<ts>.json       # topic-key merges made in the client (D44)
  presence.json                # the client's heartbeat (D41)

.baesian/                      # RECORD: committed on the branch
  config.json                  # optional; with the adapter: { "vault": "docs/vault", ... }
  cards/  verdicts/  ledger/   # copies for the cards this branch's commits reference
  rules/  topics/              # accepted rules; topic aliases
```

- **The live layer** is what the client, `baesian wait` and every agent read and write. It's found with `git rev-parse --git-common-dir`, so all worktrees of a clone share it. Nothing in it is merged, and the client never writes into an agent's working tree.
- **The record layer** travels with the code. The merge gate and CI read only the record, so they need nothing from the live layer. It's written in three ways (D37):
  - `baesian file`, and attaching to a card, write the card into the agent's own worktree;
  - `pre-commit` copies in new verdicts and ledger entries for cards the branch already holds;
  - `baesian sync` is the fallback, for verdicts that arrived after the branch's last commit.
- **No conflicts, ever.** Every card revision, verdict and ledger entry is its own immutable file, and IDs are random. Parallel writes can't collide, and merges can't conflict. Status is computed from the files, never edited in place.
- **It's a seam for later.** The live layer is a local backend now. It can become the hosted queue service, for multiple machines or the expert marketplace, without changing the record.

Nothing outside these two directories is needed. A repo with no vault, no livedocs and no Obsidian still gets the full loop (D8).

### Personal mode: one layer (B-4rwyz)

Someone can use Baesian in a repo they share with collaborators who don't (the user decided B-4rwyz, "A personal mode: nothing committed"). `baesian init --personal` keeps everything in the clone, and changes nothing the others see:
- **The live layer is all there is.** The config is the clone's, `.git/baesian/config.json`, and no record is written; `/.baesian/` is in the clone's `.git/info/exclude`. Decisions don't travel with the code, so CI can't check them, and the merge gate has nothing to read. Merges are found from the ledger instead of the record (D181).
- **The gate runs from the clone's own hooks**, `.git/baesian/hooks/`, named in a git config file of Baesian's that the clone's `.git/config` includes at its end, so a team's setup script that sets `core.hooksPath` can't turn it off: Baesian's block, then the repo's own hooks, from the folder `core.hooksPath` names apart from Baesian's setting. Nothing in the repo's hook files changes. It still checks your commits, and takes the trailers out of each message once it has, into the clone's ledger, so the shared history never shows them.
- **Agents hear of Baesian from its plugin**, not from AGENTS.md, which is left alone: its session-start hook hands each session the same instructions, and its MCP server says so in its own.
- **Switching to shared mode** (`baesian init --shared`) writes the branch's record from the live layer, Baesian's block into the repo's hooks and the AGENTS.md block, for the person to commit. A repo whose record is committed is shared, and doesn't switch back.

### With a vault: the adapter

`baesian init --vault docs/vault` records the vault in `.baesian/config.json`. The adapter then does the following:

- **Points agents to the routing rules and conventions** in the vault's `specifies` notes (by default the Working Agreement and Code Conventions) and its `Rules/` notes, as guidance: one sentence in the `AGENTS.md` block names them (D173). The gate's rules come only from the store: a rule note shows a rule accepted in the client, and a note edited or added by hand changes nothing.
- **Writes one note per item, never an aggregate (D43).** This applies the store's immutable-file approach (D34) to the vault. Each item note is written on whichever branch it belongs to:
  - **each resolved decision** becomes a note in `Decisions/` (`B-7f3k Use SQLite for run metadata.md`);
  - **each accepted rule** becomes a note in `Rules/`, which the Working Agreement links to.

  The names are unique, and two branches adding the identical note merge cleanly, so nothing conflicts and nothing needs regenerating after a merge, even a GitHub one. The adapter never edits hand-written prose. A written note changes only by its frontmatter and a dated section added at the end, when its decision is superseded, its answer changes, it's reopened or withdrawn, or a rule is retired (D172, widening D43's one edit). Each is rendered from the record, so two branches that extend a note the same way write the same bytes, and two branches superseding the same decision at once is a real conflict worth seeing.
- **The Decision Log embeds a query** instead of owning a generated block (D43, revising D17). An Obsidian Bases `base` code block, roughly `file.inFolder("Decisions")` shown as a table, renders the current decisions whenever the note is opened. Hand-written rows elsewhere in the log stay as they are, so existing vaults need no migration.
  - Bases must be enabled in the vault: `baesian init --vault` turns it on in `.obsidian/core-plugins.json`.
  - Outside Obsidian, the `Decisions/` folder is still a readable set of notes.
  - Source: <https://github.com/obsidianmd/obsidian-help> ("Bases syntax", "Create a base"), checked 2026-10-23.
- **Decision and rule notes are livedocs snapshots** by their own frontmatter (`livedocs: snapshot`, D175), so they never create acks, and Baesian never edits livedocs' config.
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
| Decision Log rows are added by hand | One note per decision; the Decision Log is a live query over them |
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
- **The plugin, for Claude Code and Codex (tier 2),** in this repo at `plugins/baesian/` (renamed from `plugins/claude-code/` by D118), with the marketplace file at the root (D114):
  - a skill that teaches the agent to file good cards, reading the project's rules;
  - hooks that bring in `baesian inbox --quiet` at natural stopping points, never mid-task (D116), passing the harness's session id so each session on a branch hears each verdict once (B-ghhym): `SessionStart`, `UserPromptSubmit`, and `Stop`, at the end of the agent's turn. When `Stop` brings in a verdict, Claude Code sends one more request on its own, so the agent acts on the answer in a turn of its own;
  - waking on answers while idle (B-xnae9): the skill tells an agent that ends its turn with cards still open, in a harness that wakes it when a background command finishes (Claude Code), to leave `baesian wait <ids> --until-answered` running in the background, so it acts on the answers when they come, without a message from you. With nothing new, `Stop` reminds it once a session for each card (`onTurnEnded`), in Claude Code 2.1.145 and later, whose Stop input lists the session's background tasks: never when a `baesian wait` is running there already, nor while the agent carries on for a Stop hook. Codex can't be woken that way, and works as before;
  - the `ExitPlanMode` hook that calls `baesian deck --from -` (D115). A plan sent back with feedback fires no `PostToolUse`, so it makes no deck (rehearse's probe, Claude Code 2.1.316);
  - a command, `/baesian:baesian` (Claude Code names a plugin's skills after the plugin, and takes `/baesian` when no other command has the name), which is the skill run by you: it checks the inbox, or files a card for a decision you name;
  - the MCP server (D165): the plugin's `.mcp.json` runs `baesian mcp` from PATH, as the hooks run `baesian`, with no timeouts, so the one file serves both harnesses. Claude Code starts it when the plugin is enabled, and names its tools `mcp__plugin_baesian_baesian__file_card` and so on. `baesian init` never writes a `.mcp.json` into a repo ([[src-mcp]]).
- **Codex (tier 2):** Codex reads `AGENTS.md` natively, and reads Claude Code's plugin and marketplace files too: Codex 0.154 installs this repo's plugin unchanged (`codex plugin marketplace add`, then `codex plugin add baesian@baesian`). Codex users get the hooks from the same plugin, each person installing it, rather than from a `.codex/hooks.json` that `baesian init` would commit to the repo (D118). In Codex:
  - the session-start and next-message hooks carry over, since Codex adds their plain output to the agent's context;
  - the `Stop` hook answers Codex in its own form, a block with a reason, since Codex ignores `additionalContext` there (`onTurnEnded` tells the two apart by Codex's `turn_id`);
  - the skill is `$baesian`;
  - the plan hook never fires, since Codex has no plan approval like Claude Code's;
  - Codex runs a plugin's hooks only once the person has reviewed and trusted them.

  Not yet checked: the hooks running inside a Codex session, which needs a trusted hook and a model (rehearse's runs). Codex reads the plugin's `.mcp.json` too; not yet checked there: whether it asks before starting the server, or counts the file in the plugin's trust hash.
- **The MCP server (tier 2, M7):** `baesian mcp`, over stdio, a view over the live layer: one tool for each agent command (D166, revising the three first planned here), each returning what its command prints ([[MCP Server]], [[src-mcp]]).

## Open questions

- **Card quality:** how to stop agents from filing too many cards, or vague ones. The need-more-context rate measures card quality; what threshold should trigger changes to the instructions?
- **Deck boundaries:** when an agent should name a deck rather than use the branch default.
- **Identity and trust:** whose verdict counts, how to weight reviewers, and how this relates to trust scoring.
- **Reviewer disagreement:** two reviewers give different verdicts on the same card.
- **Decision drift:** decisions are now vault notes (D43), so livedocs *could* bind them and flag when the code behind an accepted decision changes ("is B-7f3k still honoured?"). They're snapshots for now, because dated notes already dominated the livedocs acks (P25 in live-docs). Is binding some of them (hard decisions only, say) worth the acks?
- **Phone access:** the client runs locally. Reaching it from a phone needs the LAN or a tunnel.
- **A hosted service (2026-11-02):** a website people sign up to and answer their cards on, from a laptop or a phone. Decided so far: the repo owns its decisions and the website is a relay (D127); agents reach it through Baesian on their machine, the CLI and a local MCP server, after a one-time sign-in (D128), with the security of a local MCP server still to be worked out; the user hosts it centrally for others, which lets them monitor usage (D129); the client gets a phone layout (D130); and preference sliders are set per repo or project (D131). It's part of v1 (D132). **Still open:** how the sliders work, which needs deep research (the user's current view: every card is created, and a classification gate against the repo's preferences decides which reach you, run by the agent or an external classifier such as Jev, TypeSafe AI's classification model); what the service collects, and its privacy policy. It changes D63 (the client only on 127.0.0.1) for the hosted case, and could make D62's "only the client resolves" enforceable, if the website vouches for each answer.
- **Several machines (2026-10-24):** the user is building a cluster of Sparks for persistent agents, and wants Baesian deployed there eventually.
  - **Everything today assumes one machine:** the live layer is in one clone's git directory (D34), the server watches it locally (D84), and the client is on 127.0.0.1 (D63). Agents with their own clones on other machines share nothing until merge, so the filing check and conflict detection only meet at the merge gate.
  - **Three possible shapes:**
    - **Shared network storage:** one clone, with every agent's worktree on it. The server has to poll, since inotify doesn't report writes made by other machines. Exclusive create needs NFSv3 or later. Heartbeats (D41, D90) need synced clocks.
    - **One Baesian host per repo:** agents elsewhere file and wait through its API. It's consistent, and it makes "only the client resolves" enforceable (D62), but it's a network service whose security has to be settled.
    - **Git as the transport:** the live layer is pushed and fetched between clones; its write-once files merge without conflicts. There's no new service, but it's only eventually consistent.
  - **The user's lean (2026-10-24), not yet a decision:** one Baesian host per repo, as the easiest. The live layer then stays on one machine, so local watching works as tested, as long as agents on other machines go through the server's API rather than a mounted share.
  - **Persistent agents, in the user's current thinking:** possibly a grown context in which new shells (agents) start, so a persistent agent can span many sessions. The design already fits this:
    - `source_agent` is free text, so it can name the persistent agent rather than the harness;
    - a new shell picks up verdicts through `baesian inbox`;
    - D90's marker belongs to the shell that's waiting;
    - the "next session" of D81 and D90 is the next shell.

    One gap, closed provisionally on 2026-11-02 (B-ghhym): the inbox cursor was kept per branch, so if two shells of one agent shared a branch, the first to read the inbox took its verdicts. Now each session the plugin's hooks name keeps its own place.
  - **To settle,** as a decision card, once the cluster's storage, networking and agents are clearer. Meanwhile:
    - M4's server makes polling a mode of its own beside watching;
    - its API is shaped around the store's operations, so agents' commands could later go through it.
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
   - one note per decision and per rule;
   - the Decision Log's `base` query;
   - Bases enabled, and snapshot globs for the new folders.
6. **The MCP server,** as a view over the live layer.

Then dogfood it (D21) on this repo and on personal-website, which already runs decision cards by hand, so there's a before and after. Track:
- how often verdicts change what the agent does;
- the overturn rate;
- the need-more-context rate;
- time per card;
- cards per branch, and the autonomy horizon, over time;
- where contradictions are caught (filing, merge, late), which decides when the after-the-fact reviewer is built (D45).
