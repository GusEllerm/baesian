# Review 3 (of round 4b)

Independent reviewer, fresh context, 2026-10-23. Screenshots: scratchpad/harness/review-3/.

**Verdict: NOT SUFFICIENT, but close.** I'd fix it, not redesign it. Judged fresh, the screen now explains itself. Each card states its level and why ("Mythic, the highest of four levels, because it touches security, it's hard to undo and an agent has stopped for it"), shows the steps to answer, and gives the reason the proposal is hidden. A first-time user can answer questions 1–4 and 6–7 confidently within about a minute, and question 5 fairly well. Two problems on the main answering path break the bar. A state-leak bug makes the next card arrive already "leaning" toward one option, which defeats human-first on rare and mythic cards. And at 1280×800 the toast overlaps the card. Under those sit several medium comprehension gaps: unexplained chip colours, hidden keys, a weak whole-project map, and names that drift. None of these needs a new layout.

All screenshots are in `/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-3/`. Full paths are given below.

## Phase A: cold read (card 1 mythic, card 2 uncommon, card 3 audit)

1. **What it's for, and what it's asking: high confidence.** "5 decisions need you. Two agents are waiting on your answer.", the big question, and the agent's quote ("I've stopped until you answer").
2. **Options and their consequences: medium-high.** "Better if / Then" in each option, plus the right column ("Each item shows what ← and → would do to it."). Weak spots:
   - Nothing says why "→ need a login in each new browser" is filled brown.
   - "← resumes / → resumes" tells you nothing.
3. **How to answer: high.** The cues are "Choose this ←/→", "↑ Write an answer", "↓ I can't judge this", "You can also drag the card…", and the step strip "1 Read it 2.6 s · 2 Choose · 3 See claude-code's pick, then hold to confirm". Clicking early gives "Read it first: answers open in 1.5 s." j/k, M and Z are each labelled somewhere. **Holding Space opens the map, and nothing on screen says so.**
4. **Why the card looks this way: high for the level, medium for the frame.** The sentence explains the level. The rainbow, gold and silver frames are understood only by sitting next to it. The crown mark is about 14 px and reads like an avatar. The common mark ◉ looks like a selected radio button.
5. **Where it sits and what depends on it: medium.** You get the breadcrumb "baesian › client › The local server the client talks to", "What this builds on" ("Never put secrets in URLs, may conflict, your rule in 'The commit gate'"), and "What your answer changes". Nothing tells a newcomer that "The commit gate" and "The local server…" are names of pieces of work.
6. **How much is left: high.** The header count, plus the queue grouped by area with the current card ringed.
7. **After answering: high.** The toast says "You chose … It goes to claude-code in 5 seconds. Undo Z", and the queue item gets ✓ and a strikethrough. A reopened card says "You answered this… Change your answer".
8. **Cards 2–3 were faster.** "Uncommon: read it for 2 seconds, then answer." and "Baesian picked this from the calls codex made without asking…" are both clear. Card 2 shows the proposal up front, and nothing says why here but not on card 1.

## Problems: comprehension and structure

**C1. BLOCKS: the lean preview leaks onto the next card.**
- **What happens:** answer a common or uncommon card with a normal arrow tap (90 ms) and the next card arrives already leaning. On the mythic card, the cookie option is highlighted, the other is dimmed, and the right column says "If you choose 'In a cookie set on first visit'. Let go of the key to choose it, or press Esc." This is during the Read-it dwell, with no key held. It happened every time, including on the rare card and the practice card.
- **Evidence:**
  - `/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-3/18a-1280-after-realistic-tap.png`
  - `/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-3/13f-card4-arrive.png`
  - `/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-3/15-2-a-card.png`
- **Why it confuses:** the screen pre-selects an answer before you've read the card, and its instructions describe a key that isn't held. That is exactly the anchoring human-first is meant to prevent.
- **Fix:** when a card mounts, reset the spring and lean target, `s.how` and the preview. In `app.js`, `keyup` → `reach()` commits, and the lean state survives into the next card.

**C2. The consequence chips use a colour code nobody explains.**
- **What's wrong:** some chips are filled brown ("← reworked", "← switches to it", "→ need a login…"), some are outlined, and some are faded. Nothing on screen gives the key.
- **Evidence:** `/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-3/14a-card2-after-undo-expired.png`
- **Why it confuses:** brown reads as "recommended" or "selected".
- **Fix:** add one key line under the heading, "Brown: work redone or changed". Collapse rows that are the same either way into one line ("Either answer resumes claude-code").

**C3. Hidden and clashing keys.**
- **What's wrong:**
  - Holding Space opens the full map. At stage 3, where the screen says "press and hold here to confirm", Space is the key people instinctively hold, and the screen swaps to the map instead (`/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-3/06d-space-hold-stage3.png`).
  - The practice reveal panel ignores Enter, Esc, Space and the arrows. Only clicking Continue or pressing j gets you out.
- **Fix:**
  - Show "Hold Space: map" next to M, and don't peek the map while a hold-to-confirm is showing.
  - Make Enter and Esc trigger Continue.

**C4. The map is the weakest element.**
- **What's wrong:**
  - The whole-project view is unlabelled dots in a thin band, with about 60% of the canvas empty (`/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-3/08i-map-whole.png`).
  - The area view has a 15-item legend, and dashed cross-area lines that run off-screen into half-visible neighbouring panels, which looks like clipping (`/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-3/08h-map.png`).
  - Hovering a node shows nothing.
- **Intent vs. execution:** PLAN and the research put the card *inside* the map: drag scrubs the map, and "always keep a faint global overview". Here the map is a modal, and the side columns do its job. The columns do it well, honestly better.
- **Fix:** keep the Atlas, because the owner chose it, but as the secondary view.
  - Label nodes in the whole-project view and fit it to the viewport.
  - Shrink the legend to the symbols that are actually visible.
  - Add hover titles.
  - Optionally, add a one-line lane strip in the breadcrumb row (the card-level zoom) as the "faint overview".

**C5. Names drift.**
- **What's wrong:**
  - One decision has four names: "Where should the client's access token live?", "Where the access token lives", "Where the access to…" in the queue (truncated, no tooltip), and the work name in the breadcrumb.
  - Work names in quotes ("The commit gate") aren't marked as works.
  - Card, answer, decision and verdict are used interchangeably.
- **Fix:**
  - Use one short title everywhere, and put the full title in a tooltip on queue items.
  - Write "in the work 'The commit gate'".
  - Pick one word for what you give.

**C6. The practice card gives itself away.**
- **What's wrong:** turning practice on immediately inserts a new "Store verdicts in…" item into the queue. That's a visual tell, which the rarity research forbids.
- **Fix:** add practice cards later, at random, among cards that arrive.

**C7. Colour means two different things.**
- **What's wrong:** on the card, wine and blue mean left side and right side. The map legend says blue means "you chose the proposal" and wine means "the alternative".
- **Fix:** pick one meaning.

## Problems: polish

- **P1. BLOCKS (bar: no overlap at 1280): the toast overlaps the card.** At 1280 the toast (x 28–358) covers the card's frame (x ≥ 340). Evidence: `/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-3/18a-1280-after-realistic-tap.png`. Fix: cap the toast's width at the gutter, or move it under the queue.
- **P2. The step strip jumps at 1280.** During the dwell the "2.6 s" countdown widens the strip so it wraps to two lines, then it snaps back, and the card's height changes (compare `/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-3/12a-1280-card1.png`). Fix: give the countdown a fixed width.
- **P3. Counts disagree.** Calibration says "6 answers this session" while the end screen says "You answered 5 cards" (`/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-3/16-end-calibration.png`). One counts the practice card and the other doesn't.
- **P4. The cache card repeats itself.** "You let both earlier in-memory caches in the client stand." appears word for word in both the left column and the cue box (`/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-3/06j-jj.png`).
- **P5. Small text issues.**
  - The level sentence leaves an orphan "it." on its own line on uncommon cards at 1440.
  - The undo toast's "in 5 seconds" stays fixed while its bar counts down.
  - The bullet glyphs in "What this builds on" (■ ● ○) are map symbols with no key on this screen.
- **P6. The card is text-heavy.** The mythic card has about 180 words. The always-on explanatory lines ("Which option … isn't shown until you choose…", "You can also drag…") are good the first time and noise on the fiftieth card. Fix: after a few answers, shorten them or tuck them behind an ⓘ.

## What works and must be kept

- **The level sentence with its reason.** It makes rarity information rather than decoration.
- **The step strip, and the "Read it first" toast** when you try to answer early.
- **Human-first, explained.** The reveal sentence "You chose X. claude-code proposed Y, so your answer overrides it." is excellent.
- **The card's content:**
  - "Better if / Then" contrasted options, with equal weight;
  - the trigger quote;
  - "It's wrong if … (check: …)";
  - the single cue box with "Why this one".
- **The lean preview's wording:** "If you choose X. Lean further to choose it, or let go to go back."
- **Hold-to-confirm feedback.** Let go early and you get "Keep holding until the bar fills."
- **Undo and review:** the undo toast with Z, the ✓ in the queue, and the reopened-card state.
- **The Write and Can't-judge panels**, whose chips map exactly onto the design's response types.
- **The calibration panel**, framed by outcomes and showing both over- and under-reliance.
- **The practice reveal text.**
- **The queue**, grouped by area.

## Structural?

No. The layout works: builds-on on the left, the card in the middle, what-it-changes on the right, the queue at the bottom. I'm not recommending that any of the owner's ingredients be removed. The one thing I'd change is the Atlas. Keep it as the secondary view, as now, but fix its whole-project view and optionally add a small lane strip above the card. Fix C1 and P1, address C2–C5, and I'd expect this to pass.