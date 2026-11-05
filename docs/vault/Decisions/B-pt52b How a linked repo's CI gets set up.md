---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How a linked repo's CI gets set up: A `baesian ci` command (B-pt52b)."
created: 2026-11-05
updated: 2026-11-05
tags:
  - baesian
  - decision
aliases:
  - B-pt52b
card: B-pt52b
revision: 1
title: How a linked repo's CI gets set up
question: Should Baesian have a command that sets up CI's `baesian verify` for a linked repo, or should the docs list the steps?
answer: A `baesian ci` command
response: accept
not_chosen:
  - A setup page in the docs
answered: 2026-11-05T13:16:36.035Z
answered_by: GusEllerm
topic: hosted/ci-setup
deck: setup
level: hard
reverse: moderate
touches:
  - public-api
  - user-facing
  - security
filed: 2026-11-05T13:13:41.012Z
filed_by: claude-code
branch: v1/next
---

# How a linked repo's CI gets set up

Should Baesian have a command that sets up CI's `baesian verify` for a linked repo, or should the docs list the steps?

**Decided:** A `baesian ci` command, the agent's pick. Then `baesian ci` syncs, then prints `BAESIAN_TRUST`'s lines (the service's key, and each passkey key the service signed, from what it just pulled, never from the committed record), the service it read them from, and the workflow steps to paste. With `--github` it sets the repo variable through `gh` after showing it. You run it again after adding a passkey.

**Not chosen:** A setup page in the docs. Nothing new to build or keep safe. You copy the service's key from `.git/baesian/trust/` and each passkey's line from where the website showed it, write the workflow steps from the page, and set the variable, as this repo's setup took.

**It turned on:** Is a key a command copies from the service as trustworthy as one a person copies from the website? Yes: A `baesian ci` command. No: A setup page in the docs.

**The fact given:** CI pins keys outside the repo so a commit can't add one that passes forged answers (D142, D159). Either way, every key comes from the service: its own over HTTPS, and passkey keys it signed. The service's address comes from the repo's config, which a commit can change with an ack.

**The agent's case:** Both routes read the same service. The command removes the copying, the hunt for two lines in two places, and the ordering trap: an unset variable reaches verify empty and fails CI, by design. Printing the service it used, and the passkey lines for you to compare with your own, keeps the person's check.

**Wrong if:** The command can be pointed at another service than the one you meant, and nobody notices before the keys are pinned. **To check:** Whether it prints the service it read the keys from; try it with the config edited to another address.

Answered by GusEllerm on 2026-11-05, through Baesian (card B-pt52b, revision 1). Filed by claude-code on v1/next, in the deck “Setting up a repo with the hosted service”.

The record is in `.baesian/cards/B-pt52b/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

This repo's setup on 2026-11-05, for comparison: edit both verify steps in `ci.yml` to pass `BAESIAN_TRUST: ${{ vars.BAESIAN_TRUST }}`; read `.git/baesian/trust/service-relay-1.json` and the passkey key file, put each on one line; compare the passkey line with the copy saved at sign-up; `gh variable set BAESIAN_TRUST < file`; all before `main`'s next push.

With the card on how CI knows the repo's project (same deck), the pin gains a line naming the project, which the command would print too.
