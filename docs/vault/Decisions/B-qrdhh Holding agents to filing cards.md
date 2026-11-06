---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Holding agents to filing cards: Check as the agent acts (B-qrdhh)."
created: 2026-11-06
updated: 2026-11-06
tags:
  - baesian
  - decision
aliases:
  - B-qrdhh
card: B-qrdhh
revision: 2
title: Holding agents to filing cards
question: How should Baesian hold agents to filing cards, when a decision could be made silently or put to the reviewer in chat?
answer: Check as the agent acts
response: accept
not_chosen:
  - Check at the commit
answered: 2026-11-06T03:18:45.219Z
answered_by: GusEllerm
topic: agents/when-to-file
deck: branch-v1-next
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-06T03:04:46.409Z
filed_by: claude-code
branch: v1/next
---

# Holding agents to filing cards

How should Baesian hold agents to filing cards, when a decision could be made silently or put to the reviewer in chat?

**Decided:** Check as the agent acts, the agent's pick. Then the plugin's hooks send the agent back to file a card when its last message asks you to choose or it opens its question tool; edits to paths the repo calls user-facing get a one-line reminder. Commits don't change.

**Not chosen:** Check at the commit. Then the gate gains a user-facing detector for paths the repo declares: a commit changing them needs a card, a rule or an ack with its reason, as a dependency does. Nothing checks the conversation.

**It turned on:** Which miss costs you more: a choice asked in chat, or an interface change made without a card? (a preference) A choice asked in chat: Check as the agent acts. A silent interface change: Check at the commit.

**The fact given:** No product surveyed relies on instructions for what must happen every time; each checks at the action (LangGraph, OpenAI's Agents SDK, Copilot). Claude Code's docs call CLAUDE.md advice and say a rule that must hold belongs in a hook. In Anthropic's study of 500k sessions, 35% of Claude's own stops offer the user a choice of approaches. A hook at the turn's end can read that message and send the agent back; a gate sees only what's committed, and interface changes only by path.

**First chose:** Check at the commit, then switched once the agent's pick was shown.

**The agent's case:** Both kinds of miss this week began in the conversation, where only a hook sees them; a reminder on user-facing edits covers silent changes without an ack on every interface commit. A gate detector can follow if a merge-time review shows silent changes keep happening.

Answered by GusEllerm on 2026-11-06, through Baesian (card B-qrdhh, revision 2). Filed by claude-code on v1/next, in the deck “Decisions on v1/next”.

The record is in `.baesian/cards/B-qrdhh/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The research is in [[Holding Agents to Filing Cards]].

**The proposal, in parts.** A Stop hook in the plugin reads the agent's last message: a cheap pattern check, then, only if it fires, a model's judgement ("does this ask the person to choose?"), and it sends the agent back once with "file this as a card". A PreToolUse hook on the question tool does the same for structured questions. A PreToolUse hook on edits to paths the repo lists as user-facing adds a one-line reminder and never blocks. Codex has the Stop and tool hooks but no model judgement, so there it's the pattern check only.

**Costs and risks.** A model call when the pattern fires; occasional false alarms, which the judge can wave through; reports (unverified) that hooks on the question tool misbehave in the VS Code extension, to be tested before relying on them. Claude Code's docs advise keeping the enforced set small.

**Either way.** "Text spans its container", said in chat and kept only in the lead agent's private memory, goes to you as a rule. When you're in the conversation, an agent says "it's in your deck" rather than listing the options, which would unblind the card. Whether an answer you've already given in chat can be filed as a card marked not blind is its own question (D32, calibration), to follow as a card.
