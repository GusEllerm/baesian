---
type: design
status: active
authority: specifies
summary: "M4 step 4: the local server the client talks to. The command (`baesian serve`), its security (D62), its API (a snapshot of the live layer, change notifications over Server-Sent Events, verdicts and presence), watching (D84), and the server file. Its two open points were decided as D96 (the API) and D97 (the token and port)."
created: 2026-10-24
updated: 2026-10-31
reviewed: 2026-10-24
tags: [baesian, design, server, m4]
---

# Local Server

Provenance: drafted by the agent on 2026-10-24 for M4 step 4 (D91), from earlier decisions, and built the same day ([[src-server]]). Everything not marked as an open point follows from one of them. The client is step 5. Until it exists, the server serves a page saying so.

## Already decided

- **Node's own HTTP server, no framework,** as for the style vote ([[Baesian Design]]).
- **Bound to 127.0.0.1;** phone access comes later, through Tailscale (D63).
- **A random token in the URL `baesian serve` opens, Host-header checks, and no CORS** (D62).
- **The client's heartbeat every 30 seconds** (D41).
- **Verdicts record the client that wrote them** (D62), and the choice made before the reveal (D88).
- **Watching:** recursive `fs.watch`, a full rescan every 30 seconds, a scan at start, and a fallback to the rescan if the watcher fails (D84, [[Implementation Plan#Notes from M4]]). Polling is a mode of its own, for shared storage.
- **The API is shaped around the store's operations,** so agents on other machines could later use it too ([[Baesian Design#Open questions]]).

## The command

`baesian serve [--port <n>] [--no-open] [--poll]`
- **One server per repo,** because the live layer is shared by every worktree. If one is already running, `serve` prints its address and opens it, rather than starting another.
- **It runs in the foreground.** Ctrl-C stops it and removes the server file.
- **It opens the browser** (`open` on macOS, `xdg-open` on Linux) unless `--no-open`.
- **`--poll` checks every second instead of watching,** for a live layer on shared storage.
- **It starts on the port the last server used, if it's free** (D103), and otherwise on one the system picks. `--port` chooses one. The address then stays the same across restarts except for its token, so the browser keeps what it stores for the client, and its permission to notify.

## Security (D62)

- **Bound to 127.0.0.1 only.**
- **The token** is 32 random bytes. `serve` opens `http://127.0.0.1:<port>/?token=<token>`.
  - The first request trades the token for a cookie (`HttpOnly`, `SameSite=Strict`), and redirects to `/`, so the token leaves the address bar and the history.
  - **The cookie is named for the port** (`baesian-<port>`). Browsers keep cookies apart by host but not by port, so with one name, two projects served at once overwrote each other's sign-in, and each sent its token to the other. Found in M4 step 5e; a browser test covers it.
  - Scripts and tests can send `Authorization: Bearer <token>` instead.
- **Every request's Host must be `127.0.0.1:<port>` or `localhost:<port>`.** That stops DNS rebinding.
- **No CORS headers,** so no other site can read a response.
- **Writes must be `application/json`.** A form on another site can't send that without a preflight, which fails.
- **What it doesn't stop:** anything running as the user can read the server file and use the token. That's the threat D62 accepted: agents run as the user and could write verdict files directly. Verdicts still record their `client`.

## The API (D96)

| Request | Does |
|---|---|
| `GET /api/state` | **A snapshot of the live layer:** <br>- the project's name, and the server's start time, clock and watch mode; <br>- presence, decks and rules; <br>- every card, with its latest revision, body, status, decision, verdicts, dependents, briefs, waiting markers (and whether each is stale), fallbacks and attachments; <br>- `problems`, files that couldn't be read. <br>A `version` number changes whenever anything does |
| `GET /api/events` | **Server-Sent Events.** `changed`, with the new `version`, whenever the live layer changes. Changes are gathered over 100 ms, and a keep-alive comment goes out every 15 seconds. The client reads `/api/state` again |
| `POST /api/verdicts` | `{card, revision, response, choice?, comment?, first_choice?, make_rule?}`, recorded through `Store.addVerdict`. `reviewer` is git's `user.name`, and `client` is `web`. A stale revision returns 409; an invalid verdict returns 400 with the reason |
| `POST /api/presence` | **The client's heartbeat** (D41), through `Store.touchPresence` |
| `POST /api/aliases` | `{from, to}`: **merging two topics** (D44, D111), through `Store.mergeTopics`, by git's `user.name`. A merge that isn't possible (already one topic, or into a topic nobody uses) returns 400 |
| `GET /`, static files | **The client's build** ([[Client Build]]), with a policy that allows only the server's own origin. With no build, a page saying how to build it |

**Later, not in step 4:** rules and topic merges written from the client, practice cards, and agent operations over HTTP.

## Reading the live layer

- **A half-written or invalid file is never fatal.** It goes in `problems`, and is read again on the next change. Writers use exclusive creates, so this is rare, but a reader can still catch a file mid-write.
- **The server writes only through the store,** the same code the CLI uses.
- **Status, decisions and briefs are computed by the store,** as for the CLI. What the client shows from them (rarity, the stakes line, the queue's order) is computed in the client, from the snapshot.

## The server file

`.git/baesian/server.json`: `type: server`, `pid`, `port`, `token`, `started`. It lives in the live layer only, is mutable, and is readable only by the user (mode 0600).
- **Its use:** `serve` reads it to find a running server.
- **Its life:** removed when the server stops. One whose process has gone is replaced.
- **A P12 addition.**

`.git/baesian/port.json`: `type: port`, `port` (D103). The port the last server listened on, kept after it stops, so the next one can start on the same address. It holds no secret. `serve` writes it when it starts on a different port than before, unless given `--port`. Also a P12 addition.

## Decided by the user

- **D96: the API is a snapshot plus change events,** as above. Rejected: endpoints per resource with incremental events.
- **D97: a new token and a system-chosen port for each `serve`.** Stable addresses wait for M4c. Rejected: a token and port kept per repo.
- **D103 revises D97's port:** the last server's port when it's free, so the browser keeps the client's own data across restarts. The token is still new each time.
