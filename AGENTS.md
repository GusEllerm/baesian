# Agent instructions

This repo is **Baesian**: swipe review for agent decisions. Agents file their design decisions as cards,
a developer or domain expert gives verdicts, and the verdicts go back to the agent.

**Project memory lives in the Obsidian vault at `docs/vault/`.** Start every session by reading
`docs/vault/Home.md` and following its reading order.

- **Follow `docs/vault/Working Agreement.md`.** Session protocol: at the end of a session that changed
  anything, write a log in `Sessions/` and update "Current status" in `Home.md`.
- **Decision cards.** Format, interface, storage-layout, integration and dependency decisions go to the
  user as decision cards (`Templates/Decision Card.md`). Never make them silently, and never present a
  proposal as agreed. Record every decision in `docs/vault/Decision Log.md`, saying who made it.
- **The design** is `docs/vault/Design/Baesian Design.md`.

## Live documentation (livedocs)

Notes under `docs/vault/` are bound to the code they mention (names in backticks). A pre-commit gate blocks
any commit that changes code a note mentions until the note is reconciled: edit the note and commit
again (the commit stamps it), or if the note is still correct run
`livedocs stamp <note> --ack --reason "<why>"`, `git add -A`, and commit. New and edited notes are stamped
by the commit that contains them; nothing else to run. `livedocs affected` lists the notes your
uncommitted changes touch; `livedocs coverage` shows which claims are anchored. In notes, name symbols
(`getProjects()`, `Box.area`, `<ProjectCard />`), not files: a path to a code module binds only its
default export, so a note that names only files is checked against almost nothing.
Write notes in `docs/vault/` (see `docs/vault/Home.md` for the layout); commit them and they are stamped. Session logs go in `Sessions/` and are never checked.
