---
type: index
status: active
authority: describes
summary: "Entry point to the Baesian vault: what the project is, where it stands, what to read first, and where notes go."
created: 2026-10-23
updated: 2026-11-05
reviewed: 2026-10-23
tags: [baesian, index]
---

# Baesian

This vault is the long-term memory for **Baesian**: swipe review for agent decisions. Agents turn their design decisions into cards, a developer or domain expert gives verdicts, and the verdicts go back to the agent. Agents and people write this vault as the code takes shape. `livedocs` keeps the notes honest: every note that names code in backticks is bound to that code, and a commit that changes that code is blocked until the note is updated or acknowledged.

## Current status

*As of 2026-11-05.*

- **Setting up a linked repo's CI is built (2026-11-05)** ([[2026-11-05 CI Setup]]), on a builder's branch off `v1/next`, from three cards the user accepted:
  - **CI pins the project beside the keys (B-mar8x):** `BAESIAN_TRUST` gains a line, `{"type":"project","format":1,"project":"p-…"}`; a commit naming another project fails, and the linking commit is found once, from HEAD, by ancestry, so branches in flight at linking pass and a backdated re-link fails closed.
  - **`baesian ci` (B-pt52b)** prints the pin's lines from what the service sent, and the workflow steps; `--github` sets the variable with `gh`.
  - **`baesian login` links to https://baesian.dev** when nobody names a service (B-f2mfb).
  - **Before CI runs this code:** add the project's line to this repo's `BAESIAN_TRUST` (`baesian ci --github`, or by hand): without it, `verify` stops.

- **The hosted service is live at https://baesian.dev (2026-11-04)** ([[2026-11-04 M9c Sign-in]]):
  - `v0.1.0`, tagged on `main` and deployed by CI (B-bk20v).
  - The custom domain is attached, all five migrations are applied, the daily job is scheduled, and Workers Logs are off.
  - Sign-up is open (B-mz6qc), but others can't link a repo yet: the CLI isn't published and the repo is private.
  - **`v0.1.1`** fixed Globus sign-in (the client's credentials weren't sent as Globus reads them) and the privacy page's width. The user has signed up.
  - **This repo is linked (2026-11-05)**, as project `p-c81yx9gdvfr9yjsfdsrp`: its cards are on the service and answered at baesian.dev. CI's verify steps read the keys pinned in the repo variable `BAESIAN_TRUST` (`.github/workflows/ci.yml`).
  - **Next:**
    - set the repo variable `BAESIAN_TRUST`, with the project's line, before `v1/next` next merges into `main`: CI fails while it's unset;
    - ~~make setting up a repo easier, from what linking this one showed~~ (built: B-mar8x, B-pt52b, B-f2mfb);
    - confirm Globus sign-in;
    - the checks on real devices;
    - then M10.

- **M9f has begun (2026-11-04)**:
  - **Where it runs:** the user's University of Chicago Cloudflare account (D177), on Workers Paid (D178), at **https://baesian.dev** (B-aa9pc).
  - **Done:**
    - the accounts database, created and migrated;
    - Email Sending and Turnstile for the domain;
    - the Globus app;
    - the Worker's four secrets;
    - the deploy workflow and its token (B-bk20v).
    - retention, the privacy policy at `/privacy`, and deleting an account, all built and merged;
    - Workers Logs, turned off.
  - **Left before the first deployment:** the policy's legal review if wanted, its date, then the user merges `v1/next` into `main` and pushes a release tag.

- **M9e is done: the website installs as an app, sends notifications, and keeps usage counts (2026-11-04)** ([[2026-11-04 M9c Sign-in]]):
  - **Notifications:** web push on Baesian's own code (B-nk97q), giving counts and levels only, in the project's name. Stopping cards notify at once and the rest come in a digest (B-advkh).
  - **Usage counts:** ten kinds of event with fixed values (B-7nq85), with an opt-out, listed at `/counts`. The [[Usage Counts Balancing Test]] waits for the user's check.
  - **Tests:** 562 root unit tests, 125 relay tests and 96 browser tests pass.
  - **Next, M9f, which needs the user:** a Cloudflare account and domain, the D1 database, the email domain, Turnstile keys, the Globus app, and the `VAPID_KEY` secret. The checks on real devices follow it.

- **M9e step 1, the website, is built and merged (2026-11-04)** ([[2026-11-04 M9c Sign-in]]): the Worker serves the client as a website for signing up, signing in, recovery, the account, approving machines (`/device`, which names a new project, B-zqkwk), your projects, and each project's desk at `/projects/{project}`, live over the relay's socket, with the passkey asked for on hard answers. Answers from before linking go up once, at first link (B-3zjjx). `baesian serve` in a linked repo opens the project's page. Nothing waits on the user. 560 root unit tests, 98 relay tests and 84 browser tests pass. Next: M9e step 2, web push, installing as an app, and usage counts.

- **M9d, the CLI's side of the hosted service, is built (2026-11-04)** ([[2026-11-04 M9c Sign-in]]): `baesian login` signs a machine in and links an unlinked repo, and the CLI and the MCP server sync through the relay; offline, everything works as before. Waiting on the user: B-3zjjx, whether answers from before linking go up to the relay. 557 root unit tests, 95 relay tests and 69 browser tests pass. Next: M9e, the website.

- **M9c, accounts and sign-in, is built on the service's side (2026-11-04)** ([[service]], [[2026-11-04 M9c Sign-in]]): accounts in one D1 database; sign-up with an email code and a passkey, or through Globus (D176); passkey sign-in with SimpleWebAuthn, whose premise held in workerd; recovery with an emailed code and a saved recovery code; sign-ins of 30 days unused that keep no addresses; machine grants through OAuth's device flow (B-t5wxr); Turnstile and limits; the relay's `Access` for real; and answers proved by the reviewer's passkey, so the relay can hold cards back. 95 tests in workerd, 532 root unit tests and 69 browser tests pass. On its builder's branch, for merging into `v1/next`. Next: M9d, `baesian login` and the CLI's sync; M9e, the website's pages.

- **v1 is being built, on the branch `v1/next` (2026-11-03):** the overnight branch is merged into `main`. Built and merged into `v1/next`: **M6, the vault adapter** (on in this repo: decisions made on cards are notes in `Decisions/`, with no new D-rows, D174), **M7, the MCP server**, **format numbers in every file** (D156, D157), the deck briefing card, and privacy as a fact of its own. **M8, routing and preferences**, is merged too: the gate at filing, held cards, audits, slider and convention proposals, the preferences panel and the setup survey. From **M9, the hosted service**: the phone layout (D130), and **M9a, answers that count**, checked offline, with its three follow-ups (signed files name their project, answers their card's digest, and fewer audits take the passkey). Baesian's own hook block no longer needs acks in a repo's first commit (B-g6ywj). **M9b, the relay, is built** ([[service]]): a Worker with a Durable Object per project, running the same store over SQLite, with live updates over hibernating WebSockets; sign-in is a seam until M9c. 532 root unit tests, 117 relay and store tests in Cloudflare's runtime, and 69 browser tests pass. Next: M9c, accounts and sign-in: [[2026-11-03 v1 Designs]].

- **After the overnight run (2026-11-03):** the user answered the twenty cards: nineteen accepts (D133–D151), and a question on sign-in, answered with research on Globus Auth and a revised card, B-9tk9m r2, which is the one card waiting. A rotating-drum path (D152) was tried and then removed (D155), to be started again later; the path is the flat one, with its focus fixed. The trail search (D134) and the secrets warning (D136) are built and merged. All on the branch `overnight/2026-11-03`, with 267 unit tests and 42 browser tests passing: [[2026-11-03 The Drum]].

- **The overnight run (2026-11-02 to 11-03) is done, on the branch `overnight/2026-11-03`:** the plan, its log and a debrief for the user are in [[2026-11-03 Overnight]]. Twenty cards wait in four decks (`stability`, `hosted`, `routing`, `release`); two proposals, [[Routing and Preferences]] (P14) and [[Hosted Service]] (P15); the research behind them, [[Preference Sliders and the Gate]]; a [[2026-11-03 Scale Test]] whose fix made every command linear in the cards; and a [[2026-11-03 Privacy and Security]] review. On the branch, 254 unit tests and 41 browser tests pass. `main` is unchanged.

- **Development is under way. M1–M3 are done** ([[Implementation Plan]]), with 247 passing tests, plus 38 browser tests, after M4's steps 2 to 5f, and D101 and D102 (`wait` in short runs that loop; agents named by their harness):
  - **M1:** the store and the core CLI;
  - **M2:** `wait` with card levels and presence, notifications, and the AGENTS.md instructions;
  - **M3a:** the commit gate, with three detectors, trailers, the ledger, `baesian check`, and hooks that coexist with livedocs;
  - **M3b:** `baesian verify` for CI, the merge gate, and conflicting decisions;
  - **M3c:** the `api:` detector, through `livedocs signatures`: breaking changes only, opt-in through `gate_api`.
- **Repo:** `main`, with both the livedocs and the Baesian gate, pushed to the private GitHub repo [GusEllerm/baesian](https://github.com/GusEllerm/baesian). CI (D61) runs the typecheck, the tests, the build and `baesian verify` on every push.
- **[[Baesian Design]] is at v0.5.** Everything in it is decided except its open questions.
- **v1's scope** (2026-11-02): the vault adapter and the MCP server stay in it (D125), and audit and convention cards are designed before it (D126).
- **A hosted service is the way to publish** (D127–D131, 2026-11-02): a website you sign up to and answer cards on, from a laptop or a phone (a phone layout, D130). The repo owns its decisions and the website relays them (D127); agents reach it through the CLI and a local MCP server after a one-time sign-in (D128); the user hosts it for others (D129); preference sliders are per repo (D131); and it's part of v1 (D132). Open: how the sliders work (deep research first), and what it collects.
- **The file formats are accepted** (D124, 2026-11-02): P12 is closed. [[File Formats]] describes them; under D108 they stay free to change until a v1 is published.
- **Decided by the user** (D1–D155 in [[Decision Log]]; D109–D116 and D118–D122 through Baesian itself, while dogfooding):
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
  - **dogfooding:** this repo, and personal-website once v1 is released (D117);
  - the [[Working Agreement]] is active.
- **livedocs is 0.2.0** (from PyPI, 2026-10-23). The `new-vault` crash and the first-commit problem are both fixed there; this repo's first commit (`fd64e0c`) used `--no-verify` under 0.1.4. `livedocs verify` passes. Details are in [[2026-10-23 Design Discussion]].
- **M5 is under way:** the plugin, for Claude Code and Codex, is built in `plugins/baesian/` (D114, D115, D118): the skill (`/baesian`, or `$baesian` in Codex); hooks that bring in new verdicts at natural stopping points (a new session, your next message, the end of the agent's turn: D116); and the hook that makes an approved plan a deck. **Provisionally tested** in Claude Code by the user in a real session (2026-11-01): `SessionStart` fired, and `UserPromptSubmit` brought in the verdict. Codex 0.154 installs the same plugin unchanged (2026-11-02), and the end-of-turn hook answers Codex in its own form. **Tested in Claude Code by rehearse** (2026-11-02, a free probe at `5a1b567` on Claude Code 2.1.316, rehearse `bb2cd1f`): all four hooks; the skill as `/baesian` and `/baesian:baesian`; a verdict given mid-tool-call arriving only at the end of the turn, one given while idle with the next message, and one given between sessions at the next start or resume; and the plan hook, which makes one deck for an approved plan and none for a plan rejected with feedback (rejecting with Esc wasn't tried). **rehearse now tests it in real interactive sessions** (2026-11-02, pinned at `29be803`, rehearse `a8f1dde`): three scenarios (`scenarios/baesian-plugin/`: hooks, sessions, plan) run Claude Code 2.1.316 in Docker with a mock model and no network, with graders for each expectation above, plus one that a verdict `wait` delivered isn't delivered again by a hook, and a plan rejected by Esc as well as with feedback. It takes about 4 minutes. **Tested in Codex by rehearse** (2026-11-02, Codex 0.166.0 at `29be803`, rehearse `1c24f51`): installing offline; `SessionStart` at startup and at resume; `UserPromptSubmit` with the next prompt; `Stop` blocking once and Codex carrying the turn on, with no loop; the skill through `$baes` in the TUI. Codex runs hooks only once they're trusted in its TUI, and `codex exec` skips untrusted ones silently; trust is a hash of all the plugin's files, so every plugin update needs trusting again. Hooks don't see `CODEX_THREAD_ID`, which doesn't matter: they only run `inbox --quiet`. rehearse is now building Codex scenarios with a harness of its own. Still untested: real models. rehearse re-checks its pin when a commit changes what a hook prints or when it fires. Also fixed (2026-11-02): `baesian wait` now marks what it delivers as seen, so the hooks don't hand an agent an answer again; and a commit the gate blocks no longer leaves the record staged (D122).
- **A demo for showing people (D123):** `npm run demo` (or `npm run demo -- <empty folder>`, with `--no-open` to open the client yourself) makes a throwaway repo for Crumb, a made-up bakery's shop, where two agents have filed five cards. It opens the client, and the terminal shows what each agent hears as you answer; Enter is a stopping point, where they check their inbox.
- **The README** (2026-11-02, at the user's request) has a GIF of the demo, side by side with what each agent hears, and two figures: decisions branching with the code, and every commit as a checkpoint. `npm run readme-media` remakes all three from the real thing (`scripts/readme-media.ts`, with ffmpeg); remake the GIF once the sidebar's motion is polished.
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
