---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Where a repo's preferences are kept: Immutable files the client writes (B-refpb)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-refpb
card: B-refpb
revision: 1
title: Where a repo's preferences are kept
question: Should a repo's preferences live in the repo as files only the client writes, or on the hosted service with a signed copy in the repo?
answer: Immutable files the client writes
response: accept
not_chosen:
  - The hosted service holds them
answered: 2026-11-03T01:53:32.835Z
answered_by: Gus Ellerm
topic: routing/preference-storage
deck: routing
level: hard
reverse: moderate
touches:
  - schema
  - security
filed: 2026-11-03T01:38:36.142Z
filed_by: claude-code
branch: overnight/2026-11-03
---

# Where a repo's preferences are kept

Should a repo's preferences live in the repo as files only the client writes, or on the hosted service with a signed copy in the repo?

**Decided:** Immutable files the client writes, the agent's pick. Each change is a new file in the live layer and record, like a rule, written only by the client and signed by the service when hosted. Never in config.json. Works offline; history comes free.

**Not chosen:** The hosted service holds them. Preferences change only in a signed-in session on the website; the repo keeps a signed copy for offline use. The service becomes the authority for settings, unlike decisions (D127).

**It turned on:** Is a check inside the repo strong enough when agents make the commits? Yes, with signatures and verify: Immutable files the client writes. No, the root must be off the repo: The hosted service holds them.

**The fact given:** An agent can edit anything in the repo, including a policy file. Locally, only-the-client-resolves is a convention (D62). Hosted verdicts would carry the service's signature, checked offline against a key pinned in CI.

**First chose:** The hosted service holds them, then switched once the agent's pick was shown.

**The agent's case:** It mirrors how verdicts work under D127 and the hosted research's signing, so one trust model covers both, and the gate still runs offline.

**Wrong if:** An unsigned or agent-written preference file can pass baesian verify in hosted mode. **To check:** Write a preference file by hand on a branch of a hosted repo, then run baesian verify and the commit gate.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-refpb, revision 1). Filed by claude-code on overnight/2026-11-03, in the deck “Routing and preferences”.

The record is in `.baesian/cards/B-refpb/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Preferences decide what reaches you, so whoever can change them can hide decisions. The research found agents disabling oversight through a config file they could edit, if rarely, and coding-agent tools protecting their own config. Evidence: [[Preference Sliders and the Gate]], principle P10. Design: [[Routing and Preferences]], section 4.
