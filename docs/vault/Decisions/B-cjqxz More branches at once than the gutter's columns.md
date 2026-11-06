---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "More branches at once than the gutter's columns: A column each (B-cjqxz)."
created: 2026-11-06
updated: 2026-11-06
tags:
  - baesian
  - decision
aliases:
  - B-cjqxz
card: B-cjqxz
revision: 1
title: More branches at once than the gutter's columns
question: With more than eight branches open at once, should they share the gutter's last column, or should the gutter grow a column for each?
answer: A column each
response: accept
not_chosen:
  - Share the last, as now
answered: 2026-11-06T02:42:38.170Z
answered_by: GusEllerm
topic: client/branches/shared-column
deck: branches-view
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-05T23:54:10.965Z
filed_by: claude-code
branch: worktree-wf_7ec3a0ab-1e8-8
---

# More branches at once than the gutter's columns

With more than eight branches open at once, should they share the gutter's last column, or should the gutter grow a column for each?

**Decided:** A column each, the agent's pick. The gutter has as many columns as branches are open at once, narrowing its pitch to its width as now and widening once that's 6 px: every branch keeps its own line, and the rows' text gets narrower when that many are open.

**Not chosen:** Share the last, as now. Past eight, branches share the last column, and their rows name the branch: lines in that column belong to more than one branch, their merges curve out of a column drawn as another, and their lines start and stop at row edges.

**It turned on:** Is a narrower text column worth every branch keeping its own line, past eight at once? (a preference) Yes: A column each. No: eight is plenty: Share the last, as now.

**The fact given:** This repo's history needs five columns at most. Ten branches open at once (a test fixture) puts four in the eighth column: three merges come out of a column drawn as another branch, with lines broken at row edges. The gutter is 14 px a column up to five, then narrows to fit 70 px (100 when Wider).

**First chose:** Share the last, as now, then switched once the agent's pick was shown.

**The agent's case:** A shared column draws lines that aren't true; the gutter growing for a busy hour costs some width only then.

Answered by GusEllerm on 2026-11-06, through Baesian (card B-cjqxz, revision 1). Filed by claude-code on worktree-wf_7ec3a0ab-1e8-8, in the deck “The branches panel, redrawn”.

The record is in `.baesian/cards/B-cjqxz/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

From the sweep's finding G-12 (a choice: `COLUMNS` documents the sharing). Not built in the sweep; the gutter's tests check every rule but that one past eight columns.
