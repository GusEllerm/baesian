---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Where the project goes in the relay's addresses: The project in the path (B-7z97x)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-7z97x
card: B-7z97x
revision: 1
title: Where the project goes in the relay's addresses
question: Should the relay's addresses name the project, as /v1/projects/{id}/…, or take it from the machine's grant or the browser's session?
answer: The project in the path
response: accept
not_chosen:
  - The project from the sign-in
answered: 2026-11-03T20:32:25.144Z
answered_by: Gus Ellerm
topic: hosted/relay-urls
deck: hosted
level: blocking
reverse: cheap
touches:
  - public-api
filed: 2026-11-03T20:28:39.388Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-17wn9 Where the website's client gets its state|B-17wn9]]"
  - "[[B-84e0d What one machine sign-in covers|B-84e0d]]"
---

# Where the project goes in the relay's addresses

Should the relay's addresses name the project, as /v1/projects/{id}/…, or take it from the machine's grant or the browser's session?

**Decided:** The project in the path, the agent's pick. Every relay address starts /v1/projects/{project}/: the log, uploads, the state and live updates. The service checks that the machine or session is allowed that project. A signed-in page can open several projects at once.

**Not chosen:** The project from the sign-in. Addresses are /v1/log, /v1/state and so on. A machine's grant is for one project, so it names it; a browser session picks a project, and opening another means switching.

**It turned on:** Will you want more than one project open on the website at once? Yes: The project in the path. No: The project from the sign-in.

**The fact given:** Each machine's grant is for one project, and what a machine signs in with never goes in a URL (Hosted Service section 3). A project ID is random and isn't secret: it's in the committed config (P16 section 8). The relay's protocol is a public interface from v1, versioned by /v1/ in its address (P16 section 8); before v1 it can change freely (D108). The website's own page addresses, the ones you'd bookmark, are M9e's.

**The agent's case:** Addresses that say which project they're about are easier to check, log and limit per project, and a page or a test can talk to two projects at once. The permission check is the same either way.

**Wrong if:** Project IDs in addresses reach logs or analytics that are shared, where they'd tie activity to a repo. **To check:** List what Cloudflare's request logs keep, and whether the usage counts (D141) record paths.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-7z97x, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-7z97x/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The CLI's sync (M9d) and the website (M9e) both use these addresses; M9b builds them. Under the proposal, the relay's addresses would be:

| Address | What |
|---|---|
| `GET /v1/projects/{p}/log?after={seq}` | entries after a sequence number (P16 section 8) |
| `PUT /v1/projects/{p}/files/{path}` | a machine uploads a file an agent writes |
| `GET /v1/projects/{p}/state` | the snapshot, as `baesian serve`'s `/api/state` |
| `GET /v1/projects/{p}/live` | live updates (card hosted/relay-live-updates) |
| `POST /v1/projects/{p}/verdicts` and the other answers | from a signed-in browser only (Hosted Service section 3) |
