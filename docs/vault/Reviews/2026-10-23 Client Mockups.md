---
type: review
status: active
authority: log
summary: "The client's visual direction (D64). Round 1: three static mockups, no winner. Round 2: an interactive prototype with four-way swipe and a context hierarchy. Round 3: the Atlas, the one-cue card and the consequence preview, with the oversight layer and card rarity. Round 4: a loop of independent reviews and revisions until a fresh reviewer judged the card view sufficient. Round 5: a subtractive pass, judged by a screenshots-only glance test, and the map re-scoped to the decision's neighbourhood."
created: 2026-10-23
updated: 2026-10-24
reviewed: 2026-10-23
tags: [baesian, review, design, client]
---

# 2026-10-23 Client Mockups

Provenance: the mockups were built by the agent. The ballot is the user's, at `design/votes/ballot-2026-10-23T22-33-08-341Z.json`. The interpretation below is the agent's, confirmed by the user's answers D65–D68.

## Round 1: three static directions

Built from the user's personal-website ballot (liked Provenance Trail and Open Vault; disliked "too simple" and "abstract"). The brief is `design/explorations/BRIEF.md`.

| Direction | Overall | Strongest marks | User's note, in short |
|---|---|---|---|
| Provenance: a manila tag, threads to its sources, stamps | 3 | typography, palette, layout 4; speed and provenance 2 | Likes the design. Needs the relationship between decision, feature and project, perhaps hierarchical: "contextualising is not just having information, but presenting it in a way that enables understanding." |
| Notebook: engineering pad, margin graph of the work | 3 | speed, provenance, polish, motion 4 | The graph "could really help position what kind of decision is being made in this moment". Worried about the information modelling it needs to stay consistent. The contents list needs work. |
| Signal: four-edge answer frame, very large question | 2 | motion 4 | "The worst", yet it's what "Tinder" means. It needs real swipe mechanics in four directions, perhaps a two-finger gesture, and animation that reinforces what's happening. |

**No winner.** The user's mix note: "We will need more dev around these ideas before moving forward."

## What it changed

- **D65:** context is a hierarchy, Project → Area → Work → Decision → Consequences, drawn only from structured data: the repo, the topic's first segment, the branch and deck, `depends_on`, the ledger. Nothing is inferred by a model, which answers the worry about robustness.
- **D66:** `topic` becomes required, so every decision has a place in the map.
- **D67:** on a hard card, a swipe must be held to confirm.
- **D68:** round 2 is one interactive prototype, not more static mockups.

## Round 2: one interactive prototype

`design/explorations/round2/index.html` combines:
- **Signal's interaction:** a four-way swipe by two-finger trackpad, drag, touch, or the arrow keys. It uses Motion 14.6, the client's library (D50).
- **Provenance's look:** the manila tag, Alegreya with Archivo, and the stamp, which fades in as you drag.
- **A hierarchy panel:** a plain-language sentence placing the decision, then the five levels, with sibling marks at the Area and Work levels.
- **A queue grouped by work.**

The motion makes the outcome visible while you're still choosing:
- the edge you're heading toward lights up, and the card slides under it;
- the stamp shows the answer;
- past the threshold, or with a flick, the card leaves along your swipe; otherwise it springs back;
- a hard card stops at the edge with a hold ring.

A trackpad can't report that the fingers are still down, so after a trackpad swipe a hard card waits for a held key or a press on the ring. Audit cards relabel the swipe as "Let it stand" and "Overturn".

**Checked headlessly** (`#selftest`: synthetic keys and wheel events, run in headless Chrome):
- a tap doesn't answer a hard card, and a hold does;
- ← rejects;
- ↑ opens the written answer;
- `j` moves to the next card;
- a short two-finger swipe springs back, and a full one answers;
- the empty state appears when the queue is clear.

**Two bugs found by the self-test:**
- the key handler assumed an element target;
- **the release of the key that completed a hold accepted the next card too.** Both are fixed.

`#peek-right` shows the card mid-drag.

**Not checked:** how it feels on a real trackpad. That's the user's call.

## Between rounds 2 and 3

- **Feedback on round 2:** "closer". Use semantic names, not IDs (D69). Then do deeper research.
- **The research cycle:** [[Contextualising Decisions]], with [[Contextualising Decisions - Sources]].
- **The user picked for round 3** (D70): all three concepts, the whole oversight layer, and all four card-format changes.
- **Mid-build, the user added trading-card rarity,** where rarity reflects consequence: [[Card Rarity]].

## Round 3: the combined prototype

`design/explorations/round3/`: `data.js`, `atlas.js`, `app.js`, `style.css`; the plan is in `PLAN.md`.

**The Atlas**
- One stable SVG map: areas as columns, pieces of work as lanes, decisions in the order they were filed.
- Commit ticks; tapered dependency arcs; conflict lines faded unless they involve the current decision.
- **Semantic zoom:** card, area and project levels. Hold Space to zoom out a level.
- **Staged flights** between cards that sit in different pieces of work.
- **Footprints:** answered decisions are stamped in ultramarine (accepted) or thread colour (the alternative).

**The one-cue card**
- Content, top to bottom:
  1. the trigger, with "agent waiting" if it's blocking;
  2. the decision type and your precedent;
  3. the question;
  4. two contrastive options, placed so the gesture matches the layout: the alternative on the left (←), the proposal on the right (→);
  5. the agent's hedged rationale;
  6. "wrong if…", with where to check;
  7. a "then:" projection for each option;
  8. **one** cue, labelled "the one thing most likely to change your answer", with why it was chosen.
- The card is tied by a thread to its node on the map.

**The consequence preview.** The drag scrubs the map:
- toward the alternative, the commits built on the decision are hatched for rework, and its dependents fade;
- toward the proposal, they firm up;
- the outcome is written on the map.

**The oversight layer**
- **Tiered dwell:** none for common, 2 s for uncommon. Rare and mythic need 3 s *and* a preview.
- **Human-first on high tier:** unlabelled options on randomised sides, then a reveal of the agent's pick, then hold to confirm.
- **Opt-in practice cards:** a variation on "one file per verdict", revealed after you answer.
- **"Your calibration":** median dwell by rarity; practice catches; reversals; both over-reliance and under-reliance.

**Rarity**
- Computed from the card's facts, with "why mythic?" on every card.
- Common ● matte; uncommon ◆ silver edge with glare; rare ★ gold frame and a holo band; mythic ♛ oxblood seal, gold frame and full foil.
- Foil is a colour-dodge gradient driven by the pointer and the drag tilt, with `isolation: isolate`.
- Variants: a split card (conflict), a reprint (audit), a first edition (a precedent).
- The collector number is the card's position in its work ("No. 2 of 3 in …").

**Checked headlessly** (`#selftest`):
- the mythic card is human-first, with labels hidden and the foil present;
- no answer before the dwell;
- the reveal, then the hold, then a stamped node;
- the rare conflict card goes through the same flow;
- the uncommon card's dwell, then a tap accepts;
- an accepted practice card is revealed as missed;
- the calibration panel counts it.

**Screenshots:** `#peek-left` (the preview mid-drag) and `#overview` (project level).

**Not checked:** the feel on a real trackpad; legibility on smaller screens; whether the one cue is the right one. That last is the main thing to learn.

## Round 4: an independent review loop

- **The ask:** the user found round 3 hard to understand, "it may be because of the lack of polish or other reasons". They asked for a loop of independent review, revision and redesign until a *new* independent reviewer judged the design sufficient.
- **The method:**
  - Each round, a fresh reviewer agent saw only the product description and the prototype, never the earlier reviews.
  - The reviewer drove it in real Chrome with playwright, at 1440×900 and 1280×800.
  - It answered seven comprehension questions cold, then read the research for intent, then judged against a written bar: questions 1–5 answerable within a minute, nothing unexplained, a discoverable interaction, the question and options as the focus, early-user polish, and no overlap at either size.
- **The record:** reviews are in `design/explorations/round4/reviews/`. The prototype is `design/explorations/round4/`, with round 3 kept as the baseline.

| Review | Verdict | What it found | What changed |
|---|---|---|---|
| 1 (of round 3) | Not sufficient | The layout fought the content: the card covered the map context it cited. The confirm step rendered tilted and unreadable. Rarity was unexplained jargon. Typing could switch cards. | **A re-layout:** the card in the centre, "What this builds on" to its left, "What your answer changes" to its right, the map as a strip. Rarity explained in a sentence on every card. Foil only on the frame. An answer bar with steps. The reveal and the hold inside the card. Neutral wording for human-first cards. Writing inside the card. Undo for 5 seconds. |
| 2 | Not sufficient, but close | The practice result was invisible (an animation bug). The controls misstated their state. The strip was unexplained. The preview was out of view. The agent's pick could be inferred. | Rare cards confirm with a second press, and mythic cards hold (D67). Preview-to-unlock dropped. The queue merged into one row grouped by area. Both answers' outcomes shown on the right, with cost chips. Symmetric "Then" lines. |
| 3 | Not sufficient, but close | A quick arrow tap leaked its lean into the next card. The toast overlapped the card at 1280. Colour codes unexplained. Space overloaded. The whole-project map unlabelled. Names drifted. Practice cards gave themselves away. | Card animations moved to Web Animations. The toast placed in the left column. A labelled whole-project overview. Breadcrumb levels named. One vocabulary. A real card that arrives late. **The user's idea, a pile you move through.** |
| 4 | **Sufficient** | Nothing blocks understanding. Fix before early users: Space meaning both map and confirm, and header buttons keeping focus. Also a human-first leak in the write panels, foil edges in the pile, and "waiting" meaning two things. | All of those fixed after the verdict, along with [[Client Data Contract]]'s D71: commits and "re-decided" are gone from the consequence panel, and rarity no longer counts commits. |

**After review 4:**
- Cards with a stopped agent come first.
- The pile shows plain backs, so only the top card's rarity shows.
- Answered cards collapse to a count per area.
- Outcome chips are neutral until you lean.
- The card resists a drag during the wait.
- ⌘ Enter sends a written answer.
- The map frames the current card with its related decisions, across areas.
- The self-test drives 30 steps.

**The user's verdict on round 4:** "much better and getting closer to the vision". They also said: "the cards are good. The project map however specifically needs work". That started a second loop, on the map alone ([[#The project map loop]]).

**Changes to things the user chose, to confirm with them:**
- **The Atlas** is a modal (M, or hold Space) instead of the backdrop. The side panels do the card-level orientation.
- **Foil** is on the card's frame only, never over text. The pile shows plain backs.
- **The collector jargon is replaced by a plain sentence:** "Split card", "Reprint", "First edition" and "No. 2 of 3".
- **Tiered friction:** the preview-to-unlock step is gone. Rare cards confirm with a second press, mythic cards are held, and Space only ever opens the map.
- **The queue** is grouped by area, but cards with a stopped agent jump ahead.

## The project map loop

- **The ask:** "the cards are good. The project map however specifically needs work". The user asked for the same loop on the map alone, overnight.
- **The method:** one fresh reviewer per round, judging the map against its own bar:
  - questions 1–5 (where am I, what's it connected to, what's settled or waiting, what's most urgent, how do I get around) answerable within 20 seconds from any card;
  - nothing cut off without a cue;
  - the same thing in the same place;
  - holds up at about 150 decisions in 8 areas, using a generated `#scale` project.
- **The record:** reviews are in `design/explorations/round4/reviews/map-review-*.md`; earlier map code is kept in the session's snapshots.

| Review | Of | Verdict | What it found | What changed |
|---|---|---|---|---|
| 1 | the round 4 SVG atlas, two zoom levels | Not sufficient; redesign | "This area" didn't frame the area; the camera broke after "Whole project"; the two levels shared nothing; no scale | `map.js`: areas as blocks laid out from the data, relations drawn on top, the queue inside the map |
| 2 | blocks that widen for the focus area | Not sufficient | Areas moved with the focus; the card could open off-screen at scale; labels lost at scale | One level: fixed cells, names by degree of interest, lines and tags |
| 3 | fixed cells, names by interest | Not sufficient | Names depended on the subject, so marks moved by up to 120 px; at scale, half the project hidden with no account | Names by a decision's own state; a level-0 strip; edge cues; measured movement 0 |
| 4 | cells, strip, sticky headers | Not sufficient | Floating labels collided; sticky headers hid decisions; a tooltip bug; its suggestion: one horizontal track per piece of work | **Tracks:** areas as rows, each piece of work a track, oldest to newest; letters shared with the side panel; nothing floats |
| 5 | tracks | Not sufficient, close | No "above" cue; the "below" cue miscounted; keyboard focus lost after Esc; lanes wrapped | Above and below bars naming what's hidden, with relation chips; focus recovery; lanes never wrap; framing on open |
| 6 | tracks with edge bars | Not sufficient, because of one bug | A stale caption after closing while inspecting; three layout shifts (bar height, count wrap, order slot); two "backs" | Caption fixed; fixed bar, header and slot sizes; one "Close the map"; numbers on the next five only; "new" markers |
| 7 | the fixed tracks | **Sufficient** | No blockers. The side panel overflowed at 1280 while inspecting; order slots wasted width; the "write first" message was hidden under the map; neighbours showed no direction; keyboard rough edges | All fixed after the verdict: numbers as badges, short arcs for neighbours, ↑ and ↓ to the adjacent track only, a panel that always fits. Movement re-measured at 0 px (one attempt to make your card shrink last moved marks, and was taken out) |

**The form that came out of it:**
- Every area is a row, and each piece of work a track with its decisions oldest to newest.
- Cards to answer and answered cards are named, and everything else is a mark.
- Your card is outlined, and what it's connected to is lettered, the same letters as in the side panel.
- Lines run only between decisions that aren't neighbours.
- Bars above and below name whatever is out of view.
- Nothing moves when you open the map from another card, inspect a decision, or answer: measured at 0 px at both sizes.

**A test fixture:** `#scale` (in `data.js`) generates about 150 decisions in 8 areas, deterministically, to check the client at a realistic size.

**Departures from the research, for the user to confirm:**
- **No semantic zoom and no staged flight.** The map is an overlay with one stable level, and the card view stays put.
- **The level-0 strip was tried and removed,** once the tracks fitted the project on about one screen.
- **Settled decisions, rules and deferred ones are marks only,** named on hover and in the side panel.
- **Order numbers only on the next five cards to answer,** so the numbers don't churn as you answer.
- **Not built:**
  - "changed since you last looked" beyond a "new" badge on cards that arrived (it needs a seen-log, [[Client Data Contract]]);
  - collapsing long settled runs;
  - the reviewer's idea of shrinking the card into its place on the map when it opens.

## Round 5: glance first

- **Why:** the user found round 4 better but still not understandable at a glance, and saw it converging on a project management tool ("We dont want to build linear etc."). Measured, round 4's card showed about 400 words in 27 type styles, and its map about 690 words, 39 type styles and 40 badges. Each review loop had made things clearer by adding explanation.
- **What the user chose:**
  1. a subtractive pass, judged by a different test;
  2. re-scoping the map from a project view to the decision's neighbourhood.
- **The test:** a fresh reviewer gets **screenshots only**, plus the one-line description a new user has. It writes down what a person takes in during about five seconds, before reading closely: what's being asked, how much it matters, the choices and what each does, how to answer, and whether anything is waiting. It then lists what could be removed or demoted. The bar rewards fewer words.
- **The record:**
  - the prototype is `design/explorations/round5/`, with round 4 kept as the baseline;
  - the reviews are in `round5/reviews/`;
  - the screenshots, and side-by-side comparisons with round 4, are in the session's scratchpad.

| Review | Verdict | What it found | What changed |
|---|---|---|---|
| Glance 1 | Not sufficient | The tier word ("Mythic") read as collectability, not stakes. A second bold question in the cue. A dark toast and a rainbow frame competed with the question. Unexplained: the green dot, "in gate", topic names read as English ("arrived in time"). An empty left column. | Stakes lead in words ("Hard to undo, touches security"), with the tier name in the mark's tooltip. The cue is quiet context. The toast is light. Neutral keys. A thinner mythic frame. Removed: the presence dot, the suffixes, the empty column, clauses repeated across options. A neutral question. "Other answer". |
| Glance 2 | **Sufficient** | Refinements only: the cue ended in a question; a non-neutral name in the left column; the "N more in this pile" line was redundant; the header badge used a different glyph from the tray; line breaks | All applied: neutral names, notes without questions, the same mark everywhere, no pile count, new cards marked in the tray instead of announced in the toast |

**What round 5 is:**
- **The card:**
  - one line of stakes in words, plus "claude-code stopped" when an agent is waiting;
  - the question;
  - two options, each one button reading "if …, then …";
  - one quiet line of context;
  - a footer with ↑ Other answer, ↓ Can't judge, and the agent's reasoning on request.

  The card showed about 150 words in 14 type styles, against 400 and 27 in round 4.
- **Elsewhere on screen:**
  - **Left column:** the decision's neighbourhood: what it builds on (above), what it conflicts with and what relies on it (below), and your precedent. Clicking a card to answer opens it, an answered one reopens it, and anything else shows its own neighbourhood. Esc comes back.
  - **Bottom tray:** one mark per card to answer, grouped by area.
  - **"More" menu:** practice cards, calibration and keyboard shortcuts.

**Departures, for the user to confirm:**
- the project map is gone; round 4 keeps it;
- the tier names appear only on hover; the marks and frames stay;
- Space no longer opens anything;
- the agent's trigger ("I'm writing the request check…") is now behind "claude-code's reasoning".

**Honest limits:** the reviewers were still agents of the same model, and the sample cards are still well written. The test that counts is the user's own five seconds with each screen.

### The path beside the card

- **The user's feedback on round 5:** "the linking map on the left needs work. I think its important to be there -- it indicates the traversal of decisions being made, and potentially their relationships."
- **The redesign:** the column became **your path**.
  - **The spine:** solid through the decisions you've answered this session, each with your quoted choice, and with "not codex's pick" when you went against the agent. Then your current card, whose node is joined to the card's side by a line. Then a "Next" heading and what's next, dotted, with "N more after these" and a "new" tag on cards that just arrived.
  - **The relationships** hang off the current node, indented off the spine on thin branches. Each is named from this card's side: "this card builds on", "this card may conflict with", "relies on this card", and on a conflict card "in conflict; kept if you choose ←".
  - **A link to an earlier answer** on the path is an arc, labelled on that answer's row ("this card builds on it"), never a second entry.
  - **Movement:** each answer slides the path along. The bottom row is the same path, compressed.
- **Reviews** (screenshots only, `round5/reviews/path-review-*.md`):
  - **Path review 1: not sufficient.** The spine worked, but labels pointed at the wrong item, "kept by ←" was cryptic, the header claimed a dependent the column didn't show, and related decisions sat on the spine.
  - **Path review 2: sufficient.** Its refinements were applied: one wording direction, branches from the node, "settled earlier", a single dot for related decisions, and a "new" tag.
- **Data:** one realistic link was added between sample cards ("Relative times in the queue" builds on the time-format decision), so the path shows a link back.

**Conflicts and motion (2026-10-24).**
- **The user's feedback:** "I dont understand what the animation is showing me -- the inconflict decisions, it is not obvious how they relate to what I am doing."
- **Relationships are worded around the card's options,** with their keys:
  - on a conflict card, "Your answer keeps one, replaces the other", and each row reads "kept if you choose ← “Unix epoch integers”";
  - a rule a decision might break says which option would break it ("→ “In the URL fragment” may break it"). This effect is declared by the agent (`effects` on the card).
- **Leaning toward an option** turns the label into the outcome, in the same place: "✓ Kept" or "✓ Keeps to it" (green), "✗ Replaced" or "✗ May break it" (wine). Unaffected rows fade.
- **One sequenced movement on answering:**
  1. the card leaves;
  2. the option you chose flies along the line into your answer's node and lands as "you chose …";
  3. the path steps up one place;
  4. the next card appears.

  It takes about 0.7 s.
- **Removed:**
  - the branch lines, since the labels carry the meaning;
  - the coloured lean outlines on the options, which are now neutral, so wine only ever means "replaced" or "breaks";
  - the bottom row, which repeated the path;
  - the choice from the undo toast, since the path shows it.
- **Path review 3** (screenshots and motion frames only): **sufficient, with fixes**. All its fixes were applied. Its record is `round5/reviews/path-review-3.md`.

**Quality pass (2026-10-24).** The user saw icons and lines cut off. An automated check now runs over every state at both sizes. It covers:
- SVG shapes outside their viewBox;
- elements, shadows and outlines outside a clipping ancestor;
- text overlapping text;
- path lines crossing text;
- things off the window.

It found and fixed these:
- **The tick and "agent stopped" badges were drawn past their 16-unit icon box,** so every one was clipped. Icons now render beyond their box.
- **Each path node sat on a disc painted in the page colour** to hide the line behind it. On the gradient these showed as faint circles. The spine is now drawn in segments that stop short of each node.
- **The column hid overflow,** which cut off the current card's ring.
- **The lines were measured before the web fonts loaded,** so they sat 30–40 px off once the text reflowed. They now redraw on font load, on resize and on layout change.
- **The link-back arc ran into the line to the card.** It now arrives at the card's ring from above, with an arrowhead.
- **Small polish:** balanced option titles, no lone words or split "one-time", a quieter explanation line instead of an empty one while leaning, and a neutral confirm button.

After the fixes the check reports nothing at either size. The only overlaps left are popovers (the menu and calibration) over the card, which is intended.

**The minimal-card decisions in the prototype (D73–D75, 2026-10-24).**
- **Round 5's cards now show:**
  - the trigger, one line ("claude-code is writing the server's request check");
  - one shared crux above the options ("It turns on: Does your rule cover the part after the #?"), with the fact that bears on it, and each option labelled with the answer that leads to it ("If it doesn't" / "If it does"); a preference crux says "It turns on what you value";
  - the trial facets: an "Unverified" premise with its check, "Already built" when the agent's work matches the card, and the criterion the agent's pick serves ("codex's pick, for working offline").
- **The "Before you choose" cue is folded into the crux.**
- **`filingProblems()` in `data.js` is the type-free filing check.** It checks for a trigger, two real options with what each does, and a crux whose two answers differ. The self-test runs it on every card, and on a planted card whose crux doesn't discriminate.
- **About 190 words on the first card,** against 150 before: the trigger and the crux are the additions the evidence supports.

## The dry run: real decisions in round 5 (2026-10-24)

The user had found round 5 good, and asked to answer the remaining decisions in [[Client Data Contract#Decisions this note needs]] as cards in it.

**The setup.**
- `design/explorations/round5/#dryrun` loads the ten open decisions as cards from claude-code, with the settled decisions they build on as context.
- Each answer is saved once its 5-second undo has passed, or when the page closes. The local server writes each one to `design/dryrun/`, one file per answer, never overwritten.
- Each record keeps the response, the option, the crux answer, the agent's pick, the time on the card and whether the reasoning was opened.

**The outcome.** Nine decisions (D77–D85). The waiting-marker card came back as "I need more context", and was revised.

**What it showed about the cards:**
- **About 6½ minutes for ten cards.** The median was 31 seconds a card, and the range 8 to 105. The longest was changing an answer after the agent has acted, the card whose own premise undercut its pick.
- **The user agreed with the agent's pick on all nine, and the pick was visible on every card.** No card reached rare, so the hidden pick of D76 never applied. The dry run can't tell good picks from anchoring. Practice cards on which the agent is wrong are the planned measure (D76).
- **"Can't judge" caught a bad card.** The waiting-marker card's case was wrong: it blamed harness timeouts, but a timeout is already recorded as a fallback. It also lacked the deciding fact: only an agent killed mid-wait leaves "stopped" showing. The user spent a minute on it, opened the reasoning, and asked for context. That is the signal the measurement plan in [[Minimal Card Content]] counts on.
- **The reasoning was opened on three cards of ten:** the waiting marker, the commits and the rules.
- **Changing an answer was used.** The user reopened the card-format card from the path twice, about 3 seconds each time, and came back to their first answer.
- **Three picks rest on unverified premises** (D81, D83, D84). The premise facet left each as a check owed before building, not a silent assumption.
- **The saved crux answer is unreadable on its own** ("If it does"). A real verdict points to the card's revision, so the question can be recovered. A record meant for reading should carry the question too.

**After the dry run: decide first, on every card (D86–D89).** The user: "The experience changed an opinion I had." Round 5 now:
- hides the agent's pick, its case and the reasoning link on every card until you choose; audit cards are the exception, since what the agent did is a fact;
- shuffles the options' sides per card, with a new shuffle each session; it had alternated them, which can be learned;
- when you disagree, shows the agent's pick and its case, with an optional one-line "Why?", a confirm, and "Switch to claude-code's pick";
- records the choice made before the reveal, so going back with Esc and choosing again counts as a switch; the dry-run record gains `first_choice`, `switched_after_reveal` and the crux question;
- hides each option's "then" in the reveal, and scrolls the buttons into view, so they fit at 1280 × 720.

The self-test passes. A walk through both cases (disagree with a reason; disagree, then switch) produced correct records.

**The revised card (D90).** The user answered it with the pick hidden, in 69 seconds. They chose the waiting marker before the reveal, agreeing with the agent without seeing its pick. The loop worked end to end: "can't judge", then a revised card with the missing fact, then a decision in one pass. With that, all ten of the Client Data Contract's decisions are made, and the dry run's queue is empty.
