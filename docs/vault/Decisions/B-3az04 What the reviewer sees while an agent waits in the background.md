---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "What the reviewer sees while an agent waits in the background: For the usual 9 minutes, then not (B-3az04)."
created: 2026-11-05
updated: 2026-11-05
tags:
  - baesian
  - decision
aliases:
  - B-3az04
card: B-3az04
revision: 1
title: What the reviewer sees while an agent waits in the background
question: While an agent waits in the background for its cards to be answered, possibly for hours, how long should those cards show it as stopped for you?
answer: For the usual 9 minutes, then not
response: accept
not_chosen:
  - For as long as the wait runs
answered: 2026-11-05T14:44:07.256Z
answered_by: GusEllerm
topic: plugin/waking-on-answers/markers
deck: branch-v1-next
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-05T14:38:59.920Z
filed_by: claude-code
branch: worktree-agent-afdc72dedbfd12b7e
depends_on:
  - "[[B-xnae9 How an idle agent hears its cards are answered|B-xnae9]]"
---

# What the reviewer sees while an agent waits in the background

While an agent waits in the background for its cards to be answered, possibly for hours, how long should those cards show it as stopped for you?

**Decided:** For the usual 9 minutes, then not, the agent's pick. The cards say the agent stopped, and come first in your queue, for the 9 minutes a wait shows today (its --timeout). Then the marker is removed and the wait listens on unseen: the cards keep their place in the queue, with no badge, and answering them still wakes the agent. The relay gets no heartbeats from it after those 9 minutes.

**Not chosen:** For as long as the wait runs. The cards say the agent stopped, and stay first in your queue, until they're answered or the wait is killed (90 seconds after that, they say it stopped waiting). Each card's marker goes to the relay every 30 seconds for as long as the wait runs, which can be hours.

**It turned on:** Should a card stay first in your queue, marked as an agent stopped for it, for as long as an agent idles on it, even for hours? (a preference) No: only while it has just stopped: For the usual 9 minutes, then not. Yes: for as long as it idles: For as long as the wait runs.

**The fact given:** Today a wait shows a marker for at most 9 minutes. While it's fresh, the card says the agent stopped and comes first in your queue; a marker that goes quiet for 90 seconds says it stopped waiting. A background wait ends only when its cards are answered, so it can run for hours, including while the agent is given other work. Either way, answering the cards wakes the agent. Each marker shown is a request to the relay every 30 seconds.

**First chose:** For as long as the wait runs, then switched once the agent's pick was shown.

**The agent's case:** The badge and the queue's order were made for an agent blocked mid-task, where answering soon matters. An agent that ended its turn an hour ago is idle, not urgent, and many such cards at the front would bury the ones where an agent is blocked now. It also bounds the relay's traffic from a wait.

**Wrong if:** You want to know which cards would wake an idle agent, and can't tell from the desk. **To check:** Whether you look for idle agents' cards on the desk once background waits are in use.

Answered by GusEllerm on 2026-11-05, through Baesian (card B-3az04, revision 1). Filed by claude-code on worktree-agent-afdc72dedbfd12b7e, in the deck “Decisions on v1/next”.

The record is in `.baesian/cards/B-3az04/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Built provisionally as the pick, in `waitForAll()` (src/wait.ts): with `--until-answered`, each card's marker shows for the wait's budget (`--timeout`, 9 minutes by default, counted from the first wait), as a wait the agent ran itself would, and is removed when its card is answered or the budget is over; the wait goes on listening without it. No fallback is recorded, since the agent isn't proceeding: it ended its turn.

The plugin's Stop hook doesn't depend on the markers: it reads Claude Code's own list of background tasks to tell whether a wait is already running.
