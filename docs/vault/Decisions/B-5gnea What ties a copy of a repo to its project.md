---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "What ties a copy of a repo to its project: The project ID and the repo's first commit (B-5gnea)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-5gnea
card: B-5gnea
revision: 1
title: What ties a copy of a repo to its project
question: Should the CLI treat any checkout whose config names a project as that project, or also check the repo's first commit, so template copies get their own?
answer: The project ID and the repo's first commit
response: accept
not_chosen:
  - The project ID alone
answered: 2026-11-03T16:51:07.107Z
answered_by: Gus Ellerm
topic: hosted/repo-identity
deck: hosted
level: hard
reverse: moderate
touches:
  - schema
  - security
  - user-facing
filed: 2026-11-03T15:26:49.098Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-84e0d What one machine sign-in covers|B-84e0d]]"
  - "[[B-9tk9m How people sign up and sign in|B-9tk9m]]"
---

# What ties a copy of a repo to its project

Should the CLI treat any checkout whose config names a project as that project, or also check the repo's first commit, so template copies get their own?

**Decided:** The project ID and the repo's first commit, the agent's pick. Linking writes the repo's first commit into the config beside the project ID; a checkout whose history starts elsewhere, such as a template copy, stops syncing and asks to link its own project. Forks and mirrors keep both.

**Not chosen:** The project ID alone. Any checkout whose config names the project is that project, if its person is a member. A copy you make from a template keeps syncing into the original's project, mixing their cards, answers and rules, until someone relinks it by hand.

**It turned on:** Will you, or the teams using Baesian, start new repos by copying a hosted one, from a template or otherwise? Yes, sometimes: The project ID and the repo's first commit. Rarely: The project ID alone.

**The fact given:** The project ID in .baesian/config.json is committed and isn't secret (P16 section 8). A GitHub fork keeps the whole history; a repo made from a GitHub template starts with a single new commit. Someone else's fork can't use the project: their machine needs a grant from a member's sign-in (B-84e0d). A copy of yours in the same project would pull the original's cards and answers into its live layer, and the original's rules into its record, where its gate applies them (the agent's reading of P15 and Store.syncRecord, untested). Shallow clones can't see the first commit, so they would skip the check.

**The agent's case:** Copying a repo to start another is common and the mix-up is silent. The first commit tells a copy from a clone cheaply, sends no repo name or URL to the service (P15 section 6), and leaves forks and mirrors, which are the same repo, alone.

**Wrong if:** History rewrites or merged unrelated histories change the first commit often enough that people relink out of habit, or most agents' checkouts are shallow, so the check rarely runs. **To check:** In dogfooding, count relink prompts and their causes; check whether Claude Code's and Codex's cloud checkouts are shallow.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-5gnea, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-5gnea/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

P15 left this open ([[Hosted Service]], "Open questions": "is a random project ID in the committed config enough? Forks and mirrors would share it"); [[Formats for v1]] lists it too. Each kind of copy, under the two options:

| Copy | What it shares | The project ID alone | With the first commit |
|---|---|---|---|
| a second clone, or a worktree | everything | same project | same project |
| a mirror (the same history on another host) | history and config | same project | same project |
| your own fork | history and config | same project | same project |
| someone else's fork | history and config | refused: not a member (B-84e0d) | refused: not a member |
| a GitHub template copy | files, not history | same project, silently | asked to link a new project |
| files copied into a fresh `git init` | files | same project, silently | asked to link a new project |

**Details of the first option** (the agent's design, not built):
- *What's recorded:* a new `Config` field beside `service` and `project` (P16 section 8), set when the repo is linked. Formats are still free before v1 (D108).
- *How it's read:* `git rev-list --max-parents=0 HEAD` lists every root commit; the check passes if the recorded one is among them, so merged unrelated histories still pass.
- *Shallow clones:* Git treats a shallow clone's boundary commits as roots ("grafts are introduced pretending that these commits have no parents", Git's shallow docs), so the CLI skips the check when `git rev-parse --is-shallow-repository` says true.
- *History rewritten from the first commit* (filter-repo, say) changes it, and the CLI asks to relink or to update the recorded commit.
- *A relink* writes a new project ID, so a pull request from a relinked copy carries a config change; hosted/service-address-fact asks whether that change is a gate fact.

**Why not the remote's URL:** a mirror has a different URL though it's the same repo, URLs change when a repo is renamed or moved, and the service would hold repo URLs, which P15 section 6 lists among what it never collects.

Sources: GitHub, "Creating a repository from a template" <https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template> ("starts with a single commit"); Git, "shallow" <https://git-scm.com/docs/shallow>. Both read 2026-11-03.
