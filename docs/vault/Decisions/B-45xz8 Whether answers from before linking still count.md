---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Whether answers from before linking still count: They count as they are (B-45xz8)."
created: 2026-11-04
updated: 2026-11-04
tags:
  - baesian
  - decision
aliases:
  - B-45xz8
card: B-45xz8
revision: 1
title: Whether answers from before linking still count
question: When a repo is linked to the service, should the answers already in its record keep counting as they are, or count once you vouch for them with your passkey?
answer: They count as they are
response: accept
not_chosen:
  - You vouch for them once
answered: 2026-11-04T15:52:17.310Z
answered_by: Gus Ellerm
topic: hosted/pre-link-answers
deck: hosted
level: hard
reverse: moderate
touches:
  - security
  - schema
  - user-facing
filed: 2026-11-04T15:45:50.562Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-sar41 What makes an answer count in a hosted repo|B-sar41]]"
  - "[[B-w4g6c Whether changing a repo's service address is a gate fact|B-w4g6c]]"
  - "[[B-5gnea What ties a copy of a repo to its project|B-5gnea]]"
---

# Whether answers from before linking still count

When a repo is linked to the service, should the answers already in its record keep counting as they are, or count once you vouch for them with your passkey?

**Decided:** They count as they are, the agent's pick. A person-written file already in the record at the commit that linked the repo counts without the service's signature; anything added later needs one (D138). baesian verify finds that commit in the config's history, so CI needs full history.

**Not chosen:** You vouch for them once. Approving the link shows how many answers, rules and preference files the record holds, and your passkey signs a list of their digests, kept in the record. Listed files count; nothing else unsigned does. Works with any checkout depth.

**It turned on:** Is a passkey tap at linking worth a record that says you accepted the repo's earlier answers? (a preference) No, the record is enough: They count as they are. Yes: You vouch for them once.

**The fact given:** In a hosted repo, a file a person writes counts only with the service's signature (D138). As built (M9a), that applies to old files too: linking this repo now would make the answers on its 112 cards stop counting, so they'd show as open again. Before linking, answers are trusted by convention and their audit trail (D62); nothing tells a person's from an agent's. Linking changes the committed config, a gate fact (B-w4g6c). Finding the linking commit needs git history back to it; CI checkouts are often shallow by default.

**The agent's case:** Answers from before linking were trusted under D62 when they were given, and they're in git history with the commits that cited them. Counting them as they are keeps linking a one-step change and asks nothing of you; vouching for a list you can't review adds a tap without adding a check.

**Wrong if:** CI checkouts can't reach the linking commit, so verify fails or skips old answers, or a repo's history before linking holds answers nobody gave. **To check:** Link this repo in dogfooding, run baesian verify in CI as it's set up, and check every old card still reads as answered.

Answered by Gus Ellerm on 2026-11-04, through Baesian (card B-45xz8, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-45xz8/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Found while planning M9d: [[Formats for v1]] section 7 and M9a decided what counts in a hosted repo, but not what happens to a repo that was used locally before it was linked, which is every repo that adopts the service, this one included.

**The proposal in more detail.** `Store.judge` would count an unsigned verdict, rule, retirement, topic merge or preference file when it was in the record at the first commit whose config names the project. On your machine, the store finds that commit with `git log` on `.baesian/config.json`. In CI, `baesian verify` does the same; a checkout without that commit fails with a message saying to fetch the full history (GitHub's checkout action fetches one commit unless told `fetch-depth: 0`, the agent's knowledge, *unverified* here).

**The alternative in more detail.** A new signed file, say `trust/history.json`: the digests of the record's person-written files at linking, with your passkey's proof over the list, written by the relay when you approve the link. It's a new file kind and a new check in verify.

**Not proposed:** letting old answers stop counting. The website would show every card answered before linking as waiting, and commits that cite them would fail verify.
