---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How a repo is linked to the service: Login links it too (B-62qnz)."
created: 2026-11-04
updated: 2026-11-04
tags:
  - baesian
  - decision
aliases:
  - B-62qnz
card: B-62qnz
revision: 1
title: How a repo is linked to the service
question: Should `baesian login` also link a repo that isn't on the service yet, or should linking be a command of its own, `baesian link`?
answer: Login links it too
response: accept
not_chosen:
  - A separate baesian link
answered: 2026-11-04T15:56:14.424Z
answered_by: Gus Ellerm
topic: hosted/link-command
deck: hosted
level: hard
reverse: cheap
touches:
  - public-api
  - user-facing
filed: 2026-11-04T15:45:50.787Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-84e0d What one machine sign-in covers|B-84e0d]]"
  - "[[B-w4g6c Whether changing a repo's service address is a gate fact|B-w4g6c]]"
  - "[[B-5gnea What ties a copy of a repo to its project|B-5gnea]]"
  - "[[B-t5wxr The shape of the machine sign-in addresses|B-t5wxr]]"
---

# How a repo is linked to the service

Should `baesian login` also link a repo that isn't on the service yet, or should linking be a command of its own, `baesian link`?

**Decided:** Login links it too, the agent's pick. In a repo with no project, baesian login makes a project ID, writes the service and project into the config, and asks you to approve this machine for it. In a linked repo it only signs the machine in. One command to learn.

**Not chosen:** A separate baesian link. Then baesian link writes the service and project into the config; baesian login only signs a machine in, and in an unlinked repo says to run baesian link first. Putting a repo on the service is a step you take on its own.

**It turned on:** Should putting a repo on the service be a step of its own, apart from signing a machine in? (a preference) No, one step: Login links it too. Yes: A separate baesian link.

**The fact given:** Each machine's grant is for one project (B-84e0d), so signing in has to name a project. The service creates a project when its first machine is approved, owned by whoever approves it in their browser (M9c). Linking writes the service, the project and the repo's first commit (B-5gnea) into the committed config, a gate fact that needs a card or an ack (B-w4g6c); the command prints the ack. An agent can run either command; approval needs your browser and a passkey check.

**First chose:** A separate baesian link, then switched once the agent's pick was shown.

**The agent's case:** The first sign-in and the link happen together, and the approval page already says a project is being created, so a separate command adds a step without adding a check. The gate fact on the config change keeps linking visible in review.

**Wrong if:** People link repos by accident when they only meant to sign in, or need to link a repo from a machine that won't sign in. **To check:** While dogfooding, note each time login links a repo, and whether that was meant.

Answered by Gus Ellerm on 2026-11-04, through Baesian (card B-62qnz, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-62qnz/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Hosted Service section 2 says a project is "created on first use by `baesian init` in a signed-in shell, or by a new command that links an existing repo", and leaves the command open. M9c built the service side: the device flow takes the project ID and the machine's name, and approving it creates the project. `baesian logout` revokes this machine's grant and deletes its token either way.
