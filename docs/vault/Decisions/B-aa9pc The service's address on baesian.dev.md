---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "The service's address on baesian.dev: At the bare domain (B-aa9pc)."
created: 2026-11-04
updated: 2026-11-04
tags:
  - baesian
  - decision
aliases:
  - B-aa9pc
card: B-aa9pc
revision: 1
title: The service's address on baesian.dev
question: Should the hosted service live at the bare domain, https://baesian.dev, or at a subdomain such as https://app.baesian.dev, keeping the bare domain free?
answer: At the bare domain
response: accept
not_chosen:
  - At app.baesian.dev
answered: 2026-11-04T19:28:02.218Z
answered_by: Gus Ellerm
topic: hosted/website-origin
deck: hosted
level: hard
reverse: one-way
touches:
  - user-facing
  - public-api
  - infra
filed: 2026-11-04T19:27:32.726Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-qrga1 Which domain the website lives on|B-qrga1]]"
---

# The service's address on baesian.dev

Should the hosted service live at the bare domain, https://baesian.dev, or at a subdomain such as https://app.baesian.dev, keeping the bare domain free?

**Decided:** At the bare domain, the agent's pick. The website, its sign-in pages and the API under /v1/ are all at https://baesian.dev, and every repo's config says so. A homepage, if ever wanted, is the signed-out welcome page at /, or goes on a subdomain.

**Not chosen:** At app.baesian.dev. The service is at https://app.baesian.dev, and every repo's config says so. The bare domain stays free for a homepage or docs built with anything, and redirects to the app until then.

**It turned on:** Will baesian.dev itself ever need to serve something other than the service, such as a homepage or docs built separately? No, the service is the site: At the bare domain. Yes, keep it free: At app.baesian.dev.

**The fact given:** The service's address is written into every linked repo's config, every machine's sign-in, CI's pinned origin (D142), every installed app and every push subscription; changing it later means linking every repo and signing in every machine again, and installing the app again. Passkeys can name baesian.dev as their relying party under either option, so they would survive a move between baesian.dev and its subdomains. The site already shows a welcome page at / when you're signed out. Cloudflare serves a Worker on the bare domain or any subdomain of baesian.dev alike, at no cost either way.

**The agent's case:** One address, the shortest to type and to read in a config, and nothing else is planned for the domain: the npm package's README is the documentation, and the signed-out page can carry a homepage. Keeping the bare domain free costs a longer address everywhere for a site that may never exist.

**Wrong if:** You'll want a homepage or docs at baesian.dev built with something other than the service's Worker, such as a static site generator or a docs host. **To check:** Before the first deployment, decide whether Baesian needs a homepage beyond the signed-out welcome page, and where its docs will live.

Answered by Gus Ellerm on 2026-11-04, through Baesian (card B-aa9pc, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-aa9pc/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

B-qrga1 chose a domain of its own, and the user registered baesian.dev on 2026-11-04 in the service's Cloudflare account (D177). This card asks only which name on it the service answers at.

Under either option, the relying party for passkeys would be `baesian.dev` (`SERVICE_RP_ID`), so passkeys made on the site work on any of its subdomains. The sign-in cookie is host-only (`__Host-`), so it's sent only to the service's own name. The service's emails come from an address on baesian.dev either way.

Set by this choice: `SERVICE_ORIGIN` and the Worker's Custom Domain in `service/wrangler.jsonc`, the redirect address registered with Globus (`<origin>/v1/globus/callback`), the Turnstile widget's hostname, and the VAPID subject.
