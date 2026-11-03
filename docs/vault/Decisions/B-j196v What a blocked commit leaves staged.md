---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "What a blocked commit leaves staged: Unstage them (B-j196v)."
created: 2026-11-02
updated: 2026-11-02
tags:
  - baesian
  - decision
aliases:
  - B-j196v
card: B-j196v
revision: 1
title: What a blocked commit leaves staged
question: When the gate blocks a commit, should the record files Baesian staged for it stay staged?
answer: Unstage them
response: accept
not_chosen:
  - Leave them staged
answered: 2026-11-02T03:39:35.227Z
answered_by: Gus Ellerm
topic: gate/blocked-commit-index
deck: m5-adapters
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-02T03:34:26.925Z
filed_by: claude-code
branch: main
---

# What a blocked commit leaves staged

When the gate blocks a commit, should the record files Baesian staged for it stay staged?

**Decided:** Unstage them, the agent's pick. When the gate blocks a commit, Baesian unstages the record files again, so `git status` shows only what you or the agent staged. The next commit stages the record again, as every commit does.

**Not chosen:** Leave them staged. As now: the record files stay staged until a commit takes them, so `git status` lists them after a blocked commit, and a `git stash` in between takes them too.

**It turned on:** Between a blocked commit and the next one, does anyone act on what's staged? Yes: stash, reset or look it over: Unstage them. No: the next step is to commit again: Leave them staged.

**The fact given:** Baesian's pre-commit hook stages the whole record (`.baesian/`) for every commit, and the commit-message hook can then block the commit; git keeps whatever was staged. Every later commit stages the record again either way. A stash taken in between holds the staged record files, and the next commit copies them back from Baesian's own store, so popping the stash then runs into files that already exist.

**The agent's case:** Agents often stash or check `git status` after a commit fails, and files they didn't stage are confusing at best; the stash case is a real collision. Unstaging costs nothing, since the next commit stages the record again.

Answered by Gus Ellerm on 2026-11-02, through Baesian (card B-j196v, revision 1). Filed by claude-code on main, in the deck “M5: harness adapters”.

The record is in `.baesian/cards/B-j196v/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

rehearse's agent found this while driving Baesian in its scenario harness: after a commit the gate blocked, `git status` showed `.baesian/` files staged that neither it nor the agent had staged.
