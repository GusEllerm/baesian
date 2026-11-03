---
type: design
status: active
authority: describes
summary: "Baesian's build plan: the stack (D47–D51), the repo layout, and milestones M1–M7 following the D33 order, with what each delivers and how it is tested. M1 (store and core CLI) is done."
created: 2026-10-23
updated: 2026-11-02
reviewed: 2026-10-23
tags: [baesian, design, plan]
---

# Implementation Plan

Follows the v1 order in [[Baesian Design#First version]] (D33).

## Stack

- **TypeScript end to end** (D47) on **Node LTS**, distributed with npm (D48). Single-file binaries come later.
- **Dependencies** (D49): Zod 4 for the schema, Commander 15 for the CLI, `yaml` for frontmatter. Dev: TypeScript 7, Vitest 5, tsx.
- **Client** (D50): React + Vite + Motion, built at release and served as static files (M4).
- `package.json` is `private: true` until the licence and the release are decided.

## Layout

| Path | Holds |
|---|---|
| `src/schema.ts` | the file formats ([[File Formats]]) |
| `src/store.ts` | both layers, immutable writes, computed status, the filing check ([[src-store]]) |
| `src/cli.ts`, `src/bin.ts` | the CLI; `bin.ts` is the npm entry point ([[src-cli]]) |
| `src/wait.ts`, `src/notify.ts`, `src/agents.ts` | waiting for verdicts; notifications; the AGENTS.md block and card template |
| `src/facts.ts`, `src/trailers.ts`, `src/gate.ts`, `src/hooks.ts`, `src/globs.ts` | the commit gate ([[src-gate]]) |
| `src/verify.ts` | `baesian verify`: CI and the merge gate ([[src-verify]]) |
| `src/server.ts`, `src/api.ts` | the local server and its API types, which the client shares ([[src-server]]) |
| `client/` | the React client (D98): its own TypeScript and Vite configs; builds into `dist/client/` ([[Client Build]]) |
| `e2e/` | the client's browser tests, Playwright (D100), run with `npm run e2e` |
| `src/frontmatter.ts`, `src/git.ts`, `src/ids.ts`, `src/similarity.ts` | helpers |
| `test/` | Vitest, against real temporary git repos and linked worktrees |
| `test/premises/` | checks of decisions' premises, run by hand (`watch.mjs`, for D84) |
| `test/fixtures/` | helper processes for tests that need several writers at once |

Run `npm test`, `npm run typecheck`, `npm run build`, and `npm run baesian -- <command>` (from source, via tsx). For the client: `npm run e2e` (it builds first) and `npm run dev:client`.

## Milestones

| | Delivers | Status |
|---|---|---|
| **M1** | The store and the core CLI: both layers, the formats, IDs, computed status, the filing check (open cards and resolved decisions, topics, aliases), attach, withdraw, revise, decks, `list`, `show`, `inbox`, `sync` | **done** (2026-10-23), 40 tests |
| **M2** | Waiting and notifying: `wait` (with levels, timeout and presence), fallbacks, OS notifications and the `notify` command, the `AGENTS.md` block written by `init`, `template`, `topics` | **done** (2026-10-23), 66 tests in total |
| **M3a** | The commit gate: `pre-commit` (record), `commit-msg` (trailers, acks, coverage, the block on rejected and unresolved hard cards, verdict delivery), `post-commit` (ledger); detectors for dependencies, schema and infra; `baesian check`; hooks installed by `init` alongside livedocs | **done** (2026-10-23), 99 tests in total |
| **M3b** | `baesian verify` for CI: every commit in a range checked against its own committed record, the merge gate (resolved or deferred), conflicting decisions and conflict cards, hints for a stale record ([[src-verify]]) | **done** (2026-10-23), 118 tests in total |
| **M3c** | The exported-signature detector (`api:` facts): `livedocs signatures` (livedocs 0.2.1, D56), breaking changes only (D58), opt-in through `gate_api` (D59) | **done** (2026-10-23), 107 tests in total |
| **M4** | The client: a local server (API plus live updates), the React app (desktop first, arrow-key and swipe gestures), decks, the response panel, rules, topic merging, conflict links, presence | |
| **M5** | Harness adapters: the Claude Code plugin (skill, `SessionStart`, `ExitPlanMode`), Codex hooks | **under way** (2026-11-01): the plugin is built in `plugins/baesian/` (D114–D116), provisionally tested in Claude Code in a real session, then tested there by rehearse's free probe (2026-11-02): every hook, both skill names, verdicts at each stopping point, and the plan hook, including a rejected plan. Codex (2026-11-02, D118): it installs the same plugin unchanged, and the `Stop` hook answers it in its own form. Since then, rehearse's three live scenarios run it in interactive Claude Code with graders (pinned at `29be803`), and its probe ran every hook but the plan hook in real Codex 0.166.0 sessions (2026-11-02): all work once trusted. To come: rehearse's Codex scenarios |
| **M6** | The vault adapter: decision and rule notes, the Decision Log's `base` query | |
| **M7** | The MCP server: local, over stdio, the same operations as the CLI, and the way in to the hosted service with the CLI (D128) | |
| **M8** | Routing and preferences ([[Routing and Preferences]], P14, proposed): the per-repo preference sliders (D131), the gate that checks cards against them, audit cards and convention cards (D126) | proposed (2026-11-03); its cards are in deck `routing` |
| **M9** | The hosted service ([[Hosted Service]], P15, proposed; in v1 by D132): the relay (D127), accounts and the one-time sign-in (D128), answers the service vouches for, usage counts (D129), the phone layout and web push (D130), hosting | proposed (2026-11-03); its cards are in deck `hosted` |
| **M10** | Release: the review before publishing (D108) and the cards in deck `release`, the stability cards in deck `stability`, a licence, publishing (npm, the plugin's marketplace), and the docs | |

**v1's order, as proposed overnight (2026-11-03), for the user to confirm.** M5 finishes as rehearse's Codex scenarios land. M6 and M7 follow, as D33 has them; M7 is built with the hosted sign-in in mind, since agents reach the service through it (D128). Then the decks `routing` and `hosted` are answered, because their format changes land before v1 (D108: from v1 on, a format change needs a version and a migration): the preference config, gate outcomes, audit and convention card fields, reviewer identity and answers' signatures. M8's formats and M9 follow, with M8's gate after M9's relay if the gate runs on the service (card B-kypkm). M10 last.

Dogfooding on this repo starts once M3 is done, so that cards, gate and verdicts are all live (D21).

**M4's order (D91).** The client's design is signed off, with round 5 (`design/explorations/round5/`) as the spec and [[Client Data Contract]] as its data. The backend comes first:
1. the file-watching test, D84's premise (**done**);
2. the P12 format changes in the store (D62, D66, D73–D75, D77, D79, D85, D88, D90, D92–D95), and filing rejects unknown `depends_on` IDs (**done**);
3. the store's new behaviour: choosing the alternative returns dependents (D80), a changed answer brings a rework brief (D81), and `baesian wait` keeps a heartbeat (D90) (**done**);
4. the local server: watching the live layer, the API and live updates (**done**);
5. the React client, porting round 5 ([[Client Build]]; 5a, the scaffold, is done).

## Notes from M1

- **"Set up" means the shared live layer exists.** A new worktree has no `.baesian/` until its branch commits one, so requiring the record would have told every agent in a fresh worktree to run `init` again.
- **Timestamps have millisecond resolution.** The parent-rejection check uses `>=`, and verdict timestamps are kept strictly increasing per card. Both bugs showed up as a flaky test.
- **No command resolves a card.** The CLI has no `respond`; a test checks that `respond`, `accept`, `resolve` and `verdict` are unknown commands (D32). Verdicts are written only through `Store.addVerdict`, which the client's server will call.

## Notes from M2

- **`notify` moved out of the committed config.** In the repo, a `notify` command would run on every clone, and a push token would leak. It now lives in the user config. This is a format change, so it's in P12 for the user to accept.
- **Stdin must be read as a stream.** `readFileSync(0)` fails with `EAGAIN` when the writer hasn't written yet (`baesian template | baesian file`). The unit tests couldn't see this, because they inject stdin; the smoke test with real pipes found it.
- **A client that has never run is "unknown", not "away".** Until M4 there is no client, so treating a missing heartbeat as away would make every `wait` return at once.
- **Tests never notify for real.** *(continued below)*

## Notes from M3a

- **Tested with real commits.** `test/hooks.test.ts` installs the hooks into temporary repos and runs `git commit`. Because `baesian` isn't on PATH there, the hooks run the CLI from source through the fallback. A smoke test in a repo with real livedocs 0.2.0 confirmed the two gates share `.githooks/pre-commit`, with Baesian's block before livedocs' `exec`.
- **The record has to be staged as a whole.** Staging only what the hook had just copied missed the cards `baesian file` had already written into the record.
- **A blocked commit leaves the record staged.** `pre-commit` has already run by the time `commit-msg` blocks, so the record files stay staged for the next attempt. That's harmless.
- **Dogfooding found two bugs in the first hour.** Both were in the hook setup, found by running `baesian init` in this repo after `npm link` (D57):
  - `selfCommand` didn't resolve the npm bin symlink, so the hooks got no fallback;
  - the fallback's absolute paths were written into the committed hooks.

  Now the hook text is the same on every machine, and the fallback lives in `git config --local baesian.fallback`. The tests run with a private PATH holding only `node` and `git`, so a linked `baesian` can't hide a broken fallback.
- **Drift can't detect signature changes** (live-docs-agent, 2026-10-23). Its fingerprint covers whole symbols, without a signature/body split, and only for symbols a doc is bound to. So D25's "use drift's fingerprints" can't work; D56 uses a new `livedocs signatures` command instead.

## Notes from M3b

- **Records are read straight from commits.** `git archive <rev> .baesian` is extracted to a temporary directory and opened read-only (`Store.overRecord`). CI needs only git and tar.
- **On this repo's own history**, `baesian verify --base fdf603e` failed M3a (`02885f9`): it added the smol-toml dependency before the gate existed. Everything from the dogfood commit on passes, merge gate included.
- **A test-only bug:** assigning `undefined` to `process.env.X` sets it to the string `"undefined"`.

## Notes from M2 (continued)

- **Tests never notify for real.** `test/helpers.ts` sets `BAESIAN_OS_NOTIFY=0` and points `BAESIAN_CONFIG` at a missing file. CLI tests also inject a notify stub. The macOS AppleScript was checked with `osacompile`, not by showing a notification.

## Notes from M4

- **To watch in dogfooding (2026-11-01): ledger entries keep a commit's hash.** A squash merge or a rebase replaces it, so an entry can point at a commit that's gone, and rework briefs (D81) would list it. Not acted on: it shows up once merges are squashed. Version compatibility is out of scope until a v1 is published (D108).
- **The file-watching check (D84's premise), 2026-10-24: it holds.** `test/premises/watch.mjs` is a check to run by hand, not part of the suite.
  - **What it does:** four writer processes create files the way the store does (`mkdir -p`, then an exclusive create) in bursts, while one recursive `fs.watch` records every path it hears. There are four scenarios of 1,000 files each, with five trials apiece:
    - flat files into an existing folder;
    - a new folder per card, with two files written straight into it;
    - new folders three levels deep;
    - rewrites of existing files.
  - **The result:** no misses and no null filenames, on macOS (arm64, Node 22.22, FSEvents) and on Linux (Docker's arm64 VM, Node 22.23, inotify). On macOS the last event came within about 50 ms of the last write; on Linux, during the writes.
  - **Its limits:**
    - **The Linux run had a very high watch limit** (`max_user_watches` 1,048,576). Node's recursive watching on Linux takes one inotify watch per folder, and every card has its own folder, so a host with the old default of 8,192 would run out at about 8,000 cards. What Node does at the limit wasn't tested. The server should treat a watcher error as a cue to fall back to the rescan.
    - **Not tested:** network filesystems, Docker bind mounts, or synced folders such as iCloud and Dropbox. Node's docs call watching unreliable there.
    - **A 500 ms warm-up** came before the writes. The server should scan once after it starts watching, to catch anything written before the watcher was ready.

    The 30-second rescan of D84 covers all three.
- **Step 2, the format (2026-10-24): done, with 127 tests passing.** The card and verdict fields are those in [[File Formats]]. The user settled the draft's four open points: D92 (the body is optional context), D93 (one alternative), D94 (a fixed crux on conflict cards) and D95 (`reverse` required).
  - **Filing:** `filingProblems()` holds the rules that span fields, and the store checks references. `filingWarnings()` notes long fields without rejecting them, since no limit has been measured.
  - **Conflict cards** are written by `fileConflicts`, with the fixed crux and each option's `_breaks`.
  - **The waiting marker's schema (`Waiting`) is defined.** `baesian wait` starts writing it in step 3.
  - **The CLI:** `baesian show` prints the card as the client shows it, and `baesian file` prints notes. The template lists the required fields to fill in, with the optional ones commented out.
  - **This repo's `AGENTS.md` block** now says every card states its crux.
- **Step 3, the store's behaviour (2026-10-24): done, with 141 tests passing.** The tests are in `test/m4-behaviour.test.ts`; the agent's readings of the decisions are in the [[Decision Log]] (agent decisions).
  - **D80:** `Store.status` returns a dependent whose parent went the other way.
  - **D81:** `Store.briefs` gives what an agent should be told beyond the verdict: a parent decided otherwise, or an answer changed, with the commits that cite the card.
  - **Delivery:** `Store.inbox` returns `InboxItem`s, with dependents returned by a parent listed under their own ID. `baesian wait`, `inbox` and `show` print the briefs (`describeBrief`).
  - **D90:** `waitForVerdict` keeps a marker through `Store.startWaiting`, and `Store.waitingOn` says whether each one is stale.
- **Step 4, the local server (2026-10-24): done, with 156 tests passing on macOS and on Linux** (in Docker; livedocs' own test skips there, since livedocs isn't installed). The design is [[Local Server]], and the user decided its two open points: D96 (a snapshot plus change events) and D97 (a new token and port each time).
  - **The server:** `startServer`, wrapped by `baesian serve`, signs the browser in and serves the snapshot, change events, verdicts and presence. The details are in [[src-server]].
  - **The store:** `Store.view` reads the live layer once per snapshot, and reports bad files instead of failing.
  - **The tests** run real servers, with real processes writing while they run. The four-writer test found a race: two agents filing their first cards on one branch at once both tried to create the branch deck. `Store.ensureBranchDeck` now takes a lost race as success.
- **Interoperability (2026-10-31): D101 and D102, built.** The user asked how Baesian works across models and harnesses, and two gaps turned up.
  - **The wait (D101):** `waitForVerdict` assumed Claude Code's *maximum* command limit, not its 2-minute default. It now runs in 100-second slices (`SLICE_MS`, `--slice`) and exits 7 while the reviewer is there. The 9-minute budget counts across runs, through the waiting marker, which `Store.startWaiting` picks up again.
  - **The name (D102):** agents were all named "agent". `agentName` now falls back to the harness's own name (`harnessName`).
  - **This repo's `AGENTS.md` block is refreshed.** 188 tests and 21 browser tests pass.
- **Step 5, the client (2026-10-31): 5a to 5f done.** [[Client Build]] has each step. 5e added presence, notifications, the panels and the empty desk; D103 keeps the client's own data across restarts. 5f's quality pass rebuilt round 5's layout check as a browser test, and found two bugs: leaning slid the card over the path, and the card in front of you could change when the queue re-sorted. 196 tests and 32 browser tests pass.
