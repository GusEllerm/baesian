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

- **Design stage; no code yet.** git is initialised on `main` with the livedocs gate. Nothing is committed, and there is no GitHub repo.
- **[[Baesian Design]] is at v0.4.** Everything in it is decided except its open questions. No proposals are outstanding.
- **Decided by the user** (D1–D22 in [[Decision Log]]):
  - **scope:** coding agents first, research later;
  - **routing:** from a checklist of impact and reversibility facts, not self-reported confidence; audit cards sample the agent's own decisions;
  - **cards:**
    - every card states the strongest alternative;
    - short random IDs (`B-7f3k`), one per decision for its whole life;
    - decks with briefing cards; rejecting a card withdraws its dependents;
  - **responses:** the gesture mapping and the five card states; an escape hatch and richer written feedback;
  - **ledger:** commit trailers plus card notes;
  - **rules:** a toggle at verdict time plus mined convention cards;
  - **storage:** a standalone `.baesian/`, with a vault adapter that owns a block in the Decision Log;
  - **v1 order:** schema and CLI → hooks → swipe UI → plugin → adapter → MCP;
  - **dogfooding:** this repo and personal-website;
  - the [[Working Agreement]] is active.
- **Open for the user:** the first commit. On livedocs 0.1.4 it must be `git commit --no-verify`, because the gate blocks a repo's first commit (fixed for 0.2.0, which isn't released yet). Details are in [[2026-10-23 Design Discussion]].
- **livedocs:** the `new-vault` crash is fixed in live-docs `25297e0`. It was unreleased branch code reached through the editable install.
- **Next:** where cards come from (the agent filing mid-task vs. hooks catching decision types), then the card schema (D20 step 1) as a decision card.

*Update this section at the end of every session.*

## Reading order for a fresh agent

1. This note.
2. [[Working Agreement]]: how to work here, and decision cards.
3. [[Baesian Design]]: what is being built, and why.
4. [[Decision Log]]: what is decided and what is only proposed.
5. The newest note in `Sessions/`.

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
