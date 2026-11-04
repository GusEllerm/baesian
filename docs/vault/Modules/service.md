---
type: module
status: active
authority: describes
summary: "service/: the hosted service. The relay (M9b), a Cloudflare Worker with one Durable Object per project on SQLite (D140), in this repo with its own package (B-pjw5y), running Baesian's own store over each project's files (B-0ag7h), taking uploads, keeping the append-only log, serving the state (B-17wn9), live updates (B-bv49e), and writing what a person answers, signed (D138, D160). Accounts and sign-in (M9c) in one D1 database (B-ytdt2): sign-up with an email and a passkey or through Globus (D153, D176), passkey sign-in (SimpleWebAuthn, B-jp22m), recovery with an emailed code and a saved recovery code (B-jzgy4), sign-ins that last 30 days unused (B-vtr1r), machine grants by OAuth's device flow (B-84e0d, B-t5wxr), Turnstile and limits (B-1a03b, B-mz6qc), and answers proved by the reviewer's passkey (D139, D163)."
created: 2026-11-03
updated: 2026-11-04
reviewed: 2026-11-04
tags: [baesian, module, hosted]
---

# service/: the hosted service (M9b, M9c)

The design is [[Hosted Service]] sections 1 to 4 (P15) and [[Formats for v1]] sections 7 and 8 (P16), as the cards in deck `hosted` decided them: Workers and an object per project (B-rca1z, D140), the service in this repo with its own package (B-pjw5y), the store run over the relay's storage (B-0ag7h) to serve the state as `baesian serve` does (B-17wn9), every relay address under `/v1/projects/{project}/` (B-7z97x), hibernating WebSockets for live updates (B-bv49e), and tests in workerd (B-hx2fn). M9c added accounts and sign-in, as D153, D176 and the cards below decided them. Nothing is deployed: that's M9f. The formats, the account tables and how to run it locally are in [[File Formats#The relay (M9b)]] and [[File Formats#Accounts (M9c)]].

The package is `service/`, with `service/wrangler.jsonc` and its own `service/package.json`. Its runtime dependencies are `@simplewebauthn/server` (B-jp22m) and `oauth4webapi` (B-s76hg); `wrangler`, `@cloudflare/vitest-plugin` and `vitest` are for development. It imports the store, the schemas and the state from `src/` as they are, and resolves their own dependencies (zod, yaml) from the root's installed packages, so the root's `npm ci` comes first.

## The Worker (service/src/index.ts)

**`handleRequest()`** takes every request, with the services it's given (`Services`: sign-in, the accounts database, the mailer, Turnstile and `fetch`), which `servicesFor()` makes from the environment; a test hands in its own mailer, to read the codes, and a stand-in for Globus. Addresses under `/v1/projects/{project}/` go to the project's object (below); the rest of `/v1/` to accounts and sign-in, `signInRoute()` and `machinesRoute()`.

**`ProjectRelay`** is the Durable Object class, on SQLite (`service/wrangler.jsonc#migrations`). It learns its project on first use and serves no other. Each method builds a `Relay` over its files and runs it; when the project's version moved, it tells every socket (`changedMessage()`). Its signing key comes from the secret `SERVICE_SIGNING_KEY` (`ServiceSigner.fromEnv`); without one it serves what it holds and refuses every write, with 503.

| Address | Who | What |
|---|---|---|
| `GET log?after={seq}&limit={n}` | machine or person | the log's entries after a sequence number, up to 1,000 at a time: `{ entries, head, more }` (`Relay.log`) |
| `PUT files/{path}` | machine | uploads a file an agent writes (`Relay.upload`): 201 with its entry, less the bytes; 200 for the same bytes again; 409 for other bytes at the path; 403 for a kind a machine doesn't write; 400 or 422 for one the store can't read. Also, until the first answer on the website, the answers from before linking (B-3zjjx, below); after it, 403 with `before_linking: "closed"` |
| `DELETE files/waiting/{name}` | machine | a waiting marker stops (`Relay.stopWaiting`); nothing else is removed |
| `GET state` | machine or person | the state, `ApiState`, as `baesian serve`'s `/api/state` (`Relay.state`) |
| `GET presets` | machine or person | the presets and the survey, as `/api/presets` (`Relay.presets`) |
| `GET live` | machine or person | a hibernating WebSocket (below); without `Upgrade: websocket`, 426 |
| `POST verdicts` | person | an answer (`Relay.verdict`), taking the local server's fields (`VERDICT_FIELDS`) and `client`: 201 with the verdict, the card's status and the cards Baesian filed after it; or 202 when it takes the passkey (below) |
| `POST aliases` | person | a topic merge, `{ from, to }` (`Relay.alias`) |
| `POST preferences` | person | a preference change (`Relay.preferences`), the local server's fields (`PREFERENCE_FIELDS`); 409 when made from an older view; 202 when it lets more cards past you |
| `POST proofs` | person | `{ pending, response }`: the passkey's assertion for an answer waiting for it (`Relay.prove`): 201 as the answer would have been, 202 for the next file to prove, 409 if the project changed meanwhile |
| `POST presence` | person | the reviewer's heartbeat (`Relay.presence`), 204 |

## The storage (service/src/sql-storage.ts)

**`SqlFileStorage`** is the store's `Storage` over the object's SQLite, B-0ag7h's second kind of storage. Five tables: `files`, one row per path with its bytes; `log`, the append-only log; `meta`, the project and its version; `pending`, answers waiting for the passkey; and `before_linking`, the answers a machine uploaded from before linking (B-3zjjx).
- **`SqlFileStorage.create`** is an INSERT, so a taken path throws `FileExists`. In the same transaction it signs the file if the service signs its kind, writing its `.sig` beside it, and adds the file's entry to the log. A `.sig` is never its own entry: it rides in its file's, as `sig`. Nobody else writes one.
- **`SqlFileStorage.replace`** is an INSERT OR REPLACE, and **`SqlFileStorage.remove`** a DELETE; neither is logged. **`SqlFileStorage.list`** is a range query, from `dir/` up to `dir0`, giving the distinct next segment. Paths go through `checkPath()`, as memory's do.
- **`SqlFileStorage.after`** reads the log: each entry joined with its file's bytes and its `.sig`, so retention (M9f) can drop a body and keep the rest of the entry (D137). Each entry is checked by `readRelayEntry()` on the way out.
- **`SqlFileStorage.transaction`** runs a whole answer or upload in one `transactionSync`, so if anything throws, nothing it wrote is kept, log entries and version included. **`SqlFileStorage.asMachine`** names the uploading machine in the entries written (D162). **`SqlFileStorage.version`** moves with every write but the reviewer's heartbeat, as the local server ignores `presence.json`, and is kept in SQLite, so it never goes back after an eviction. **`SqlFileStorage.putPending`** keeps a composed answer for five minutes, apart from the live layer. **`SqlFileStorage.asBeforeLinking`** writes an answer from before linking unsigned, and lists it in `before_linking`, which marks its entry (`before_linking: true`); **`SqlFileStorage.beforeLinking`** gives that list, and **`SqlFileStorage.answered`** whether anything in `verdicts/`, `rules/`, `topics/` or `preferences/` has the service's signature yet, that is, whether a person has answered on the website.

## One project's relay (service/src/relay.ts)

**`Relay.store`** is the project's store: `Store.over` the project's files, on the branch `RELAY_BRANCH` (`relay`), with the config `{ service, project }`, and pinned as CI pins them: the service's own key (`ServiceSigner.trust`), and the passkey key files the relay itself put in the project's `trust/`, each checked against the service's signature. So it counts what a machine with the pin counts, passkey proofs included. Everything a person writes goes through it, as the local client's answers do.

- **The answers from before linking (B-3zjjx, M9e)** are the one exception to "a machine never uploads an answer" (Hosted Service section 3), bounded: at first link the CLI uploads the answers, rules, rule retirements, topic merges and preference files that count on its machine as from before linking (B-45xz8), and the relay takes them (`BEFORE_LINKING_KINDS`, `beforeLinkingKind()`) only while `SqlFileStorage.answered` says nobody has answered on the website. Each is checked as an upload is, must match its path, and must name no account or project, which only the website's answers do. It's kept unsigned and apart (`SqlFileStorage.asBeforeLinking`), and **`Relay.store`** counts it, as B-45xz8 counts the record at the linking commit on a machine (`StorageOptions.beforeLinking`), so its card shows as decided, marked `before_linking` in the state. Every other machine pulls it and counts it only where its own record at the linking commit holds it. The risk accepted: in that window, an agent with the machine's token could put an answer nobody gave on the website, labelled as from before linking; no machine counts it, and nothing more is taken once anyone answers there.
- **Uploads** take only the kinds an agent writes (`AGENT_KINDS`, `agentKind()`): card revisions, the CLI's gate records, withdrawals, fallbacks, attachments, decks, and waiting markers. Each is read as the store reads its kind, through `upgradeFile()` and the kind's schema, and its fields must match its path; a revision needs the one before it, and a withdrawal, fallback, attachment or marker its card (`uploadProblem()`). Everything a person writes, signatures, trust files and the relay's gate records are refused by name (`notAgentWritten()`). A waiting marker is mutable state, replaced, never logged.
- **Writes** run in one transaction (`Relay.write`, private). The first write to a project puts the service's key in its layer, `trust/service-<key>.json`, so a machine's first pull has it before anything signed; every card revision written, uploaded or filed by Baesian, gets the relay's gate record, `Store.relayGate`, with its draw from `ServiceSigner.draw`.
- **An answer** names the session's account and handle, the project (B-tf9fc) and the card revision's digest (B-f571v), and the client, `hosted-desktop` unless the page says `hosted-phone` (D130). The relay's storage signs the verdict and whatever the answer writes beside it: a rule from an accepted draft, a rule's retirement, a slider proposal's preference file. Then Baesian's own proposals are filed, as the local server files them (`afterVerdict()`); their failure never fails the answer. Their cards name the branch `relay`.

### Answers that take the passkey (D139, D163, M9c)

An answer on a card whose level in force is hard, whatever its response, and a preference file that lets more cards past you (a change, or an accepted slider proposal) take the reviewer's passkey. The relay finds them as it writes (`Relay.verdict` and `Relay.preferences` both run the answer the same way):
1. **Composed.** The answer runs through the store in a transaction; what it wrote that needs a proof is noted, by kind and SHA-256 digest, in the order written, and nothing is kept. The relay keeps the answer, its time and those digests for five minutes (`Pending`), and replies 202: `{ passkey: { pending, proving, step, of, challenge, options } }`. The challenge is the first file's digest, base64url, so the passkey signs exactly those bytes (P16 section 7); the Worker adds the browser's options for `navigator.credentials.get()`: the account's passkeys, user verification required.
2. **Signed.** The browser's assertion comes back to `POST proofs`. The Worker checks it with SimpleWebAuthn (`verifyAssertion()`) against the account's own passkey and that digest, and moves the passkey's counter.
3. **Written.** With every file proved (accepting a slider proposal that loosens is two: the verdict, then the preference file), `Relay.prove` runs the answer again, at the time it was composed, in one transaction: its bytes must be the ones the passkey signed, or the project changed meanwhile (`Changed`, 409: the card was answered again, or the preferences moved). Each proof is written beside its file, `<file>.passkey.json` (`PasskeyProof`), the passkey's key file is put in `trust/` if it isn't there, and each file must then count by `Store.judge`, M9a's own checks, `proofProblem()` among them, before anything is kept.

So **the relay can hold cards back**: a passkey-proved preference change counts in its store, and its gate record (`Store.relayGate`) holds what the new settings let past (B-sa8tg).

**Passkey key files** (`Relay.putKeys`): each of an account's passkeys, `trust/passkey-<12 hex>.json` named for its credential (`keyFileName()`), the same bytes in every project, signed. They're put in every project the account owns when a passkey is enrolled or a project is made, and again with each proof. The CLI pulls them; CI pins each by hand (D159), with the line the website gave at enrolment.

## Signing (service/src/signer.ts)

**`ServiceSigner`** holds the service's Ed25519 key, PKCS #8 in PEM, from the secret. **`ServiceSigner.sign`** signs a file of a kind the service signs (`signedFile()`) as `signMessage()` does, OpenSSH's armored format in the `baesian` namespace; **`ServiceSigner.draw`** signs a card revision in `baesian-draw` (`drawMessage()`) and reads the draw from that signature; **`ServiceSigner.serviceKey`** is the key's trust file, from `SERVICE_KEY_ID`, `SERVICE_ORIGIN`, `SERVICE_RP_ID` and `SERVICE_KEY_VALID_AFTER`. With the stand-in's key (`test/service.ts`), the relay's gate records and signatures are its bytes, but for the time.

## Live updates (B-bv49e)

`GET live` is accepted with `ctx.acceptWebSocket`, so an idle socket costs no duration. On opening it's told the version, `{"type":"changed","version":N}`, and again after every request that moved it; the client reads the state again, as it does on the local server's `changed` event. A `ping` is answered `pong` by the runtime (`setWebSocketAutoResponse`). Sockets survive the object's eviction, hibernated, and hear the next change.

## Who may do what (service/src/access.ts)

**`Access`** says who a request is from: `Access.identify` gives a **`Principal`**, a session (a person in a browser: account and handle, and the project the address names if the account may answer there) or a machine (a grant: machine, account, project), or nobody. **`accountAccess()`** is the real one (M9c): a bearer token is a grant's access token (`Accounts.grantByAccess`), and otherwise the cookie `SESSION_COOKIE` (`__Host-baesian-session`) is a sign-in (`Accounts.session`); in v1 a session may answer only in a project its account owns. **`handleRequest()`** enforces Hosted Service section 3 whatever implements it:
- an answer (`verdicts`, `aliases`, `preferences`, `proofs`, `presence`) refuses any request with an `Authorization` header, whatever it holds, before anyone is identified, so no token can answer;
- a person's request must come from the website's own pages (`crossSite()`): `Sec-Fetch-Site`, when sent, must be `same-origin` (or `none`), an `Origin`, when sent, must be `SERVICE_ORIGIN`, and anything that changes something must send one. SameSite=Strict keeps the cookie off other sites' requests too;
- only a machine uploads, and only a session answers; each grant is for one project, and a session reaches only its account's projects (403 otherwise); nobody signed in is 401.

**`accessFor()`** picks the implementation: `accountAccess()` whenever there's an accounts database; and only when `BAESIAN_ENV` is `development` (a local run, from `.dev.vars`) or `test`, with grants given in `BAESIAN_DEV_ACCESS`, M9b's stand-in beside it (`devAccess()`, `readGrants()`, `eitherOf()`): fixed machine tokens and session cookies, each for one project. `wrangler.jsonc` makes production the default (unset counts too), where only real sign-ins count. With no accounts database at all, `NO_ACCESS` refuses everyone.

## Accounts (service/src/accounts.ts)

**`Accounts`** is the D1 database (B-ytdt2), its tables in `service/migrations/` and [[File Formats#Accounts (M9c)]]. Every secret is kept as its SHA-256 (`hashOf()`, `service/src/secret.ts`): session and machine tokens, emailed codes, recovery codes, flow secrets. **`LIMITS`** holds every lifetime and count:
- a sign-in ends after 30 days unused or 90 days in all (B-vtr1r); its last use is written at most every 5 minutes; it keeps a name ("Firefox on a Mac", `browserName()`) and its last use, nothing about where it came from (B-7bq05);
- what asks for the passkey afresh (adding a passkey, linking Globus, approving a machine) takes a check in the last 5 minutes (`Accounts.fresh`); signing in counts as one;
- an emailed code is six digits, works for 15 minutes and 5 tries (`Accounts.tryCode`), and an address gets at most 5 codes an hour and 10 a day (`Accounts.codesSent`); a sign-up or recovery, once checked, has an hour to enrol its passkey; a passkey ceremony, 5 minutes;
- a recovery code is 20 characters of Crockford's base32, in four groups (`recoveryCode()`), replaced each time it's used;
- a machine's access token lasts an hour; its grant lapses after 30 days unused; a request to sign in waits 10 minutes, polled every 5 seconds.

A flow (`Flow`) is a sign-up, recovery, sign-in, fresh check, enrolment or Globus round trip in progress, found by the hash of the secret its browser holds. **`Accounts.refresh`** rotates a grant's tokens in one conditional batch; a refresh token used again, or twice at once, revokes its grant (RFC 9700).

## Sign-in for the website (service/src/signin.ts)

JSON for the website's pages (M9e) to call; `signInRoute()`. Every one refuses a request from another site, and one with an `Authorization` header; the ones before sign-in are limited per network address (`LIMIT_ADDRESS`, 30 a minute), which is used in passing and never stored.

| Address | What |
|---|---|
| `GET /v1/config` | the origin, the relying party, Turnstile's site key, and whether Globus is on |
| `POST /v1/signup/email` | `{ email, turnstile }`: Turnstile (B-1a03b), the limits per address (`LIMIT_EMAIL`, 3 a minute, and the hourly cap), then a code by email; an address with an account gets a notice instead, and the reply is the same: `{ flow, expires_in }`, 202 |
| `POST /v1/signup/verify` | `{ flow, code, handle }`: the code (unless Globus vouched), and a free handle; the passkey's registration options |
| `POST /v1/signup/finish` | `{ flow, response }`: the passkey enrolled (`verifyRegistration()`); the account, a recovery code shown once, the line to pin, and a sign-in |
| `POST /v1/signin/start`, `/finish` | a passkey sign-in, with any of the site's passkeys (discoverable) |
| `POST /v1/recover/email` | `{ email, turnstile }`: a code to an address with an account; nothing to one without, and the same reply |
| `POST /v1/recover/verify` | `{ flow, code, recovery_code }`: both together, 5 tries in all (B-jzgy4); a new passkey's options |
| `POST /v1/recover/finish` | `{ flow, response }`: the new passkey; a new recovery code, every other sign-in ended, a notice by email, signed in |
| `GET /v1/account` | the account: handle, emails, passkeys with their pin lines, Globus, projects, and until when it's fresh |
| `POST /v1/account/reauth/start`, `/finish` | the passkey checked afresh |
| `POST /v1/account/passkeys/start`, `/finish` | another passkey enrolled (fresh only); a notice; its key file put in every project; its pin line |
| `GET /v1/account/sessions`, `DELETE /v1/account/sessions/{id}` | the sign-ins, and ending one |
| `POST /v1/account/signout` | `{ everywhere? }`: this sign-in ended, or all of them |
| `GET /v1/account/machines`, `DELETE /v1/account/machines/{id}` | the machines, each with its project's name (`project_name`), and revoking one |
| `GET /v1/account/machines/approve?code=` | what a machine's code asks for: its name, the project, whether it's new, and, for a project of yours, its name |
| `POST /v1/account/machines/approve` | `{ code, approve, name }`: approving (fresh only) makes the project yours if it's new, named `name` (B-zqkwk; without one, 400 with `needs_name`); a project of another account's is refused |
| `PATCH /v1/account/projects/{id}` | `{ name }`: renames a project of yours (B-zqkwk), 1 to 60 characters (`projectName()`) |
| `DELETE /v1/account/globus` | Globus unlinked |
| `GET /v1/globus/start?purpose=signin\|link`, `GET /v1/globus/callback` | through Globus (below) |

**Globus** (`service/src/globus.ts`, D153, D176, B-s76hg): `authorizationUrl()` sends the browser to Globus with state, a nonce and PKCE, asking for `openid email`; the round trip's secrets are in a flow found by its state, and the browser holds a binding cookie, `__Host-baesian-globus`, SameSite=Lax, for 10 minutes, so the redirect back carries it and no other site can finish a round trip in your browser. `identityFrom()` checks the state, exchanges the code with the client secret (`client_secret_basic`) and the verifier, checks the ID token's claims and nonce, and its signature against Globus's published keys (`validateApplicationLevelSignature`). Then: an identity linked to an account signs it in; an unknown one starts a sign-up, which still enrols a passkey (D153), its email kept unverified; an email an account already has is never matched, and the person is told to sign in with their passkey and link Globus. Linking takes a session with a fresh check. An identity is its `sub`. The callback sends the browser to the website's `/`, `/sign-up` or `/account`, with what happened in the URL's fragment.

**Email** (`service/src/mail.ts`): `bindingMailer()` sends through Email Sending's binding (B-pvye0), from `EMAIL_FROM`, plain text with an HTML copy (`mails`): the sign-up code, the notice to an address that has an account, the recovery code, the notice of a recovery, and the notice of a new passkey. Locally the binding is simulated: logged, and saved to a file under `service/.wrangler/tmp/email/`.

**Turnstile** (`service/src/turnstile.ts`, B-1a03b): `turnstile()` checks a token with Cloudflare's siteverify, with the address in passing. Cloudflare's published test secrets (`TEST_SECRETS`) are answered locally with no network, and refused in production; a missing secret refuses everything.

## Machines (service/src/machines.ts)

OAuth's standard endpoints (B-t5wxr), form-encoded, for `baesian login` (M9d): `machinesRoute()`. The client is `CLIENT_ID`, `baesian-cli`, a public client.
- `POST /v1/machines/device`: RFC 8628's device authorization, with `project` and `machine` besides: `{ device_code, user_code, verification_uri, verification_uri_complete, expires_in, interval }`. The page is the website's `/device` (M9e).
- `POST /v1/machines/token`: the device code grant (`authorization_pending`, `slow_down`, `access_denied`, `expired_token`), and `refresh_token`, each refresh token once; `{ access_token, token_type, expires_in, refresh_token, project, machine, grant }`.
- `POST /v1/machines/revoke`: RFC 7009, by either token; always 200.

## Passkeys (service/src/webauthn.ts)

SimpleWebAuthn (B-jp22m), with user verification required everywhere and attestation `none`: `registrationOptions()` (discoverable, ES256, EdDSA or RS256, `PASSKEY_ALGS`), `verifyRegistration()` (and `spkiOf()`, the COSE key as SubjectPublicKeyInfo for the key file), `authenticationOptions()` (a challenge given, as a proof's digest, or a random one), `verifyAssertion()`, and `keyFile()` and `pinLine()`, the key file and its line for `BAESIAN_TRUST` (D159).

## Tests

`npm run test:service` from the root: the service's typecheck (`wrangler types`, then `tsc`), then its tests in workerd through `@cloudflare/vitest-plugin` (B-hx2fn), with a signing key, grants and a Globus client secret made fresh for each run (`service/vitest.config.ts`), and the accounts database's migrations applied before each file (`service/test/apply-migrations.ts`). CI runs it too. The tests reach no network: Turnstile's test secret is answered locally, and Globus is a stand-in (`service/test/globus-issuer.ts`) with its own discovery, keys and token endpoint. A browser is stood in for by `service/test/browser.ts`, its passkey by `service/test/passkeys.ts` (M9a's `TestPasskey`, which can also register).
- `webauthn.test.ts`: B-jp22m's premise, SimpleWebAuthn in workerd: a registration with an attestation object built in the test, and an authentication with `TestPasskey`'s assertion, for each algorithm; and M9a's `proofProblem()` agreeing with the library on the same assertion.
- `signup.test.ts`, `signin.test.ts`: sign-up, sign-in, sign-ins and their lifetimes, signing out, another passkey, recovery, and what each refuses: Turnstile, the limits, codes' tries, other sites, bearer tokens.
- `machines.test.ts`: the device flow, refresh and its reuse, revocation, lapsing, a session's reach on the relay; a new project named when its first machine is approved, and renamed only by its owner (B-zqkwk).
- `before-linking.test.ts`: the answers from before linking (B-3zjjx): checked as uploads are, kept unsigned and marked, shown as decided, not counted by a machine without the record, and refused once someone answers on the website.
- `proofs.test.ts`: answers and preference changes proved by the passkey, counted by a machine with the pin (`Store.judge`) and not without; the relay holding a card back; a slider proposal's two proofs; the key files.
- `globus.test.ts`: signing up and in through Globus, linking, and the callback's refusals.
- `sql-storage.test.ts`, `uploads.test.ts`, `answers.test.ts`, `gate.test.ts`, `live.test.ts`, `access.test.ts`: the relay (M9b), as before.
- `store-suite.test.ts`, run by `service/vitest.store.config.ts`: B-0ag7h's check, the store's own suites in `test/store.test.ts` over the relay's SQLite and over memory, in workerd.
