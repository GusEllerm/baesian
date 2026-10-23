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
| `src/cli.ts`, `src/bin.ts` | the CLI; `bin.ts` is the npm entry point |
| `src/frontmatter.ts`, `src/git.ts`, `src/ids.ts`, `src/similarity.ts` | helpers |
| `test/` | Vitest, against real temporary git repos and linked worktrees |

Run `npm test`, `npm run typecheck`, `npm run build`, and `npm run baesian -- <command>` (from source, via tsx).

## Milestones

| | Delivers | Status |
|---|---|---|
| **M1** | The store and the core CLI: both layers, the formats, IDs, computed status, the filing check (open cards and resolved decisions, topics, aliases), attach, withdraw, revise, decks, `list`, `show`, `inbox`, `sync` | **done** (2026-10-23), 40 tests |
| **M2** | Waiting and notifying: `wait` (with levels, timeout and presence), OS notifications and the `notify` command, the `AGENTS.md` block written by `init` | next |
| **M3** | The git gate: `pre-commit` writing the record, `commit-msg` checking trailers and acks, the four detectors (dependencies first), verdict delivery and the block on overturned cards, ledger entries, `baesian verify` for CI and the merge gate, conflict cards | |
| **M4** | The client: a local server (API plus live updates), the React app (desktop first, arrow-key and swipe gestures), decks, the response panel, rules, topic merging, conflict links, presence | |
| **M5** | Harness adapters: the Claude Code plugin (skill, `SessionStart`, `ExitPlanMode`), Codex hooks | |
| **M6** | The vault adapter: decision and rule notes, the Decision Log's `base` query | |
| **M7** | The MCP server | |

Dogfooding on this repo starts once M3 is done, so that cards, gate and verdicts are all live (D21).

## Notes from M1

- **"Set up" means the shared live layer exists.** A new worktree has no `.baesian/` until its branch commits one, so requiring the record would have told every agent in a fresh worktree to run `init` again.
- **Timestamps have millisecond resolution.** The parent-rejection check uses `>=`, and verdict timestamps are kept strictly increasing per card. Both bugs showed up as a flaky test.
- **No command resolves a card.** The CLI has no `respond`; a test checks that `respond`, `accept`, `resolve` and `verdict` are unknown commands (D32). Verdicts are written only through `Store.addVerdict`, which the client's server will call.
