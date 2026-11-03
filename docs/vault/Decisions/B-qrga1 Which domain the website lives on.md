---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Which domain the website lives on: A domain of its own (B-qrga1)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-qrga1
card: B-qrga1
revision: 1
title: Which domain the website lives on
question: Should the hosted website live on a domain of its own, registered for Baesian, or on a subdomain of a domain you already have?
answer: A domain of its own
response: accept
not_chosen:
  - A subdomain of a domain you have
answered: 2026-11-03T16:57:51.289Z
answered_by: Gus Ellerm
topic: hosted/website-domain
deck: hosted
level: hard
reverse: one-way
touches:
  - user-facing
  - money
  - security
  - infra
filed: 2026-11-03T16:57:17.319Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-rca1z Where the hosted service runs|B-rca1z]]"
  - "[[B-9tk9m How people sign up and sign in|B-9tk9m]]"
  - "[[B-na7je Proof that a person answered a hard card|B-na7je]]"
  - "[[B-vbqdy Where CI gets the key it checks answers with|B-vbqdy]]"
  - "[[B-7hjag Where verify finds the reviewer's passkey keys|B-7hjag]]"
  - "[[B-mjf3g What a phone notification says|B-mjf3g]]"
  - "[[B-k216t What the local client does in a hosted repo|B-k216t]]"
---

# Which domain the website lives on

Should the hosted website live on a domain of its own, registered for Baesian, or on a subdomain of a domain you already have?

**Decided:** A domain of its own, the agent's pick. You register a new domain, about $10–15 a year, with its DNS on Cloudflare in the service's account. Passkeys, CI's pinned origin, installed phone apps and email bind to it, and it shares its site with nothing else.

**Not chosen:** A subdomain of a domain you have. The service lives at a name like baesian.<your domain>, at no new cost. That whole domain's DNS must be on Cloudflare, in the service's account, and the service's address lasts as long as you keep that domain.

**It turned on:** Do you already hold a domain you'd keep on Cloudflare's DNS, in the service's account, for as long as the service runs? No, or not sure: A domain of its own. Yes: A subdomain of a domain you have.

**The fact given:** Passkeys are bound to the domain they're made on. Moving means everyone enrols new ones, each pinned by hand in every repo's CI (D159), unless the old domain is kept to vouch for the new one, which Chrome and Safari support. The origin is also pinned in CI with the service's key (D142), written in each repo's config, and tied to every machine's sign-in and every phone's installed app and push subscription. A Worker can serve only a domain whose DNS is on Cloudflare: on the Free and Pro plans the whole parent domain moves there; serving just a subdomain needs Business ($200 a month) or Enterprise. A new .com is about $10.50 a year at Cloudflare's at-cost registrar. A subdomain is the same site as its parent's other subdomains, so browsers' SameSite cookie rules don't keep them apart.

**The agent's case:** Everything that binds to the address lasts as long as the service, which is for others and may outlive your own setup or change hands. A new domain costs about $10–15 a year, moves no existing domain's DNS, and shares its site with nothing.

**Wrong if:** You already hold a domain on Cloudflare, in the account the service will use, that runs nothing else and that you'll keep for the service's whole life, so a new one adds only a name and a renewal. **To check:** Before registering, list the domains you hold, where each one's DNS is and in which Cloudflare account, and whether the service could ever be run by someone else, such as the University.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-qrga1, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-qrga1/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

P15 left the domain uncarded ([[Hosted Service]], the paragraph beginning "Carded the same day, after research"): "Email Sending needs its DNS on Cloudflare, and passkeys and CI's pinned origin are bound to it, so it's hard to change later." The name itself is yours to choose when registering; this card asks only which kind of address.

**What binds to the website's address, and what a move costs.**

| What | How it's bound | If the address changes |
|---|---|---|
| Passkeys (D153, D139) | each passkey is made for one relying-party ID: the page's own domain or a domain it sits under | everyone enrols a new passkey, and each new key is added by hand to every repo's CI settings (D159); or the old domain keeps serving a file that lets the new origin use the old passkeys (below) |
| Hard-card proofs (D139) | each proof names the origin, and carries the relying party's hash; verify checks both against the origin and relying-party ID recorded with the service's key, which CI pins (D142; [[Formats for v1]] section 7) | every repo's CI settings change, and verify keeps accepting the old origin for old proofs |
| Each repo's `.baesian/config.json` | `Config.service` holds the address, committed | a commit in every repo (a gate fact if hosted/service-address-fact is accepted) |
| Machine grants | each grant names its service ([[Formats for v1]] section 8) | `baesian login` again on every machine, for every project (B-84e0d) |
| The phone app and web push (D130, B-mjf3g) | a Home Screen web app, its service worker and its push subscriptions belong to one origin (the agent's knowledge of the Push and Service Worker specs, *unverified* here) | everyone adds the app to the Home Screen again and turns notifications back on |
| Email | the sender's domain, its SPF, DKIM and DMARC records, and its reputation | records set up again; reputation starts over |
| Globus sign-in (D153) | the app's registered redirect address | the registration is updated |

**What Cloudflare requires** (docs read 2026-11-03):
- *Workers:* a Custom Domain needs "An active Cloudflare zone", and "You cannot create a Custom Domain on a hostname with an existing CNAME DNS record or on a zone you do not own." Routes need an active zone too. So the domain must be a zone on Cloudflare whatever B-pvye0 decides about email. The agent reads "a zone you do not own" as a zone in the Worker's own account (*unverified*).
- *Zone setups:* "If you are on a Free or Pro plan, primary setup (full) is the only one available": the whole domain's nameservers become Cloudflare's. The CNAME (partial) setup, which proxies single subdomains while DNS stays elsewhere, "is only available to customers on a Business or Enterprise plan". A subdomain as a zone of its own (subdomain setup) is Enterprise only (availability table, updated 2026-08-14). Business is $200 a month billed annually, or $250 monthly (Cloudflare's plans page).
- *So* a subdomain of a domain whose DNS is run elsewhere, such as a university's, can't be served by a Worker on Free or Pro unless that whole domain moves to Cloudflare's nameservers.
- *Email Sending:* "You must be using Cloudflare DNS to use Email Service." A subdomain of the zone can be onboarded as a sending domain of its own ("Configure subdomains", updated 2026-10-15). If B-pvye0 picks another sender, its records go in the same Cloudflare DNS.
- *Cloudflare Registrar* sells at cost and requires Cloudflare's nameservers: "You cannot use another DNS provider while registered with Cloudflare." Prices from cfdomainpricing.com, a third-party tracker updated 2026-11-03 (Cloudflare's own price list returned HTTP 403): .com $10.46 a year; .dev $8.20, then $12.20 to renew; .app $8.20, then $14.20; .org $8.50, then $11.20; .io $32, then $50. Another registrar with its nameservers set to Cloudflare works too, and keeps the domain apart from the hosting account.
- *workers.dev* (also considered): every account gets `<worker>.<account>.workers.dev` free, but Cloudflare recommends a custom domain for production, since a workers.dev subdomain "is treated as a Free website and is intended for personal or hobby projects that aren't business-critical". Email Sending can't send from it, and every passkey would be bound to Cloudflare's domain.

**Moving with passkeys kept.** web.dev's "Related Origin Requests" article: "With Related Origin Requests, a website can specify origins allowed to use its RP ID." The old domain serves the list at `https://{RP ID}/.well-known/webauthn`, and Chrome accepts up to five labels. The article says Chrome and Safari support it and that, as of January 2026, Firefox was still considering it; a Mozilla support thread suggests later Firefox ESR versions work (search snippet only, *unverified*). The old domain then has to be renewed for as long as those passkeys are used, and proofs keep the old relying-party ID. MDN on `rpId`: the browser "verifies that rpId matches the relying party's origin or is a domain suffix of the relying party's origin".

**A subdomain and its parent's site.** MDN: a site is "determined by the registrable domain"; "support.mozilla.org and developer.mozilla.org are part of the same site". So the parent's other subdomains are same-site for SameSite cookies, and cookies set for the parent domain reach the service. P15 section 3's `__Host-` session cookie can't be set or overwritten from a sibling, and its cross-site checks can look at the request's origin, so the exposure is whatever else runs on the parent domain (the agent's reading). Under a subdomain, the relying-party ID would be the subdomain itself, so a page on the parent can't ask for its passkeys.

**A subdomain lasts as long as its parent.** It can't be transferred on its own. If the service is handed to someone else (the University, a company), users' passkeys, every repo's CI settings and every installed app stay tied to your domain (the agent's reasoning).

**The obvious names** (a DNS lookup on 2026-11-03, not a registry check): baesian.com's nameservers are Afternic's, a domain marketplace; baesian.ai is registered, with GoDaddy's DNS (the agent didn't look up whose); baesian.dev, .app, .io and .org returned no DNS records, which suggests but doesn't prove they're free.

**Not checked:** which domains you hold and where their DNS is; whether a university would move or delegate a subdomain; what an installed web app does when its origin redirects.

Sources, all read 2026-11-03: Cloudflare, "Custom Domains" (updated 2026-09-29) <https://developers.cloudflare.com/workers/configuration/routing/custom-domains/>, "Routes", "DNS setups" <https://developers.cloudflare.com/dns/zone-setups/>, "CNAME setup (Partial)" (updated 2026-10-15), "Subdomain setup" (updated 2026-08-14) <https://developers.cloudflare.com/dns/zone-setups/subdomain-setup/>, "workers.dev" (updated 2026-09-22), Email Service "Send emails" and "Configure subdomains" <https://developers.cloudflare.com/email-service/configuration/subdomains/>, Registrar FAQ and "Transfer your domain to Cloudflare" (through Cloudflare's documentation search); Cloudflare plans <https://www.cloudflare.com/plans/network-cdn.md>; cfdomainpricing.com <https://cfdomainpricing.com/>; web.dev, "Allow passkey reuse across your sites with Related Origin Requests" <https://web.dev/articles/webauthn-related-origin-requests>; MDN, `PublicKeyCredentialRequestOptions` <https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredentialRequestOptions> and "Site" <https://developer.mozilla.org/en-US/docs/Glossary/Site>; Mozilla support thread on related origins in Firefox 140 ESR <https://support.mozilla.org/de/questions/1600732> (search snippet only).
