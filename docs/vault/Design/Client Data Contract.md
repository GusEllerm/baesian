---
type: design
status: draft
authority: specifies
summary: "What the client may show and where each piece comes from: every element of the round 4 prototype mapped to its source in the store (exists, a new card field, or a new subsystem) and how far it can be trusted; the hard problems the backend must solve; and the rule that anything we can't show reliably is dropped (D71). Proposed for M4a; the new fields are part of P12. The user decided all ten of its open questions in a dry run of the round 5 prototype (D77–D85, D90)."
created: 2026-10-23
updated: 2026-11-03
reviewed: 2026-10-23
tags: [baesian, design, client, m4]
---

# Client Data Contract

Provenance: written by the agent on 2026-10-23. It compares the round 4 prototype (`design/explorations/round4/`, [[2026-10-23 Client Mockups]]) with the store as it stands after M3 ([[src-store]]). The user asked for this note and for the hard parts to be kept in view, and set the rule in the next section. Everything marked **new** below is a proposal: the fields are part of P12, and the rest go to the user as decision cards (see the last section).

## The rule: show only what we can stand behind (D71)

The user's principle: if a feature can't be shown consistently, or it keeps misleading or confusing people, drop it rather than ship a weaker version of it. A missing panel costs a little context. A panel that is sometimes wrong teaches people to distrust the whole screen, and the cards it gets wrong are the consequential ones.

So every element below has a standing:

| Standing | Meaning | How the client words it |
|---|---|---|
| **Reliable** | Computed from records Baesian writes or checks itself | As fact |
| **Declared** | The agent states it on the card, and Baesian can only check that it's present | As the agent's claim, in the agent's voice or with its name |
| **Partial** | A lower bound from records that can miss things | Only as what is known ("2 commits cite this card"), never as the whole |
| **At risk** | No reliable source yet | Not shown in M4a. Revisit only with a way to measure it |

## The card

| Element | Source | Standing |
|---|---|---|
| Rarity, and the sentence saying why | Computed from `touches`, `level`, `conflict_of`, dependents (cards whose `depends_on` names this one), and a **new** `reverse` field: cheap, moderate or one-way. Never from `confidence` or any claim of importance (D11) | Reliable, except reversibility, which is Declared. If commit counts are dropped (hard part 1), rarity stops using them |
| The trigger: what the agent was doing, and whether it stopped | **New** `trigger` field | Declared, in the agent's voice |
| "Waiting for you" | `level` is blocking or hard, and no `Fallback` has been recorded. **New (D90):** a waiting marker that `baesian wait` refreshes | Reliable while the marker is fresh; once it's stale, the card says the agent stopped waiting (hard part 4) |
| What filing requires | The trigger, the question, two options with a name and a `then` each, and the crux. `wrong_if` and its check only when a facet asks (D77) | Reliable: checked at filing |
| The question | **New** `question` field, always worded neutrally. `title` becomes a neutral short name too ("Where the access token lives"). A settled decision is then shown as title plus outcome | Declared |
| Two options, each with "Better if" and "Then" | `proposal` and `alternatives` exist as plain strings. **New:** each option gets `better_if` and `then` | Declared |
| The agent's case: rationale, "wrong if", where to check | **New** `rationale`, `wrong_if` and `check` fields. Today the body's "Strongest alternative" section (D12) holds part of this | Declared |
| The one cue most likely to change your answer | Ranked by fixed rules from structured candidates: a related rule, a dependency that changed since you last looked, a precedent pointing the other way, an open or deferred dependency. The agent may add a key question (**new** `ask`) | The ranking is Reliable, and each input has its own standing. "Changed since you last looked" needs a log of what you've seen (**new**, client-local) |
| Decide first: the agent's pick, its case and the reasoning link hidden on every card until you choose, with the sides shuffled (D86) | Client only | Reliable |
| The tiers: wait, confirm, hold | Client only, from the computed rarity | Reliable |

## What this builds on (the left panel)

| Element | Source | Standing |
|---|---|---|
| "builds on" | `depends_on`. `CardMeta` checks only the IDs' format: filing doesn't check that the cards exist | Reliable once `Store.fileCard` rejects unknown IDs, a small fix for M4a |
| "disagrees" (conflict cards) | `conflict_of`, written by the filing check and the merge gate (D35) | Reliable |
| "may conflict with your rule" | Nothing links a card to a rule today. `RuleMeta` has `covers` (gate fact globs) and `topic`. **Decided (D79):** agents cite the rule in a **new** `rules` field; a rule matched only by canonical topic shows as "a rule on the same topic". A retired rule shows as "retired rule", with nothing to break, and isn't matched by topic (D119) | Cited: Declared. Topic match: Reliable, worded only as "on the same topic" |
| "your precedent" | The nearest resolved decision on the same canonical topic (`Store.canonicalTopic`), or with a similar title (`jaccard`, `nearTopics`) | Partial. Say which: "on the same topic" or "similar title" |

## What your answer changes (the right panel)

| Element | Source | Standing |
|---|---|---|
| The agent: stopped, or carrying on | `source_agent`, `level`, `Store.attachments` for other agents waiting, `Store.fallbacks` for "carried on without you" | Reliable about what was declared and recorded. Liveness comes from the waiting marker (D90) |
| Commits built on it, and their fates ("stay" or "reworked") | `Store.ledger`: one entry per commit carrying a `Baesian-Card` trailer | **Dropped in M4a (D78).** It counts only commits that cite the card (hard part 1). The card shows the agent's "Then" instead, as its claim |
| Dependent decisions, and their fates | Cards whose `depends_on` names this one | Reliable, list and fates both. `Store.status` withdraws dependents when the parent is rejected (D14), and returns them, with a brief, when the parent's alternative or the reviewer's own answer is chosen (D80, built in M4 step 3), so the client can say "returned to their agents". The prototype's "re-decided" is still not what happens |
| Effects outside the repo ("Bookmarks and Tailscale links") | **New** `outside` field, with a fate per option | Declared |

## The queue, the pile, the breadcrumb and the map

| Element | Source | Standing |
|---|---|---|
| Area | The first segment of the canonical `topic`. D66 makes `topic` required | Reliable once D66 lands |
| Work | `deck` (`DeckMeta`), by default one per branch | Reliable |
| Order within a work | `created` | Reliable |
| Settled decisions, rules, deferred | `Store.status`, `Store.decision`, `Store.rules` | Reliable |
| "An agent's own call" (audit samples) | Audit cards sample decisions agents made without a card (D11). Nothing records those decisions yet | **At risk**: show only audit cards that exist, as cards |
| New cards arriving, counts | The live layer, watched by the local server with Node's recursive watching and a 30-second rescan (D84) | Reliable, if the watching is (hard part 4) |
| Presence | `Presence`, written by `Store.touchPresence` | Reliable |

## Answering

| Element | Source | Standing |
|---|---|---|
| ← and → | `Verdict` with `Response` `accept`, or `alternative` with `choice` set to the option's name | Reliable |
| ↑ Write: ask a question, suggest a correction, reject with a reason | `question`, `correction` and `reject` | Reliable |
| ↓ Can't judge: more context, outside my expertise, need to see it run | `need_context` and `not_my_area`. **"I need to see it run" gets its own `Response` (D85),** a P12 change | Reliable |
| Undo for 5 seconds | The client holds the verdict before `Store.addVerdict`. **Decided (D82):** the undo stays, and if the window closes inside the 5 seconds the verdict is sent | Reliable |
| Change your answer | A later `Verdict` on the same revision wins in `Store.status`, so the store already supports it. The agent may already have acted (hard part 3) | Reliable in the store. The protocol is new: **a rework brief (D81)** |
| Which client wrote a verdict | **New** field on `Verdict` (D62) | Reliable |
| Disagreeing: an optional one-line reason, and switching to the agent's pick after the reveal (D87, D88) | The reason is the `Verdict` comment. **New:** the verdict records the option chosen before the reveal (P12) | Reliable |
| The agent's one reply to a disagreement (D89) | **Built (D104):** a revision carrying `reply`, filed by `baesian reply` | Declared |
| "Retire this rule", when the option you choose breaks one of your rules (D119) | **Built:** the verdict's `retire_rules`; `Store.addVerdict` writes a `RuleRetirement` beside each rule, and `Store.rules` returns it with the rule | Reliable |

## Routing and preferences (M8b)

What the client shows of the gate ([[Routing and Preferences]], [[src-routing]]), and where it comes from. All of it is computed from records Baesian writes, so all of it is Reliable; the one estimate, the audits a setting would bring back, isn't shown.

| Element | Source | Standing |
|---|---|---|
| The "Held back" list, and audits in the queue | Each card's `status` (`held`) and `audit`, from its gate record (`ApiCard.gate`) | Reliable |
| Why a held card was held back: its row and that row's setting | The gate record's `row`, `position` and `mode`, shown only once you've chosen (D151) | Reliable |
| What's built, on a held card | The agent's `acted`, as on any card, shown only once you've chosen | Declared |
| "You should have asked me" | `should_have_asked` on the verdict, offered only where the gate record says held | Reliable |
| Your preferences, the presets, and which rows are fixed or have a floor | `routing` in the state (`ApiRouting`), and `GET /api/presets` (`ApiPresets`) | Reliable |
| What a preset, or your draft, would have held of past cards | The rules re-run over past cards (`replay()`), on the server for the presets and in the client for a draft | Reliable: the same rules the gate runs. The audits it would have drawn are an expectation, so they're not shown |
| The record row by row: shown, held, would-have-held, audits, misses and the bound | `routing.report` (`RoutingReport`) | Reliable. The bound is a statistical upper bound, and says so ("under about 1 in 9") |
| A slider proposal's evidence | Its `crux_fact`, which Baesian writes from the record, with card IDs turned into titles | Reliable |
| The setup survey's example decisions | `GET /api/presets` (`survey`), example cards, not your own | Reliable: they're labelled as examples |

Saving preferences sends a change over the file in force (`POST /api/preferences` with `replaces`); a stale one is refused, and the client says so rather than retrying.

## Practice cards and calibration

| Element | Source | Standing |
|---|---|---|
| Practice cards | **New (D83).** Built from resolved cards by swapping the options and reusing each option's crux answer and "then". Stored in the live layer only: never a `Verdict`, never in the record, never seen by an agent | Reliable if built from structured fields, and only if a blind test can't tell them apart (hard part 5) |
| Time spent by rarity | **New** client-local log of how long each card was on screen | Reliable |
| Practice cards caught | **New** private practice log | Reliable |
| Accepted decisions later reversed | A resolved card that is later superseded (`supersedes`, or a conflict card's `conflict_of`). Commits reverted by git, if the ledger matches them | Partial: say "superseded", not "wrong" |
| "Agents worked around your rejections" | No reliable source. Similarity between new cards and rejected ones guesses too much | **At risk**: drop |
| "Overturned decisions that held up" | Supersession chains where a decision was overturned and the original returned | Partial, and rare. Show only with a count behind it |

## The hard parts

These are the parts of the backend where the client's honesty is decided. Each one has a way to make it reliable, and a fallback under D71: drop it.

1. **Consequences are only as honest as the ledger.** A commit is linked to a card only if it carries `Baesian-Card: <id>`. An agent that builds on a decision without citing it is invisible, so the panel would say "2 commits stay" when there were five. That's the most misleading failure there is, and it lands on the consequential cards.
   - **To make it reliable:** measure, while dogfooding, how many commits on a branch cite a card compared with how many touch the same files as commits that do. Only show counts if citation is close to complete.
   - **Otherwise:** drop the commit count and its fates from the client, and keep the agent's own "Then" text, worded as the agent's. This is the user's own example for D71. The ledger stays for the gate and rework briefs, where a missing entry costs a brief, not trust.
   - **Decided (D78):** dropped from the client in M4a. The citation audit decides whether it comes back.
2. **Relations the screen shows but nothing records.** These are "may conflict with your rule", "changed since you last looked" and effects outside the repo. D65 rules out a model inferring them, so each one is either declared on the card, or matched structurally (by topic) and worded only as strongly as that match allows. For rules, the agent declares them (D79).
3. **Answers that change after an agent has acted.** The 5-second undo is easy. "Change your answer" after the agent has resumed is a protocol: the new verdict wins in `Store.status`, `Store.inbox` delivers it, and the gate already blocks building on a rejected card. What's missing is what the agent does with work it built on the old answer. **Decided (D81):** a rework brief listing the commits that cite the card, as for a lost conflict (D35). It inherits hard part 1: a brief can miss work that didn't cite the card.
4. **Concurrency and liveness.**
   - **Writers:** many agents write into the live layer from different worktrees while the server watches it and the client writes verdicts. Write-once files with an exclusive create keep this safe, but the server's view must tolerate files appearing half-written. **Built in M4 step 4:** the server reads through `Store.view`, which reports a half-written file and reads it again on the next change. A test with four agents writing at once passes.
   - **Watching:** `fs.watch` has been unreliable on macOS for nested folders; that may be out of date for Node 22, and nobody has checked. **Decided (D84):** Node's recursive watching with a 30-second rescan, no new dependency. The premise was tested on 2026-10-24 and holds: no misses in 40,000 files on macOS and Linux, with limits the rescan covers ([[Implementation Plan#Notes from M4]]).
   - **Liveness:** "stopped until you answer" is what the agent declared, not what it's doing. A wait that times out (after 9 minutes) or finds the reviewer away already records a fallback, so the gap is an agent killed mid-wait: its card shows "stopped" forever and stays at the front of the queue. A waiting marker written by `baesian wait`, with a heartbeat like the client's, would make it true, and stale when the agent dies. **Decided (D90):** the waiting marker, stale after 90 seconds, as presence is.
5. **Practice cards without a model.** They have to read as fluently as real cards without anything generating text (D65). They only work if cards carry both options' "Better if" and "Then", so a swapped card can be assembled from the agent's own words. That's a reason to adopt the per-option fields. If assembled cards read badly in dogfooding, drop practice cards rather than ship detectable ones. **Decided (D83):** built from past cards, after a blind test.
6. **Card quality.** The screen is only as good as what agents write in the new fields. Validation can require the fields and bound their length. It can't make "Then" lines symmetric or "wrong if" falsifiable; the template and the agent instructions carry that. `baesian file` can warn about the common failures: a missing alternative, a "Then" that says the work is already done, a non-neutral question.
7. **"Take the alternative" leaves dependents in place.** Found while writing this note. Dependents of a card are withdrawn only when it's rejected (D14). When the reviewer chooses the alternative, cards built assuming the proposal stay open as if nothing changed. Either the store flags them (for example, as returned, with a brief), or the client stops promising "re-decided". Under D71, the client says nothing about their fate until the store does something. **Decided (D80), and built in M4 step 3:** the store returns them, with a brief.

## Decisions this note needs

The user answered these as decision cards in a dry run of the round 5 prototype, on 2026-10-24 (the Decision Log has each one in full):

1. **The card format additions (P12):** `trigger`, a neutral `question` and `title`, per-option `better_if` and `then`, `rationale`, `wrong_if` and `check`, `reverse`, `ask`, `outside`, and `topic` required (D66).
   *Updated by D73–D75 ([[Minimal Card Content]]):*
   - the trigger is a short `doing` line shown on the card;
   - each option's `better_if` is replaced by one shared `crux`: a question, which answer leads to which option, and whether it's a preference, plus an optional fact bearing on it;
   - three trial facets add `premise` (the claim and its check), `acted` (the agent's work, compared with the trace) and `serves` (the criterion the pick serves);
   - filing rejects a card without a trigger, without two real options, or whose crux doesn't discriminate.

   **Decided (D77):** filing requires the trigger, the question, the two options with their `then`, and the crux. `wrong_if` and its check are required only when a facet asks (hard to undo, security, an unchecked premise). The rationale is optional.
2. **Commits built on a decision:** left out of the client in M4a (D78).
3. **Rules beside a card:** agents cite them; a topic match is shown only as "a rule on the same topic" (D79).
4. **What choosing the alternative does to dependents:** they're returned to their agents, with a brief (D80).
5. **Changing an answer after the agent has acted:** the new verdict comes with a rework brief (D81).
6. **Undo when the window closes:** the undo stays, and the verdict is sent (D82, which revises D67).
7. **A waiting marker for `baesian wait`,** so "stopped" can be checked: yes, with a heartbeat (D90). The first card came back as "I need more context". The revised card added what it lacked: timeouts are already recorded, so only a killed agent leaves "stopped" showing.
8. **Practice cards:** built from past cards and kept in the live layer, after a blind test (D83).
9. **Watching the live layer:** Node's recursive watching with a rescan, once its premise is tested (D84).
10. **"I need to see it run":** a new `Response` (D85).

Dropped under D71 until they have a reliable source: the "worked around your rejections" calibration line, and "an agent's own call" on the map.
