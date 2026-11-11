---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Whether the website keeps cards on your device: Only in the open tab (B-9n2c3)."
created: 2026-11-11
updated: 2026-11-11
tags:
  - baesian
  - decision
aliases:
  - B-9n2c3
card: B-9n2c3
revision: 1
title: Whether the website keeps cards on your device
question: Should the website keep each project's cards on your device between visits, so a reload or a new tab shows them at once, or keep them only in the open tab's memory?
answer: Only in the open tab
response: accept
not_chosen:
  - On the device, until you sign out
answered: 2026-11-11T03:39:42.090Z
answered_by: GusEllerm
topic: website/cards-on-device
deck: website-speed
level: hard
reverse: moderate
touches:
  - privacy
  - user-facing
filed: 2026-11-11T03:32:30.253Z
filed_by: claude-code
branch: v1/next
---

# Whether the website keeps cards on your device

Should the website keep each project's cards on your device between visits, so a reload or a new tab shows them at once, or keep them only in the open tab's memory?

**Decided:** Only in the open tab, the agent's pick. Then closing the tab or reloading forgets them, and a project's first open in a new tab takes the full load, about 1.5 seconds; the privacy policy's "In your browser" section stays as it is.

**Not chosen:** On the device, until you sign out. Then each project's last copy, with its cards' text, is stored in the browser and shown at once on a reload or in a new tab while it refreshes; signing out on the website deletes it, and the privacy policy gains a line saying so.

**It turned on:** Is it acceptable for cards' text to stay on a device you've signed in from, between visits, until you sign out there? (a preference) No: Only in the open tab. Yes: On the device, until you sign out.

**The fact given:** Cards hold what agents wrote about your repos' design decisions, sometimes with file paths, plans or security details. Today the website keeps two things in your browser, as its privacy policy says: the sign-in cookie, and which cards you've seen and how long you spent on each. Closing the browser or a sign-in expiring doesn't delete what a site stores; only signing out on the site would. Tapping a notification brings back a tab already showing that project, and opens a new one otherwise. A new tab or a reload takes about 1.5 seconds before a project's desk shows.

**The agent's case:** The delay you noticed is moving between pages in one tab, which keeping a copy in the tab's memory fixes; reloads and new tabs are rarer. Keeping cards' text off the device keeps the privacy policy's promise as simple as it is, and a lost or shared laptop holds nothing but the cookie.

**Wrong if:** most of your visits start from a notification or a fresh tab, and those 1.5 seconds are what you notice. **To check:** how you open the site over a week, from a notification, a bookmark or a tab already open.

Answered by GusEllerm on 2026-11-11, through Baesian (card B-9n2c3, revision 1). Filed by claude-code on v1/next, in the deck “How the website keeps what it has loaded”.

The record is in `.baesian/cards/B-9n2c3/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

"Only in the open tab" is what the card on what a project's page shows while it loads builds on either way; this card asks only whether the copy also outlives the tab. Stored, it would sit in the browser's IndexedDB for baesian.dev, one entry per project, replaced on each refresh.
