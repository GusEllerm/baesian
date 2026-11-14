---
type: design
status: draft
authority: specifies
summary: "P20, several reviewers per project, decided as far as stage 1 needs. The user's first five answers (2026-11-11): built first for a few developers on one repo (B-j032t); a card is every member's (B-r51ts, against the proposal's one reviewer per card); it reaches whoever runs its agent first (B-2n7s4); a second person's different answer is settled by someone, with both kept (B-v43z8); two answers only on the kinds a team marks (B-1yeqe). The model as revised by them, the goals and their evidence, three walk-throughs, three stages, what changes where, the four answers of deck reviewers-joining (sent to one and open to all, B-tzdjn; members' passkeys pinned in CI by hand, B-9e7cn; joining by a link the owner sends, B-jsady; settings and rules for owners only, B-rxbss), and the build's steps."
created: 2026-11-11
updated: 2026-11-11
tags: [baesian, design, hosted, reviewers]
---

# Several Reviewers

> **Status: a proposal (P20), decided by twelve cards (2026-11-11 and 12), and being built: steps 1 to 4 of "The build" are done, the service, the website and the CLI; nothing of it is released.** The user asked for it after 1.0.2, saying it "is going to take some intelligent design around how interactions take place" and that "we also need to strongly identify the goals of the design and how collaboration works". The research is [[Several Reviewers - Research]], from three strands kept in full.
>
> **The first five cards (deck `reviewers`) were answered the same day,** four with the proposal and one against it:
> - **B-j032t**, "A few developers on one repo": built first for developers who each run their own agents; the map from kinds of decision to people comes second.
> - **B-r51ts**, "Every member's", *against the proposal's "One member's, by name"*: a card is every member's, and the first to answer decides it. The user: "It seems simpler to me to make cards available to all members. To route a card to a specific person could block development until they action it right? Perhaps there is a middle ground, cards are sent to others and team members can see that?"
> - **B-2n7s4**, "Whoever runs the agent": a card reaches the member running its agent first.
> - **B-v43z8**, "Someone settles it": a second person's different answer doesn't replace the first; someone settles it, and both stay.
> - **B-1yeqe**, "Only the kinds a team marks": one answer decides a card unless a team marks its kind.
>
> **This note is revised to them.** Read together, the second and third say: any member can answer any card, and a card is still sent to someone.
>
> **Four more (deck `reviewers-joining`) were answered the same day, each with the proposal:**
> - **B-tzdjn**, "Sent to one, open to all": a card leads the queue of whoever runs its agent, and they alone are told at once; every member sees it, marked as sent to them, and can answer it; the others are told only if it's still waiting after a while.
> - **B-9e7cn**, "Added to CI's settings by hand": each member's passkey gets a line in CI's pin, as the owner's has now; until then CI fails on that passkey, saying how to fix it.
> - **B-jsady**, "A link the owner sends": good once, for seven days; no address is kept.
> - **B-rxbss**, "Only its owners": owners change the gate's settings, accept rules, add and remove members, and settle a difference two members can't; a project can have several.
>
> **A tenth, B-aaj69 (deck `reviewers-joining`), was answered the same day, against the proposal's ten minutes:** "After half an hour": a blocking or hard card still waiting half an hour after it arrived is notified to the members it wasn't sent to.
>
> **An eleventh, B-av0wb, answered 2026-11-12 with the proposal:** "Once the CLI and privacy policy are done": the first release with members goes out after steps 4 and 6 of "The build"; raising a different answer (step 5) follows in a release of its own. Until then a member whose answer comes second is told who decided and what they chose, and takes it up with them outside Baesian.
>
> **A twelfth, B-4mt91, answered 2026-11-12 with the proposal:** "Your own answers": in a project with members, each member's calibration counts the cards they answered; what a row needs before its setting moves stays the project's.
>
> **Next:** the privacy policy's lines as a card (step 6); then a release; then a different answer raised and settled (step 5).

## In brief

Today a project has one reviewer, its owner. A project will have **members**, and **every waiting card is every member's**: any of them can answer it, and the first answer decides it, so nothing waits on one person. A card is still **sent to** someone, the member running its agent, who alone is told at once, and everyone can see whom (B-tzdjn). Nobody sees a teammate's answer before giving their own. A different answer from a second person never replaces the first: someone settles it, and both stay. On the kinds of decision a team marks, a card takes two answers, each blind to the other.

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
2. **A card is still sent to someone: the nearest person who can judge it** (B-2n7s4). Whoever runs its agent; later, whoever a team names for its kind. Everyone sees whom, as Gerrit shows whose turn it is apart from who can act (A11, A12). Knowing the area makes a review faster and better (A26); approval by people far from the work is slower and no safer (C12). *Rules out:* a committee, and one person triaging everything. Only that person is told at once (B-tzdjn).
3. **Silence never becomes an answer.** A card that isn't answered stays open to every member, and the others are told of it after a while; what its agent does meanwhile follows the card's level, as now (D46). Nothing is decided by a timeout (C3, C4), and nothing waits for ever unseen (C7).
4. **Nobody sees a teammate's answer before giving their own,** as nobody sees the agent's pick (D86). An answer seen first is followed (B17, B27, C27), and a second look that isn't independent is worth nothing (B30, B31). *Rules out:* showing who chose what on a card you haven't answered.
5. **A second answer is evidence, never an overwrite** (B-v43z8). Two people will differ often (A32, C36, B21). When they do, both answers stand, someone settles it, and the one not taken stays with the decision, with its reason (B8, B23). *Rules out:* today's rule, that the latest answer decides.
6. **Two answers only where one miss is costly** (B-1yeqe). On the kinds a team marks, and nowhere by default. A second independent answer cuts misses from about one in ten to a few in a hundred, and costs time (B24); it helps on the high-stakes kinds and isn't shown to help everywhere (B26, B29).
7. **An inbox says what needs you first.** Cards sent to you lead your queue; the rest of what's waiting follows, marked with whom it was sent to; a card that's answered leaves every queue at once (C32, A12, C40). *Rules out:* a card answered twice by accident, and a notification that stays live after someone has answered.
8. **The team sets the limits; a person may only ask to see more.** One set of the gate's settings and rules per project, changed by its owners (B-rxbss; C10; [[Preference Sliders and the Gate]], decision 16).
9. **Every answer counts as its author's.** Calibration is per person, and per agent; agreement between people is measured where two answered the same card. Nothing is pooled (B33, B36).
10. **The record proves who decided, and that they were a member,** checked in CI without asking the service, as answers are now (D138, D142). A member's passkey is pinned in CI by hand, as the owner's is (B-9e7cn).
11. **Two people need no setup.** With nothing written down, a second member can join, and each is sent their own agents' cards (A35).
12. **A new reviewer learns the team's precedents before deciding alone:** practice cards from the team's settled decisions ([[Practice Cards]]), and their agreement with the team shown by kind (A34, B28).

## The model

**Members.** A project has members; one or more are its owners. Owners add and remove members, change the gate's settings, accept rules, and settle what two members can't (B-rxbss). Someone joins by a link an owner makes on the project's page: good once, for seven days, with no address kept (B-jsady).

**Whose a card is.** Every member's. Any member can answer a waiting card, blind to the agent's pick as now, and the first answer decides it for all. The relay still works out, as a card arrives, whom it's **sent to**, and writes it in the card's gate record, which it signs:
1. the member the team's **map** names for its kind or area, once there's a map (stage 2);
2. else the member **running the agent**: the account whose machine filed it;
3. else the project's owners: an agent on a shared machine, or a member who has since left.

**The desk.**
- *Sent to you:* first in your queue.
- *The rest of what's waiting:* after them, each marked with whom it was sent to and how long it has waited. You can answer any of them.
- *Decided:* in the project's history, with who decided. You can open one and **answer it yourself**, blind: its answer and who gave it stay hidden until you've chosen.

**Who is told** (B-tzdjn, B-aaj69). The member a card was sent to, at once; the others only if a blocking or hard card is still waiting half an hour after it arrived. A provisional card never tells the others on its own.

**"It's outside my expertise."** From the member a card was sent to, it tells the others now. It no longer parks the card: it's every member's already.

**Two people at once.** A card someone else answers while you have it open says so before your answer is sent, as the desk already holds an answer while a project refreshes (B-3va5g). If you'd chosen the same, nothing more happens. If not, it's a different answer, below.

**A different answer** (B-v43z8). When a member answers a card that's decided, and chooses differently, nothing changes yet. They're shown the difference and may leave it there, as a note on the decision, or **raise it**. Raised, it becomes a card Baesian files: the two answers as its options, each with its reason, and whose is whose hidden until it's answered. It's sent to the member the first card was sent to, if they gave neither answer; else to an owner who gave neither; else the two see each other's answers and reasons, and an owner's stands if they still differ. The answer not taken stays with the decision. A member changing their own answer is a changed answer, as now.

**Two answers** (B-1yeqe; stage 3). A team can mark kinds of decision as taking two. Such a card stays open until two members have answered, each blind to the agent and to the other. If they agree, it's decided. If not, it's a different answer, settled as above.

**The team's settings.** The gate's settings and the rules stay one set per project. A member may ask to see kinds of card the team's gate holds back; none may let more past for themselves.

**Presence, calibration.** Presence is each member's; an agent's wait counts any member who's there. The calibration panel is yours. Agreement between members shows where two answered one card.

## Three walk-throughs

**Ana and Ben.** Ana's agent files a card on a schema change. It's sent to Ana: first in her queue, and on Ben's desk after his own, marked "sent to Ana". She answers; it leaves both. Next morning Ben sees it under "Decided", opens it and answers it himself, blind. He chooses the other option. The desk shows him Ana's answer and asks whether to raise it. He does, with his reason. Ana gave one of the two answers, so it goes to the project's other owner; with only the two of them, each sees the other's reason, and neither changes, so Ana's stands, as she's the owner. The decision's note says Ben would have chosen otherwise, and why. The agent is told nothing, since nothing changed.

**Away.** At night Ana's agent stops on a blocking card. It's sent to Ana, who isn't there. `baesian wait` gives up after its nine minutes and carries on with its pick, as now. Half an hour after the card arrived, Ben is told too, and answers it over breakfast. Ana's desk says Ben answered it. Had it been a hard card, the agent would have waited for whichever of them came first.

**A statistician** (stage 2). The team's map says the cards on statistical method are sent to Sam. Ana's agent files one about a prior. It leads Sam's queue, not Ana's; Ana sees it marked "sent to Sam", and could answer it. Sam answers from a phone.

## In stages

1. **Members, and every member's cards** (B-j032t: this first). Joining and leaving; any member answering any waiting card; a card sent to whoever runs its agent, and shown as such; the desk's lists; answering a decided card yourself, and raising a difference; presence, notifications, calibration and practice per person; the projects page listing every project you're a member of, each inbox saying what waits and what was sent to you.
2. **The map.** Kinds and areas to people: whom a card is sent to when it isn't whoever runs the agent; how long before the others are told; a reminder to whoever an agent is waiting on.
3. **Two answers.** Marked kinds; agreement between members by kind; a new member's practice from the team's precedents.

## The build

Stage 1, in steps, each tested and committed by itself. Found while planning it: **nothing in the record's formats has to change.**

- **A second member's different answer is never written as a verdict.** The relay refuses a verdict on a card another member has already decided, and says who decided and whether the two differ. So "the latest answer decides" stays true of what's in the record, for every release that reads it, and no rollout a release late is needed (B-4kj4d). A member still changes their own answer as now.
- **A raised difference is a conflict card naming one card** (`conflict_of`, D35): Baesian files it with the standing answer and the other as its two options. Answered with the other, it supersedes the first card, and the work built on it gets a rework brief; answered with the standing one, the first card stands. That's what the store already does for two decisions on one topic.
- **Whom a card was sent to is the relay's own note,** in a table beside its notification state, not in the signed gate record: nothing about who may answer rests on it, so CI has nothing to check.

1. **Members on the service.** *Built (2026-11-11), [[service#Who answers what (P20, B-r51ts, B-rxbss, B-v43z8)]].* The accounts database's `members` and `invites`; an owner's link, good once for seven days; joining, leaving, removing; a member's machine signing in to the project; only owners changing the settings and accepting rules; a second member's answer on a decided card refused.
2. **Sent to, and who's told.** The relay notes whom each card was sent to; a notification goes to them at once, to the others after a while; the counts say what was sent to you. *Built (2026-11-11), [[service#Whom a card is sent to (P20, B-2n7s4, B-tzdjn; service/src/sent-to.ts)]]; decided by the agent while building it, each in the [[Decision Log]]:*
   - A card only owners answer (a rule's draft, a proposed move of a setting) is sent to nobody in particular, whoever's machine filed it, and waits for no other member: it isn't in their count, and they aren't told of it.
   - "It's outside my expertise" tells the others at once only from whoever the card was sent to (its member, or an owner when it was sent to nobody in particular). From anyone else it puts the card aside for them alone. Either way it stops waiting for whoever passed it, and still waits for everyone else; once every member has passed it, it waits for nobody, as now.
   - A passed-on card stays marked as sent to its member: it's among nobody's own.
   - A member who leaves, or whose account is deleted: the cards sent to them are the owners' from then, and an owner is told. While an account is closed and can still be restored, its cards stay sent to it.
   - Each member is told at most four times an hour from a project, and isn't told while they're at the desk, whoever else is.
   - A notification counts every card waiting for the member it goes to, not only those sent to them: its words don't change (B-mjf3g).
3. **The website.** The projects you're a member of; a members page, with the link; the desk's queue, yours first, each card marked with whom it was sent to; what the desk says when someone else answers first. *Built (2026-11-11), [[Client Build]] item 31; decided by the agent while building it, each in the [[Decision Log]]:*
   - The members page is at the desk's address with `/members` after it; a link opens `/join`, with its code after the `#`, which is kept in the tab while someone signs in or signs up, and is never in an address the service is asked for.
   - Only the cards that weren't sent to you are marked ("sent to ana", "sent to the owners", "passed on by ana"); a project of one shows no marks.
   - A card another member decides while it's in front of you leaves your desk, which says who answered it and not what they chose. An answer of yours that arrives second isn't recorded, and the desk then says who came first and what they chose.
   - An inbox counts every card on your desk, and says how many were sent to you when that isn't all of them.
   - A member sees the project's preferences as they are, with nothing to change, and is never offered the setup survey. A card only owners answer isn't on a member's desk.
   - Removing a member, and leaving, ask first; whoever made the project has nothing to press.
   - *Put right the next day:* the desk said "you" for whatever another member did, in the decisions by branch, on cards answered in chat, in the calibration panel and in practice cards. Each now names who, or is each member's own ([[Client Build]] item 31, "Whose words"); Baesian's own cards name who chose once a project has answers from more than one person ([[src-routing]]).
4. **The CLI and the plugin.** `baesian login` for a member; who answered, in `baesian inbox` and `baesian wait`; the instructions' wording; `baesian verify`'s message for a member's passkey that isn't pinned. *Built (2026-11-12), and smaller than planned, [[src-sync]], [[src-trust]]:*
   - **Already true, so unchanged:** `baesian wait` and `baesian inbox` name who answered; a card someone passed on keeps its agent waiting, since another reviewer is still to answer; a member's machine signs in from a clone of the linked repo.
   - **The instructions keep "the reviewer"** as the name of whoever answers. Nothing they say is untrue of a team, and changing the block would rewrite every repo's `AGENTS.md` at its next upgrade (B-amxkp) for no change in meaning. The plugin's skill is unchanged for the same reason.
   - **Changed:** `baesian ci` asks each member to check their own passkey's line when the project holds more than one person's; `baesian verify` says a passkey that isn't pinned may be a member's, and that `baesian ci` prints its line (B-9e7cn); `baesian login`, refused in a repo that's linked already, says how to join the project.
   - **Not built:** the CLI saying whom a card was sent to. That's the relay's own note, in no file a machine reads, and a card is sent to whoever's machine filed it unless only owners answer it.
5. **A different answer.** Answering a decided card yourself, blind; raising a difference; the card it becomes, and who may settle it.
6. **The privacy policy,** as a card, then the docs. *Policy written (2026-11-14), [[Privacy Policy]]:* its lines for members as B-hr2g2's background drafted them; account holders are emailed the day before the release (B-hr2g2, "The day before", decided by the user), and none but the user exists, so no email is needed (2026-11-14); a member's practice answers go when they leave or are removed (B-wfw7a, "They go at once", decided by the user, `ProjectRelay.memberGone`). Made true while writing it, by the agent: a member's heartbeat is cleared by the daily look after a day, and deleting an account forgets which members joined by its link. The docs are next.

## What changes where

Each line is a later card or an agent's decision, once the cards above are answered.

- **How a verdict counts.** Unchanged in the record (`Store.status`): the relay refuses a second member's answer on a decided card, as "The build" says, so nothing a release reads means anything new.
- **The record's formats.** None changes. A raised difference is a conflict card naming one card (D35, D45).
- **CI's trust** (B-9e7cn). Each member's passkey is pinned by hand, as the owner's is: `baesian ci` prints and sets the lines.
- **The service.** Members and links, in the accounts database (B-jsady); who may answer and who may change settings, checked by the relay (B-rxbss); practice per account; what was sent to whom.
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

**Answered (deck `reviewers-joining`, 2026-11-11).**

| Card | The question | The answer |
|---|---|---|
| B-tzdjn | Who's told when a card comes in | Sent to one, open to all |
| B-9e7cn | How CI comes to trust a member's passkey | Added to CI's settings by hand |
| B-jsady | How someone joins | A link the owner sends |
| B-rxbss | Who changes a project's settings and rules | Only its owners |
| B-aaj69 | How long before the others are told | After half an hour (the alternative) |
| B-av0wb | What the first release with members includes | Once the CLI and privacy policy are done (2026-11-12) |
| B-4mt91 | What "Your calibration" shows in a project with members | Your own answers (2026-11-12) |

**Later, each its own card:** what the privacy policy says; the map (stage 2); what an owner sees of a member's calibration.

## Not in this proposal

- Learning the gate's settings across projects or people ([[Profiles and Collective Steering - Critique]], point 5).
- Obligations set from outside the project, and gates on actions other than commits (the same note, "Specific to science").
- A project owned by an organisation, with teams.
- Several reviewers without the service.
