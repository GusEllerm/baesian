---
type: research
status: active
authority: reference
livedocs: snapshot
summary: "Answers the user's question on H2 (B-9tk9m) about Globus Auth: what it is, what it costs and risks, and how it compares with Baesian's own passkey accounts, GitHub and other brokers. Recommends passkey accounts with Globus as a second way in, because the service has to keep passkeys and issue machine tokens whatever handles sign-in."
created: 2026-11-03
tags: [baesian, research]
---

# Sign-in for the hosted service

Provenance: written by a research agent on 2026-11-03, after the user returned H2 (B-9tk9m) with a question: "What about globus auth? Is it a risk factor to manage our own auth service? If we use Globus Auth, users could use SSO from their respective organisations." The agent read [[Hosted Service]] (section 2 and the decisions table) and [[Hosted Service - Strand B5 Prior Art and Security]] (cited as B5, by finding number). Then it read Globus's own documentation, its terms, NIST's authentication guideline, FIDO's passkey page, GitHub's docs, and library and Cloudflare docs. Sources are numbered [1]–[22] in the last section. Quotes are exact as returned by the fetch tool. Nothing here is decided. The cards it builds on were all accepted on 2026-11-03: B-na7je (hard-card answers carry the reviewer's passkey signature), B-sar41 (in a hosted repo only answers the service signs count), B-rca1z (Cloudflare Workers, an object per repo) and B-7bk6y (usage counts from every account, with an opt-out).

**Terms used.**
- An *identity provider (IdP)* is the service that checks who you are, such as your university's login page, Google or GitHub.
- *Single sign-on (SSO)* means one login, run by your organisation, works for many services.
- *OpenID Connect (OIDC)* is the standard way for a website to ask an IdP "who is this?". The answer comes back as an *ID token*: a signed statement whose fields are called *claims*.
- An *identity broker* sits between a website and many IdPs, so the website talks to one service instead of hundreds.
- A *federation* is an agreement among universities and services to trust each other's logins. *InCommon* is the US research and education federation; *eduGAIN* links national federations around the world.
- A *confidential client* is a server-side app that can keep a secret. A *native* or *public* client is an app installed on a user's machine, which can't.
- A *passkey* is a WebAuthn credential: a key pair kept by your phone, laptop or password manager, unlocked by your face, fingerprint or PIN (B5's terms).

## 1. Findings

### What Globus Auth is

**F1. Globus Auth is an OAuth 2.0 and OIDC identity broker run by the University of Chicago. It never checks a password itself.**
- *In its words:* "Globus Auth is a foundational identity and access management (IAM) platform service", and it "is compliant with the OAuth2 and OpenID Connect standards" [2]. It "neither defines its own identity usernames nor verifies authentication" [2]. The identity provider does that.
- *Who runs it:* the terms are an agreement "between you and The University of Chicago", and Globus calls itself "a non-profit service developed and operated by" the University [10].
- *Reach:* the Auth service page says "hundreds of identity providers", and the platform page "thousands of identity providers" [9]. The platform page says Globus's web app "serves the data management needs of over 170,000 researchers around the world" [9].

**F2. University SSO reaches Globus through InCommon and eduGAIN. People without a university login use Google, ORCID, GitHub or Globus ID. A company's own SSO is not included by default.**
- *Universities:* federated identity providers are those "that are part of InCommon or eduGAIN and integrated with Globus Auth via CILogon" [12]. (CILogon is a separate service that connects the federations to OIDC [14].) "Globus supports logins from InCommon members whose identity systems release Research & Scholarship attributes", and such an organisation "will appear in the list of institutions on the Globus login page within two business days" [8]. Research & Scholarship is a standard set of user details that a university agrees to release to research services. The agent couldn't open the page that defines it (section 5).
- *Size:* eduGAIN's status page lists 84 member federations on 2026-11-03. Its row for InCommon shows 588 identity providers [15].
- *Everyone else:* Globus's user guide names "Identity Providers of Last Resort" for when "not everyone has access to an institutional identity": Google ("Useful for individual researchers and small teams"), ORCID ("The scholarly identifier used by researchers worldwide") and GitHub ("Popular among computational scientists and developers") [6]. Globus also runs Globus ID, "An Identity provider of last resort operated by Globus" [12].
- *Companies:* an identity provider outside InCommon and CILogon needs "at least a Standard subscription and an Alternate Identity Provider Subscription" [8]. So a developer at a company would sign in through Globus with GitHub or Google, not with the company's own SSO (Okta or Microsoft Entra, for example).

**F3. One Globus account can link up to 20 identities. Any of them signs the person in as the same account.**
- *Linking:* "A Globus account can have up to 20 identities (primary and linked)" [2]. The ID token is issued "based on the primary identity" [2]. Unless an app requires a particular provider, the identity it is given is the primary one, whichever linked identity was used to log in [2]. The ID token's `identity_set` claim lists "The identities linked to this account" [3].
- *What follows (the agent's inference from [2] and [4]):* a Baesian account built on Globus is only as strong as the weakest identity the person has linked. An app can see which identity was actually used, through the session information that token introspection returns. That includes each authentication's `auth_time` and `idp` [4].
- *Changing the primary identity:* "you must first unlink from it all linked identities" [8]. So the `sub` claim (the account's ID in the token) can change. An app should match on any identity in the set, not only on `sub`.
- *Leaving an institution:* an identity can become `closed`, "typically because the provider has revoked it" [3]. Stanford's research computing guide tells people who are leaving to link a personal Google, ORCID or Globus ID identity and make it primary before their university login stops working [13]. Someone who doesn't will need help, from Globus or from Baesian.

**F4. What a website like Baesian's gets from Globus.**
- *Registration* is self-service, at app.globus.org/settings/developers [1].
- *Client type:* a web service is a *confidential client* ("a client that can protect a secret"). Apps "downloaded or installed on your users' devices" are native, and Globus "will not provide authentication secrets" to them [1]. The discovery document lists only `client_secret_basic` for authenticating to the token endpoint [5].
- *Claims:* the scopes are `openid`, `email` and `profile` [5]. The userinfo response can include `sub`, `email`, `name`, `organization`, `preferred_username`, `identity_provider`, `identity_provider_display_name`, `last_authentication` and `identity_set`. These are "the same claims that are returned in the JWT `id_token`" [3]. ID tokens are signed with RS512 [5].
- *Consent:* users consent once to the app's scopes, and the screen is skipped on later logins [1]. They "can revoke those permissions at any time" [6].
- *Steering the login page:* an app can require a linked identity from one provider ("Required Identity"), or pre-select one, which "will be the default organization on your app's login page" [1].
- *Tokens:* refresh tokens "remain valid indefinitely if they are being used, but they expire after six months of inactivity". There is a revocation endpoint (RFC 7009) [3].

**F5. Globus Auth has no device flow, and Baesian doesn't need one from it.**
- *What Globus offers:* the token endpoint documents the authorization code, refresh token, client credentials and Globus's own dependent-token grants. The device authorization grant (RFC 8628) isn't among them [3], and the discovery document has no device authorization endpoint [5].
- *Globus's own CLI* uses a local server, or "Manual authorization by copying and pasting an auth code" when it detects a remote session [7]. Native apps can redirect to a Globus page that shows "a one-time access code" [1].
- *Why it doesn't matter (the agent's reading of P15):* in P15, `baesian login` gets a Baesian grant from Baesian's own service by the device flow (B5 F9). The person approves on Baesian's website, signed in by whatever the website uses. Globus tokens never reach the agent's machine. Machine scopes, refresh-token rotation, the Machines page and the rule that answers come only from a browser session (P15 sections 2 and 3) are Baesian's in every option.

**F6. MFA and assurance belong to each identity provider. Globus can ask for MFA, but can only report it when the provider does.**
- *MFA:* `session_required_mfa` "will tell the user they must use an MFA device during the authentication process". But "Globus will attempt to determine if an MFA device was used based on the `acr` and `amr` claims", and "some providers don't report MFA use at all (e.g. Google)" [4]. The flag "must be used along with one of `session_required_identities` or `session_required_single_domain`" [4].
- *Sessions:* "There is no time-out of Sessions" on Globus's side [4]. An app can force a fresh login with `prompt=login` "so that services can enforce their own 'freshness' requirements on the session" [4].
- *High assurance* is a subscription tier "For protected and sensitive data management" [9]. The docs the agent read frame it around storage, where "The high assurance policies specified at the storage gateway by the administrator are inherited by the collection" [12]. Authentication policies with `high_assurance` and `authentication_assurance_timeout` exist for app projects [1]. No page the agent read says whether they need a subscription.

### Terms and cost

**F7. Globus publishes no price for Auth. Its FAQ says it can't serve commercial users free, and nothing the agent read says whether that covers sign-in for a tool like Baesian.**
- *Non-profits:* "If you're at a non-profit institution you can access Globus without a subscription" [9]. Globus is "free for researchers at non-profit institutions to use for file transfer" [8]. Neither page mentions Auth.
- *Commercial users:* "If you are a commercial user, you may use Globus by signing up for a commercial subscription", and "We are unable to offer the service free of charge to commercial users" [8]. The subscriptions page also says commercial organisations "may not need a subscription—please contact us" [9]. Whether people at companies signing in to a non-research developer tool count as commercial use of Globus Auth isn't stated in anything the agent read. Section 5 lists a 2018 statement that Auth was free for the research community; it's a search snippet only.
- *Terms of Service* (updated 19 January 2022): the services are "AS-IS", and "We may modify, suspend, or discontinue, temporarily or permanently, the Services at any time, in our sole discretion". There is no uptime commitment, and the terms are under Illinois law [10]. They don't say who may register apps.
- *Rate limits:* none are documented for Auth's API [3].

**F8. Globus would see every sign-in, and Baesian would receive more identity data than it needs.**
- *Globus's side:* its privacy policy (updated 2 December 2025) says "we automatically record information about your use of the Services and your visit to the Sites" [10]. When a person signs in with an organisation's identity, "we may share your Personal Information and Non-Identifying information with the organization" [10].
- *Baesian's side:* with the `openid` scope, the ID token's identity set lists every linked identity [3]. Section 6 of [[Hosted Service]] would have to name Globus as a service that sees sign-ins.

### Risks and dependencies

**F9. When Globus is down, nobody can sign in to apps that rely on it. Planned windows have lasted up to an hour or an hour and a half.**
- *2026-10-24:* "Globus services will be unavailable for up to one hour beginning at 9:30 am US Central on Saturday, October 24, 2026", "including Auth, Transfer, Groups, Flows, Search, Timers, Compute, GlobusID, and Action Providers". The notice said users wouldn't be able to sign in to apps that rely on Auth, third-party apps included [11].
- *2024-11-02:* "up to 1.5 hours", and "Users will not be able to authenticate to applications that rely on Auth, including the Globus Web app" [11].
- *Unplanned outages and incidents:* status.globus.org didn't resolve, so the agent has no uptime figures. A search found no documented security incident involving Globus Auth. The breach results were about Globus Medical, an unrelated company.
- *Effect on Baesian (the agent's inference):* only new sign-ins fail. Existing website sessions, machine tokens, relaying and passkey checks never touch Globus.

**F10. Running accounts yourself is risky mainly because of passwords. Passkeys remove passwords, and what's left is recovery.**
- *Passkeys:* FIDO says "Unlike passwords, passkeys are always strong and phishing-resistant", that "there are no shared secrets", and that breaches of password databases "no longer pose a threat as there are no passwords to steal" [17]. NIST SP 800-63B-4 says WebAuthn "is an example of a standard that provides phishing resistance through verifier name binding" (§3.2.5) [16].
- *Synced passkeys:* "The authentication keys on syncable authenticators are inherently exportable" (§3.2.13). They count toward authentication assurance level 2 (AAL2, the level that needs two factors), but "syncable authenticators SHALL NOT be used at AAL3" [16].
- *Recovery* is the weak point that remains. NIST lists four kinds: saved recovery codes, issued recovery codes, recovery contacts, and repeated identity proofing (§4.2.1) [16]. At AAL1, an account may recover with "a saved recovery code, issued recovery code, or recovery contact". At AAL2, it needs two codes obtained by different methods, or one code plus a single-factor authenticator already bound to the account (§4.2) [16]. A code emailed to the person is an issued code, valid for 24 hours. So email alone is AAL1 recovery, not AAL2. "In all cases, account recovery SHALL cause a notification to be sent to the subscriber or their designee" (§4.2.3) [16].
- *Also left with Baesian in every option:* abuse of open sign-up (rate limits and bot checks; [[Hosted Service]] open questions), and an email address for notifications when push is refused (P15 section 7).

**F11. Accepted cards mean Baesian keeps passkeys and its own token service whatever handles sign-in. Account recovery decides who can make answers that count.**
- *Passkeys are needed anyway (B-na7je):* hard-card answers carry the reviewer's passkey signature, checked against their enrolled public key. So every option runs WebAuthn registration and signing on Baesian's service. Adding passkey sign-in on top is the same ceremony and the same stored key (the agent's inference).
- *Signed answers (B-sar41):* only answers the service signs count, so whoever controls an account can give provisional and blocking answers that count. The passkey check stops them only on hard cards. Sign-in and recovery therefore carry real weight in every option.
- *Enrolling a new passkey is the sensitive step:* under Globus-only sign-in, anyone who can sign in through any linked identity (F3) could enrol a passkey. Under Baesian's own accounts, anyone who passes recovery could. Either way, a newly enrolled passkey should be announced, and perhaps wait before it can sign hard-card answers (the agent's suggestion; an open question below).

**F12. GitHub, briefly (option C).**
- *What it shares:* an OAuth app with no scopes gets "read-only access to public information (including user profile info, repository info, and gists)" [18].
- *Its 2FA isn't universal:* "Your account is selected for mandatory 2FA if you have taken some action on GitHub that shows you are a contributor", and "Currently, we don't support passkeys or security keys as primary 2FA methods" [18].
- *More:* its device flow and token lifetimes are in B5 F9 and F10. GitHub is also one of Globus's providers of last resort [6], so "Globus plus GitHub" is what Globus already offers.

**F13. Other brokers (option D) each add a company to the sign-in path, as Globus does.**
- *CILogon*, which Globus uses to reach the federations [12]: Basic has "No charge for academic research projects"; Essential is $16,547 a year and Full $38,610 a year [14]. Its subscription page doesn't name Google, GitHub or ORCID [14].
- *A commercial identity service* (WorkOS AuthKit as the example): "First 1 million monthly active users free", and enterprise SSO connections at "$125/ea" [19]. It includes "email + password, social login, passkeys, MFA, magic auth, and enterprise SSO — all from one integration" [19]. The page doesn't mention InCommon or eduGAIN, so it's no evidence that it reaches universities the way Globus does.

**F14. Globus, passkeys and Baesian's own tokens all fit Cloudflare Workers, with one library to prove in a prototype.**
- *Globus as the website's sign-in:* a Worker can be the confidential client, with its client secret kept as a Workers secret [22]. Workers' Web Crypto "implements the full surface of this API, but with some differences in the supported algorithms", and RSASSA PKCS1 v1.5 (the RS512 of Globus's ID tokens) can sign and verify [22]. oauth4webapi lists Cloudflare Workers among its runtimes, "has no dependencies", and implements the authorization code flow with PKCE, refresh tokens, the device authorization grant and DPoP [20].
- *Passkeys:* SimpleWebAuthn's server docs list "Node LTS 22.x and higher" and "Deno v2.4.x and higher" [21]. Its README names Cloudflare Workers only among "other compatible runtimes (Cloudflare Workers, Bun, etc...)" [21], so it needs a test on Workers. Workers' Web Crypto has ECDSA, RSASSA PKCS1 v1.5 and Ed25519 [22]. Those are the algorithms passkeys commonly use (the agent's knowledge, not checked against the WebAuthn spec here).
- *Machine tokens:* Cloudflare's workers-oauth-provider "adds OAuth 2.1 authorization to HTTP APIs and remote MCP servers running on Cloudflare Workers". It keeps "Tokens, codes and secrets … only as hashes" in KV, and leaves signing people in to the app [22]. Its README doesn't list the device authorization grant [22], so `baesian login`'s device flow would be Baesian's own code on the server.
- *Dependencies:* any of these libraries is a runtime dependency, which is a card under AGENTS.md.

## 2. The comparison

Five options. A, B and C were on the card or in the user's question. D is the "broker that offers several". E combines A and B.

| | A. Passkey accounts only | B. Globus for everyone | C. Sign in with GitHub | D. A commercial identity service | E. Passkey accounts, with Globus as a way in |
|---|---|---|---|---|---|
| **Who can join** | anyone with an email and a device that holds passkeys | anyone with a university, Google, ORCID, GitHub or Globus ID login (F2) | GitHub users only | anyone | anyone |
| **University SSO** | no | yes, through InCommon and eduGAIN (F2) | no | per connection, at $125 each; federations not mentioned (F13) | yes, for those who choose it |
| **Company SSO** | no | only with a Globus subscription for that company's IdP (F2) | no | yes, per connection (F13) | no |
| **Recovery and identity checks** | Baesian's: email plus a second passkey or a saved code (F10) | the identity provider's; Baesian helps people who lose every linked identity (F3) | GitHub's | the vendor's | the IdP's for people who link Globus; Baesian's by email for the rest |
| **What else Baesian runs** | passkeys, machine tokens, sessions | the same; passkeys are still needed for hard cards (F11) | the same, plus a second credential for hard cards | the same | the same, plus account linking |
| **If the outside service is down** | nothing outside to fail | no new sign-ins (F9) | no new sign-ins | no new sign-ins | passkey sign-in still works |
| **Cost** | email sending only | no published price; commercial terms unclear (F7) | none known (not checked against a price page) | free up to 1 million users a month (F13) | as A, plus B's unclear terms for those who use Globus |
| **Who sees each sign-in** | Baesian only | Globus, and the IdP (F8) | GitHub | the vendor | Globus for those who use it |
| **Moving off later** | nothing to move | accounts keyed to Globus IDs | accounts keyed to GitHub IDs | accounts held by the vendor | turn Globus off; every account still has a passkey |
| **Account strength** | the passkey, and email recovery | the weakest linked identity (F3) | GitHub's, with 2FA only for some (F12) | the vendor's settings | the passkey, and the weaker of email recovery or the linked Globus identity |
| **For a developer, the first user (D2)** | one passkey prompt | an organisation picker, then a provider, then a consent page (F4) | one click | one click | one passkey prompt, or Globus if they prefer |

## 3. Recommendation

**Recommended: E, Baesian accounts with passkeys, with "Sign in with Globus" as a second way in.** The strongest alternative is B, Globus for everyone.

**The direct answer to the user's question.** Running sign-in yourself is a risk, but most of it is unavoidable here, and passkeys remove the worst of it.
- *Unavoidable:* whatever handles sign-in, the service keeps every reviewer's passkey for hard cards (B-na7je). It also issues and revokes machine tokens for `baesian login`; Globus has no device flow, and its tokens shouldn't reach agents anyway (F5, F11).
- *Removed by passkeys:* the riskiest part of running accounts is stored passwords and phishing, and passkeys have neither (F10).
- *What Globus would take on:* account recovery and identity checks for the people who sign in through it, and university SSO for researchers (F2).
- *What Globus doesn't reach:* company SSO, without a Globus subscription for each company (F2).

**Why E:**
- *Every account works without Globus.* Each account has a passkey anyway, so a Globus outage or a change in Globus's terms strands nobody (F7, F9).
- *Researchers get their institution's login and its recovery.* That serves D2's later research users and the user's own university.
- *Developers, the first users (D2), aren't sent through a research broker's organisation picker and consent page* (F4).
- *Account strength stays close to the passkey.* Accounts that don't link Globus rest on the passkey and email recovery. For those that do, Baesian can accept only the one identity the person chose when linking, checked through the session information, not any of up to 20 (F3, F6).

**Its trade-offs:**
- *Two ways in to build and test,* and account linking to get right. Link a Globus identity only while the person is signed in. Never link by matching email addresses.
- *Baesian still runs recovery* for people who don't link Globus. That means email codes, and probably a saved recovery code, to reach NIST's AAL2 recovery (F10).
- *The Globus question isn't fully closed.* E still depends on Globus's terms for those who use it, and they're unconfirmed for users outside non-profits (F7).

**When B would be better.** If the user values not running recovery above independence from Globus, B removes Baesian's email recovery and verification. Every sign-in then rests on Globus and on each person's weakest linked identity. B also needs Globus to confirm it can be used free, by people at companies, for a non-research tool. A one-line question to support@globus.org would settle that. The user is at the university that runs Globus.

**Not recommended:**
- *A on its own:* it is E without the institutional sign-in.
- *C:* it shuts out people without GitHub, who include the domain experts the design expects.
- *D:* it adds a commercial dependency and per-connection SSO prices, without the federations.

**If E is chosen, what's needed:**
- a Globus app registration (a confidential client, scopes `openid` and perhaps `email`);
- matching on any identity in `identity_set`;
- a notice to the person, and a delay, before a newly enrolled passkey can sign hard-card answers;
- Globus named in the privacy policy;
- a prototype of passkeys on Workers (F14).

## 4. Open questions

- **Globus's terms for Baesian.** Is Globus Auth free for a non-research developer tool whose users include people at companies? Are there rate limits? Neither is published (F7). Ask support@globus.org.
- **Trusting a new passkey.** Under any option, how does a newly enrolled passkey come to sign hard-card answers? Options include a notice to the person, a waiting period, approval from an existing passkey, or a change to the repo's trust root (H4, H8). This is where recovery meets B-na7je.
- **Recovery for accounts without Globus.** Email codes alone (AAL1), or email codes plus a saved recovery code (AAL2)? Saved codes get lost; email alone is weaker (F10).
- **Which Globus identities to accept.** Any linked identity, or only one the person picks when linking, checked through the session information (F3, F6)?
- **What to ask Globus for.** Only `openid`, which already returns the identity set, or `email` and `profile` too? Data minimisation argues for less (F8; B-7bk6y's list of what's never collected).
- **Globus on a phone.** Do Globus's organisation picker and consent page work well inside the installed web app on iOS (D130)? Untested.
- **Company SSO later.** If teams ask for their own SSO, a commercial broker (F13) or Globus's alternate-IdP subscription (F2) could be added then. That isn't proposed for v1.
- **Not verified:** SimpleWebAuthn on Workers (F14); which algorithms real passkeys use; whether the University of Chicago and other target institutions release Research & Scholarship details to Globus (F2).

## 5. Sources

"Full" means the agent read the whole page, or the sections cited, through the fetch tool. "Partial" says what was read. All were accessed on 2026-11-02 or 2026-11-03.

1. Globus Auth Developer Guide. <https://docs.globus.org/api/auth/developer-guide/>. Full (read twice, for client types and flows, then for policies and native apps).
2. Globus Auth Specification. <https://docs.globus.org/api/auth/specification/>. Full.
3. Globus Auth API Reference. <https://docs.globus.org/api/auth/reference/>. Full.
4. Globus Auth Sessions Guide. <https://docs.globus.org/api/auth/sessions/>. Full.
5. Globus Auth OpenID Connect discovery document. <https://auth.globus.org/.well-known/openid-configuration>. Full.
6. Globus Auth User Guide. <https://docs.globus.org/guides/auth-user-guide/>. Full.
7. Globus CLI reference, `globus login`. <https://docs.globus.org/cli/reference/login/>. Full.
8. Globus FAQs: Security <https://docs.globus.org/faq/security/>; Identities <https://docs.globus.org/faq/identities/>; Subscriptions <https://docs.globus.org/faq/subscriptions/>. Full (all three).
9. Globus: Pricing <https://www.globus.org/pricing>; Subscriptions <https://www.globus.org/subscriptions>; Globus Auth service <https://www.globus.org/platform/services/auth>; Platform <https://www.globus.org/platform>. Full (all four).
10. Globus Terms of Service (updated 19 January 2022) <https://www.globus.org/legal/terms>; Privacy Policy (updated 2 December 2025) <https://www.globus.org/legal/privacy>. Full (both).
11. Globus maintenance notices: "Maintenance Downtime for Database Upgrades - Saturday, October 24th 2026" <https://www.globus.org/blog/2026-10-24-maintenance>; the same for Saturday, November 2, 2024 <https://www.globus.org/blog/maintenance-downtime-for-database-upgrades-saturday-november-2-2024>. Full (both).
12. Globus docs: Identity Provider Integration <https://docs.globus.org/guides/overviews/security/identity-provider-integration/>; High Assurance Security Overview <https://docs.globus.org/guides/overviews/security/high-assurance-overview/>. Full (both).
13. Stanford Research Computing, "Leaving Stanford" (Globus accounts), <https://github.com/stanford-rc/globus.stanford.edu/blob/main/accounts/leaving.md>. Full. A university's guide, not Globus's own.
14. CILogon, Subscriptions. <https://www.cilogon.org/subscribe>. Full (prices for 2026).
15. eduGAIN technical site, status. <https://technical.edugain.org/status>. Partial (the first 100,000 of about 136,000 characters).
16. NIST SP 800-63B-4, *Digital Identity Guidelines: Authentication and Authenticator Management*. <https://pages.nist.gov/800-63-4/sp800-63b.html> (page timestamped 26 August 2025). Partial (the first 200,000 of about 289,000 characters, through §4.6; Appendix B on syncable authenticators wasn't reached).
17. FIDO Alliance, "Passkeys". <https://fidoalliance.org/passkeys/>. Full.
18. GitHub docs: "Scopes for OAuth apps" <https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps>; "About mandatory two-factor authentication" <https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/about-mandatory-two-factor-authentication>. Full (both).
19. WorkOS, Pricing. <https://workos.com/pricing>. Full.
20. *oauth4webapi* README. <https://github.com/panva/oauth4webapi>. Full.
21. SimpleWebAuthn: server package docs <https://simplewebauthn.dev/docs/packages/server>; README <https://github.com/MasterKale/SimpleWebAuthn>. Full (both).
22. Cloudflare: *workers-oauth-provider* README <https://github.com/cloudflare/workers-oauth-provider> (full); Workers Web Crypto <https://developers.cloudflare.com/workers/runtime-apis/web-crypto/> and Workers secrets <https://developers.cloudflare.com/workers/configuration/secrets/> (partial: excerpts returned by Cloudflare's documentation search, including the supported-algorithms table).

Also cited: [[Hosted Service - Strand B5 Prior Art and Security]] (B5), F9 and F10, for the device flow and GitHub's tokens.

**Consulted but not relied on** (nothing above rests on these alone):
- NIH Data Commons pilot, Globus Auth response (2018-03-16), <https://public.nihdatacommons.us/KC6_Globus_Auth_Response_2018-03-16/>: search snippet only. It reportedly calls Globus Auth "a free service, available for use by the academic and research community". It's eight years old and unverified.
- Tuecke and others, the Globus Auth eScience 2016 slides, <https://www.globus.org/sites/default/files/GlobusAuth.pdf>: the PDF's text couldn't be extracted.
- status.globus.org: the name didn't resolve, so there are no uptime figures.
- REFEDS, Research and Scholarship entity category, <https://refeds.org/category/research-and-scholarship>, and eduGAIN's home page, <https://edugain.org/>: HTTP 403. InCommon's R&S page: HTTP 404. Search snippets describe the bundle as an email address, a name and a persistent identifier; unverified.
- University of Washington IT, "Authenticate users from other academic institutions", <https://it.uw.edu/guides/security-authentication/authn/federation/>: search snippet only.
- SimpleWebAuthn on JSR, <https://jsr.io/@simplewebauthn/server>, reportedly listing Cloudflare Workers: search snippet only.
- A Globus announcement (May 2026) of free Standard subscriptions for small non-profits: search snippet only; it concerns subscriptions, not Auth.
- Ohio Supercomputer Center and University of Pittsburgh notices of the October 2026 Globus downtime: search snippets only; Globus's own notice [11] was read instead.
