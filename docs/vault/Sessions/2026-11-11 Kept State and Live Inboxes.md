---
type: session
status: active
livedocs: snapshot
summary: "2026-11-11, on v1/next, not released: the website's delay measured on baesian.dev and found to be the relay building a project's state on every request, not the state's size; the state is now kept as built in the project's database until the project changes (B-evrec), and the projects page holds each project's live connection, so a new card shows without a reload (B-gty71). The account's lists are read together."
created: 2026-11-11
tags: [baesian, session]
---

# 2026-11-11: the state kept as built, and inboxes that hear of new cards

The lead, on `v1/next`, after 1.0.1 was released ([[2026-11-10 Website Speed and Inboxes]]).

## Goal

The user's order after 1.0.1: a lighter first load, then several reviewers per project. While answering the first card they asked whether the projects page checks for new cards on a timer: they'd had to reload it to see one.

## What was measured

The plan was to send less of each settled card's text. Measured first, on baesian.dev, signed in, on the Baesian project (222 cards), each request timed to its first byte five or six times:

| Request | What the service does | Time |
|---|---|---|
| the service's keys | nothing but the Worker | 0.04 s |
| a project that isn't yours | finds who's asking, in the accounts database | 0.11 s |
| a project's paused machines | that, and wakes the project's object | 0.15 s |
| the account | seven reads of the accounts database, in turn | 0.29 s |
| a project's waiting counts (34 bytes) | reads every card to count | 0.5 to 0.7 s |
| a project's state (896 KB, sent as 220 KB) | builds the whole state | 0.8 to 1.1 s |

- **Sending isn't the cost:** the state downloads in 15 to 22 milliseconds and parses in 2 to 6. Trimming the text would have saved a few percent.
- **Building is:** every request to a project read, parsed and checked every file again. The same build on this machine, in workerd over the same files with the deployed service's key pinned, takes 0.07 seconds, about a tenth of what Cloudflare takes; the log, read in one statement, is slower there by about as much, so it's the work, not the number of SQL statements (2,846 for a state, 5,302 rows).
- **Where the work goes** (a CPU profile in Node, zod without eval as workerd runs it): 44% parsing the cards' YAML, 17% checking the service's signatures, 11% the store's own.
- **It's paid again after every change:** the website reads the state again each time the project says it changed, a waiting agent's 30-second beats included.
- **Once, after a long idle, a small request took 1.2 seconds, not 0.15.** Not explained: the Worker's startup takes 23 milliseconds here.

The benchmark and its fixture are in the session's scratchpad, not the repo.

## What was done

- **The account's five lists are read together** (`35b93f4`): each was a trip to the accounts database after the last.
- **B-evrec, "Kept in the project's database"** ([[service]]): the relay keeps the state it built in a table of the project's database, `built` (the object's migration 2), and sends it as that text until the project changes. Every write empties the table in its own transaction; two seconds after the last change the state is built again; the clock, the object's start and the reviewer's presence are added as it's sent; a kept state holds only until a waiting marker in it would go stale; the waiting counts are kept with it. Here, a kept state is sent in a millisecond, against 70 to build one.
- **B-gty71, "Told by each project"** ([[Client Build]] item 30): the projects page holds each project's live connection (`listen()`, which the desk now uses too) and asks a project for its count again whenever it says it changed.
- **Found by the browser tests:** a constant exported from the Worker's main module stopped the Worker starting ("Incorrect type for map entry"), which the service's own tests can't see, since they import the module rather than run it. It moved to `service/src/built.ts`, and `worker-exports.test.ts` now checks the module's exports.
- **Tests:** 1,023 unit tests, the service's 182 and 68, and all 169 browser tests pass. The tests for the kept state fail when a write no longer empties it or a kept state outlives its markers; the inbox's browser test fails without the connection, as the page did for the user.

## Decisions

B-evrec and B-gty71, each in `Decisions/`; the agent's own in the [[Decision Log]] (2026-11-11).

## Not verified

- **The gain on Cloudflare.** A kept state should be sent in about 0.2 seconds, by the time a small request to a project takes there; it's an estimate until a release is deployed and a project's open is timed again. The same for the account's read.
- **The timer under real load:** that a burst of uploads from `baesian sync` is one build, not several, on Cloudflare's clock.

## Next

- Release it (1.0.2: a migration of each project's tables, so a rollback to 1.0.1 would refuse projects 1.0.2 has woken, as B-866d2 has it), then time a project's open on baesian.dev.
- If each change still costs too much: keep each file parsed, so a build is quicker; and find the second a project takes after a long idle.
- Then several reviewers per project: its goals and how collaboration works come first, as a proposal, then cards.
