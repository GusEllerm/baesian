---
type: design
status: draft
authority: proposes
summary: "P15, a proposal for v1's hosted service (D127–D132): a per-repo relay for the write-once files, a one-time device sign-in for the CLI and the local MCP server, machine tokens that can file and hear but never answer, answers signed by the service and checked offline by baesian verify, metadata-only usage counts, the phone layout with web push, hosting at about $5 a month, and the format changes it needs before v1. Nothing here is decided beyond the D-numbers it cites."
created: 2026-11-03
tags: [baesian, design]
---

# Hosted Service

> **Status: proposal P15, not decided.** Drafted by the agent overnight on 2026-11-03, for the user to review. Only what cites a D-number is decided. Each open choice is marked **Decision for the user**, with the agent's recommended default, its reason, and the strongest alternative. The eight that most need settling first are drafted as cards H1–H8 (deck `hosted`; see [[#Decisions for the user]]). The evidence is in [[Hosted Service - Strand B5 Prior Art and Security]] (cited as B5, with its finding and recommendation numbers) and [[Preference Sliders and the Gate]] (cited as "the sliders note").

## Already decided

- **D127: the repo owns its decisions; the website is a relay.** Cards go up, answers come down into the live layer, and the record is still committed with the code. So the commit gate, `baesian verify` and offline work keep working without the website. The website holds what's waiting.
- **D128: agents reach the service through Baesian on their machine,** the CLI and a local MCP server, after a one-time sign-in. The user's caveat: a local MCP server may complicate security. That is section 5.
- **D129: the user hosts it centrally for others,** partly to monitor usage. Accounts, spending, what's collected and publishing come to the user as cards.
- **D130: the client gets a phone layout.** The card fills the screen, swiping is the gesture, the path folds away, and notifications come through web push.
- **D131: preference sliders are per repo.** How they work is the sliders note's subject. This note only says where its choices touch the service.
- **D132: the hosted service is part of v1.** Its format changes land before v1 like any other (D108).
- **Still in force:** git is the state machine (D27); only the client resolves (D32), as a convention plus an audit trail (D62); the two-layer store with immutable files (D34); and answers arrive at natural stopping points (D116).

## The shape, in one picture

```
 agent's machine                          hosted service                 person
 ───────────────                          ──────────────                 ──────
 agent ─ CLI / local MCP server ─┐        relay, one per repo            web client
   live layer  .git/baesian/     ├─ up ─► (an append-only log    ◄─────  (desktop and
   record      .baesian/         │        of immutable files)    ──────►  phone, one app)
   commit gate, baesian verify   └◄ down ─ signs what a person writes     passkey sign-in
```

- **Up:** what agents write (cards, revisions, withdrawals, fallbacks, attachments, decks) and waiting heartbeats.
- **Down:** what people write (verdicts, rules, rule retirements, topic merges), each with the service's signature, and the reviewer's presence. Also other machines' cards, if the repo has more than one machine.
- **Never leaves the machine:** the record, the gate, ledger entries, inbox cursors, the server file, the personal config, and the code.

## 1. The relay

> **Built (M9b, 2026-11-03),** as the cards in deck `hosted` decided it ([[service]]): a Worker in `service/` that routes every address under `/v1/projects/{project}/` to the project's Durable Object on SQLite (D140, B-7z97x), where Baesian's own store runs over the project's files (B-0ag7h, `SqlFileStorage`). Uploads take only what an agent writes, as the table below says, each checked against the store's schemas; the same bytes again do nothing, other bytes at a path are refused, and waiting markers are mutable state. The log is P16 section 8's entries ([[File Formats#The relay (M9b)]]). The state is `snapshot()`'s, as `baesian serve` serves it (B-17wn9), and live updates are hibernating WebSockets saying `changed` (B-bv49e). Answers, topic merges, preference changes and presence come only from a person's session, never with an `Authorization` header (section 3); they're written through the store and signed with the service's key from a Worker secret, naming the account, the project and, on a verdict, the card's digest (section 4). The relay gates every card revision it accepts, signed, with its `draw_proof` (D158). What needs a passkey, an answer on a hard card or a change that loosens, was refused until sign-in; sign-in was a seam (`Access`) with a stand-in for local runs and tests only. M9c filled both (section 2). Not built: the CLI's syncing (M9d), the website (M9e), retention and deploying (M9f).

> **Built (M9d, 2026-11-04): the CLI's side** ([[src-sync]]), as this section has it, with no daemon. The CLI pulls the log into the live layer as if each file were written there (an exclusive create, the `.sig` first), and pushes the kinds an agent writes, decks first, then revisions, then the rest; `relay.json` keeps the last sequence pulled and what the relay has. When a repo is first linked, everything an agent wrote goes up (B-6k0rk). Where it syncs: the filing commands and the MCP filing tools pull, then push; `baesian inbox` (and the plugin's quiet hook, silently, five seconds at most) pulls and pushes what's waiting; `baesian wait` listens on the relay's hibernating socket (B-bv49e), pulling at each `changed`, sends its waiting marker up as a heartbeat, and reads the reviewer's presence from the relay; `pre-commit` pulls for at most three seconds and never fails a commit; `baesian sync` pulls and pushes. Offline, everything works as before, with a note on standard error. The conflicts below are built as described: a revision revised elsewhere first is refused, the relay's replaces it here, and the agent is told; a new card whose ID another machine's card took is filed again under a new ID, and the agent told it. A copy of the repo whose history starts elsewhere doesn't sync (B-5gnea). In a hosted repo, answers already in the record at the commit that linked it count as they are (B-45xz8). The answers from before linking, which "everything" (B-6k0rk) includes but the relay refused from a machine (section 3), went to the user as card B-3zjjx, answered "Up once, at linking, kept apart", and built in M9e (below).

> **Built (M9e, 2026-11-04): the answers from before linking (B-3zjjx)** ([[service]], [[src-sync]]). At first link, after what agents wrote, the CLI uploads the answers, rules, rule retirements, topic merges and preference files that count on its machine as from before linking (B-45xz8). The relay takes them from a machine only until anything in those folders carries its signature, the project's first answer on the website; it checks each as an upload, refuses one that names an account or project, keeps it unsigned and listed apart, and marks its log entry `before_linking`. Its own store counts them as B-45xz8 counts the record at the linking commit, so the website shows those cards as decided, "before linking". Other machines pull them, and count them only where their own record at the linking commit holds them. After the first answer on the website, the relay refuses any more (403, `before_linking: "closed"`), and the CLI stops offering them once it has pulled that answer; what didn't go up stays in git, where it counts. The exception to section 3 is that one window.

### What goes up and what comes down

| Live-layer file ([[File Formats]]) | Written by | Direction | On the relay |
|---|---|---|---|
| card revisions, withdrawals, fallbacks, attachments, decks | agents, through the CLI | up | stored until no longer waiting (see retention) |
| verdicts | the web client, through the relay | down, signed | stored until pulled and resolved |
| rules, rule retirements, topic aliases | the web client, through the relay | down, signed | kept while the repo uses them |
| waiting markers (`Waiting`) | `baesian wait` | up, as a heartbeat | short-lived state, stale after 90 seconds (D90) |
| presence (`Presence`) | the web client | down, as state | short-lived state, stale after 90 seconds (D41) |
| ledger entries, inbox cursors, `server.json`, `port.json` | the gate, the CLI, `baesian serve` | stay local | not sent |

The rule behind the table: **the relay accepts uploads from a machine only for the kinds of file an agent writes.** Verdicts, rules, retirements and aliases are made only by the relay, from a person's signed-in session, and signed (section 4). This is how "only the client resolves" (D32) becomes something the service enforces, not just a convention. Rules count as much as verdicts here. A forged rule file would let the gate acknowledge whatever it covers.

### How the write-once files sync

Every file Baesian writes once has a unique path, and its contents never change ([[File Formats]]). Merging two copies is taking the union. So the relay is simple (B5 F3):

- **Upload.** The CLI sends a file's path in the live layer and its bytes. The relay stores it once and gives it the repo's next sequence number. The same bytes again do nothing. Different bytes at an existing path are refused, the relay's version of the store's exclusive create.
- **Download.** The CLI asks for "everything after sequence N", and writes each file into the live layer with an exclusive create, as if it had been written locally. Everything downstream works unchanged: the local server's watcher (D84), `baesian wait`, `baesian inbox`, the hooks, and `pre-commit` copying verdicts into the record (`Store.syncRecord`).
- **When it syncs.** There is no daemon. The CLI syncs when it already reads or writes the live layer:
  - `baesian file`, `baesian reply` and the other filing commands push, after pulling so the filing check sees other machines' open cards (D36);
  - `baesian wait` long-polls the relay instead of only watching files;
  - `baesian inbox` pulls first. The plugin's hooks run it at every stopping point (D116), so answers arrive when they do today;
  - `pre-commit` pulls with a short timeout, and never fails a commit when offline;
  - `baesian sync` pulls, as well as copying into the record.
- **Presence and waiting.** `baesian wait` asks the relay whether a web client has sent a heartbeat in the last 90 seconds, and counts a fresh local `Presence` too. It posts its own waiting heartbeat, so the website can show "an agent is waiting".
- **Several machines.** Every machine with a grant for the repo pulls every card. So the filing check and conflicting proposals (D35, D36) work across machines before merge. This was open in [[Baesian Design#Open questions]] ("Several machines"). It is a consequence of the relay, not a decision about the Sparks cluster.

### Offline, and the few conflicts there can be

- **Offline,** everything local works as it does today: filing, the gate, `baesian verify`, the record (D127). New files are pushed at the next command that reaches the relay. A small mutable file in the live layer remembers the last sequence pulled and which files the relay has acknowledged (a format addition, below).
- **Answers can't be given offline** on the website, by definition. Whether the local client may answer in a hosted repo is H5.
- **Two machines revise one card at once.** Both write revision 2. The relay accepts the first and refuses the second. The CLI tells the agent the card was revised elsewhere, as the local API's 409 does for a stale verdict.
- **A verdict on an old revision** is refused, as the local API refuses it today.
- **The same new card ID on two machines.** IDs have five characters from a 32-letter alphabet, about 33.6 million values (D51). `baesian file` pulls before it chooses an ID when it's online, so a clash needs two machines filing offline at the same time. The relay refuses the second upload, and the CLI files it again under a new ID.

### Retention

The relay holds what's waiting (D127). The record in git is the archive. **Proposed default:**
- **Card text** is deleted from the relay 30 days after its card is resolved or withdrawn and its last verdict has been pulled. An undelivered card is deleted after 90 days.
- **Kept after that:** IDs, timestamps, sizes, levels and response kinds, for usage counts (section 6).
- **Rules and topic aliases** stay while the repo uses them, because every machine needs them.

*Strongest alternative:* keep card text while the account exists, so the website can show history. The cost: everything ever filed stays on the server, which is most of what a breach would expose (B5 R1). The periods are the agent's suggestions, not sourced norms. **Decision for the user**, with H7.

### Can the service read card text? (H1)

**Decision for the user (H1).** It is the same question as decision 4 in the sliders note; file only one of the two cards.
- *Recommended default:* the service can read card text, behind TLS and the provider's encryption at rest. Bodies are deleted on the schedule above, and a secret scan runs before anything leaves the machine (section 5). An encryption envelope field is reserved in the wire format before v1, so encryption can be added later without a migration.
  - *Reason:* the gate's safest home is out of the agent's reach (the sliders note, "Where it could run"). The website can then show card text in notifications and search, and support can look at a card.
- *Strongest alternative:* end-to-end encryption. A repo key is wrapped by each device's passkey, through the WebAuthn PRF extension, or by a key in the CLI's store. The service sees only sizes, timing and IDs. The costs: key recovery, uneven browser support, and a gate that must run beside the agent (B5 F4).

**What follows for the relay's API.** If the service can read cards, the relay can run Baesian's own store logic over each repo's files. It would then serve the same API as `baesian serve` (D96: a snapshot plus change events), so the React client runs against either unchanged. Under encryption, the browser would compute the snapshot from the files itself. **Decision for the user**, after H1. It's a module boundary.

## 2. Accounts and the one-time sign-in

> **Built (M9c, 2026-11-04), the service's side,** as D153, D176 and the cards in deck `hosted` decided it ([[service]], the tables in [[File Formats#Accounts (M9c)]]):
> - **Accounts** live in one D1 database (B-ytdt2). You sign up with an email, a code sent to it through Email Sending (B-pvye0), a handle and a passkey, behind Turnstile in managed mode (B-1a03b) and limits per network address and per email address (B-mz6qc); or through Globus, with oauth4webapi (B-s76hg, D176), which still enrols a passkey (D153). Every account gets a recovery code to keep; getting back in takes it and an emailed code together (B-jzgy4), and sends a notice. Passkeys are checked with SimpleWebAuthn, which runs in workerd (B-jp22m's premise, checked first).
> - **A sign-in** is the cookie section 3 describes, `__Host-baesian-session`, SameSite=Strict, with requests from other sites refused; it lasts until 30 days unused, 90 in all (B-vtr1r), and keeps a name and its last use, nothing about where it came from (B-7bq05). Sign-ins are listed and ended one at a time or everywhere. Adding a passkey, linking Globus and approving a machine ask for the passkey afresh.
> - **A project** is made when its first machine is approved, owned by the account that approved it; in v1 only its owner answers there.
> - **A machine's grant** is the service's side of `baesian login`: OAuth's device flow, form-encoded (B-t5wxr), one grant per machine and project (B-84e0d), the approval page's data from the service, access tokens for an hour, refresh tokens that rotate and revoke the grant when reused, lapsing after 30 days unused, and revocation from the CLI or the Machines list. The approval page doesn't show the machine's address or location: nothing keeps them (B-7bq05).
> - **The relay's `Access`** is real: a grant's token is a machine for its project, a session a person for their own projects. The stand-in still runs beside it, locally and in tests only.
> - **Answers the passkey proves** (section 4, D139, D163) are composed by the relay, signed by the passkey over their bytes' digest, then written with the proof and the passkey's key file, so the relay can hold cards back.
> - Not built here: `baesian login` and the CLI's sync (M9d), the website's pages (M9e), the Globus app's registration and deploying (M9f).

> **Built (M9d, 2026-11-04): the CLI's side of signing in** ([[src-sync]], [[src-cli]]):
> - **`baesian login`** signs this machine in through the device flow at OAuth's endpoints (B-t5wxr): it prints the code and the page, polls, and keeps the grant in `grants/<project>.json` beside the personal config, mode 0600 (B-gq8j1), one per machine and project (B-84e0d). It also links a repo that isn't on the service yet (B-62qnz): a new project ID, the service (`--service`) and the repo's first commit (B-5gnea) go into `.baesian/config.json` once the machine is approved, and it prints the `Baesian-Ack:` the linking commit needs (B-w4g6c). A copy of another repo is linked to a project of its own.
> - **Tokens** are refreshed when they're within a minute of expiring, holding a lock so two commands never refresh at once, and the new pair is written before it's used; a grant the service ends (revoked, lapsed, a refresh token seen twice) is removed, and the commands say to sign in again. **`baesian logout`** revokes the grant and deletes the file.
> - **The local MCP server** uses the same grant and code, never signs in itself, and, signed out, files here and says to ask the person to run `baesian login` (section 5).
> - **A card that looks like it holds a secret,** in a hosted repo, is refused unless the agent gives a reason, kept on the card as `secret_reason` (B-jfkv9; section 5's scan).

### Accounts and projects

- **A person signs up on the website.** How they prove who they are is H2. The recommended default is a Baesian account with an email address and a passkey. The strongest alternative is "Sign in with GitHub".
- **A project is one repo on the service.** It is created on first use by `baesian init` in a signed-in shell, or by a new command that links an existing repo. A random project ID and the service's address go into `.baesian/config.json` (`Config`), which is committed and holds no secret.
- **Members.** In v1, one owner per project, who answers. Inviting others is open: [[Baesian Design#Open questions]] has "Identity and trust" and "Reviewer disagreement", and the sliders note's decision 16 has several reviewers. A teammate's machine signs in with the teammate's own account, and needs to be a member.

### Signing in from the CLI

A new command, baesian login, does the one-time sign-in (D128), following B5 R2:
- **The flow:** the OAuth device authorization grant (RFC 8628). The CLI prints a short code and a URL; you approve in any browser; the CLI polls until it's done. It works over SSH, on the Sparks cluster and in containers. When a browser is on the same machine, the CLI may use a loopback redirect instead (RFC 8252), which can't be phished in the same way.
- **The approval page** shows the machine (hostname, OS, the request's IP and rough location), the project, and what the machine will be able to do. It says plainly that you are authorising a machine. Codes are rate-limited per account and per IP (B5 F9).
- **One grant per machine and project.** *Recommended default*, because a leaked token then reaches one repo. *Strongest alternative:* one grant per machine for all your projects, as `gh` does, which is fewer sign-ins. **Decision for the user.**
- **Lifetimes.** Access tokens last about an hour. Refresh tokens are single-use and rotate, and a reused one revokes the grant (RFC 9700, B5 F10). A grant unused for 30 days lapses. These are the agent's defaults.
- **Revocation.** A "Machines" page on the website lists every grant, with its last use, and revokes it. A new command, baesian logout, revokes the grant and deletes the token.
- **Where the token is kept.** *Recommended default:* a file readable only by the user (mode 0600) in Baesian's user config directory, next to the file `UserConfig` describes. That is what Claude Code does on Linux, and `gh` falls back to it (B5 F8, F9). *Strongest alternative:* the OS keychain, through a native module. keytar, the standard one, was archived in 2022 (B5 F11), so this is a new runtime dependency and a card of its own. Storage doesn't stop an agent using the token through the CLI either way. **Decision for the user.**

### Signing in from the local MCP server

The local MCP server never signs in itself. MCP's own OAuth is for HTTP servers; a stdio server "SHOULD NOT follow this specification, and instead retrieve credentials from the environment" (B5 F5). So it uses the grant baesian login made for that machine and project, through the same code as the CLI. If there is none, its tools return an error telling the agent to ask the person to run baesian login.

## 3. What a machine token can do, and how the service enforces it

**A machine can file cards and hear answers. It can never give an answer.** That follows from D32 and D62. Hosting makes it enforceable, because the boundary moves to the server, where the agent can't reach.

| Scope (a machine token) | Allows |
|---|---|
| file cards | uploading the agent-written kinds of file in section 1's table |
| hear answers | pulling the log, including verdicts, rules and aliases |
| presence | reading the reviewer's presence; posting waiting heartbeats |

Enforcement, all on the service:
- **No machine token can carry an answer scope, and none is ever issued.** The endpoints that create verdicts, rules, retirements and topic merges accept only a browser session cookie made by a passkey sign-in. They refuse any request carrying an Authorization header, whatever it holds.
- **Uploads are checked by path.** A machine can't upload into the verdict, rule or topic folders. If the service reads cards (H1), it also validates each upload against the same schemas the store uses (`CardMeta` and the rest).
- **Each token's audience is one project** (one service address and project ID). Tokens never go in a URL.
- **The session cookie** follows the rules MCP sets for its own consent cookies: a `__Host-` name, Secure, HttpOnly, SameSite, and protection against cross-site requests (B5 R2).
- **Hard cards ask again.** Answering a hard card asks the passkey to verify you (face, fingerprint or PIN) for that answer, as GitHub's sudo mode does for sensitive actions (B5 F12). That also stops an agent driving a signed-in browser from answering a hard card. Whether the passkey also signs the answer is H4.
- **Rate limits per machine,** on uploads and on login codes. A machine that files a burst of cards has its notifications paused (section 7).

What it doesn't stop, stated plainly: an agent can file cards and read answers as you, which is the intended capability. An agent driving your signed-in browser could answer a provisional or blocking card, unless every answer asks for user verification, which would slow every card.

## 4. Answers the service vouches for

### What's signed, and how

- **Everything only a person writes is signed by the service:** verdicts, rules, rule retirements and topic aliases. So is the preference configuration, if the sliders note's decision 13 puts it on the service. So is a gate record, if the gate runs there.
- **Signing bytes, not meaning.** The relay writes the file's exact bytes, signs them with an Ed25519 key, and stores a detached signature beside it, named for the file with ".sig" added. Both are pulled into the live layer and copied into the record together. Signing the bytes means no canonical JSON is needed.
- **The format.** *Recommended default:* OpenSSH's signature format, with a namespace for Baesian, so `ssh-keygen -Y verify` can check one by hand (B5 F14). Node's built-in crypto handles Ed25519, so `baesian verify` needs no new dependency. The agent knows this but hasn't checked it against a source. *Strongest alternative:* a small JSON signature file with a key ID and a base64 signature. Simpler to read, but checkable only with Baesian's own code. **Decision for the user** (a format, before v1).
- **Keys.** The service's signing keys live in the hosting platform's secret store. Each public key is listed with "valid after" and "valid before" times, so a key can be rotated without invalidating old signatures. That is how git treats allowed signers (B5 F14). A revoked key is listed as revoked.
- **Whose name is on it.** `Verdict` records the reviewer as git's `user.name` today. A hosted verdict records the account's handle and a stable account ID, and names the hosted client in its client field (format changes, below).

### How baesian verify checks them offline

In a hosted project, `verify()` (run by `baesian verify` in CI) and the commit gate check every person-written file in the record. A file passes when:
1. its signature file is present;
2. the signature matches the file's bytes, under Baesian's namespace;
3. the key is one the trust root lists (H8), and was valid at the file's own timestamp;
4. for a hard card, if H4 is accepted, the passkey assertion also checks out (below).

Nothing needs the network, so CI works offline (D127). `pre-commit` copies into the record only files that pass, and the commit gate treats a hard card with no passing verdict as unanswered (D46).

### Decisions this section needs

- **H3: does an answer count only when it is signed?** *Recommended default:* yes, in hosted repos. A verdict file written on the machine is ignored there, which **would revise D62** for hosted repos (a question for the user, not done). *Reason:* the signing key lives off the machine, so the agent can't forge an answer, and the record can be trusted (D32's purpose). *Strongest alternative:* record signatures but don't require them, keeping D62 as it is. Repos without the service keep D62 either way.
- **H4: do hard-card answers also carry the reviewer's own passkey signature?** *Recommended default:* yes. The relay sets the WebAuthn challenge to a hash of the verdict's bytes plus a nonce. The passkey's assertion (authenticator data, client data and signature) is stored with the verdict, and `baesian verify` checks it against the reviewer's enrolled public key, with user verification required (B5 F13). *Reason:* proof that holds even against the service's operator, for the cards where it matters (security, money, data loss, publishing). *Strongest alternative:* the service's signature only.
- **H8: where CI gets the key it trusts.** *Recommended default:* pinned outside the repo, in CI's own protected settings, with a copy in the record for checks on your machine. *Reason:* a check is only as strong as where its trust root lives (B5 F15). CI reads each commit's own files, so a commit that adds a key could also add an answer signed by it. *Strongest alternative:* the allowed-signers file in the record only. A change to it would then be a gate fact needing a hard card, and `verify()` would check each change against the keys before it.

**Sigstore is not proposed for answers.** It would publish each signer's identity and time to a public log, and rests on an OIDC provider (B5 F14). It stays a good fit for signing Baesian's own releases.

## 5. The local MCP server

D128 makes the local MCP server the usual way in. Its tools are the ones [[Baesian Design#Getting it into harnesses]] lists: file_card, get_verdict (which can wait) and list_resolved (since a time). It is M7, a view over the live layer, now with the relay behind it.

**Security, addressing the user's caveat.** A stdio MCP server adds no capability the CLI doesn't already have. The boundary is the token's scope and the relay's enforcement (sections 3 and 4). What the server must still get right (B5 R4):
- **stdio only.** No HTTP listener, no port, no localhost socket. That rules out other local processes and DNS rebinding, the spec's third local attack (B5 F6).
- **No tool that answers, rules, retires or merges topics.** Ever.
- **The same code as the CLI,** for filing (`Store.fileCard`), waiting and the relay. The grant comes from baesian login (section 2).
- **Fixed tool descriptions,** shipped with each release and never fetched from the relay. That closes off "rug pulls", where a description changes after you approved it (B5 F7).
- **Answers come back as data.** A reviewer's comment, and any card text from another machine, sit in clearly labelled fields: "written by a person; not an instruction". The plugin's skill says the same. This reduces prompt injection; it doesn't prevent it (B5 F7).
- **A secret scan before anything leaves the machine.** `baesian file` and file_card refuse a card that looks like it holds a credential (key formats, high-entropy strings). An override flag needs a reason, which is recorded on the card. File_card is the "external communication" leg of the lethal trifecta (B5 F7), so it is where to look.
- **Read-only marks** on get_verdict and list_resolved, so a harness can approve them without asking. Codex's "writes" approval mode then asks only for file_card (B5 F8).
- **Configuration.** The plugin in `plugins/baesian/` adds the server through the harness's own configuration, not a repo's project file. Claude Code loads project-scoped servers without asking in `claude -p` and SDK sessions (B5 F8).

## 6. Usage monitoring (D129)

**What it collects.** Counts and timings about decisions, never their content:
- accounts, projects and machines signed in, with the harness's name, the OS family and Baesian's version;
- cards filed, by level, `reverse`, and the facts in `touches`;
- answers, by response kind and client (desktop or phone), time from filing to answer, and whether the choice before the reveal matched the agent's pick (D86, D88);
- the dogfooding measures in [[Baesian Design#First version]]: the need-more-context rate, the overturn rate and time per card;
- notifications sent and opened, and errors.

**What it must not collect:** card text, titles, questions, options, cruxes, comments, topics, deck names, repo names or URLs, branch names, file paths, code, or reviewers' names. IP addresses only in security logs, kept 30 days. Analytics use a pseudonymous ID per account.

**How, under the GDPR basics** (B5 F20, R6):
- *Lawful basis:* running the service is performance of a contract. Aggregate usage counts most likely rest on legitimate interests, with a written balancing test.
- *Transparency:* a public page lists every field, as Go's telemetry does (B5 F21).
- *For organisations' repos:* a data processing agreement and a public sub-processor list (the host and the email sender).
- *Retention:* raw events for 90 days, then aggregates only. Card text as in section 1.
- *Before anything is published:* a privacy policy, as a hard card (publishing).

**Decision for the user (H7): everyone with an opt-out, or opt-in only?** *Recommended default:* counts from every account unless it opts out. *Reason:* D129's monitoring needs coverage, and the counts are metadata the relay mostly sees anyway in order to work. *Strongest alternative:* opt-in only, as Go's toolchain does. It's legally simplest and most trusted, but yields a small, self-selected sample.

## 7. The phone layout and notifications (D130)

### The layout

- **The card fills the screen.** The four-way swipe follows the gesture table in [[Baesian Design#3. Responses]]: right accepts, left rejects, up opens the panel (an alternative, a correction or a question), and down is the escape hatch (need more context, or not my area).
- **The path beside the card folds into a sheet** you pull up.
- **The agent's pick stays hidden until you choose** (D86), with the reveal and the switch after it (D88). D91's "Read it first" wait and the hold on mythic cards carry over.
- **Hard cards ask for the passkey check** (section 3) at the moment of answering.
- **It is the same React app as the desktop client** (D32, D98), with a phone layout, served by the relay as a progressive web app (a website that can be installed to the Home Screen).

### Notifications

Following B5 F16–F18 and R5:
- **Web push,** with the standard VAPID keys. On iPhone this needs the app added to the Home Screen first (iOS 16.4 or later). Then a "Turn on notifications" button calls the permission prompt, because it must follow a tap. Never on page load.
- **Every push shows a notification.** Safari revokes permission otherwise, so the relay never sends silent pushes for syncing.
- **What it says.** *Recommended default:* counts only, such as "2 cards waiting in baesian (1 hard)", with no card text on a lock screen or in Apple's and Google's systems. One notification topic per project, so a newer push replaces an older one. *Strongest alternative:* the card's title as well, which is more glanceable. **Decision for the user;** a per-project setting could allow it.
- **When.**
  - Blocking and hard cards notify at once, at high urgency.
  - Provisional cards wait for a digest every few hours.
  - Nothing is sent while you're present in a client (D41).
  - Pushes per project per hour are capped. A burst of cards from one machine pauses its notifications and says so on the website ("this machine filed 30 cards in 10 minutes"). This guards against approval fatigue (B5 F16) and against Chrome removing permission from noisy sites (B5 F17).
- **No answer buttons in the notification.** Opening the card is required, so D86's choose-before-reveal applies, which works much like number matching does for push approvals (B5 F16).
- **Email** is the fallback for people who refuse push, or whose browser removed it.
- **Later:** Declarative Web Push (iOS 18.4 and later) removes the dependency on a service worker.

**A question for the user, not a revision: D40.** D40 routes phone push through the `notify` command "without Baesian owning push infrastructure". The hosted service would own web push. The `notify` command stays in `UserConfig` (D106) for anyone who wants their own route.

## 8. Hosting

From B5 F22 and F23, with the prices as published on 2026-11-03. No money is spent and no account is opened until a card says so (AGENTS.md: money is hard by default).

| Option | Rough cost at small scale | For | Against |
|---|---|---|---|
| **Cloudflare Workers with one SQLite Durable Object per repo** | $5 a month minimum (10 million requests included). The free plan includes SQLite Durable Objects for trying it | each repo's storage is "private to its unique instance", so repos are kept apart by construction; WebSockets can hibernate; no servers to patch | the relay's code is tied to Cloudflare's API; an object's location is set by a hint (jurisdiction controls weren't checked) |
| **Fly.io machine with SQLite** | $2.19 a month (256 MB) to $6.70 (1 GB), plus $0.15 a GB-month for a volume. No free tier for new organisations | the same Node runtime as the CLI; portable | backups, patching and isolation by code are yours |
| **A VPS (Hetzner) with SQLite or Postgres** | from €5.99 a month, excluding VAT | cheapest for steady load; fully portable | all operations work is yours; row-level security is bypassed by owners and superusers (B5 F22) |

A rough illustration, the agent's arithmetic and not a measurement: 100 machines polling every 30 seconds for 8 hours on 22 days make about 2.1 million requests a month. That is inside Workers' included requests, and about $0.17 over Durable Objects' allowance. Push delivery through Apple and Google costs nothing.

**Decision for the user (H6).** *Recommended default:* Cloudflare Workers with a Durable Object per repo. *Reason:* isolation built in, about $5 a month, and very little to operate for one person running a service for others. *Strongest alternative:* a small server of its own (Fly.io or a VPS). It's portable and has the same runtime, at the cost of operations work.

## 9. How the local client relates

`baesian serve` (`startServer()`) is the local server: 127.0.0.1, a fresh token, Host checks, no CORS (D62, D97, D103). It serves the same React client the website would.

- **Repos without the service** keep `baesian serve` exactly as it is. Standalone first (D8).
- **In a hosted repo, H5: what does `baesian serve` offer?** *Recommended default:* it opens the website's page for the project, and answers come only from the website, so every answer is signed. *Reason:* one path for answers, and H3's guarantee holds without exceptions. *Strongest alternative:* the local client keeps answering in hosted repos, offline included. Its answers are uploaded later, but can't count where signatures are required (H3).
- **A question for the user, not a revision: D63.** D63 planned phone access through Tailscale. In hosted repos the website replaces that; for local-only repos D63 could stand, or lapse as unneeded.

## 10. Format changes needed before v1 (D108)

Formats are free to change until v1 (D108). These are the hosted service's additions, so they land before it (D132). Each is a candidate. The ones that are a card's subject say so.

| Change | Where | Depends on |
|---|---|---|
| The service's address and the project ID | `Config`, in `.baesian/config.json` | H2, and section 2 |
| A signature file beside every person-written file (verdicts, rules, retirements, aliases) | the live layer and the record | H3, and the encoding decision in section 4 |
| The trust root: the service's public keys, with validity times and revocations | the record, and CI's settings | H8 |
| The reviewer's account handle and stable ID; client values for the hosted client on desktop and phone | `Verdict` | H2 |
| The passkey assertion for hard-card answers, and the reviewer's enrolled public key | beside the verdict; the record's trust root | H4 |
| The relay's state on each machine: the last sequence pulled, and which files were acknowledged | a new mutable file in the live layer, never in the record | section 1 |
| The machine's grant: tokens and their lifetimes | a 0600 file in the user's config directory, or the keychain | section 2's storage decision |
| The machine's name on each card, to show where it came from and to spot bursts | `CardMeta` | a decision for the user. D105 left out the folder, not the machine |
| The wire protocol: upload by path, sequence numbers, errors, an encryption envelope field reserved, versioned from the start | the relay's API, a public interface at v1 | H1 |
| The gate record, signed if the service runs the gate; the preference configuration's home | the sliders note, sections 7 and 8 | the sliders decisions 4 and 13 |

`Presence` and `Waiting` keep their formats. In a hosted repo their values also travel through the relay.

## Decisions for the user

Filed as cards in deck `hosted` (2026-11-03, overnight), in the order they're best settled; their IDs are beside each. H1, H2 and H6 shape the relay; H3, H4 and H8 shape the formats; H5 shapes the client; H7 must be settled before anything is published.

| Card | Topic | Question | Recommended default | Strongest alternative |
|---|---|---|---|---|
| H1 (B-kypkm) | `hosted/card-text` | Should the service be able to read card text? | readable, deleted after delivery, encryption envelope reserved | end-to-end encrypted |
| H2 (B-9tk9m) | `hosted/sign-in` | What do people sign up and sign in with? | Baesian accounts with passkeys | Sign in with GitHub |
| H3 (B-sar41) | `hosted/answer-signatures` | Does an answer count only when signed? (revises D62 for hosted repos) | only signed answers count | signatures recorded, not required |
| H4 (B-na7je) | `hosted/hard-card-proof` | Do hard-card answers also carry the reviewer's passkey signature? | yes | the service's signature only |
| H5 (B-k216t) | `hosted/local-client` | What does `baesian serve` offer in a hosted repo? | it opens the website | it still answers locally |
| H6 (B-rca1z) | `hosted/platform` | Which kind of platform does the service run on? | Cloudflare Workers, a Durable Object per repo | a small server of its own |
| H7 (B-7bk6y) | `hosted/usage-data` | Usage counts from everyone with an opt-out, or opt-in only? | everyone, with an opt-out | opt-in only |
| H8 (B-vbqdy) | `hosted/ci-trust-root` | Where does CI get the key it checks answers with? | pinned outside the repo | a file in the repo |

**Answered on 2026-11-03** (all as recommended, but H2): H1 as D137, H3 as D138, H4 as D139, H5 as D143, H6 as D140, H7 as D141, H8 as D142. **H2 came back with a question** (whether to use Globus Auth, for single sign-on through people's own organisations, and whether running our own accounts is a risk); after research ([[Sign-in for the Hosted Service]]), its revision was answered as D153: passkey accounts, with Globus as a way in.

The rest of this note's choices, carded on 2026-11-03 for M9, in deck `hosted`:
- whether the relay serves the same API as `baesian serve` (section 1): **B-17wn9**;
- one grant per machine and project, or per machine (section 2): **B-84e0d**;
- where the machine's token is kept (section 2): **B-gq8j1**;
- the retention periods (section 1), as two questions: an answered card's text (**B-9jqt4**), since D137 says "once answered" without saying how soon, and a held-back card's (**B-ec3kj**), since a held card is never answered;
- what a notification says (section 7): **B-mjf3g**;
- account recovery when every passkey is lost (open questions): **B-jzgy4**;
- settled by P16: the signature's encoding (D160) and whether a card records its machine (D162).

Carded the same day, after research (deck `hosted`): spending on Workers Paid (**B-nm45g**), the email sender (**B-pvye0**), the passkey library (**B-jp22m**, resting on the unchecked premise that SimpleWebAuthn runs on Workers), the Globus sign-in client (**B-s76hg**), where the service's code lives (**B-pjw5y**) and how it goes live (**B-bk20v**), the repo's identity under copies (**B-5gnea**), whether changing the config's service address or project is a gate fact (**B-w4g6c**), open sign-up or invitations first (**B-mz6qc**), and EU storage per project (**B-grrr9**). Then, after more research: **the website's domain** (**B-qrga1**), **how pushes are built** (**B-nk97q**), and **where account-level data lives** (**B-ytdt2**). The research found that the DNS must be on Cloudflare whatever B-pvye0 decides, since a Worker can serve only a domain in an active Cloudflare zone, and on the Free and Pro plans that means the whole parent domain's nameservers; a subdomain alone needs Business or Enterprise. Not yet recorded as done: D153's check of Globus's terms with Globus support.

**What the research (2026-11-03) corrects below:** Durable Objects can be held to a jurisdiction (`eu`, `us`, `fedramp`), fixed when an object is created, not only given location hints (section 8, open questions); a long poll held open in a Durable Object is billed for its wall-clock time, so `baesian wait` long-polling the relay costs about $25 a month in the research's example rather than section 8's $0.17, unless it hibernates WebSockets or polls briefly; the free plan allows 10 ms of CPU per request, Paid has no spending cap and its budget alerts come a day late, and the email fallback (section 7) needs Paid; if Cloudflare sends email, the host and the sender are one company, and Turnstile would make Cloudflare a controller of its signals (section 6); and strict per-account rate limits need Durable Object counters, since the Workers binding counts per location (section 3).

**Since this note was written, later decisions changed:** the signature format (D160: OpenSSH, namespace `baesian`, not `baesian-verdict`); the passkey challenge (the SHA-256 of the verdict, with no nonce, P16 §7); where passkey keys are trusted (pinned in CI by hand, D159, not a key enrolled in the repo); sign-in (D153: a passkey and an email, or Globus); the machine's name (the relay's entry only, D162); what's signed (also preference files, the relay's gate records and passkey key files, P16); preferences (D147, with D163 and B-shndb for loosening); what a signed file names (its project, B-tf9fc, and for an answer the card's digest, B-f571v); where the gate runs (D145, D158); the MCP tools (D166's twelve, not two); and what `baesian serve` offers in a hosted repo (D143). Where the sections below disagree with those, the decisions hold.

Questions about existing decisions, not revisions: D62 (through H3), D63 (section 9), and D40 (section 7).

## Open questions

- **Several reviewers per repo:** roles, invitations, whose passkey signs, and what Article 28 then makes of the service. See the sliders note's decision 16 and [[Baesian Design#Open questions]].
- **Where the gate runs** decides H1 in practice. See the sliders note's decisions 2 to 4.
- **The repo's identity:** is a random project ID in the committed config enough? Forks and mirrors would share it.
- **Account recovery** when every passkey is lost. Under H1's alternative, that also loses relayed content.
- **Data residency** for EU users. Durable Objects take only location hints, and jurisdiction controls weren't checked (B5 open questions).
- **Abuse of open sign-up:** rate limits, bot checks, and a cap on cards per free account.
- **Prompt-injected sign-in:** an agent can be told to ask you to "approve this code". The approval page's machine details are the main defence (section 2). Whether that's enough is untested.
