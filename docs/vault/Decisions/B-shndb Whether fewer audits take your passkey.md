---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Whether fewer audits take your passkey: Fewer audits take the passkey too (B-shndb)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-shndb
card: B-shndb
revision: 1
title: Whether fewer audits take your passkey
question: In a hosted repo, should a preference change that lowers an audit rate or the burn-in also take your passkey, as moving a row toward held does?
answer: Fewer audits take the passkey too
response: accept
not_chosen:
  - Only rows and enforcing, as D163 says
answered: 2026-11-03T20:05:26.780Z
answered_by: Gus Ellerm
topic: hosted/audit-rate-proof
deck: hosted
level: hard
reverse: cheap
touches:
  - security
filed: 2026-11-03T17:48:37.384Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-8yxrt What proves a preference change|B-8yxrt]]"
---

# Whether fewer audits take your passkey

In a hosted repo, should a preference change that lowers an audit rate or the burn-in also take your passkey, as moving a row toward held does?

**Decided:** Fewer audits take the passkey too, the agent's pick. A change that lowers rate_agent_decides, rate_sample or burn_in counts only with your passkey's proof, as a row moved toward held does. Raising them stays free.

**Not chosen:** Only rows and enforcing, as D163 says. As built in M9a. Only a row moved toward held, or enforcing turned on, takes the passkey; the audit rates and the burn-in change with the service's signature alone.

**It turned on:** Is cutting how often held cards come back to you as consequential as holding more of them? (a preference) It is: Fewer audits take the passkey too. It isn't: Only rows and enforcing, as D163 says.

**The fact given:** A held card counts as settled at merge with no answer (D150). Audits are how held cards come back to you unasked: 1 in 10 at let the agent decide, 1 in 3 at check a sample, and every one of a row's first 10 (B-fgc4y). With both rates and the burn-in at 0, a held card never comes back. D163 named only rows and enforcing. An agent driving your signed-in browser could change the rates without the passkey.

**The agent's case:** Rates at zero make holding silent, the harm D163 guards against, reached another way, so it should take the same proof.

**Wrong if:** You change the audit rates often enough that the prompt gets in the way, or nobody ever lowers them, so the check guards nothing. **To check:** While dogfooding, count preference changes that move only the rates or the burn-in, and which way.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-shndb, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-shndb/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

[[Formats for v1]] section 2 puts `rate_agent_decides`, `rate_sample` and `burn_in` in every preference file. D163's card asked about rows and enforcing, and didn't mention them. M9a built D163 as worded, and leaves this to you, since it touches security.

What the proposal changes: `loosening()` would also report a lowered rate or burn-in, so `Store.judge` asks for the passkey's proof on that file. Nothing else changes: the proof, its check and the files are the same.
