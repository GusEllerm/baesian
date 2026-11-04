---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Where a project's name is kept: You name it, on the service (B-zqkwk)."
created: 2026-11-04
updated: 2026-11-04
tags:
  - baesian
  - decision
aliases:
  - B-zqkwk
card: B-zqkwk
revision: 1
title: Where a project's name is kept
question: Should a project's name be one you type when you approve its first machine, kept on the service, or a label kept only in each of your browsers?
answer: You name it, on the service
response: accept
not_chosen:
  - Only in your browsers
answered: 2026-11-04T16:50:03.179Z
answered_by: Gus Ellerm
topic: hosted/project-names
deck: hosted
level: hard
reverse: moderate
touches:
  - privacy
  - user-facing
filed: 2026-11-04T16:49:40.729Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-mjf3g What a phone notification says|B-mjf3g]]"
  - "[[B-nk97q What builds the service's web pushes|B-nk97q]]"
  - "[[B-62qnz How a repo is linked to the service|B-62qnz]]"
---

# Where a project's name is kept

Should a project's name be one you type when you approve its first machine, kept on the service, or a label kept only in each of your browsers?

**Decided:** You name it, on the service, the agent's pick. The page that approves a project's first machine asks what to call it, and you can rename it on the website. The service keeps the name with the project, and every device and notification shows it. The CLI never sends the repo's name.

**Not chosen:** Only in your browsers. The service knows a project only by its random ID. Each browser or phone you use asks you to name a project the first time it shows it, and keeps the label to itself; notifications get the name from it as they're shown.

**It turned on:** Is a name you type yourself all right for the service to hold, given it never collects repo names? (a preference) Yes, I chose it: You name it, on the service. No, keep it local: Only in your browsers.

**The fact given:** The service never collects repo names or URLs (Hosted Service section 6), and knows a project by a random ID like p-7f3kq… (M9d). Notifications say counts and levels only, like "2 cards waiting in baesian (1 hard)" (B-mjf3g). The service builds and sends each push (B-nk97q), and a phone's notification code can look up a label it holds before showing one. With names only in browsers, each new device starts with IDs until you name them there. A typed name is data you give the service, and would be listed on its public page of what it holds.

**The agent's case:** One name, typed once, works on the phone, the desktop and in notifications, and it's a name you chose, not one read from your repo. Keeping it off the service would mean naming every project again on every device.

**Wrong if:** People type their repo's real name, so the service ends up holding repo names anyway, or you'd rather no device but yours knew what a project is. **To check:** When you link this repo, note what you'd call it, and whether that's its repo name.

Answered by Gus Ellerm on 2026-11-04, through Baesian (card B-zqkwk, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-zqkwk/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The website needs a name to show for each project, on its list of projects, its pages and its notifications. The repo's own name is the obvious one, and the one the service has promised not to collect, so either you type a name or no name leaves your devices.

**The option also considered.** `baesian login` could send the repo's folder name as a suggestion for the approval page, where you could change it. It's the most convenient, and it means the service learns repo names by default.
