---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How someone who lost every passkey gets back in: An emailed code and a saved recovery code (B-jzgy4)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-jzgy4
card: B-jzgy4
revision: 1
title: How someone who lost every passkey gets back in
question: When someone has lost every passkey, should an emailed code alone let them add a new one, or should it also take a code they saved at sign-up?
answer: An emailed code and a saved recovery code
response: accept
not_chosen:
  - An emailed code alone
answered: 2026-11-03T13:34:21.876Z
answered_by: Gus Ellerm
topic: hosted/account-recovery
deck: hosted
level: hard
reverse: moderate
touches:
  - security
  - user-facing
filed: 2026-11-03T13:32:02.836Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-9tk9m How people sign up and sign in|B-9tk9m]]"
  - "[[B-sar41 What makes an answer count in a hosted repo|B-sar41]]"
  - "[[B-7hjag Where verify finds the reviewer's passkey keys|B-7hjag]]"
  - "[[B-8yxrt What proves a preference change|B-8yxrt]]"
---

# How someone who lost every passkey gets back in

When someone has lost every passkey, should an emailed code alone let them add a new one, or should it also take a code they saved at sign-up?

**Decided:** An emailed code and a saved recovery code, the agent's pick. Sign-up shows a recovery code to keep. Getting back in takes it and a code sent to your email, as NIST asks of two-factor accounts (AAL2). Lose both and you start a new account and link your repos again.

**Not chosen:** An emailed code alone. A code sent to your email lets you add a new passkey, as NIST allows for single-factor accounts (AAL1). Nobody who still has their email is locked out, and there's no code to keep; anyone who can read your email can take the account.

**It turned on:** Which is worse for you: someone locked out after losing a saved code, or an account taken over through its email? (a preference) A takeover: An emailed code and a saved recovery code. A lockout: An emailed code alone.

**The fact given:** Every recovery sends the person a notice either way (NIST SP 800-63B-4, 4.2.3). Accounts that link Globus can also get back in through their own sign-in provider (D153). Whoever holds an account can give provisional and blocking answers that count (D138) and approve machine sign-ins; answers to hard cards and loosened preferences need a passkey pinned in CI by hand (D159, D163). The repos keep every card and answer (D127), so a new account loses only its grants, membership and place on the relay.

**First chose:** An emailed code alone, then switched once the agent's pick was shown.

**The agent's case:** An account can answer most cards in a way that counts and can sign in machines that read every card, so it should be harder to take than an email inbox. Because the repos keep every decision, losing an account costs little beyond linking them again.

**Wrong if:** Saved codes are lost often enough that lockouts become the main support request, or nearly every account links Globus, so few people use Baesian's own recovery. **To check:** In dogfooding and with the first outside users, count recovery attempts and lockouts, by route.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-jzgy4, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-jzgy4/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

D153 settled that Baesian runs email recovery for accounts without Globus. How strong that recovery is was left open: [[Sign-in for the Hosted Service]] lists it under its open questions ("email codes alone (AAL1), or email codes plus a saved recovery code (AAL2)?"). P15 lists account recovery among its open questions ([[Hosted Service]], "Open questions").

NIST's guideline, as the research note reads it (F10): at AAL1 an account may recover with a saved recovery code, an issued one or a recovery contact; at AAL2 it needs two codes obtained by different methods, or one code plus an authenticator already bound to the account. A code emailed to the person is an issued code, valid for 24 hours, so email alone is AAL1.

Under either option a newly added passkey can sign in and give provisional and blocking answers at once, but its hard-card answers count in CI only after it's pinned there by hand (D159). A notice to the person, and perhaps a waiting period before a new passkey may do anything, are the agent's suggestions for both options, not part of this choice.

If a locked-out person starts again, linking a repo to the new account writes a new project ID into `.baesian/config.json`, and the machines upload what's still open from their live layers (the agent's reading of P15 and P16, not yet designed).
