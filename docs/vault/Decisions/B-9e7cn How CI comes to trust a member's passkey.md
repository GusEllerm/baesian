---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How CI comes to trust a member's passkey: Added to CI's settings by hand (B-9e7cn)."
created: 2026-11-11
updated: 2026-11-11
tags:
  - baesian
  - decision
aliases:
  - B-9e7cn
card: B-9e7cn
revision: 1
title: How CI comes to trust a member's passkey
question: Should a new member's hard answers count in CI once an owner's passkey vouches for them, or only once their passkey is added to CI's settings by hand?
answer: Added to CI's settings by hand
response: accept
not_chosen:
  - An owner's passkey vouches
answered: 2026-11-11T18:13:03.421Z
answered_by: GusEllerm
topic: reviewers/member-passkeys
deck: reviewers-joining
level: hard
reverse: moderate
touches:
  - security
filed: 2026-11-11T18:10:44.921Z
filed_by: claude-code
branch: v1/next
---

# How CI comes to trust a member's passkey

Should a new member's hard answers count in CI once an owner's passkey vouches for them, or only once their passkey is added to CI's settings by hand?

**Decided:** Added to CI's settings by hand, the agent's pick. Then nothing new is trusted: each member's passkey gets a line in CI's pin, as the owner's has now, set by someone with rights over the repo. `baesian ci` prints and sets it. Until then CI fails on that passkey, saying how to fix it.

**Not chosen:** An owner's passkey vouches. CI pins only the owners' passkeys. A member's counts when the record holds a file adding them that an owner's passkey proved. Joining needs no change to CI; a new signed file and a new check in `baesian verify` are built.

**It turned on:** Is changing CI's settings each time someone joins a price worth paying to trust nothing new? (a preference) Yes: by hand: Added to CI's settings by hand. No: an owner vouches: An owner's passkey vouches.

**The fact given:** A hard answer counts in CI only if the passkey that proved it is in CI's pin (BAESIAN_TRUST), one line per passkey, which `baesian ci --github` sets. Today a passkey in the record that isn't pinned fails `baesian verify`, with a message saying to add its line, or to find out who added it: the guard against the service, or anyone who gets into it, adding a passkey. By hand, every join and every new passkey needs that command run by someone with rights over the repo's settings, and CI is red until it is. With an owner vouching, a join is one tap of an owner's passkey; what CI trusts then rests on the owners' passkeys and on new checking code, and an owner's stolen passkey could add a member, as well as answer.

**First chose:** An owner's passkey vouches, then switched once the agent's pick was shown.

**The agent's case:** For a few developers, people join a handful of times, and the step is one command the owner has already run once. It adds no format and no code to the part of Baesian that decides what counts, which is the last place to move fast. The chain can come when a team is big enough to feel the friction.

**Wrong if:** a member's passkey comes to count in CI without someone with rights over the repo having acted. **To check:** the test that a passkey in the record and not in the pin fails verify still passes, with a member's passkey.

Answered by GusEllerm on 2026-11-11, through Baesian (card B-9e7cn, revision 1). Filed by claude-code on v1/next, in the deck “Several reviewers: who's told, who joins, who's trusted”. Context: [[Several Reviewers]], [[Several Reviewers - Research]].

The record is in `.baesian/cards/B-9e7cn/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Without a pin (a repo that hasn't set BAESIAN_TRUST), a passkey counts when the service signed its key file, as now; this card is about pinned CI, which is what `baesian ci` sets up.
