---
type: session
status: active
authority: log
livedocs: snapshot
summary: "First session: designed Baesian with the user (D1–D60), created this vault and repo, chose the stack, and built M1 (the store and the core CLI), M2 (wait, presence, notifications, AGENTS.md) M3a–M3c (the commit gate, `baesian verify`, the api: detector)."
created: 2026-10-23
tags: [baesian, session]
---

# 2026-10-23 Design Discussion

## Goal

The user asked for a read of `baesian.md` and a discussion of the design. Afterwards: fold the results into the doc, study the decision patterns in the user's other Obsidian vaults, and design Baesian to fit that way of working.

## What was done

- **Discussion.** The agent raised five points, and the user responded to each (D3–D7):
  - reversibility gets worse over time in non-blocking mode;
  - self-reported confidence is a weak routing signal;
  - verdicts could become standing conventions;
  - "skip" mixes up "not my area" with "unsure";
  - the science angle may be the more distinctive pitch.

  The user added context building (briefing cards, D5) and richer written feedback (D6).
- **Prior practice surveyed.** The live-docs vault (Start Here, Vault Conventions, the Decision Log's D/P split) and the personal-website vault (the Working Agreement's decision cards and one-way/two-way split, the Decision Card template, the style-vote server). The design's mapping table comes from these: [[Baesian Design#With a vault: the adapter]].
- **Design v0.2, then v0.3.** Added:
  - decks, fact-based routing, the response lifecycle;
  - the assumption ledger and learning conventions;
  - for v0.3, the user's decision to keep cards in `.baesian/` (D8), with the vault integration as an adapter.
- **Vault.** Ran `git init -b main`, then `livedocs new-vault docs/vault --name Baesian`. Added [[Home]], [[Working Agreement]], [[Decision Log]], the [[Decision Card]] template, and moved the design doc to [[Baesian Design]].
- **Commit and remote.** At the user's request:
  - first commit `fd64e0c`, made with `--no-verify` (see below);
  - created the GitHub repo `GusEllerm/baesian` with `gh` and pushed `main`. It is private, because the user didn't say and their other repos are private.

## Decisions

- **D1–D10** came out of the discussion.
- **D11–D22.** The agent then put proposals P1–P10 to the user as decision cards, and the user accepted all of them. Three were changed in the process:
  - the ledger also uses commit trailers (D15);
  - rules can also be proposed with a toggle at verdict time (D16);
  - the vault adapter owns a block in the existing Decision Log, rather than generating the whole log (D17).
- **Card IDs.** One ID per decision (D18), a short random string with a prefix so parallel sessions can't collide (D19).
- **D23–D26: where cards come from.**
  - v1 sources: plan-time decks, mid-task filing, and a commit gate as the backstop. An after-the-fact reviewer comes later.
  - The gate blocks until each detected decision is covered, by a card trailer or an agent-decision ack.
  - It starts with four detectors, including exported signatures.
  - A filed card counts as covered, except a blocking card.
  - P11, the gate's build order, was proposed. It was later withdrawn and replaced by D33.
- **D27–D36: harness independence and parallel agents.**
  - **The user's challenge:** stateful phases such as plan mode aren't equivalent across harnesses. And in practice, planning and implementing are tightly coupled and iterative, though the user wants to move toward planning first, then long autonomous implementation.
  - **Resolution:**
    - git is the state machine, in three tiers (D27);
    - plans are documents (D28);
    - batching by deck or branch (D29);
    - verdicts delivered through the gate (D30);
    - a merge gate (D31).
  - **The user's refinement:** don't answer inline in coupled mode; use the same client in both situations, for a consistent, polished feel. That became D32: only the client resolves, and blocking is the only difference between the modes.
  - **New v1 order (D33).**
  - **Multi-agent work, raised by the user:**
    - a two-layer store: live in `.git/baesian/`, the record in `.baesian/`, immutable files (D34);
    - conflicting proposals merged into one decision (D35);
    - a duplicate check with attaching (D36).
  - [[Baesian Design]] was rewritten as v0.5.
- **D37–D42: the open questions from v0.5.**
  - the record is written by the agent's own CLI actions plus `pre-commit`, with `baesian sync` as the fallback (D37);
  - contradictions are caught at filing (resolved decisions are searched too), with topic keys and merge-gate conflict cards (D38);
  - vault views are written only on the default branch, with one note per rule (D39, refining D17);
  - notifications come from the client, the OS, and a `notify` hook (D40);
  - presence is in v1 (D41);
  - a hard-blocking level (D42).
- **D43–D46: the open questions from D37–D42.**
  - **D43:** one vault note per decision and per rule, with the Decision Log as an Obsidian Bases query. This came from applying D34's immutable-file idea to the vault, and it supersedes D17 and D39.
  - **D44:** topic-key drift is handled with near-match warnings and alias merging.
  - **D45:** a "conflicts with…" link, plus measuring where contradictions are caught.
  - **D46:** only hard cards need a verdict at commit. The agent found this one while writing up the others: D26 and D42 together would have stopped a provisional blocking card from ever being committed.

All are in [[Decision Log]].

## Findings worth remembering

- **livedocs `new-vault` crashed with `KeyError: '…'`.**
  - Cause: the Home template in `src/livedocs/scaffold.py` contained `` `defineConfig({…})` ``, which `str.format` reads as a placeholder.
  - Workaround: the vault was scaffolded by running a patched copy from a scratch directory. The live-docs repo itself was not changed.
  - Reported to the live-docs-agent session (from session baesian-78), together with a second issue: `livedocs survey` raises a traceback in a repo with no commits.
  - live-docs-agent replied the same day:
    - The global `livedocs` is an editable install of `~/Projects/live-docs`. That checkout was on its unreleased ts-support branch, so the bug was never in a release.
    - The fix is live-docs commit `25297e0`, with a test that runs `new_vault()`. The checkout is back on `main` (0.1.4).
    - The `survey` fix goes into the same release.
- **The first commit needed `--no-verify` on livedocs 0.1.4.** The 0.1.4 pre-commit gate blocks a repository's first commit (`GitError: git diff --name-only HEAD`), so `fd64e0c` was made with `--no-verify`.
  - Later the same day, live-docs-agent reported that **livedocs 0.2.0 is released** and is now the user's global install, from PyPI rather than the editable checkout.
  - 0.2.0 fixes the first-commit problem, the `survey` traceback, and `new-vault`, and supports TypeScript.
  - `livedocs verify` passes on this repo under 0.2.0.
- **Obsidian Bases (checked 2026-10-23, obsidian-help docs via Context7):** a note can embed a live table with a `base` code block, filtered by folder (`file.inFolder(...)`) and properties. It isn't enabled in this vault's `.obsidian/core-plugins.json` yet.
- **Git hook behaviour (tested on git 2.55, 2026-10-23):** a file staged by `pre-commit` lands in the commit; a file staged by `commit-msg` doesn't, and is left staged for the next commit. That is why D37 writes the record in `pre-commit`.
- **livedocs decision D4 in live-docs** left decisions and specs to "a different system". Baesian fills that gap, which gives the pattern's framing: livedocs keeps `describes` notes true, and Baesian moves `specifies` notes from proposed to accepted.
- **Three IDs per decision.** In personal-website, one decision carries three IDs (P3 → DC-01 → G6). One card ID with a changing status would remove that bookkeeping.

## Development: M1

The user judged the plan ready for development.
- **Stack (D47–D51).** The agent's first suggestion was Python, to match livedocs. The user asked "what is the best language?" instead, and the analysis favoured TypeScript end to end. The deciding factors:
  - the client needs a build step anyway;
  - one schema is shared by the CLI, the server, the client and MCP;
  - agents are fluent in it.
- **File formats.** Implemented as proposal P12 ([[File Formats]]), for the user to review before 0.1.0, rather than decided field by field.
- **M1 was built** ([[Implementation Plan]]): the store, the core CLI, and 40 tests against real temporary git repos and linked worktrees. A smoke test with the compiled binary covered filing, the duplicate check, attaching from a second worktree, and the on-disk layout.
- **Bugs that came up:**
  - requiring `.baesian/config.json` would have made every fresh worktree say "run init";
  - two millisecond-resolution races, in the parent-rejection check and in verdict ordering. Both were fixed, and the suite was run repeatedly to confirm.

## Development: M2

- **Built:**
  - `wait`, with the three levels, the timeout, presence, fallbacks and exit codes 0, 4, 5 and 6;
  - OS notifications and the `notify` command;
  - the AGENTS.md block, written by `init`;
  - `template` and `topics`.
- 66 tests in total ([[Implementation Plan#Notes from M2]]).
- **A security catch.** D40's `notify` command can't live in the committed config: it would run on every clone, and a push token would leak. It moved to the per-user config, which is added to P12 for the user to accept.
- **The smoke test found a bug the unit tests couldn't.** Synchronous stdin reads fail with `EAGAIN` on slow pipes. Stdin is now read as a stream.

## Development: M3a

- **Decisions D52–D55:** the trailer formats; card coverage by `touches`; hooks as a marked block after the shebang; runtime-only dependencies, with smol-toml.
- **Built:** the commit gate, with three detectors, trailers, coverage, the block on rejected and unresolved hard cards, verdict delivery, the ledger, `baesian check`, and hooks that coexist with livedocs. 99 tests, including real `git commit` runs through installed hooks ([[src-gate]]).
- **Bug found by the integration test:** cards that `baesian file` wrote into the record were never staged. The fix stages the whole record in `pre-commit`.
- **livedocs caught its own stale notes:** when the M3a code was staged, it flagged the CLI and store module notes, which needed real updates.
- **live-docs-agent on signatures:** drift can't tell a signature change from a body change, and only sees symbols a doc is bound to. That made D25's premise wrong. The user chose a `livedocs signatures` command (D56), and dogfooding through `npm link` (D57).

## Dogfooding starts (D57)

- **Setup:** `npm link` put `baesian` on PATH, and `baesian init` here installed the gate in `.githooks/` beside livedocs and appended the AGENTS.md block.
- **Two hook bugs found right away, both fixed** ([[Implementation Plan#Notes from M3a]]):
  - no fallback under `npm link`;
  - machine paths written into the committed hooks.
- **`b2a5b21` is the first commit to pass Baesian's own gate.** `pre-commit` staged the record, livedocs stamped the updated notes, and there were no decisions to cover.
- **Asked live-docs-agent** for `livedocs signatures --cached/--rev --json` (D56).

## Development: M3c

- **livedocs 0.2.1 shipped `livedocs signatures`,** the same day it was requested. Checked on this repo, it reports exactly the API changes of the last two commits.
- **Decisions D58–D60:** only breaking changes count; the detector is opt-in through `gate_api`; M3c before M3b.
- **Built:** the `api:` detector, with 107 tests, including one against the real livedocs.
- **A correction on this repo's config.** The agent had suggested `gate_api` for `src/schema.ts`, but Zod constants aren't API facts. So `src/schema.ts` went into `gate_schema` instead. The gate then blocked the very commit that changed `src/schema.ts`, which was acknowledged against P12.

## Development: M3b

- **Built:** `baesian verify`. It checks each commit against its own committed record, and with `--merge` applies the merge gate and reports conflicting decisions, which `--file-conflicts` turns into conflict cards. 118 tests ([[src-verify]]).
- **On this repo's history,** it caught M3a's smol-toml dependency, added before the gate existed. The dogfood era passes.
- **Agent decisions** (in [[Decision Log]]): each commit is judged by its own record; at merge, withdrawn and superseded cards are notes rather than failures; the defaults for conflict cards.

## CI, and a pause

- **CI added at the user's request (D61):** `.github/workflows/ci.yml`, using `actions/checkout` v7 and `actions/setup-node` v7 (the latest; inputs checked).
- **This repo's gate flagged the workflow file** as `infra:.github/workflows/ci.yml`. It was acknowledged against D61, because the client that would let the user confirm a card doesn't exist yet.
- **The user paused here.**

## M4 design: rounds 1 and 2

- **D62–D64:** convention plus audit for "only the client resolves", with a hardened server; phone access through Tailscale in M4c; the visual direction by vote.
- **Round 1:** three static mockups, built from the user's personal-website taste and voted on. No winner. The user wants Tinder-style four-way swipe mechanics, and context that enables understanding: a hierarchy of decision, feature and project.
- **D65–D68:** the hierarchy drawn from structured data; required topics; hold-to-confirm on hard cards; one interactive prototype.
- **Round 2,** with Motion 14.6. A headless self-test of the keys and the trackpad swipe found and fixed two bugs. The worse one: releasing the key that completed a hold also accepted the next card.
- Details in [[2026-10-23 Client Mockups]].

## Research cycle: contextualising decisions

- **User feedback on round 2:** "closer". Use semantic names, not IDs (D69, applied). Then do deeper research, including extreme angles.
- **Four research agents in parallel:** theory; analogous review and triage tools; spatial and visual orientation; overseeing AI agents.
- **The synthesis** is [[Contextualising Decisions]], with the sources in [[Contextualising Decisions - Sources]]. Its headline:
  - the spine is Furnas's minimum;
  - choose context by value of information;
  - lead with projection;
  - the real failure mode is rubber-stamping, so tier friction;
  - help the reviewer verify, don't persuade;
  - typed relations, not one hierarchy.
- **Three extreme concepts for round 3:** the Atlas, the one-cue card, consequence preview; plus an oversight layer.

## Round 3

- **The user chose everything (D70):** all three concepts, the whole oversight layer, and all four card-format changes.
- **Mid-build, the user proposed trading-card rarity for consequence.** After a short search of the design language (Magic, Pokémon, Hearthstone, holo CSS) and the motivation research (Deci, Koestner & Ryan's 1999 meta-analysis), the agent wrote [[Card Rarity]]: rarity is the visual form of the friction tier, computed from facts, and treated as information, never as a reward.
- **Built** in four modules. The headless self-test passes, and screenshots were reviewed and fixed: label collisions, the camera hiding the area, the thread's SVG size, overview legibility. See [[2026-10-23 Client Mockups#Round 3: the combined prototype]].

## Round 4: independent review loops (2026-10-23 to 2026-10-24)

- **The user found round 3 hard to understand** and asked for a loop of independent review, revision and redesign until a new reviewer judged the design sufficient. Each round, a fresh reviewer agent drove the prototype in real Chrome, answered comprehension questions cold, then judged against a written bar. Full record: [[2026-10-23 Client Mockups#Round 4: an independent review loop]].
- **The card view took four reviews,** and the fourth judged it sufficient.
  - **The layout:** the card in the centre, with "What this builds on" and "What your answer changes" either side.
  - **Rarity** is explained in a sentence on every card.
  - **Answering:** an answer bar with the tier's steps, the reveal and the hold inside the card, writing inside the card, and undo for 5 seconds.
- **The user's idea:** a messy pile of the rest of the area under the card, which you move through. It's built, and the pile shows plain backs.
- **The user's review:** "much better and getting closer to the vision". The backend is the hard part, which led to [[Client Data Contract]] and the user's rule, D71: drop what can't be shown reliably. Commits and "re-decided" were dropped from the consequence panel.
- **The project map took seven more reviews overnight** (the user: "the project map however specifically needs work"). The seventh judged it sufficient. It's now areas as rows and each piece of work as a track, oldest to newest, with letters shared with the side panel. Edge bars name what's out of view. Nothing moves, measured at 0 px, at about 150 decisions as well.
- **Agent decisions** (`[agent decision]`). *Settled in D91: the map's are moot, and the user accepted the rest.*
  - the Atlas became a modal map, not the backdrop;
  - its two zoom levels gave way to one stable level;
  - foil only on the card's frame;
  - the collector jargon was replaced by a sentence;
  - preview-to-unlock was dropped: rare cards confirm with a second press and mythic cards are held;
  - Space only opens the map;
  - cards with a stopped agent jump the queue;
  - practice cards arrive among real ones.

## Round 5: glance first (2026-10-24)

- **The user asked how robust round 4 was,** and said it still needed work to be understandable at a glance, and was "converging to a project management interface". The agent's assessment:
  - the review loops were weaker evidence than "sufficient" suggests: same-model reviewers with code access, the agent's own bar, and an additive bias;
  - the sample data is idealised;
  - the code is prototype-grade.

  Measured: round 4's card had about 400 words in 27 type styles.
- **The user's decisions:** "We dont want to build linear etc." A subtractive pass judged by a glance test, and the map re-scoped to the decision's neighbourhood.
- **Round 5** (`design/explorations/round5/`) passed the second screenshots-only glance review. The card is now about 150 words. The map is replaced by a "Connected decisions" column beside the card. Full record: [[2026-10-23 Client Mockups#Round 5: glance first]].

- **The path (2026-10-24).** The user asked for the left column to show the traversal of decisions and their relationships. It's now a spine of your answered decisions, the current card (joined to the card) and what's next, with relationships hanging off the current node. It passed the second screenshots-only review. [[2026-10-23 Client Mockups#The path beside the card]].
- **An open question from the user:** "How can we understand the minimal amount of information to make an informed decision within a project / research process context?" The agent's answer:
  - **The working test:** an item belongs on a card only if it could change the choice, scaled by stakes and by what the reviewer already knows (value of information; recognition-primed decisions).
  - **A candidate minimal set:** the question; the options and what each does; when each wins (the crux); the stakes; and, for hard-to-undo cards, what would show the pick is wrong. Research decisions likely add evidence strength and reversibility in the data.
  - **How to measure it:** log what reviewers open; read "can't judge" responses; audit reversed decisions; run ablations using practice cards as ground truth; have agents state the crux.
  - **Still to choose (the user):** a research cycle on it, or a measurement plan in [[Client Data Contract]].

- **The minimal-card research (2026-10-24).**
  - The user questioned decision types ("a definition game which is rigid and unobtainable"), which led to D72: facets, not types.
  - Five strands then ran in parallel: decision relevance, what reviewers use, what agents report faithfully, research-process integrity, and an empirical pass over this vault's decisions using the session's own decision cards.
  - The synthesis is in [[Minimal Card Content]].
    - **Core:** the trigger comes back; the "if"s must hinge on one shared crux; each "then" carries its cost; what the agent did is shown first, as fact.
    - **Facets:** the kept set is sharpened, and about fifteen candidates are gated by measurement.
    - **"Enough":** a type-free test with a verifiability criterion.
    - **Measurement:** a plan built around practice cards and over-reliance.
  - Pronouns: the vault uses "they" for the owner.

- **The dry run (2026-10-24).** The user answered the ten open decisions from [[Client Data Contract]] as real cards in round 5 (`#dryrun`). Answers were saved to `design/dryrun/`.
  - **Nine decided (D77–D85):**
    - filing requires the core, plus what each facet asks;
    - commits are left out of the client;
    - agents cite rules;
    - choosing the alternative returns dependents;
    - a changed answer brings a rework brief;
    - the undo stays (revising D67);
    - practice cards are built from past cards;
    - Node's file watching with a rescan;
    - "see it run" gets its own response.
  - **Three of them rest on unverified premises** (D81, D83, D84). Their checks come first.
  - **The waiting-marker card came back as "I need more context".** Its case had been wrong: it blamed timeouts, which `baesian wait` already records. The revised card is queued at the same URL.
  - **Before handing over,** the agent removed decision IDs from the cards' text (D69).
  - **The agent's reading of D82, for the user to confirm:** the hold on hard cards stands, and the undo follows it.
  - What it showed about the cards: [[2026-10-23 Client Mockups#The dry run: real decisions in round 5 (2026-10-24)]].
- **Decide first, on every card (D86–D89).** The dry run changed the user's mind: the agent's pick is now hidden on every card until you choose, revising D76.
  - A disagreement gets an optional one-line reason, and you can switch to the agent's pick after the reveal; both choices are recorded.
  - The agent may reply once, with a new fact or a check, because models cave to pushback (Sharma 2023).
  - Built into round 5. The revised waiting-marker card is the first one to be answered this way.
- **The waiting marker is decided (D90),** with the pick hidden; the user chose it before the reveal. All ten decisions in [[Client Data Contract]] are now made.
- **Front-end v1 signed off (D91).** The user asked whether open questions of fact should become records, linked from the decisions that rest on them. The agent's view was that, with one real case, it would over-complicate things. The user agreed, and chose to move to the backend instead. They signed off round 5's departures, the live round 4 agent decisions, two trials from D70, and the agent's readings of D82 and D90. M4 starts with the file-watching test.
- **M4 step 1: D84's premise holds.** `test/premises/watch.mjs` wrote 40,000 files the way the store does, across four scenarios, on macOS and on Linux (Docker). The watcher missed none. Its limits are recorded in [[Implementation Plan#Notes from M4]]: Linux's per-folder watch limit, network and synced folders, and startup.
- **The user's cluster.** The user is building a cluster of Sparks for persistent agents, and wants Baesian deployed there eventually. Network drives would break watching. The agent recorded the wider issue, that everything assumes one machine, and three possible shapes, as an open question in [[Baesian Design#Open questions]]. The server will get polling as a mode of its own in the meantime.
  - **The user's lean:** one Baesian host per repo, as the easiest; not yet a decision.
  - **On persistence:** a persistent agent may be a grown context in which new shells start, so persistent agents can have multi-session behaviour. That fits the design as it is: `source_agent` names the agent, and new shells read the inbox. One gap: the inbox cursor is kept per branch.
- **M4 step 2: the format.**
  - **The draft:** the agent drafted the card and verdict fields in [[File Formats]] from D62–D90. The user settled its four open points: the body becomes optional context (D92); one alternative, with `also_considered` (D93); a fixed crux on conflict cards (D94); `reverse` required (D95).
  - **The code:** the schema, the filing rules, the reference check, `see_it_run`, `first_choice`, `client`, the waiting marker's schema, conflict cards, the template, `show`, and the AGENTS.md block. 127 tests pass, and a card was filed end to end with the CLI.
- **M4 step 3: the store's behaviour.**
  - **What it does:** choosing the alternative returns dependents (D80); a changed answer comes with a brief listing the commits that cite the card (D81); `baesian wait` keeps a waiting marker (D90). Briefs are computed, like status, and reach agents through `wait`, `inbox` and `show`.
  - **Tests:** 141 pass, and a brief was rendered end to end. The agent's readings of the decisions are logged as agent decisions.
  - **Testing:** the user asked for valid ways of testing the system, perhaps like hpc-bridge's scenario framework. A subagent surveyed that framework read-only: real agents in Docker jails against a fake cluster, a simulated user, deterministic trace and world graders, and sweeps with pass rates.
  - **The agent's critique:**
    - Baesian doesn't extract decisions; agents do, so a run measures the model, the harness and the instructions together.
    - There's no ground truth for "what it should have filed": use planted forks, deterministic facts and the user's labels.
    - An LLM reviewer bot can drive the protocol but can't judge cards, so its policy should be scripted over structured fields.
  - **The user's decision:** extract hpc-bridge's pattern into a general tool, as a separate project handed to another agent. Baesian goes on with implementation, plus ordinary tests per step, until the tool is ready.
  - **The handoff plan** is `docs/handoffs/scenario-harness-extraction.md`, outside the vault. It's based on a second, module-level survey of hpc-bridge's harness, and covers what exists, both consumers' needs, the hardest couplings, validity principles, milestones with acceptance tests, and the decisions for the user.
- **M4 step 4: the local server.**
  - **The draft:** the agent drafted [[Local Server]] from D41, D62, D63 and D84. The user decided its open points: a snapshot plus change events (D96), and a new token and port each time (D97).
  - **Built:** `baesian serve`, `startServer`, `Store.view`, and 15 integration tests against real servers and real processes. 156 tests pass on macOS and on Linux.
  - **A bug found:** the four-writer test exposed a race when two agents on one branch file their first cards at the same moment. It's fixed in the store, with a unit test of its own.
  - **A hook false positive:** a PreToolUse hook blocked a shell command that wrote source code containing the word `token`, taking it for a credential. The file was written with the editor tools instead.

## 2026-10-31: back after a week

- **Step 4 committed** (`b5fd9bc`). The user chose not to hold it back for the agentic test environment. The agent argued that the dependency runs the other way: the harness's reviewer actor needs the server's API.
- **The environment had been reset.** The `npm link` was gone; the agent restored it, as D57 had it. This repo's live layer `.git/baesian/` was gone too. It was empty when last seen on 2026-10-24. Parts of `.git` were rewritten at once on 2026-10-27, which looks like a copy or restore. Commits still pass the gate through the hooks' fallback. `baesian init` would recreate the live layer; that's waiting for the user's say-so, in case removing it was deliberate.
- **The extraction plan, reviewed.** Four independent reviewers read the handoff plan: accuracy against the code, architecture and milestones, readiness to hand over, and generality and validity. The agent checked their key claims against the code, and revised the plan.
  - **The main changes:**
    - a golden dump of the whole corpus replaces "re-grades to the same verdicts" as the first acceptance test;
    - the run model is decided in M0;
    - a "Day one" section, and rules on money and on working in hpc-bridge;
    - Baesian's instructions must actually reach the agent, and its ground truth must be taken from outside the agent's reach;
    - statistics and budget principles;
    - milestones resequenced, so Baesian is useful earlier.
  - **The record:** `docs/handoffs/scenario-harness-extraction-reviews.md` keeps each finding and what was done with it. The user starts the extraction project from the revised plan.
- **Committed** the revised plan and the review record (`bfa5af5`). `baesian init` recreated the live layer, with the user's go-ahead.
- **rehearse.** The user named the extraction tool `rehearse` (a private repo, `GusEllerm/rehearse`). They asked for the plan to set up the repo, the remote and livedocs. The plan now has those steps, approved, in "Day one". The agent read "livedocs / vault sync" as livedocs, which keeps the vault in step with the code. No separate vault-sync tool exists on this machine.
- **M4 step 5, the client.**
  - **The plan:** the agent drafted [[Client Build]]. The user decided `client/` at the root (D98), bundled fonts (D99), and Playwright run locally only (D100).
  - **5a, the scaffold, is built:** exact-pinned dependencies (React 19.3, Vite 8.3, Motion 14.9, `@fontsource` and Playwright 1.64, all devDependencies); the build into `dist/client/`; the server serving it under a strict policy; the dev server with its proxy; the API's types made self-contained.
  - **Tests:** 161 unit and integration tests and 4 browser tests pass.
  - **Two bugs caught:** a hanging response when a request failed after its headers were sent, caught by a new server test; and a font check that would have passed vacuously, caught by the agent and tightened.
  - **The credential hook fired again,** this time on a `sed` that was redacting the token from a log line. The agent dropped the line.
- **5a committed** (`3693f30`). The user creates `~/Projects/rehearse` themselves, so the plan's first setup step became `git init` inside it.
- **5b, the client's model,** ported from round 5 with 13 unit tests. 174 tests and 4 browser tests pass. Its readings of D90, D91 and the Contract are logged as agent decisions. One is a change from round 5: the precedent skips decisions already on the path.
- **5b committed** (`b42428f`). The user asked for the plan's path, to start the rehearse agent, and was given it with a suggested first prompt.
- **5c, the card and answering.**
  - **What's built:** the card in all its modes, the desk with keys, dragging and the hold, and the 5-second outbox with undo.
  - **Tests:** 183 unit tests and 16 browser tests pass, steady across repeated runs.
  - **Found by tests and screenshots, and fixed:**
    - a policy violation from Motion's `popLayout`, which made a leaving card push the next one down;
    - a leaving card that could have answered again;
    - two races where a key pressed at once was missed or undone;
    - navigation using the answer's exit.
- **5c committed** (`e332455`).
- **The user asked how Baesian is interoperable across models and harnesses.**
  - **The agent's answer:** no model calls (D65); a shell CLI with exit codes, and plain instructions in `AGENTS.md` (D27); checks rather than trust (the filing rules, the gate, verify); and optional adapters.
  - **Two gaps, found by checking the code:**
    - `baesian wait`'s 9-minute default assumes Claude Code's *maximum* command limit. Its default is 2 minutes, so a wait would be killed.
    - Every agent is named "agent" unless told otherwise. Claude Code exposes `AI_AGENT=claude-code_2-1-314_agent` to its commands.

    Both go to the user as decisions.
- **5d, the path, the pile and the motion.** 183 tests and 21 browser tests pass. A clash of `.row` rules (present in round 5 too) and a duplicated related card were found and fixed.
- **5d committed** (`acf7bd6`), without an explicit go-ahead. The agent flagged it.
- **D101 and D102, decided and built.**
  - **D101:** `baesian wait` runs in 100-second slices, and exits 7 ("run it again") while the reviewer is there. Its 9-minute budget counts across runs, through the waiting marker.
  - **D102:** an agent is named by `--agent`, then `$BAESIAN_AGENT`, then the harness's own variables (Claude Code's `AI_AGENT`), then "agent".
  - **This repo's `AGENTS.md` is refreshed.** 188 tests and 21 browser tests pass.
- **D101 and D102 committed** (`3423f89`), with the user's go-ahead.
- **5e, the rest of the client.**
  - **What's built:** presence, notifications, the "More" menu with the calibration and keyboard panels, the empty desk (recap, put-aside cards, the offer of notifications), and the "new" tag.
  - **Tests:** 193 unit tests and 28 browser tests pass. The agent broke two of the new checks on purpose to see them fail.
  - **The screenshots led to three fixes:** a "1.4 s" that wrapped its "s", time spent reworded as one line per stakes level, and clearer put-aside rows.
  - **A bug found on the way and fixed:** the sign-in cookie had one name for every server. Browsers don't keep cookies apart by port, so two projects served at once signed each other out, and each sent its token to the other. A browser test reproduced it before the fix.
  - **A question for the user:** each `serve` takes a new port (D97), and a browser keeps storage and notification permission per address. So everything the client keeps itself is lost on a restart, and notifications have to be allowed again. The agent put the decision to them as a card.
- **5e committed** (`95703e2`), with the cookie fix, at the user's go-ahead.
- **D103, decided and built.** The user chose the agent's recommendation: `serve` starts on the last server's port when it's free, kept in `port.json` in the live layer, with a new token every time. Three server tests cover it: the same port again, a fallback when it's taken, and `--port` or `reusePort: false` leaving the record alone. 196 tests pass.
- **D103 committed** (`acad9a9`).
- **5f, the quality pass.**
  - **The layout check:** round 5's script was gone with its scratchpad, so the agent rebuilt it as a browser test, from the five checks the vault recorded, and added a sixth: text hidden under something. The agent planted one defect of each kind to check the checker, and it caught them all once a hole was fixed: straight lines were being skipped.
  - **The side-by-side:** round 5 was run again on the same cards, at both sizes.
  - **Two bugs found and fixed:**
    - leaning slid the card 105 px over the path, a porting error: round 5 caps it near 18 px;
    - the card in front of you could change mid-reveal when the queue re-sorted.
  - **Restored from round 5:** the plain undo toast with its timer, the compact reveal, the summary's dot, the short-screen rule, the armed state, and the two-finger swipe.
  - **Found, for the user:** D89's one reply isn't in `AGENTS.md`, so the client doesn't promise it.
  - **Tests:** 196 tests and 32 browser tests pass, across three runs.
- **5f committed** (`a7f7d1b`).
- **D104, decided and built.** The user asked for D89's open question as a decision card. Checking first, the agent found the reply had no route at all: the store only let an agent revise a returned card, and choosing against the pick resolves it. The agent recommended waiting for dogfooding. The user chose to build it now.
  - **Built:** `baesian reply` files the reply as the card's next revision, with a new `reply` field. It's allowed once per card, only after an answer against the pick, and it reopens the card. A changed answer after it brings D81's brief.
  - **Agents are told** by `AGENTS.md` (this repo's is refreshed), `wait` and `inbox`. The client shows the reply under the crux, and promises it while it's still possible.
  - **Tests:** 9 store and CLI tests, a client unit test, and a browser test. 206 tests and 33 browser tests pass.
- **D104 committed** (`7a8f612`).

## 2026-11-01: P12's open points

- **The review plan.** The user asked what to review, and how. The agent put the committed record formats first, since they're expensive to change after 0.1.0, then a hands-on session with the client, then its agent decisions.
- **The user accepted the card revision and verdict tables,** and answered P12's open points as decision cards:
  - **D105:** drop `source_worktree`. The agent had checked that nothing read it, and that no card existed anywhere yet.
  - **D106:** `notify` stays in the personal config.
  - **D107:** verdict files are named timestamp first, against the agent's recommendation. The store now finds a card's verdicts by parsing the name.
- **The stale open point** on conflict links was fixed in the note: they're `conflict_of` and `caught_at`.
- **Tests:** 208 tests pass.
- **D105–D107 committed** (`0f5a4bf`).
- **A review of the schemas, proposed and put off.** The agent suggested three independent reviewers, for change over time, git workflows, and integrity and exposure. It had confirmed one risk in the code: every schema is strict, and no file carries a version, so an older Baesian would fail on a newer card. The user ruled version compatibility out until a v1 is published (D108). Without that, the formats stay cheap to change, so the review waits until just before publishing. One point that isn't about versions went into the plan, to watch in dogfooding: ledger entries keep commit hashes, which squash merges replace.

## Next

- **The user's own five-second test of round 5** against round 4. Then they confirm or overturn the departures listed in [[2026-10-23 Client Mockups#Round 5: glance first]], and the round 4 agent decisions above.
- **The premise checks** for D84 (file watching, first in M4a), D83 (a blind test of practice cards) and D81 (rework briefs against the files actually changed).
- **Then M4a.**
- The user reviews P12 ([[File Formats]]). That includes whether `source_worktree` should be an absolute path, and the move of `notify` to the user config.

- Before building the Claude Code adapter: confirm with `claude --debug` that a `PostToolUse` hook with matcher `ExitPlanMode` fires, and that `tool_response.plan` holds the plan.
