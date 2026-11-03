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
  - **One `ApiCard` per card:** the latest revision and its body, the number of revisions, whether its agent has had its reply (`replied`, D104), status, decision, canonical topic, verdicts, dependents, briefs, waiting markers, fallbacks and the number of attachments.
  - **`problems`:** files that couldn't be read.
- **`GET /api/events`** is a Server-Sent Events stream. It sends `changed` with the new `version` whenever the live layer changes, gathering changes over 100 ms, and a keep-alive comment every 15 seconds.
- **`POST /api/verdicts`** takes the fields of an `ApiVerdictInput` and nothing else. It records through `Store.addVerdict`, with `reviewer` from `reviewerName` (git's `user.name`) and `client: "web"`. The responses:
  - 201, with the verdict and the card's new status;
  - 409 for a stale revision, 404 for an unknown card, 400 for an invalid verdict (including one that retires a rule its choice doesn't break) or an unexpected field.
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

`snapshot` reads through `Store.view`, so each file is read once per snapshot. A file that can't be read, half-written or invalid, goes in `problems` instead of failing the request, and is read again next time. 150 cards are read well within a second.

## The server file (D97)

`server.json` in the live layer (`ServerInfo` in `src/schema.ts`) holds the pid, port, token and start time.
- **It's written atomically, readable only by the user.**
- **It's removed by `close`,** but only if it still holds this server's token.
- **`findRunningServer`** returns a server only if its process exists and `/api/health` answers with its token. Anything else is a stale file, and the next start replaces it.

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
