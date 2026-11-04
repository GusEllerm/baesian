---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Whether sign-up checks for bots: Turnstile on sign-up and codes (B-1a03b)."
created: 2026-11-04
updated: 2026-11-04
tags:
  - baesian
  - decision
aliases:
  - B-1a03b
card: B-1a03b
revision: 1
title: Whether sign-up checks for bots
question: Should sign-up and requests for an emailed code run Cloudflare's Turnstile bot check, or rely on limits per address alone?
answer: Turnstile on sign-up and codes
response: accept
not_chosen:
  - Limits alone
answered: 2026-11-04T14:58:18.376Z
answered_by: Gus Ellerm
topic: hosted/sign-up-bots
deck: hosted
level: hard
reverse: cheap
touches:
  - security
  - privacy
  - user-facing
filed: 2026-11-04T14:53:24.287Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-mz6qc Who can create an account at first|B-mz6qc]]"
  - "[[B-pvye0 Which service sends the service's emails|B-pvye0]]"
  - "[[B-jzgy4 How someone who lost every passkey gets back in|B-jzgy4]]"
---

# Whether sign-up checks for bots

Should sign-up and requests for an emailed code run Cloudflare's Turnstile bot check, or rely on limits per address alone?

**Decided:** Turnstile on sign-up and codes, the agent's pick. The sign-up page and any page that sends an emailed code run Turnstile in its managed mode: most people see nothing, and a likely bot gets a checkbox. Cloudflare's script loads only there, and the service checks each result before sending mail.

**Not chosen:** Limits alone. No third-party script on the site. Sign-up and emailed codes are limited per email address and per network address, a few an hour, and a bot that stays under the limits can make accounts and send codes.

**It turned on:** Is a bot making the service send mail to addresses that didn't ask for it a real risk at first? Yes: Turnstile on sign-up and codes. Not yet: Limits alone.

**The fact given:** Sign-up is open to anyone (B-mz6qc), and each sign-up and recovery sends an email (B-pvye0, B-jzgy4). Mail to people who didn't ask for it costs the sending domain its reputation, which every later code depends on. Turnstile is free, up to 20 widgets an account. Its managed mode shows a checkbox only when it suspects a bot, and it is WCAG 2.2 AA compliant. It runs Cloudflare's script in the visitor's browser; Cloudflare says it uses only the data needed for the check, and its privacy addendum would be named in the service's policy. Passkey sign-in sends no mail and needs no check.

**The agent's case:** An open sign-up that sends mail is a target for bots that use it to mail strangers; one check on the two pages that send mail stops most of that at no cost, and the people signing up rarely see it.

**Wrong if:** Real people get stuck on the check (privacy browsers, blocked scripts), or no bot ever tries, so it guards nothing. **To check:** Once sign-up is open, count failed checks against completed sign-ups, and any reports of people who couldn't get past it.

Answered by Gus Ellerm on 2026-11-04, through Baesian (card B-1a03b, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-1a03b/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

B-mz6qc opened sign-up from the start "with limits on traffic and a defensive posture against abuse"; this card asks whether that posture includes a bot check. Limits per address apply either way.

**Turnstile in practice.** The page loads `https://challenges.cloudflare.com/turnstile/v0/api.js`; the widget gives the form a token, which the service checks with Cloudflare's siteverify endpoint before acting, once per token. Cloudflare publishes test keys that always pass or always fail, so local development and tests need no account. Its invisible mode would need the privacy addendum named in the policy as a condition; the managed mode is proposed here.

Sources, read 2026-11-04: Cloudflare, "Turnstile" overview, "Widget configurations", "Plans" (updated 2026-08-14) <https://developers.cloudflare.com/turnstile/plans/>, "Challenges: Turnstile" <https://developers.cloudflare.com/cloudflare-challenges/challenge-types/turnstile/>, and "Workers rate limiting binding" <https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/>.
