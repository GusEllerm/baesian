---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Seen answers in the usage counts: No blind match for it (B-nxhtx)."
created: 2026-11-06
updated: 2026-11-06
tags:
  - baesian
  - decision
aliases:
  - B-nxhtx
card: B-nxhtx
revision: 1
title: Seen answers in the usage counts
question: How should the service's usage counts record an answer to a card you'd already answered in chat?
answer: No blind match for it
response: accept
not_chosen:
  - Record that it was seen
answered: 2026-11-06T04:50:53.466Z
answered_by: GusEllerm
topic: hosted/usage/seen-answers
deck: branch-v1-next
level: hard
reverse: cheap
touches:
  - privacy
  - user-facing
filed: 2026-11-06T04:26:32.251Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-hswmx A choice answered in chat|B-hswmx]]"
  - "[[B-7nq85 The fields each usage event records|B-7nq85]]"
---

# Seen answers in the usage counts

How should the service's usage counts record an answer to a card you'd already answered in chat?

**Decided:** No blind match for it, the agent's pick. Then the 'card answered' event for a seen card leaves out blind_match, and the public page says so; nothing new is recorded.

**Not chosen:** Record that it was seen. Then the event gains a yes/no field, answered in chat first, listed on the public page, so the counts show how often answers come from chat; blind_match is left out for them too.

**It turned on:** Do the usage counts need to show how often you answer in chat? (a preference) No: No blind match for it. Yes: Record that it was seen.

**The fact given:** B-7nq85 fixed the usage events' fields as a public list (blind_match: whether your choice before the agent's pick was shown matched it). A seen card has no blind choice, so today its answer is recorded with blind_match false, as if you'd disagreed blind. D141: counts come from every account, with an opt-out, and the page lists every field.

**First chose:** Record that it was seen, then switched once the agent's pick was shown.

**Wrong if:** Deciding Baesian's direction later needs to know how often answers came from chat and the counts can't say. **To check:** service/src/relay.ts (the answered event) and src/usage-fields.ts (the public list).

Answered by GusEllerm on 2026-11-06, through Baesian (card B-nxhtx, revision 1). Filed by claude-code on v1/next, in the deck “Decisions on v1/next”.

The record is in `.baesian/cards/B-nxhtx/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Until this is decided, a seen card's answer counts as a blind miss in the usage counts. Nothing is built for either option.
