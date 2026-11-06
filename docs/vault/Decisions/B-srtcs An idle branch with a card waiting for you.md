---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "An idle branch with a card waiting for you: Stays at the top while held (B-srtcs)."
created: 2026-11-06
updated: 2026-11-06
tags:
  - baesian
  - decision
aliases:
  - B-srtcs
card: B-srtcs
revision: 1
title: An idle branch with a card waiting for you
question: Should a branch whose merge a card waiting for you holds stay among the drawer's Now tags however long it's been idle?
answer: Stays at the top while held
response: accept
not_chosen:
  - Idle after a day, as now
answered: 2026-11-06T02:43:08.630Z
answered_by: GusEllerm
topic: client/branches/idle-held
deck: branches-view
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-05T23:54:26.626Z
filed_by: claude-code
branch: worktree-wf_7ec3a0ab-1e8-8
---

# An idle branch with a card waiting for you

Should a branch whose merge a card waiting for you holds stay among the drawer's Now tags however long it's been idle?

**Decided:** Stays at the top while held, the agent's pick. A branch with a card waiting for you keeps its Now tag however long it's idle; one with every card answered moves its end down after a day, as now. The Now row names its day when it isn't the newest shown.

**Not chosen:** Idle after a day, as now. After 24 hours with nothing on it, a branch's end moves to just above its last event, held or not, and its column is freed; the Now row says only the time.

**It turned on:** Should what's waiting for you stay at the top however old it is? (a preference) Yes: Stays at the top while held. No: the top is for what's moving: Idle after a day, as now.

**The fact given:** Three days on, the e2e history's feat/catalog (Merge held: 1 waiting) has no Now tag; its end is down at Thursday's rows, and its held state shows at the top only in the opening sentence ('One card is waiting for you, holding feat/catalog from merging') and the waiting card's detail, which opens as the drawer opens. The Now row reads 'Now, 16:26' above 'Thu 5 Nov' on a Sunday.

**The agent's case:** A held merge is the one thing a reviewer can unblock; the top is where they look.

Answered by GusEllerm on 2026-11-06, through Baesian (card B-srtcs, revision 1). Filed by claude-code on worktree-wf_7ec3a0ab-1e8-8, in the deck “The branches panel, redrawn”.

The record is in `.baesian/cards/B-srtcs/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

From the sweep's finding IF-19 (a choice: the spec and Client Build item 26 move an idle branch's end regardless of waiting cards). Not built in the sweep. (The sweep fixed the bug beside it, IF-5: such a branch's end row was missing while the Commits switch was off.)
