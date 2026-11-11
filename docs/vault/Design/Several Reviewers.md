---
type: design
status: draft
authority: specifies
summary: "P20, a proposal: several reviewers per project. Who it's for, what assumes one reviewer today, twelve goals with the evidence for each, the model (members, each card's one reviewer, how a card finds them, passing, cover, what a second answer does, two answers on marked kinds, the team's settings), three walk-throughs, three stages, what changes where, and the decisions for the user: five cards on the goals and the model first (deck reviewers), the mechanics after."
created: 2026-11-11
updated: 2026-11-11
tags: [baesian, design, hosted, reviewers]
---

# Several Reviewers

> **Status: a proposal (P20), drafted by an agent on 2026-11-11. Nothing here is decided.** The user asked for it after 1.0.2, saying it "is going to take some intelligent design around how interactions take place" and that "we also need to strongly identify the goals of the design and how collaboration works". The research is [[Several Reviewers - Research]], from three strands kept in full. The first five decisions, on the goals and the model, are cards in deck `reviewers`; the cards on mechanics (formats, CI's trust, the privacy policy, how someone joins) follow once those are answered, since they depend on them.

## In brief

Today a project has one reviewer, its owner. This proposes that a project has **members**, and that **every card still has one reviewer**: one member, by name, whose card it is. A card finds its reviewer by a rule; it can be passed on; when its reviewer is away and an agent waits, it goes to a named next person. Nobody sees a teammate's answer before giving their own. A second person's different answer never replaces the first: someone named settles it, and both answers stay. On the kinds of decision a team marks, a card takes two answers, each blind to the other.

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

Each says what it's for, the evidence (by strand and finding, as [[Several Reviewers - Research]] cites them), and what it rules out.

1. **A card is one person's, by name.** A request to a group is slower and gets fewer answers than one to a person (A27, C20); every framework for decisions names one decider (B2, B3). *Rules out:* a shared inbox where whoever comes first decides. *B-r51ts asks.*
2. **Its reviewer is the nearest person who can judge it.** By default whoever runs the agent; the kinds of decision a team reserves go to whoever it names. Approval by people far from the work is slower and no safer (C12); knowing the area makes a review faster and better (A26). *Rules out:* a committee, and one person triaging everything, as defaults. *B-2n7s4 asks.*
3. **A wait has a clock and a next person, and silence never becomes an answer.** A card whose agent has stopped goes to a named next person when its reviewer doesn't answer (A22, B15, C17). What the agent does meanwhile follows the card's level, as now (D46): nothing is decided by a timeout (C3, C4). *Rules out:* waiting for ever (C7), and refusing or approving by default.
4. **Nobody sees a teammate's answer before giving their own,** as nobody sees the agent's pick (D86). An answer seen first is followed (B17, B27, C27), and a second look that isn't independent is worth nothing (B30, B31). *Rules out:* showing who chose what on a card you haven't answered.
5. **A second answer is evidence, never an overwrite.** Two people will differ often (A32, C36, B21). When they do, both answers stand, someone named settles it, and the one not taken stays with the decision, with its reason (B8, B23). *Rules out:* today's rule, that the latest answer decides. *B-v43z8 asks.*
6. **Two answers only where one miss is costly.** A second independent answer cuts misses from about one in ten to a few in a hundred, and costs time (B24); it helps on the high-stakes kinds and isn't shown to help everywhere (B26, B29). *Rules out:* two answers on everything, and "two" where the second sees the first. *B-1yeqe asks.*
7. **An inbox holds what needs you.** A card that's someone else's is there to see, not in your queue; a card that's answered leaves every queue at once; a notification goes to its reviewer alone (C32, A12, C40). *Rules out:* notifying everyone, and a card answered twice by accident.
8. **The team sets the limits; a person may only ask to see more.** One set of the gate's settings and rules per project, changed by its owners; a member may tighten what reaches them, never loosen what the team holds (C10; [[Preference Sliders and the Gate]], decision 16).
9. **Every answer counts as its author's.** Calibration is per person, and per agent; agreement between people is measured where two answered the same card. Nothing is pooled (B33, B36).
10. **The record proves who decided, and that the card was theirs,** checked in CI without asking the service, as answers are now (D138, D142).
11. **Two people need no setup.** With no map written, a second member can join and both be asked the right cards (A35).
12. **A new reviewer learns the team's precedents before deciding alone:** practice cards from the team's settled decisions ([[Practice Cards]]), and their agreement with the team shown by kind (A34, B28).

## The model

**Members.** A project has members; one or more are its owners. An owner invites and removes members, sets the gate and the map below, and settles what two members can't. Everyone else is a member, and answers the cards that are theirs.

**A card's reviewer.** Each card has one, at any time. The relay works it out as the card arrives, and writes it in the card's gate record, which it signs, with the reason:
1. the member the team's **map** names for the card's kind (a row of the gate: security, schema, …) or its area (the start of its topic), if there's a map and it names one;
2. else the member **running the agent**: the account whose machine filed it;
3. else the project's **owner**: an agent on a shared machine, or a member who has since left.

*B-2n7s4 asks whether step 2 or step 3 is the default.*

**What a member sees of a card.**
- *Yours:* in your queue, answered as now, blind to the agent's pick.
- *With someone else:* listed, with whose it is and how long it has waited. Not in your queue, and not answerable there.
- *Decided:* in the project's history, with who decided. You can open one and **answer it yourself**, blind: its answer and its reviewer's name stay hidden until you've chosen.

**Passing a card on.** "It's outside my expertise" names a member, or sends it back to the owner; the card becomes theirs, with your note. It can't come straight back to whoever passed it.

**Cover.** A member can say they're away; their cards then go to the next person at once. Otherwise, when an agent has stopped for a card (blocking or hard) and its reviewer hasn't answered in a set time, the card is also offered to the next person: the map's second for its kind, else an owner. Whoever answers first is its reviewer. The other is told it was answered. A provisional card waits for its own reviewer: its agent has moved on.

**A different answer.** When a member answers a decided card themselves and chooses differently, nothing changes yet. They're shown the difference and may leave it there, as a note on the decision, or **raise it**. Raised, it becomes a card Baesian files for the card's reviewer: the two answers as its options, each with its reason, and whose is whose hidden until they choose. If they keep theirs, the other answer stays with the decision. An owner settles what the two can't. *B-v43z8 asks.*

**Two answers.** A team can mark kinds of decision as taking two. Such a card has two reviewers, the second chosen as the first is, among the others. Each answers blind to the agent and to the other. If they agree, it's decided. If not, each sees the other's answer and reason and may change theirs; if they still differ, an owner who isn't one of them settles it, or the kind's named person. *B-1yeqe asks whether this is by marked kind, or for every hard card.*

**The team's settings.** The gate's settings and the rules stay one set per project, changed by owners. A rule a member asks for goes to an owner as a card, as a rule's draft does now. A member may ask to see kinds of card the team's gate holds back; none may let more past for themselves.

**Presence, notifications, calibration.** Presence is each member's; an agent's wait reads its card's reviewer's. A notification goes to a card's reviewer, and to cover when the card reaches them. The calibration panel is yours; an owner sees each member's by kind, and agreement between members where two answered one card.

## Three walk-throughs

**Ana and Ben.** Ana's agent files a card on a schema change. It's Ana's: in her queue, and on Ben's desk under "With Ana". She answers; it leaves both. Next morning Ben sees it under "Decided", opens it and answers it himself, blind. He chooses the other option. The desk shows him Ana's answer and asks whether to raise it. He does, with his reason. Ana gets a card: two options, hers and his, unnamed. She keeps hers. The decision's note now says Ben would have chosen otherwise, and why. The agent is told nothing, since nothing changed.

**Away.** At night Ana's agent stops on a blocking card. Ana isn't there. `baesian wait` says it's waiting on Ana, then gives up after its nine minutes and carries on with its pick, as now. Half an hour after the card arrived it's offered to Ben as well, who answers it over breakfast. Ana's desk says Ben answered it while she was away. Had it been a hard card, the agent would have waited for whichever of them came first.

**A statistician.** The team's map says the cards on statistical method are Sam's. Ana's agent files one about a prior. It goes to Sam, not Ana; Ana sees it under "With Sam". Sam answers from a phone.

## In stages

1. **Members, and whose card it is.** *B-j032t asks whether this or the map comes first.* Joining and leaving; a card's reviewer, by whoever runs the agent, else the owner; the desk's three lists; passing to a named member; answering a decided card yourself, and raising a difference; presence, notifications, calibration and practice per person; the projects page listing every project you're a member of, each inbox counting what waits for you. This is scenario 1, and what the user's shared repo needs.
2. **The map, and cover.** Kinds and areas to people; being away; the clock and the next person; a reminder to whoever an agent is waiting on. Scenarios 2 and 3.
3. **Two answers.** Marked kinds; settling a difference between two reviewers; agreement between members by kind; a new member's practice from the team's precedents. Scenario 4's groundwork.

## What changes where

Each line is a later card or an agent's decision, once the model is settled.

- **The record's formats** ([[File Formats]]; a format change rolls out a release late, B-4kj4d): the relay's gate record names the card's reviewer and why; a pass, a raised difference and its settlement are files of their own; a verdict given as a second answer says so. Where the members and the map are kept, and who signs them, is open: in the record, as the preferences are, or on the service.
- **CI's trust.** Each member's passkey must count for hard answers. Either CI pins each one by hand, as now, or it pins the owners', and an owner's passkey vouches for each member's.
- **The service.** Members and invitations in the accounts database; who may answer what, checked by the relay; counts per person; presence and practice per account.
- **The client.** The desk's lists; whose card it is, on the card; passing to a name; the difference card; a members page; an owner's view of calibration.
- **The CLI and the plugin.** `baesian wait` and `baesian inbox` name the card's reviewer; the instructions agents read say "its reviewer".
- **The privacy policy.** Members see each other's handles, answers and whether they're there; an invitation's address; what leaving a project removes.
- **Without the service,** nothing changes: one person answers, as now.

## Decisions for the user

**Now, in deck `reviewers`: the goals and the model.**

| Card | The question |
|---|---|
| B-j032t | Who several reviewers is built for first: a few developers on one repo, or a group whose members own different kinds of decision |
| B-r51ts | Whose a card is: one member's, by name, or every member's until someone answers |
| B-2n7s4 | Who a card reaches first when no map names anyone: whoever runs the agent, or the project's owner |
| B-v43z8 | What a second person's different answer does: someone settles it and both stay, or the latest decides |
| B-1yeqe | Which cards take two answers: the kinds a team marks, or every hard card |

**After those: the mechanics,** each its own card: where members and the map are kept and who signs them; how CI comes to trust a member's passkey; how someone joins and leaves; what the privacy policy says; the clock's length and who is next; what a member sees of a card that's with someone else; whether an owner's own cards may be settled by themselves.

## Not in this proposal

- Learning the gate's settings across projects or people ([[Profiles and Collective Steering - Critique]], point 5).
- Obligations set from outside the project, and gates on actions other than commits (the same note, "Specific to science").
- A project owned by an organisation, with teams.
- Several reviewers without the service.
