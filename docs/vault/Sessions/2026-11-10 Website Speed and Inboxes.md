---
type: session
status: active
livedocs: snapshot
summary: "2026-11-10, released as 1.0.1: the website measured (a project took 2.3 s to open, its state read twice), two duplicate reads fixed, then four cards answered and built: a project's last state kept in the tab and shown while it refreshes, answers held meanwhile; nothing kept on the device; each project's inbox on the projects page, its counts asked of each project. On v1/next, not released."
created: 2026-11-10
tags: [baesian, session]
---

# 2026-11-10: the website, quicker, and each project's inbox

The lead, on `v1/next`, after 1.0.0 was released ([[2026-11-10 Release Commit 1.0.0]]).

## Goal

The user found moving between the website's pages slow, and asked for caching of what changes rarely, and for each project to show whether cards wait for them there, as inboxes. Several reviewers per project comes after.

## What was done

- **Measured on baesian.dev, in the user's Chrome:** the first page read the account twice at once (0.5 and 0.7 s); opening the Baesian project (217 cards) read its 894 KB state (215 KB sent; 784 KB of it the cards' text) in 1.4 to 1.5 s, then again (0.8 s), before presence, practice and pauses; going back and opening it again cost the same.
- **The two duplicate reads, fixed** (686d6de), with a browser test that slows the state so the socket's message lands mid-read, and fails on the old code at each count.
- **Four cards, answered by the user:** B-3va5g (the kept copy, shown while it refreshes), B-9n2c3 (only in the tab), B-wgbdh (counts asked of each project, against the agent's pick of a stored count), B-fzr1e (projects, each with an inbox; the user's words in chat). B-acay5, the first filing of the counts card, was withdrawn: its proposal needed a privacy-policy line it hadn't said.
- **Built** (0066e00; [[Client Build]] item 29, [[service]]): `client/src/kept.ts`; `useHostedState()` starting from the kept copy, `refreshing` until the first read; the desk's "Refreshing…" and `commit()` holding answers; the wordmark within the app, leaving the page when answers are unconfirmed; `GET waiting` and `countWaiting()`; the projects page's inboxes (`<InboxTray />`, `inboxLine()`).
- **Found by the tests:** the wordmark reloaded the page, which forgot everything kept; and a `//` comment in JSX showed as text in the desk's header on a phone.
- **Tests:** 1,017 unit tests, the service's 171 and 68, and all 169 browser tests pass.
- Also: the hpc-bridge session asked for the README research; it was sent the reviewers' reports (extracted to this session's scratchpad), the principles, how the media are made, and what to change.

## Decisions

The four cards, each in `Decisions/`; the agent's own, in the [[Decision Log]] (2026-11-10, "The website, quicker, and each project's inbox, as built").

## Next

- ~~Release it.~~ **Released as 1.0.1:** the release commit `c372faf` (with a fix to a service test that took the oldest release served for the service's own; at 1.0.1 it serves 1.0.0 still); the user tagged `v1.0.1` (first in the chorus_conservancy checkout by mistake, where the tag was pushed to that repo, with nothing run there); the deploy, CI's npm publish with provenance, which validated the trusted publisher, and the GitHub Release all passed at once. npm listed 1.0.1 about seven minutes after the publish.
- A lighter first load: the state carries every card's full text, so a project's first open in a tab still takes about 1.5 s.
- Then several reviewers per project: what it means for a card to go to more than one inbox.
