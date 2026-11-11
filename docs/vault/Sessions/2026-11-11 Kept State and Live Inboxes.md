---
type: session
status: active
livedocs: snapshot
summary: "2026-11-11, released as 1.0.2: the website's delay measured on baesian.dev and found to be the relay building a project's state on every request, not the state's size; the state is now kept as built in the project's database until the project changes (B-evrec), and the projects page holds each project's live connection, so a new card shows without a reload (B-gty71). The account's lists are read together."
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
- **The projects page stops trying a project that refuses it** (`371cf67`): signed out in another tab, its connections were tried again every ten seconds for as long as the page stayed open.
- **Tests:** 1,023 unit tests, the service's 182 and 68, and all 170 browser tests pass, at 1.0.2. The tests for the kept state fail when a write no longer empties it or a kept state outlives its markers; the inbox's browser test fails without the connection, as the page did for the user.

## Decisions

B-evrec and B-gty71, each in `Decisions/`; the agent's own in the [[Decision Log]] (2026-11-11).

## Released, and measured again

The user tagged `v1.0.2` (on the right repo this time). The deploy's three jobs passed: the service deployed, CI published `baesian@1.0.2` to npm by trusted publishing, with provenance (listed as `latest` about three minutes later), and the GitHub Release was made.

Measured on baesian.dev minutes after, signed in, the same requests, interleaved, each timed to its first byte:

| Request | Before, over a request that does no work | After, over one |
|---|---|---|
| a project's waiting counts | 0.35 to 0.55 s more | no more (0.56 s against 0.56 s) |
| a project's state | 0.65 to 0.95 s more | about 0.1 s more (0.67 s), and about one read in four 0.45 s more |

- **The times themselves don't compare with the morning's.** The browser was reaching the service through Cloudflare's São Paulo location (`colo=GRU`, over HTTP/3; `curl` from the same machine reached Boston and Chicago), which put about 0.4 s on every request: 0.15 to 0.19 s for the service's keys against 0.04 s, 0.56 s for a request to the project that does no work against 0.15 s. So what's compared is each request against one on the same route that does no work.
- **The slower reads of the state aren't builds:** the project's version didn't move, its only waiting marker was stale already, and the counts, read between them, came from what was kept. Not explained; the 0.9 MB crossing from the project's object to São Paulo is the first suspect.
- **One read took 2.9 seconds:** it arrived as the user's answer to B-fb760 was being written, and waited behind it.
- **The account's read** is three trips to the accounts database where it was seven: 0.57 to 0.64 s on that route, where seven would have been about a second.
- **The first read of the project after the deploy** took 1.6 s: its tables migrated, and its state built.

## The rule

The user's answer to Baesian's own card, B-n392b ("A pattern in your answers on website"), asked for a rule from B-wgbdh and B-gty71. Drafted as B-fb760 and accepted: R-mvbvy, "What the website shows of a project's cards comes from the project itself, exact and current: the project is asked, or says when it changes; never a copy kept outside the project, or one refreshed on a timer." It covers no gate facts. B-evrec keeps to it: its copy is in the project's own database, and never older than the files.

## Not verified

- **The times on an ordinary route.** By the differences above, a project that hasn't changed should send its counts in about 0.15 s and its state in about 0.25 s when the browser reaches a nearby Cloudflare location.
- **The timer under real load:** that a burst of uploads from `baesian sync` is one build, not several, on Cloudflare's clock.
- **Why the CLI couldn't reach the service for about 20 seconds** while the rule's draft was filed, before the release; it worked on the next try.

## Next

- Several reviewers per project: its goals and how collaboration works come first, as a proposal, then cards.
- Left for later: keeping each file parsed, so a build is quicker (each change still costs one, 0.6 to 0.9 s, your own answers included); the second a project takes after a long idle; the state's slower reads.
