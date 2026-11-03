---
type: review
status: active
summary: "A privacy and security review before release, overnight on 2026-11-03: what the committed record exposes, and the local server, hooks, notifications and rendering. The local server holds up; the real exposures are free text committed with the code, versioned hooks, and agents that can act as the user."
created: 2026-11-03
tags: [baesian, review, security, privacy]
---

# Privacy and security review, 2026-11-03

Steps E1 and E2 of [[2026-11-03 Overnight]]: a read of the code as it stands on the branch `overnight/2026-11-03`, before v1 and before the hosted service (D127–D132), which changes the picture and has its own design ([[Hosted Service]]). One clear bug was fixed; the rest are findings, with what to do about them.

## E1: what the committed record exposes

The record (`.baesian/`) is committed and pushed with the code, so whoever can read the repo can read it. Field by field:

- **Names:** each verdict's `reviewer` is git's `user.name`, already in the commit history; `source_agent` is a harness name (`claude-code`, `codex`) or what `BAESIAN_AGENT` says; ledger entries and decks name branches. Nothing new beyond what git already shows, except branch names a card was filed on that were never pushed.
- **Machine details:** none left. Cards and attachments no longer record folders (D105, D121), a deck made from a plan outside the repo drops the plan's path, and the server file with its token stays in the live layer, readable only by you (`0600`).
- **Free text is the exposure.** Card fields (`doing`, `crux_fact`, `rationale`, the body), reviewer comments, rule wording and deck briefings are written freely and committed as written:
  - agents paste what they're looking at: error output, file paths with a username in them, URLs, and sometimes a secret;
  - a deck made from an approved plan (the plugin's plan hook) commits the whole plan;
  - the reviewer's comments are candid ("I think users will not want to…"), and they become part of a public repo's history, permanently.

**Recommendations:**
1. **Warn on likely secrets at filing:** `baesian file` could add a warning, as it does for long fields, when a field matches common token patterns (API keys, private-key headers, `token=` in a URL). It's cheap and two-way; a block would be a card.
2. **Say it where people decide:** the README and the `AGENTS.md` block should say the record is committed, so agents shouldn't paste secrets or output into cards, and reviewers' comments are public in a public repo.
3. **For public repos, a real choice for the user:** commit the decision record in full (today), or commit only the outcome (the question, the options and the answer) and keep the rest in the live layer or on the hosted service. It touches privacy and publishing, so it's a card: **B-vqn69** (hard, deck `release`), best settled with the hosted service's design, since the relay (D127) already holds the full text.

## E2: security

### The local server: holds up

- Bound to 127.0.0.1, with a Host check that refuses DNS rebinding.
- A fresh 256-bit token each start, compared in constant time (`timingSafeEqual`), traded once for an `HttpOnly; SameSite=Strict` cookie named for the port, and dropped from the address bar; `Referrer-Policy: no-referrer`.
- Writes are JSON only, so a form on another site can't post, and there's no CORS; request bodies are capped at 64 KB; a verdict's fields are checked against a fixed list.
- Static files are resolved inside the client's build folder, so `..` can't escape it.
- A strict Content-Security-Policy (`default-src 'self'`, `frame-ancestors 'none'`), and the client renders card text through React, with no HTML injection and no links (`inline()` in `client/src/Prose.tsx` renders only bold and code).

### Findings

1. **Fixed: an argument could be read as an option on Linux.** OS notifications pass the card's question (agent-written) to `notify-send` as an argument; a question starting with `-` would have been read as an option. It now passes `--` first. On macOS the text already goes in as arguments to `osascript`, never into the script. The user's own `notify` command gets the card as JSON on stdin, never interpolated.
2. **Agents can act as the user (known, D62).** An agent runs as you, so it can read the server file's token and post a verdict, or write a verdict file into the live layer. "Only a person answers" is a convention here, which the hosted service could make enforceable if the website vouches for each answer and `baesian verify` checks it ([[Hosted Service]]).
3. **Versioned hooks run code from the repo.** `baesian init` points `core.hooksPath` at the committed `.githooks/` (D54), so a change to a hook in a branch runs on the machine of anyone who commits with that branch checked out: a pull request can reach a reviewer's machine this way. Every tool with versioned hooks shares this (livedocs does the same here). The fallback's `eval` itself is safe: its command comes from the clone's own git config, quoted when written. A card before v1: **B-7sjec** (hard, deck `release`): keep versioned hooks and gate changes to them, or install hooks into `.git/hooks` that run only the installed `baesian`, at the cost of each clone running `baesian init` to get them.
4. **Agent text reaches other agents.** Briefs and inbox lines carry other cards' titles and options into an agent's context (a parent decided otherwise, a conflict), so one agent's text can steer another. Low risk while every agent is the user's own; with several people on one hosted repo, cards from others are untrusted input, and the hooks should mark them as quoted data.
5. **The policy file will be editable by the agent.** Once preference sliders exist (D131), an agent that can edit the repo's preferences can lower its own gate. Settings should change only through accepted proposals, as [[Preference Sliders and the Gate]] recommends, with the gate reading settings the agent can't rewrite, for example from the hosted service or the last commit on the main branch.

### Not reviewed

The plugin's hooks under a hostile repo, beyond the above; `baesian verify` reading a hostile record in CI (it extracts with `git archive` into a temporary folder and parses with strict schemas, which bounds it); dependency supply chain (four runtime dependencies: `commander`, `smol-toml`, `yaml`, `zod`).
