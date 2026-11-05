---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Finding merges brought in by a rebase: Add post-rewrite too (B-vepz7)."
created: 2026-11-05
updated: 2026-11-05
tags:
  - baesian
  - decision
aliases:
  - B-vepz7
card: B-vepz7
revision: 1
title: Finding merges brought in by a rebase
question: Should Baesian install a fifth git hook, post-rewrite, so merges that arrive through `git pull --rebase` or a rebase are found too, besides post-merge (D181)?
answer: Add post-rewrite too
response: accept
not_chosen:
  - Only post-merge, as D181 says
answered: 2026-11-05T18:06:10.966Z
answered_by: GusEllerm
topic: gate/merge-hooks/rebase
deck: branch-worktree-agent-a56f7ec7e09c52e0d
level: provisional
reverse: cheap
touches:
  - infra
  - user-facing
filed: 2026-11-05T17:56:01.896Z
filed_by: claude-code
branch: worktree-agent-a56f7ec7e09c52e0d
---

# Finding merges brought in by a rebase

Should Baesian install a fifth git hook, post-rewrite, so merges that arrive through `git pull --rebase` or a rebase are found too, besides post-merge (D181)?

**Decided:** Add post-rewrite too, the agent's pick. Then `baesian init` installs five hooks, post-merge and post-rewrite beside the three today; after a rebase (and `git pull --rebase` with local commits) the merges it brought from upstream are recorded at once. One more committed file in `.githooks/`, its standard input left for the repo's own lines.

**Not chosen:** Only post-merge, as D181 says. Four hooks. A `git pull --rebase` that has local commits to replay runs post-commit for each, on a detached HEAD, and never post-merge, so merges made upstream that it brings aren't recorded on that machine; another machine that pulls with a merge or a fast-forward finds them.

**It turned on:** Do you, or the people whose repos use Baesian, pull with `--rebase` (or `pull.rebase = true`)? Yes, often: Add post-rewrite too. Rarely: Only post-merge, as D181 says.

**The fact given:** git runs post-merge after a merge or fast-forward, `git pull --rebase` with nothing local to replay included (checked on git 2.56); a rebase that replays commits runs post-commit per commit and post-rewrite once at the end, never post-merge. Each hook is a file in the repo's committed `.githooks/`, with Baesian's marked block first.

**The agent's case:** pull.rebase is a common setting, and without post-rewrite a project whose machines all pull that way would show few merges on the website. The hook only looks at what the rebase brought, quickly, and records nothing else; it's built and tested, and removing it later is deleting a file.

Answered by GusEllerm on 2026-11-05, through Baesian (card B-vepz7, revision 1). Filed by claude-code on worktree-agent-a56f7ec7e09c52e0d, in the deck “Decisions on worktree-agent-a56f7ec7e09c52e0d”.

The record is in `.baesian/cards/B-vepz7/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Built on the branch with D181, as the agent's pick: `HOOKS` in `src/hookblock.ts`, the `post-rewrite` case in `runHook` (src/hooks.ts), and its tests in test/hooks.test.ts (installed into an existing hooks folder; a rebase leaves its standard input to the repo's own lines). After an amend it does nothing. Choosing "Only post-merge" removes it from `HOOKS` and the case; repos that ran `baesian init` would keep the file until they delete it.
