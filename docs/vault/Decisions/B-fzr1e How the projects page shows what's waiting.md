---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How the projects page shows what's waiting: Projects, each with an inbox (B-fzr1e)."
created: 2026-11-11
updated: 2026-11-11
tags:
  - baesian
  - decision
aliases:
  - B-fzr1e
card: B-fzr1e
revision: 1
title: How the projects page shows what's waiting
question: Should the projects page keep calling them projects and give each an inbox, with an inbox icon and how many cards wait for you, or rename them inboxes?
answer: Projects, each with an inbox
response: accept
not_chosen:
  - Rename them inboxes
answered: 2026-11-11T03:41:07.566Z
answered_by: GusEllerm
topic: website/projects-as-inboxes
deck: projects-page
level: hard
reverse: cheap
touches:
  - user-facing
filed: 2026-11-11T03:32:32.568Z
filed_by: claude-code
branch: v1/next
---

# How the projects page shows what's waiting

Should the projects page keep calling them projects and give each an inbox, with an inbox icon and how many cards wait for you, or rename them inboxes?

**Decided:** Projects, each with an inbox, the agent's pick. Then the page stays "Your projects"; each row gets an inbox tray icon, holding a count when cards wait for you ("3 waiting for you, 1 hard") and empty when none do ("Nothing waiting"); rows keep their order; the command line, docs and addresses keep saying project.

**Not chosen:** Rename them inboxes. Then the page becomes "Your inboxes", each row the inbox of a project, named after it, with the same icon and count; the command line, docs and addresses still say project, so the site and the command line use two words for one thing.

**It turned on:** Is an inbox what each project has, or what each project is? (a preference) What it has: Projects, each with an inbox. What it is: Rename them inboxes.

**The fact given:** The site, the command line (baesian login links a repo to a project), the docs and the addresses (/projects/...) all say project. A project is one repo linked to the service, with its record of decisions and its cards. Today the projects page lists each project's name, when it was linked, and a Rename button, and says nothing of what's waiting.

**Answered in chat first:** "perhaps there is some iconography that could help a user understand these are effectively inbox's for different projects", which the agent filed as its pick.

**The agent's case:** Your words: iconography that shows each project's cards are an inbox for you, rather than a new name. One word for one thing across the site, the command line and the docs, and the icon carries the inbox.

Answered by GusEllerm on 2026-11-11, through Baesian (card B-fzr1e, revision 1). Filed by claude-code on v1/next, in the deck “What the projects page shows of each project's waiting cards”.

The record is in `.baesian/cards/B-fzr1e/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The icon is a tray with an open front, drawn in the site's ink, filled with the count in a small badge when cards wait, and hard ones marked as the desk marks them. The count comes from the card on where the projects page gets its waiting counts.
