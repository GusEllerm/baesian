---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How the docs install the CLI: npm install -g baesian (B-n15wk)."
created: 2026-11-10
updated: 2026-11-10
tags:
  - baesian
  - decision
aliases:
  - B-n15wk
card: B-n15wk
revision: 1
title: How the docs install the CLI
question: Once it's on npm, do the README and setup guide install Baesian's command line globally, or run it through npx with nothing installed?
answer: npm install -g baesian
response: accept
not_chosen:
  - npx baesian, nothing installed
answered: 2026-11-10T21:07:46.240Z
answered_by: GusEllerm
topic: release/install/cli
deck: release-v1
level: blocking
reverse: moderate
touches:
  - user-facing
  - infra
filed: 2026-11-10T21:06:52.874Z
filed_by: claude-code
branch: v1/next
---

# How the docs install the CLI

Once it's on npm, do the README and setup guide install Baesian's command line globally, or run it through npx with nothing installed?

**Decided:** npm install -g baesian, the agent's pick. Then the docs' first step installs it once; the git hooks, the plugin and agents find `baesian` on PATH as they do under `npm link` today; updating is the same command; the hooks' fallback points at the installed copy.

**Not chosen:** npx baesian, nothing installed. Then the docs run `npx baesian init`; the hooks it commits, the plugin and AGENTS.md call `npx --yes baesian@<version>` instead of `baesian`; nothing to install, but a run may fetch from npm, and offline it needs a cached copy.

**It turned on:** Should Baesian work on a machine where nothing was installed first? (a preference) No: install it once: npm install -g baesian. Yes: npx baesian, nothing installed.

**The fact given:** The commit gate runs from git's hooks, outside any agent session. They run `baesian` from PATH, else the fallback `baesian init` recorded: the path of the script that ran it. Run through npx, that path is in npm's cache (~/.npm/_npx/), which npm may clear. The plugin's hooks and MCP server, and agents' own commands, also run `baesian` from PATH. Under nvm a global install belongs to one Node version.

**The agent's case:** The gate, the plugin and agents each need a `baesian` they find every time, offline and fast; npx gives neither, and would change every committed hook. A one-line global install is how people already install Claude Code and Codex.

Answered by GusEllerm on 2026-11-10, through Baesian (card B-n15wk, revision 1). Filed by claude-code on v1/next, in the deck “Publishing v1: npm, the plugin, what v1 promises, and the formats review”. Context: [[Release v1]].

The record is in `.baesian/cards/B-n15wk/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Part of M10's plan, [[Release v1]], sections "Publishing the CLI to npm" and "The docs". Today the docs build the CLI from a clone (`npm run build && npm link`). `baesian ci` prints `npx baesian verify` for CI, which is a separate question (which version CI runs), on its own card.
