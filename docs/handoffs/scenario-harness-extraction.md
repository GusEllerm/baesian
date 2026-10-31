# Plan: rehearse, a general scenario harness extracted from hpc-bridge

A handoff for the agent who starts this as its own project. The tool is called **rehearse**: agents rehearse against a staged world and stand-in people before they go live. Scenarios are its scripts, simulated people its understudies, and mid-run hooks its cues. The owner chose the name on 2026-10-31.
- **When:** written on 2026-10-24 in the Baesian repo, in a session with the owner of both projects. Revised on 2026-10-31 after four independent reviews: accuracy against the code, architecture and milestones, readiness to hand over, and generality and validity. Their findings, and where this plan departs from them, are in `scenario-harness-extraction-reviews.md` beside this file.
- **What the facts describe:** hpc-bridge's `main` at `a8db4dc`, the last commit on `main` to touch the harness. hpc-bridge's main checkout is on another branch, `fix/perlmutter-report`, 21 commits ahead, where line numbers drift by about ten and there are more scenarios. Read `main` without touching the checkout: `git -C /Users/gusellerm/Projects/hpc-bridge show main:<path>`.
- **Paths:** relative to `/Users/gusellerm/Projects/hpc-bridge/agentic/`, unless they start with `src/`, `docs/`, `.github/` or `CLAUDE.md`, which are at hpc-bridge's root. Baesian's paths are relative to `/Users/gusellerm/Projects/baesian/`.

## Why this project exists

hpc-bridge tests itself with real agents in containers. Each scenario gives an agent a task, a simulated user answers its questions, faults are injected mid-run, and deterministic graders judge the trace and the state of the world. Sweeps across models and harnesses turn that into pass rates. The owner wants the pattern as a tool other projects can use:

> "I am interested in extracting the hpc-bridge pattern into a library / tool. If it is generalisable I am open to extracting that to make it a tool that can be applied to other projects -- this has actually been on my list of things to do."

It's kept separate from Baesian ("I dont want to dilute what we are doing here"), so it's your project. Baesian is waiting to be its second consumer, and carries on with ordinary unit and integration tests until the tool is ready.

## Day one

### Set up the repo

The owner has approved these steps, including the first commit and push. They make the repo the home for your notes, decisions and session logs from the start.

1. **Create the repo:** `mkdir ~/Projects/rehearse && cd ~/Projects/rehearse && git init -b main`. Neither the folder nor a GitHub repo of that name existed on 2026-10-31.
2. **Add a short `README.md`** saying what rehearse is, with one line pointing to this plan, and a `.gitignore` for Python: `.venv/`, `__pycache__/`, `.env`, and any run output. Add no package skeleton or license yet: packaging and the license are decisions for M0.
3. **Install livedocs and create the vault.** livedocs keeps the vault's notes in step with the code: a note that names code in backticks is bound to it, and a commit that changes that code is blocked until the note is reconciled.
   - **Install or upgrade it:** `uv tool install livedocs` (or `uv tool upgrade livedocs`). Use version 0.2.2 or later.
   - **Create the vault:** `livedocs new-vault docs/vault --name "rehearse vault"`.
   - **Set up the gate:** `livedocs init --vault docs/vault`. This writes `.githooks/` and sets `core.hooksPath`, writes `.livedocs/config.json`, adds a Claude Code heads-up hook to `.claude/settings.local.json`, and appends livedocs' instructions to `AGENTS.md`.
   - **Mark dated notes as snapshots.** Add `snapshot_globs` to `.livedocs/config.json`, as Baesian's has, so session logs, reviews and templates are never checked: `["Reference/Review *", "Reviews/*", "Sessions/*", "Templates/*"]`.
4. **Bring this plan home.** Copy it, and the review record beside it, into `docs/vault/Design/`, with a line saying where they came from. From then on, correct the plan there. That's where M0's output goes.
5. **Start the vault's memory:**
   - **`docs/vault/Home.md`:** what rehearse is, its current status, and the reading order for a fresh session.
   - **`docs/vault/Decision Log.md`:** every decision, saying who made it. The first entries are the owner's of 2026-10-31: the name, and a private repo.
   - **`docs/vault/Sessions/`:** a log at the end of every session that changes anything.

   Baesian's vault is a working example: its `docs/vault/Home.md`, `Working Agreement.md`, `Decision Log.md`, and `Templates/Decision Card.md`.
6. **Make the first commit, then create the remote and push:**
   - `gh repo create GusEllerm/rehearse --private --source . --remote origin`
   - `git push -u origin main`

   `gh` was signed in as GusEllerm, with repo access, on 2026-10-31. If it isn't, ask the owner rather than working around it. The repo stays private: making anything public is the owner's decision.

**Using livedocs from then on:**
- **In notes,** name symbols in backticks (`Trace`, `gating()`, `World.snapshot`), not files: a path to a module binds only its default export.
- **A new or edited note is stamped** by the commit that contains it.
- **When a commit is blocked,** edit the note and commit again; or, if the note is still right, run `livedocs stamp <note> --ack --reason "<why>"`, `git add -A`, and commit.
- **`livedocs affected`** lists the notes your uncommitted changes touch, and **`livedocs coverage`** shows which mentions are anchored.

### Then ask the owner

Your next action is a message to the owner, with these questions. None of them can be answered from the code:
1. **Whether you may create your own worktree of hpc-bridge, off `main`.** You need it for the baseline and, later, the extraction branch.
2. **Which channel to raise decisions in:** the chat, a shared document, or Baesian cards. Whatever the channel, the decision goes in the Decision Log.
3. **The budget for runs that call a model,** if any, before M3.

Until the owner answers, you may do anything that's free and changes nothing outside rehearse's own repo:
- read both repos (hpc-bridge from `main`, as above);
- read the stored run bundles in place;
- draft the M0 split in the vault.

## How to work

- **Commit and push only when the owner asks.** The setup steps above are the exception, and are already approved.
- **The owner decides anything hard to reverse.**
  - **The list** (the name and a private repo are already decided): the language; packaging, and how hpc-bridge depends on the tool; the run model (see M0); the freeze or rebase policy for hpc-bridge during the extraction; image tags; the budget for model runs; model endpoints and credentials; new dependencies; and publishing.
  - **How to bring each:** a recommendation, its strongest alternative, and what would change your mind. Never present a proposal as agreed.
  - **What an approved split covers:** once the owner approves the M0 split, that approval covers the moves it lists, on your branch. Departures from it, new dependencies, and merges into hpc-bridge's `main` go back to the owner.
- **Money.** hpc-bridge's own rule: live agentic runs cost money, and must not be launched unprompted (`CLAUDE.md:21`).
  - **Free, and allowed without asking:** hpc-bridge's hermetic tests, `harness/regrade.py`, the golden dump (see M0), and script-operator runs against the fake cluster, which need Docker and call no model.
  - **Needs the owner's go-ahead, with a cost estimate:** every run that calls a model. That includes live cells and sweeps, and any run with a persona, since the simulated user always calls Claude Haiku.
- **Working in hpc-bridge:**
  - **Never switch the main checkout's branch.** The owner's own branch and 13 other worktrees are in use.
  - **Work in your own worktree, off `main`,** once the owner agrees.
  - **The stored bundles in `runs/` exist only in the main checkout.** They're gitignored: about 2,650 entries and 277 MB. Read them in place, read-only (`harness/regrade.py` takes a runs directory), and never write there.
  - **Every build uses one image tag, `hpc-bridge-agentic`** (`run_smoke.sh:170`). Building on your branch while a sweep runs would swap the code under it. Use a tag of your own, and check `docker ps` for running jails before any build (or ask).
  - **Follow hpc-bridge's rules:** PRs are squash-merged into `main`, and the vault and `HANDOFF.md` are kept in step (`CLAUDE.md`).
  - **Extract by strangling:** leave `harness/invariants.py`, `run.py` and `regrade.py` in place as thin modules that re-export from the tool or call it. Then 73 scenario imports, and the other branches, keep working.
- **Don't change the Baesian repo.** What Baesian needs is below. Anything it has to build goes through its own sessions, by way of the owner.
- **Secrets never go in a repo:** model tokens, SSH keys, and the credentials for the owner's inference endpoint.
- **The owner reads plain explanations, not jargon,** and prefers the honest limits of a result to a confident summary.

## What exists

As of `main` at `a8db4dc`:
- `harness/` has about 12,800 lines of code in 34 modules, and 46 test files with about 19,200 lines. About 8,000 of those test lines test scenarios, fake-cluster profiles and targets, not the harness itself.
- There are 69 scenarios, about 9,400 lines. `fix/perlmutter-report` adds `harness/byo_script.py` and `node_actions.py`, and has 75 scenarios.

Nothing in the repo plans an extraction. The closest statements are Plan B's "separate harness, shares this trace/invariant core" (`docs/hpc-bridge-vault/Planned/Agentic testing - Plan B (runtime sandbox).md`, line 171), and the split into "a world (a cluster profile), a situation (a scenario), a human (a persona)" (`docs/hpc-bridge-vault/Reference/Simulation library review 2026-09-05.md`, §1).

### Modules, by how generic they are (all under `harness/` unless noted)

| Group | Generic already | Mixed: generic core, HPC parts to split out | HPC only |
|---|---|---|---|
| **Traces** | `trace_adapter.py`, `claude_transcript.py`, `hermes_trace.py` | | |
| **Operators** (agents) | `responses_relay.py` (a Codex-to-vLLM shim) | `runner.py` (the Claude Agent SDK); `cli_runner.py` (Codex, Pi, hermes21); `script_runner.py`; `hermes_runner.py`; `hermes_setup.py`; `acp_runner.py`; `acp_client.py`; `acp_trace.py` | |
| **The simulated user** | | `human_sim.py`: `Exchange` and `Move` are generic. `HumanSim` also holds hpc-bridge's login-code logic (TOTP, scripted code personas), and always calls Claude Haiku through the Agent SDK (`:296, 315-323`) | |
| **Grading** | | `invariants.py` (the types, helpers and shell parser are generic; almost every grader is HPC); `infra.py`; `regrade.py`; `canaries.py`; `repl_protocol.py` | |
| **Orchestration** | `proctree.py` | `run.py` (the pipeline and verdicts are generic; the SSH world, tokens and teardown are HPC); `midrun_hooks.py`; `scenario_knobs.py`; `pool.py`; `server_stderr.py`; `serve_with_stderr.py` | `cluster_ops.py`, `targets.py`, `admin_tap.py`, `fake_ssh_catalog.py`, `old_endpoint.py` |
| **Bundles** | | `provenance.py` (`_safe_env` records `HPCB_*`, `HPC_BRIDGE_*`, `GLOBUS_COMPUTE_USER_DIR`, and four credential names with their values redacted) | |
| **Running and reporting** (in `agentic/`) | `sweep_dash.py`, `watch.sh` | `run_smoke.sh`, `run_suite.py`, `Dockerfile`, `entrypoint.sh` | `sweep_profiles.sh`, `sweep_endpoints.py`, `sweep_pool_user.sh`, `repl_sweep.py`, `install_check/` |
| **Model backend** | | `alcf_inference.py`, `alcf_probe.py`, `inference_auth_token.py` (Globus auth) | |

### The interfaces as they are

- **The trace** (`harness/invariants.py:40-82, 521-562`).
  - **Its parts:** a `ToolCall` holds the logical name, the input, the result, the raw name, any answers to `AskUserQuestion`, a phase, and the call and result times. A `Trace` holds the calls, the agent's texts, the position of each text among the calls, and what the user said and when.
  - **Questions in prose:** hermes and the ACP operators turn them into synthetic calls. The Claude runner keeps the user's prose replies in `Trace.user_said`.
  - **One agent:** neither type records which agent made a call. Every cell runs one operator, and `PHASES` run sessions one after another (`run.py:96`).
- **Grader results and verdicts.**
  - **A result** is `(name, ok, detail)`: pass or fail, with no value.
  - **The verdicts:** OK, FAILED, CRASHED, SETUP FAILED, RATE_LIMITED, INFRA, INTERRUPTED and SKIPPED, with exit codes in `run.py:12-14`.
  - **A line other tools parse:** `run_suite.py` and `sweep_dash.py` read the `RESULT:` line from stdout, so it must stay byte-compatible.
- **What gates** (`run.py:1490-1541`):
  - **the scenario's `EXPECT_OK`,** plus the liveness and floor graders;
  - **with no `EXPECT_OK`,** every row;
  - **some harness rows, only when they apply:** `prose_followups` with a persona, `midrun_hooks` with hooks, and `trace_complete` when present;
  - **always:** every `world:*` row, and the leak check after teardown;
  - **in benchmark mode,** `OPERATOR_PREFERENCE_GRADERS` only report.

  `regrade.py` has its own copy of this logic, and the two differ: with no `EXPECT_OK`, a run gates every row, but a re-grade gates none.
- **Scenarios** are Python modules, loaded by import (`run.py:1212-1219`).
  - **No schema:** about 30 attributes are read with `getattr` defaults.
  - **Environment at import:** some scenarios build their graders from environment variables at import time.
  - **`KIND`** is recorded, but nothing acts on it.
  - **`EXPECT_OK`:** none of 1,883 graded bundles names a row that doesn't exist, so a strict check is safe to adopt, as long as it runs at the end of a run (some row names are made at run time).
- **Operators:** six call models, `claude` (the Agent SDK), `claude-acp`, `hermes`, `codex`, `pi` and `hermes21`, and there's also `script` (`run.py:1693`).
  - **A shared signature, by convention only:** they share `run_scenario(prompt, *, repo_root, model, effort, persona, user_goal, …) -> RunResult`. `run.py` picks one by name.
  - **No personas on the CLI operators:** Codex, Pi and hermes21 refuse a persona (`cli_runner.py:655-656`).
- **The ground-truth journal.** hpc-bridge's MCP server writes a journal of every call (`src/hpc_bridge/server.py:288-345`).
  - **Codex, Pi, hermes21 and script:** their own logs give the order of calls, and the journal gives what each call received and returned. The two are aligned by `cli_runner._align` (`:339`).
  - **Without the journal:** `hermes` builds its trace from its own `state.db`, and `claude-acp` from the Claude transcript.
- **Mid-run hooks** fire after or during a tool call, and act through `cmd`, `world`, `interject` or `interrupt` (`midrun_hooks.py:4-62`).
  - **Seeing calls late:** Codex and Pi only see a call once the journal records it, so hooks can't fire during one.
  - **A module function, not a method:** `effective_input` (`:231`) reads hpc-bridge's `server.py` source.
- **The bundle** (`provenance.py:158-211`). It's already versioned: `record.json` carries `"schema": 2`, and 252 older bundles are schema 1, with no `result`.
  - **`record.json`:** config, redacted environment, result, gating, grading rows, cost, turns and dialogue.
  - **`messages.jsonl`:** in the operator's own shape, with arrival times.
  - **Also:** `transcript.md`, and side logs.
- **Re-grading** (`regrade.py`) replays `check_all`, the floor graders, `EXTRA_INVARIANTS` and `run_completed`.
  - **What it doesn't replay:** `world:*` rows (`:202`), or the `harness:*` and server-stderr rows.
  - **What it compares:** only `ok`, and only for rows that exist both before and after (`:240`).
  - **It already disagrees with the stored records.** A full re-grade on 2026-10-31 changed the verdict of 364 of 2,184 bundles, before any extraction.
- **The world** has no interface.
  - **Over SSH:** `SETUP`, `CLEANUP` and string postchecks run over SSH (`run.py:178-202, 287-347, 626-674`). The async `WORLD_CHECKS` reach the cluster through `WorldContext.ssh`, and `script_runner.World` is the same callable.
  - **In the jail:** `LOCAL_SETUP`, and postchecks marked `"on": "local"`.
- **Host and jail.** Some of the scenario contract runs on the host, not in the jail.
  - **`scenario_knobs.py`** is evaluated by `run_smoke.sh` before `docker run`.
  - **`admin_tap.py` and `node_actions.py`** run on the host, and reach the jail through files.
  - **`ADMIN_SETUP`** is applied by `run_smoke.sh`.
- **The jail** is `Dockerfile`: Python 3.11 with uv, the Claude Agent SDK, Codex, Pi and hermes.
  - **Users:** the agent and the harness run as the same user, `agent` (`:52, 83`). Moving the harness out of the agent's working directory wouldn't stop the agent reading it.
  - **Credentials** are mounted read-only and copied into place (`entrypoint.sh:9-20`). `HPCB_*` is scrubbed from the agent's environment.
  - **No hardening:** no capability drops, no read-only root, and no network or resource limits.
- **How the Claude operator frames a run.** It loads no settings, `setting_sources=[]` (`harness/runner.py:231`), so a project's `CLAUDE.md` and `AGENTS.md` never reach the agent. Its system prompt says "There is no human to answer follow-up questions" (`:174`, and `hermes_runner.py:74`).

### The hardest couplings to break

1. **The ground-truth journal is a feature of the product** (hpc-bridge's MCP server), and three operators depend on it.
2. **The trace assumes one agent, Claude's tool names, and `AskUserQuestion` as the canonical question.**
3. **The simulated user only answers questions the agent asks,** and it's tied to Claude Haiku. Nothing can act on its own in the world while an agent is blocked.
4. **`run.py` mixes the pipeline with SSH-world code:** teardown, pilot checks, token stores, and secret material.
5. **The scenario contract is implicit, and split between host and jail.**
6. **Environment-variable prefixes and string formats are hard-coded:** `HPCB_` in scrub lists, provenance and allowlists, and the `RESULT:` line.
7. **Operators hard-code hpc-bridge:** they register it as an MCP server, inject its skill, use its tool names (`cli_runner.HPCB_TOOLS`, `infra.py:44`), and default to the ALCF model.
8. **The run's framing and instruction loading suit hpc-bridge, not a product whose agents should defer to a person.**

## What we want

### For hpc-bridge, the first consumer: nothing lost

- **Every operator still works** (the six model operators and `script`), and so do the simulated user, hooks, canaries, INFRA classification, the pool, the suite, sweeps and the dashboard.
- **The `RESULT:` line stays byte-compatible.**
- **Bundles of schema 1 and 2 stay readable, for good.**
- **The fake cluster, profiles and targets become hpc-bridge's plugin.**

### For Baesian, the second consumer

**What Baesian is.** A TypeScript CLI (`baesian`, on Node 22) through which coding agents file their design decisions as cards. A person answers the cards, and the verdicts go back to the agents. The pieces a harness has to work with:
- **The store:** the live layer `.git/baesian/` is shared by every worktree of a clone, and a committed record lives in `.baesian/`.
- **What agents run:**
  - `baesian file` (exit 3 means it may already be open or decided);
  - `baesian wait <id>`: exit 0 means resolved, 4 answered otherwise, 5 proceed provisionally, 6 don't proceed;
  - `revise`, `withdraw`, `attach` and `inbox`.
- **The commit gate:** git hooks detect dependency, schema, CI and API changes, and require a `Baesian-Card: <id>` or `Baesian-Ack: <fact> <reason>` trailer.
- **Briefs:** `wait`, `inbox` and `show` print them when a card is returned because what it builds on was decided otherwise, or when an answer changes after an earlier one resolved the card.
- **Waiting markers** in `.git/baesian/waiting/`: a killed wait's marker goes stale after 90 seconds.
- **The server, `baesian serve`** (D96, D97):
  - **`GET /api/state`:** a snapshot of the store;
  - **`GET /api/events`:** change notifications, over Server-Sent Events;
  - **`POST /api/verdicts`, `POST /api/presence`:** writes;
  - **sign-in:** with the token from `.git/baesian/server.json`, sent as `Authorization: Bearer`.
- **Where to read:**
  - the agent instructions: the `AGENTS.md` block;
  - the formats: `docs/vault/Design/File Formats.md`;
  - the server: `docs/vault/Design/Local Server.md`.

**What Baesian needs from the tool:**
- **A real world, not a faked one:** one or more git repos in a container, with Baesian built from a pinned commit, outside the agent's workspace (Baesian's vault and tests describe its graders). Its hooks are installed, and its instructions are in `AGENTS.md`. Setup seeds rules, earlier cards and planted constraints.
- **Several agents at once,** each in its own worktree of one repo. That needs the run model decided in M0.
- **The instructions must actually reach the agent.**
  - **Native delivery:** use operators that load `AGENTS.md` themselves. Codex does; the Claude operator would need project settings loaded.
  - **Check they loaded,** and record per cell how they were delivered.
  - **Frame the run as real use:** never "there is no human". Deferring to a person is what Baesian measures.
- **A reviewer actor.** It stands in for the person, and acts on its own while agents block in `baesian wait`.
  - **Its policy is scripted over the cards' structured fields:** `touches`, level, `reverse`, the facets. For example: choose the alternative on cards that touch a schema, return 20% (with a fixed seed), and change an answer after a commit.
  - **An LLM persona only for free-text replies,** isolated from the agent's prompt both ways.
  - **It answers through `baesian serve`.** One gap: the server records `client: "web"` for every verdict, so the reviewer can't name itself yet. That's for Baesian to fix, in its own sessions.
  - **Presence:** with no heartbeat, `baesian wait` waits until its timeout; a stale one makes agents carry on as if the reviewer were away. So every world starts without one, and the reviewer keeps it fresh while it runs.
- **Events keyed to the world, not only to tool calls:** a card filed, a wait started, a commit made, a merge. Actions include answering, changing an answer, killing an agent's wait, letting the heartbeat go stale, and merging branches.
- **Ground truth from outside the agent's reach.** The agent can edit `.git/baesian/`, the hooks and the history (`-n`, a changed `core.hooksPath`, an amend, a rebase).
  - **A command journal:** `PATH` shims for `baesian` and `git`, writing JSONL somewhere the agent can't write: wall-clock time, which agent (from the worktree), the arguments and the exit code. Check it against the agent's own shell calls, as `trace_complete` does.
  - **A snapshot** of the store and refs, taken after the run as a user the agent can't write as.
  - **`baesian check` re-run on every new commit** after the run.
  - **No new plugin protocol:** graders read Baesian through its CLI's `--json` output and the server's API, not by parsing its files.
- **World snapshots in bundles:** a git bundle plus a tar of `.git/baesian/`. Then re-grading covers Baesian's graders, and the owner's labels can be reused.
- **Planted forks, designed against misleading evidence.** A planted fork is a task where one consequential choice can't be avoided.
  - **Controls:** pair each fork with a no-fork control, and with an easily reversed decoy (which should not get a card). That measures over-filing deterministically.
  - **Matching:** match cards by `touches`, not by topic, since agents name topics freely.
  - **Liveness:** gate on "the planned reviewer action fired".
  - **Held-out forks:** keep some back, so instructions aren't tuned to the known ones.
  - **Counting:** report cards per run, and with several agents, count runs, not agents.
  - **No list of expected decisions:** agents divide decisions differently. This recommendation follows the owner's preference for avoiding rigid lists, which led to D72 for the card format.
- **The owner's labels,** on a sample of each sweep's cards ("should this have been a card?", "is a decision missing?"). The sample is stratified, labelled blind to model and arm, and a few are labelled again to check consistency. The labels are stored with the bundles.
- **A matrix:** harnesses (Codex and Pi against the owner's qwen endpoint on their cluster, which is OpenAI-compatible; the Claude operator at times), variants of Baesian's instructions, and repeats.
- **Measurements, split by where they can come from:**
  - **The harness can measure:** how completely commits cite the cards they build on (D78, D81); where decisions are caught, at filing, by the gate, or at merge; and whether required facets are filled.
  - **The owner's labels are needed for:** whether agents write a useful "wrong if" (D77).
  - **Only real use can tell:** whether a facet changes a person's answer (D75; a scripted reviewer answers by its policy), and how often agents are killed mid-wait (D90; in a harness that measures its own timeouts).

### What both need: the general tool

- **A run model:**
  - traces keyed by agent;
  - a log of world events and a log of actor actions;
  - all on one wall clock.

  hpc-bridge is the one-agent case.
- **Neutral event kinds in the trace:** a shell command, a file edit, an MCP call, a question. Questions cover prose, MCP elicitation and ACP permission requests.
- **Results** with an optional value and "not applicable", for consumers that need scores with tolerances.
- **A world plugin** with `setup`, `exec`, `check`, `teardown`, `leak_probe`, `secret_material`, `events` and `snapshot`.
- **Actors** that run as tasks in the pipeline, with their actions logged in the bundle.
- **A generic command journal,** for products without an MCP journal.
- **The shell parser moved into the core** (`harness/invariants.py:272-494`). Finding `git commit --no-verify` inside a `bash -lc` chain is exactly what Baesian's graders need.
- **One `gating()` function,** used by both runs and re-grades.
- **Scenario parameters recorded in the bundle,** in place of environment variables read at import, in time.
- **Strict `EXPECT_OK`, checked at the end of a run.**
- **An image tag per branch,** and separate users in the jail for the agent and the harness.
- **A generic MCP tap,** once a second MCP product needs one.

## A proposed shape, to check in M0

- **The core** knows nothing about any world:
  - the run model, trace types, results and grader helpers, and the shell parser;
  - the scenario schema and loader;
  - the pipeline (setup, agents and actors, invariants, settle, world checks, snapshot, teardown);
  - `gating()` and the verdicts;
  - bundles of schemas 1 and 2, the trace readers per operator shape (taking the product's tool names as configuration), INFRA classification, re-grading, provenance and reports.
- **The world plugin:** hpc-bridge's SSH cluster is one world; a local git repo in the jail is the second, and Baesian's.
- **The operator plugin:** a real protocol for `run_scenario`. The product's tools, skills and instructions, and the run's framing, are configuration, not code.
- **The journal plugin:** where ground truth comes from. hpc-bridge's MCP journal; the generic command journal; later, an MCP tap.
- **Actor plugins:** the existing answerer of `AskUserQuestion` (with a configurable model), and actors that act on their own in the world, like Baesian's reviewer.
- **Hooks** can be triggered by tool calls or by world events.

**Python is the recommendation,** for the owner to confirm. The code, its tests and the Agent SDK path are all Python, and graders can reach other products through their CLIs and APIs.

## Validity principles

From hpc-bridge's history:
1. **Grade what happened after the event, not restated plans:** `said_after(t, i)`. An agent repeating the prompt or its plan used to pass.
2. **Use liveness gates.** A run with no tool calls, or that never reached the planted fault, fails or is skipped; it never passes vacuously. Eleven rate-limited runs would have graded OK without them.
3. **The premise must hold.** A setup that fails gives SETUP FAILED, and a hook an operator can't serve is SKIPPED. A world command must report what really happened.
4. **Don't leak the test.**
   - **What the agent mustn't see:** grading, scenario names or harness variables in its world. A policy file once described the test, and an agent read it.
   - **Housekeeping:** strip harness environment variables, and report any read of harness files.
   - **Isolation:** give each run a fresh harness home, so memory doesn't carry over between runs.
   - **Held-out scenarios:** keep some private.
5. **Harm checks name what must be absent.**
6. **Check graders against stored runs before believing a result.** One sweep's headline finding was a miscalibrated grader, overturned by re-grading.
7. **A missing feature gets a deterministic red scenario. A race gets a universal invariant, measured statistically.**
8. **Gate only with deterministic graders.** An LLM judge, if ever added, reports and doesn't gate: LLM judges favour LLM-written text.

From the 2026-10-31 reviews:

9. **Statistics.**
   - **Report every rate with its n and a Wilson interval:** 8 of 10 is anything from 0.49 to 0.94.
   - **Compare arms scenario by scenario,** with errors clustered by scenario.
   - **For regressions, require all k repeats to pass.**
   - **Fix the metric and n before each sweep.** Telling 80% from 60% reliably takes about 80 runs per arm.
10. **Count the exclusions.** INFRA, RATE_LIMITED and SETUP FAILED are left out of pass rates today, and a malformed tool call counts as INFRA, though it's a model failure. Report each arm's exclusion rate, and also its rate with exclusions counted as failures. Interleave the queue across arms, rather than running each cell's repeats back to back.
11. **Equal budgets.** Record turns, wall time, tokens and the command timeout per cell, and make them equal across arms. "Budget exhausted" is an outcome of its own. Claude Code's shell tool times out after 2 minutes by default; `baesian wait` waits for 9.
12. **Pin everything.** Record the model actually served, its sampling settings, and qwen's quantization, not only the requested name, and the same for the persona model. Seed every scripted policy. Seeds won't make hosted models deterministic, so repeats stay necessary.
13. **Record how the instructions were delivered and how the run was framed,** per cell.
14. **Grade outcomes from outside the agent's reach,** as for Baesian above. hpc-bridge's journal should be written from outside the agent's user too.

## Milestones

Each one has an acceptance test that's free to run, unless marked.

1. **M0: confirm the seams, and set the baseline.**
   - Correct this plan where it's wrong, write the split (which file goes where, and which interfaces it needs), and bring the owner the decisions below. They now include the run model, packaging, repo visibility, the freeze policy, image tags and the model-run budget.
   - **Write the golden-dump tool.** At a pinned commit, for every stored bundle it dumps the rebuilt trace (calls, texts, `text_at`, `user_said`), every row (name, ok, detail), the critical set, and the OK/FAIL/INFRA tag. Freeze that dump.
   - *Done when* the owner has approved the split and the decisions, and the frozen dump exists.
2. **M1: the core, behind strangler shims.** It covers the run model and core types, the trace readers per shape (with tool names as configuration), INFRA classification, `gating()`, re-grading and bundles.
   - *Done when:*
     - **the whole-corpus dump is byte-identical** to the frozen one;
     - **identity tests pass** (for instance, `invariants.Trace is core.Trace`), so no leftover duplicate hides;
     - **a mutation check fires:** removing a grader must show in the dump's diff;
     - **hpc-bridge's harness tests pass** on Python 3.11 and 3.14.
3. **M2: the first operators, the jail, and a local world.** It covers the Codex and Pi operators (with `responses_relay.py` for qwen), a base jail with separate users and its own image tag, a local git world with `events` and `snapshot`, the command journal, and actors as pipeline tasks.
   - *Done when:*
     - **the stored Codex, Pi and hermes21 bundles re-read to equal traces;**
     - **the script operator's 200-odd stored bundles re-run to identical rows,** against the fake cluster;
     - **Baesian's scripted scenarios run without Docker,** against Baesian at a pinned commit, read-only, with their configuration kept in this project's repo. Each grader has one scenario that must pass and one that must fail, and a liveness check.
4. **M3: Baesian on real agents.** qwen through Codex and Pi, world snapshots in bundles, and the first measurements: citation completeness, and where decisions are caught. *Needs the owner's model-run budget.*
   - *Done when* a small sweep produces bundles in which every grader is evaluated, with rates reported as principle 9 says.
5. **M4: the rest of hpc-bridge.** The Agent SDK, hermes and ACP operators, the simulated user (with a configurable model), hooks, and the SSH world.
   - *Done when* the script operator's rows are still identical, and one sweep re-grades the same under the frozen graders. A sweep costs money, so it needs the owner's go-ahead.
6. **M5: documentation, a template for new consumers, and packaging.** Publishing is the owner's decision.

## Decisions for the owner (the M0 gate)

Already decided by the owner, on 2026-10-31:
- **the name, rehearse;**
- **the repo:** `~/Projects/rehearse`, with a private remote at `github.com/GusEllerm/rehearse`.

Raise each of these with a recommendation:
1. **How hpc-bridge reaches a private tool.** It can't be fetched by hpc-bridge's CI, or by `uv sync --extra dev`, without credentials. One option: give `agentic/` its own `pyproject.toml` and lock, so hpc-bridge's root project and CI don't depend on the tool.
2. **Whether the package name `rehearse` is free on PyPI.** It only matters before any publishing.
3. **The language.** Python is recommended.
4. **Packaging:** how hpc-bridge depends on the tool, and how the Docker image gets it (a BuildKit named context, or a pinned git install).
5. **The run model,** before M1 freezes the types.
6. **The freeze or rebase policy** for `agentic/harness/` during the extraction. Since 1 October, 88 commits across branches have touched it.
7. **Image tags per branch.**
8. **The model-run budget, and how model endpoints and credentials reach the jail** without entering a repo.
9. **The license, and whether and when to publish.**
10. **Optionally, whether this project files its own design decisions through Baesian.** It would give Baesian real cards. It isn't required.

## Out of scope

- **Building a fake world for Baesian:** git and files are cheap to make real.
- **Gating on an LLM judge.**
- **Converting hpc-bridge's scenarios to a new format,** beyond what strict `EXPECT_OK` needs.
- **Any change to the Baesian repo,** including wiring the scenarios into Baesian's CI. That's a Baesian decision.

## Glossary

- **ACP:** the Agent Client Protocol, which some harnesses speak.
- **ALCF:** Argonne Leadership Computing Facility, which hosts the free model endpoint hpc-bridge uses.
- **Canary:** a planted string that shows whether the agent read something.
- **Critical set:** the grader rows that decide a run's verdict.
- **Facet** (Baesian): an optional set of card fields, such as an unchecked premise.
- **Floor graders:** graders that gate every run.
- **hermes, Pi, Codex:** agent harnesses. hermes21 is hermes driven as a CLI.
- **INFRA:** a run that produced nothing to grade, because of infrastructure.
- **Jail:** the container an agent runs in.
- **livedocs:** the owner's tool that binds vault notes to the code they name, and blocks a commit until a changed note is reconciled. Installed with `uv tool install livedocs`.
- **MEP:** hpc-bridge's multi-user endpoint mode.
- **Pilot:** a job hpc-bridge leaves on the cluster; the pilot checks look for leftovers.
- **Plan B:** hpc-bridge's plan for its runtime sandbox.
- **Planted fork:** a task built so that one consequential decision can't be avoided.
- **Pool:** shared cluster users and nodes, claimed with `flock`.
- **Presence heartbeat** (Baesian): a file the client refreshes every 30 seconds while the reviewer is there.

## Read first

- **In hpc-bridge** (from `main`):
  - `CLAUDE.md`, `HANDOFF.md`, and the vault's `Home.md`;
  - `agentic/README.md`, especially "How grading works" and the section on mid-run hooks;
  - `harness/run.py`, `invariants.py`, `runner.py`, `cli_runner.py`, `human_sim.py`, `midrun_hooks.py`, `provenance.py` and `regrade.py`;
  - in `docs/hpc-bridge-vault/`: `Planned/Agentic testing - Plan B (runtime sandbox).md`, `Reference/Agentic framework review 2026-09-05.md` and `Reference/Simulation library review 2026-09-05.md`.
- **In Baesian:**
  - the `AGENTS.md` block;
  - `docs/vault/Home.md`;
  - `docs/vault/Design/File Formats.md` and `docs/vault/Design/Local Server.md`;
  - `docs/vault/Design/Client Data Contract.md`, for the hard parts;
  - `src/wait.ts`, for the exit codes and briefs;
  - `src/server.ts`;
  - `test/premises/watch.mjs`, an example of the checks Baesian runs by hand.
- **Beside this plan:** `scenario-harness-extraction-reviews.md`.
