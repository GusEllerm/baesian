---
type: module
status: active
authority: describes
summary: "src/routing.ts, src/report.ts and src/proposals.ts (M8): the gate's rules at filing over each card's stated facts and the repo's preferences, held cards and the audit draw, what a preset would have held, the report per row with misses as card B-87tkc counts them, slider proposals (B-y6jn6) and convention cards (D161)."
created: 2026-11-03
updated: 2026-11-03
reviewed: 2026-11-03
tags: [baesian, module, routing]
---

# The gate's routing (M8)

The design is [[Routing and Preferences]] (P14) and [[Formats for v1]] sections 2 to 6 (P16), as D144–D151, D156–D163 and the routing cards decided them. The store runs the rules at filing and writes their record ([[src-store]]); the merge gate rechecks it ([[src-verify]]); the server gives the client the preferences, the presets and the report ([[src-server]]). The formats are in [[File Formats#Routing]].

## src/routing.ts: the rules (rules-1)

Pure and deterministic, with no runtime import and nothing from Node, so the CLI, `baesian verify`, a relay later (D158) and the client reach the same answer. The client can import it.

- **Rows and positions.** `ROWS` are the eight a repo sets (six sliders, `security` and `privacy`), keyed `row_<name>` in a preference file; `FIXED_ROWS` (`publishes`, `money`, `data_loss`) are always "never without me" (D146). `ROW_OF_FACT` maps each D11 fact to its row; a card with none falls in `other`. `POSITIONS` run from `agent-decides` to `never-without-me`; `LEVEL_AT` gives the level a shown card gets at each of the top three. `ROW_FLOOR` keeps security and privacy at "tell me but carry on" or above. `ROW_NAMES` and `POSITION_NAMES` are what the client calls them.
- **Presets** (B-wwxa3): `PRESETS` holds "Today", "Fewer interruptions" and "Hands-off", from P14 section 4's table, with security and privacy at "never without me" in all three. `AUDIT_DEFAULTS` are 1 in 10, 1 in 3 and a burn-in of 10 (B-fgc4y). `TODAY` is "Today" in shadow: with no preference file the gate applies it, and it routes exactly as Baesian did before the gate.
- **`rowOf()`** finds the strictest row a card's facts fall in, and its position. A tie goes to the fixed rows, then security and privacy.
- **`route()`** is the rule (D145). From the row's position it raises, each only raising: a row's floor; one-way, never held (B-yebnn); and a card Baesian files or a revision that follows an answer (`GateSource`), always shown. "Tell me but carry on" or higher shows the card at that position's level, raised by the level the agent asked for: a level is a minimum only when a card is shown (B-chq61). The two lowest hold it, whatever level it asked for, with its draw: the chance `p` at its position, the row's earlier held cards (`held_before`), whether that's within the burn-in, and `drawn`. Its `GateDecision` names what set the outcome (`GateReason`).
- **`levelInForce()`** is the level the card is written with: a shown card's level; a held card's provisional when enforcing, since its agent goes ahead with its pick; and in shadow, where nothing is held, the level asked for, or provisional.
- **Misses** (B-87tkc): `outcomeOf()` reads a card's verdicts. Its final answer is the latest choice, own answer or rejection (`FINAL`); a miss is a final answer that overturns the agent's pick (`OVERTURNS`), or any answer marked `should_have_asked`. A blind choice against the pick that the final answer kept is `switched`: reported, never counted.
- **`replay()`** re-runs the rules over past cards under any `Settings`, in filing order: per row, the cards it would have shown and held, the held ones that were misses, and the audits to expect. Under "Today" the shadow record never shows a card as would-have-held, so this is how a looser preset's effect is shown. `replayCardOf()` makes a past card from an `ApiCard`, so the client can replay a single row moved itself. `isOwnCard()` leaves Baesian's own cards out of it, and out of the report and the proposals.
- **The setup survey** (B-5na1k): `SURVEY` is six example decisions in card form, one per row the presets differ on, each asked `SURVEY_QUESTION`. `suggestPreset()` picks the preset whose rows agree with most answers, the stricter on a tie.
- **`stop()`** moves a row one stop, never past its floor or the ends.

The draw itself needs a hash, so it's in the store: `drawOf()` reads the first six bytes of a SHA-256 of the card's ID and revision as a number from 0 to 1. The store picks the ID, so an agent can't choose its draw.

## src/report.ts: the record per row

Computed from the record, never stored (P14 section 3).
- **`countedCards()`** puts each agent's card on its row: its latest revision's gate record, or, for a card filed before the gate, as "Today" showed it, in shadow. Baesian's own cards and withdrawn ones are left out.
- **`routingReport()`** gives a `RoutingReport`: per row and pooled, cards shown, held, and would-have-held in shadow; audits drawn, answered and unanswered (an unanswered audit never counts as fine); final answers, misses, switches, blind choices and how many matched the agent's pick; and with no misses, the bound, 3 in n.
- **`rowWindows()`** is each row's window: since it last moved (from the preference history) or Baesian last proposed moving it, the final answers at its position, its misses, and its streak since the last one. Answers on shadow would-have-held cards count, since they were all answered: the shadow period's full count.
- **`replayCards()`** turns the counted cards into the replay's input.

## src/proposals.ts: Baesian's own cards from the record

`afterVerdict` runs after the client records an answer, in the local server ([[src-server]]); M9's relay sync will run it when the CLI pulls one. Both kinds are filed through `Store.fileOwn`, with no model, as conflict cards are, and the gate always shows them.
- **Convention cards** (D161, P16 section 6): `proposeConvention` looks at the decision just resolved. A comment in `RULE_WORDS` ("always", "never", "from now on", "in general") files a card from it alone; otherwise, other resolved decisions in the same area (the canonical topic's first segment) whose chosen answers are alike, by the filing check's `SIMILAR_TITLE`, file one from all of them. A decision is evidence for one convention card at most, and none is found from Baesian's own cards, a decision already asked for a rule, or one a rule came from. The card has P16's fixed wording, `depends_on` the decisions, `convention` set, in the deck `CONVENTIONS_DECK`. A yes asks for a rule as the toggle does: `Store.ruleAsked` says so, and every branch's inbox offers it, since the evidence can span branches.
- **Slider proposals** (B-y6jn6): `proposeSliderMoves` reads each row's window. A miss on it proposes one stop up, as a provisional card; `LOOSEN_AFTER` (29) final answers in a row without one propose one stop down, as a hard card, since loosening lets more past you. Never past a row's floor, and not while a proposal on the row waits. The card carries `pref_row`, `pref_from` and `pref_to`; its evidence is in `crux_fact`: the miss that set it off and the row's misses at its stop ("1 in 1 final answer"), or the run of answers without one and its bound; and, for a move to a stop that holds cards back, what it would have held of the row's past cards. It's in the deck `PREFERENCES_DECK`. Accepting it writes the preference file (`Store.addVerdict`); a proposal the row has since moved past writes nothing.

## What it doesn't do

- **Rules come first.** A decision an accepted rule answers isn't filed (D16), so the gate never sees it; the commit gate still acknowledges what rules cover ([[src-gate]]).
- **No model** (D145): the record's model, score and threshold stay reserved.
- **Agents never write preferences** (D147): no CLI command and no MCP tool calls `Store.writePreferences`, and a test reads `src/mcp.ts` and `src/ops.ts` to keep it so.
- **Hosted repos (M9a):** only the relay's signed gate record holds a card back, with a draw from its signature (D158), and a preference change that lets more past you counts only with your passkey (D163): `loosening()` says what a change loosens, against the settings in force before it: a row moved toward held, enforcing turned on, or a lower audit rate or burn-in, which brings fewer held cards back to you (B-shndb). [[src-store#The hosted service's proof (M9a)]] applies both, and [[src-verify#In a hosted repo (M9a)]] rechecks them. The relay itself is M9b.

## Tests

`test/routing.test.ts`: the rules (that "Today" routes exactly as before over every combination of facts, levels and reversibility; the strictest row; held whatever the level; one-way, Baesian's and answers' cards shown; the draw and the burn-in; floors; presets; the survey; the replay), preference files (written once, stale changes refused, floors, the survey's answers, every branch's record, an unreadable file), the gate at filing (records, held, shadow, the burn-in across branches, revisions, replies, rule drafts, conflict cards, "you should have asked me", the rework brief), waiting on a held card through the store, the CLI and its JSON, and the merge gate's recheck. `test/proposals.test.ts`: the report, slider proposals up and down and accepted, convention cards of both signals and the inbox on another branch, and the server's preference, preset and state API. `test/mcp.test.ts` covers file_card and wait_for_verdict on a held card.
