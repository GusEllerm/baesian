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

<!-- baesian:begin -->
## Decisions (Baesian)

Design decisions that are hard to undo go to a person as cards; you don't make them silently. Run
`baesian inbox` before starting work, and again when you finish a task: it shows new verdicts on this branch's
cards, to act on then rather than mid-task.

**File a card** (`baesian template > card.md`, fill it in, `baesian file card.md`) when a decision
changes a schema or on-disk format; changes a public API, URL scheme or module boundary; adds a runtime
dependency; changes CI, infrastructure or deployment; is user-facing; publishes something; touches
security or privacy; spends money; deletes or overwrites stored data; or would break something to
reverse. Otherwise decide yourself. Every card states its strongest alternative, and the one question
the choice turns on (the crux). A topic names one question: reuse one from `baesian topics` only for the
same question, and give a follow-on question its own, narrower topic. The reviewer chooses before seeing
your pick, your case or the card's body; put what they need in order to choose, kept neutral, in
`crux_fact`, and background in the body. The decision record is committed with the code, so don't paste
secrets, credentials or private output into a card.

Before deciding whether to file, read this repo's guidance in its vault: `docs/vault/Working Agreement.md` and the rules in force, in `docs/vault/Rules/`.

**The commit gate** detects some of these decisions (dependencies, schemas and migrations, CI and
deploy files) and blocks a commit until each one is covered. Either cite a card whose `touches`
include it, `Baesian-Card: <id>`, or, for a two-way door, acknowledge it with a reason:
`Baesian-Ack: dep:httpx <why this is fine>`. When it blocks, the gate prints the lines to paste.
`baesian check` previews it before you commit. Trailers go at the end of the message, after a blank
line.

- `level: provisional` (the default): carry on with your proposal. `blocking`: run `baesian wait <id>`
  before building on it. `hard` (the default for publishing, security, money and data loss): never
  proceed without a verdict.
- `baesian wait <id>` exits 0 when resolved (use the decision. If it went against your pick and you hold
  a fact the reviewer lacked, or a check that would settle it, you may reply once:
  `baesian reply <id> "<the fact or check>"`. Not your pick again); 4 when answered otherwise (returned:
  read the comment, then `baesian revise <id>` or `baesian withdraw <id>`); 5 with no verdict yet
  (proceed provisionally); 6 with no verdict on a hard card (don't proceed: park the task or stop); 7 while
  the reviewer is still there (run `baesian wait <id>` again). Each run lasts at most 100 seconds.
- If an answer asks for a rule (`wait` and `inbox` say so), draft it, with the gate patterns it covers:
  `baesian rule <id> "<the rule>" --covers dep:pytest-*`. It goes to the reviewer as a card.
- If you're a long-lived agent, set `BAESIAN_AGENT` to your name; otherwise your harness's name is used.
- If `baesian file` exits 3, the decision may already be open or decided: attach with
  `baesian attach <id>`, or follow the decision. File with `--new` only to argue against one, and set
  `supersedes:`. If yours is a different question on the same subject, give it a narrower topic
  (`client/rule-drafts` beside `client/rules`) and list what it builds on in `depends_on`.
- Commits that build on a card carry the trailer `Baesian-Card: <id>`. The gate blocks a commit that
  builds on a rejected card, or on a hard card that isn't resolved yet.
- Never record a verdict yourself: only a person answers, in the Baesian client.
<!-- baesian:end -->
