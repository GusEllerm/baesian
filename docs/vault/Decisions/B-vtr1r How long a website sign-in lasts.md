---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How long a website sign-in lasts: 30 days from last use (B-vtr1r)."
created: 2026-11-04
updated: 2026-11-04
tags:
  - baesian
  - decision
aliases:
  - B-vtr1r
card: B-vtr1r
revision: 1
title: How long a website sign-in lasts
question: Should a sign-in on the website last until 30 days without use, or end after 24 hours and ask for your passkey again?
answer: 30 days from last use
response: accept
not_chosen:
  - 24 hours, then the passkey again
answered: 2026-11-04T14:57:33.391Z
answered_by: Gus Ellerm
topic: hosted/session-lifetime
deck: hosted
level: hard
reverse: cheap
touches:
  - security
  - user-facing
filed: 2026-11-04T14:53:23.876Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-9tk9m How people sign up and sign in|B-9tk9m]]"
  - "[[B-na7je Proof that a person answered a hard card|B-na7je]]"
  - "[[B-8yxrt What proves a preference change|B-8yxrt]]"
---

# How long a website sign-in lasts

Should a sign-in on the website last until 30 days without use, or end after 24 hours and ask for your passkey again?

**Decided:** 30 days from last use, the agent's pick. A sign-in lasts while you keep using the site, ending after 30 days unused or 90 days in all. Answers on hard cards, and changes that let more cards past you, still take your passkey each time (D139, D163).

**Not chosen:** 24 hours, then the passkey again. A sign-in ends 24 hours after it began, whatever you do, and the next visit asks for your passkey. A stolen sign-in works for a day at most, and your first visit each day starts with your face, fingerprint or PIN.

**It turned on:** Is a passkey prompt on your first visit each day worth it, to cap what a stolen sign-in can do? (a preference) No, not for this: 30 days from last use. Yes: 24 hours, then the passkey again.

**The fact given:** Without a passkey prompt, a signed-in page can answer provisional and blocking cards, merge topics, tighten preferences and read card text; hard-card answers and changes that let more past you ask for the passkey every time (D139, D163). The sign-in is a cookie scripts can't read, sent only over HTTPS to the site itself (Hosted Service section 3). NIST's SP 800-63B-4 says a session at its middle assurance level should be re-checked within 24 hours, and after an hour idle, when it may resume with a biometric. A passkey prompt is a face, fingerprint or PIN, about a second.

**First chose:** 24 hours, then the passkey again, then switched once the agent's pick was shown.

**The agent's case:** What needs protecting most already asks for the passkey every time. For the rest, a daily prompt on the phone you review from adds a step to every first answer, and buys little against the risk the design names, an agent driving your signed-in browser, which a shorter sign-in doesn't stop.

**Wrong if:** A stolen or forgotten sign-in is used to answer cards, or you'd rather review on shared machines, where a sign-in that lasts a month is a liability. **To check:** While dogfooding, look at the sign-ins list for any you don't recognise, and note whether you review on machines other than your own.

Answered by Gus Ellerm on 2026-11-04, through Baesian (card B-vtr1r, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-vtr1r/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Hosted Service section 3 sets the cookie (a `__Host-` name, Secure, HttpOnly, SameSite, with cross-site requests refused) and leaves its lifetime open; [[Formats for v1]] doesn't cover it. Either way, a "Sign out everywhere" on the website ends every sign-in at once, and sign-ins are listed so one can be ended.

**What NIST says,** from the NIST-hosted text of SP 800-63B-4, section 2.2.3 (AAL2): "A definite reauthentication overall timeout SHALL be established, which SHOULD be no more than 24 hours at AAL2. The inactivity timeout SHOULD be no more than 1 hour." After an inactivity timeout but before the overall one, it lets the session resume with a password or a biometric together with the session's own secret (the agent's paraphrase, from a search summary of that page). These are for US federal systems; consumer services commonly keep sign-ins for weeks (the agent's knowledge, *unverified*).

Source, read 2026-11-04: NIST, SP 800-63B-4, "Authenticator Assurance Levels" <https://pages.nist.gov/800-63-4/sp800-63b/aal>.
