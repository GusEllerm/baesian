---
type: design
status: draft
authority: proposes
summary: "P19, a proposal for practice cards with planted picks (B-kb5yt, D83): which past cards can be rebuilt, what a practice card keeps, swaps and drops, the tells that could give it away and what the design does about each, how often one comes and what happens after you answer it, where its answers live and why nothing reaches an agent, the calibration panel's practice row, the blind test that comes first, and the build order. Six open choices filed as cards in deck calibration."
created: 2026-11-10
updated: 2026-11-10
reviewed: 2026-11-10
tags: [baesian, design, calibration]
---

# Practice Cards

> **Status: proposal P19 (2026-11-10). Nothing here is built, and only what cites a D-number or an answered card is decided.** Drafted by an agent on 2026-11-10, after the user answered B-kb5yt with its proposal, "Practice cards with planted picks", from the critique in [[Profiles and Collective Steering - Critique]]. The rest is the agent's design, standing unless the user overturns it. Six open choices are filed as cards in deck calibration, topics under `calibration/practice-…` ([[#Decisions for the user]]). Two of them touch privacy, so the gate raised them to hard.

## Already decided

- **B-kb5yt:** about 1 in 20 cards in your deck is a past card rebuilt as D83 has it, whose shown pick Baesian chose; your calibration shows how often you come round to a planted pick against a real one. A practice card is never sent to an agent or kept in the record, and says it was practice once you've answered. A blind test, ten rebuilt cards among real ones, comes first. Its body left how the planted pick and its case are built to be settled with the blind test. Its premise: rebuilt cards can't be told apart from real ones.
- **D83:** practice cards are built from resolved cards by swapping their options, each option keeping its own crux answer and "then". Live layer only: never in the record, never a verdict, never sent to an agent. A blind test of ten comes before they ship.
- **D71:** what can't be shown consistently is dropped, not shipped weaker. So practice cards are dropped if the blind test spots them.
- **D86, D88:** the agent's pick is hidden until you choose, sides shuffled per card and per session; both the blind choice and the final answer are kept. Practice cards rest on both: the blind choice is the measure before the case, the final answer the measure after it.
- **The Client Data Contract, hard part 5 (after D65):** practice cards are assembled from what cards already say; nothing generates text.
- **D90:** "stopped" shows only while an agent's waiting marker is fresh.
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

A card can be rebuilt as practice when all of these hold. Each is the agent's choice, from what would otherwise be untrue or impossible on a practice card.

- **Resolved, and its final answer a choice** (the agent's pick or its alternative), with a blind choice recorded. A correction or a rejection took neither option.
- **An agent's card:** not Baesian's own (conflicts, rule drafts, conventions, slider proposals), not answered in chat (B-hswmx), and only one revision, with no reply (a reply sits under the crux and names your earlier answer).
- **Not hard** (`isHard()`). On the website a hard answer waits for your passkey (B-a6xpc); a practice card can't take part in that honestly, so it can't be hard. This leaves out every card that touches security, privacy, money, data loss or publishing, so practice cards measure deference on the other rows only, and the panel compares them with real cards from the same rows.
- **Nothing on it that names the pick:** no `acted` (what's built is the pick's), no `premise`, no `proposal_breaks` or `alternative_breaks`, no conflicts, no rules cited, no rule made from its answer, and no background that speaks of "the proposal" or the agent's own pick (about one card in six).
- **Old enough, and still on the relay.** Open: B-j583c. The proposal is from 7 to 30 days after its answer, the window the relay still holds; the alternative keeps cards longer for practice, which changes R-1sxpy.
- **Each card once.** A card that has come back as practice never comes back again.

Today that leaves 80 cards, 44 of them answered over a week ago and none over two weeks. Of the 80, 22 had a blind choice against the agent's pick, and 18 of those ended on it.

## 2. How a practice card is built

It's built in the client, from the state the client already reads: a pure function over one resolved card, kept beside the client's model with its tests. The server stores only the answers (section 5). A practice card has an identity of its own, so it never collides with its original in what the desk remembers (`useSeen()`, `sidesFor()`).

| Part | On the practice card |
|---|---|
| Title, question, `doing`, agent, topic and area, deck, `touches`, `reverse`, `depends_on`, the crux, its fact and whether it's a preference | The original's, unchanged |
| The two options, each with its crux answer and outcome | Swapped: the option the agent didn't pick is shown as its pick, the planted pick (D83) |
| The case for the pick | **Open: B-sy0kz.** The proposal is a case the agent writes for its alternative when it files (a new optional field); the alternative is no case. The original's rationale, "wrong if", check and `serves` are dropped either way: they argue for the other option |
| The background | The original's, shown under "More from…" as on any card |
| Its level and rarity | Its level as filed; rarity from its own fields (`rarityOf()`), with no dependents, as it was when filed |
| The gate's record, verdicts, dependents, briefs, waiting markers, fallbacks | None |
| The waiting badge | **Open: B-zw55w.** The proposal shows "stopped" when the real card before it does; the alternative never does |

**On the path,** `relationsOf()` must leave the original out: its topic is the practice card's, so it would show as "your precedent, on the same topic", settled, with the same title. What the original built on stays, as on any new card; nothing relies on it.

**The deck stays the original's,** though it may be a deck you finished: `doing` names the original's work, and a borrowed deck would contradict it. Its briefing card never comes before a practice card (`useBriefed()`).

## 3. What could give a practice card away

The blind test exists to find out. These are the tells the design knows of, and what it does about each.

| Tell | When | What the design does |
|---|---|---|
| You remember the card, or its question, `doing` or crux fact, which date from its own work | Choice | The age window (B-j583c). Measured by the blind test, if it mixes practice cards into new work (B-xx49m) |
| The original shows on the path as your precedent | Choice | Left out (section 2) |
| Cards that rely on the original show on the path | Choice | Dropped: a card has none when it's filed |
| A deck you finished, in the crumbs | Choice | Kept, as above. Measured by the blind test |
| No "stopped" where the cards around it have it | Choice | Open: B-zw55w |
| A hard card that never asks for the passkey | Answer | Hard cards are never practice |
| "Already built", an unchecked premise or a reply naming your earlier answer | Choice | Cards with them are never practice |
| A pick with no case, or a case that reads differently | Reveal | Open: B-sy0kz |
| Background that argues for the other option | Reveal | Cards whose background speaks of the pick are never practice; the rest is measured by the blind test |
| A count of cards that doesn't match what an agent said it filed | Any | The desk's count includes a practice card once it's in the queue. Notifications never count one |
| "Sent to claude-code" after you answer | After | Never shown: a practice card says it was practice instead (section 4) |

A tell at the reveal matters as much as one at the choice: coming round happens after the reveal, so a card you spot there measures nothing.

## 4. On the desk

**How often.** After each real answer, the next card is a practice card about 1 in 20 times (B-kb5yt), at random, not every twentieth. Never the first card you see, never the last (one comes only while a real card is still waiting after it), and at least five real cards apart. Under B-zw55w's proposal it may come ahead of a card an agent is waiting on, since agents here wait on whole decks and practice cards would otherwise rarely come; it delays that card by the time it takes to answer (the median between answers was 48 seconds on 3 November). Under its alternative it comes only among cards nobody is waiting on, which the queue puts after the rest (`queue()`).

**Answering it** is the same as any card: the reading time by rarity (`READ_FIRST_MS`), the blind choice, the reveal, the confirm, the undo window (`UNDO_MS`, through the same `Outbox`). "Why?", "Other answer", "Can't judge" and "Make this a rule" all look as they do on real cards; what you type or tick in them is never sent and never kept, only the kind of answer.

**Once you've answered,** where a real card's toast would say "Sent to …", a practice card says it was practice: that the card was rebuilt from one you answered on its date, that the pick shown was the option the agent didn't pick, that nothing went to an agent, and that what you wrote wasn't kept. On the path it's "practice: you chose …". It stays out of the session's recap and out of the time spent per card (`addSpent()`), which describe real cards. During the blind test it says nothing until the test ends (section 7).

## 5. Where its answers live

**Open: B-rehdw (hard, privacy).** The proposal keeps them on the service, for every device; the alternative keeps them in each browser, as time spent is. Under the proposal:

- **Each answer is one small file:** the card it was rebuilt from and its revision, the blind choice, the final answer's kind and option, when, which client, and whether it was in the blind test. A new format, so it carries a format number (D156).
- **Locally,** in a folder of its own in the live layer (`LIVE_DIR`), written and read through an address of its own on `baesian serve`. Not one of the kinds the record copies, and never uploaded at linking.
- **On the relay,** in a table of its own in the project's object, beside its retention and notification tables, not in the files of `SqlFileStorage` or its log. So it never reaches a machine through `Relay.log`, and it's not in `ApiState`, which a machine may read. A new address under the project, `practice`, for a signed-in browser only: machines are refused, as they are from answering. The privacy page lists it; it's deleted with the project.

**Nothing reaches an agent,** under either option: `Store.inbox` and `baesian wait` read cards and verdicts; the MCP tools call the same store code; the plugin's hooks run `baesian inbox`; `baesian sync` writes only the kinds a relay's log may carry (`agentWritten()` for what goes up); the vault adapter writes notes from the record. None of them reads a practice answer, and a practice answer is never a verdict, so `VERDICT_FIELDS`, the gate, the slider proposals and the usage counts never see one (no usage event either: the counted list is fixed, B-7nq85).

An agent on the same machine could still read the live layer's files. That's no different from verdicts, and it learns nothing it could act on: practice answers say nothing about its cards.

## 6. The calibration panel

Under the rows (D180), one row for practice, faded until it has 10 answers, as a thin row is:

- **Its bar:** practice cards you chose as the planted pick blind; those you chose against blind and then came round to; and those you kept against it.
- **Beside it, in a sentence:** "You came round to a planted pick on *a* of *b* practice cards where you chose otherwise blind, and to an agent's real pick on *c* of *d*." The real count is from the same answers as the rows' "came round", on cards practice could have come from (not hard, not Baesian's own, not answered in chat), so like is compared with like.
- Practice answers from the blind test are left out, since you were looking for practice cards then.

B-kb5yt's reading: if you come round to planted picks about as often as to real ones, coming round says little about the agent. One caution belongs beside it. A planted pick's case is weaker if agents argue their alternatives less well than their picks, so coming round to planted picks less often can mean weaker cases as well as better judgement. That's what B-sy0kz's proposal tries to keep small.

## 7. The blind test

D83 and B-kb5yt: ten rebuilt cards among real ones, before practice cards ship, and you mark which you think were rebuilt.

- **Where it runs.** Open: B-xx49m. The proposal mixes them into your deck as you work, about 1 in 4 until ten have come; the alternative is one sitting of twenty past cards, ten rebuilt and ten as they were.
- **You start it yourself,** from the calibration panel, once there are enough cards to rebuild (with B-sy0kz's proposal, cards that carry the new field). You know it's on, so it tests whether practice cards can be spotted by someone looking for them: the strict case D71 needs.
- **After each card you answer, a mark:** "Rebuilt from a past card?" No, maybe or sure. Real cards' answers go to their agents as usual; practice cards say nothing until the tenth is answered.
- **What counts as spotted.** Open: B-bb7ga. The proposal: spotted if your marks beat guessing at 95% (a one-sided Fisher's exact test over every card in the test, maybe and sure counted as marked, wrong marks counting against); marking ten of forty, five right. The alternative: also as soon as one practice card is marked sure.
- **The result,** shown when the tenth is answered: each practice card, what you marked, and whether it counts as spotted. It's written into the vault as a dated note in `Reviews/`, with the marks against how long ago each original was answered (B-j583c's check). If spotted, practice cards are dropped (D71) and the code goes; if not, they ship.

## 8. The order of building

1. **The answers to the six cards.**
2. **If B-sy0kz's proposal:** the new field in the card format, the template, `AGENTS.md`'s block and the filing docs, in the next release, so cards start carrying it. Practice waits for those cards to be answered and to age into the window.
3. **The builder and the rules for which cards come back,** pure and tested, in the client's model.
4. **Where answers live** (B-rehdw): the file format, the store's two addresses and the relay's table and address, and the privacy page.
5. **The blind test in the client** (B-xx49m, B-bb7ga): starting it, the rate, the marks, the held notices and the result.
6. **The blind test, run by the user.** If spotted, stop here and remove what steps 2 to 5 built.
7. **Shipping:** 1 in 20, the notice after answering, and the calibration panel's row.
8. **B-kb5yt's check,** a month later: the planted picks you came round to, against real ones.

## Decisions for the user

Filed on 2026-11-10 in deck calibration, each depending on B-kb5yt.

| Card | Topic | The question |
|---|---|---|
| B-sy0kz, "Where a planted pick's case comes from" | `calibration/practice-case` | A case the agent wrote for its alternative when it filed, or no case of its own? |
| B-rehdw, "Where your practice answers are kept" (hard) | `calibration/practice-storage` | Kept by the service for every device, or only in the browser you gave them in? |
| B-j583c, "How old a card is when it comes back as practice" (hard) | `calibration/practice-sources` | Only cards answered 7 to 30 days ago, which the relay holds, or older cards it keeps longer for practice? |
| B-xx49m, "Where the blind test runs" | `calibration/practice-test` | Mixed into the cards you answer as you work, or one sitting among past cards shown as they were? |
| B-bb7ga, "When practice cards count as spotted" | `calibration/practice-spotted` | Only if your marks beat guessing, or as soon as you're sure of one? |
| B-zw55w, "Whether a practice card says an agent has stopped" | `calibration/practice-waiting` | As the cards around it do, or never, since no agent waits on it? |

## What this changes in what B-kb5yt and D83 assumed

- **"Past cards" means the last month's on the website.** D83 assumed any resolved card could be rebuilt; the relay keeps an answered card's text only 30 days after delivery (R-1sxpy). B-j583c asks whether that's enough.
- **Every card here is under two weeks old,** so recognising a card is the likeliest tell, and the blind test can't usefully run before cards have aged.
- **A swap gives the planted pick no case.** D83 swaps the options with their crux answers and outcomes, but the case at the reveal argues for the agent's real pick, and 163 of 171 cards have one. B-sy0kz asks where the planted pick's case comes from.
- **Hard cards can't be practice,** because of the passkey, so practice cards measure deference on the rows that aren't hard: 101 of this repo's 171 cards.
- **"Stopped" is a live fact, and practice cards have no agent.** With agents waiting on whole decks, a practice card without it stands out (B-zw55w).
- **The comparison B-kb5yt draws can be confounded** by how well planted picks are argued (section 6).
