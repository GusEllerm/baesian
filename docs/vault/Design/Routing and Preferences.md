---
type: design
status: draft
authority: proposes
summary: "Proposal P14, not decided: per-repo preference sliders over the D11 facts with five positions, a deterministic rules gate at filing that the agent can only escalate, a new held status for cards the gate holds back, audit cards drawn from them and answered blind, slider proposals Baesian files itself, a shadow period first, the format changes v1 needs, and the decisions left to the user."
created: 2026-11-03
tags: [baesian, design]
---

# Routing and Preferences

> **Status: proposal P14 (2026-11-03). Nothing here is decided.** It was drafted overnight by an agent from the research in [[Preference Sliders and the Gate]]. Every recommendation below is the agent's, and each open choice is marked **decision** with its strongest alternative. Eight of them are drafted as decision cards in deck routing. Where P14 would revise a decision already made, it says so as a question.
>
> **Built (2026-11-03), as M8a, the backend, with the decisions in section 6:** the rows, scale and presets, the gate at filing and its record, held cards, the audit draw, the report, slider proposals and convention cards, the client's API, and the instructions ([[src-routing]], [[File Formats#Routing]]). Where it differs from the sections below, the decisions and [[Formats for v1]] hold: an agent's level no longer keeps a card from being held (B-chq61), so `baesian wait` answers a held card with "go ahead", exit 8, not 5; privacy is a row of its own (B-z3agk); a miss is a final answer that overturns the pick, or "you should have asked me" (B-87tkc); slider proposals count final answers on shown rows (B-y6jn6); the first preset comes from a setup survey (B-5na1k), the client's half, M8b. A card's `level` is the level in force, set by the gate at filing, as section 5 below has it.

This note turns D131 (preference sliders per repo) and D126 (audit and convention cards designed before v1) into one design. It covers the sliders, the gate that applies them, what happens to cards the gate holds back, audit cards and convention cards, how preferences are first set and later changed, and the format changes needed before v1 (D108). The evidence behind each choice is in [[Preference Sliders and the Gate]]; this note cites it as "the synthesis", and doesn't repeat it.

## The proposal in brief

- **A slider per row, five positions.** Rows are the kinds of decision the D11 facts name. Each row is set to one of five positions, from "let the agent decide" to "never without me".
- **The gate is rules, run at filing.** In v1 it reads only a card's stated facts, its `reverse` and its `level`, and the repo's preferences. It's deterministic, so the CLI, the hosted relay and `baesian verify` all reach the same answer, offline included.
- **The agent may only escalate.** It still states the facts, and it can raise a card's level. It can't lower a card below the repo's settings, and nothing lowers the hard floors.
- **Held-back cards get a new status, held.** The agent proceeds as on a provisional card. You can open and answer any held card at any time.
- **Audit cards are held cards drawn at random.** They come back into your queue as ordinary cards, answered blind first. They measure how often the gate holds back something you'd have chosen differently on.
- **Baesian proposes slider moves itself,** as cards, from your audits and answers. It never moves a slider on its own.
- **Every repo starts as today, in shadow.** With no preference file, nothing is held back. The gate records what it would have held, and you answer everything, so the shadow period measures exactly what holding back would have cost you.

## What stays as decided

P14 keeps these as they are:
- **D11's facts and filing rule:** agents file when an impact fact holds or reversal would break something. (Decision 4 asks whether to widen this.)
- **D42's levels and hard defaults:** spending money, security or privacy, deleting or overwriting stored data, and publishing are hard by default.
- **D32 and D62:** only the client resolves. The gate never writes a verdict.
- **D86 and D88 on every card that isn't an audit:** the agent's pick stays hidden until you choose, and both choices are recorded.
- **D127:** the repo owns its decisions; the relay holds what's waiting. Preferences are the repo's too.
- **D131:** one set of sliders per repo or project, not per person.
- **D16, D109, D110 and D119** on rules.
- **D108:** formats are free to change until v1, so everything here can land before it.

P14 would revise three decisions if the user agrees, each asked as a decision below:
- **D31,** if held cards may merge without an answer (decision 5);
- **D86,** for audit cards only, if they're answered blind (decision 6);
- **D11,** only if agents are to file every decision (decision 4; not recommended for v1).

It also changes one behaviour of the code that no decision states. Today `Store.fileCard` applies `HARD_BY_DEFAULT` only when the agent sets no `level`, so an agent can file a security card as provisional. Under P14 a floor always wins (decisions 2 and 7).

## 1. The sliders

### The rows

A row is a kind of decision you'd recognise, named by its consequence in the client, and keyed by its fact in the file. A card with several facts takes the strictest row it falls in (strictest wins, as in every permission system the synthesis looked at).

| Row, as the client names it | Fact | Detected by the commit gate today | Default (the "Today" preset) | Floor |
|---|---|---|---|---|
| Public interfaces and module boundaries | `public-api` | `api:` (opt-in, breaking changes only) | tell me but carry on | none |
| Data formats | `schema` | schema and migration paths | tell me but carry on | none |
| Runtime dependencies | `dependency` | packages added or removed (`dependencyFacts()`) | tell me but carry on | none |
| Delivery and infrastructure | `infra` | CI, infra and deploy paths | tell me but carry on | none |
| Product behaviour | `user-facing` | none | tell me but carry on | none |
| Security | `security` | none | never without me (D42) | decision 7 |
| Privacy | `privacy` | none | never without me (D42) | decision 7; its own fact and row since card B-z3agk |
| Spending | `money` | none | never without me | fixed |
| Destroying data | `data-loss` | none | never without me | fixed |
| Publishing | `publishes` | none | never without me | fixed |
| Anything else that's hard to undo | none (filed because reversal would break something) | none | tell me but carry on | none |

That's six sliders and three fixed rows. Under D11, a filed card with no fact is one whose reversal would break something, so the last row defaults to being shown.

**Not rows in v1:** tooling and conventions, local implementation, and dependency updates. None has a fact, and the dependency detector doesn't see version bumps or dev dependencies. Agents don't file them under D11, so a slider for them would have nothing to act on (decision 4).

**Research rows** (the synthesis's R1–R9) wait, as research does under D2. The file keys rows by name, so a research set can add rows later without changing the file's shape (decision 16).

**Decision 11, splitting `security` and privacy.** *Recommended:* keep one fact in v1, as D11's item reads ("touches security or privacy"). Under decision 7's recommendation both would have the same floor, and the merge gate already asks for an answer before anything ships. *Alternative:* split them now, since every source that covers both separates them, and GDPR asks for its assessment before processing. A split is a change to `Fact`, cheap before v1.

### The scale

| Position | In the file | What happens | Level when shown |
|---|---|---|---|
| Let the agent decide | agent-decides | held back; drawn for audit at a low rate | — |
| Check a sample afterwards | sample | held back; drawn for audit at a higher rate | — |
| Tell me but carry on | tell-me | shown; the agent proceeds | provisional |
| Stop and ask | stop-and-ask | shown; the agent waits while you're there | blocking |
| Never without me | never-without-me | shown; the agent never proceeds without your answer | hard |

The client shows each row as a five-stop segmented control, labelled with these words rather than numbers, on desktop and phone alike (D130). The synthesis's reasons: numbers imply the higher one is better, and continuous sliders lose answers.

**What moves a card off its row's position:**
- **A floor** always wins.
- **The agent's level** is a minimum. If the agent files a card as blocking on a row set to "tell me but carry on", it's blocking. If the agent asks for less than the row, the row wins.
- **Reversibility.** *Recommended (decision 12):* a card with `reverse: one-way` is never held back; it's shown at least at "tell me but carry on". Nothing else moves for reversibility, because the rows already carry the user's view of each kind. *Alternative:* the synthesis's symmetric rule, one stop stricter for one-way and one stop looser for cheap.
- **Rules.** A card an accepted rule answers isn't filed at all (D16), so the gate never sees it.

**Cards Baesian files itself** (conflict cards, rule drafts, the slider proposals below) always reach you. Only you can answer them.

## 2. The gate

### What runs it, and where

**Decision 3, what the gate runs on in v1.** *Recommended:* rules over each card's stated facts only. Rules are deterministic, free, need no vendor and no new dependency, and can be re-checked anywhere. No classifier has been shown to predict a person's verdicts on cards, and in Claude Code's auto mode a model stage cut false alarms but nearly tripled misses (the synthesis, section 5). The gate record keeps room for a model's score and threshold, so one can be added later behind its own card. *Alternative:* a cascade from v1, with a classifier such as Jev, or a Haiku-class model, scoring the cards the rules can't place. That adds nuance, sends card text to a vendor, and needs your labelled cards to set thresholds. Card routing-3.

**Decision 2, whether the filing agent may classify its own cards.** *Recommended:* no; it may only escalate. It keeps stating the facts the rules read, which is classification of a checkable kind, and it can raise a card's level. It can't decide that a card needn't reach you. *Alternative:* the agent classifies most kinds itself, as it chooses levels today, with independent checks only for security and privacy (D131 lists the agent as a possible gate; B2 leaves it open). Card routing-2.

**Where it runs.** Under the recommended rules gate:
1. `baesian file` runs it at filing, in the CLI, and the MCP server's file_card runs the same code. It writes the gate record beside the card, and prints the outcome to the agent.
2. In hosted mode, the relay runs it again when the card arrives. If the two answers differ, the card is shown, and the mismatch is reported.
3. `baesian verify` runs it again in CI, from the record and the preferences in force when the card was filed. A record that doesn't match fails, like an uncovered fact.

The gate needs only the card's facts, `reverse` and `level`, not its text. So it doesn't need the service to read card text. Whether the service may read card text at all, and so where a model gate could run, is the hosted service's decision H1 ([[Hosted Service]]), not this note's.

### How a position becomes an outcome

In v1 the mapping is direct, B4's "named tiers over facts":
1. Find the strictest row the card's facts fall in, or "anything else".
2. Apply the floors, the one-way rule and the agent's level, in that order, each only raising the outcome.
3. If the result is "tell me but carry on" or higher, the card is shown at that level.
4. If it's one of the two lowest positions, the card is held, and drawn for audit with that position's probability.

**The draw** is computed from the card's ID and revision, so the relay and `baesian verify` can recompute it, and the agent can't choose it: the store picks the ID. An agent could withdraw and re-file a card to redraw, but withdrawals are recorded and the filing check (D36, D38) flags the duplicate.

**Decision 10, the audit rates.** *Recommended starting values:* 1 in 10 at "let the agent decide" and 1 in 3 at "check a sample", with the first 10 held cards of every row all drawn. A nonzero rate at the lowest position keeps every held card's miss rate estimable. The burn-in starts strict and loosens with evidence, as Meta's RADAR did. At 1 in 3, a row reaches the 29 clean audits that bound its miss rate below 10% after about 87 held cards, which at one repo's volume is weeks. These are guesses to tune while dogfooding. *Alternative:* a fixed audit budget, say five a week across all rows, spread by stratum, so audits never grow with filing volume.

**With a classifier, later,** a position would set a tolerated miss rate or an attention budget instead of a fixed outcome (the synthesis, section 5). None of that is in v1.

### How it fails

The gate fails toward you.
- **No preference file:** the "Today" preset, in shadow. Nothing is held.
- **An invalid preference file:** the same, and `baesian file` and `baesian verify` say why.
- **The gate errors:** the card is shown at the level the agent asked for, or provisional.
- **Offline:** the CLI runs the same rules. Nothing about the gate needs the network.
- **The agent asks for a lower level than its row:** the row wins, and the gate record keeps what the agent asked for, so the report can show it.
- **The agent leaves out a fact:** the commit gate already catches the detectable kinds. Under D53 a `Baesian-Card:` trailer covers only the detected facts in the card's `touches`, so a dependency on a held card that doesn't list `dependency` still needs its own card or ack. The report counts these mismatches per agent, which is also how dogfooding sees whether agents word cards to pass the gate.
- **The relay and the CLI disagree:** the card is shown (step 2 above).

### Shadow mode

Shadow is the gate's mode before it's enforced. It runs, writes its record marked shadow, and holds nothing back. Every card still reaches you, blind as always (D86).

That makes the shadow period the cheapest measurement there is. For every card the gate would have held, you've already answered it blind, so the report can say exactly how often holding back would have hidden a card you chose against the agent on. It's a full count, not a sample. **Decision 1** asks whether to hold cards back at all. *Recommended:* yes, after a shadow period. *Alternative:* sliders only sort and batch the queue, and nothing is ever held back. Card routing-1.

## 3. Held cards, audit cards and convention cards

### Held cards

A held card is filed, recorded and committed like any other. The agent proceeds on its pick, as on a provisional card: it cites the card with `Baesian-Card:` and the ledger records what builds on it. `baesian wait` on a held card returns at once, as "no verdict yet" (exit 5), so agents need no new exit code.

The client keeps a "Held back" list. You can open any held card and answer it, which resolves it like any other card. That keeps "let the agent decide" at Sheridan's level 8, "informs the human only if asked", rather than out of sight.

**Decision 5, held cards at merge.** D31 requires every card a branch cites to be resolved or deferred before merge. *Recommended:* add a computed status, held, which the merge gate (`checkMerge()`) accepts. The gate record is the reason it's accepted, not a verdict, so D32's "only the client resolves" holds: nothing has been resolved. This revises D31. *Alternative:* D31 unchanged; held cards stay out of the live queue but must be answered or deferred before merge, so holding back saves interruptions but not answers. Card routing-5.

### Audit cards

An audit card is a held card the draw picked. It isn't a new card or file: the held card itself enters your queue, marked as an audit.
- **In the queue:** spaced out among other cards, never in a run, because people miss the rare bad item in a stream that's mostly fine. It ranks below blocking cards and stopped agents.
- **What it shows. Decision 6.** *Recommended:* you choose first, blind, as on any card, then see the agent's pick and "Already built", and decide whether to overturn. Both answers are kept, as D88 keeps a switch. The blind choice measures whether you'd have chosen differently; the second answer decides whether it's worth undoing now. This revises D86 for audit cards, which today shows their option and "Already built" first, as facts. *Alternative:* D86 as it stands. Card routing-6.
- **What an answer does:** keeping the agent's pick resolves the card. Overturning it resolves it to the alternative and sends a rework brief from the ledger, as an overturned provisional decision does (D15, D81). An overturn also makes Baesian propose tightening the row (below).
- **"You should have asked me"** is a new toggle on audit cards, for a decision you'd have wanted to see whatever you'd have chosen.
- **Unanswered audits** never count as fine. The report shows them separately.

**Decision 9, what counts as a miss.** *Recommended:* an audit where your blind choice differs from the agent's pick, or where you mark "you should have asked me". Both say the row was set too loose, and the report shows them apart. *Alternative:* only a different blind choice, which every audit measures, without depending on you to volunteer the second.

**Decision 4, what feeds the gate and the audits.** D126 describes audit cards as a sample of the agent's own easy-to-undo calls. Under D11 those calls aren't cards: they're a one-line reason, or a `Baesian-Ack:` trailer at the commit gate, with no options to audit. *Recommended for v1:* agents keep filing as D11 says, and audits draw only from held cards, which have real options. Two-way doors stay logged and unaudited until the after-the-fact reviewer ([[Baesian Design#Where cards come from]]) can write cards for them. *Alternative:* agents file a card for every decision, including two-way doors, so the gate can hold back, raise or audit any kind. That revises D11, multiplies what agents write, and grows the record. Card routing-4.

### The report

The client shows the gate's record per row, beside the calibration panel (D91):
- cards shown and held, and in shadow, would have held;
- audits drawn, answered and unanswered;
- misses, with an upper bound: with no misses in n audits, the rate is under about 3 in n, at 95% confidence;
- for shown rows, how often your blind choice matched the agent's pick;
- cards whose stated facts missed something the commit gate detected, by agent.

A per-row interval stays as wide as it is. Pooled figures go first.

### Convention cards for routing

Baesian files a "move this slider?" card itself, from the record, with no model, as it files conflict cards. You accept or decline; accepting writes a new preference file through the client. Baesian never moves a slider.
- **Tighten:** after any miss on a row, Baesian proposes moving it one stop up. The card is provisional.
- **Loosen:** after 29 answers in a row without a miss on a row's position (audits for held rows; blind choices matching the agent for shown rows), Baesian proposes moving it one stop down. Loosening is hard, because it lets more decisions past you.
- **Each card shows its effect on recent history:** "At this setting, last month you'd have seen 12 of 40 dependency cards. You chose against the agent on 0 of the 29 audited."

**Rules** stay as D16, D109 and D110 have them. Decisions decided the same way again and again are better made into rules than held back, because a hidden repeat leaves the rule unmade. Mined rule proposals, D16's second route, are still to come and are outside P14.

### The loop

1. You set or accept a preset; the gate runs in shadow.
2. Agents file as D11 says; the gate shows or holds each card, and records why.
3. You answer what reaches you; the agent proceeds on what's held.
4. Audits bring a sample of held cards back, blind.
5. The report counts misses per row.
6. Baesian proposes slider moves from that count, and rules from repeats.
7. You accept or decline them, and the next cards route by the new settings.

## 4. Setting preferences, and changing them

**Decision 13, how a repo starts.** *Recommended:* with no preference file, a repo runs the "Today" preset in shadow, which routes exactly as Baesian does now. After about 20 answered cards, the client offers to set up the sliders:
1. it shows up to five of your own answered cards and asks of each, "Would you have been fine not seeing this one?";
2. it suggests the preset that fits your answers;
3. it shows what that preset would have done to your recent cards, from the shadow record;
4. you switch it on, adjust single rows, or stay in shadow.

The reasons, from the synthesis: people make up preferences when asked in the abstract, defaults decide most settings, and a few questions assigning a preset beat a blank grid. With no cards yet, there's nothing honest to ask about. *Alternative:* the questions at `baesian init`, with made-up example cards, and enforcement from the start.

**Decision 14, the presets.** Starting proposals, to be tested on this repo's shadow record:

| Row | Today | Fewer interruptions | Hands-off |
|---|---|---|---|
| Public interfaces | tell me | tell me | sample |
| Data formats | tell me | tell me | sample |
| Runtime dependencies | tell me | sample | agent decides |
| Delivery and infrastructure | tell me | sample | sample |
| Product behaviour | tell me | tell me | sample |
| Anything else | tell me | sample | agent decides |
| Security | never | never | never |
| Privacy | never | never | never |

No preset lowers security; that takes a deliberate move by you.

**Changing preferences later.**
- **In the client:** you can move any row at any time. A move you make yourself needs no card, because it's you.
- **By Baesian's proposals:** the convention cards above.
- **A review prompt:** after about 50 answers, the client suggests looking at the report and the settings again, as people's oversight changes with experience.

**Decision 7, how low security may go.** *Recommended:* security and privacy stay "never without me" by default (D42), and a repo may lower them as far as "tell me but carry on", never into held. Spending, destroying data and publishing stay fixed at "never without me". The reason: a provisional security card still needs your answer before merge (D31), which is where the sources put security's hard stop, while the other three are one-way once done. *Alternative:* all four fixed, as today's defaults, with no slider. Card routing-7.

**Decision 15, several reviewers.** *Recommended:* one set per repo in v1 (D131). Personal, strictest-wins additions (anyone may ask to see more) wait until a repo has more than one reviewer. *Alternative:* build the personal layer now, since the hosted service will have teams.

**Where preferences live. Decision 8.** *Recommended:* in the repo, as immutable files that only the client writes, in the live layer (so a change applies at once in every worktree, as rules do) and the record. They're never in the committed config.json, which agents edit. In hosted mode each file carries the service's signature, checked by `baesian verify`, the pattern the hosted research proposes for verdicts. Locally it rests on D62's convention and audit trail, like verdicts. *Alternative:* the hosted service is the authority, settings change only in a signed-in session, and the repo keeps a signed copy for offline use. Card routing-8.

## 5. Format changes before v1

All of these are candidates, under [[File Formats]]' rules: immutable files, flat keys, status computed. Each would be described in File Formats and defined in `src/schema.ts` once decided.

### The preference file (new)

One file per change, at preferences/{at}-{suffix}.json in both layers, named timestamp first like verdicts (D107). The latest is in force; the rest are the history.

| Field | Holds |
|---|---|
| type | preferences |
| row_public_api, row_schema, row_dependency, row_infra, row_user_facing, row_security, row_other | one of the five positions; a missing key means the "Today" preset's value |
| mode | shadow or enforce |
| profile | the preset it started from, if any |
| rate_agent_decides, rate_sample | the audit draw probabilities |
| burn_in | how many of each row's first held cards are all drawn |
| from_card | the slider proposal it came from, if any |
| reason | optional, the person's note |
| by, client, at | who changed it, which client wrote it (D62), when |

row_security is refused below "tell me but carry on" (decision 7). Spending, destroying data and publishing have no key. `Config` doesn't change.

### The gate record (new)

One file per card revision, at cards/{id}/gate-r{n}-{suffix}.json in both layers, as the fallback file sits beside its card. It's stored rather than computed, because the draw and the preferences it applied must be fixed when the card is filed.

| Field | Holds |
|---|---|
| card, revision | the card it gated |
| outcome | shown or held |
| level | the level, when shown |
| row, position | the row it fell in and that row's position |
| reason | what set the outcome: row, floor, one-way, agent, no-preferences or error |
| agent_level | the level the agent asked for, if any |
| preferences | the preference file it applied, by name |
| mode | shadow or enforce |
| drawn, p | whether it was drawn for audit, and the probability |
| gate | the gate's version, such as rules-1 |
| by | cli or relay |
| at | when |
| model, score, threshold | reserved for a classifier; absent in v1 |

### Card and status changes

- **`level` on a draft becomes a minimum.** `CardMeta`'s `level` stays the level in force, now set by the gate at filing rather than by the `HARD_BY_DEFAULT` step in `Store.fileCard`.
- **A new computed status, held,** in `Status`: a card with an enforced gate record that says held and no verdict. It isn't pending, so it doesn't sit in your queue unless it's drawn. `checkMerge()` accepts it, if decision 5 goes that way.
- **An audit is a held card with drawn set.** It needs no new card field.
- **No change to `touches`,** unless decision 11 splits privacy.
- **A slider proposal** is a card Baesian files, carrying three new flat fields: pref_row, pref_from and pref_to, the row and the move. Its evidence goes in the card's `crux_fact`, so you see it before choosing.

### Verdict changes

- **should_have_asked,** a new optional boolean on `Verdict`, set only on audits.
- **`first_choice` on audits** is the blind choice, if decision 6 goes that way. `Response` doesn't change: accepting keeps the agent's pick, choosing the alternative overturns it.

### Interfaces that change

- **The local server** (D96) gains an endpoint to write a preference file, beside `/api/verdicts`.
- **`baesian file` and the MCP server's file_card** print the gate's outcome: shown at a level, or held.
- **The `AGENTS.md` block** says that a card's level is a minimum, that a held card means "proceed, as provisional", and that agents never write preference files.

### Not needed before v1

A classifier's fields beyond the reserved three; research rows and fields (D2); a novelty fact and a release-stage setting (decision 17); per-person preferences (decision 15).

## 6. Decisions for the user

The first eight are filed as cards in deck `routing` (2026-11-03, overnight), in the order they're best answered. Whether the hosted service may read card text, which bears on where a model gate could run, is covered by the hosted service's design ([[Hosted Service]], decision H1), not here.

| # | Question | Recommended | Strongest alternative | Card |
|---|---|---|---|---|
| 1 | Hold some cards back, or only sort? | hold back, after shadow | sort and batch only | B-0pfbf |
| 2 | May the filing agent classify its own cards? | no; it may only escalate | yes, for most kinds | B-vf0w2 |
| 3 | Rules only in v1, or a classifier too? | rules only, model slot reserved | rules plus a classifier from v1 | B-jqqa1 |
| 4 | What feeds the gate and the audits? | D11's filing, audits from held cards | file every decision (revises D11) | B-j991c |
| 5 | May held cards merge unanswered? | yes, a held status (revises D31) | answer held cards before merge | B-9rycs |
| 6 | Are audit cards answered blind? | blind first, then what's built (revises D86) | D86 as it stands | B-wcbec |
| 7 | How low may security go? | as far as "tell me but carry on" | fixed at "never without me" | B-pn3g1 |
| 8 | Where do preferences live? | immutable files the client writes, signed when hosted | the service holds them | B-refpb |
| 9 | What counts as a miss? | a different blind choice, or "should have asked" | a different blind choice only | B-87tkc |
| 10 | The audit rates | 1 in 10 and 1 in 3, first 10 per row drawn | a fixed weekly audit budget | B-fgc4y |
| 11 | Split privacy from security? | not in v1 | split now | B-z3agk |
| 12 | What reversibility does | one-way is never held | one stop either way | B-yebnn |
| 13 | How a repo starts | "Today" in shadow; questions after about 20 cards | questions at init, enforced at once | B-5na1k |
| 14 | The presets | the table in section 4 | tuned from this repo's shadow record first | B-wwxa3 |
| 15 | Several reviewers | one set per repo in v1 | a personal strictest-wins layer now | B-93n77 |
| 16 | Research rows in v1's formats? | no; rows are keyed by name, so they can be added | reserve them now | settled: a later row is a format 2 (D156) |
| 17 | Novelty and release stage | not in v1: under D112 nearly every card is the first on its topic | add both now | release stage: B-v7h6m; novelty settled by D145 |

**Answered on 2026-11-03, all eight as recommended:** 1 as D148, 2 as D144, 3 as D145, 4 as D149, 5 as D150, 6 as D151, 7 as D146, 8 as D147. Items 9 to 17 are still open.

Item 17's reason is the agent's reading: since D112 makes a topic name one question, "the first card on this topic" is true of almost every card, so novelty would need another definition, such as the first card in a topic's area.

**Carded on 2026-11-03 for M8, beyond the table:** whether an agent's level keeps a card from being held (**B-chq61**: under D144 a level is a minimum, and agents filed 30 of this repo's first 56 cards as blocking, so the looser presets would hold almost nothing), and whether Baesian files slider proposals in v1 (**B-y6jn6**: the loosening trigger can't fire at this repo's rate of blind agreement).

**Since this note was written, later decisions changed:** an agent can no longer file a security card as provisional (D144, built); the service can read card text (D137), so the "open" questions on encryption here are closed; in a hosted repo only the relay's signed gate record holds a card back, with the relay's own draw (D158), and a preference change that lets more cards past you takes your passkey: a row moved toward held, enforcing turned on (D163), or a lower audit rate or burn-in (B-shndb); section 5's formats are replaced by [[Formats for v1]] (P16): every row is required, files carry `format` and `replaces`, and `level` stays the level the agent asked for, raised by floors; and a gate error can't show a security card below hard (D144, D146). Two problems with the design as drafted: under "Today" the shadow record never shows a card as would-have-held, so what a looser preset would hold has to come from re-running the rules over past cards; and P16's claim that verify can recheck the draw from the card and the preference file alone fails for the burn-in (a row's first 10 held cards all drawn), which depends on earlier held cards across branches. Where the sections above disagree with those, the decisions hold. Both problems are handled in M8a: the client is shown what a preset would have held by re-running the rules over past cards (`replay()`), and each gate record keeps the count of its row's earlier held cards that the gate saw (`held_before`), which verify's recheck uses instead of recounting ([[src-verify]]).

## 7. Open questions

- **Overturns after merge.** An audit can overturn a decision after its branch has merged. Today a rework brief goes to the branch's agents (D81). Where it goes once the branch is gone isn't settled.
- **Encryption.** Whether the service may read the cards it relays is decision H1 in [[Hosted Service]]. A rules gate doesn't need card text; a model gate on the relay would, so decision 3 depends on H1's answer if it ever goes the classifier's way.
- **Agents seeing their draws.** The gate record is in the live layer, so an agent can see whether its card was drawn. Whether that changes how agents work is unmeasured.
- **The measurements dogfooding needs:** the shadow record per row; how often stated facts miss what the commit gate detects; and, before any classifier, the comparison of rules, Jev, a Haiku-class model and a local classifier on the user's own labelled cards (the synthesis, section 9).
