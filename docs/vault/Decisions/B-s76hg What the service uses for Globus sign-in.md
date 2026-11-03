---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "What the service uses for Globus sign-in: oauth4webapi (B-s76hg)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-s76hg
card: B-s76hg
revision: 1
title: What the service uses for Globus sign-in
question: Should the service's Sign in with Globus use the oauth4webapi library, or Baesian's own code for the one OAuth flow it needs?
answer: oauth4webapi
response: accept
not_chosen:
  - Baesian's own code for the one flow
answered: 2026-11-03T16:50:42.683Z
answered_by: Gus Ellerm
topic: hosted/globus-client
deck: hosted
level: hard
reverse: cheap
touches:
  - dependency
  - security
filed: 2026-11-03T15:26:48.637Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-9tk9m How people sign up and sign in|B-9tk9m]]"
  - "[[B-rca1z Where the hosted service runs|B-rca1z]]"
---

# What the service uses for Globus sign-in

Should the service's Sign in with Globus use the oauth4webapi library, or Baesian's own code for the one OAuth flow it needs?

**Decided:** oauth4webapi, the agent's pick. Then oauth4webapi (MIT, no dependencies, lists Cloudflare Workers) runs the code flow with PKCE and the client secret, and checks the ID token, its RS512 signature included. Globus sign-in is built on it once Globus's terms are confirmed (D153).

**Not chosen:** Baesian's own code for the one flow. Baesian writes the redirect, the code exchange and the ID token's claim checks itself, with no dependency. It relies on TLS to Globus's token endpoint instead of checking the ID token's signature, which OpenID Connect allows for this flow.

**It turned on:** Is a library with no dependencies of its own worth adding for one sign-in flow that waits on Globus's terms? (a preference) Worth it: oauth4webapi. Not worth it: Baesian's own code for the one flow.

**The fact given:** Globus sign-in is one flow: an authorization code with PKCE, a client secret kept as a Workers secret, and an ID token signed RS512 (the sign-in research, F4 and F14). oauth4webapi 3.8.8 has no dependencies and about 23.7 million downloads a week. Globus has no device flow, so the CLI's machine sign-in is Baesian's own code either way (D153). D153 says to confirm Globus's terms for non-research users with Globus support before building on it; the vault doesn't record that as done.

**The agent's case:** OAuth's small checks (state, PKCE, issuer, audience, nonce) are where hand-written clients go wrong, and this library does them with nothing else pulled in. The same code serves if another provider is added later.

**Wrong if:** Globus's terms rule Globus out, so the code never ships, or using the library takes more code than the flow itself. **To check:** Ask support@globus.org first (D153's check); then a prototype sign-in through Globus on Workers.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-s76hg, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-s76hg/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

D153 (B-9tk9m) makes Globus a second way in. A Globus app is a confidential client: the Worker keeps the client secret, and Globus's discovery document lists only `client_secret_basic` for its token endpoint ([[Sign-in for the Hosted Service]], F4). The ID token is signed RS512, which Workers' Web Crypto can check (RSASSA PKCS1 v1.5, F14). Machine tokens for `baesian login` are Baesian's own under either option; Globus tokens never reach agents' machines (F5).

**What was checked** (2026-11-03):
- *oauth4webapi:* npm lists 3.8.8, MIT, last published 2026-09-05, with no dependencies, and 23,742,803 downloads in the week to 2026-11-02. Its README's supported runtimes include "Cloudflare Workers". It has `ClientSecretBasic`, `authorizationCodeGrantRequest` with a PKCE code verifier, and `getValidatedIdTokenClaims` (through Context7).
- *OpenID Connect Core 1.0, 3.1.3.7, step 6:* when the ID token comes straight from the token endpoint, "the TLS server validation MAY be used to validate the issuer in place of checking the token signature". So the alternative is allowed; it still has to check the issuer, audience, expiry and nonce claims.
- *arctic* 3.7.0 (MIT) depends on three `@oslojs` packages; whether it checks ID token signatures wasn't checked.

**Why this may wait.** D153 asks that Globus's terms for users outside non-profits be confirmed first, and nothing in the vault records the answer. The choice can be made now and built when that's settled.

Sources: oauth4webapi README <https://github.com/panva/oauth4webapi> (through Context7); npm registry and download counts; OpenID Connect Core 1.0 <https://openid.net/specs/openid-connect-core-1_0.html>, section 3.1.3.7 (partial read). All 2026-11-03.
