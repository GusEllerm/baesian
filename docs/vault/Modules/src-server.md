---
type: module
status: active
authority: describes
summary: "src/server.ts, src/state.ts and src/api.ts: the local server the client talks to (M4 step 4). How it signs a browser in (D62, D97), its API (a snapshot plus change events, D96), how it watches the live layer (D84), how it reads the live layer without failing on a bad file, and the server file. The state it serves is built apart from the server, so the relay serves the same (B-17wn9)."
created: 2026-10-24
updated: 2026-11-03
reviewed: 2026-10-24
tags: [baesian, module]
---

# src/server.ts

The design is [[Local Server]]. `startServer` runs Node's own HTTP server on 127.0.0.1. Unless it's given a port, it starts on the one the last server used (`port.json`, `LastPort` in `src/schema.ts`), and if that's taken, on one the system picks (D103). It records the port it got, unless `reusePort` is false. It returns a `RunningServer`: its port, its token, the address to open (`serverUrl`), and `close`. `baesian serve` ([[src-cli]]) wraps it. **In a repo linked to the hosted service (D143, B-k216t, M9e)** `baesian serve` doesn't start it at all: it prints and opens the project's page on the website (`projectPage()`), where every answer is given and signed; the local client stays as it is for repos without the service (D8).

## Signing in (D62, D97)

- **A new token on every start:** 32 random bytes.
- **The address `baesian serve` opens** carries the token. The first request trades it for a cookie (`HttpOnly`, `SameSite=Strict`), and redirects to `/`.
- **The cookie is named for the port,** so two projects served at once keep their own sign-in: browsers don't keep cookies apart by port.
- **Scripts and tests** can send `Authorization: Bearer <token>` instead.
- **Tokens are compared in constant time.**
- **What's refused:**
  - every request whose Host isn't `127.0.0.1:<port>` or `localhost:<port>` (403), against DNS rebinding;
  - every write that isn't `application/json` (415);
  - request bodies over 64 KB (413).
- **There are no CORS headers.**

## The API (D96)

The types are in `src/api.ts`, which imports no Node modules, so the client can share them.
- **`GET /api/state`** returns `serverState`, an `ApiState`: the state `snapshot` builds (below), with this repo's name and branch, this process, and the vault's notes.
  - **The project:** its name and branch, and the server's pid, start time, clock and watch mode.
  - **Presence, decks and rules,** each rule with its retirement if it has one (D119). Each deck carries its context notes, resolved in the vault (`contextNotes`, [[src-vault]]; M6): each `ApiContextNote` has the link, what to show, and, with a vault, the note's path and `summary:` line, or that it's missing. The vault is listed once per snapshot, and only when a deck has context notes.
  - **One `ApiCard` per card:** the latest revision and its body, the number of revisions, whether its agent has had its reply (`replied`, D104), status, decision, canonical topic, verdicts, dependents, briefs, waiting markers, fallbacks and the number of attachments; and the gate's record for its latest revision (`gate`, M8), with `audit` set on a held card drawn for audit and not answered yet. On a held card the record gives the agent's pick away, so the client hides it until the reviewer has chosen (D151).
  - **`routing`** (`ApiRouting`, M8): the preference file in force and the history, the settings the gate applies (`Store.inForce`), why the newest file couldn't be read if it couldn't, and the report per row (`routingReport()`, [[src-routing]]).
  - **`problems`:** files that couldn't be read.
- **`GET /api/events`** is a Server-Sent Events stream. It sends `changed` with the new `version` whenever the live layer changes, gathering changes over 100 ms, and a keep-alive comment every 15 seconds.
- **`POST /api/verdicts`** takes the fields of an `ApiVerdictInput` and nothing else (`VERDICT_FIELDS`, in `src/api.ts`, which the relay checks too), `should_have_asked` included (D151), and never `seen`, which the store sets on a card answered in chat (B-hswmx). It records through `Store.addVerdict`, with `reviewer` from `reviewerName` (git's `user.name`) and `client: "web"`. Then it runs `afterVerdict` ([[src-routing]]), unless `ServerOptions.proposals` is false: the convention cards and slider proposals the record now calls for. A failure there is logged and never fails the answer. The responses:
  - 201, with the verdict, the card's new status, and `filed`, the IDs of any cards Baesian just proposed (the client's toast says it has a proposal, [[Client Build]] item 15);
  - 409 for a stale revision, 404 for an unknown card, 400 for an invalid verdict (including one that retires a rule its choice doesn't break) or an unexpected field.
- **`POST /api/preferences`** (D147) takes an `ApiPreferencesInput` and nothing else (`PREFERENCE_FIELDS`, shared with the relay): `replaces`, the file in force it was made from; a `preset`; the setup survey's `survey_see` and `survey_fine`, which pick a preset when none is named (B-5na1k); and any row, the mode, the rates, the burn-in and a reason, over the file in force. It writes through `Store.writePreferences`, by `reviewerName`, `client: "web"`. 201 with the file's name and contents; 409 when `replaces` isn't the newest file (`StalePreferences`); 400 for an invalid change, such as security below "tell me but carry on", or an unexpected field. It's the only way preferences are written, but for accepting a slider proposal.
- **`GET /api/presets`** returns `presets` (`ApiPresets`, built apart from the server too): the rows (with their floors, and the fixed ones marked), the positions (with the level each shows at), each preset with its settings and what it would have held of past cards (`replay()`), the settings in force replayed the same way, and the setup survey's example decisions and question. The client reads it when your preferences or the setup survey are open, and again on each change ([[Client Build]] items 16 and 17); it replays a draft itself.
- **`POST /api/presence`** is the client's heartbeat (D41), through `Store.touchPresence`.
- **`POST /api/aliases`** merges two topics (D111): `{from, to}` (`ApiAliasInput`), through `Store.mergeTopics`, with `by` from `reviewerName`. 201 with the alias, or 400.
- **`GET /api/practice`** and **`POST /api/practice`** (B-rehdw, [[Practice Cards]]): practice answers, apart from the state. `GET` gives every `PracticeEntry` kept in the live layer's `practice/` folder, oldest first (`readPractice()`, `ApiPractice`), a file it can't read skipped. `POST` takes an `ApiPracticeInput` and nothing else (`PRACTICE_FIELDS`, shared with the relay), through `practiceEntry()` (in `src/practice.ts`, which the relay uses too), by `reviewerName` with `client: "web"`, and writes it once (`writePractice()`): 201 with it, 400 for a field or value it doesn't take, 409 for a second start of the blind test or a mark before it. The folder isn't one of the kinds the record copies, nor what a machine uploads when the repo is linked, and the watcher ignores it, as it does sessions' models: writing one moves no version. No store method reads or writes it, so nothing an agent runs does.
- **`GET /api/health`** is how `findRunningServer` checks that a server is really answering.
- **Anything else outside `/api/`** is the client (`serveClient`), from the build `findClient` finds: `dist/client/` beside the built server, or `dist/` when the server runs from source. `ServerOptions.clientDir` overrides it, for tests.
  - **What's served:**
    - `index.html`, with a Content-Security-Policy that allows only the server's own origin, for fonts too (D99), and is never cached;
    - hashed files under `assets/`, cached for good;
    - for a path with no extension (one of the client's own routes), `index.html`.
  - **Refused:** any path that resolves outside the build (404).
  - **With no build,** a page says to run `npm run build`.
  - **Every file is read before its headers go out.** If a request fails after its headers are sent, the error handler closes the response rather than leave it hanging. A test caught that hang.

## The state, apart from the server (B-17wn9, B-0ag7h)

`snapshot` and `presets` are in `src/state.ts`, which imports nothing from Node and reads only through the store. So the relay (M9b) can serve the same state from a store with no repo ([[src-store]]), and the React client reads either the same way, as B-17wn9 decided. What the store doesn't know comes in a `StateContext`: the `version`; the server's pid, start time and watch mode, the pid only where there's a process (the relay has none, so its state has no `pid`, [[service]]); the project's name and branch; how a deck's context notes are resolved, and when (`now`, against which a waiting marker is stale). With no resolver, each link shows as its text (`plainNotes`, with `linkText()` from `src/wikilinks.ts`), as it does locally without a vault. `serverState` is the local server's context: `process.pid`, the repo's folder name and branch, and `contextNotes` over the vault, listed once per snapshot.

## Watching (D84)

`watchLive` runs recursive `fs.watch` over the live layer, and rescans every 30 seconds. A rescan compares a fingerprint of every file's path, size and modification time. If the watcher fails, or `--poll` is set, only the timer runs, every second.

The live layer's own bookkeeping never counts as a change: presence, the server file, inbox cursors and temporary files. A waiting marker's staleness depends on time, not on a file changing, so `stale` is as of `server.now`. The client re-evaluates it with `WAITING_STALE_MS`.

## Reading without failing

`snapshot` reads through `Store.view`, so each file is read once per snapshot. A file that can't be read, half-written, invalid or in a newer format than this Baesian reads (D157), goes in `problems` instead of failing the request, and is read again next time. 150 cards are read well within a second.

## The server file (D97)

`server.json` in the live layer (`ServerInfo` in `src/schema.ts`) holds the pid, port, token and start time, after its `type` and `format` (D156), as `port.json` holds the port.
- **It's written atomically, readable only by the user.**
- **It's removed by `close`,** but only if it still holds this server's token.
- **`findRunningServer`** returns a server only if its process exists and `/api/health` answers with its token. Anything else is a stale file, one in a newer format included, and the next start replaces it. A `port.json` it can't read is ignored the same way, and rewritten in the newest format.

## Tests

`test/practice-answers.test.ts` (B-rehdw) covers practice answers: the entry's kinds and refusals, the address on a real server, that it's never in the state or its events, the record, a linked repo's uploads or the inbox, and that no module an agent runs, nor the plugin's hooks or the relay's log, uploads and counts, names it.

`test/server.test.ts` runs real servers against real repos:
- the sign-in and every refusal;
- the snapshot, and verdicts and presence;
- a half-written file;
- change events from another process running the real CLI, both watching and polling;
- four processes filing 40 cards at once (`test/fixtures/file-cards.ts`);
- 150 cards in one snapshot;
- `baesian serve` started, found again, and stopped with Ctrl-C.

The four-writer test found a race in the store, when two agents on one branch file their first cards at the same moment ([[src-store]]).
