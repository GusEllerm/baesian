---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Who hears a verdict when sessions share a branch: Every session hears it, once (B-ghhym)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-ghhym
card: B-ghhym
revision: 1
title: Who hears a verdict when sessions share a branch
question: When two sessions of an agent work on one branch, which of them should hear a new verdict?
answer: Every session hears it, once
response: accept
not_chosen:
  - Only the session that filed the card
answered: 2026-11-03T01:58:23.803Z
answered_by: Gus Ellerm
topic: inbox/sessions-on-a-branch
deck: stability
level: provisional
reverse: cheap
touches:
  - schema
  - public-api
filed: 2026-11-02T22:16:35.724Z
filed_by: claude-code
branch: overnight/2026-11-03
---

# Who hears a verdict when sessions share a branch

When two sessions of an agent work on one branch, which of them should hear a new verdict?

**Decided:** Every session hears it, once, the agent's pick. Then each session keeps its own place in the inbox (cursors/<branch>/<session>.json), starting from the branch's; the plugin's hooks pass the harness's session id with a new `baesian inbox --session`. No card field changes.

**Not chosen:** Only the session that filed the card. Then cards record the filing session (a new source_session field), and each session hears only its own cards' verdicts; a card filed outside a session goes to whoever reads first, as today.

**It turned on:** Should a session hear verdicts on cards another session filed on the same branch? If it should: Every session hears it, once. If it shouldn't: Only the session that filed the card.

**The fact given:** Today the first session to read the branch's inbox takes every new verdict, so the other never hears of them. Sessions on one branch share a worktree, so either may build on the other's decisions. The plugin's hooks get the session id from both Claude Code and Codex; the agent's own commands don't reliably have it.

**First chose:** Only the session that filed the card, then switched once the agent's pick was shown.

**The agent's case:** Either session may have built on the decision, so telling each once is the safe default, and it needs no new card field. A verdict `wait` handed over stays handed over for every session.

**Wrong if:** sessions on one branch work on unrelated tasks and act on verdicts meant for the other. **To check:** how often two sessions share a branch in dogfooding, and whether either acted on the other's card.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-ghhym, revision 1). Filed by claude-code on overnight/2026-11-03, in the deck “Stability before v1”.

The record is in `.baesian/cards/B-ghhym/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Found while answering what's left for v1 (2026-11-02). A new session starts from the branch's place, which is the newest any session has read, so it isn't flooded with old verdicts. A plain `baesian inbox`, with no session, reads the branch's place as before.
