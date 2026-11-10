---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "What v0.1.10 ships: Move main up to the tag (B-1fhvq)."
created: 2026-11-10
updated: 2026-11-10
tags:
  - baesian
  - decision
aliases:
  - B-1fhvq
card: B-1fhvq
revision: 1
title: What v0.1.10 ships
question: The tag v0.1.10 is on v1/next's head, not on main, so its deploy stopped. Should main move up to the tag, or the tag move back to main?
answer: Move main up to the tag
response: accept
not_chosen:
  - Move the tag back to main
answered: 2026-11-10T21:02:44.975Z
answered_by: GusEllerm
topic: release/v0-1-10-contents
deck: branch-v1-next
level: hard
reverse: moderate
touches:
  - publishes
filed: 2026-11-10T21:02:27.206Z
filed_by: claude-code
branch: v1/next
---

# What v0.1.10 ships

The tag v0.1.10 is on v1/next's head, not on main, so its deploy stopped. Should main move up to the tag, or the tag move back to main?

**Decided:** Move main up to the tag, the agent's pick. Then main fast-forwards to 1edea8a, CI runs on it, and the deploy is run again: v0.1.10 ships the licence and the calibration fixes, and the service accepts cards that name their model.

**Not chosen:** Move the tag back to main. Then you delete the tag and tag 0c762c3 again (git push origin :v0.1.10, then git tag -f v0.1.10 0c762c3 and push it): v0.1.10 ships the licence alone, and the calibration fixes wait for v0.1.11.

**It turned on:** Should the calibration fixes go out today, with the licence? Today: Move main up to the tag. In the next release: Move the tag back to main.

**The fact given:** The tag points at 1edea8a, seven commits past main's 0c762c3: the calibration cards and the practice-card design, and the built B-k0w7d (a card's model), B-ab06a (preference-crux misses), B-jtsfh (one test both ways) and B-ew5e8 (the privacy page names the model). Typecheck and all unit, service and browser tests passed on them; CI hasn't run them on main, and no real harness session has recorded a model yet. Nothing was deployed: the deploy stopped at its first check.

**The agent's case:** Nothing gets deleted, the tag stays where you put it, and the service has to take the new model field before your CLI is rebuilt anyway; the deploy runs the full test suite again before it ships.

**Wrong if:** The model recording misbehaves in a real session after it ships. **To check:** The next card an agent files after the deploy: it should say its model on the reveal.

Answered by GusEllerm on 2026-11-10, through Baesian (card B-1fhvq, revision 1). Filed by claude-code on v1/next, in the deck “Decisions on v1/next”.

The record is in `.baesian/cards/B-1fhvq/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

`package.json` says 0.1.10 at 1edea8a too, so the deploy's version check passes either way. Practice cards (P19) and M10 aren't in either option: they're still being built and planned.
