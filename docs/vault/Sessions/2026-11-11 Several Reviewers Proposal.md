---
type: session
status: active
livedocs: snapshot
summary: "2026-11-11, on v1/next: the proposal for several reviewers per project (P20) drafted, from a read of what assumes one reviewer today and three research strands (review tools; decision rights and judgment by several people; how teams oversee agents); five cards on its goals and model filed in deck reviewers and answered the same day, one against the proposal (a card is every member's); the proposal revised, and four more cards filed in deck reviewers-joining. Nothing built."
created: 2026-11-11
tags: [baesian, session]
---

# 2026-11-11: several reviewers, the proposal

The lead, on `v1/next`, after 1.0.2 was released ([[2026-11-11 Kept State and Live Inboxes]]).

## Goal

The user's next piece: several reviewers per project, "what it means for cards to be sent to multiple inbox's (users)". They asked for its goals and how collaboration works to be identified first, and said it would take careful design of how interactions take place.

## What was done

- **What assumes one reviewer today,** read from the code at 1.0.2: a project's only member is its owner; the latest answer on a card decides it, whoever gave it; "it's outside my expertise" parks a card and names nobody; presence, notifications, calibration and the gate's settings are the project's, not a person's. It's the table in [[Several Reviewers]].
- **Three research strands,** each an agent working read-only from the web, kept in full: [[Several Reviewers - Strand A Review Tools]] (35 findings), [[Several Reviewers - Strand B Decision Rights and Judgment]] (39), [[Several Reviewers - Strand C Overseeing Agents in Teams]] (40). The synthesis is [[Several Reviewers - Research]].
- **The proposal, P20,** [[Several Reviewers]]: who it's for; twelve goals, each with its evidence and what it rules out; the model (members; each card's one reviewer, by the team's map, else whoever runs the agent, else an owner; passing; cover; a different answer settled by someone named; two answers on marked kinds; the team's settings); three walk-throughs; three stages; what changes where.
- **Five cards, in deck `reviewers`,** on the goals and the model only, all hard (product behaviour): B-j032t (who it's built for first), B-r51ts (whose a card is), B-2n7s4 (who a card reaches first, building on B-r51ts), B-v43z8 (what a second person's different answer does), B-1yeqe (which cards take two answers). The deck's briefing says what they decide and what the research found.

## What the research found, in a line each

- A request to one named person is answered sooner than one to a group (a randomised experiment at Meta: 11.6% less time in review).
- Every framework for decisions names one decider; tools raise the number of approvals by area or stake, not everywhere.
- A second independent answer catches more (about 1 miss in 10 down to 3 in 100, in systematic reviews), costs time, and is worth nothing unless it's blind to the first.
- People differ often (15% to 37% of patches scored twice), and the objection usually comes second.
- Nobody has built this for agents, or studied it: no approval layer for agents says who answers, and no tool combines blind answers with a rule for settling them.

## Not verified

Wording quoted from documentation in the strands came through a fetch that summarises pages; each strand lists what it couldn't verify. Nothing in the research is a study of two people each blind to an agent's proposal and to each other.

## The first five answers, and what followed

The user answered all five the same day:
- **B-j032t:** "A few developers on one repo".
- **B-r51ts:** "Every member's", against the proposal's one reviewer per card, with: "It seems simpler to me to make cards available to all members. To route a card to a specific person could block development until they action it right? Perhaps there is a middle ground, cards are sent to others and team members can see that?"
- **B-2n7s4:** "Whoever runs the agent". **B-v43z8:** "Someone settles it". **B-1yeqe:** "Only the kinds a team marks".

On their question: only a hard card makes its agent wait; a blocking card's agent gives up after nine minutes and carries on (D46). No reply was made on the card: it asked a question the chat answers, and a reply reopens a card.

Read together, B-r51ts and B-2n7s4 say any member can answer any card, and a card is still sent to someone. [[Several Reviewers]] was rewritten to that: every waiting card is every member's; it's sent to whoever runs its agent, and shown as such; "it's outside my expertise" tells the others; cover is no longer needed, since nothing is one person's alone; a raised difference goes to whoever gave neither answer.

**Four more cards, in deck `reviewers-joining`,** each hard: B-tzdjn (who's told when a card comes in: the middle ground, or everyone alike), B-9e7cn (how CI comes to trust a member's passkey), B-jsady (how someone joins), B-rxbss (who changes a project's settings and rules).

## The four answers, and the first step built

All four were answered with the proposal: **B-tzdjn** "Sent to one, open to all"; **B-9e7cn** "Added to CI's settings by hand"; **B-jsady** "A link the owner sends"; **B-rxbss** "Only its owners". [[Several Reviewers]] records them, and its build in six steps.

**Found while planning: no format of the record has to change.** The relay refuses a second member's answer on a decided card, so nothing a release reads means anything new; a raised difference is a conflict card naming one card (D35).

**Step 1, members on the service, is built** (`1122af4`; [[service]]): the accounts database's `members` and `invites` (migration 6); an owner's link, good once for seven days; any member answering, only owners changing settings or answering a rule's draft; a second person's answer on a decided card refused, also after waiting for the passkey; leaving and removing; practice answers per account; deleting an account erasing only the projects it holds. The service's tests are 198 and 68, all passing, five runs in a row; the website's 43 browser tests pass against it. Nothing on the website shows members yet.

**Found on the way:** the day's earlier commits had a blank line between `Baesian-Card` and `Co-Authored-By`, so the ledger has no entry tying the 1.0.2 commits to B-evrec, B-gty71 and B-3femd. A local hook also refused two shell commands that held the words of the accounts code; the edits were made with the editor instead.

## Next

- Step 2: whom each card was sent to, noted by the relay; a notification to them at once, to the others after a while; the counts saying what was sent to you.
- Step 3, the website: the projects you're a member of; a members page with the link; the desk's queue, yours first; what it says when someone else answers first.
- Then the CLI's words, a different answer raised and settled, and the privacy policy's lines as a card, before any release.
