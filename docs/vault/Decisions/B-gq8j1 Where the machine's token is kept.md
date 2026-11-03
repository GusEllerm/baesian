---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Where the machine's token is kept: A file only you can read (B-gq8j1)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-gq8j1
card: B-gq8j1
revision: 1
title: Where the machine's token is kept
question: Where should baesian login keep a machine's tokens, in a file only you can read, or in the operating system's keychain where there is one?
answer: A file only you can read
response: accept
not_chosen:
  - The OS keychain, with the file as a fallback
answered: 2026-11-03T13:33:05.321Z
answered_by: Gus Ellerm
topic: hosted/token-storage
deck: hosted
level: hard
reverse: cheap
touches:
  - security
  - dependency
  - schema
filed: 2026-11-03T13:32:02.149Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-9tk9m How people sign up and sign in|B-9tk9m]]"
---

# Where the machine's token is kept

Where should baesian login keep a machine's tokens, in a file only you can read, or in the operating system's keychain where there is one?

**Decided:** A file only you can read, the agent's pick. Tokens go in a grant file in Baesian's user config folder, readable only by you (mode 0600), as Claude Code does on Linux. No new dependency, and it works the same over SSH, in containers and on the cluster.

**Not chosen:** The OS keychain, with the file as a fallback. Tokens go in the system's credential store on macOS, Windows and Linux desktops, as gh does; machines without one fall back to the file. It needs a native module, a new runtime dependency with a card of its own.

**It turned on:** Is keeping tokens out of a plain file worth a native runtime dependency? Not worth it: A file only you can read. Worth it: The OS keychain, with the file as a fallback.

**The fact given:** Where a token is kept doesn't stop an agent running as you from using it through baesian; what the token may do is the boundary (B5 F11). What a keychain adds is that the token isn't in a file a backup, a dotfiles repo or a stray cat can pick up. Refresh tokens are single-use, so a stolen one, once used, gets the grant revoked at the real CLI's next refresh (RFC 9700). Claude Code uses the macOS Keychain, else a 0600 file; gh falls back to a plain file. keytar, the usual module, was archived in 2022.

**First chose:** The OS keychain, with the file as a fallback, then switched once the agent's pick was shown.

**The agent's case:** The keychain doesn't protect against the agent, which is the threat that matters here, and a native module is a build and install risk on every platform. A 0600 file with short-lived, rotating tokens is what comparable tools fall back to.

**Wrong if:** A token turns up in a backup, a dotfiles repo or a pasted log, or the first outside users expect keychain storage and say so. **To check:** Before publishing, look at whether common dotfile tools sync ~/.config by default, and ask the first outside users which they'd expect.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-gq8j1, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-gq8j1/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

P15 left this open ([[Hosted Service]], section 2, "Signing in from the CLI"). The grant file's fields are in [[Formats for v1]] (P16, section 8): service, project, machine, access_token, access_expires, refresh_token. With a keychain, the file would hold no token.

P15's lifetimes, the agent's defaults: access tokens last about an hour; refresh tokens are single-use and rotate, and a reused one revokes the grant (RFC 9700, B5 F10).

Checked for this card, through Context7: keyring-rs, a Rust library of the kind a Node module would wrap, uses the macOS Keychain, the Windows credential store, and on Linux the kernel's keyutils store unless the Secret Service is chosen. A Node wrapper for it wasn't found there, so the module named in the premise check is *unverified*. Headless machines, such as cluster nodes, often have no Secret Service, so they would use the fallback file under either option (the agent's understanding, *unverified*).

Evidence: [[Hosted Service - Strand B5 Prior Art and Security]], F8, F9 and F11.
