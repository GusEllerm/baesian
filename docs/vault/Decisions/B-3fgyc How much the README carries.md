---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How much the README carries: A front page, and a setup guide (B-3fgyc)."
created: 2026-11-06
updated: 2026-11-06
tags:
  - baesian
  - decision
aliases:
  - B-3fgyc
card: B-3fgyc
revision: 1
title: How much the README carries
question: Should the README hold every setup detail, folded, or be a short front page with the details in a setup guide beside it?
answer: A front page, and a setup guide
response: accept
not_chosen:
  - Everything in the README, folded
answered: 2026-11-06T19:46:16.138Z
answered_by: GusEllerm
topic: docs/readme/scope
deck: branch-v1-next
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-06T19:45:38.214Z
filed_by: claude-code
branch: v1/next
---

# How much the README carries

Should the README hold every setup detail, folded, or be a short front page with the details in a setup guide beside it?

**Decided:** A front page, and a setup guide, the agent's pick. Then the README is about 1,100 words: what it is, the demo, how it works, why choose first and why git, the main setup steps; personal mode, CI, the CLI's output and merge recording move to docs/setup.md, linked.

**Not chosen:** Everything in the README, folded. Then the README keeps every detail, with personal mode, CI, the harnesses and the CLI's output in expandable sections; one page to read or search, about as long as today when unfolded.

**It turned on:** Should a reader find every setup detail without leaving the README? (a preference) No: a front page: A front page, and a setup guide. Yes: one page: Everything in the README, folded.

**The fact given:** Today's README is about 2,000 words and 7.5 screens on a desktop; 'Set it up' starts after 5 screens. The admired READMEs surveyed (Posting, VHS, uv, zoxide) keep the front page short and link out or fold side paths. Folded sections show only their titles until opened, and GitHub's search finds text in them; a separate file needs a click.

**First chose:** Everything in the README, folded, then switched once the agent's pick was shown.

Answered by GusEllerm on 2026-11-06, through Baesian (card B-3fgyc, revision 1). Filed by claude-code on v1/next, in the deck “Decisions on v1/next”.

The record is in `.baesian/cards/B-3fgyc/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

From three reviews of the README. Both options share the visual changes: a centred wordmark and pitch, the GIF beside the phone, a four-step "how it works", cropped and captioned figures, and setup in numbered steps.
