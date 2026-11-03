---
type: module
status: active
authority: describes
summary: "service/: the hosted relay (M9b), a Cloudflare Worker with one Durable Object per project on SQLite (D140), in this repo with its own package (B-pjw5y). It runs Baesian's own store over each project's files (B-0ag7h), takes uploads of what an agent writes, keeps the append-only log the CLI will pull (P16 section 8), serves the state as baesian serve does (B-17wn9), sends live updates over hibernating WebSockets (B-bv49e), and writes what a person answers through the store, signed (D138, D160), with its own gate record on every card revision (D158). Sign-in is M9c's: until then a stand-in runs locally and in tests, and production refuses everything."
created: 2026-11-03
updated: 2026-11-03
reviewed: 2026-11-03
tags: [baesian, module, hosted]
---

# service/: the relay (M9b)

The design is [[Hosted Service]] sections 1, 3 and 4 (P15) and [[Formats for v1]] sections 7 and 8 (P16), as the cards in deck `hosted` decided them: Workers and an object per project (B-rca1z, D140), the service in this repo with its own package (B-pjw5y), the store run over the relay's storage (B-0ag7h) to serve the state as `baesian serve` does (B-17wn9), every address under `/v1/projects/{project}/` (B-7z97x), hibernating WebSockets for live updates (B-bv49e), and tests in workerd (B-hx2fn). Nothing is deployed: that's M9f. The relay's entry is in [[File Formats#The relay (M9b)]], with how to run it locally.

The package is `service/`, with `service/wrangler.jsonc` and its own `service/package.json`, whose only dependencies are `wrangler`, `@cloudflare/vitest-plugin` and `vitest`, all for development. It imports the store, the schemas and the state from `src/` as they are, and resolves their own dependencies (zod, yaml) from the root's installed packages, so the root's `npm ci` comes first.

## The Worker and the object (service/src/index.ts)

**`handleRequest()`** takes every request. It routes `/v1/projects/{project}/…` to the project's object, named by the project's ID, after deciding who may do what (below); anything else is 404. The project ID is checked as `Config` takes it (`ProjectId`). It calls the object's methods by RPC; live updates go to its `fetch`.

**`ProjectRelay`** is the Durable Object class, on SQLite (`service/wrangler.jsonc#migrations`). It learns its project on first use and serves no other. Each method builds a `Relay` over its files and runs it; when the project's version moved, it tells every socket (`changedMessage()`). Its signing key comes from the secret `SERVICE_SIGNING_KEY` (`ServiceSigner.fromEnv`); without one it serves what it holds and refuses every write, with 503.

| Address | Who | What |
|---|---|---|
| `GET log?after={seq}&limit={n}` | machine or person | the log's entries after a sequence number, up to 1,000 at a time: `{ entries, head, more }` (`Relay.log`) |
| `PUT files/{path}` | machine | uploads a file an agent writes (`Relay.upload`): 201 with its entry, less the bytes; 200 for the same bytes again; 409 for other bytes at the path; 403 for a kind a machine doesn't write; 400 or 422 for one the store can't read |
| `DELETE files/waiting/{name}` | machine | a waiting marker stops (`Relay.stopWaiting`); nothing else is removed |
| `GET state` | machine or person | the state, `ApiState`, as `baesian serve`'s `/api/state` (`Relay.state`) |
| `GET presets` | machine or person | the presets and the survey, as `/api/presets` (`Relay.presets`) |
| `GET live` | machine or person | a hibernating WebSocket (below); without `Upgrade: websocket`, 426 |
| `POST verdicts` | person | an answer (`Relay.verdict`), taking the local server's fields (`VERDICT_FIELDS`) and `client`: 201 with the verdict, the card's status and the cards Baesian filed after it |
| `POST aliases` | person | a topic merge, `{ from, to }` (`Relay.alias`) |
| `POST preferences` | person | a preference change (`Relay.preferences`), the local server's fields (`PREFERENCE_FIELDS`); 409 when made from an older view |
| `POST presence` | person | the reviewer's heartbeat (`Relay.presence`), 204 |

## The storage (service/src/sql-storage.ts)

**`SqlFileStorage`** is the store's `Storage` over the object's SQLite, B-0ag7h's second kind of storage. Three tables: `files`, one row per path with its bytes; `log`, the append-only log; and `meta`, the project and its version.
- **`SqlFileStorage.create`** is an INSERT, so a taken path throws `FileExists`. In the same transaction it signs the file if the service signs its kind, writing its `.sig` beside it, and adds the file's entry to the log. A `.sig` is never its own entry: it rides in its file's, as `sig`. Nobody else writes one.
- **`SqlFileStorage.replace`** is an INSERT OR REPLACE, and **`SqlFileStorage.remove`** a DELETE; neither is logged. **`SqlFileStorage.list`** is a range query, from `dir/` up to `dir0`, giving the distinct next segment. Paths go through `checkPath()`, as memory's do.
- **`SqlFileStorage.after`** reads the log: each entry joined with its file's bytes and its `.sig`, so retention (M9f) can drop a body and keep the rest of the entry (D137). Each entry is checked by `readRelayEntry()` on the way out.
- **`SqlFileStorage.transaction`** runs a whole answer or upload in one `transactionSync`, so if anything throws, nothing it wrote is kept, log entries and version included. **`SqlFileStorage.asMachine`** names the uploading machine in the entries written (D162). **`SqlFileStorage.version`** moves with every write but the reviewer's heartbeat, as the local server ignores `presence.json`, and is kept in SQLite, so it never goes back after an eviction.

## One project's relay (service/src/relay.ts)

**`Relay.store`** is the project's store: `Store.over` the project's files, on the branch `RELAY_BRANCH` (`relay`), with the config `{ service, project }`, and the service's own key pinned (`ServiceSigner.trust`), so it counts what the CLI counts in a hosted repo. Everything a person writes goes through it, as the local client's answers do.

- **Uploads** take only the kinds an agent writes (`AGENT_KINDS`, `agentKind()`): card revisions, the CLI's gate records, withdrawals, fallbacks, attachments, decks, and waiting markers. Each is read as the store reads its kind, through `upgradeFile()` and the kind's schema, and its fields must match its path; a revision needs the one before it, and a withdrawal, fallback, attachment or marker its card (`uploadProblem()`). Everything a person writes, signatures, trust files and the relay's gate records are refused by name (`notAgentWritten()`). A waiting marker is mutable state, replaced, never logged.
- **Writes** run in one transaction (`Relay.write`, private). The first write to a project puts the service's key in its layer, `trust/service-<key>.json`, so a machine's first pull has it before anything signed; every card revision written, uploaded or filed by Baesian, gets the relay's gate record, `Store.relayGate`, with its draw from `ServiceSigner.draw`.
- **An answer** names the session's account and handle, the project (B-tf9fc) and the card revision's digest (B-f571v), and the client, `hosted-desktop` unless the page says `hosted-phone` (D130). The relay's storage signs the verdict and whatever the answer writes beside it: a rule from an accepted draft, a rule's retirement, a slider proposal's preference file. Then Baesian's own proposals are filed, as the local server files them (`afterVerdict()`); their failure never fails the answer. Their cards name the branch `relay`.
- **What takes a passkey is refused (403) until M9c:** an answer on a card whose level in force is hard (D139), and a preference change, or an accepted slider proposal, that lets more cards past you (D163, `NeedsPasskey`), so nothing is written.

## Signing (service/src/signer.ts)

**`ServiceSigner`** holds the service's Ed25519 key, PKCS #8 in PEM, from the secret. **`ServiceSigner.sign`** signs a file of a kind the service signs (`signedFile()`) as `signMessage()` does, OpenSSH's armored format in the `baesian` namespace; **`ServiceSigner.draw`** signs a card revision in `baesian-draw` (`drawMessage()`) and reads the draw from that signature; **`ServiceSigner.serviceKey`** is the key's trust file, from `SERVICE_KEY_ID`, `SERVICE_ORIGIN`, `SERVICE_RP_ID` and `SERVICE_KEY_VALID_AFTER`. With the stand-in's key (`test/service.ts`), the relay's gate records and signatures are its bytes, but for the time.

## Live updates (B-bv49e)

`GET live` is accepted with `ctx.acceptWebSocket`, so an idle socket costs no duration. On opening it's told the version, `{"type":"changed","version":N}`, and again after every request that moved it; the client reads the state again, as it does on the local server's `changed` event. A `ping` is answered `pong` by the runtime (`setWebSocketAutoResponse`). Sockets survive the object's eviction, hibernated, and hear the next change.

## Who may do what, before M9c (service/src/access.ts)

**`Access`** is the seam M9c fills: `Access.identify` says who a request is from, a **`Principal`**, a session (a person in a browser: account, handle, project) or a machine (a grant: machine, account, project), or nobody. **`handleRequest()`** enforces Hosted Service section 3 whatever implements it:
- an answer (`verdicts`, `aliases`, `preferences`, `presence`) refuses any request with an `Authorization` header, whatever it holds, before anyone is identified, so no token can answer;
- only a machine uploads, and only a session answers;
- each session and grant is for one project, and the address must name it (403 otherwise); nobody signed in is 401.

**`accessFor()`** picks the implementation. Production, which `wrangler.jsonc` makes the default (`BAESIAN_ENV` is `production`, and unset counts as production), gets **`NO_ACCESS`**, so every request is 401, "sign-in isn't built yet". Only when `BAESIAN_ENV` is `development` (a local run, from `.dev.vars`) or `test` (the tests), and grants are given in `BAESIAN_DEV_ACCESS`, does the stand-in run (`devAccess()`, `readGrants()`): fixed machine tokens, sent as `Authorization: Bearer`, and session cookies, `SESSION_COOKIE` (`__Host-baesian-session`). Writes must be `application/json`, and there's no CORS, as on the local server; the real cookie's SameSite and CSRF checks are M9c's.

## Tests

`npm run test:service` from the root: the service's typecheck (`wrangler types`, then `tsc`), then its tests in workerd through `@cloudflare/vitest-plugin` (B-hx2fn), with a signing key and grants made fresh for each run (`service/vitest.config.ts`). CI runs it too.
- `sql-storage.test.ts`: the storage interface's promises over SQLite, as `test/storage.test.ts` checks them for a folder and memory, and the log beside it.
- `uploads.test.ts`: what a machine may upload, the same bytes twice, a conflicting revision, waiting markers, and the log and its sequence.
- `answers.test.ts`: answers signed so the CLI's own checks pass (`Store.judge` in a store with the service's key pinned, over the files a pull writes), the passkey refusals, topic merges, preference changes and rules; the state, equal field for field to a store's over the same files; the relay's gate records.
- `gate.test.ts`: the relay's gate records, shown and held, and its signatures, byte for byte the stand-in's.
- `live.test.ts`: live updates, across hibernation and eviction (`evictDurableObject`).
- `access.test.ts`: the permission rules, and production refusing everything.
- `store-suite.test.ts`, run by `service/vitest.store.config.ts`: B-0ag7h's check, the store's own suites in `test/store.test.ts` over the relay's SQLite and over memory, in workerd. A test over SQLite runs inside a fresh object, the only place its storage can be reached, so each layer in `LAYERS` gives the `it` its tests run with. The rest of that file needs git and a disk, and is left out by name.
