---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How the history scan is run on a repo already linked: A flag on sync: baesian sync --history (B-x179n)."
created: 2026-11-06
updated: 2026-11-06
tags:
  - baesian
  - decision
aliases:
  - B-x179n
card: B-x179n
revision: 1
title: How the history scan is run on a repo already linked
question: Should the history scan, for a repo that's already linked, be a flag on `baesian sync` or a command of its own?
answer: "A flag on sync: baesian sync --history"
response: accept
not_chosen:
  - A command of its own, with a dry run
answered: 2026-11-06T03:44:06.880Z
answered_by: GusEllerm
topic: cli/history-scan
deck: branches-view
level: provisional
reverse: cheap
touches:
  - user-facing
  - public-api
filed: 2026-11-06T03:30:53.422Z
filed_by: claude-code
branch: worktree-agent-aea976db0fba35121
depends_on:
  - "[[B-dezkk Branches merged before Baesian recorded merges|B-dezkk]]"
---

# How the history scan is run on a repo already linked

Should the history scan, for a repo that's already linked, be a flag on `baesian sync` or a command of its own?

**Decided:** A flag on sync: baesian sync --history, the agent's pick. Then `baesian sync --history` scans, records what it finds, prints each merge, and sends them with that sync, in one step; to see what it would record without recording it, run it on a copy of the repo.

**Not chosen:** A command of its own, with a dry run. Then a command such as `baesian merges --scan` prints what it would record, and records only with `--write`; the merges go up at the next sync, a second step.

**It turned on:** Do you want to see what the scan would record before it goes to the service? (a preference) No: record and send in one step: A flag on sync: baesian sync --history. Yes: look first, then record: A command of its own, with a dry run.

**The fact given:** The scan is meant to run once per repo: linking a repo runs it before the first sync. Run again, it finds nothing new. What it records goes to the service with the sync, and the service keeps a merge's file once taken: one recorded wrongly can't be taken back there. In this repo it would record one merge (worktree-agent-aaba362 into overnight/2026-11-03); from a repo with no merges recorded, it found 28, none of them artefacts.

**The agent's case:** It's run once, and recording without sending leaves it half done; the flag reuses sync's own output and its relay step.

Answered by GusEllerm on 2026-11-06, through Baesian (card B-x179n, revision 1). Filed by claude-code on worktree-agent-aea976db0fba35121, in the deck “The branches panel, redrawn”.

The record is in `.baesian/cards/B-x179n/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Built as the proposal on the builder's branch (`src/cli.ts`, the `sync` command; `scanHistory()` in `src/merges.ts`). The alternative is a small change: a command that calls `scanHistory()` without `write`, prints the same rows, and with `--write` records them.
