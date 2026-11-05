---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Using Baesian in a shared repo, just for yourself: A personal mode: nothing committed (B-4rwyz)."
created: 2026-11-05
updated: 2026-11-05
tags:
  - baesian
  - decision
aliases:
  - B-4rwyz
card: B-4rwyz
revision: 1
title: Using Baesian in a shared repo, just for yourself
question: How should one person use Baesian in a repo they share with collaborators who don't, without changing anything the others see?
answer: "A personal mode: nothing committed"
response: accept
not_chosen:
  - Shared but optional
answered: 2026-11-05T15:29:43.947Z
answered_by: GusEllerm
topic: setup/personal-mode
deck: setup
level: provisional
reverse: moderate
touches:
  - schema
  - public-api
  - user-facing
filed: 2026-11-05T15:27:46.145Z
filed_by: claude-code
branch: v1/next
---

# Using Baesian in a shared repo, just for yourself

How should one person use Baesian in a repo they share with collaborators who don't, without changing anything the others see?

**Decided:** A personal mode: nothing committed, the agent's pick. Then `baesian init --personal` keeps everything in the clone: the record and the link in `.git/baesian/`, the gate in a per-clone hook folder that runs Baesian's block, then the repo's own hooks; instructions from the plugin installed for you, not `AGENTS.md`. Your agents file cards and you answer them on the website as now. Decisions don't travel with the code in git, and CI can't check them. Switching the repo to shared mode later commits the record.

**Not chosen:** Shared but optional. Then `baesian init` commits as now, but the hook skips quietly where Baesian isn't installed instead of refusing the commit. Decisions travel in git for everyone to see. `AGENTS.md` tells every collaborator's agent to file cards, including those without Baesian, and the change is in the shared repo for others to review.

**It turned on:** Should trying Baesian in a shared repo need the collaborators' agreement? (a preference) No: one person can start alone: A personal mode: nothing committed. Yes: it's the team's repo: Shared but optional.

**The fact given:** Today `baesian init` writes into committed files: Baesian's block in the hooks (which refuses commits on machines without Baesian, and until it's published nobody else can install it), `.baesian/`, and `AGENTS.md`. The live layer, `.git/baesian/`, is already per clone. CI's `verify` needs the committed record. Several reviewers on one project isn't built.

**The agent's case:** Most people who'd try Baesian work in repos they share. Personal mode lets them start without a team discussion, and moves to shared mode once the team wants the record; the alternative still changes what everyone's agents are told.

Answered by GusEllerm on 2026-11-05, through Baesian (card B-4rwyz, revision 1). Filed by claude-code on v1/next, in the deck “Setting up a repo with the hosted service”.

The record is in `.baesian/cards/B-4rwyz/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Asked on 2026-11-05 while planning to try Baesian in chorus_conservancy (the chorus-devs organisation's repo, with a livedocs pre-commit hook that ends in `exec`).

**Open details for the build, not part of the choice:** whether commit trailers are still asked for in personal mode (they'd show in shared history) or coverage goes to the local ledger instead; how the per-clone hook folder survives a team's setup script that sets `core.hooksPath` itself; and how `baesian init --shared` later turns a personal repo's live record into a committed one.
