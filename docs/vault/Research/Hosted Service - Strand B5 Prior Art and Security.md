---
type: research
status: active
authority: reference
livedocs: snapshot
summary: "Strand B5 for the hosted service (D127–D132): prior art for local-first relays, MCP's security model, CLI sign-in and scoped tokens, signed answers that CI can check offline, phone approvals and web push, and what running it for others involves; with proposed (not decided) choices for each, and their trade-offs."
created: 2026-11-03
tags: [baesian, research]
---

# Hosted service: strand B5, prior art and security

Provenance: written by a research agent on 2026-11-03, one of five parallel strands after D132. The agent read the vault's design notes, then official specifications, RFCs, vendor documentation and a few papers and posts on the web. Sources are numbered [1]–[35] and listed in section 4, each with what was read. Quotes are exact as returned by the fetch tool; figures are quoted as their source gives them. Everything in section 2 is a proposal for decision cards, not a decision.

**Terms used throughout.** A *relay* passes data between parties and isn't the authority on it. *End-to-end encryption (E2EE)* means only the endpoints hold the keys, so the relay stores data it can't read. A *token* is a string a program sends to prove what it may do; its *scopes* list those things, and its *audience* names the service it's valid for. A *passkey* is a WebAuthn credential: a key pair kept by the phone, laptop or password manager, unlocked by a fingerprint, face or PIN. *User verification (UV)* is the authenticator checking that the person is the owner, not just that someone touched it.

## 1. Key findings

### Relays for local-first software

**F1. Local-first software already describes the role D127 gives the website: a server that helps and isn't the source of truth.** Kleppmann, Wiggins, van Hardenberg and McGranaghan (Onward! 2019) set out seven ideals, including "the network is optional" and "you retain ultimate ownership and control". Of servers they write: "Servers still exist, but they hold secondary copies of your data in order to assist with access from multiple devices," and they are "in a supporting role, not the source of truth" [1]. Their privacy ideal is the E2EE relay: "Local-first apps can use end-to-end encryption so that any servers that store a copy of your files only hold encrypted data that they cannot read" [1]. D127 (the repo owns its decisions, the website relays them, the commit gate and `baesian verify` work without it) is this pattern.

**F2. Real sync servers range from unauthenticated to end-to-end encrypted, and the encrypted ones are still research.**
- *Automerge's reference sync server* is, in its README's words, "an unsecured Express app", "partly for demonstration purposes" [3]. Access control is left to the application.
- *Keyhive and Beelay* (Ink & Switch) aim at "removing read access from sync servers altogether": the server can fetch ciphertext but not decrypt it [2]. Keyhive's sync notes say the server still learns structure: the commit-graph hashes sit outside the encryption, so "the sync server knows the heads" [2]. Its pre-alpha shipped in March 2025 with "DO NOT use this release in production applications" and "This code has also not been through a security audit at time of writing" [2]. A July 2026 guest post on BeeKEM, its group key protocol, shows the cost of working without a central server: keeping older secrets to survive concurrent changes "immediately eliminates forward secrecy" for κ > 1 [2].
- *Replicache* is the opposite model: "In Replicache, the server is authoritative," and clients converge on the server's state [4]. That is the model D127 rejected.
- *Git as the transport* is proven: git-bug keeps a bug tracker inside the repository, syncs through "your normal git remote", "works offline", and adds no files to the project [5]. It needs a git remote that every party can reach, which a phone can't.

**F3. Baesian's write-once files make the relay the easiest case there is.** Every card revision, verdict, withdrawal and ledger entry is an immutable file with a random ID, and status is computed, never stored ([[File Formats]]). Merging two copies is just taking the union of the files, so the relay needs no CRDT library (CRDTs are data types that merge concurrent edits automatically; a set that only grows is the simplest one). It needs three things: accept a file once under its ID (the same bytes again is a no-op, different bytes is an error, as with the store's exclusive create); give each accepted file a sequence number per repo; and answer "everything after number N". Keyhive needs its "sedimentree" because it compacts long edit histories of one document [2]; Baesian's files are small and independent, so it doesn't. The live layer's few mutable files (presence, waiting markers, cursors) become state the relay keeps for a short time, not files it stores.

**F4. E2EE is possible, but it conflicts with the other v1 plans, and it still leaks metadata.**
- *What an encrypted relay still sees:* who talks to whom, when, and how much. Web push's own encryption standard says so: "The timing and length of communication cannot be hidden from the push service" [29]. Keyhive's server learns graph heads, senders' public keys and timing [2].
- *What it blocks:* any server-side reading of a card. That includes a classification gate run by the service against the repo's preferences (D131, the user's current view), card text in notifications, server-side search, and support staff looking at a card. It does not block usage monitoring by counts and timings (D129), which needs only metadata.
- *Keys in a browser:* the WebAuthn PRF extension derives a secret from a passkey. Yubico's guide recommends using it as a key-wrapping key, which unwraps a shared data key, and says "A robust recovery strategy is non-negotiable" [22]. Support is uneven: the guide lists iCloud Keychain passkeys in Safari 18+ on macOS 15+ and iOS 18+, Chrome on Android over USB but not NFC, and no PRF with Windows Hello [22]. If every passkey is lost, the content is lost, though here the repo still has its own copy of the record.

### MCP security

**F5. MCP's authorization is for HTTP servers; a local stdio server takes its credentials from the environment.** All three recent revisions say: "Implementations using an STDIO transport SHOULD NOT follow this specification, and instead retrieve credentials from the environment" [6]. *stdio* means the client starts the server as a child process and talks over its standard input and output, so no network port is open. The revisions:
- *2025-06-18:* MCP servers are classified as OAuth resource servers, and clients must use resource indicators (RFC 8707) "to prevent malicious servers from obtaining access tokens" [6].
- *2025-11-25:* Client ID Metadata Documents become the recommended way for a client to identify itself, and scopes can be requested step by step [6].
- *2026-07-28 (current):* MCP becomes stateless. Sessions and the `Mcp-Session-Id` header are removed, and so is the `initialize` handshake. Dynamic Client Registration is deprecated, and clients must check the `iss` parameter (RFC 9207) [6].

  In both 2025-11-25 and 2026-07-28, "MCP servers MUST NOT accept or transit any other tokens" (no token passthrough), and tokens must be audience-checked. The 2025-11-25 text adds: "For public clients, authorization servers MUST rotate refresh tokens" [6]. The agent didn't open the page where 2026-07-28 moved its security considerations.

  For Baesian (D128), this means the local MCP server needs no OAuth of its own. It uses the token from Baesian's one-time sign-in, exactly as the CLI does.

**F6. The spec's advice for local servers matches what Baesian already does for `baesian serve`.** The security best practices list three local attacks: a malicious startup command in a client's configuration, a malicious server package, and "an insecure local server that's left running on localhost via DNS rebinding" [7]. Servers meant to run locally "SHOULD" "Use the `stdio` transport to limit access to just the MCP client", or else, over HTTP, "Require an authorization token" or use Unix domain sockets [7]. The 2026-07-28 page adds "State Handle Hijacking": "MCP servers MUST NOT treat possession of a state handle as authentication" [7]. Its other attacks (the confused deputy, passthrough, SSRF, mix-up, localhost redirect impersonation) arise in OAuth proxies and remote servers, which D128 avoids.

**F7. Tool results are untrusted text in the agent's context, and Baesian's answers are tool results.**
- *The spec:* the tools spec says clients SHOULD "Validate tool results before passing to LLM", keep "a human in the loop with the ability to deny tool invocations", and that "clients MUST consider tool annotations to be untrusted unless they come from trusted servers" [8].
- *Tool poisoning:* Invariant Labs showed instructions hidden in tool descriptions making an agent read `~/.cursor/mcp.json` and SSH keys. They also showed "rug pulls", where "a malicious server can change the tool description after the client has already approved it" [11].
- *The lethal trifecta:* Willison names three capabilities that together let an attacker steal data: private data, "Exposure to untrusted content", and "The ability to externally communicate". He argues guardrails that catch "95% of attacks" are a failing grade [12].
- *Baesian has all three legs once it is hosted.* The agent can read the repo. Verdict comments, and soon text written by other reviewers on the website, come back into its context. And `file_card` sends text to a server off the machine.

**F8. Claude Code and Codex keep MCP credentials in the OS store or a private file, and both can load servers without a prompt in some modes.**
- *Claude Code:* remote-server OAuth tokens "are stored securely and refreshed automatically" [9]. Its own login is kept "in the encrypted macOS Keychain", or else in `~/.claude/.credentials.json` with file mode `0600` [9]. It asks before using project-scoped servers from `.mcp.json` in interactive sessions. But "In `claude -p` runs, Agent SDK sessions, and cloud sessions … it loads project-scoped servers without asking" [9]. It reads credential variables as empty in a remote server's `url` and `headers`, so a repo's `.mcp.json` can't send them to a server it names [9].
- *Codex:* `mcp_oauth_credentials_store` takes `auto | file | keyring`. `bearer_token_env_var` sends a token from an environment variable. A confidential client's secret is saved in `config.toml`. `default_tools_approval_mode` takes `auto | prompt | writes | approve`, where `writes` "prompts for tools that aren't marked read-only" [10].

  For a stdio Baesian server, neither harness needs to hold a Baesian credential at all.

### Signing in from a CLI, and scoped tokens

**F9. The OAuth device authorization grant (RFC 8628) is the standard sign-in for CLIs and headless machines, and its main risk is remote phishing.** In this flow (the "device flow"), the CLI shows a short code and a URL. The person enters the code in any browser. Meanwhile the CLI polls for a token: by default every 5 seconds, and 5 seconds slower after each `slow_down` [13].
- *Brute force:* the RFC's example, "an 8-character base 20 user code (with roughly 34.5 bits of entropy)", needs rate limits [13].
- *Remote phishing:* a flow can be "initiated on a device in an attacker's possession", so "it is RECOMMENDED to inform the user that they are authorizing a device" [13].
- *GitHub's version:* an 8-character code with a hyphen, a 900-second expiry, and a limit of 50 code entries per hour per application [17].
- *The alternative:* when the browser is on the same machine, RFC 8252's loopback redirect works. The CLI listens on 127.0.0.1, any port, and uses PKCE (a one-time secret that stops a stolen code being redeemed) [14].
- *Storage:* `gh auth login` stores the token "securely in the system credential store", and if that fails, "gh will fallback to writing the token to a plain text file" [17].

**F10. Least-privilege tokens are well understood: narrow scopes, one repo, short lives, rotation.**
- *GitHub fine-grained tokens* can be "limited to only access specific repositories", get fine-grained permissions, and default to a 30-day expiry [18].
- *GitHub App installation tokens* "expire after 1 hour", and can be narrowed further with `repositories` and `permissions` [18].
- *GitHub App user tokens* expire "after eight hours, and the refresh token expires after six months". Refresh tokens are single-use [18].
- *RFC 9700* (BCP 240, January 2025): "Refresh tokens for public clients MUST be sender-constrained or use refresh token rotation". Access tokens "SHOULD be audience-restricted", with privileges "restricted to the minimum required" [15]. A CLI is a *public client*: it can't keep a secret from its user [13, 14]. *DPoP* (RFC 9449) is one way to sender-constrain a token. It binds the token to a key pair the client holds, to "prevent unauthorized or illegitimate parties from using leaked or stolen access tokens" [16].

**F11. Where a token is stored doesn't stop an agent using it. What the token can do does.** This is the agent's inference from [9], [17] and D62. The OS keychain protects a token from other users, and from a careless `cat` of a config file. It doesn't protect against a process running as the user that calls `baesian`, because the CLI reads the token for it. So "an agent's machine can file cards and hear answers but can never give an answer" holds only if the service refuses answers from any machine token. Node has no built-in keychain access, and the long-standard module, keytar, "was archived by the owner on Dec 15, 2022" [19]. Keychain storage means either a native dependency (a decision card under AGENTS.md) or a `0600` file, as Claude Code does on Linux [9].

**F12. Separating "who proposes" from "who approves" has close precedents.**
- *Deployment approvals:* GitHub environments take "up to six users or teams as reviewers", and "You also have the option to prevent self-reviews for deployments to protected environments" [26].
- *Sudo mode:* GitHub asks a signed-in user to authenticate again before high-impact actions. The check lasts two hours, and passkeys, security keys or GitHub Mobile can confirm it [26].

  The Baesian equivalent: the machine that files a card can never answer it, and answering needs a person, freshly verified for the cards that matter most.

### Answers the service vouches for

**F13. There are two ways to vouch for an answer: the service signs it, or the person's own key signs it.**
- *The service signs.* GitHub signs commits made in its web interface with its own GPG key, and they show as verified [26]. It also keeps a verification once made: "once a commit signature is verified, it remains verified within its repository's network", even after keys are rotated or revoked [26]. Trust rests on the service.
- *The person's key signs.* A WebAuthn assertion (the passkey's answer to a sign-in challenge) is a signature over "the concatenation authenticatorData || hash" of the client data, which contains the server's challenge [20]. Its flags record user presence (UP) and user verification (UV). A relying party that requires UV "will fail the overall ceremony if the response does not have the UV flag set" [20]. W3C's Secure Payment Confirmation uses exactly this "to produce cryptographic evidence that the user has confirmed transaction details" [21]. If the challenge is derived from the verdict's bytes, the passkey signs the answer itself. Anyone with the credential's public key can check it later, offline. Trust rests on the person's device, not on the service. Caveats: WebAuthn level 3 became a W3C Recommendation on 25 August 2026 [20]; SPC is still a Candidate Recommendation Draft [21]; and synced passkeys carry the "backup eligible" and "currently backed up" flags, so the key may live in a cloud password manager [20].

**F14. Checking a signature offline, against a public key in the repo, is already supported by standard tools.**
- *Git's allowed signers file:* git verifies SSH signatures against `gpg.ssh.allowedSignersFile`, and "A repository that only allows signed commits can store the file in the repository itself … This way only committers with an already valid key can add or change keys in the keyring" [25]. Keys can carry `valid-after` and `valid-before`, and "Git will mark signatures as valid if the signing key was valid at the time of the signature's creation" [25]. A revocation file marks keys as never trusted [25].
- *ssh-keygen:* `ssh-keygen -Y sign` and `-Y verify` sign and check any file, with a required namespace "used to prevent signature confusion across different domains of use" [25]. That is all a CI step needs: no network and no new service.
- *Sigstore* also verifies offline. `gh attestation verify --bundle … --custom-trusted-root trusted_root.jsonl` works against a downloaded root, which rotates "a few times per year" [23]. But Sigstore's model brings costs Baesian doesn't need. It ties signing to an OIDC identity: "If an OIDC identity or OIDC provider is compromised, Fulcio might issue unauthorized certificates" [23]. And "Fulcio MUST publish all certificates to the log", a public one, so each signing's identity and time would be public [23].
- *in-toto* gives a standard wrapper if interoperability is ever wanted: a Statement with `subject` (name and digest), `predicateType` and `predicate`. In its words, "Subject artifacts are matched purely by digest" [24].

**F15. A signature check is only as strong as the place its trust root lives.** If an agent can edit the allowed-signers file, or the setting that turns checking on, it can add its own key and forge answers. Git's own advice assumes signed commits guard that file [25]. Baesian's commits are made by agents, so the file in the repo can't be the only root. D62 rejected verdicts signed through the OS keychain, because the key would sit on the agent's machine. A hosted service moves the signing key off that machine, which changes the case.

### Approving from a phone

**F16. Push approval has a known failure, MFA fatigue, and the fix is to make each approval need information only the real requester has.**
- *The attack:* CISA defines MFA fatigue ("push bombing") as bombarding a user with push notifications "until the user either approves the request by accident or out of annoyance" [27].
- *Number matching:* the user must enter a number from the login screen into the app. It works by "Requiring access to the login screen to approve requests", and because "Each prompt generates a unique set of numbers", "generating multiple prompts is not effective" [27]. CISA calls it an interim measure behind phishing-resistant MFA [27].
- *Duo and GitHub:* Verified Duo Push asks for a 3- to 6-digit code [27]. GitHub Mobile confirms sudo mode by having you enter the numbers GitHub shows [26].
- *Baesian's equivalent* is a flood of cards from a looping or hijacked agent, answered by reflex. D86 already works like number matching: you choose before you see the agent's pick, so a one-tap "approve" doesn't exist. D91's "Read it first" wait and the hold on mythic cards add friction where stakes are high.

**F17. Web push works on iPhones only for Home Screen web apps, every push must show a notification, and payloads are small.**
- *Requirements:* on iOS and iPadOS 16.4+, the site must be added to the Home Screen with a manifest `display` of `standalone` or `fullscreen`. Permission must be asked "in response to direct user interaction", and no Apple Developer Program membership is needed [28].
- *No silent pushes:* Apple: "Safari doesn't support invisible push notifications. Present push notifications to the user immediately after your service worker receives them. If you don't, Safari revokes the push notification permission for your site" [28].
- *Limits:* the payload limit is 4 KB, and Apple's push service may hold a message "for 30 days or fewer" if the device is offline [28]. A `Topic` header lets a newer notification replace an older one [28].
- *Declarative Web Push* (iOS and iPadOS 18.4, announced March 2025) can show notifications without a service worker, and has "no penalty for service workers failing to display a notification" [28].
- *Android:* on Android, Chrome's push messages "will always be received", and "You have to show a notification when you receive a push message" [30]. Since October 2025, Chrome removes notification permission from sites with "very low user engagement and a high volume of notifications". Google's reason: "Less than 1% of all notifications receive any interaction from users". The feature "does not revoke notifications for any installed web apps" [30].
- *Privacy:* the payload is encrypted to the browser (RFC 8291), so Apple or Google can't read it, but the app server writes it in the clear [29].

**F18. How to ask for notification permission is settled advice.** Ask when the benefit is obvious, never on page load. Show your own explanation first, then the browser's prompt. And plan for refusal, because "if the user blocks the permission request, your web app can't ask for permission again" [30]. iOS adds a step before any of this: the person must first add the app to their Home Screen [28].

**F19. There is little evidence on swiping as a way to decide.** The agent found no study of card-swipe interfaces for consequential decisions. Two related studies, a CHI 2024 paper on tap versus swipe and a 2022 study of input methods in binary labelling, were behind paywalls. Their abstracts, as quoted in search results, report swipes as slower or less accurate than taps and a speed-accuracy trade-off. They are unverified here and nothing rests on them (section 4).

### Running it for others

**F20. Collecting usage data from a hosted developer tool brings a short list of GDPR duties, if any users are in the EU or UK.**
- *Principles (Article 5):* data must be "collected for specified, explicit and legitimate purposes" and "limited to what is necessary". It must be kept identifiable "for no longer than is necessary", kept secure, and the controller must "be able to demonstrate compliance" [31].
- *Lawful basis (Article 6):* a reason the law accepts. Running the service a person signed up for fits "performance of a contract". Usage monitoring would most likely rest on legitimate interests, which apply "except where such interests are overridden by the interests or fundamental rights and freedoms of the data subject" [31]. That calls for a written balancing test.
- *Processors (Article 28):* where an organisation's repos are on the service, the organisation is probably the *controller* of that content (it decides why it's processed) and the service its *processor*. That needs a contract covering the matters (a)–(h) of Article 28(3), including deleting or returning the data at the end [31]. Hosting providers are sub-processors, which need the controller's authorisation [31].
- *Not legal advice:* the agent isn't a lawyer, and US state privacy laws weren't covered.

**F21. Developer tools have a respected model for telemetry: local by default, opt-in uploads, a public list of what's counted.** Go's toolchain keeps telemetry "only on the local computer" by default; users "may opt in to uploading an approved subset" [32]. Only counters in a public upload config may be sent, and changes go through a public proposal process. New charts "can't carry sensitive user information". Uploaded data is published, and once enough users opt in, uploads are sampled [32]. Stack counters exclude "the names or contents of a user's source code" [32].

**F22. Keeping each tenant's data apart can be built into the storage or enforced by policy, and the two fail differently.** On Cloudflare, "A Durable Object's attached storage is private to its unique instance and cannot be accessed by other objects". Objects are single-threaded and addressed by a globally unique name [33]. One object per repo therefore separates repos by construction. In a shared PostgreSQL database, row-level security restricts rows per user and denies all by default with no policy. But "Superusers and roles with the `BYPASSRLS` attribute always bypass the row security system", and table owners do too unless forced [35]. A missing policy or an owner connection then exposes every tenant.

**F23. A small service can be hosted for a few dollars a month. Prices as published at the time of reading:**

| Option | Published price | Notes |
|---|---|---|
| Cloudflare Workers, Paid | $5 a month minimum; 10 million requests a month included, then $0.30 a million [33] | Free plan: 100,000 requests a day [33] |
| Durable Objects (SQLite) | Paid: 1 million requests a month included, then $0.15 a million; 5 GB-month stored, then $0.20 a GB-month [33] | The free plan "can only create and access SQLite-backed Durable Objects". Hibernating WebSockets avoid duration charges [33] |
| Cloudflare D1 | Paid: 25 billion rows read and 50 million written a month included; 5 GB, then $0.75 a GB-month [33] | One shared database, so isolation by policy (F22) |
| Fly.io | shared-cpu-1x: $2.19 a month at 256 MB, $6.70 at 1 GB; volumes $0.15 a GB-month; outbound data $0.02 a GB in North America and Europe [34] | "New organizations don't have a free tier" [34] |
| Hetzner Cloud | from €5.99 a month, excluding VAT [34] | A whole server to run and patch |

An illustration, the agent's arithmetic from these prices and not a measurement: 100 active machines, each polling every 30 seconds for 8 hours on 22 days, make about 2.1 million requests a month. On Workers that stays inside the included requests; on Durable Objects it is about $0.17 over the allowance. A small Baesian relay would sit near the $5 floor. Push delivery through Apple and Google costs nothing [28].

**F24. Buyers' security reviews ask for SOC 2, but an audit isn't a v1 concern.** SOC 2 reports against the AICPA's Trust Services Criteria: "Security, Availability, Processing Integrity, Confidentiality, or Privacy" (the title of the criteria document; the agent didn't open it) [section 4]. Vendor surveys about how often buyers ask weren't checked, so nothing here rests on them. What carries forward into a later audit is cheap now: an audit log of answers and sign-ins, least-privilege staff access, encryption, written retention, and a sub-processor list.

## 2. Recommendations for Baesian's hosted service

These are proposals for decision cards. Several are one-way doors once v1 publishes (D108, D132): the wire format, the token scopes, and the signature format all go to the user as cards.

### R1. The relay: an append-only store per repo for the files Baesian already writes

**Proposal.**
- *What it stores:* a per-repo log of the existing immutable files, keyed by their IDs. A file is accepted once, and a re-upload of identical bytes is a no-op.
- *How sync works:* the CLI pulls "everything after sequence N", and a WebSocket or long poll tells it when there's more. Presence and waiting markers are short-lived relay state, not files.
- *What it keeps:* only what's waiting (D127). A card's body stays until the card is resolved and its verdict is delivered and acknowledged by the CLI. After that the relay keeps only IDs, timestamps and sizes. The record in git is the archive.
- *Where it runs:* one Durable Object per repo, the agent's lean (F2, F3, F22, F23).

**Trade-offs.**
- *Simplicity:* union semantics and immutable files make the relay small and easy to test, with no CRDT library. The price is that every new kind of mutable live-layer state needs its own relay design.
- *Retention:* deleting bodies after delivery is the strongest privacy step available without E2EE (F20's storage limitation), and fits "the repo owns its decisions". The price is no history on the website; a phone can't browse old decisions unless the record is pushed up again.
- *Durable Objects versus a database:* one object per repo isolates by construction and costs about $5 a month, but ties the relay to Cloudflare's API. A VPS with SQLite or Postgres is portable, but needs patching and isolation by policy.
- **E2EE: decide before v1, as a card.** Proposed for v1: no E2EE. TLS, encryption at rest by the provider, short retention, and a secret scan when a card is filed (R4). The strongest alternative: E2EE, with a repo key wrapped by each device's passkey through PRF, or by a key in the CLI's store (F4). The crux: will the classification gate (D131) or any other feature need to read cards on the server? If it will, E2EE closes that door. If it won't, E2EE removes the biggest risk of hosting other people's code-adjacent text, at the cost of key recovery and uneven PRF support. Either way, reserve an `enc` envelope field in the wire format before v1, so E2EE can be added later without a migration.

### R2. Sign-in and token scopes

**Proposal.**
- *Sign-in:* `baesian login` uses the device flow (RFC 8628) everywhere, because it also works over SSH and on the Sparks cluster. It may use the loopback redirect (RFC 8252) when a browser is on the same machine (F9).
- *The approval page* names the machine (hostname, OS, IP-based location), the repo, and the scopes, with the words "you are authorizing a device" (RFC 8628 §5.4). User codes are rate-limited per account and per IP.
- *One grant per machine and repo:* a random project ID is written to `.baesian/config.json` by `baesian init`, and the token's audience is that project on the relay (F5, F10).
- *Lifetimes:* access tokens last about an hour. Refresh tokens are single-use and rotate on every use, and expire after a period of disuse. Reusing an old refresh token revokes the grant (RFC 9700). DPoP is optional, later.
- *Machine scopes:* `cards:file`, `cards:withdraw`, `answers:read`, `presence:read`. No machine token can ever carry an answer scope. The relay refuses answers that arrive with a bearer token, whatever its scopes.
- *Answering* needs a browser session made by signing in with a passkey. Its cookie uses a `__Host-` name, `Secure`, `HttpOnly` and `SameSite`, as MCP's own consent-cookie rules require [7]. Hard cards ask for user verification again with each answer, like sudo mode (F12).
- *Storage:* the token goes in the OS credential store, or a `0600` file where there is none (F11).
- *Revocation:* a "Machines" page on the website lists every grant, with its last use, and revokes it.

**Trade-offs.**
- *Device flow versus loopback:* the device flow is the only flow that works headless, but it is phishable. A prompt-injected agent could start a flow on an attacker's machine and ask the person to "approve the Baesian login". Showing the machine and the repo is the mitigation. Loopback can't be phished that way, but needs a browser on the same machine.
- *Scopes versus storage:* scopes, not storage, are the real boundary (F11). An agent can still file cards and read answers as the user, which is the intended capability. What it can't do is answer.
- *Keychain versus file:* the keychain needs a native module, a dependency card since keytar is archived. A `0600` file is what Claude Code uses on Linux [9], but anything that reads the user's files can take it.
- *Re-verifying for hard cards* adds a face or fingerprint per hard answer. It protects against an agent driving a signed-in browser, but slows the person on exactly the cards where slowing down is intended (D91's hold).

### R3. Answers the service vouches for

**Proposal: two layers, both checked offline.**
1. **The service signs every verdict.**
   - *Signing:* the relay writes the verdict file and signs its exact bytes with an Ed25519 key, as an SSH signature with the namespace `baesian-verdict` (`ssh-keygen -Y sign` format). The CLI stores the detached `.sig` beside the verdict in the live layer and the record.
   - *Checking:* `baesian verify` and the commit gate check it against an allowed-signers file, with `valid-after` and `valid-before` for key rotation and a revocation file (F14). Signing bytes rather than meaning avoids having to canonicalise JSON. Node's built-in `crypto` supports Ed25519 (the agent's knowledge, not checked against a source here), so neither side needs a new dependency.
2. **Hard cards also carry the person's passkey signature.** The relay sets the WebAuthn challenge to a hash of the verdict bytes plus a server nonce. The verdict's signature file stores `authenticatorData`, `clientDataJSON` and the signature. `baesian verify` checks it against the reviewer's enrolled credential public key, with the UV flag required (F13).
3. **The trust root lives outside the agent's reach.** CI takes the service's public key from a pinned value in its own configuration (a protected file, or a CI variable), not only from the repo. A change to the allowed-signers file is a gate fact that needs a hard card (F15). In hosted mode, an unsigned verdict file in the live layer doesn't count. That is how hosting makes D62's "only the client resolves" enforceable.

**Trade-offs.**
- *Service signatures* are simple and cover every card, but they say only "the service recorded this answer". Whoever controls the service key (the user, as operator) could mint answers.
- *Passkey signatures* say "this person's device, with their face or PIN, approved these bytes". But they rest on WebAuthn details that are easy to get wrong. They need each reviewer's public key enrolled in the repo, which reveals that a credential exists. And with synced passkeys, the key lives with Apple or Google (F13).
- *Sigstore* is rejected for answers: it would publish each signer's identity and time to a public log and depend on an OIDC provider (F14). It stays a good fit for signing Baesian's own releases.
- *in-toto envelopes* are optional, for interoperability later, and not needed for v1.

### R4. The local MCP server's security

**Proposal.**
- *Transport:* stdio only. No HTTP listener, no port, no localhost web socket (F6). The server is a thin layer over the store and the relay client, in the same process model as the CLI, and reads the token the same way (F5).
- *Tools:* `file_card`, `get_verdict` and `list_resolved` (as [[Baesian Design]] lists them). No answering tool, ever. `get_verdict` and `list_resolved` are marked read-only, so Codex's `writes` mode prompts only for `file_card` [10].
- *Tool descriptions* are fixed text shipped with each release and never fetched from the relay, which closes off rug pulls (F7).
- *Tool results:* reviewer comments and card text come back marked as data. They sit in a delimited field, labelled as written by a person or another agent, with a line saying the text is not an instruction. The plugin's skill tells the agent to treat an answer's comment as a reviewer's reasoning, never as commands to run. This reduces prompt injection; it doesn't prevent it (F7).
- *Before upload:* `file_card` and `baesian file` scan the card for secrets (key formats, high-entropy strings) and refuse to upload a match. The relay is a network sink, so `file_card` is the exfiltration leg of the trifecta (F7). Files per machine are rate-limited.
- *Configuration:* the plugin adds the server through the harness's own configuration. The docs warn that Claude Code loads project-scoped servers without asking in `claude -p` and SDK sessions (F8).

**Trade-offs.**
- *stdio versus HTTP:* stdio rules out other local processes and DNS rebinding, but each harness session starts its own server process. That's fine, since the live layer and relay are the shared state.
- *Marking results as data* costs a few tokens per result and is a mitigation, not a guarantee. The real limit is what an injected agent could do with an answer it reads: act on it in code, which the person reviews anyway.
- *The secret scan* will sometimes block an innocent card. An override flag needs a reason, recorded on the card.

### R5. Phone notifications

**Proposal.**
- *Delivery:* web push through the PWA. On iPhone, onboarding is "Add to Home Screen", then a "Turn on notifications" button, then the system prompt (F17, F18).
- *Content:* payloads carry no card text, only "2 cards waiting in baesian (1 hard)". A `Topic` per repo makes a newer push replace an older one (F17). Because Safari revokes permission when a push shows nothing, the relay never sends silent pushes for sync (F17).
- *What notifies when:* blocking and hard cards notify at once. Provisional cards go into a digest at most every few hours, and none while the person is present in a client (D41). Pushes per repo per hour are capped. A burst of cards from one machine pauses its pushes and shows "This machine has filed 30 cards in 10 minutes" (F16).
- *No answer buttons* in the notification. Opening the card is required, and D86's choose-before-reveal applies on the phone as everywhere (F16).
- *Fallback:* email for people who refuse push, or whose browser revoked it.

**Trade-offs.**
- *Text-free payloads* lose glanceability but keep code-adjacent text out of Apple's and Google's systems and off lock screens. RFC 8291 already hides it from the push services (F17), so the main exposure is the lock screen. A per-repo setting could allow titles.
- *Digests and caps* mean a provisional card may wait hours. That fits "provisional: carry on", and protects against Chrome's auto-revocation of noisy sites (F17), which spares installed web apps.
- *Requiring a Home Screen install* on iOS is friction no developer tool can avoid. Declarative Web Push (iOS 18.4+) can later remove the service-worker dependency (F17).

### R6. Data collection

**Proposal.**
- *What's collected:* counters and timings about decisions, never their content. Cards filed and answered per repo, response kinds, time to answer, need-more-context and overturn rates (the dogfooding metrics already in [[Baesian Design]]), client kind (phone or desktop), harness name, and errors. No card text, titles, topics, file paths or repo names in analytics. IDs are pseudonymous, per account (F20, F21).
- *Lawful basis:* contract for running the service. Legitimate interests for aggregate usage, with a written balancing test, an opt-out, and a public page listing every field, as Go does (F21).
- *Retention:*
  - card content until delivered and acknowledged, with a hard cap of, say, 30 days for undelivered content;
  - raw events, say, 90 days, then aggregates only;
  - access logs, say, 30 days.

  These are starting proposals, not sourced norms.
- *For organisations:* a data processing agreement template and a public sub-processor list (the host, the email sender) (F20).
- *Not yet:* a SOC 2 audit. Do keep an append-only audit log of sign-ins, grants and answers, which the signed verdicts (R3) largely are already (F24).

**Trade-offs.**
- *Metadata only* is enough to monitor usage (D129), fits E2EE if chosen later, and keeps the privacy policy short. It can't answer questions about card quality from content. That has to come from opted-in repos (dogfooding) or from the record in git.
- *Legitimate interests* with an opt-out is the usual basis for product analytics but needs the written test. Consent-only collection is cleaner legally but yields far less data.

### Hosting, in one line

Cloudflare Workers with one SQLite Durable Object per repo fits R1 to R6: isolation per repo, WebSockets that hibernate, about $5 a month at small scale, and push and email through standard APIs. Its strongest alternative is a small VPS or a Fly.io machine with SQLite, which is portable but adds operations work (F22, F23). Spending, sign-ups and publishing are hard cards (AGENTS.md).

## 3. Open questions

- **E2EE versus server-side features.** Does the classification gate (D131, another strand) run on the relay, in the agent, or in the CLI? The answer decides R1's crux.
- **Who may answer.** One person per repo, or teammates with roles? Multiple reviewers (the design's "Identity and trust" and "Reviewer disagreement" questions) change the scopes, the signing (whose passkey?), and Article 28's roles.
- **Offline answering.** In hosted mode, should the local client (`baesian serve`) still be able to answer when the relay is down? If so, how is its answer vouched for: a local passkey signature, or not at all?
- **Enrolling a passkey in the repo.** Is a reviewer's credential public key in `.baesian/` acceptable, given it is a stable identifier? Or should only the service's key be in the repo, and passkey assertions be checked by the service?
- **The trust root in CI.** Where exactly does CI pin the service key so an agent can't change it: branch protection with CODEOWNERS, a CI variable, or a well-known URL fetched at check time? The last needs the network.
- **The repo's identity.** Is a random project ID in the committed config enough, or should a grant also bind to the git remote URL? Forks and mirrors would share the ID.
- **Data residency.** Do EU users need EU-only storage? Durable Objects take location hints [33]; jurisdiction controls weren't checked.
- **Abuse of open sign-up.** Rate limits and bot checks for accounts, and a cap on cards per free account.
- **Not verified:** whether keyless PRF and passkey support is enough on the phones the expected users have (F4); the swipe-accuracy studies (F19); SOC 2 demand among developer-tool buyers (F24).

## 4. Sources

"Full" means the agent read the whole page or the sections cited. "Partial" means part of a long page was read, as stated. All were accessed on 2026-11-02 or 2026-11-03.

1. Kleppmann, Wiggins, van Hardenberg, McGranaghan. *Local-first software: you own your data, in spite of the cloud.* Onward! 2019. <https://www.inkandswitch.com/essay/local-first/>. Full.
2. Ink & Switch, *Keyhive* lab notebook: index <https://www.inkandswitch.com/keyhive/notebook/>; 05 "Syncing Keyhive" (2025-03-13) <https://www.inkandswitch.com/keyhive/notebook/05/>; 06 "E2EE in the Local-First Setting", Derek Yen (2026-07-31) <https://www.inkandswitch.com/keyhive/notebook/06/>. Full (all three).
3. *automerge-repo-sync-server* README. <https://github.com/automerge/automerge-repo-sync-server>. Full.
4. Replicache, "How Replicache works". <https://doc.replicache.dev/concepts/how-it-works>. Full.
5. *git-bug* README. <https://github.com/git-bug/git-bug>. Full.
6. Model Context Protocol specification. Authorization, 2025-11-25 <https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization> and 2026-07-28 <https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization>; changelogs 2025-06-18 <https://modelcontextprotocol.io/specification/2025-06-18/changelog>, 2025-11-25 <https://modelcontextprotocol.io/specification/2025-11-25/changelog>, 2026-07-28 <https://modelcontextprotocol.io/specification/2026-07-28/changelog>; versioning <https://modelcontextprotocol.io/specification/versioning>. Full (all).
7. MCP Security Best Practices, 2025-11-25 <https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices> and 2026-07-28 <https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices>. Full (both).
8. MCP specification, Tools, 2025-11-25. <https://modelcontextprotocol.io/specification/2025-11-25/server/tools>. Full.
9. Claude Code docs: "Connect Claude Code to tools via MCP" <https://code.claude.com/docs/en/mcp> (partial: the first 100,000 of about 155,000 characters); "Authentication" <https://code.claude.com/docs/en/authentication> (full).
10. Codex docs: MCP <https://learn.chatgpt.com/docs/extend/mcp?surface=cli> (full); configuration reference <https://learn.chatgpt.com/docs/config-file/config-reference> (partial: the first 100,000 of about 167,000 characters). Both were reached by redirect from developers.openai.com.
11. Invariant Labs, "MCP Security Notification: Tool Poisoning Attacks" (2025-04-01). <https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks>. Full.
12. Simon Willison, "The lethal trifecta for AI agents" (2025-06-16). <https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/>. Full.
13. RFC 8628, *OAuth 2.0 Device Authorization Grant*. <https://www.rfc-editor.org/rfc/rfc8628.html>. Full.
14. RFC 8252, *OAuth 2.0 for Native Apps*. <https://www.rfc-editor.org/rfc/rfc8252.html>. Full.
15. RFC 9700, *Best Current Practice for OAuth 2.0 Security* (BCP 240, January 2025). <https://www.rfc-editor.org/rfc/rfc9700.html>. Partial (the first 100,000 of about 142,000 characters; the cited sections 2.2 and 2.3 were read).
16. RFC 9449, *OAuth 2.0 Demonstrating Proof of Possession (DPoP)* (September 2023). <https://www.rfc-editor.org/rfc/rfc9449.html>. Partial (abstract, introduction, objectives).
17. GitHub: "Authorizing OAuth apps" (device flow) <https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps>; GitHub CLI manual, `gh auth login` <https://cli.github.com/manual/gh_auth_login>. Full (both).
18. GitHub: "Managing your personal access tokens" <https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens>; "Generating an installation access token for a GitHub App" <https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app>; "Refreshing user access tokens" <https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens>. Full (all three).
19. *node-keytar* repository (archived). <https://github.com/atom/node-keytar>. Full.
20. W3C, *Web Authentication: An API for accessing Public Key Credentials, Level 3* (Recommendation, 25 August 2026). <https://www.w3.org/TR/webauthn-3/>. Partial (status, terminology, §5, §6.1 flags, §6.3.3, §7.1, read in four parts; §7.2 and §13.4.3 on challenges weren't reached).
21. W3C, *Secure Payment Confirmation* (Candidate Recommendation Draft, 13 October 2026). <https://www.w3.org/TR/secure-payment-confirmation/>. Partial (the first 100,000 of about 200,000 characters).
22. Yubico, "A Developer's Guide to Deriving Keys with WebAuthn PRF". <https://developers.yubico.com/WebAuthn/Concepts/PRF_Extension/Developers_Guide_to_PRF.html>. Full (undated; platform notes "as of mid-2025").
23. Sigstore: overview <https://docs.sigstore.dev/about/overview/>, security <https://docs.sigstore.dev/about/security/>, cosign verifying <https://docs.sigstore.dev/cosign/verifying/verify/>; GitHub, "Verifying attestations offline" <https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/verify-attestations-offline>. Full (all four).
24. in-toto Attestation Framework, spec README (v1.2) <https://github.com/in-toto/attestation/blob/main/spec/README.md> and Statement v1 <https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md>. Full (both).
25. Git and OpenSSH manuals: `git-config(1)`, `gpg.ssh.allowedSignersFile` and `gpg.ssh.revocationFile` <https://git-scm.com/docs/git-config>; `ssh-keygen(1)`, `-Y sign`, `-Y verify`, ALLOWED SIGNERS <https://man.openbsd.org/ssh-keygen>. Full, read from the man pages installed on the user's Mac. The online page was too long for the fetch tool; the installed versions may differ slightly from the latest.
26. GitHub: "About commit signature verification" <https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification>; "Deployments and environments" <https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments>; "Sudo mode" <https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/sudo-mode>. Full (all three).
27. CISA, *Implementing Number Matching in MFA Applications* (October 2022) <https://www.cisa.gov/sites/default/files/publications/fact-sheet-implement-number-matching-in-mfa-applications-508c.pdf> (full, text extracted from the PDF); Duo, Policy guide, Verified Duo Push <https://duo.com/docs/policy> (partial: the second half of the page, where Verified Duo Push is).
28. Web push on Apple platforms: WebKit, "Web Push for Web Apps on iOS and iPadOS" (Eidson and Simmons, 2023-02-16) <https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/>; Apple, "Sending web push notifications in web apps and browsers" <https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers> (read through Apple's JSON documentation endpoint); WebKit, "Meet Declarative Web Push" (Eidson, 2025-03-27) <https://webkit.org/blog/16535/meet-declarative-web-push/>. Full (all three).
29. RFC 8291, *Message Encryption for Web Push* (November 2017). <https://www.rfc-editor.org/rfc/rfc8291.html>. Full.
30. Chrome and the web: Matt Gaunt, "Push notifications on the open web" <https://developer.chrome.com/blog/push-notifications-on-the-open-web> (full; undated and self-described as old); Archit Agarwal, "Reducing notification overload…" (Google, 2025-10-10) <https://blog.google/chromium/automatic-notification-permission/> (full); Matt Gaunt, "Permission UX" <https://web.dev/articles/push-notifications-permissions-ux> (full; undated).
31. GDPR (Regulation (EU) 2016/679), Articles 5, 6 and 28, as reproduced at <https://gdpr-info.eu/art-5-gdpr/>, <https://gdpr-info.eu/art-6-gdpr/>, <https://gdpr-info.eu/art-28-gdpr/>. Full. This is a widely used reproduction of the official text, not EUR-Lex itself.
32. Go, "Go Telemetry". <https://go.dev/doc/telemetry>. Full.
33. Cloudflare: "What are Durable Objects?" <https://developers.cloudflare.com/durable-objects/concepts/what-are-durable-objects/>; Durable Objects pricing <https://developers.cloudflare.com/durable-objects/platform/pricing/>; Workers pricing, including D1 <https://developers.cloudflare.com/workers/platform/pricing/>. Full (all three).
34. Fly.io pricing <https://docs.fly.io/about/pricing> (full); Hetzner Cloud <https://www.hetzner.com/cloud/> (full; the page gives only "from" prices).
35. PostgreSQL documentation, "Row Security Policies". <https://www.postgresql.org/docs/current/ddl-rowsecurity.html>. Full.

**Consulted but not relied on** (nothing above rests on these alone):
- Jazz encryption docs, <https://classic.jazz.tools/docs/react/reference/encryption>: search snippet only. It says data is encrypted "even on Jazz Cloud servers", with keys rotated when a member is removed. Unverified.
- Beelay and Subduction repositories, <https://github.com/automerge/beelay>, <https://github.com/inkandswitch/subduction>: search snippets only. Subduction is reportedly Beelay's successor. Unverified.
- Shapiro, Preguiça, Baquero, Zawirski, *A comprehensive study of Convergent and Commutative Replicated Data Types* (INRIA RR-7506, 2011), <https://inria.hal.science/inria-00555588>, the standard reference for the grow-only set: couldn't open (a bot wall).
- Yamanaka et al., "Behavioral Differences between Tap and Swipe…", CHI 2024, <https://doi.org/10.1145/3613904.3642272>: couldn't open (HTTP 403); search snippet only.
- "Effect of the User Input Method on Response Time and Accuracy in a Binary Data Labeling Task", *International Journal of Human–Computer Interaction* 40(3), <https://www.tandfonline.com/doi/abs/10.1080/10447318.2022.2128943>: couldn't open (HTTP 403); search snippet only.
- EDPB, Guidelines 1/2024 on legitimate interest, consultation page <https://www.edpb.europa.eu/our-work-tools/documents/public-consultations/2024/guidelines-12024-processing-personal-data-based_en>: page only, PDF not opened.
- ICO guidance on legitimate interests: couldn't open (HTTP 403).
- AICPA, *2017 Trust Services Criteria (With Revised Points of Focus – 2022)*, <https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022>: title and listing only.
- GitHub changelog, "Reviewing Deployments on GitHub Mobile" (2021-04-01), <https://github.blog/changelog/2021-04-01-reviewing-deployments-on-github-mobile/>: search snippet only.
- Vendor statistics on SOC 2 demand (Secureframe, Drata and others): search snippets only, vendor-published.
