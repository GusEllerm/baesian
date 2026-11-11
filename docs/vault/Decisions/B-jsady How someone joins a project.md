---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How someone joins a project: A link the owner sends (B-jsady)."
created: 2026-11-11
updated: 2026-11-11
tags:
  - baesian
  - decision
aliases:
  - B-jsady
card: B-jsady
revision: 1
title: How someone joins a project
question: Does a teammate join a project by a link its owner sends them, or by asking from their clone, for an owner to approve?
answer: A link the owner sends
response: accept
not_chosen:
  - Asking from their clone
answered: 2026-11-11T18:13:45.050Z
answered_by: GusEllerm
topic: reviewers/joining
deck: reviewers-joining
level: hard
reverse: cheap
touches:
  - user-facing
  - security
filed: 2026-11-11T18:10:48.516Z
filed_by: claude-code
branch: v1/next
---

# How someone joins a project

Does a teammate join a project by a link its owner sends them, or by asking from their clone, for an owner to approve?

**Decided:** A link the owner sends, the agent's pick. Then an owner makes a link on the project's page: good once, for seven days. The teammate opens it signed in, joins, and `baesian login` then works from their clone. The owner sees who joined, and can remove them. No address is kept.

**Not chosen:** Asking from their clone. Then a teammate runs `baesian login` in their clone, which asks to join. The project's owners see who is asking, by handle, and one approves with their passkey. Nothing is passed around; anyone who has the project's ID can ask.

**It turned on:** Should joining start with the owner, or with the person who wants to join? (a preference) With the owner: A link the owner sends. With the person joining: Asking from their clone.

**The fact given:** Today `baesian login` in a clone of someone else's project is refused: it 'belongs to another account'. A project's ID is in `.baesian/config.json`, committed with the repo, so for a public repo, as Baesian's own is, anyone can read it; sign-up on baesian.dev is open. With a link, whoever holds it can join, once, until it expires; the owner sends it however they like, and the service keeps no address. With asking, an owner approves a named account each time, and strangers can ask too, within the service's limits on requests.

**The agent's case:** An invitation is something an owner does on purpose, for someone they chose. Asking turns every public project into a place strangers can put requests, and makes approving a habit. A link that works once and expires is a small exposure, and the owner sees at once who used it.

**Wrong if:** someone joins a project that no owner meant to add. **To check:** tests that a link works once and not after it expires, and that a removed member can no longer read the project.

Answered by GusEllerm on 2026-11-11, through Baesian (card B-jsady, revision 1). Filed by claude-code on v1/next, in the deck “Several reviewers: who's told, who joins, who's trusted”. Context: [[Several Reviewers]], [[Several Reviewers - Research]].

The record is in `.baesian/cards/B-jsady/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Either way a member joins with their own account and passkey, and their machine signs in to the project as theirs, which is how the relay knows whose agent filed a card.
