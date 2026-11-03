---
type: module
status: active
authority: describes
summary: "src/server.ts and src/api.ts: the local server the client talks to (M4 step 4). How it signs a browser in (D62, D97), its API (a snapshot plus change events, D96), how it watches the live layer (D84), how it reads the live layer without failing on a bad file, and the server file."
created: 2026-10-24
updated: 2026-11-03
reviewed: 2026-10-24
tags: [baesian, module]
---

# src/server.ts

The design is [[Local Server]]. `startServer` runs Node's own HTTP server on 127.0.0.1. Unless it's given a port, it starts on the one the last server used (`port.json`, `LastPort` in `src/schema.ts`), and if that's taken, on one the system picks (D103). It records the port it got, unless `reusePort` is false. It returns a `RunningServer`: its port, its token, the address to open (`serverUrl`), and `close`. `baesian serve` ([[src-cli]]) wraps it.

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
- **`GET /api/state`** returns `snapshot`, an `ApiState`.
  - **The project:** its name and branch, and the server's pid, start time, clock and watch mode.
  - **Presence, decks and rules,** each rule with its retirement if it has one (D119). Each deck carries its context notes, resolved in the vault (`contextNotes`, [[src-vault]]; M6): each `ApiContextNote` has the link, what to show, and, with a vault, the note's path and `summary:` line, or that it's missing. The vault is listed once per snapshot, and only when a deck has context notes.
  - **One `ApiCard` per card:** the latest revision and its body, the number of revisions, whether its agent has had its reply (`replied`, D104), status, decision, canonical topic, verdicts, dependents, briefs, waiting markers, fallbacks and the number of attachments; and the gate's record for its latest revision (`gate`, M8), with `audit` set on a held card drawn for audit and not answered yet. On a held card the record gives the agent's pick away, so the client hides it until the reviewer has chosen (D151).
  - **`routing`** (`ApiRouting`, M8): the preference file in force and the history, the settings the gate applies (`Store.inForce`), why the newest file couldn't be read if it couldn't, and the report per row (`routingReport()`, [[src-routing]]).
  - **`problems`:** files that couldn't be read.
- **`GET /api/events`** is a Server-Sent Events stream. It sends `changed` with the new `version` whenever the live layer changes, gathering changes over 100 ms, and a keep-alive comment every 15 seconds.
- **`POST /api/verdicts`** takes the fields of an `ApiVerdictInput` and nothing else, `should_have_asked` included (D151). It records through `Store.addVerdict`, with `reviewer` from `reviewerName` (git's `user.name`) and `client: "web"`. Then it runs `afterVerdict` ([[src-routing]]), unless `ServerOptions.proposals` is false: the convention cards and slider proposals the record now calls for. A failure there is logged and never fails the answer. The responses:
  - 201, with the verdict, the card's new status, and `filed`, the IDs of any cards Baesian just proposed;
  - 409 for a stale revision, 404 for an unknown card, 400 for an invalid verdict (including one that retires a rule its choice doesn't break) or an unexpected field.
- **`POST /api/preferences`** (D147) takes an `ApiPreferencesInput` and nothing else: `replaces`, the file in force it was made from; a `preset`; the setup survey's `survey_see` and `survey_fine`, which pick a preset when none is named (B-5na1k); and any row, the mode, the rates, the burn-in and a reason, over the file in force. It writes through `Store.writePreferences`, by `reviewerName`, `client: "web"`. 201 with the file's name and contents; 409 when `replaces` isn't the newest file (`StalePreferences`); 400 for an invalid change, such as security below "tell me but carry on", or an unexpected field. It's the only way preferences are written, but for accepting a slider proposal.
- **`GET /api/presets`** returns `presets` (`ApiPresets`): the rows (with their floors, and the fixed ones marked), the positions (with the level each shows at), each preset with its settings and what it would have held of past cards (`replay()`), the settings in force replayed the same way, and the setup survey's example decisions and question.
- **`POST /api/presence`** is the client's heartbeat (D41), through `Store.touchPresence`.
- **`POST /api/aliases`** merges two topics (D111): `{from, to}` (`ApiAliasInput`), through `Store.mergeTopics`, with `by` from `reviewerName`. 201 with the alias, or 400.
- **`GET /api/health`** is how `findRunningServer` checks that a server is really answering.
- **Anything else outside `/api/`** is the client (`serveClient`), from the build `findClient` finds: `dist/client/` beside the built server, or `dist/` when the server runs from source. `ServerOptions.clientDir` overrides it, for tests.
  - **What's served:**
    - `index.html`, with a Content-Security-Policy that allows only the server's own origin, for fonts too (D99), and is never cached;
    - hashed files under `assets/`, cached for good;
    - for a path with no extension (one of the client's own routes), `index.html`.
  - **Refused:** any path that resolves outside the build (404).
  - **With no build,** a page says to run `npm run build`.
  - **Every file is read before its headers go out.** If a request fails after its headers are sent, the error handler closes the response rather than leave it hanging. A test caught that hang.

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

`test/server.test.ts` runs real servers against real repos:
- the sign-in and every refusal;
- the snapshot, and verdicts and presence;
- a half-written file;
- change events from another process running the real CLI, both watching and polling;
- four processes filing 40 cards at once (`test/fixtures/file-cards.ts`);
- 150 cards in one snapshot;
- `baesian serve` started, found again, and stopped with Ctrl-C.

The four-writer test found a race in the store, when two agents on one branch file their first cards at the same moment ([[src-store]]).
