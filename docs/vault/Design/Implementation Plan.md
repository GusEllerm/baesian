---
type: design
status: active
authority: describes
summary: "Baesian's build plan: the stack (D47–D51), the repo layout, and milestones M1–M7 following the D33 order, with what each delivers and how it is tested. M1 (store and core CLI) is done."
created: 2026-10-23
updated: 2026-10-23
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
| `src/frontmatter.ts`, `src/git.ts`, `src/ids.ts`, `src/similarity.ts` | helpers |
| `test/` | Vitest, against real temporary git repos and linked worktrees |

Run `npm test`, `npm run typecheck`, `npm run build`, and `npm run baesian -- <command>` (from source, via tsx).

## Milestones

| | Delivers | Status |
|---|---|---|
| **M1** | The store and the core CLI: both layers, the formats, IDs, computed status, the filing check (open cards and resolved decisions, topics, aliases), attach, withdraw, revise, decks, `list`, `show`, `inbox`, `sync` | **done** (2026-10-23), 40 tests |
| **M2** | Waiting and notifying: `wait` (with levels, timeout and presence), fallbacks, OS notifications and the `notify` command, the `AGENTS.md` block written by `init`, `template`, `topics` | **done** (2026-10-23), 66 tests in total |
| **M3a** | The commit gate: `pre-commit` (record), `commit-msg` (trailers, acks, coverage, the block on rejected and unresolved hard cards, verdict delivery), `post-commit` (ledger); detectors for dependencies, schema and infra; `baesian check`; hooks installed by `init` alongside livedocs | **done** (2026-10-23), 99 tests in total |
| **M3b** | `baesian verify` for CI: every commit in a range checked against the record, the merge gate (resolved or deferred), conflict cards, record lag | next |
| **M3c** | The exported-signature detector (`api:` facts), calling `livedocs signatures` (D56) | waiting on live-docs-agent |
| **M4** | The client: a local server (API plus live updates), the React app (desktop first, arrow-key and swipe gestures), decks, the response panel, rules, topic merging, conflict links, presence | |
| **M5** | Harness adapters: the Claude Code plugin (skill, `SessionStart`, `ExitPlanMode`), Codex hooks | |
| **M6** | The vault adapter: decision and rule notes, the Decision Log's `base` query | |
| **M7** | The MCP server | |

Dogfooding on this repo starts once M3 is done, so that cards, gate and verdicts are all live (D21).

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
- **Drift can't detect signature changes** (live-docs-agent, 2026-10-23). Its fingerprint covers whole symbols, without a signature/body split, and only for symbols a doc is bound to. So D25's "use drift's fingerprints" can't work; D56 uses a new `livedocs signatures` command instead.

## Notes from M2 (continued)

- **Tests never notify for real.** `test/helpers.ts` sets `BAESIAN_OS_NOTIFY=0` and points `BAESIAN_CONFIG` at a missing file. CLI tests also inject a notify stub. The macOS AppleScript was checked with `osacompile`, not by showing a notification.
