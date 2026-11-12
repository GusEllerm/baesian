---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "What the first release with members includes: Once the CLI and privacy policy are done (B-av0wb)."
created: 2026-11-12
updated: 2026-11-12
tags:
  - baesian
  - decision
aliases:
  - B-av0wb
card: B-av0wb
revision: 1
title: What the first release with members includes
question: Should the first release that lets a project have members go out once the CLI and the privacy policy are done, or wait until a member can also raise a different answer?
answer: Once the CLI and privacy policy are done
response: accept
not_chosen:
  - Wait for raising a different answer
answered: 2026-11-12T14:39:54.841Z
answered_by: GusEllerm
topic: reviewers/first-release
deck: reviewers-joining
level: hard
reverse: cheap
touches:
  - user-facing
  - publishes
filed: 2026-11-12T14:37:30.711Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-v43z8 What a second person's different answer does|B-v43z8]]"
  - "[[B-tzdjn Who's told when a card comes in|B-tzdjn]]"
---

# What the first release with members includes

Should the first release that lets a project have members go out once the CLI and the privacy policy are done, or wait until a member can also raise a different answer?

**Decided:** Once the CLI and privacy policy are done, the agent's pick. Then members are released after two more steps, and raising a different answer follows in a release of its own. Until then, a member who would have answered a decided card differently is told who decided and what they chose, and takes it up with them outside Baesian.

**Not chosen:** Wait for raising a different answer. Then nothing with members is released until three more steps are done, the third being the largest. The first release then has everything the ten cards decided, with a difference between two members carried by Baesian from the start.

**It turned on:** Is a release where two people can share a project, but can't yet raise a difference in Baesian, worth having sooner? (a preference) If it is: Once the CLI and privacy policy are done. If it isn't: Wait for raising a different answer.

**The fact given:** Built and unreleased, a project can have members, each card is sent to one of them and open to all, and the website shows it. Three steps are left. The CLI and the plugin say "the reviewer" throughout and don't name who answered. The privacy policy doesn't yet say that members see each other's handles, answers and whether they're at the desk; any release with members needs both of those. The third step is answering a decided card yourself, blind, and raising a difference as a card someone settles (B-v43z8); it's the largest, and needs cards of its own on who may settle and how that card reads. Without it, a second member's answer on a decided card is refused and never written, and their desk says who decided and what they chose. Either way the release changes each project's tables as it wakes, so a fix after it goes forward as a new release, as with 1.0.2.

**The agent's case:** Two people sharing a project is the part that changes what Baesian is for, and it's whole without the third step. Nothing is lost or written wrongly in the meantime, since the relay refuses the second answer and says so. The third step is the one the research had least to say about, so it would be better designed after two people have used a project and differences have come up for real. A smaller release is also easier to put right if something is wrong in it.

Answered by GusEllerm on 2026-11-12, through Baesian (card B-av0wb, revision 1). Filed by claude-code on v1/next, in the deck “Several reviewers: who's told, who joins, who's trusted”. Context: [[Several Reviewers]], [[Several Reviewers - Research]].

The record is in `.baesian/cards/B-av0wb/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The order of the work is the same either way: the CLI and the plugin next, then the privacy policy's lines as a card. This only decides whether a release comes before or after the step on differing answers.
