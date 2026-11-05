---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Citations of Baesian's own decisions in its output: Keep them, behind a verbose flag (B-728jd)."
created: 2026-11-05
updated: 2026-11-05
tags:
  - baesian
  - decision
aliases:
  - B-728jd
card: B-728jd
revision: 1
title: Citations of Baesian's own decisions in its output
question: Should the command line stop printing citations of Baesian's own design decisions, such as "(B-4rwyz)" or "(D42; D144)", in what it tells people and agents?
answer: Keep them, behind a verbose flag
response: alternative
not_chosen:
  - Drop them from all output
answered: 2026-11-05T19:53:58.933Z
answered_by: GusEllerm
topic: cli/output/citations
deck: cli-output
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-05T19:52:02.169Z
filed_by: claude-code
branch: v1/next
---

# Citations of Baesian's own decisions in its output

Should the command line stop printing citations of Baesian's own design decisions, such as "(B-4rwyz)" or "(D42; D144)", in what it tells people and agents?

**Decided:** Keep them, behind a verbose flag, the alternative. Ordinary output drops them; `--verbose` (a new flag) prints them, for someone who wants to trace a message back to the decision behind it.

**Not chosen:** Drop them from all output, the agent's pick. Messages say what to do without citing why. The citations stay where they're useful: in the code's comments, the vault and the Decision Log, for whoever works on Baesian.

**It turned on:** Does anyone using Baesian in their own repo need to see which of Baesian's decisions a message rests on? No: Drop them from all output. Yes, sometimes: Keep them, behind a verbose flag.

**The fact given:** The audit found about 33 in ordinary output (init --personal, file, check, login, ci, help, errors). Outside this repo they point nowhere a user can follow, and a citation like B-4rwyz has the same shape as the user's own card IDs, so an agent can take it for one of its cards.

**First chose:** Drop them from all output, then switched once the agent's pick was shown.

**The agent's case:** They're notes for Baesian's builders that leaked into the product. A verbose flag would keep a second wording alive for a reader who barely exists.

Answered by GusEllerm on 2026-11-05, through Baesian (card B-728jd, revision 1). Filed by claude-code on v1/next, in the deck “What the command line prints”.

The record is in `.baesian/cards/B-728jd/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

For example, `baesian login` today ends one line with "(baesian login, B-62qnz)" inside the ack it tells you to paste, and `init --personal` cites B-4rwyz three times.
