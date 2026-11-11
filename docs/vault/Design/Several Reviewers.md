---
type: design
status: draft
authority: specifies
summary: "P20, several reviewers per project, partly decided. The user's first five answers (2026-11-11): built first for a few developers on one repo (B-j032t); a card is every member's (B-r51ts, against the proposal's one reviewer per card); it reaches whoever runs its agent first (B-2n7s4); a second person's different answer is settled by someone, with both kept (B-v43z8); two answers only on the kinds a team marks (B-1yeqe). The model as revised by them, the goals and their evidence, three walk-throughs, three stages, what changes where, and the four cards open in deck reviewers-joining."
created: 2026-11-11
updated: 2026-11-11
tags: [baesian, design, hosted, reviewers]
---

# Several Reviewers

> **Status: a proposal (P20), partly decided (2026-11-11). Nothing is built.** The user asked for it after 1.0.2, saying it "is going to take some intelligent design around how interactions take place" and that "we also need to strongly identify the goals of the design and how collaboration works". The research is [[Several Reviewers - Research]], from three strands kept in full.
>
> **The first five cards (deck `reviewers`) were answered the same day,** four with the proposal and one against it:
> - **B-j032t**, "A few developers on one repo": built first for developers who each run their own agents; the map from kinds of decision to people comes second.
> - **B-r51ts**, "Every member's", *against the proposal's "One member's, by name"*: a card is every member's, and the first to answer decides it. The user: "It seems simpler to me to make cards available to all members. To route a card to a specific person could block development until they action it right? Perhaps there is a middle ground, cards are sent to others and team members can see that?"
> - **B-2n7s4**, "Whoever runs the agent": a card reaches the member running its agent first.
> - **B-v43z8**, "Someone settles it": a second person's different answer doesn't replace the first; someone settles it, and both stay.
> - **B-1yeqe**, "Only the kinds a team marks": one answer decides a card unless a team marks its kind.
>
> **This note is revised to them.** Read together, the second and third say: any member can answer any card, and a card is still sent to someone. How that works is card **B-tzdjn**, in deck `reviewers-joining`, with three more the first build needs: **B-9e7cn** (how CI trusts a member's passkey), **B-jsady** (how someone joins), **B-rxbss** (who changes a project's settings and rules).

## In brief

Today a project has one reviewer, its owner. A project will have **members**, and **every waiting card is every member's**: any of them can answer it, and the first answer decides it, so nothing waits on one person. A card is still **sent to** someone, the member running its agent, and everyone can see whom (if B-tzdjn is answered that way). Nobody sees a teammate's answer before giving their own. A different answer from a second person never replaces the first: someone settles it, and both stay. On the kinds of decision a team marks, a card takes two answers, each blind to the other.

The research found that nobody has built this for agents, or studied it: approval layers for agents don't say who answers, and no tool combines blind, independent answers with a rule for settling them.

## Who it's for

1. **A few developers on one repo, each running their own agents.** Ana's agent files cards on her branch; Ben's on his. Today Ben can't link the repo at all. The user's own case is a repo shared with collaborators, where Baesian runs in personal mode because nobody else can take part.
2. **A developer and a domain expert.** The statistician answers the cards on method; the data steward, the ones on access; the developer, the rest. [[Profiles and Collective Steering - Critique]] is this case.
3. **Cover.** Someone is away, and an agent has stopped.
4. **A group with persistent agents on shared machines,** where nobody "runs" an agent, and cards go by role. Later ([[Baesian Design#Open questions]], several machines).
5. **One person in several projects.** Already here: the projects page, each project with its inbox.

Not here: people outside a project answering its cards, and reviewers who never meet (open source at large).

## What assumes one reviewer today

Read from the code at 1.0.2.

| Where | What it assumes |
|---|---|
| **Who may answer** | A project has one owner, and only its owner is a member: `Accounts.member` checks the project's owner. A second account can't sign a machine in to the project either. |
| **Whose answer counts** | The latest answer on a card's latest revision decides its status, whoever gave it (`Store.status`). A verdict names its `reviewer` and `account`; nothing says whose card it was. A different answer later is a changed answer, and the agent is told, with both names (`Brief`). |
| **Passing a card on** | "It's outside my expertise" sets the card to `rerouted`, and it's parked. It names nobody, and nothing brings it to anyone. |
| **Proof on hard answers** | A hard answer takes the passkey of the account that gave it, and counts where that passkey's key is trusted: in the project's `trust/`, and in CI's pin, one line per passkey, set by hand. |
| **Presence** | One heartbeat per project: "the reviewer is there". `baesian wait` reads it, and a notification isn't sent while it's fresh. |
| **Notifications** | Go to the project's owner (`ProjectRelay.send`), counting every waiting card. |
| **The gate's settings** | One set per repo (D131), changed by whoever answers; letting more past takes their passkey. |
| **Rules** | Any answer can ask for a rule; once accepted it binds every agent in the repo. |
| **Calibration** | The report pools every answer on the repo (`routingReport()`); the panel calls it yours. |
| **Practice answers** | Kept per project, each naming its account; `PracticeTable.read` gives all of a project's. |
| **The website** | Your projects are the ones you own (`Accounts.projectsOf`). An inbox counts every card waiting in the project, and says "waiting for you". |
| **Leaving** | Deleting an account deletes every project it owns. There's no leaving a project. |
| **Without the service** | Whoever runs `baesian serve` answers as git's `user.name`. Two clones answering the same card both keep their answers when merged, and the later one decides. |

What already fits: a verdict names its account; an agent hears of a changed answer and who changed it; decisions on one topic that differ already become a card of their own (D35, D45); usage is counted per account; practice answers are a person's own by design (B-rehdw).

## The goals

Each says what it's for, the evidence (by strand and finding, as [[Several Reviewers - Research]] cites them), and what it rules out. Goals 1, 2, 5 and 6 are as the user's answers have them.

1. **A card is every member's, and nothing waits on one person** (B-r51ts). Any member can answer any waiting card; the first answer decides. It's the default of every approval tool found: any one of a named few (C1, C3, C5). *Rules out:* a card only one member can answer. *What it gives up:* a request to a group is answered more slowly, and by fewer, than one to a person (A27, C20), which goal 2 is there to win back.
2. **A card is still sent to someone: the nearest person who can judge it** (B-2n7s4). Whoever runs its agent; later, whoever a team names for its kind. Everyone sees whom, as Gerrit shows whose turn it is apart from who can act (A11, A12). Knowing the area makes a review faster and better (A26); approval by people far from the work is slower and no safer (C12). *Rules out:* a committee, and one person triaging everything. *B-tzdjn asks whether only that person is told at once.*
3. **Silence never becomes an answer.** A card that isn't answered stays open to every member, and the others are told of it after a while; what its agent does meanwhile follows the card's level, as now (D46). Nothing is decided by a timeout (C3, C4), and nothing waits for ever unseen (C7).
4. **Nobody sees a teammate's answer before giving their own,** as nobody sees the agent's pick (D86). An answer seen first is followed (B17, B27, C27), and a second look that isn't independent is worth nothing (B30, B31). *Rules out:* showing who chose what on a card you haven't answered.
5. **A second answer is evidence, never an overwrite** (B-v43z8). Two people will differ often (A32, C36, B21). When they do, both answers stand, someone settles it, and the one not taken stays with the decision, with its reason (B8, B23). *Rules out:* today's rule, that the latest answer decides.
6. **Two answers only where one miss is costly** (B-1yeqe). On the kinds a team marks, and nowhere by default. A second independent answer cuts misses from about one in ten to a few in a hundred, and costs time (B24); it helps on the high-stakes kinds and isn't shown to help everywhere (B26, B29).
7. **An inbox says what needs you first.** Cards sent to you lead your queue; the rest of what's waiting follows, marked with whom it was sent to; a card that's answered leaves every queue at once (C32, A12, C40). *Rules out:* a card answered twice by accident, and a notification that stays live after someone has answered.
8. **The team sets the limits; a person may only ask to see more.** One set of the gate's settings and rules per project (C10; [[Preference Sliders and the Gate]], decision 16). *B-rxbss asks who may change them.*
9. **Every answer counts as its author's.** Calibration is per person, and per agent; agreement between people is measured where two answered the same card. Nothing is pooled (B33, B36).
10. **The record proves who decided, and that they were a member,** checked in CI without asking the service, as answers are now (D138, D142). *B-9e7cn asks how CI comes to trust a member's passkey.*
11. **Two people need no setup.** With nothing written down, a second member can join, and each is sent their own agents' cards (A35).
12. **A new reviewer learns the team's precedents before deciding alone:** practice cards from the team's settled decisions ([[Practice Cards]]), and their agreement with the team shown by kind (A34, B28).

## The model

**Members.** A project has members; one or more are its owners. An owner adds and removes members and settles what two members can't. *B-jsady asks how someone joins; B-rxbss, whether only owners change the gate's settings and accept rules.*

**Whose a card is.** Every member's. Any member can answer a waiting card, blind to the agent's pick as now, and the first answer decides it for all. The relay still works out, as a card arrives, whom it's **sent to**, and writes it in the card's gate record, which it signs:
1. the member the team's **map** names for its kind or area, once there's a map (stage 2);
2. else the member **running the agent**: the account whose machine filed it;
3. else the project's owners: an agent on a shared machine, or a member who has since left.

**The desk.**
- *Sent to you:* first in your queue.
- *The rest of what's waiting:* after them, each marked with whom it was sent to and how long it has waited. You can answer any of them.
- *Decided:* in the project's history, with who decided. You can open one and **answer it yourself**, blind: its answer and who gave it stay hidden until you've chosen.

**Who is told** (B-tzdjn). As proposed: the member a card was sent to, at once; the others only if it's still waiting after a while, sooner when an agent has stopped for it. The alternative tells every member of every card at once.

**"It's outside my expertise."** From the member a card was sent to, it tells the others now. It no longer parks the card: it's every member's already.

**Two people at once.** A card someone else answers while you have it open says so before your answer is sent, as the desk already holds an answer while a project refreshes (B-3va5g). If you'd chosen the same, nothing more happens. If not, it's a different answer, below.

**A different answer** (B-v43z8). When a member answers a card that's decided, and chooses differently, nothing changes yet. They're shown the difference and may leave it there, as a note on the decision, or **raise it**. Raised, it becomes a card Baesian files: the two answers as its options, each with its reason, and whose is whose hidden until it's answered. It's sent to the member the first card was sent to, if they gave neither answer; else to an owner who gave neither; else the two see each other's answers and reasons, and an owner's stands if they still differ. The answer not taken stays with the decision. A member changing their own answer is a changed answer, as now.

**Two answers** (B-1yeqe; stage 3). A team can mark kinds of decision as taking two. Such a card stays open until two members have answered, each blind to the agent and to the other. If they agree, it's decided. If not, it's a different answer, settled as above.

**The team's settings.** The gate's settings and the rules stay one set per project. A member may ask to see kinds of card the team's gate holds back; none may let more past for themselves.

**Presence, calibration.** Presence is each member's; an agent's wait counts any member who's there. The calibration panel is yours. Agreement between members shows where two answered one card.

## Three walk-throughs

**Ana and Ben.** Ana's agent files a card on a schema change. It's sent to Ana: first in her queue, and on Ben's desk after his own, marked "sent to Ana". She answers; it leaves both. Next morning Ben sees it under "Decided", opens it and answers it himself, blind. He chooses the other option. The desk shows him Ana's answer and asks whether to raise it. He does, with his reason. Ana gave one of the two answers, so it goes to the project's other owner; with only the two of them, each sees the other's reason, and neither changes, so Ana's stands, as she's the owner. The decision's note says Ben would have chosen otherwise, and why. The agent is told nothing, since nothing changed.

**Away.** At night Ana's agent stops on a blocking card. It's sent to Ana, who isn't there. `baesian wait` gives up after its nine minutes and carries on with its pick, as now. A while after the card arrived, Ben is told too, and answers it over breakfast. Ana's desk says Ben answered it. Had it been a hard card, the agent would have waited for whichever of them came first.

**A statistician** (stage 2). The team's map says the cards on statistical method are sent to Sam. Ana's agent files one about a prior. It leads Sam's queue, not Ana's; Ana sees it marked "sent to Sam", and could answer it. Sam answers from a phone.

## In stages

1. **Members, and every member's cards** (B-j032t: this first). Joining and leaving; any member answering any waiting card; a card sent to whoever runs its agent, and shown as such; the desk's lists; answering a decided card yourself, and raising a difference; presence, notifications, calibration and practice per person; the projects page listing every project you're a member of, each inbox saying what waits and what was sent to you.
2. **The map.** Kinds and areas to people: whom a card is sent to when it isn't whoever runs the agent; how long before the others are told; a reminder to whoever an agent is waiting on.
3. **Two answers.** Marked kinds; agreement between members by kind; a new member's practice from the team's precedents.

## What changes where

Each line is a later card or an agent's decision, once the cards above are answered.

- **How a verdict counts** ([[File Formats]], `Store.status`; a change rolls out a release late, B-4kj4d). Today the latest answer decides. With B-v43z8, the first answer that resolves a card stands, unless its own author changes it or a raised difference is settled otherwise. Every release that reads the record has to agree, so it's a format matter, not only code.
- **The record's formats.** The relay's gate record names whom the card was sent to, and why; a raised difference and its settlement are cards Baesian files, as conflict cards are now (D35, D45). Where the members are kept, and who signs them, depends on B-9e7cn.
- **CI's trust** (B-9e7cn). Each member's passkey must count for hard answers: pinned by hand, as now, or vouched for by an owner's.
- **The service.** Members and how they joined, in the accounts database (B-jsady); who may answer, checked by the relay; presence and practice per account; what was sent to whom.
- **The client.** The desk's lists; "sent to" on each card; the difference card; a members page.
- **The CLI and the plugin.** `baesian wait` and `baesian inbox` name who answered, and whom a card was sent to; the instructions agents read say "a reviewer".
- **The privacy policy.** Members see each other's handles and answers, and whether they're there; what leaving a project removes. A card of its own, with the build.
- **Without the service,** nothing changes: one person answers, as now.

## Decisions for the user

**Answered (deck `reviewers`, 2026-11-11).**

| Card | The question | The answer |
|---|---|---|
| B-j032t | Who several reviewers is built for first | A few developers on one repo |
| B-r51ts | Whose a card is | Every member's (the alternative) |
| B-2n7s4 | Who a card reaches first | Whoever runs the agent |
| B-v43z8 | What a second person's different answer does | Someone settles it |
| B-1yeqe | Which cards take two answers | Only the kinds a team marks |

**Open (deck `reviewers-joining`).**

| Card | The question |
|---|---|
| B-tzdjn | Who's told when a card comes in: whoever runs its agent first, with the others seeing whose it is, or every member alike |
| B-9e7cn | How CI comes to trust a member's passkey: added to CI's settings by hand, or vouched for by an owner's passkey |
| B-jsady | How someone joins: a link the owner sends, or asking from their clone |
| B-rxbss | Who changes a project's settings and rules: only its owners, or any member |

**Later, each its own card:** what the privacy policy says; how long before the others are told; the map (stage 2); what an owner sees of a member's calibration.

## Not in this proposal

- Learning the gate's settings across projects or people ([[Profiles and Collective Steering - Critique]], point 5).
- Obligations set from outside the project, and gates on actions other than commits (the same note, "Specific to science").
- A project owned by an organisation, with teams.
- Several reviewers without the service.
