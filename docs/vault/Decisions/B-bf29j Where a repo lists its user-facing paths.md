---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Where a repo lists its user-facing paths: In the committed config (B-bf29j)."
created: 2026-11-06
updated: 2026-11-06
tags:
  - baesian
  - decision
aliases:
  - B-bf29j
card: B-bf29j
revision: 1
title: Where a repo lists its user-facing paths
question: Where should a repo list the paths whose edits bring Baesian's user-facing reminder?
answer: In the committed config
response: accept
not_chosen:
  - In the preference files
answered: 2026-11-06T03:45:09.927Z
answered_by: GusEllerm
topic: agents/user-facing-paths
deck: branch-v1-next
level: provisional
reverse: cheap
touches:
  - schema
filed: 2026-11-06T03:39:12.130Z
filed_by: claude-code
branch: worktree-agent-a68aef9ae1c20d6c8
depends_on:
  - "[[B-qrdhh Holding agents to filing cards|B-qrdhh]]"
---

# Where a repo lists its user-facing paths

Where should a repo list the paths whose edits bring Baesian's user-facing reminder?

**Decided:** In the committed config, the agent's pick. Then a `user_facing` list of globs goes in `.baesian/config.json` (the clone's own config in personal mode), with no built-in list; agents and people set it in a commit, as they set the vault's folder, and the plugin's hook reads it at each edit.

**Not chosen:** In the preference files. Then a `gate_user_facing` list sits beside the gate's own path lists, with no built-in list, set only by you in the client's "What the gate looks for"; agents can't change it, and that panel gains a row.

**It turned on:** Should agents be able to change which paths count as user-facing, or only you? (a preference) Agents may, in a commit: In the committed config. Only me, in the client: In the preference files.

**The fact given:** Today the list only adds a one-line reminder to an agent's edits; it never blocks a commit. The gate's own path lists moved to the preference files in B-qkek1, because agents edit the committed config and could make the gate see less. If the gate later checks user-facing paths at commit (step 3 in the research behind B-qrdhh), the list it reads would need to be one only you set.

**First chose:** In the preference files, then switched once the agent's pick was shown.

**The agent's case:** A reminder that never blocks can't be weakened in a way that matters: an agent that wants to skip it can already ignore it. In the committed config, agents set the list as they build an interface, it shows in review, and the client needs no new row now. If a gate check on these paths follows, its list moves to the preferences then, beside the gate's other lists.

**Wrong if:** a gate check on user-facing paths is wanted soon, since the list would then move, and agents would have set lists you never saw.

Answered by GusEllerm on 2026-11-06, through Baesian (card B-bf29j, revision 1). Filed by claude-code on worktree-agent-a68aef9ae1c20d6c8, in the deck “Decisions on v1/next”.

The record is in `.baesian/cards/B-bf29j/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Background. B-qrdhh decided that edits to paths the repo calls user-facing get a one-line reminder from the plugin's PreToolUse hook, and left where the paths are declared open.

**Defaults.** Neither option has a built-in list. A file type doesn't tell an interface from a library: a `.tsx` file may be a test helper, and a CLI's help text lives in `.ts`. A reminder on every edit of a common type, in a repo with no interface, would nag, and nagging is the risk the research named. A repo with nothing declared gets no reminder.

**This repo**, under the pick: the client's and the website's components and styles (`client/src/**/*.tsx`, `client/src/**/*.css`, `client/index.html`), the command line's output and help (`src/cli.ts`, `src/style.ts`), and the emails the service sends (`service/src/mail.ts`).

**What the hook does** either way: once a session for each file, it adds "this file is user-facing: a decision here goes to the person as a card; a change that only restores a decision cites it". It never blocks. Codex's `apply_patch` gets the same reminder, from the files its patch names.
