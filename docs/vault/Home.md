---
type: index
status: active
authority: describes
summary: "Entry point to the Baesian vault: what the project is, where it stands, what to read first, and where notes go."
created: 2026-10-23
updated: 2026-10-23
reviewed: 2026-10-23
tags: [baesian, index]
---

# Baesian

This vault is the long-term memory for **Baesian**: swipe review for agent decisions. Agents turn their design decisions into cards, a developer or domain expert gives verdicts, and the verdicts go back to the agent. Agents and people write this vault as the code takes shape. `livedocs` keeps the notes honest: every note that names code in backticks is bound to that code, and a commit that changes that code is blocked until the note is updated or acknowledged.

## Current status

*As of 2026-10-23.*

- **Development is under way. M1, M2 and M3a are done** ([[Implementation Plan]]), with 99 passing tests:
  - **M1:** the store and the core CLI;
  - **M2:** `wait` with card levels and presence, notifications, and the AGENTS.md instructions;
  - **M3a:** the commit gate, with three detectors, trailers, the ledger, `baesian check`, and hooks that coexist with livedocs. The repo is on `main` with the livedocs gate, and is pushed to the private GitHub repo [GusEllerm/baesian](https://github.com/GusEllerm/baesian).
- **[[Baesian Design]] is at v0.5.** Everything in it is decided except its open questions.
- **Open for the user:**
  - P12, the [[File Formats]] (accept or change them before 0.1.0);
  - (P13 was decided as D56: a `livedocs signatures` command, requested from live-docs-agent.)
- **Decided by the user** (D1–D57 in [[Decision Log]]):
  - **stack:** TypeScript end to end on Node LTS, npm; small vetted dependencies; React + Vite + Motion for the client; five-character card IDs (D47–D51);
  - **foundation:** git is the state machine; harness features are optional adapters, in three tiers (D27);
  - **scope:** coding agents first, research later;
  - **routing:** from a checklist of impact and reversibility facts, not self-reported confidence; audit cards sample the agent's own decisions;
  - **cards:**
    - every card states the strongest alternative;
    - short random IDs (`B-7f3k`), one per decision for its whole life;
    - decks with briefings, one per branch by default; rejecting a card withdraws its dependents;
  - **responses:** the gesture mapping and the card states; an escape hatch and richer written feedback;
  - **one client:** only the client resolves, desktop first. Coupled and autonomous mode differ only in a card's level (provisional, blocking or hard) and in `baesian wait`. A presence heartbeat and notifications are in v1;
  - **card sources:**
    - decks built from documents (`deck --from`);
    - filing mid-task;
    - the git gate. `pre-commit` writes the record. `commit-msg` checks coverage with four detectors and the trailers, delivers verdicts, and blocks commits that build on rejected cards;
  - **merge gate:** cards must be resolved or deferred before merge; the same topic answered differently becomes a conflict card;
  - **parallel agents:**
    - a two-layer store: live in `.git/baesian/`, the record in `.baesian/`, with immutable files;
    - conflicting proposals merged into one decision;
    - a filing check against open cards and resolved decisions;
    - topic keys;
  - **rules:** a toggle at verdict time plus mined convention cards. Rules apply at once in every worktree;
  - **vault:** one note per decision and per rule, written on any branch; the Decision Log embeds a Bases query over them;
  - **topic keys:** free-form, with near-match warnings and alias merging in the client;
  - **contradictions:** "conflicts with…" links in the client; each records where it was caught, and the late rate is reviewed after dogfooding;
  - **gate levels:** only hard cards need a verdict at commit; at merge, every card must be resolved or deferred;
  - **v1 order:** store and CLI → git gate → client → harness adapters → vault adapter → MCP;
  - **dogfooding:** this repo and personal-website;
  - the [[Working Agreement]] is active.
- **livedocs is 0.2.0** (from PyPI, 2026-10-23). The `new-vault` crash and the first-commit problem are both fixed there; this repo's first commit (`fd64e0c`) used `--no-verify` under 0.1.4. `livedocs verify` passes. Details are in [[2026-10-23 Design Discussion]].
- **To verify before building the Claude Code adapter:** that a `PostToolUse` hook with matcher `ExitPlanMode` fires, using `claude --debug` ([[Baesian Design#Decks from documents]]).
- **Dogfooding has started (D57):** `baesian` is on PATH via `npm link`, and this repo's commits go through its own gate.
- **Next:** M3b, `baesian verify` for CI and the merge gate. M3c waits on `livedocs signatures`.

*Update this section at the end of every session.*

## Reading order for a fresh agent

1. This note.
2. [[Working Agreement]]: how to work here, and decision cards.
3. [[Baesian Design]]: what is being built, and why.
4. [[Decision Log]]: what is decided and what is only proposed.
5. [[Implementation Plan]]: the stack, the layout, and the milestones. Then [[File Formats]] and the `Modules/` notes for the code you'll touch.
6. The newest note in `Sessions/`.

Quick triage: `grep -rh --include='*.md' '^summary:' docs/vault/`

## Where things go

| Folder | Holds | Checked against code? |
|---|---|---|
| `Design/` | the design and, later, plans | yes, where they name code |
| `Modules/` | one note per module or package: what it does, how it works, what depends on it | yes |
| `Concepts/` | ideas that span modules: an architecture, a lifecycle, an invariant | yes, where they name code |
| `Reference/` | external facts, surveys, dated reviews | reviews (`Review *`) are snapshots |
| `Reviews/` | design and architecture reviews, `YYYY-MM-DD Topic.md` (create it when first needed) | snapshots (never checked) |
| `Sessions/` | one log per working session | snapshots (never checked) |
| `Templates/` | note templates, including [[Decision Card]] | — |

## How to write a note that stays true

- Name code in backticks, by symbol: `` `function()` ``, `` `ClassName.method` ``, `` `CONFIG.key` ``,
  `` `<Component />` ``. Those are the claims livedocs checks; each binds only what it names. Prose that
  names no code is not checked (and is reported as such).
- A path to a code module binds only its default export (a component, a `defineConfig({…})` object);
  name the functions and types you describe. A path to a config file (`` `pyproject.toml` ``,
  `` `wrangler.jsonc` ``) binds the file; `` `wrangler.jsonc#assets.directory` `` binds one key.
- Commit the note; the commit stamps it. There is nothing else to run.
- When a commit is blocked, the message shows *was / now* for the code that changed and the note lines
  that mention it. Edit the note and commit again, or `livedocs stamp <note> --ack --reason "…"` if the
  note is still right.
- Dated records go in `Sessions/` or `Reviews/`, or are named `Reference/Review …`; they are snapshots and never block.

## Map

- [[Working Agreement]] · [[Decision Log]] · [[Baesian Design]]
- [[Modules]] · [[Concepts]] · [[Reference]] · [[Sessions]]
- Sessions, newest first: [[2026-10-23 Design Discussion]]
