---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "When a release changes a format: Old one for a release (B-4p43b)."
created: 2026-11-10
updated: 2026-11-10
tags:
  - baesian
  - decision
aliases:
  - B-4p43b
card: B-4p43b
revision: 2
title: When a release changes a format
question: After 1.0, does a release that changes a format write the new one at once, or keep writing the old one for a release so older Baesians keep working?
answer: Old one for a release
response: accept
not_chosen:
  - New one at once
answered: 2026-11-10T21:15:31.263Z
answered_by: GusEllerm
topic: release/v1/format-rollout
deck: release-v1
level: hard
reverse: moderate
touches:
  - schema
  - public-api
  - user-facing
filed: 2026-11-10T21:06:55.147Z
filed_by: claude-code
branch: v1/next
---

# When a release changes a format

After 1.0, does a release that changes a format write the new one at once, or keep writing the old one for a release so older Baesians keep working?

**Decided:** New one at once, the alternative. Then a release that adds format 2 writes it straight away: a machine, teammate or CI on the release before refuses the file by name and stops until upgraded (D157); the relay tells an older CLI to upgrade before it pulls.

**Not chosen:** Old one for a release, the agent's pick. Then a release that adds format 2 reads it but writes format 1; the next release writes 2; a machine, teammate or CI one release behind never meets a file it refuses, and the relay tells a CLI further behind to upgrade.

**It turned on:** Should anyone else's upgrade, the service's included, ever stop your Baesian until you upgrade too? (a preference) No, not within a release: Old one for a release. Yes, with a clear message: New one at once.

**The fact given:** D157: a file in a newer format than a Baesian reads is refused by name, and the command stops: the CLI, the commit gate, `baesian verify`. The service deploys from each release tag, so it's always the newest, and it writes verdicts, gate records, signatures and proofs that every linked machine pulls. Machines upload cards, ledger entries and merges their teammates pull. The CLI sends the relay no version today.

**Comment:** "Right now we are in what I would call rapid prototype. We can break things and not worry about supporting prior versions. If / once there are more users policy on this may change."

**The agent's case:** People upgrade one machine at a time; a release of overlap keeps a teammate's, CI's or the service's upgrade from stopping your commits, at the cost of each writer keeping one older format.

Answered by GusEllerm on 2026-11-10, through Baesian (card B-4p43b, revision 1). Filed by claude-code on v1/next, in the deck “Publishing v1: npm, the plugin, what v1 promises, and the formats review”. Context: [[Release v1]].

The record is in `.baesian/cards/B-4p43b/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Part of M10's plan, [[Release v1]], finding F2 of the formats review. Either way the relay learns each CLI's version (a header on every request) and answers one too old before it pulls, so a refusal comes as one message at the start of a sync rather than partway through. No format change is planned for 1.0 itself.

## Reopened on 2026-11-10

claude-code replied to the answer, once: "A check on your comment: B-h0vyy (answered 1.0.0) and B-4kj4d (Files, relay, and agents' commands) make the first npm release promise that every later 1.x reads all older files, with a format number and an upgrade for each change, and keeps agents' commands working. This answer only lets older Baesians break on newer files, which fits 1.0. If 'not worry about supporting prior versions' means newer releases needn't read older files either, B-h0vyy's alternative (0.2.0, 1.0 later) is the one that fits, and B-4kj4d waits for that 1.0. If 1.0.0 stands, nothing changes."

Until the card is answered again, this decision isn't in force.

## Changed on 2026-11-10

**Now:** Old one for a release, the agent's pick. **Was:** New one at once. Answered by GusEllerm.
