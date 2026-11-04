---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "What the service keeps about each sign-in: A name and the last use (B-7bq05)."
created: 2026-11-04
updated: 2026-11-04
tags:
  - baesian
  - decision
aliases:
  - B-7bq05
card: B-7bq05
revision: 1
title: What the service keeps about each sign-in
question: Should the service keep only a name and the last use for each sign-in and machine, or also where each came from, for a list you can check?
answer: A name and the last use
response: accept
not_chosen:
  - Also where, for 90 days
answered: 2026-11-04T14:58:07.212Z
answered_by: Gus Ellerm
topic: hosted/sign-in-records
deck: hosted
level: hard
reverse: moderate
touches:
  - privacy
  - security
  - user-facing
filed: 2026-11-04T14:53:24.086Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-ytdt2 Where account data is kept|B-ytdt2]]"
  - "[[B-7bk6y Whose usage the service counts|B-7bk6y]]"
---

# What the service keeps about each sign-in

Should the service keep only a name and the last use for each sign-in and machine, or also where each came from, for a list you can check?

**Decided:** A name and the last use, the agent's pick. Each sign-in and machine keeps a name ("Safari on an iPhone", or the machine's hostname), when it began and when it was last used. No IP address or location is stored; limits on requests use them in passing, then forget them.

**Not chosen:** Also where, for 90 days. Each sign-in and machine also keeps the IP address and city it came from, shown in your sign-ins list for 90 days, so you can spot one that isn't yours and end it.

**It turned on:** Would you look at where your sign-ins came from, to spot one that isn't yours? Rarely: A name and the last use. Yes: Also where, for 90 days.

**The fact given:** Cloudflare gives the service each request's IP address and approximate location (country and city). The page that approves a new machine shows its address and rough location at that moment either way (Hosted Service section 2). The EU's GDPR treats IP addresses as personal data. The service's public page lists every field it collects (D141), and the privacy policy is M9f's. Limits on requests can work from an address without storing it, through Cloudflare's rate-limiting binding.

**First chose:** Also where, for 90 days, then switched once the agent's pick was shown.

**The agent's case:** A name and a last-used time are enough to end a sign-in you don't recognise, and the approval page already shows where a new machine is. Not keeping addresses means less personal data to hold, list in the policy and lose in a breach.

**Wrong if:** You need to tell your own sign-ins from someone else's and a device name can't do it, or a breach investigation needs addresses the service didn't keep. **To check:** When the sign-ins list is built, see whether its names tell your devices apart; after any security incident, note what was missing.

Answered by Gus Ellerm on 2026-11-04, through Baesian (card B-7bq05, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-7bq05/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

What's recorded either way: the account's email address, handle and passkeys' public keys, which sign-in needs; and for each sign-in or machine, an ID, when it began and when it was last used. This card is only about where requests come from.

**The name.** For a browser, the service reads the browser's own description of itself (its User-Agent) and keeps a short form, such as "Firefox on a Mac". For a machine, the CLI sends its hostname at `baesian login` (M9d); the approval page shows it before you approve.
