---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Branch names on the service: Correct the policy: branch names are kept (B-nkbqs)."
created: 2026-11-05
updated: 2026-11-05
tags:
  - baesian
  - decision
aliases:
  - B-nkbqs
card: B-nkbqs
revision: 1
title: Branch names on the service
question: The privacy policy says branch names never reach the service, but every card carries the branch it was filed on. Which should change, the policy or what's sent?
answer: "Correct the policy: branch names are kept"
response: accept
not_chosen:
  - Stop sending branch names
answered: 2026-11-05T16:38:02.238Z
answered_by: GusEllerm
topic: hosted/privacy/branch-names
deck: branch-v1-next
level: hard
reverse: moderate
touches:
  - privacy
  - publishes
  - user-facing
filed: 2026-11-05T16:36:32.707Z
filed_by: claude-code
branch: v1/next
---

# Branch names on the service

The privacy policy says branch names never reach the service, but every card carries the branch it was filed on. Which should change, the policy or what's sent?

**Decided:** Correct the policy: branch names are kept, the agent's pick. The privacy page and its note say each card carries the name of the branch it was filed on, kept with the card's text and deleted with it on the same schedule. The website can show your cards by branch.

**Not chosen:** Stop sending branch names. The CLI replaces a card's branch with a stand-in before it goes up (a hash, or nothing), and the policy stays as written. The website can group cards by branch only as unnamed lanes, and the names are shown on your machine alone.

**It turned on:** Are branch names something you'd keep from the service, the way you keep the code? (a preference) No: Correct the policy: branch names are kept. Yes: Stop sending branch names.

**The fact given:** The live policy (client/src/site/Privacy.tsx, 'What it doesn't keep') says: 'Your repository: its code, branches, file paths and name never reach the service. Only what an agent writes in a card does.' Each card file carries `source_branch`, written by the CLI, and the relay keeps card files. Branch names can say what's being worked on (feat/acquisition-talks). Gate records carry no paths. The policy promises an email before a change to what's kept or why; this would correct what it says, not change what's kept.

**The agent's case:** Branch names are useful on the service (lanes by branch, which branch an answer goes to) and rarely sensitive, and the honest fix is quick: the page should say what the code does. Agents can be told to keep sensitive names out of branch names, as they're told about secrets.

**Wrong if:** Some users' branch names carry customer or project names they couldn't send to a third party. **To check:** Whether the hosted service's design notes (Hosted Service, Privacy Policy) listed source_branch among what's kept, and how retention treats card metadata.

Answered by GusEllerm on 2026-11-05, through Baesian (card B-nkbqs, revision 1). Filed by claude-code on v1/next, in the deck “Decisions on v1/next”.

The record is in `.baesian/cards/B-nkbqs/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Found 2026-11-05 while sizing a website view of decisions by branch (the README's branches figure, drawn from a project's own cards). Whichever way this goes, the policy's sentence is wrong today and gets corrected; this card decides in which direction.
