---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Whether vault notes can make rules: Only rules accepted in the client (B-qg3jx)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-qg3jx
card: B-qg3jx
revision: 1
title: Whether vault notes can make rules
question: Should the commit gate also take rules from notes in the vault, or only from rules you accept in the client, with the notes as a view of them?
answer: Only rules accepted in the client
response: accept
not_chosen:
  - A rule note in Rules/ is a rule
answered: 2026-11-03T04:06:37.958Z
answered_by: Gus Ellerm
topic: vault/rules-from-notes
deck: vault-adapter
level: hard
reverse: moderate
touches:
  - security
  - user-facing
filed: 2026-11-03T03:52:46.300Z
filed_by: claude-code
branch: v1/next
---

# Whether vault notes can make rules

Should the commit gate also take rules from notes in the vault, or only from rules you accept in the client, with the notes as a view of them?

**Decided:** Only rules accepted in the client, the agent's pick. Notes in Rules/ show the rules but don't make them. AGENTS.md points agents to the vault's routing notes, such as the Working Agreement, as guidance on when to file. A rule still starts as a card you accept.

**Not chosen:** A rule note in Rules/ is a rule. A note in Rules/ with covers patterns acknowledges matching gate facts like an accepted rule, so you can write a rule in Obsidian. So can anyone who commits to the repo, agents included.

**It turned on:** Should a note committed to the repo be able to change what the gate lets through, without an answer in the client? If it shouldn't: Only rules accepted in the client. If it should: A rule note in Rules/ is a rule.

**The fact given:** A rule's covers patterns make the gate acknowledge matching facts with no card (D24). Rules are saved only when you accept a draft in the client (D110), and preferences are files only the client writes (D147). The design says the adapter reads rules from Rules/ notes.

**The agent's case:** Only the client resolves (D32). A rule note any agent could commit would let it wave its own dependencies through, and D145's gate needs rules it can trust offline.

**Wrong if:** You want to write or change rules in Obsidian often enough that drafting each one through baesian rule is a burden. **To check:** How rules have been made so far: this repo has none yet, and D109 found people won't make the time to write rules well themselves.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-qg3jx, revision 1). Filed by claude-code on v1/next, in the deck “The vault adapter”. Context: [[Vault Adapter]], [[Baesian Design]].

The record is in `.baesian/cards/B-qg3jx/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The design's sentence predates D110, D145 and D147. Under the recommendation, "reads routing rules from the vault" becomes "points agents to them": the Working Agreement's prose informs filing, and the gate reads only the store's rules and, later, the preferences. See [[Vault Adapter#7. Reading rules and routing from the vault]].
