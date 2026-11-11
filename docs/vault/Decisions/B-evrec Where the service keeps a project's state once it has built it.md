---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Where the service keeps a project's state once it has built it: Kept in the project's database (B-evrec)."
created: 2026-11-11
updated: 2026-11-11
tags:
  - baesian
  - decision
aliases:
  - B-evrec
card: B-evrec
revision: 1
title: Where the service keeps a project's state once it has built it
question: Once the service has built a project's state for the website, should it keep that in the project's database until the project changes, or only in memory, where it's gone about ten seconds after the last request?
answer: Kept in the project's database
response: accept
not_chosen:
  - Kept in memory only
answered: 2026-11-11T16:11:12.486Z
answered_by: GusEllerm
topic: hosted/built-state
deck: relay-speed
level: hard
reverse: cheap
touches:
  - schema
  - privacy
filed: 2026-11-11T15:57:51.020Z
filed_by: claude-code
branch: v1/next
---

# Where the service keeps a project's state once it has built it

Once the service has built a project's state for the website, should it keep that in the project's database until the project changes, or only in memory, where it's gone about ten seconds after the last request?

**Decided:** Kept in the project's database, the agent's pick. Then the relay stores the state it built in a new table of the project's database and sends it as it is until the project changes; any change deletes it in the same step, and the relay builds it again about a second later. A project that hasn't changed should open in about 0.2 seconds instead of 1, however long you were away, and the projects page's counts come from the same copy.

**Not chosen:** Kept in memory only. Then nothing more is stored; the built state lasts while the project's object stays in memory, about ten seconds after its last request. Clicking straight back to a project is quick; coming back after longer builds it again, about a second, as today.

**It turned on:** Should a project open quickly when you come back to it after a while, at the cost of a second copy of its cards' text in the project's own database? (a preference) Quick after a while: Kept in the project's database. Nothing more stored: Kept in memory only.

**The fact given:** Measured on baesian.dev today, on the Baesian project (222 cards): its state is 896 KB, sent as 220 KB in about 20 milliseconds. The second it takes to open is the service building that state: on every request it reads, parses and checks every file of the project (0.6 to 0.9 seconds for the state; 0.4 to 0.6 for the projects page's counts). So sending less text wouldn't shorten it. The project's database already holds every card's text. A kept state would be a second copy of that text in the same database, in a table of its own, deleted in the same step as any change to the project, including when retention removes a card's text. Nothing new is collected, and the privacy policy reads true as it is. Cloudflare clears a project's object from memory after about ten seconds without a request.

**The agent's case:** The delay you noticed is the build, and it's paid on every open, on every count on the projects page, and each time you come back to a tab. Memory lasts ten seconds, so it helps only when you click straight back; the first open of the day, or after an agent filed cards, would stay a second. The stored copy is the same text in the same database under the same retention, and it can't go out of date: the write that changes the project is the one that deletes it.

**Wrong if:** the desk or a count ever shows something the project no longer holds, or text that retention removed is still in the kept table afterwards. **To check:** tests that read the kept table after each kind of write and after a retention sweep; and, on the site, comparing the desk with `baesian list` after answering.

Answered by GusEllerm on 2026-11-11, through Baesian (card B-evrec, revision 1). Filed by claude-code on v1/next, in the deck “What the service keeps so a project opens quickly”.

The record is in `.baesian/cards/B-evrec/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

**What was measured.** In the browser, signed in, each request timed to its first byte, five or six times each:

| Request | What it does on the service | Time |
|---|---|---|
| the service's keys | nothing but the Worker | 0.04 s |
| a project that isn't yours | finds who you are (the accounts database) | 0.11 s |
| a project's paused machines | that, and wakes the project's object | 0.15 s |
| a project's waiting counts (34 bytes) | that, and reads every card to count | 0.5 to 0.7 s |
| a project's state (896 KB) | that, and builds the whole state | 0.8 to 1.1 s |

Downloading the state took 15 to 22 milliseconds and parsing it 2 to 6. The same build on this machine, in Cloudflare's runtime, takes 0.07 seconds: about a tenth of what it takes on Cloudflare. Of the build's work, 44% is parsing the cards' YAML and 17% checking the service's signatures on your answers; the rest is the store's own work.

**The proposal, in full.** A table `built` in each project's database holds the state as last built (all but the clock, the object's start time and your presence, which are added as it's sent), and the list of waiting cards. Every write that moves the project's version deletes its rows in the same transaction, so the table is either empty or current. About a second after the last write, the relay builds it again, so the next read usually finds it; a read that comes first builds it itself. A waiting agent's marker goes stale by the clock alone, so a kept state is used only until the moment one of its markers would. A new release, or a change of the service's key, starts afresh.

**What it doesn't do.** The first read after your own answer still builds the state, since the website reads it at once. Making each build quicker (the parsed files) and the second a project's object takes to start after a long idle are separate, and come after.

The projects page still asks each project for its counts (B-wgbdh): the answer comes from the project's own database, exact, since any change deletes the copy.
