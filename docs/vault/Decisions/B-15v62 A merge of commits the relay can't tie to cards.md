---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "A merge of commits the relay can't tie to cards: Keep it, and say so (B-15v62)."
created: 2026-11-06
updated: 2026-11-06
tags:
  - baesian
  - decision
aliases:
  - B-15v62
card: B-15v62
revision: 1
title: A merge of commits the relay can't tie to cards
question: Should the relay keep a merge listing commits whose ledger entries it never held while the project exists, rather than drop it at its next daily look?
answer: Keep it, and say so
response: accept
not_chosen:
  - Drop it, as now
answered: 2026-11-06T02:37:51.885Z
answered_by: GusEllerm
topic: hosted/merge-retention
deck: branches-view
level: hard
reverse: cheap
touches:
  - privacy
  - schema
  - data-loss
filed: 2026-11-05T23:56:26.730Z
filed_by: claude-code
branch: worktree-wf_7ec3a0ab-1e8-8
---

# A merge of commits the relay can't tie to cards

Should the relay keep a merge listing commits whose ledger entries it never held while the project exists, rather than drop it at its next daily look?

**Decided:** Keep it, and say so, the agent's pick. The relay notes the commits whose ledger entries it held and removed; a merge goes once its cards' text went and each of its commits is among those. One it can't tie to any card stays while the project exists, and /privacy says so.

**Not chosen:** Drop it, as now. A merge listing only commits whose entries the relay never held goes at the next daily look, and can't come back: its log entry is kept, so a re-upload is answered 'already here'. Every machine's drawing loses that merge.

**It turned on:** Should the relay keep a merge it can't tie to any card for as long as the project exists? (a preference) Yes: it holds no card's text: Keep it, and say so. No: the policy's promise first: Drop it, as now.

**The fact given:** Such a merge names its two branches, its time, commit IDs and no card. It arises when a machine finds a merge from ledger entries committed in git by a machine that isn't linked (a teammate, CI), or from entries older than D120, which never leave their machine. /privacy says a merge that brought commits citing cards is kept 'until the text of every card they cite is removed too'; the relay can't tell which cards these cite. A merge that brought only a deck already stays while the project exists.

**The agent's case:** It ties nothing on the relay to a card, as a deck-only merge doesn't; dropping it loses part of every machine's history.

**Wrong if:** A merge's commit IDs, kept after the cards they cite are removed elsewhere, would let someone with the repo tie the service's kept merge back to decisions whose text the service promised to drop. **To check:** /privacy's table of what's kept (client/src/site/Privacy.tsx, the merge row), and whether a project's members can read a removed card's text from git anyway (the committed record keeps it).

Answered by GusEllerm on 2026-11-06, through Baesian (card B-15v62, revision 1). Filed by claude-code on worktree-wf_7ec3a0ab-1e8-8, in the deck “The branches panel, redrawn”.

The record is in `.baesian/cards/B-15v62/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

From the sweep's finding D9 (a bug: retention reads "never had its ledger entries" as "all of them went"). The fix was built and tested on the sweep's branch, then taken out again: it keeps such a merge longer than /privacy's line for merges says, which is yours to decide. With "Keep it", the change is service/src/relay.ts `dropMerges()` and a table in service/src/retention.ts (`retention_commits`, never logged or sent), plus the line on /privacy (client/src/site/Privacy.tsx) and the Privacy Policy note. The sweep's test: upload a merge with cards [] and commits whose ledger entries the relay doesn't hold, sweep a minute later, and it's gone; sent again, 200 "unchanged", still gone.
