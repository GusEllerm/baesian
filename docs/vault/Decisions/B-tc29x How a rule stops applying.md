---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How a rule stops applying: A box when you answer (B-tc29x)."
created: 2026-11-02
updated: 2026-11-02
tags:
  - baesian
  - decision
aliases:
  - B-tc29x
card: B-tc29x
revision: 1
title: How a rule stops applying
question: When one of your rules turns out wrong or outdated, where do you retire it?
answer: A box when you answer
response: accept
not_chosen:
  - A list of your rules
answered: 2026-11-02T03:37:43.282Z
answered_by: Gus Ellerm
topic: formats/rule-retirement
deck: file-formats
level: blocking
reverse: cheap
touches:
  - schema
  - user-facing
filed: 2026-11-02T03:34:04.688Z
filed_by: claude-code
branch: main
---

# How a rule stops applying

When one of your rules turns out wrong or outdated, where do you retire it?

**Decided:** A box when you answer, the agent's pick. On a card whose option breaks one of your rules, the reveal offers "Retire this rule", as it offers "Make this a rule". To retire any other rule, you ask an agent to file a card that breaks it.

**Not chosen:** A list of your rules. The client's menu gains a panel listing your rules, each with a retire action, so you can retire one whenever you look them over.

**It turned on:** Where will you usually notice that a rule is wrong? While answering a card that runs into it: A box when you answer. While looking over my rules: A list of your rules.

**The fact given:** Rules are saved once and never edited, and nothing can retire one yet: a rule's patterns keep approving matching changes at the commit gate for good. Today your rules appear only beside a card that cites them ("may break it"); the client has no list of them. Either way, retiring writes a new file beside the rule, and replacing a rule means retiring it and making a new one.

**First chose:** A list of your rules, then switched once the agent's pick was shown.

**The agent's case:** It reuses the box you already tick to make a rule, ties each retirement to the decision that showed the rule wrong, and keeps the client from growing a management screen. Retiring only makes the gate stricter, so one tick is enough.

Answered by Gus Ellerm on 2026-11-02, through Baesian (card B-tc29x, revision 1). Filed by claude-code on main, in the deck “The remaining file formats, before 0.1.0”.

The record is in `.baesian/cards/B-tc29x/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Rules arrived with "Make this a rule": you tick a box when you answer, the agent drafts the rule, and you confirm the draft as a card. A rule's `covers` patterns (such as `dep:pytest-*`) make the commit gate acknowledge matching changes by itself.

The format either way: `rules/<id>-retired.json`, with who retired it, when, and the card it was retired on, if any. The gate and the client skip a retired rule; the rule file stays in the record.

Retiring a rule automatically whenever you choose an option that breaks it was set aside: choosing against a rule once is often an exception, not a change of rule.
