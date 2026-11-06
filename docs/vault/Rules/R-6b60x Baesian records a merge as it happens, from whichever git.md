---
type: rule
format: 1
status: active
authority: specifies
livedocs: snapshot
summary: Baesian records a merge as it happens, from whichever git event shows it (a merge, a fast-forward, a rebase, a push to the default branch); it reads one from git's history afterwards only where no hook could have seen it.
created: 2026-11-06
updated: 2026-11-06
tags:
  - baesian
  - rule
aliases:
  - R-6b60x
rule: R-6b60x
topic: conventions/gate/b-w41p7
from_card: B-qfdga
accepted_by: GusEllerm
accepted: 2026-11-06T02:47:24.884Z
---

# Baesian records a merge as it happens, from whichever git…

> Baesian records a merge as it happens, from whichever git event shows it (a merge, a fast-forward, a rebase, a push to the default branch); it reads one from git's history afterwards only where no hook could have seen it.

Accepted by GusEllerm on 2026-11-06, from the decision B-qfdga. It covers no gate facts: it's shown beside the cards on its topic, conventions/gate/b-w41p7.

The rule is in `.baesian/rules/R-6b60x.md`. Editing this note changes no rule: a rule is made by accepting a draft in the Baesian client, and retired by an answer there.
