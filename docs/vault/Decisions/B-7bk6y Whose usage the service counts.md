---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "Whose usage the service counts: Every account, with an opt-out (B-7bk6y)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-7bk6y
card: B-7bk6y
revision: 1
title: Whose usage the service counts
question: Should the hosted service collect usage counts from every account by default, or only from people who opt in?
answer: Every account, with an opt-out
response: accept
not_chosen:
  - Only accounts that opt in
answered: 2026-11-03T01:47:55.420Z
answered_by: Gus Ellerm
topic: hosted/usage-data
deck: hosted
level: hard
reverse: moderate
touches:
  - security
  - user-facing
filed: 2026-11-03T01:37:27.600Z
filed_by: claude-code
branch: overnight/2026-11-03
---

# Whose usage the service counts

Should the hosted service collect usage counts from every account by default, or only from people who opt in?

**Decided:** Every account, with an opt-out, the agent's pick. Counts and timings only (never card text, topics, names or paths) from every account unless it opts out, under legitimate interests with a written balancing test. A public page lists every field.

**Not chosen:** Only accounts that opt in. Nothing is counted for analytics unless a person turns it on, as Go's toolchain does. Legally simplest and most trusted; far fewer accounts report, and those that do may not be typical.

**It turned on:** Do you need usage counts from nearly every account to monitor use, or is a smaller, self-selected sample enough? (a preference) Nearly every account: Every account, with an opt-out. A sample is enough: Only accounts that opt in.

**The fact given:** You chose to host centrally partly to monitor usage (D129). To work at all, the relay sees some metadata: when cards arrive, their sizes, and which account answers. Under GDPR, counting by default would most likely rest on legitimate interests, which needs a balancing test and an opt-out; opt-in rests on consent. Go's toolchain keeps telemetry local unless the user opts in to upload.

**The agent's case:** D129's monitoring needs coverage, and the counts are mostly metadata the relay already handles in order to run.

**Wrong if:** Outside users object to being counted by default, or every question the monitoring must answer can be answered from metadata the relay keeps anyway. **To check:** List the questions the monitoring must answer, and check each against what the relay sees in order to work.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-7bk6y, revision 1). Filed by claude-code on overnight/2026-11-03, in the deck “The hosted service”.

The record is in `.baesian/cards/B-7bk6y/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

What the service collects needs a privacy policy before anything is published, and D129 leaves it to the user. [[Hosted Service]], section 6, lists what would be counted and what must never be. This card is only about whose usage is counted by default. See also [[Hosted Service - Strand B5 Prior Art and Security]], F20 and F21.
