---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "The folder an attachment records: Drop the path (B-ct7f9)."
created: 2026-11-02
updated: 2026-11-02
tags:
  - baesian
  - decision
aliases:
  - B-ct7f9
card: B-ct7f9
revision: 1
title: The folder an attachment records
question: Should an attachment keep the full path of the folder the agent attached from?
answer: Drop the path
response: accept
not_chosen:
  - Keep the path
answered: 2026-11-02T03:39:01.924Z
answered_by: Gus Ellerm
topic: formats/attachment-folder
deck: file-formats
level: blocking
reverse: cheap
touches:
  - schema
filed: 2026-11-02T03:34:05.351Z
filed_by: claude-code
branch: main
---

# The folder an attachment records

Should an attachment keep the full path of the folder the agent attached from?

**Decided:** Drop the path, the agent's pick. An attachment records the card, the agent, the branch and the time. Nothing changes in use.

**Not chosen:** Keep the path. As now: each attachment also keeps the absolute path of the worktree, for anything that might later need to know which folder an agent worked in.

**It turned on:** Will anything need to know which folder an agent attached from, beyond its branch? No: the branch is enough: Drop the path. Yes: folders or machines will matter: Keep the path.

**The fact given:** An attachment is written when an agent waits on an existing card instead of filing a duplicate. It stays on this machine and is never committed. Nothing reads its folder path, and git won't check out one branch in two worktrees, so the branch already identifies the folder. Cards stopped recording their folder on 2026-11-01.

**The agent's case:** It's unread, the branch already identifies the worktree, and it matches what cards do. If machines ever matter, a machine name is its own decision.

Answered by Gus Ellerm on 2026-11-02, through Baesian (card B-ct7f9, revision 1). Filed by claude-code on main, in the deck “The remaining file formats, before 0.1.0”.

The record is in `.baesian/cards/B-ct7f9/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The path is absolute, so it includes the user's home folder. Since attachments never leave the machine, that isn't an exposure; the case for dropping it is only that nothing uses it.
