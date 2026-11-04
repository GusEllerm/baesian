---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "When the website sends a notification: Stopping cards at once, the rest in a digest (B-advkh)."
created: 2026-11-04
updated: 2026-11-04
tags:
  - baesian
  - decision
aliases:
  - B-advkh
card: B-advkh
revision: 1
title: When the website sends a notification
question: Should provisional cards get a notification too, gathered into a digest, or should only blocking and hard cards ever notify?
answer: Stopping cards at once, the rest in a digest
response: accept
not_chosen:
  - Only blocking and hard cards notify
answered: 2026-11-04T18:33:04.199Z
answered_by: Gus Ellerm
topic: hosted/notification-timing
deck: hosted
level: hard
reverse: cheap
touches:
  - user-facing
filed: 2026-11-04T18:05:45.506Z
filed_by: claude-code
branch: worktree-agent-afd68f00f896c9e85
depends_on:
  - "[[B-mjf3g What a phone notification says|B-mjf3g]]"
---

# When the website sends a notification

Should provisional cards get a notification too, gathered into a digest, or should only blocking and hard cards ever notify?

**Decided:** Stopping cards at once, the rest in a digest, the agent's pick. Blocking and hard cards notify within about 10 seconds. Provisional cards wait for a digest, sent at most 3 hours after the first of them arrived; a sooner notification counts them in. Same cap and burst pause either way.

**Not chosen:** Only blocking and hard cards notify. Blocking and hard cards notify within about 10 seconds. A provisional card never notifies on its own, though the next notification counts it; you see it when you next open the project, however long that is.

**It turned on:** Should a card the agent isn't waiting on ever be a reason to buzz your phone? (a preference) Yes, a few times a day at most: Stopping cards at once, the rest in a digest. No, only when an agent waits: Only blocking and hard cards notify.

**The fact given:** Levels: a provisional card lets its agent carry on with its pick; blocking makes it wait for a verdict; hard means never proceeding without one (AGENTS.md). Under both options: every notification counts every card waiting in the project, by level, as "3 cards waiting in Shop (1 hard)" (B-mjf3g); a newer one replaces the older (Topic per project); nothing is sent while you're present in a client (D41); pushes are capped per project per hour, and a burst from one machine pauses its pushes, with a notice on the project's page (P15 section 7, against prompt fatigue). Chrome removes notification permission from sites with very low engagement and many notifications, though not from installed web apps (B5 F17). Provisional cards are still answered before merge (the merge gate).

**First chose:** Only blocking and hard cards notify, then switched once the agent's pick was shown.

**The agent's case:** Provisional cards still need an answer before merge, and the agent builds on them meanwhile, so hearing of them within hours keeps the cost of a late overturn down; a digest every 3 hours at most keeps that to a few notifications a day, and anything urgent in between already carries their count.

**Wrong if:** Digest notifications are mostly dismissed unopened, or people turn notifications off after the first days of digests. **To check:** In the usage counts (if kept), push_opened against push_sent by reason; in dogfooding, whether digests get opened.

Answered by Gus Ellerm on 2026-11-04, through Baesian (card B-advkh, revision 1). Filed by claude-code on worktree-agent-afd68f00f896c9e85, in the deck “The hosted service”.

The record is in `.baesian/cards/B-advkh/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

**The numbers, all the agent's choices** (P15 section 7 left them open):
- **At once** means after a 10-second pause, so a burst of filings from one `baesian file` or sync becomes one notification.
- **The digest** goes 3 hours after the first provisional card it carries arrived ("every few hours", P15). A notification about a blocking or hard card sooner counts every waiting card, the provisional ones included, so they count as told.
- **The cap:** 4 notifications per project in any hour. Past it, the next waits until the hour frees, and carries everything then waiting.
- **The burst pause:** more than 20 new cards from one machine within 10 minutes pauses notifications for that machine's cards for an hour from the last of them. Its cards are still on the desk, and count in other notifications. The project's page says, for example, "laptop filed 30 cards in 10 minutes, so its cards won't notify you until 15:40."
- **Present** means a heartbeat from the project's page in the last 90 seconds (D41). Cards that arrive then are counted as seen; none is notified later.
- **Waiting** means what the desk shows in its queue: open cards and audits, not cards held back.

Under both options, a notification has no answer buttons and opens the project's page when tapped (P15 section 7).
