---
type: review
status: active
summary: "A scale test overnight on 2026-11-02 to 11-03: 400, 2,000 and 10,000 cards. Every command was quadratic in the number of cards, and a listing of 2,000 took about 11 minutes; reading through one view per command, with indexes built once, made everything linear (about 1.5 s at 10,000)."
created: 2026-11-03
tags: [baesian, review, performance]
---

# Scale test, 2026-11-03

Run overnight (step C6 of [[2026-11-03 Overnight]]). The question: what happens to the CLI, the server and the client as a repo's cards pile up, at 2,000 and 10,000 cards?

## How it was run

- A scratch repo, set up with `baesian init`, with N cards written straight into the live layer, each a copy of one real card (new ID, title and topic, across 40 areas), and a verdict on every second card. Writing them through the store would itself have been quadratic, since filing reads every card (below), so 10,000 would have taken hours.
- Timed on a MacBook (Apple silicon), Node 22, from source through `tsx` (about 150 ms of each CLI time is start-up): `baesian list`, `list --all`, `inbox --peek`, `show`, `topics`, `file` with the duplicate check on, one `wait` poll, `GET /api/state`, and the client's load to its first card in headless Chromium. The commit hooks and `check` were timed at 2,000.
- The script was a scratch file, not kept in the repo.

## What it found

**Every command was quadratic.** Doubling the cards quadrupled the time:

| `baesian list` | 100 cards | 200 | 400 | 2,000 |
|---|---|---|---|---|
| Before | 1.9 s | 6.6 s | 26 s | about 11 minutes (stopped) |

At 10,000 it would have taken hours. Two causes, one inside the other:

1. **Every read went back to the disk.** A card's status asks whether any other card supersedes it or names it in a conflict (D35), so it reads every card. A listing asks for each card's status, so it read every card once per card. `Store.view`, which reads each file once, existed, but only the server used it, because inside a view a bad file was skipped, not thrown, and the CLI must fail loudly.
2. **Even with each file read once, each status rebuilt the list of all cards** and filtered every verdict file's name for its card, so the work in memory was still quadratic: at 2,000 cards, `list` took 8.4 s inside a view, and the server's state 11 s.

## The fix (on the branch `overnight/2026-11-03`)

- **`Store.view` can be loud:** without a `report`, a bad file still throws; with one, as the server uses it, it's reported and skipped. A view inside a view shares it.
- **The commands that read every card read through one view:** `list`, `show`, `inbox`, `topics`, each poll of `wait`, and filing's checks (the duplicate check and the near-topic warning), which run in a view that ends before anything is written.
- **A view builds three things once:** the list of cards, each card's verdict files, and the cards that supersede or name each card (`Store.claimants`), so a status is a lookup, not a scan.
- Two new unit tests: a view gives the statuses reading afresh does, and the next view sees what changed; and a view without a report stays loud.

## After

| | 2,000 cards | 10,000 cards |
|---|---|---|
| `baesian list` | 0.8 s | 1.6 s |
| `baesian inbox --peek` | 0.9 s | 1.6 s |
| `baesian file`, with the duplicate check | 0.7 s | 1.7 s |
| `baesian show <id>` | 0.5 s | 1.4 s |
| one `wait` poll | 0.2 s | 1.2 s |
| `GET /api/state` | 1.0 s (was 11 s) | 1.5 s (was 21.5 s) |
| the client's load to its first card | 2.2 s (was 22 s) | 3.3 s (was 45 s) |
| a render in the client (hovering an option) | 60 ms | 77 ms |
| the pre-commit hook, `check`, `sync` | about 0.2 s each | not run |
| the commit-msg hook | 1.4 s | not run |

What's left is reading every card file once per command: `cards()` alone takes 1.2 s at 10,000.

## Still to consider

- **`wait` polls once a second, and each poll reads every card** (1.2 s at 10,000), for each agent waiting. That's a second of CPU every second per waiting agent. A poll needs only its card, its verdicts and its claimants; an index of claimants kept in the live layer, or having the server tell waiting agents, would make it cheap. The hosted service (D127) changes this anyway: agents would hear through the relay.
- **`/api/state` is 9.6 MB at 10,000 cards** (1.9 MB at 2,000): the client gets every card, decided or not. Sending what's waiting plus what the path and the relations need, and the rest on request, would keep the phone layout (D130) usable.
- **The commit-msg hook lists every verdict since the last commit.** At 2,000 cards with 1,000 new verdicts, it printed a thousand lines. Fine for real repos, where few verdicts land between commits, but it could summarise past a few dozen.
- **Not tested:** `baesian verify` over a committed record of this size, git's own speed with 10,000 card folders in `.baesian/`, many revisions per card, and Linux's inotify limit (about 8,000 card folders at the old default, found in M4's file-watching check).
