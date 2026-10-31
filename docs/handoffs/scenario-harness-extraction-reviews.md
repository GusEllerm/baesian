# Reviews of the extraction plan (2026-10-31)

Four independent reviewers read `scenario-harness-extraction.md` (its first version, of 2026-10-24), each with one lens, and checked it against the hpc-bridge and Baesian code. All of them were read-only. One also ran `harness/regrade.py` over every stored bundle, with Python's cache writes off and its home redirected to a scratch folder.

The agent that wrote the plan then checked the claims the revision rests on against the code: the branch and worktrees, `setting_sources=[]` and the "no human" framing, re-grading's comparison, the operator list, the jail's user, hpc-bridge's rules on cost and merging, every cited path, and the README headings. All held.

Each finding below gives what the reviewer said, then what the revision did with it.

## 1. Accuracy against the code

About 115 claims were checked. At the plan's date, 11 were wrong or misleading, and about 8 citations or counts have moved since.

| Finding | Done |
|---|---|
| **The re-grading acceptance test can't pass as written.** `regrade.py` skips `world:` rows (`:202`), never rebuilds `harness:*` or server-stderr rows, compares `ok` only, and ignores rows it didn't rebuild (`:240`). Today's graders already disagree with stored rows. 252 bundles are schema 1 | Replaced by the golden dump (M0, M1) |
| **"`WORLD_CHECKS` already run without SSH" is wrong.** They use `WorldContext.ssh`, and `script_runner.World` is the same callable | Corrected |
| **"What gates" was incomplete:** no `EXPECT_OK` gates everything; some harness rows gate conditionally; `world:*` rows and the leak check always gate; benchmark mode | The full list is in the plan |
| **There are six model operators, not five** | Corrected, with their names |
| **The journal's reach was overstated:** only the CLI operators and `script` use it | Corrected |
| **Omission: one agent per run;** the CLI operators refuse personas; the human-sim is fixed to Claude Haiku | Added, and the run model became an M0 decision |
| **Omission: part of the scenario contract runs on the host** (`scenario_knobs.py`, `admin_tap.py`, `node_actions.py`, `ADMIN_SETUP`) | Added |
| **Minor:**<br>- `_safe_env` records more than `HPCB_*`<br>- `effective_input` is a module function<br>- prose questions become calls only for hermes and ACP<br>- `HumanSim` holds the TOTP logic<br>- `hermes_setup.py` was missing from the table<br>- bundles are already schema 2<br>- the provenance line range was off<br>- the test lines include scenario tests | All corrected |
| **D72 is the wrong citation** for rejecting a list of expected decisions | Reworded as a recommendation that follows the owner's preference |
| **The field is `reverse`, not "reversibility";** "until Baesian's server API exists" is out of date, and `client: "web"` is hard-coded | Corrected, and the gap is noted as Baesian's to fix |

## 2. Architecture and milestones

| Finding | Done |
|---|---|
| **Blocker: M1's test can't pass, and could pass while broken.** A full re-grade changes 364 of 2,184 verdicts before any code moves; re-grading compares only `ok`. Proposed: a byte-identical golden dump of traces, rows, critical sets and tags over the whole corpus, plus a mutation check | Adopted |
| **Blocker: M1 can't be core only.** Re-grading reads bundles through the operator modules' trace readers, which depend on hpc-bridge's tool names | Adopted: the trace readers and INFRA move into M1, with tool names as configuration |
| **Blocker: the core types assume one agent.** Decide the run model in M0 | Adopted |
| **The world interface has no events, and hooks live inside the operators,** so nothing can act while an agent is blocked. Add `events()` and `snapshot()`, and run actors as pipeline tasks | Adopted |
| **"The reviewer has to start its heartbeat before the agents start; otherwise `wait` treats it as away"** | Corrected rather than adopted. A *missing* heartbeat makes `wait` keep waiting until its timeout; only a *stale* one means away (`src/wait.ts`). The plan now says each world starts without one, and the reviewer keeps it fresh |
| **Ground truth without an MCP journal:** a command journal from `PATH` shims for `baesian` and `git`, cross-checked like `trace_complete`; the shell parser into the core | Adopted |
| **World snapshots in bundles** | Adopted |
| **Keeping hpc-bridge's sweeps alive:** a strangler approach, identity tests, an image tag per branch, a freeze policy | Adopted |
| **Packaging:** a private dependency breaks CI and contributors' `uv sync`; give `agentic/` its own `pyproject.toml`; the Docker build context | Added to the owner's decisions |
| **Stronger acceptance tests for M2–M4:**<br>- re-read the stored CLI bundles<br>- re-run the script operator<br>- use Baesian at a pinned commit, not a toy<br>- a must-fail scenario per grader<br>- don't let M4 require Baesian's CI | Adopted |
| **One `gating()` function;** scenario parameters in place of environment at import; strict `EXPECT_OK` checked at the end of a run; separate jail users; schemas 1 and 2 readable forever; a byte-compatible `RESULT:` line | Adopted |
| **Resequence:** Baesian's useful core earlier (Codex and Pi, a local world, a command journal, a reviewer through `baesian serve`); hpc-bridge's other operators later | Adopted as M2 to M4 |

## 3. Readiness to hand over

The verdict was "not ready to hand over yet".

| Finding | Done |
|---|---|
| **Blocker: M0's output had nowhere to go** | A "Day one" section: the first message to the owner asks where notes and decisions live |
| **Blocker: no rule on runs that spend money,** against hpc-bridge's own rule | Added. What's free is listed; every model run needs a go-ahead and a cost estimate |
| **Blocker: "work on a branch" was unsafe.** The main checkout is on the owner's feature branch, 13 other worktrees exist, the stored bundles are gitignored and exist only in the main checkout, and nothing says how to tell a sweep is running | Added: never switch the checkout; your own worktree, with permission; read bundles in place; a separate image tag; check `docker ps` |
| **"Every change needs the owner" was unworkable** | An approved split now covers the moves it lists; departures, dependencies and merges go back to the owner |
| **No channel and no memory** | A day-one question |
| **The paths had the wrong base,** line numbers drift on the branch, and the README has no "scenario contract" section | The paths' base is now `agentic/`, the commit is pinned, and README sections are cited by heading |
| **M0's gate was too narrow, and "private" clashed with M4's CI** | M0's decisions extended; Baesian's CI is out of scope |
| **Jargon** | A glossary |
| **The reviews and surveys weren't linked** | This file, and full paths |

## 4. Generality and validity

| Finding | Done |
|---|---|
| **Blocker: no rule for how many repeats a pass rate needs** | Principle 9 |
| **Blocker: Baesian's instructions may never reach the agent.** The Claude operator loads no settings, and tells the agent there's no human | A Baesian requirement, coupling 8, and principle 13 |
| **Blocker: the agent can write its own ground truth;** graders read command strings | Principle 14, and the command journal, snapshots and the re-run `baesian check` |
| **Blocker: some promised measurements are circular** (D75, D90, D77) | The measurements are split by where they can come from |
| **Exclusions skew pass rates; queues aren't interleaved** | Principle 10 |
| **Unequal budgets** | Principle 11 |
| **Pinning** | Principle 12 |
| **Generality: results with values, neutral event kinds, `events()` and `snapshot()`** | Adopted |
| **Generality: a subprocess/JSON plugin protocol, for non-Python consumers** | Not adopted for now. Baesian's graders can use its CLI's `--json` output and its server's API, so it doesn't need one. Revisit when a consumer does |
| **Generality: the MCP tap now** | Kept for when a second MCP product needs it |
| **M1 should compare the new tool's re-grade with the old harness's, at the same commit** | The golden dump does this |
| **Planted forks and labels:**<br>- controls, decoys<br>- matching on `touches`<br>- a gate on the reviewer action firing<br>- held-out forks<br>- blind, stratified labelling<br>- counting runs, not agents | Adopted |
| **Leakage:** build Baesian outside the workspace; a fresh harness home per run; held-out scenarios | Adopted |
