---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "When deleting an account takes effect: Closed for 14 days, then deleted (B-b46z3)."
created: 2026-11-04
updated: 2026-11-04
tags:
  - baesian
  - decision
aliases:
  - B-b46z3
card: B-b46z3
revision: 1
title: When deleting an account takes effect
question: When someone deletes their account on the website, should everything go at once, or should the account be closed for 14 days first, so signing in with its passkey can restore it?
answer: Closed for 14 days, then deleted
response: alternative
not_chosen:
  - Everything goes at once
answered: 2026-11-04T20:02:58.900Z
answered_by: Gus Ellerm
topic: hosted/account-deletion
deck: hosted
level: hard
reverse: one-way
touches:
  - data-loss
  - privacy
  - user-facing
  - security
filed: 2026-11-04T20:02:09.938Z
filed_by: claude-code
branch: worktree-agent-a0bd0dd57881ac741
---

# When deleting an account takes effect

When someone deletes their account on the website, should everything go at once, or should the account be closed for 14 days first, so signing in with its passkey can restore it?

**Decided:** Closed for 14 days, then deleted, the alternative. The same checks close the account: sign-ins and machines end, nothing is relayed or counted, a notice is emailed. For 14 days, signing in with its passkey can restore it as it was; on day 15 everything listed goes for good.

**Not chosen:** Everything goes at once, the agent's pick. After your passkey and your handle typed out, everything listed goes at once, a notice is emailed and you're signed out. Nothing can be restored: signing up again is a new account, and each repo is linked again with baesian login.

**It turned on:** Is a way back after deleting worth keeping everything, card text included, for 14 more days? (a preference) No: a deleted account should be gone: Everything goes at once. Yes: mistakes and misuse need a way back: Closed for 14 days, then deleted.

**The fact given:** What goes, under either option: the account, its email addresses, passkeys (the service's copies of their public keys), recovery code, Globus link, sign-ins, machines and their tokens, browsers getting notifications, its raw usage events and usage ID; and every project it owns, which in v1 has no other member: the project's name, and on the relay all of its cards, answers, rules, settings and log. What stays: daily usage totals, which name no one, and each repo's own record in git, which the service never had. Deleting asks for your passkey afresh under either option, as adding a passkey or approving a machine does, so someone else would need your device and its lock. A passkey stays on your device until you remove it there. The GDPR asks for erasure without undue delay, and gives a month to act on a request.

**The agent's case:** A fresh passkey check and the typed handle make an accidental or stolen deletion unlikely, every card and answer is still in the repo's record, and getting back in is a new sign-up and a baesian login; a 14-day window keeps everything, card text included, on the service after someone asked for it to go, and needs a scheduled job and a closed state the service doesn't have.

**Wrong if:** People delete accounts by mistake and ask for them back, or deletion through a signed-in browser shows up as an attack. **To check:** After launch, read the deletion notices' replies and any support mail about deleted accounts in the first months.

Answered by Gus Ellerm on 2026-11-04, through Baesian (card B-b46z3, revision 1). Filed by claude-code on worktree-agent-a0bd0dd57881ac741, in the deck “The hosted service”.

The record is in `.baesian/cards/B-b46z3/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

GDPR Article 17 gives people the right to have their data erased; the draft policy, [[Privacy Policy]], will say how. Nothing on the service deletes an account today ([[Hosted Service]] lists it as not built).

**What deleting removes, in detail** (the same under both options):
- in the accounts database: the account's row, and with it, through the tables' cascades, its emails, passkeys, recovery code, Globus identity, sign-ins, machine grants and their spent refresh tokens, push subscriptions, device codes it approved, and the projects it owns; any flow naming it; its raw usage events (by usage ID). Daily totals (`usage_daily`) carry no ID and stay;
- for each project it owns: the project's Durable Object's storage, all of it (files, log, pending answers, notification state, retention's records), its alarm, and its open sockets;
- in each repo: nothing. Its `.baesian/` record keeps every card and answer, and its config still names the project; the CLI says the machine is signed out, and `baesian login` links the repo again, as a new project.

**Things the agent will decide while building, either way:** the notice's wording; the confirmation (the handle typed, as GitHub asks for a repository's name); telling the browser the passkey is gone where it supports that (WebAuthn's `signalUnknownCredential`), so a password manager can offer to remove it; and the CLI starting afresh when a project's log is shorter than what it had pulled (a project deleted and made again).

Not decided here: a way to delete one project without the account. In v1 a project is deleted with its owner's account only.
