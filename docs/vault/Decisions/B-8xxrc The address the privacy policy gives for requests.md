---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "The address the privacy policy gives for requests: An address on baesian.dev, forwarded (B-8xxrc)."
created: 2026-11-04
updated: 2026-11-04
tags:
  - baesian
  - decision
aliases:
  - B-8xxrc
card: B-8xxrc
revision: 1
title: The address the privacy policy gives for requests
question: "Where should the privacy policy tell people to write about their data: an address on baesian.dev forwarded to you, or an address you already have?"
answer: An address on baesian.dev, forwarded
response: accept
not_chosen:
  - An address you already have
answered: 2026-11-04T20:02:36.125Z
answered_by: Gus Ellerm
topic: hosted/privacy-contact
deck: hosted
level: hard
reverse: cheap
touches:
  - publishes
  - privacy
  - infra
  - user-facing
filed: 2026-11-04T20:01:55.439Z
filed_by: claude-code
branch: worktree-agent-a0bd0dd57881ac741
---

# The address the privacy policy gives for requests

Where should the privacy policy tell people to write about their data: an address on baesian.dev forwarded to you, or an address you already have?

**Decided:** An address on baesian.dev, forwarded, the agent's pick. The policy says to write to privacy@baesian.dev. You turn on Cloudflare's Email Routing for baesian.dev in the dashboard (it adds the domain's MX records; Email Sending's records stay), with a rule forwarding privacy@ to an inbox you choose, verified once. Mail arrives there; a reply goes from that inbox, so it shows that inbox's address.

**Not chosen:** An address you already have. The policy gives an address you already read, such as your personal or University address. Nothing to set up, and replies come from the same address. The address is public on the page, and if you stop using it, the policy and the page change with it.

**It turned on:** Should the address people write to outlast any one inbox of yours, and keep your own addresses off the page? (a preference) Yes: An address on baesian.dev, forwarded. No, one I already have is fine: An address you already have.

**The fact given:** The policy must give a way to reach whoever runs the service, for requests to see, correct or delete data, which must be answered within a month. Today baesian.dev only sends mail: sign-in@baesian.dev, through Email Sending, receives nothing. Cloudflare's Email Routing forwards mail sent to an address on the domain to a verified inbox, at no cost; it needs MX records on baesian.dev, added in the dashboard, which no agent may do here. The address appears on a public page, where it will draw spam. Who is named as running the service is a separate card (hosted/privacy-operator), whose answer may make the University's privacy office the place to write instead.

**The agent's case:** An address on the domain can be pointed at a new inbox without changing the policy, keeps your personal address off a public page, and costs one dashboard setting; the policy is published once and linked from everywhere.

**Wrong if:** Forwarded mail lands in spam or is rejected by the inbox you forward to, or the operator card names the University, whose privacy office has its own address. **To check:** After turning on Email Routing, send a test message to privacy@baesian.dev from an outside address and confirm it arrives; check Email Sending still delivers codes.

Answered by Gus Ellerm on 2026-11-04, through Baesian (card B-8xxrc, revision 1). Filed by claude-code on worktree-agent-a0bd0dd57881ac741, in the deck “The hosted service”.

The record is in `.baesian/cards/B-8xxrc/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The draft, [[Privacy Policy]] in `docs/vault/Design/`, writes the address as ⟨contact⟩, in "Who runs it" and "Your rights". The website's /privacy page is built from it, and isn't published until a release is tagged (B-bk20v).

The name `privacy@` is the agent's suggestion; `hello@` or the operator's name would do as well, and the answer can say so.

Not decided here: whether deleting an account is something people do on the account page or ask for by mail (topic `hosted/account-deletion`, its own card). Until that's answered, the page tells people to write to this address to have an account deleted.
