---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Where people report a security problem: security@baesian.dev (B-480t1)."
created: 2026-11-10
updated: 2026-11-10
tags:
  - baesian
  - decision
aliases:
  - B-480t1
card: B-480t1
revision: 1
title: Where people report a security problem
question: "Where do people report a security problem in Baesian or baesian.dev: GitHub's private reporting, or an email address?"
answer: security@baesian.dev
response: alternative
not_chosen:
  - GitHub's private reporting
answered: 2026-11-10T21:10:39.292Z
answered_by: GusEllerm
topic: release/docs/security-contact
deck: release-v1
level: hard
reverse: cheap
touches:
  - security
  - publishes
  - user-facing
filed: 2026-11-10T21:07:26.187Z
filed_by: claude-code
branch: v1/next
---

# Where people report a security problem

Where do people report a security problem in Baesian or baesian.dev: GitHub's private reporting, or an email address?

**Decided:** security@baesian.dev, the alternative. Then a SECURITY.md gives security@baesian.dev, forwarded to you by Email Routing as privacy@ is (B-8xxrc); a reporter needs no GitHub account, and you keep track of reports yourself.

**Not chosen:** GitHub's private reporting, the agent's pick. Then you turn on private vulnerability reporting for GusEllerm/baesian; a SECURITY.md says what to report there, which releases are supported, and how soon you reply; reports and fixes stay in GitHub's advisories.

**It turned on:** Should someone without a GitHub account be able to report one easily? (a preference) Not needed: GitHub's private reporting. Yes: security@baesian.dev.

**The fact given:** There's no SECURITY.md today. The repo is public (D182); the service holds accounts, passkeys and cards. privacy@baesian.dev is forwarded to you by Cloudflare's Email Routing (B-8xxrc). GitHub's private reporting needs the reporter to have a GitHub account, and gives each report a private thread and a draft advisory.

**The agent's case:** Baesian's users are developers on GitHub already, and an advisory there ties a report to its fix; one place, and nothing new to run.

**Wrong if:** Reports come from people outside GitHub, or one sits unread. **To check:** The repo's Security tab and the forwarded mailbox, in the months after the release.

Answered by GusEllerm on 2026-11-10, through Baesian (card B-480t1, revision 1). Filed by claude-code on v1/next, in the deck “Publishing v1: npm, the plugin, what v1 promises, and the formats review”. Context: [[Release v1]].

The record is in `.baesian/cards/B-480t1/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Part of M10's plan, [[Release v1]], section "The docs".
