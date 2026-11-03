---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Who may lower what reaches you: The agent may only escalate (B-vf0w2)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-vf0w2
card: B-vf0w2
revision: 1
title: Who may lower what reaches you
question: May the agent that files a card also decide that it needn't reach you, or may it only ask for more of your attention?
answer: The agent may only escalate
response: accept
not_chosen:
  - The agent classifies most kinds
answered: 2026-11-03T01:51:43.186Z
answered_by: Gus Ellerm
topic: routing/agent-classification
deck: routing
level: hard
reverse: moderate
touches:
  - security
filed: 2026-11-03T01:38:35.476Z
filed_by: claude-code
branch: overnight/2026-11-03
---

# Who may lower what reaches you

May the agent that files a card also decide that it needn't reach you, or may it only ask for more of your attention?

**Decided:** The agent may only escalate, the agent's pick. The agent states facts and may raise a card's level, never lower it. Only the repo's settings hold a card back, and floors always win, so an agent can no longer file a security card as provisional.

**Not chosen:** The agent classifies most kinds. The agent marks which of its cards you need to see, as it chooses levels today. Rules and detectors check its word only on security and privacy cards.

**It turned on:** Is an agent's own view of which of its decisions need you reliable enough to act on? No, that isn't shown: The agent may only escalate. Yes, for most kinds: The agent classifies most kinds.

**The fact given:** No study tests agents gating their own decision cards. Models favour their own work and overrate their success; banks and code review keep the party that acts from deciding whether it's checked.

**First chose:** The agent classifies most kinds, then switched once the agent's pick was shown.

**The agent's case:** Separation of duties is cheap here: the agent still states the facts the rules use, and escalating costs it nothing.

**Wrong if:** In shadow mode, the levels agents set predict your blind choices as well as the repo's settings do. **To check:** The shadow report: compare each card's agent-set level with your blind choice and with the settings' outcome.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-vf0w2, revision 1). Filed by claude-code on overnight/2026-11-03, in the deck “Routing and preferences”.

The record is in `.baesian/cards/B-vf0w2/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

D131 lists the agent as one possible runner of the gate. Today an agent can already set a card's level, and an explicit level overrides the hard default for security, money, data loss and publishing. P14 proposes that the agent's level becomes a minimum. Evidence: [[Preference Sliders and the Gate]], principle P4 and decision 2. Design: [[Routing and Preferences]], section 2.
