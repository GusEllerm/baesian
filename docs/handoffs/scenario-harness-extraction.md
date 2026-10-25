# Plan: a general scenario harness, extracted from hpc-bridge

A handoff for the agent who starts this as its own project. Written on 2026-10-24 in the Baesian repo, in a session with the owner of both projects. Two read-only surveys of hpc-bridge's `agentic/` back it. Paths under **What exists** are relative to `/Users/gusellerm/Projects/hpc-bridge/`, and that section describes the code as it stood on that date. Check it before relying on it.

## Why this project exists

hpc-bridge tests itself with real agents in containers. Each scenario gives an agent a task, a simulated user answers its questions, faults are injected mid-run, and deterministic graders judge the trace and the state of the world. Sweeps across models and harnesses turn that into pass rates. The owner wants this pattern as a tool other projects can use:

> "I am interested in extracting the hpc-bridge pattern into a library / tool. If it is generalisable I am open to extracting that to make it a tool that can be applied to other projects -- this has actually been on my list of things to do."

They also want it kept separate from Baesian ("I dont want to dilute what we are doing here"). So it's your project. Baesian is waiting to be its second consumer, and carries on with ordinary unit and integration tests until the tool is ready.

## How to work

- **The owner decides anything hard to reverse:** the name, the repo and its visibility, the language, packaging and publishing, new dependencies, and every change to hpc-bridge. Bring each as a short choice: your recommendation, its strongest alternative, and what would change your mind. Never present a proposal as agreed.
- **Commit and push only when asked.** In hpc-bridge, work on a branch. Never disturb a sweep in progress or the stored runs in `agentic/runs/`: they're the acceptance test below.
- **Don't change the Baesian repo.** Its needs are written down here. Anything Baesian has to build for you (a way for a test reviewer to answer cards, a command journal) goes through Baesian's own sessions.
- **Secrets never go in a repo:** model tokens, SSH keys, and the credentials for the owner's inference endpoint.
- **The owner reads plain explanations, not jargon,** and prefers the honest limits of a result to a confident summary.

## What exists

`agentic/` holds about 12,800 lines of harness code, 19,200 lines of tests for it (46 files), and 69 scenarios (about 9,400 lines). Nothing in the repo plans an extraction. The closest statements are Plan B's "separate harness, shares this trace/invariant core" (`docs/hpc-bridge-vault/Planned/Agentic testing - Plan B (runtime sandbox).md:171`), and the split into "a world (a cluster profile), a situation (a scenario), a human (a persona)" (`Simulation library review 2026-09-05.md`, §1).

### Modules, by how generic they are

| Group | Generic already | Mixed: generic core, HPC parts to split out | HPC only |
|---|---|---|---|
| **Traces** | `harness/trace_adapter.py`, `claude_transcript.py`, `hermes_trace.py` | | |
| **Operators** (agents) | `responses_relay.py` (a Codex-to-vLLM shim) | `runner.py` (the Claude Agent SDK; HPC tool allowlist, SSH env, SKILL.md injection); `cli_runner.py` (Codex, Pi, hermes; `HPCB_TOOLS`, the ALCF model); `script_runner.py`; `hermes_runner.py`; `acp_runner.py`; `acp_client.py`; `acp_trace.py` | |
| **The simulated user** | | `human_sim.py` (`HumanSim`, `Exchange` and `Move` are generic; the personas and the move prompt are HPC) | |
| **Grading** | | `invariants.py` (the types and helpers are generic; almost every grader is HPC); `infra.py`; `regrade.py`; `canaries.py`; `repl_protocol.py` | |
| **Orchestration** | `proctree.py` | `run.py` (the pipeline and verdicts are generic; SSH world, tokens and teardown are HPC); `midrun_hooks.py`; `scenario_knobs.py`; `pool.py`; `server_stderr.py`; `serve_with_stderr.py` | `cluster_ops.py`, `targets.py`, `admin_tap.py`, `fake_ssh_catalog.py`, `old_endpoint.py` |
| **Bundles** | | `provenance.py` (it records only `HPCB_*` environment) | |
| **Running and reporting** | `sweep_dash.py`, `watch.sh` | `run_smoke.sh`, `run_suite.py`, `Dockerfile`, `entrypoint.sh` | `sweep_profiles.sh`, `sweep_endpoints.py`, `sweep_pool_user.sh`, `repl_sweep.py`, `install_check/` |
| **Model backend** | | `alcf_inference.py`, `alcf_probe.py`, `inference_auth_token.py` (Globus auth) | |

### The interfaces as they are

- **The trace** (`invariants.py:40-82, 521-562`):
  - a `ToolCall` holds the logical name, the input, the result, the raw name, any answers to `AskUserQuestion`, a phase, and call and result times;
  - a `Trace` holds the calls, the agent's texts, the position of each text among the calls, and what the user said and when.
  - Prose questions, mid-run interjections and nudges become synthetic calls.
- **A result** is `(name, ok, detail)` (`:565`).
  - **The verdicts:** OK, FAILED, CRASHED, SETUP FAILED, RATE_LIMITED, INFRA, INTERRUPTED and SKIPPED (`run.py:12-14`).
  - **What gates:** the scenario's `EXPECT_OK`, plus the liveness and floor graders (`run.py:1490-1513`).
  - **A line others depend on:** `run_suite.py:487` reads the `RESULT:` line from stdout.
- **Scenarios** are Python modules, loaded by import (`run.py:1212-1219`). About 30 attributes are read with `getattr` defaults (`:1283-1320`), with no schema. A misspelt name in `EXPECT_OK` silently doesn't gate. `KIND` is recorded, but nothing acts on it.
- **Operators** share a duck-typed `run_scenario(prompt, *, repo_root, model, effort, persona, user_goal, …) -> RunResult` (`runner.py:199`, `cli_runner.py:650`, `script_runner.py:189`). `run.py` picks one by name.
- **Non-Claude traces:** each harness's own log gives the order of calls. hpc-bridge's MCP server journal (`src/hpc_bridge/server.py:288-345`) gives what each call received and returned, and the two are aligned by `cli_runner._align` (`:339`).
- **The simulated user:** `HumanSim.answer(tool_input)` answers `AskUserQuestion`, injected through the SDK's `can_use_tool`. `HumanSim.move(text)` decides whether to reply, nudge or conclude, within budgets (`human_sim.py:291-456`).
- **Mid-run hooks** fire after or during a tool call, and act through `cmd`, `world`, `interject` or `interrupt` (`midrun_hooks.py:4-62`). They watch the SDK stream, or tail the journal.
- **The bundle** (`provenance.py:172-197`):
  - `record.json`: config, redacted environment, result, gating, grading rows, cost, turns and dialogue;
  - `messages.jsonl`, in the operator's own shape, with arrival times;
  - `transcript.md`;
  - side logs.

  `regrade.py` replays a stored bundle through the current graders.
- **The world** has no interface. `SETUP`, `CLEANUP` and the string postchecks run over SSH (`run.py:178-202, 287-347, 626-674`). `LOCAL_SETUP`, postchecks marked `"on": "local"`, and the async `WORLD_CHECKS` already run without SSH.
- **The jail** is the `Dockerfile`: Python 3.11 with uv, the Claude Agent SDK, Codex, Pi and hermes, running as a non-root user.
  - Credentials are mounted read-only and copied into place (`entrypoint.sh:9-20`).
  - The agent's environment is scrubbed of `HPCB_*` (`runner.py:74-79`).
  - There are no capability drops, no read-only root, and no network or resource limits.
  - The Claude operator's working directory includes the harness itself, which the 2026-09-05 review flagged as a leak.

### The hardest couplings to break

1. **The ground-truth journal is a feature of the product.** Non-Claude traces, the CLI operators' hooks and `trace_complete` all depend on hpc-bridge's server writing it. A general tool needs a journal interface that each product supplies, or a generic tap at the MCP stdio boundary (`hermes_trace.py:15` mentions one as a later refinement).
2. **The trace assumes Claude and MCP.** `AskUserQuestion` is the canonical question, native tool names are mapped to Claude's, and results are assumed to be JSON. A product driven through shell commands needs graders that read commands.
3. **The simulated user only answers questions the agent asks.** It has no way to act on its own in the world while the agent is blocked.
4. **`run.py` mixes the pipeline with SSH-world code:** teardown, pilot checks, token stores, and the handling of secret material.
5. **The scenario contract is implicit:** `getattr` attributes, flat imports, graders built from environment variables at import time, and `EXPECT_OK` names nothing checks.
6. **Environment-variable prefixes and string formats are hard-coded throughout:** `HPCB_` in scrub lists, provenance and allowlists, and the `RESULT:` line.
7. **Operators hard-code hpc-bridge:** they register it as an MCP server, inject its skill, and default to the ALCF model.

Some things look generic but aren't: `provenance._safe_env`, `agent_engaged` and `server_stderr.rows` (both use `_HPC_TOOLS`), `HookWatcher.effective_input` (which parses hpc-bridge's `server.py`), `infra.absences`, `pool.py`, `acp_client.hpc_bridge_mcp`, and the human-sim's move prompt.

## What we want

### For hpc-bridge, the first consumer: nothing lost

- **Every verdict, grader and bundle behaves as now,** and every stored bundle re-grades to the same verdicts and rows.
- **All five operators work,** plus the script operator, and the human-sim, mid-run hooks, canaries, INFRA classification, the pool, the suite, sweeps and the dashboard.
- **The fake cluster, profiles and targets become hpc-bridge's plugin,** not part of the tool.

### For Baesian, the second consumer

**What Baesian is.** A TypeScript CLI (`baesian`, on Node 22) through which coding agents file their design decisions as cards. A person answers the cards, and the verdicts go back to the agents. The pieces a harness has to work with:
- **The store:** the live layer `.git/baesian/` is shared by every worktree of a clone, and a committed record lives in `.baesian/`.
- **What agents run:**
  - `baesian file` (exit 3 means it may already be open or decided: attach, or follow the decision);
  - `baesian wait <id>`: exit 0 means resolved, 4 answered otherwise, 5 proceed provisionally, 6 don't proceed;
  - `revise`, `withdraw`, `attach` and `inbox`.
- **The commit gate:** git hooks detect dependency, schema, CI and API changes, and require a `Baesian-Card: <id>` or `Baesian-Ack: <fact> <reason>` trailer.
- **Briefs:** `wait`, `inbox` and `show` print them when a card is returned because what it builds on was decided otherwise, or when an answer changes after an earlier one resolved the card.
- **Waiting markers** in `.git/baesian/waiting/`: a killed wait's marker goes stale after 90 seconds.
- **Where to read:** the agent instructions are the `AGENTS.md` block in Baesian's repo, and the formats are in `docs/vault/Design/File Formats.md`.

**What Baesian needs from the tool:**
- **A world that's real, not faked:**
  - one or more git repos in a container, with Baesian built from a given commit, its hooks installed, and its instructions in `AGENTS.md`;
  - several agents working at once, each in its own worktree of one repo;
  - setup that seeds rules, earlier cards and planted constraints.
- **A reviewer actor.** It stands in for the person, and acts on its own while agents block in `baesian wait`. That's coupling point 3.
  - **Its policy is scripted over the cards' structured fields** (topic, `touches`, level, reversibility, facets). For example: choose the alternative on storage cards, return 20%, change an answer after a commit.
  - **An LLM persona only for free-text replies,** isolated from the agent's prompt both ways.
  - **It writes verdicts as the client would,** with a `client` field naming it. Until Baesian's server API exists, Baesian will provide a small helper for this; that's Baesian's side to build.
- **Events keyed to the world,** not only to tool calls: a card filed, a wait started, a commit made, a merge. Actions include answering, changing an answer, killing an agent's wait, making the reviewer look away (a stale presence heartbeat), and merging branches.
- **Ground truth from Baesian's own records:** the store's files and the git history (commits and trailers). Baesian may add a journal of its own commands, analogous to hpc-bridge's server journal, if the graders need one. That's Baesian's decision.
- **Graders that read shell commands** (agents run `baesian …` and `git commit` through their shell tool), and graders over the store and git. Examples:
  - a card filed before the gate forced one;
  - a card on the planted fork's topic, with both options;
  - `wait` run on a blocking card before building on it;
  - nothing built on a card after `wait` said not to proceed (exit 6);
  - a `revise` or `withdraw` after a brief, read with `said_after`;
  - commits that build on a card cite it;
  - no verdict written by an agent;
  - no `--no-verify`.
- **Liveness gates,** so a run where the agent never reached the planted fork can't pass by default.
- **No list of "expected decisions".** Agents divide decisions differently, and the owner rejected that kind of rigid list for Baesian (its D72). Ground truth comes from three places:
  - planted forks;
  - deterministic facts, such as the diff adding a dependency;
  - the owner's own labels on a sample of each sweep's cards ("should this have been a card?", "is a decision missing?"). The labels are stored with the bundles and reused when re-grading.
- **A matrix:** harnesses (Codex and Pi against the owner's qwen endpoint on their cluster, which is OpenAI-compatible; Claude Code through the Agent SDK at times), variants of Baesian's instructions, and repeats.
- **Measurements Baesian is waiting for,** from its Decision Log:
  - whether agents write a useful "wrong if" for routine decisions (D77);
  - how completely commits cite the cards they build on (D78, D81);
  - how often waits are killed (D90);
  - whether each trial facet ever changes an answer (D75);
  - where decisions are caught: at filing, by the gate, or at merge.

### What both need: the general tool

- **A scenario contract with a schema,** checked when it loads: unknown grader names are errors, and `KIND` is acted on (an experiment never gates).
- **Plugins for the world, operators, the journal, actors, hooks, canaries, INFRA classifiers and model backends.**
- **A grading core:** traces, results, helpers (`said_after`, `texts_mention` and `texts_affirm`, `secrets_absent`, `calls_bounded`), critical-set logic, and the verdict vocabulary.
- **Versioned bundles,** re-grading, provenance with a configurable environment allowlist, sweep reports and the dashboard.
- **A jail:** a base image plus a layer per consumer. Scrub lists come from configuration, and the harness lives outside the agent's working directory.

## A proposed shape, to check in M0

- **The core** (no knowledge of any world): the trace and result types and grader helpers; the scenario schema and loader; the pipeline (setup, agent, invariants, settle, world checks, teardown); verdicts; bundles; re-grading; provenance; reports.
- **The world plugin:** `setup`, `exec`, `check`, `teardown`, `leak_probe` and `secret_material`. hpc-bridge's SSH cluster is one world. "A local repo in the jail" is the second, and Baesian's.
- **The operator plugin:** a real protocol for `run_scenario`, with Claude SDK, Codex, Pi, hermes, ACP and script operators. The product's tools and skill are configuration, not code.
- **The journal plugin:** where ground truth comes from. hpc-bridge's MCP journal; Baesian's store and git; later, a generic MCP tap.
- **Actor plugins:** the existing answerer of `AskUserQuestion`, plus *autonomous actors* that watch the world and act, like Baesian's reviewer.
- **Hooks** can be triggered by tool calls or by world events.

Keep Python. The code, its tests and the Agent SDK path are all Python, and scenarios can drive any product through a shell. Treat that as a recommendation for the owner to confirm, not a given.

## Validity principles from hpc-bridge's history

1. **Grade what happened after the event, not restated plans:** `said_after(t, i)`. An agent repeating the prompt or its plan used to pass.
2. **Liveness gates:** a run with no tool calls, or that never reached the planted fault, fails or is skipped. It never passes vacuously. Eleven rate-limited runs would have graded OK without them.
3. **The premise must hold.** A setup that fails gives SETUP FAILED, and a hook an operator can't serve is SKIPPED. A world command must report what really happened: one "stopped" message came from the wrong node.
4. **Don't leak the test:**
   - no grading, scenario names or harness variables in the agent's world (a policy file once described the test, and an agent read it);
   - strip harness environment variables;
   - report when an agent reads harness files.
5. **Harm checks name what must be absent.**
6. **Check graders against stored runs before believing a result.** One sweep's headline finding was a miscalibrated grader, overturned by re-grading.
7. **A missing feature gets a deterministic red scenario. A race gets a universal invariant, measured statistically,** not a forced scenario.
8. **Infrastructure failures are INFRA, kept out of pass rates.**
9. **Gate only with deterministic graders.** An LLM judge, if one is ever added, reports and doesn't gate. LLM judges favour LLM-written text, which matters most for Baesian's cards.

## Milestones

Each one has an acceptance test you can run yourself.

1. **M0: confirm the seams.**
   - Read the code this plan cites, correct the plan where it's wrong, and write down the split: which file goes where, and which interfaces it needs.
   - Bring the owner the decisions below.
   - *Done when* the owner has approved the split, the name, the repo and the language.
2. **M1: extract the core,** with hpc-bridge depending on it.
   - *Done when* a sample of the bundles in `agentic/runs/`, chosen with the owner, re-grades to exactly the same verdicts and grading rows, and the harness's tests pass on Python 3.11 and 3.14.
3. **M2: operators, the simulated user, hooks and the scenario schema,** with the HPC parts moved into hpc-bridge's plugin.
   - *Done when* a handful of smoke scenarios on the fake cluster give the same verdicts, and one sweep's pass rates are within noise of the last one.
4. **M3: the world and journal interfaces,** with hpc-bridge's SSH world behind them, and a local world in the jail.
   - *Done when* hpc-bridge's results are unchanged, and a toy consumer (a small repo of your own) runs a scripted scenario and one with a real agent.
5. **M4: Baesian as the second consumer,** coordinated through the owner, since Baesian's side is built in its own sessions.
   - **What's built:** a git-repo world, the reviewer actor with a structured policy, and a journal over the store and git.
   - **The first scenarios:** three scripted scenarios, and one with a real agent on qwen through Codex.
   - *Done when* the scripted scenarios pass deterministically in Baesian's CI, and the real-agent scenario produces a bundle with every grader evaluated.
6. **M5: documentation, a template for new consumers, and packaging.** Publishing is the owner's decision.

## Decisions for the owner

Raise these in M0, each with a recommendation:
- **The name.**
- **Where the repo lives, and whether it's private.** Private is the default until the owner says otherwise.
- **The language.** Python is recommended.
- **Packaging:** uv, and how hpc-bridge depends on the tool (a local path first, then git, then perhaps PyPI).
- **The license, and whether and when to publish.**
- **Model endpoints:** how the owner's qwen endpoint and the Anthropic credentials reach the jail without entering a repo.
- **Optionally, whether this project files its own design decisions through Baesian.** It would be the first project outside Baesian to use it, and would give Baesian real cards. It isn't required.

## Out of scope

- **Building a fake world for Baesian:** git and files are cheap to make real.
- **Gating on an LLM judge.**
- **Rewriting hpc-bridge's scenarios** beyond what the new scenario contract requires.
- **Any change to the Baesian repo.**

## Read first

- **In hpc-bridge:**
  - `agentic/README.md`, especially the scenario contract (`:542-623`) and the hook mechanism (`:332-382`);
  - `harness/run.py`, `invariants.py`, `runner.py`, `cli_runner.py`, `human_sim.py`, `midrun_hooks.py`, `provenance.py` and `regrade.py`;
  - `docs/hpc-bridge-vault/Planned/Agentic testing - Plan B (runtime sandbox).md`, and the 2026-09-05 framework and simulation-library reviews.
- **In Baesian** (`/Users/gusellerm/Projects/baesian/`):
  - the `AGENTS.md` block;
  - `docs/vault/Home.md`;
  - `docs/vault/Design/File Formats.md`;
  - `docs/vault/Design/Client Data Contract.md` (the hard parts);
  - `src/wait.ts` (the exit codes and briefs);
  - `test/premises/watch.mjs`, an example of the checks Baesian runs by hand.
