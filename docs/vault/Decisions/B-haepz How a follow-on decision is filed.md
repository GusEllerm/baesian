---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How a follow-on decision is filed: A topic of its own (B-haepz)."
created: 2026-11-01
updated: 2026-11-01
tags:
  - baesian
  - decision
aliases:
  - B-haepz
card: B-haepz
revision: 1
title: How a follow-on decision is filed
question: How should an agent file a decision that follows on from another on the same subject?
answer: A topic of its own
response: accept
not_chosen:
  - Share the topic, as a card that builds on it
answered: 2026-11-01T20:53:31.001Z
answered_by: Gus Ellerm
topic: filing/follow-ons
deck: dogfooding
level: blocking
reverse: moderate
touches:
  - public-api
filed: 2026-11-01T20:48:53.454Z
filed_by: claude-code
branch: main
---

# How a follow-on decision is filed

How should an agent file a decision that follows on from another on the same subject?

**Decided:** A topic of its own, the agent's pick. Then the follow-on gets a narrower topic (client/rule-drafts beside client/rules), and the duplicate message and AGENTS.md say so; the checks stay as they are.

**Not chosen:** Share the topic, as a card that builds on it. Then filing lets through a card that builds on its match; the precedent and the merge gate must then tell one question from another within a topic, or they'll flag follow-ons as conflicts.

**It turned on:** Is a topic one question, or an area that holds many decisions? One question: A topic of its own. An area of many: Share the topic, as a card that builds on it.

**The fact given:** Today everything treats a topic as one question: a second card on it is stopped as a duplicate, the earlier answer shows as its precedent, and two branches that answer it differently become a conflict when they merge.

**First chose:** Share the topic, as a card that builds on it, then switched once the agent's pick was shown.

**The agent's case:** Every check that matches cards already reads a topic as one question, so a narrower topic needs only words. Sharing topics would mean changing three checks.

Answered by Gus Ellerm on 2026-11-01, through Baesian (card B-haepz, revision 1). Filed by claude-code on main, in the deck “Findings from dogfooding”.

The record is in `.baesian/cards/B-haepz/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

**What happened.** Filing "How a drafted rule reaches you", which builds on "How an answer becomes a rule", `baesian file` exited 3: same topic (`client/rules`) as a settled decision. `AGENTS.md` says to attach to an open card, follow a decided one, or use `--new` only to argue against one. None fits a different question on the same subject. The agent gave the card a narrower topic, `client/rule-drafts`, and it filed.

**Why the obvious fix isn't free.** Letting through a card that `depends_on` its match would file it, but the two cards would then share a topic, and the merge gate (`baesian verify`) compares settled decisions by topic: their different answers would look like a conflict once they met on two branches. The client's precedent, the newest settled decision on the same topic, would also show the parent as if it answered the follow-on.

**With your pick,** the change is words: the exit-3 message would add "if yours is a different question on the same subject, give it a narrower topic", and `AGENTS.md` would say the same, with an example.
