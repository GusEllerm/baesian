---
type: research
status: active
authority: reference
summary: "How to orient a reviewer to judge one agent decision in seconds: a synthesis of four research lenses (theory, analogous review tools, spatial and visual orientation, overseeing AI agents). Gives convergent findings, principles for Baesian, tensions, proposed changes, and three extreme concepts for round 3."
created: 2026-10-23
updated: 2026-10-23
reviewed: 2026-10-23
tags: [baesian, research, client, design]
---

# Contextualising Decisions

Provenance: this is the main agent's synthesis of four parallel research reports (2026-10-23), each of which searched and read sources for one lens. The sources, with their read status, are in [[Contextualising Decisions - Sources]]. Vendor figures and abstract-only claims are marked there; nothing here was tested on Baesian's users.

**The question.** How do you orient someone, in seconds, so they can judge one item well within a large and changing body of work? It was raised by the user's feedback on round 2 ([[2026-10-23 Client Mockups]]): context should "enable understanding", not just be present.

## The short answer

1. **Our spine is the minimum, not the answer.** Furnas's degree-of-interest model says the smallest useful context is the item's lineage to the root, and that's exactly the current five-level spine. Beyond it, context should be *chosen*, not listed.
2. **Choose context by whether it could change the verdict.** In decision theory, information that can't change the action is worth nothing (Horvitz & Barry). Surprise means beliefs moved, not that something was rare (Itti & Baldi).
   - Context that only restates the agent's proposal carries no surprise.
   - A sibling decision that contradicts this one, or a dependency already reversed, is worth the most.
3. **Show what happens next, not counts.** Situation awareness has three levels, and the third, projection, is what experts act on (Endsley). "Reject → rework 2 commits in 3 files; unblocks 1 other decision" beats "2 commits".
4. **The main failure isn't missing context. It's rubber-stamping.**
   - People accept 93–97% of agent permission prompts, yet in a planted test they blocked only 13.6% of dangerous commands [vendor].
   - Rare errors are missed far more often: 30% at 1% prevalence, against 7% at 50%.
   - Warnings stop registering after the second exposure.
   - The default direction wins: brain-scan raters wrongly passed images, and the Uber contractor eventually accepted a push prompt.

   Fast swiping makes this worse unless friction is tiered.
5. **Explanations persuade more than they inform.** Explanations and fluent, long rationales raise acceptance whether or not the proposal is right (Bansal et al.; Steyvers et al.). The card should help the reviewer *verify*, not persuade them.
6. **One hierarchy can't carry it.** The "where", "why" and "what follows" are different relations: part of a whole, means to an end, and cause to effect. Typed links (the abstraction hierarchy, C4's labelled lines, Gerrit's typed relation tabs) model them honestly. That also answers the robustness worry: a decision that serves two pieces of work breaks a tree, but fits a typed graph.

## Where the lenses converge

| Finding | Theory | Tools | Spatial | AI oversight |
|---|---|---|---|---|
| Lineage is the minimum; select the rest by degree of interest | Furnas | — | Furnas; Lam & Munzner | — |
| Context that would change the verdict first | Horvitz & Barry; Itti & Baldi | "what instigated the change" (code review); "why you're seeing this" (PagerDuty, Prodigy) | van Ham & Perer: show the context around one node | the claim that would sink it, plus where to check |
| Projection, not counts | Endsley L3 | "changing direction is easier than stopping" (Bates) | consequence fan; outcome preview | "Accept → …; Reject → …" |
| Missing context flips verdicts | — | 5% of labels flip without the parent post; abusive labels fall from 18% to 10% with context | — | — |
| More explanation, more blind acceptance | Bansal; data–frame: "spoon-feeding… counterproductive" | automation bias (Goddard) | — | Bansal; Steyvers; Vasconcelos |
| Rubber-stamping and habituation | — | alert overrides of 49–96%; −30% per repeat; braindr's pass bias | — | 93–97% accepted; 13.6% caught; polymorphic warnings |
| Tier friction by severity and reversibility | — | tiered alerts complied with 29% against 10%, and 100% against 34% for the most severe | — | blast radius × reversibility × blocking |
| Typed relations, not one list | abstraction hierarchy | Gerrit's typed tabs; ADR supersedes and amends | C4 labelled lines; no vague "uses" | — |
| A stable layout; animate only transitions | Heer & Robertson; Robertson 2008 | — | fixed coordinates; about 1 s staged moves; no hairball over 20 nodes | — |
| Name the decision type, for recognition | Klein's recognition-primed decisions; Endsley | Huggle: history compressed into one number | scented marks | consequence-type visual forms |
| "Can't judge" is a signal | sensemaking residue | STiki Pass; Prodigy's ambiguous Ignore | — | a routed reason; track the rate |
| Interrupt at breakpoints | — | interruptive alerts get noticed but slow work; passive ones go unseen | — | Iqbal & Horvitz; mid-task warnings ignored by 74–87% |

## Principles for Baesian

- **Lineage, plus what's interesting.** Keep the spine. Add a sibling or dependency only when its interest outweighs its distance. It's interesting when it's open, irreversible, in conflict, or changed since you last looked. Never show everything.
- **Rank context by value of information,** and keep it within about four chunks (working memory). A branch name scores near zero; a contradicting sibling scores high.
- **Projection is the lead after the question.** Show what each answer sets in motion: rework, what it unblocks, and which agents carry on.
- **Help verify, don't persuade.** Lead with three things:
  - the **trigger**: what made the agent ask (a failing test, a commit, a requirement), and whether it's blocked or asking opportunistically;
  - the **claim that would sink the decision** if false;
  - **where to check it.**

  Keep the agent's rationale to about 25 words, in a hedged first-person voice.
- **Contrast, with a flip condition.** "Server-sent events rather than WebSockets, because…; WebSockets wins if…". The strongest alternative gets equal visual weight, and rejecting can mean "take the alternative" (changing direction beats stopping).
- **Typed relations.** *Where* is a badge (area and topic). *Why* is a sentence (goal → work → decision). *What follows* is consequences. *Needs* is dependencies. *Conflicts with* is conflicts. Each has a fixed slot that disappears when empty (Gerrit). The absence of a slot is information too.
- **Recognisable decision types.** Use a small fixed set of types derived from fields, for example "reversible local default", "one-way interface", "first of its kind in client/security". Pair each with your own closest past verdict as a reference case.
- **Tier friction, don't make it uniform:**
  - low-tier decisions are batched, reviewed after the fact, or turned into rules;
  - high-tier decisions get a forcing function, used on about 10% of cards or fewer, since people dislike them;
  - accept must never be the easiest gesture on a high-tier card.
- **A stable map; motion only for change.** Fixed coordinates across visits; a staged move of about 1 s between cards; animate what changed since your last visit. The view where you judge stays static. Tapered edges, with time running left to right.
- **Interrupt at breakpoints:** a commit, a test run finishing, the agent's turn ending. Never interrupt while you're typing. A blocking card shows the cost of waiting ("agent idle 6 min"), and escalates only past a threshold.
- **Close the loop on reasoning.** Show occasionally, "you accepted this; it was reversed because…". Treat "can't judge" reasons, and cards that fit no area, as residue: the topic tree should split or merge in response.

## Tensions to keep in view

- **Speed against scrutiny.** Speed is the reason for swiping. But giving people 25 s per decision instead of 10 s raised how often they disagreed with *wrong* AI advice from 48% to 67%. Resolution: tiering. Most cards stay fast; a few get deliberately slower.
- **Filtering against narrowing.** Selective context helps, but filtering narrows attention (Endsley). Always keep a faint global overview.
- **Forcing functions work, and people hate them.** Use them sparingly, only where they're worth it, and let the tier decide.
- **Calibration can backfire.** A mirror of your own agreement rate rewards shared bias, and one-sided calibration backfired for under-confident users. Calibrate against *outcomes* (reverted, re-decided, canaries caught), and show both over-reliance and under-reliance.
- **The reviewer is usually the requester.** Copilot bars the requester from approving its own agent's pull request, but Baesian can't: you're both. Don't present a swipe as equivalent to an independent code review.

## Changes this suggests to decided things (for the user)

These are proposals; each needs a decision card.
- **Card format (P12):** add `trigger` and `sinks_if` (the claim that would sink it, and where to check it); cap the rationale at about 25 words; make the strongest alternative contrastive with a flip condition. Revises D12's shape.
- **Typed relations instead of one chain:** where, why, what follows, needs, conflicts with. Refines D65.
- **Friction tiers from blast radius × reversibility × blocking,** computed from the ledger and the facts. They sit alongside D42's levels: levels say whether the agent may proceed; tiers say how carefully *you* answer.
- **Reject means "take the strongest alternative"** when there is one. Refines D13.
- **Notifications at breakpoints,** not on filing. Refines D40.
- **"Changed since you last looked"** as a first-class state, which needs per-reviewer seen-markers.

## Three extreme concepts for round 3

Each is a deliberate extreme, to learn from rather than ship as-is. They combine: B's card can live inside A's map, and C's preview can drive either.

**A. The Atlas.** The whole project is one stable map with semantic zoom: areas are columns, pieces of work are lanes, and decisions sit along each lane in time order. The card is the deepest zoom level.
- Moving to the next card is a single staged move of about 1 s, up to the shared ancestor, across, and down.
- Holding Space zooms out one level.
- Answered cards leave stamped footprints where they sat, so the map becomes a record of what's been reviewed.
- Consequences sit to the right and dependencies to the left, so swiping right moves toward what you keep (Levine's alignment, applied to the gesture).
- Answers "graph of the work" and "where am I", without ever re-laying-out.

**B. The one-cue card.** The card shows the question, both options, the projection, and exactly *one* piece of context: the item with the highest value of information for this decision. A faint overview stays visible at the edge.
- On high-tier cards the two options are **unlabelled**: you swipe toward one, and only then see which the agent chose (human first).
- It's the minimalist extreme; what's learned is which single cue matters.
- Risk: filtering narrows attention. The faint overview is the counterweight.

**C. Consequence preview.** The drag itself previews the outcome on the map of the work.
- Drag 30% toward reject, and the commits downstream desaturate and get hatched as "rework"; the agent's idle time ticks on a blocking card.
- Drag toward accept, and the decisions that depended on it light up as unblocked.
- Release commits the answer; letting go short restores the map.
- Projection, the third level of situation awareness, made tangible, and the drag stops being a reflex.

**An oversight layer, for any concept.** Options to choose from:
- tiered friction with variable dwell time;
- human-first unlabelled options on high-tier cards;
- **canary cards**: opt-in and disclosed, they mutate a past decision to measure catch rate, like airport threat-image projection;
- a calibration mirror tied to outcomes;
- a distinct visual form per consequence type, against habituation;
- interruptions timed to breakpoints.

## Gaps

- **What's unverified:**
  - vendor telemetry (Anthropic, Cognition, GitHub);
  - several sources were read as abstracts only;
  - there's no primary research on tech-tree interfaces, or on reading git history graphs;
  - outcome previews like C are untested anywhere we found.
- **The value-of-information ranking needs a model of the reviewer.** Early on it has to start from rules (contradictions, reversals and changes first), and learn from the swipe log later. Learning it means randomly withholding context on low-stakes cards, which needs the user's agreement.
