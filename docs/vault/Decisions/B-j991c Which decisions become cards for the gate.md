---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Which decisions become cards for the gate: Keep D11's filing rule (B-j991c)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-j991c
card: B-j991c
revision: 1
title: Which decisions become cards for the gate
question: Should agents keep filing only what D11 routes to a card, or file a card for every decision so the gate can hold back, raise or audit any of them?
answer: Keep D11's filing rule
response: accept
not_chosen:
  - File every decision
answered: 2026-11-03T01:54:57.446Z
answered_by: Gus Ellerm
topic: routing/filing-threshold
deck: routing
level: blocking
reverse: moderate
filed: 2026-11-03T01:38:35.700Z
filed_by: claude-code
branch: overnight/2026-11-03
---

# Which decisions become cards for the gate

Should agents keep filing only what D11 routes to a card, or file a card for every decision so the gate can hold back, raise or audit any of them?

**Decided:** Keep D11's filing rule, the agent's pick. Agents file as today. The gate can lower what reaches you and raise filed cards, but kinds with no fact stay unasked, and two-way doors stay one-line logs outside v1's audits.

**Not chosen:** File every decision. Agents file a card for two-way doors too, so any kind can be raised and every call audited. Revises D11. Agents write far more cards, and the record grows.

**It turned on:** Do you want to be able to raise kinds of decision that have no fact today, such as tooling choices or local refactors? (a preference) Not in v1: Keep D11's filing rule. Yes: File every decision.

**The fact given:** A gate sees only filed cards. Under D11, two-way doors are logged as a one-line reason or an ack, with no options to audit. D126 describes audit cards as a sample of those calls.

**First chose:** File every decision, then switched once the agent's pick was shown.

**The agent's case:** Held-back cards already give audits real options; filing everything multiplies the agent's work before there's evidence it's needed.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-j991c, revision 1). Filed by claude-code on overnight/2026-11-03, in the deck “Routing and preferences”.

The record is in `.baesian/cards/B-j991c/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The user's current view is that agents file every card they normally would and the gate decides which reach you. That means the gate can only lower what D11 already files. Raising a kind nobody files needs agents to file it, or an independent source such as the later after-the-fact reviewer. Design: [[Routing and Preferences]], section 3. Evidence: [[Preference Sliders and the Gate]], section 5 ("What the gate can't see").
