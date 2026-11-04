---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Who the privacy policy names as running the service: You, as an individual (B-mkryw)."
created: 2026-11-04
updated: 2026-11-04
tags:
  - baesian
  - decision
aliases:
  - B-mkryw
card: B-mkryw
revision: 1
title: Who the privacy policy names as running the service
question: Should the hosted service's privacy policy name you, as an individual, as the one who runs it and controls its data, or the University of Chicago?
answer: You, as an individual
response: accept
not_chosen:
  - The University of Chicago
answered: 2026-11-04T20:02:25.003Z
answered_by: Gus Ellerm
topic: hosted/privacy-operator
deck: hosted
level: hard
reverse: moderate
touches:
  - publishes
  - privacy
  - user-facing
filed: 2026-11-04T20:01:51.996Z
filed_by: claude-code
branch: worktree-agent-a0bd0dd57881ac741
---

# Who the privacy policy names as running the service

Should the hosted service's privacy policy name you, as an individual, as the one who runs it and controls its data, or the University of Chicago?

**Decided:** You, as an individual, the agent's pick. The policy and the /privacy page say you run Baesian's hosted service and decide what it keeps: you are the controller under the GDPR, personally answerable for it, and your name is on a public page. The University isn't mentioned. The policy is yours to publish, without anyone else's sign-off.

**Not chosen:** The University of Chicago. The policy names the University of Chicago (Globus Labs) as running the service and as the controller. Before publishing, the University would need to agree to run it, and its privacy office would likely review or rewrite the policy and set where requests go; its own policies then apply to the service.

**It turned on:** Is running Baesian's hosted service part of your work for the University, with its agreement? No, it's my own project: You, as an individual. Yes, the University has agreed to it: The University of Chicago.

**The fact given:** A privacy policy must name the controller: whoever decides why and how people's data is kept. The service runs in a Cloudflare account whose login is your University of Chicago address (D177), on Workers Paid, which you pay for (D178), at baesian.dev, a domain registered in that account. You work at Globus Labs, part of the University, and Globus sign-in is one way in (D153, D176). Whoever is named answers people's requests to see or delete their data, and is responsible if it's mishandled. Naming an organisation usually needs that organisation's agreement, and usually means its privacy office reviews the policy. The draft is docs/vault/Design/Privacy Policy.md, with the operator left open.

**The agent's case:** You described yourself as the operator, the service is a personal project hosted for others (D129), and naming the University would commit it to something it hasn't agreed to and put the policy's wording in its hands. If the University does sponsor it, this should change before publishing, not after.

**Wrong if:** The University considers Baesian work done in your role at Globus Labs, or its rules for accounts under University addresses make it the University's service whatever the policy says. **To check:** Before the first deployment, ask Globus Labs or the University's research computing or privacy office whether a service run from a Cloudflare account under your University address, on your own initiative, is yours or theirs.

Answered by Gus Ellerm on 2026-11-04, through Baesian (card B-mkryw, revision 1). Filed by claude-code on worktree-agent-a0bd0dd57881ac741, in the deck “The hosted service”.

The record is in `.baesian/cards/B-mkryw/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The draft policy, [[Privacy Policy]] in `docs/vault/Design/`, leaves the operator as ⟨operator⟩ throughout: "⟨operator⟩ runs the service and decides what it keeps, which makes ⟨operator⟩ the controller of your data under data protection law." The answer fills it in, and decides who the lawful bases' "legitimate interests" belong to.

Why it's open: you run the service yourself and pay for it (D178), but the Cloudflare account that holds it is registered to your University of Chicago address (D177), and you work at Globus Labs, which runs Globus, one of the service's ways in (D176). Whether that makes it the University's service is a fact only you, or the University, can settle.

What follows either way, not decided here: the contact address (topic `hosted/privacy-contact`, its own card), and the lawyer's checks the draft lists (an EU representative under Article 27, transfers, terms of service).

Under the first option, if you ever leave the University, the Cloudflare account's login address may lapse; moving the account's login to another address is a separate step either way.
