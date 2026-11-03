---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "What a phone notification says: Counts and levels only (B-mjf3g)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-mjf3g
card: B-mjf3g
revision: 1
title: What a phone notification says
question: Should a push notification about waiting cards give only how many there are and their levels, or also the title of the newest card?
answer: Counts and levels only
response: accept
not_chosen:
  - The newest card's title as well
answered: 2026-11-03T13:33:52.475Z
answered_by: Gus Ellerm
topic: hosted/notification-text
deck: hosted
level: hard
reverse: cheap
touches:
  - security
  - user-facing
filed: 2026-11-03T13:32:02.658Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-kypkm Whether the service can read card text|B-kypkm]]"
---

# What a phone notification says

Should a push notification about waiting cards give only how many there are and their levels, or also the title of the newest card?

**Decided:** Counts and levels only, the agent's pick. A notification reads like '2 cards waiting in baesian (1 hard)': no card text on a lock screen or in a push message. A newer one replaces the older for the same project. You open the app to see what's waiting.

**Not chosen:** The newest card's title as well. A notification reads like 'Where the access token lives (hard), and 1 more', so you can tell from the lock screen what a card is about and whether to open it now. The title shows wherever the phone shows notification previews.

**It turned on:** Which matters more: knowing from the lock screen what a card is about, or no card text outside the app? (a preference) No card text outside the app: Counts and levels only. Knowing what it's about: The newest card's title as well.

**The fact given:** Push messages are encrypted to your browser (RFC 8291), so Apple's and Google's push services can't read them; the exposure is the lock screen and the phone's notification history. A title is a short neutral name and shows before the agent's pick in the app anyway (D86). Under P15, blocking and hard cards notify at once and provisional ones in a digest. There are no answer buttons in a notification either way. Card text is in the repo's record, which is public for a public repo (D136).

**First chose:** The newest card's title as well, then switched once the agent's pick was shown.

**The agent's case:** Titles are text from often-private repos, and a lock screen is seen by whoever is nearby. The count and its levels are enough to decide whether to open the app now, and a per-project setting can allow titles later.

**Wrong if:** Notifications are often opened only to find they could have waited, or hard cards wait longer in dogfooding because a count doesn't say enough. **To check:** In dogfooding, the time from a notification to opening the app, and how often the app is opened from one and closed without an answer.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-mjf3g, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-mjf3g/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

P15 left this open ([[Hosted Service]], section 7, "Notifications"). D137 made card text in notifications possible, since the service can read it, but didn't decide whether to show it.

What doesn't change with this choice (P15): web push with VAPID keys; on iPhone, only after the app is added to the Home Screen (iOS 16.4 or later); every push shows a notification, because Safari revokes permission otherwise; nothing is sent while you're present in a client (D41); pushes per project per hour are capped, and a burst from one machine pauses its notifications. Payloads are at most 4 KB (B5 F17), which a title fits easily.

How phones show previews on a locked screen by default wasn't checked for this card (*unverified*).

Evidence: [[Hosted Service - Strand B5 Prior Art and Security]], F16 to F18 and R5.
