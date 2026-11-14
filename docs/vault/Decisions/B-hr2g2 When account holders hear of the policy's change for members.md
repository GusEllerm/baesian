---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "When account holders hear of the policy's change for members: The day before (B-hr2g2)."
created: 2026-11-14
updated: 2026-11-14
tags:
  - baesian
  - decision
aliases:
  - B-hr2g2
card: B-hr2g2
revision: 1
title: When account holders hear of the policy's change for members
question: How long before the first release with members should every account holder be emailed what the privacy policy will then say?
answer: The day before
response: alternative
not_chosen:
  - A week before
answered: 2026-11-14T14:35:11.226Z
answered_by: GusEllerm
topic: hosted/privacy/members-notice
deck: reviewers-privacy
level: hard
reverse: one-way
touches:
  - privacy
  - publishes
  - user-facing
filed: 2026-11-14T05:04:38.752Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-av0wb What the first release with members includes|B-av0wb]]"
---

# When account holders hear of the policy's change for members

How long before the first release with members should every account holder be emailed what the privacy policy will then say?

**Decided:** The day before, the alternative. Then you email every account holder, and tag the release the next day; the policy's new lines are dated that day.

**Not chosen:** A week before, the agent's pick. Then you email every account holder, then tag the release no sooner than seven days later; the policy's new lines are dated the release's day. The docs and the release's checks fill the week.

**It turned on:** Should account holders have time to read the change, and delete their account if they object, before anything new is kept? (a preference) Yes, time to act: A week before. No, notice is enough: The day before.

**The fact given:** The policy promises: “If a change affects what's kept or why, account holders are emailed before it takes effect.” It names no period. With members, the service newly keeps, for every project, whom each card was sent to, each person's latest heartbeat for a day, and which person was told of which card; for a project of one these name only its one person. For a project with members it also keeps who they are and the links to join it, and shows each member's answers to the others. Nothing is shown to anyone new until someone joins a project. The service can't email every account holder itself: you'd send it, to the addresses in the accounts database. B-av0wb holds the release until the policy is done.

**Comment:** "I also dont think we have users yet do we?"

**The agent's case:** The promise reads as a chance to act, and a week is about the shortest notice that gives one. Someone who objects can read the change, write to privacy@, or delete their account before their records change. It costs little, since the docs and the release's checks take part of that week anyway.

**Wrong if:** Every account holder is you, or someone you've already told, so a week's notice holds the release back for nobody. **To check:** Count the accounts in the accounts database (D1 `baesian-accounts`), and see whose they are.

Answered by GusEllerm on 2026-11-14, through Baesian (card B-hr2g2, revision 1). Filed by claude-code on v1/next, in the deck “The privacy policy, for members”. Context: [[Privacy Policy]], [[Several Reviewers]].

The record is in `.baesian/cards/B-hr2g2/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The policy's new lines are the same whichever is chosen. They're dated the release's day. You'll see the whole page before the release.

**The policy's new lines, section by section.** Each one is checked against the code.

- **In short**, a new line: in a project you share, its other members see your handle and what you answer in it, as you see theirs.
- **What it keeps, your projects:**
  - Who a project's members are: each one's account, whether they're an owner, when they joined, and which owner's link they joined by.
  - A link to join: only a one-way hash of its code, who made it, when it expires, and who used it and when. No address is kept.
  - Whom each card was sent to, and who passed one on.
  - Each member's latest heartbeat at the desk, kept a day, so each is told of their own cards only when they're away.
- **Notifications**, a new line: which member was told of which card, until no one is still to be told of it.
- **Projects you share**, a new section:
  - What the other members see of you: your handle, your role and when you joined; every answer you give, with what you chose before seeing the agent's pick, what you wrote, and whether on a phone or a desktop; whom each card was sent to; and that someone is at the desk, not who.
  - Their machines are sent the project's cards and answers, with the name of the machine that uploaded each, and keep them in the repository's record.
  - An owner can remove you, and you can leave.
- **Why it's allowed to:** showing what you do in a shared project to its members is part of the service you signed up for (contract).
- **How long it's kept**, new rows:
  - Members: until they leave or are removed.
  - A link to join: until a day after it's used or expires.
  - Whom a card was sent to: as long as the card's text.
  - Heartbeats: a day.
  - Who was told of a card: until no one is still to be told of it.
- **Who else handles it:** "Nobody else" becomes "Nobody else, beyond the members of a project you share".
- **Deleting your account:**
  - "Every project you own" becomes "every project you made, for every member of it", which is what the code does.
  - In a project you joined, what's yours alone goes. Your answers on its cards stay, with your handle, until each card's text goes.
  - Handing a project on to someone else is a later card.
- **Security:** "unless its owner asks" becomes "unless one of its owners asks".
- **In your browser**, a new line: while you sign up or sign in from a link to join, the link's code is kept in that tab until you've joined.

**The email, drafted for you to send.**

> Subject: Baesian's privacy policy changes on [date]
>
> Baesian's hosted service is adding projects with several members, and its privacy policy changes on [date] to say what that keeps.
>
> - In a project you share, its members see your handle and your answers, as you see theirs. Nothing is shared until you join someone's project or add someone to yours.
> - For every project, the service will note whom each card was sent to, each person's latest visit for a day, and who was told of which card.
> - A link to join a project is kept, as a hash, until a day after it's used or expires.
>
> The new text is on GitHub: [link]. Write to privacy@baesian.dev with any question; you can delete your account at any time on your account page.
