---
type: index
status: active
authority: describes
summary: "Entry point to the Baesian vault: what the project is, where it stands, what to read first, and where notes go."
created: 2026-10-23
updated: 2026-11-01
reviewed: 2026-10-23
tags: [baesian, index]
---

# Baesian

This vault is the long-term memory for **Baesian**: swipe review for agent decisions. Agents turn their design decisions into cards, a developer or domain expert gives verdicts, and the verdicts go back to the agent. Agents and people write this vault as the code takes shape. `livedocs` keeps the notes honest: every note that names code in backticks is bound to that code, and a commit that changes that code is blocked until the note is updated or acknowledged.

## Current status

*As of 2026-11-01.*

- **Development is under way. M1–M3 are done** ([[Implementation Plan]]), with 208 passing tests, plus 33 browser tests, after M4's steps 2 to 5f, and D101 and D102 (`wait` in short runs that loop; agents named by their harness):
  - **M1:** the store and the core CLI;
  - **M2:** `wait` with card levels and presence, notifications, and the AGENTS.md instructions;
  - **M3a:** the commit gate, with three detectors, trailers, the ledger, `baesian check`, and hooks that coexist with livedocs;
  - **M3b:** `baesian verify` for CI, the merge gate, and conflicting decisions;
  - **M3c:** the `api:` detector, through `livedocs signatures`: breaking changes only, opt-in through `gate_api`.
- **Repo:** `main`, with both the livedocs and the Baesian gate, pushed to the private GitHub repo [GusEllerm/baesian](https://github.com/GusEllerm/baesian). CI (D61) runs the typecheck, the tests, the build and `baesian verify` on every push.
- **[[Baesian Design]] is at v0.5.** Everything in it is decided except its open questions.
- **Open for the user:**
  - P12, the [[File Formats]] (accept or change them before 0.1.0). The card and verdict tables are accepted, and the open points were decided as D105–D107 (2026-11-01). The other files remain;
  - (P13 was decided as D56: a `livedocs signatures` command, requested from live-docs-agent.)
- **Decided by the user** (D1–D108 in [[Decision Log]]):
  - **no compatibility between Baesian versions until a v1 is published** (D108): formats change freely until then;
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
- **M4 design is under way** ([[2026-10-23 Client Mockups]]). Round 1's three static mockups picked no winner, but set the direction (D65–D68). Round 2 is an interactive prototype at `design/explorations/round2/`: a four-way swipe and a context hierarchy. It's waiting for the user to try it.
- **Research cycle done** ([[Contextualising Decisions]]): four lenses (theory, analogous tools, spatial and visual, overseeing AI agents). It gives principles, tensions, proposed changes to D12, D13, D40 and D65, and three extreme concepts for round 3.
- **Round 3 was built** (`design/explorations/round3/`, D70): the Atlas, the one-cue card and the consequence preview, plus the oversight layer and card rarity ([[Card Rarity]]). The user found it hard to understand.
- **Round 4** (`design/explorations/round4/`) came out of a loop of independent reviews and revisions, one fresh reviewer per round, with the reviews in `round4/reviews/`:
  - the card is in the centre, with what it builds on to its left and what your answer changes to its right;
  - it sits on a messy pile of the rest of its area (the user's idea);
  - the queue is grouped by area, and the map opens on M or Space.

  The user: "much better and getting closer to the vision".
- **[[Client Data Contract]]** (draft) maps every element of round 4 to its source in the store, and records the hard backend problems. Under D71 (the user's rule), anything the client can't show reliably is dropped, starting with "commits built on this".
- **The project map** went through its own loop of seven independent reviews overnight (2026-10-24), and the last judged it sufficient. Every area is a row, each piece of work a track, and what's connected to your card is lettered. Nothing moves. It holds up at about 150 decisions (`#scale`).
- **Round 5** (`design/explorations/round5/`, 2026-10-24) is a subtractive pass for "understandable at a glance". It passed a screenshots-only glance review. The card fell from about 400 words to about 150. The project map gave way to the decision's neighbourhood, beside the card: "we don't want to build Linear". [[2026-10-23 Client Mockups#Round 5: glance first]].
- **Research done: [[Minimal Card Content]]** (D72). Five strands reported on what a card minimally needs, framed by facets rather than decision types. The synthesis revises the core and the facets, and sets out a test of "enough" and a measurement plan. The user decided four of its implications: the trigger back on the card (D73), one shared crux (D74), three facets to trial (D75), and when the agent's pick shows (D76).
- **The dry run (2026-10-24):** the user answered the Client Data Contract's ten open decisions as real cards in round 5 (`#dryrun`). Nine were decided (D77–D85), including the required card fields, commits left out of the client, and the undo kept (revising D67). Three rest on premises that are checked first. The waiting-marker card came back as "I need more context". Revised with the missing fact, it was decided in one pass (D90), so all ten are made. The dry run changed the user's mind about the agent's pick: it's now hidden on every card until you choose. A disagreement gets an optional reason, you can switch after the reveal, and the agent may reply once, with facts (D86–D89, built into round 5). [[2026-10-23 Client Mockups#The dry run: real decisions in round 5 (2026-10-24)]].
- **Next:**
  - **M4, in the order of D91:** ~~the file-watching test~~ (done: D84's premise holds on macOS and Linux); ~~the P12 format changes in the store~~ (done: D92–D95 settled the draft's open points); ~~the store's new behaviour~~ (done: returned dependents, briefs, the waiting marker); ~~the local server~~ (done: `baesian serve`, D96, D97); the React client, porting round 5 ([[Client Build]], D98–D100): 5a to 5f are built (the scaffold, the model, the card and answering, the path and pile, then presence, notifications, calibration, keyboard help and the empty desk, then a quality pass against round 5). D104 then built D89's reply: an agent may answer once, with a fact or a check, when you chose against its pick (`baesian reply`). `serve` now starts on the last server's port when it's free (D103), so the browser keeps the client's own data across restarts.
  - **rehearse, a general scenario harness** extracted from hpc-bridge, a separate project the user is starting. Its handoff plan is `docs/handoffs/scenario-harness-extraction.md`, revised after four reviews on 2026-10-31 (`scenario-harness-extraction-reviews.md`). Baesian becomes its second consumer when it's ready.
  - **Later: Baesian on the user's cluster of Sparks,** alongside persistent agents. Everything assumes one machine today ([[Baesian Design#Open questions]]).

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
