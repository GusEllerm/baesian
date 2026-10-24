# Review 2 (of round 4, first version)

Independent reviewer, fresh context, 2026-10-23. Screenshots: scratchpad/harness/review-2/.

## 1. Verdict: NOT SUFFICIENT, but close

The card itself now reads well. A first-time user gets the question, both options (with "Better if" and "Then"), the reason for the rarity and the agent's state within about 30 seconds. The layout is stable, so the second and third cards take about 15 seconds each. Four fixable failures keep it below the bar, and none of them is in the concept:
- **Practice result never shows.** After you answer a practice card the screen goes blank, because the result is drawn invisibly.
- **The answer controls misstate what's required.** "Choose this" stays faded after the wait although it works, and the "Lean to preview" step looks mandatory but isn't enforced.
- **The bottom strip is unexplained.** It is always on screen and is a row of unlabelled glyphs.
- **The consequence preview is out of view.** It plays out in small type about 350 px from where your eyes are while you lean.

No redesign is needed. These are about a day of fixes.

## 2. Phase A answers (first card: the mythic access-token card; then the rare and uncommon cards)

1. **What is this for, what is it asking? High confidence.** The header says "5 decisions need you. Two agents are waiting on your answer." The question is the largest type on screen, with a "Waiting for you" badge.
2. **Options and what follows? High.** Each option has "Better if …" and "Then …".
3. **How do I answer? Medium.**
   - What works: the step bar "Read it 3.0 s → Lean ← or → to preview → Choose, then hold to confirm", the "Choose this" buttons, ↑ Write an answer, ↓ I can't judge this, and the drag hint. Clicking during the wait gives a clear toast: "Read it first: answers open in 1.9 s."
   - What misleads: after the wait the buttons stay at 55% opacity and look disabled. Step 2 reads as required, but a click or an arrow tap skips it. "Lean ← or →" shows arrow keys, yet tapping an arrow chooses rather than leans.
4. **Why it looks this way? Medium-high.** "Mythic because it touches security, it's hard to undo and an agent has stopped for it" explains it directly. The frame's meaning comes from sitting next to that label. The ladder (common < uncommon < rare < mythic) only appears in the map legend.
5. **Where it sits, what depends on it? Medium.** The breadcrumb and "What this builds on" (a rule that may conflict, a settled server decision) are good. "What your answer changes: … Bookmarks and Tailscale links, outside the repo" stays cryptic until you lean. The bottom strip can't be read.
6. **How much is left? High.** The header count, the "Next up" chips and the "j k" hint.
7. **After answering? High.** "Chose 'In the URL fragment'. Sending to claude-code in 5 seconds. Undo Z", then "Sent". Undo works, and reopening a card shows "You answered this… Change your answer."

## 3. Problems, ranked

Screenshot paths start with `/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-2/`.

### Comprehension and structure

**1. BLOCKS: the practice-card result is invisible.**
- **What happens:** with practice cards on, answer "Store the client's verdicts in one shared file?". The card fades and the stage stays blank for good. The result ("That was a practice card… You caught it. Continue") is in the page at opacity 0. Only j gets you out.
- **Evidence:** `/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-2/25a-practice-left-8s.png` and `/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-2/24-practice-3000.png`
- **Cause:** in `commit()` in app.js, `card.style.opacity = 1` runs before the Motion animation's final `opacity: 0` lands. The selftest runs with reduced motion, so it passes.
- **Fix:** reset the opacity after the animation settles (or cancel it), then animate the result in.

**2. BLOCKS: the answer controls misstate their state.**
- **Evidence:** the faded buttons after the wait in `/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-2/01c-first-6s.png`. They work: `/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-2/20a-click-choose-after-dwell.png`
- **Why it confuses:** this is the first card, and it's the one where the user is trying hardest to be careful.
- **Intent gap:** PLAN says high-tier cards unlock only after the preview, and that isn't enforced. Rare and mythic also get identical friction, so the top two tiers differ only in their foil.
- **Fix:**
  - Show "Choose this" at full strength once the wait ends.
  - Either enforce the lean on mythic cards, or relabel step 2 as optional.
  - On the keyboard, either make the first tap a lean and the second a choice, or label the keys "← → choose".

**3. BLOCKS (cheap): the bottom overview strip is unexplained.**
- **What's wrong:** "gate nothing waiting The commit gate ● ■ ●" has no legend. At this size a common card that's waiting and a settled decision draw the same ●. Nothing says the strip opens the map; only a native tooltip does. With the "Next up" chips there are now two rows of rarity glyphs at the bottom.
- **Evidence:** the strip in `/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-2/18b-1280-card4.png`
- **Fix:** label it "Project map (M)" and draw waiting decisions ringed, as the map does. Better, merge it with the queue (see section 5).

**4. The consequence preview is out of view and repeats "Then".**
- **What's wrong:** when you lean, the right column switches to "If you choose…" and adds small tags about 350 px away. The tag colour follows the side you lean to, not the cost: "stay" and "reworked" are both oxblood.
- **Evidence:** `/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-2/04c-drag-left-300.png` and `/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-2/10b-rare-drag-left.png`
- **Fix:** keep the ingredient, but play it out beneath the option you're leaning to, or draw a connector to it. Colour by cost (rework or blocked against kept or unblocked), and fold "Then" into it.

**5. Human-first answering gives away the agent's pick.**
- **What's wrong:** "Then claude-code resumes" against "adds a cookie and a login step" shows which option is already built. In this deck the proposal is on the right on every card. Both human-first cards' hashes put it there, and labelled cards always do. So "right = the agent's pick" can be learned within about three cards.
- **Fix:** word both "Then" lines the same way. Change the hidden-pick note to claim only that the agent's case is hidden. Make sure the sides visibly vary.

**6. The toast hides the remaining count.**
- **What's wrong:** for 5 seconds or more after every answer, the toast covers the header count. Answering quickly, you never see the count drop.
- **Evidence:** `/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-2/10a-after-mythic.png`
- **Fix:** move the toast above the queue.

**7. The one cue is diluted.**
- **What's wrong:** the cue repeats items shown elsewhere. On the mythic card, the rule conflict is also in the left column. On the rare card, "5 commits against 1" appears in the cue, both columns and the "Then" lines.
- **Fix:** when the cue is already a column item, highlight that item instead of restating it.

**8. Wrong voice and wrong copy.**
- The audit card puts Baesian's explanation in codex's quote slot ("A sample of the calls agents make without asking…"). Evidence: `/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-2/14d-fourth.png`
- The preview says "Let go to choose it" after you've let go, and "Lean further, or let go" when you're only hovering. Evidence: `/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-2/02b-click-choose-during-dwell.png`
- "Next up" also lists the current card and answered ones.
- "It's outside my expertise" leads to "Send to claude-code", but the design says it reroutes to another reviewer.
- The common card's reason ("…and it's the first decision on its topic, so it sets a precedent") argues for care right before "answer straight away".

### Polish

- **The card jumps between stages.** It shifts vertically by up to about 80 px across the live, confirm, write and can't-judge stages. Evidence: `/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-2/12d-down-1s.png`
- **At 1280:** the "Waiting for you" badge wraps onto its own line (`/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-2/17a-1280-mythic.png`). The common card's actions sit 14 px from the queue. Nothing clips.
- **Map:**
  - The 13-row legend overlaps the area panels, and neighbouring areas are cut off at the edges ("tir", "Sto").
  - Conflict lines cross labels.
  - "Whole project" leaves the top of the screen empty, and its area titles straddle the panel borders (`/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-2/07c-whole-1200.png`).
  - Nodes can't be clicked, and tooltips are native ones only.
- **Glyph reuse:** ◉ is both the common seal and the agent marker. ○ means "an agent's own call" in the right column but "deferred" in the legend.
- **Calibration panel:** it's all prose. It shows "Caught 3 of 4" while practice cards are off, and it's unclear whether "worked around 2 of your rejections" is good or bad.
- **Practice toggle:** turning it on immediately adds a chip and bumps the count from 5 to 6, which shows which card is the practice one (`/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-2/08f-practice-on-1700.png`).
- **End screen:** "card." is orphaned on its own line, there's no recap, and the fading toast overlaps the header (`/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-2/14h-end-6s.png`).

## 4. What works and must be kept

- **The card's structure:** the rarity reason sentence, the agent's quote with "Waiting for you", the question, two equal-weight options with "Better if" and "Then", and one labelled cue with "Why this one".
- **The reveal:** "You chose X. claude-code proposed Y, so your answer overrides it", followed by hold to confirm. This is the best moment in the product.
- **Dwell feedback:** the "Read it first" toast and the step bar idea.
- **Undo and review:** the undo toast with Z and a countdown, and the reopened card with "Change your answer".
- **The write and can't-judge panels:** reason chips that say what kind of answer it is, with the agent's name already in the send button.
- **Typed context tags:** may conflict, builds on, disagrees, your precedent.
- **The map:** "This area" with the current card ringed, and the hold-Space peek.
- **Restrained rarity:** the mythic foil is salient, there's no celebration, and there's no reward for volume.

## 5. Structural?

No. The layout is right: context on the left, card in the centre, consequences on the right. Fixing problems 1–4 gets it to sufficient, and no fix removes an ingredient the owner chose. One nudge: make the bottom a single row of queue chips grouped by area, and keep the full map as the M overlay:

```
Queue  client: [♛ Access token][◆ Live updates][◆ Markdown cache] | time: [★ Time format] | release: [● Ship client]   ⌖ Map M
```

That removes the duplicate row of glyphs while keeping a faint overview always visible.