---
type: design
status: active
authority: specifies
summary: "P19, practice cards with planted picks (B-kb5yt, D83), decided by the user's answers to its six cards (B-sy0kz, B-rehdw, B-j583c, B-xx49m, B-bb7ga, B-zw55w) and two found while building (B-9prve, B-wcb9d), and built on a builder's branch: which past cards can be rebuilt, what a practice card keeps, swaps and drops, the tells and what's done about each, how often one comes and what it says once answered, where its answers live and why nothing reaches an agent, the calibration panel's practice row, the blind test that comes first, and the build order."
created: 2026-11-10
updated: 2026-11-10
reviewed: 2026-11-10
tags: [baesian, design, calibration]
---

# Practice Cards

> **Status: decided and built (2026-11-10), on a builder's branch off `v1/next`, not merged.** Drafted by an agent on 2026-11-10 as proposal P19, after the user answered B-kb5yt with "Practice cards with planted picks", from the critique in [[Profiles and Collective Steering - Critique]]. The user then answered its six cards in deck calibration, each with its proposal: **B-sy0kz**, "A case the agent writes for its alternative"; **B-rehdw**, "On the service, for every device"; **B-j583c**, "From a week to a month old"; **B-xx49m**, "In your deck, as you work"; **B-bb7ga**, "Only if your marks beat guessing"; **B-zw55w**, "As the cards around it do". What follows is the design as those answers settled it, and as built: the client's side in [[Client Build]] item 28, the format in [[File Formats#Practice entry (B-rehdw)]], the addresses in [[src-server]] and [[service]].
>
> **Found while building, and answered the same day:** two choices the cards didn't settle, filed in deck calibration: **B-wcb9d**, "Only that it's recorded, on every card" (the proposal), for what the desk says of an answer during the test; and **B-9prve**, revised to r2 to say what the mark is, "On a card of its own after each answer" (the alternative, so the first build, which asked in the reveal, was rebuilt): your guess comes on a card of its own once you've answered, before the next card.
>
> **What runs now:** the blind test comes first, from your calibration. Until it has run and wasn't spotted, no regular practice card appears; once spotted, none ever does (D71).

## Already decided

- **B-kb5yt:** about 1 in 20 cards in your deck is a past card rebuilt as D83 has it, whose shown pick Baesian chose; your calibration shows how often you come round to a planted pick against a real one. A practice card is never sent to an agent or kept in the record, and says it was practice once you've answered. A blind test, ten rebuilt cards among real ones, comes first. Its premise: rebuilt cards can't be told apart from real ones.
- **B-sy0kz:** the planted pick's case is one the agent writes for its alternative when it files: a new optional card field, `alternative_rationale`, never shown on its own card. Only cards that carry one come back, so practice waits for cards filed from now on.
- **B-rehdw:** practice answers are kept on the service, for every device, in a table of their own, outside the log machines read, behind an address only a signed-in browser can use; the privacy page lists them. Without the website, they're in the clone's live layer.
- **B-j583c:** a card comes back from a week after you answered it until the relay drops its text; nothing is kept longer for practice, and R-1sxpy (`RETENTION`) is unchanged.
- **B-xx49m:** the blind test runs in your deck as you work: about 1 in 4 cards is practice until ten have come, each card you answer is marked, and none says it was practice until the tenth is done.
- **B-bb7ga:** practice cards count as spotted only if your marks beat guessing: a one-sided Fisher's exact test at 95%, maybe and sure counted as marked; one card you're sure of is one mark among the rest.
- **B-zw55w:** a practice card says its agent has stopped when the real card before it does, and says no agent was waiting once you've answered it.
- **B-wcb9d:** during the blind test, the desk says only that each answer is recorded, on every card; none says which went to an agent, or that Baesian proposed something from it, until the test ends.
- **B-9prve:** in the blind test, your guess about each card you answer comes on a card of its own after the answer, before the next card; the answer is already on its way, and guessing is a step between cards.
- **D83:** practice cards are built from resolved cards by swapping their options, each option keeping its own crux answer and "then". Live layer only: never in the record, never a verdict, never sent to an agent. A blind test of ten comes before they ship.
- **D71:** what can't be shown consistently is dropped, not shipped weaker. So practice cards are dropped if the blind test spots them.
- **D86, D88:** the agent's pick is hidden until you choose, sides shuffled per card and per session; both the blind choice and the final answer are kept. Practice cards rest on both: the blind choice is the measure before the case, the final answer the measure after it.
- **The Client Data Contract, hard part 5 (after D65):** practice cards are assembled from what cards already say; nothing generates text.
- **D90:** "stopped" shows only while an agent's waiting marker is fresh; B-zw55w makes the one exception, until a practice card is answered.
- **D180:** the calibration panel's practice-card row waits for D83.
- **B-87tkc and B-ab06a:** a miss is a final answer against the agent's pick, or "you should have asked me"; on a preference crux, a blind choice against the pick counts as a miss even when you come round. Coming round (a blind choice against the pick, then a final answer on it) is what practice cards measure.
- **R-1sxpy (B-9jqt4):** the relay drops a settled card's text, and its answers, 30 days after every machine has it (`RETENTION`, `due()`).
- **D108:** no compatibility before v1, so new fields and files need no migration.

## What was checked

On 2026-11-10, by the agent, reading the code on `v1/next` at `f224575` and counting this repo's record through the CLI's own store (the state the client reads). Nothing was run against the relay.

- **How a past card reaches the client.** The client reads one `ApiState`, every card with its verdicts, resolved ones included: from `baesian serve` locally, and from `Relay.state` on the website. In a linked repo `baesian serve` opens the website instead, so this repo answers only there. Machines read the relay's `Relay.log`, and may read its state too: a machine's grant can `GET` the state, and `baesian wait` does, for presence.
- **What the card shows** (`Card`): before the choice, the stakes line and rarity mark, the waiting badge, `doing` with the agent's name, the question, the crux and its fact, the two options with their crux answers and outcomes, an unchecked premise and work already built. No date, no branch, no ID. Above it, the area and the deck; on the path, what it builds on, what conflicts with it, rules, what relies on it and its precedent (`relationsOf()`). At the reveal, the pick (with `serves`), the agent's case (rationale, then "its pick is wrong if…" with the check), the background under "More from…", and the "Why?" line, which says it goes to the agent.
- **This repo's record:** 185 resolved cards, 171 of them agents' cards answered blind and not in chat, all filed by claude-code between 1 and 10 November; 70 of the 171 hard. Of the 171, 163 have a rationale, 94 a "wrong if", 164 a background. Topics name one question each, so no card's topic has another resolved card on it. 133 answers came from the local client, 26 from the website on a desktop, 35 on a phone.

## 1. Which past cards can come back

A card can be rebuilt as practice when all of these hold (`whyNot()`, `sources()`, in `client/src/practice.ts`). Each keeps off the desk what would otherwise be untrue or impossible on a practice card.

- **Resolved, and its final answer a choice** (the agent's pick or its alternative), with a blind choice recorded (`finalChoice()`). A correction or a rejection took neither option.
- **An agent's card:** not Baesian's own (conflicts, rule drafts, conventions, slider proposals), not answered in chat (B-hswmx), and only one revision, with no reply (a reply sits under the crux and names your earlier answer).
- **Not hard** (`isHard()`). On the website a hard answer waits for your passkey (B-a6xpc); a practice card can't take part in that honestly, so it can't be hard. This leaves out every card that touches security, privacy, money, data loss or publishing, so practice cards measure deference on the other rows only, and the panel compares them with real cards that aren't hard either.
- **Not held back by the gate, nor said to be in shadow:** the reveal of such a card says so ("You should have asked me", what the agent went ahead with), which a practice card can't show honestly. Added while building, on this section's principle.
- **Carrying the agent's case for its alternative** (`alternative_rationale`, B-sy0kz).
- **Nothing on it that names the pick:** no `acted` (what's built is the pick's), no `premise`, no `proposal_breaks` or `alternative_breaks`, no conflicts, no rules cited, no rule made from its answer, and no background that speaks of "the proposal", the alternative, or the agent's own pick (about one card in six).
- **From a week to a month after its final answer** (B-j583c: `MIN_AGE_MS`, `MAX_AGE_MS`), while the relay still holds its text. On `baesian serve` without an account, where nothing is removed, the same month applies.
- **Each card once.** A card that has come back as practice, in any phase, never comes back again (`practised()`), across your devices, since the answers are on the service.

On 2026-11-10 this left 80 cards, 44 of them answered over a week ago and none over two weeks, before B-sy0kz's field existed. With it, practice waits for cards filed from now on to be answered and to age a week.

## 2. How a practice card is built

It's built in the client, from the state the client already reads: a pure function over one resolved card (`rebuild()`), kept beside the client's model with its tests. The server stores only the answers (section 5). A practice card has an identity of its own (`practiceId()`), so it never collides with its original in what the desk remembers (`useSeen()`, `sidesFor()`); the desk's card type carries what it came from (`DeskCard`, `practiceOf()`).

| Part | On the practice card |
|---|---|
| Title, question, `doing`, agent and model, topic and area, deck, `touches`, `reverse`, `depends_on`, the crux, its fact and whether it's a preference | The original's, unchanged |
| The two options, each with its crux answer and outcome | Swapped: the option the agent didn't pick is shown as its pick, the planted pick (D83) |
| The case for the pick | The agent's `alternative_rationale`, as the rationale (B-sy0kz). The original's rationale, "wrong if", check and `serves` are dropped: they argue for the other option |
| The background | The original's, shown under "More from…" as on any card |
| Its level and rarity | Its level as filed; rarity from its own fields (`rarityOf()`), with no dependents, as it was when filed |
| The gate's record, verdicts, dependents, briefs, waiting markers, fallbacks | None |
| The waiting badge | "stopped" when the real card answered before it said so (B-zw55w) |

**On the path,** `relationsOf()` leaves the original out: its topic is the practice card's, so it would show as "your precedent, on the same topic", settled, with the same title. What the original built on stays, as on any new card; nothing relies on it.

**The deck stays the original's,** though it may be a deck you finished: `doing` names the original's work, and a borrowed deck would contradict it. Its briefing card never comes before a practice card (`useBriefed()`). It offers no topic merge, which would merge its original's.

## 3. What could give a practice card away

The blind test exists to find out. These are the tells the design knows of, and what it does about each.

| Tell | When | What the design does |
|---|---|---|
| You remember the card, or its question, `doing` or crux fact, which date from its own work | Choice | The age window (B-j583c), measured by the blind test as you work among new cards (B-xx49m) |
| The original shows on the path as your precedent | Choice | Left out (section 2) |
| Cards that rely on the original show on the path | Choice | Dropped: a card has none when it's filed |
| A deck you finished, in the crumbs | Choice | Kept, as above. Measured by the blind test |
| No "stopped" where the cards around it have it | Choice | It says so when the card before it did (B-zw55w) |
| A hard card that never asks for the passkey | Answer | Hard cards are never practice |
| "Already built", an unchecked premise or a reply naming your earlier answer | Choice | Cards with them are never practice |
| A pick with no case, or a case that reads differently | Reveal | The agent's own case for it, written at filing (B-sy0kz); measured by the marks, made after each reveal |
| Background that argues for the other option | Reveal | Cards whose background speaks of the pick are never practice; the rest is measured by the blind test |
| A layout that differs from a real card's | Any | The same card component, nothing added; a browser test compares a practice card's shape, element by element, with a real card's at a desktop's size and on two phones |
| A count of cards that doesn't match what an agent said it filed | Any | The desk's count includes a practice card once it's in the queue. Notifications never count one |
| "Sent to claude-code" after you answer | After | Never said of a practice card: once it's answered, it says it was practice (section 4); during the test, every card says only that it's recorded (B-wcb9d) |

A tell at the reveal matters as much as one at the choice: coming round happens after the reveal, so a card you spot there measures nothing.

## 4. On the desk

**How often** (`draws()`, `RATE`, `GAP`). After each real answer, the next card is a practice card about 1 in 20 times (B-kb5yt), at random, not every twentieth; during the blind test about 1 in 4 (B-xx49m). Never the first card you see (it's drawn only after an answer), never the last (one comes only while a real card is still waiting after it), and at least five real cards apart, or one during the test. It may come ahead of a card an agent is waiting on, and says "stopped" when the card before it did (B-zw55w); it delays that card by the time it takes to answer (the median between answers was 48 seconds on 3 November).

**Answering it** is the same as any card: the reading time by rarity (`READ_FIRST_MS`), the blind choice, the reveal, the confirm, the undo window (`UNDO_MS`, through the same `Outbox`). "Why?", "Other answer", "Can't judge" and "Make this a rule" all look as they do on real cards; what you type or tick in them is never sent and never kept, only the kind of answer (`practiceAnswer()`).

**Once you've answered,** where a real card's toast would say "Sent to …", a practice card says it was practice: the toast, "That was practice. Recording it in…", then a notice (`practiceWords()`): that the card was rebuilt from one you answered on its date, that the pick shown was the option the agent didn't pick, that no agent was waiting on it if it said one had stopped (B-zw55w), that nothing went to an agent, and that what you wrote wasn't kept. On the path it's "practice: you chose …" (`practicePath()`), and reopened it says the same, with nothing to change. It stays out of the session's recap and out of the time spent per card (`addSpent()`), which describe real cards. During the blind test it says nothing until the test ends (section 7).

## 5. Where its answers live

Decided by B-rehdw: on the service, for every device.

- **Each answer is one entry** (`PracticeEntry`, a new format, kind `practice`, D156): the card it was rebuilt from and its revision, when that card was answered, the blind choice and the final answer's kind against the planted pick, when, which client, and whether it came in the blind test. The test's start and each guess in it are entries too: a guess names its card (for a practice card, the one it was rebuilt from) and says whether it was practice. Never what you typed. An entry is taken only through `practiceEntry()`, which both servers share, from the fields the client may send (`PRACTICE_FIELDS`).
- **On the relay,** in a table of the project's own object (`PracticeTable`), beside its retention and notification tables, not in the files of `SqlFileStorage` or its log. So it never reaches a machine through `Relay.log`, and it's not in `ApiState`, which a machine may read; writing one moves no version, announces nothing and counts nothing. Its address, `practice`, is for a signed-in browser only: a machine's token is refused, and so is any request carrying an Authorization header. The privacy page lists them, kept while the project exists, and they're deleted with it.
- **Locally,** without an account, in a folder of its own in the live layer (`LIVE_DIR`, `practice/`), written and read at `/api/practice` on `baesian serve` (`readPractice()`, `writePractice()`). Not one of the kinds the record copies, never uploaded when the repo is linked, and ignored by the server's watcher.

**Nothing reaches an agent.** `Store.inbox` and `baesian wait` read cards and verdicts; the MCP tools call the same store code; the plugin's hooks run `baesian inbox`; `baesian sync` writes only the kinds a relay's log may carry (`agentWritten()` for what goes up); the vault adapter writes notes from the record. None of them reads a practice answer, and a practice answer is never a verdict, so `VERDICT_FIELDS`, the gate, the slider proposals and the usage counts never see one (no usage event either: the counted list is fixed, B-7nq85). A test keeps every module an agent runs, the plugin's hooks, and the relay's log, uploads and counts from naming them.

An agent on the same machine could still read the live layer's files in a clone that isn't linked. That's no different from verdicts, and it learns nothing it could act on: practice answers say nothing about its cards.

## 6. The calibration panel

Under the rows (D180), a section for practice cards (`<PracticeSection />`): before the blind test, what it is and the way to start it; during it, how far it has come; after it, spotted, that practice cards are off; not spotted, their row (`<PracticeRow />`), faded until it has 10 answers, as a thin row is:

- **Its bar** (`practiceBar()`): practice cards you chose as the planted pick blind; those you chose against blind and then came round to; and those you kept against it.
- **Beside it, in a sentence** (`cameRound()`): "You came round to a planted pick on *a* of *b* practice cards where you chose otherwise blind, and to an agent's real pick on *c* of *d*." The real count is from cards practice could have come from (not hard, not Baesian's own, not answered in chat), settled by a choice after a blind choice against the agent's pick, so like is compared with like.
- Practice answers from the blind test are left out, since you were looking for practice cards then.

B-kb5yt's reading: if you come round to planted picks about as often as to real ones, coming round says little about the agent. One caution is said beside it: a planted pick's case is weaker if agents argue their alternatives less well than their picks, so coming round to planted picks less often can mean weaker cases as well as better judgement.

## 7. The blind test

D83 and B-kb5yt: ten rebuilt cards among real ones, before practice cards ship, and you mark which you think were rebuilt.

- **Where it runs** (B-xx49m): in your deck as you work, about 1 in 4 cards until ten rebuilt cards have come.
- **You start it yourself,** from the calibration panel, once ten past cards can come back. You know it's on, so it tests whether practice cards can be spotted by someone looking for them: the strict case D71 needs. It runs once.
- **A guess about every card you answer,** but one answered in chat, which you'd know: once you've confirmed your answer, a card of its own (`<MarkCard />`) asks "Was that card rebuilt from a past one?", naming it, with No, Maybe and Sure, by a click, a tap or keys 1 to 3 (`MARKS`), before the next card comes (B-9prve). Your answer is already on its way: its undo window runs as usual, and Z takes the answer back, and the guess's card with it; nothing else skips it, Esc and the arrows included. The guess is kept as you give it (`markOf()`); if it can't be, the card says so and asks again. The next card's reading time starts once it's given. Real cards' answers go to their agents as usual. Every card's toast says only that it's recorded until the test ends (B-wcb9d).
- **What counts as spotted** (B-bb7ga, `resultOf()`): your marks beat guessing at 95%: a one-sided Fisher's exact test over every card in the test (`fisherP()`, `SPOTTED_P`), maybe and sure counted as marked, wrong marks counting against; marking ten of forty, five right. Every real card marked counts; the test's rebuilt cards are its first ten (`testMarks()`).
- **The result,** shown when the tenth is answered (`<PracticeResultPanel />`): whether practice cards were spotted, each practice card with your mark and how long before it its original was answered (B-j583c's check), and your marks on the real ones. **For the vault,** "Save the result as a note" gives a dated note for `Reviews/` (`resultNote()`), which you put there: B-rehdw keeps practice answers from everything that runs on your machine, `baesian sync` and the vault adapter included, so nothing there could write it. If spotted, practice cards never come (D71), and the code is to be removed; if not, they ship.

## 8. The order of building

1. **The answers to the six cards** (done, 2026-11-10).
2. **B-sy0kz's field** in the card format, the template, AGENTS.md's block and the skill (built), in the next release, so cards start carrying it. Practice waits for those cards to be answered and to age into the window.
3. **The builder and the rules for which cards come back,** pure and tested, in the client's model (built: `client/src/practice.ts`).
4. **Where answers live** (B-rehdw): the format, the local server's address, the relay's table and address, and the privacy page (built).
5. **The blind test in the client** (B-xx49m, B-bb7ga, B-9prve, B-wcb9d): starting it, the rate, the guesses, the held notices and the result (built).
6. **The blind test, run by the user.** If spotted, stop here and remove what steps 2 to 5 built.
7. **Shipping:** 1 in 20, the notice after answering, and the calibration panel's row (built behind step 6: none comes until the test has run and wasn't spotted).
8. **B-kb5yt's check,** a month later: the planted picks you came round to, against real ones.

**Deploying:** the service before a CLI that writes `alternative_rationale`: a relay that predates the field refuses cards carrying it. The client and the relay's practice address ship together, in the Worker; a client facing a relay without the address reads no practice answers and shows no practice cards.

## Decisions for the user

Filed on 2026-11-10 in deck calibration.

| Card | Topic | The question | Answer |
|---|---|---|---|
| B-sy0kz, "Where a planted pick's case comes from" | `calibration/practice-case` | A case the agent wrote for its alternative when it filed, or no case of its own? | A case the agent writes for its alternative |
| B-rehdw, "Where your practice answers are kept" (hard) | `calibration/practice-storage` | Kept by the service for every device, or only in the browser you gave them in? | On the service, for every device |
| B-j583c, "How old a card is when it comes back as practice" (hard) | `calibration/practice-sources` | Only cards answered 7 to 30 days ago, which the relay holds, or older cards it keeps longer for practice? | From a week to a month old |
| B-xx49m, "Where the blind test runs" | `calibration/practice-test` | Mixed into the cards you answer as you work, or one sitting among past cards shown as they were? | In your deck, as you work |
| B-bb7ga, "When practice cards count as spotted" | `calibration/practice-spotted` | Only if your marks beat guessing, or as soon as you're sure of one? | Only if your marks beat guessing |
| B-zw55w, "Whether a practice card says an agent has stopped" | `calibration/practice-waiting` | As the cards around it do, or never, since no agent waits on it? | As the cards around it do |
| B-9prve, "When the blind test asks for your mark" (hard; r2 says what the mark is) | `calibration/practice-test-mark` | As you answer, before you confirm, or on a card of its own once you've answered? | On a card of its own after each answer |
| B-wcb9d, "What the desk says of an answer in the blind test" (hard) | `calibration/practice-test-words` | Only that each answer is recorded, or that each was sent to its agent, a rebuilt card's too? | Only that it's recorded, on every card |

## What this changes in what B-kb5yt and D83 assumed

- **"Past cards" means the last month's on the website.** D83 assumed any resolved card could be rebuilt; the relay keeps an answered card's text only 30 days after delivery (R-1sxpy), and B-j583c kept it so.
- **Every card here was under two weeks old,** so recognising a card is the likeliest tell, and the blind test can't usefully run before cards have aged.
- **A swap gives the planted pick no case** of the agent's own, so B-sy0kz added one, written at filing; cards filed before it never come back.
- **Hard cards can't be practice,** because of the passkey, so practice cards measure deference on the rows that aren't hard: 101 of this repo's 171 cards on 2026-11-10.
- **"Stopped" is a live fact, and practice cards have no agent.** With agents waiting on whole decks, a practice card without it would stand out, so it borrows the card before it's (B-zw55w).
- **The comparison B-kb5yt draws can be confounded** by how well planted picks are argued (section 6).
