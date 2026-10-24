# Path review 3

Independent reviewer, screenshots only, 2026-10-24, of relations tied to the choice, and the answer motion. Verdict: sufficient, with fixes. Screenshots: scratchpad/path-review-3/.

## 1. Verdict: SUFFICIENT, with fixes

The conflict part of the owner's complaint is fixed. At rest, "Your answer keeps one, replaces the other" plus "kept if you choose 'X'" (quoting the card's option titles exactly) tells me how each related decision depends on my answer. Leaning turns that into an unmistakable ✓ kept / ✕ replaced. The animation now carries one idea, "your answer is written onto your path", and the frames show it. Two weak spots stop it being clean. At 240 ms the flying chip sits on the corner of the incoming card, so for a moment it reads as a tag on the new card. And the path moving on one step happens before 120 ms, so none of the frames shows it. Neither is a blocker. No static clipping or overlap at 1440 or 1280.

## 2. Answers

**Q1, at rest (C), high confidence.** Two earlier decisions disagree, and this card picks between them. ← (Unix epoch integers) keeps "Store card times as epoch integers" and overturns the ISO one. → does the reverse. The mapping comes entirely from the quoted option names and the header. The lines and dots add nothing.

**Q2, leaning.**
- **D (lean ←), high.** The epoch row turns green with "✓ kept" and the ISO row turns pink with "✕ replaced". So leaning left keeps epoch and throws out ISO.
- **E (lean →, 1280), high.** The reverse. Layout holds, nothing is clipped, and the card's tilt doesn't touch the column.
- **A (lean ←), high.** "Never put secrets in URLs (your rule)" turns pink with "✕ may break it": the URL fragment may break my rule.
- **B (lean →), high.** The same row turns green with "✓ keeps to it": the cookie respects my rule.
- **A/B wording.** The crimson header "this card may conflict with" stays even when the row is green, so it reads "may conflict… ✓ keeps to it". That's correct but clashes. Also, I have no at-rest shot of this card. Judging from A and B, at rest the column says only "may conflict with" and doesn't say which option does. The C card names the option; this one should too.
- **"builds on" row.** Dimmed and unchanged in both A and B. I read that correctly as "not affected by this choice", medium confidence.

**Q3, motion, medium confidence.** "The answer I picked lifts off the card, flies to the top of the path, and becomes the 'you chose X, not claude-code's pick' note under that decision." The landing spot and the final text make it mostly evident without explanation. Three things weaken it:
- At 120 ms everything is blank except the chip (card gone, related decisions gone, a connector line pointing at nothing), so it reads as a flash.
- At 240 ms the chip overlaps the new card's top border, above "Costly to undo". It looks like a tab on the time-format card.
- At 360 ms the chip touches the crown icon.
- The step advance (crown moves up, star comes out of "Next" into the current slot) is already done by 120 ms. That is the "walking the path" half of the message, and the frames never show it.

**Q4, overall.** Yes, the column now shows how related decisions connect to the choice. Nothing in it competes with the card: the lean tints are loud, but they're feedback. Remaining confusions are minor:
- Two near-parallel dotted lines (crimson branch and grey spine) look like a rendering doubling.
- Options get a lean outline by side: the left option is outlined rose, the right indigo. In D the rose-outlined option pairs with the green row, and the pink row is the loser.
- The "Your path" strip at the bottom left duplicates the column.
- "You chose X" now appears in three places (card reveal, path, toast).

## 3. Ranked changes (no blockers; #1 is closest)

1. **Sequence the motion.** Let the chip land before the new card fades in, or fly it along the connector line into the node and up the spine, so its route is the path. Then slide the spine up one notch so the advance is visible. Simpler fallback: drop the flight and crossfade "you chose X" in while the spine visibly slides up. The slide alone says "next step".
2. **One grammar for both relation types.** The token card should name the option at rest ("broken if you choose 'In the URL fragment'"). On lean, swap the header for the outcome instead of stacking "may conflict with" over "✓ keeps to it".
3. **Add the ←/→ key glyphs to the conditional labels** ("kept if you choose ← Unix epoch integers"), matching the card's key glyphs. That makes the rest state instant.
4. **Simplify: remove the crimson branch line and the grey "builds on" curve beside the spine.** The labels carry the relationship, and the double line only adds noise.
5. **Make the card's lean outline the same neutral colour on both sides**, so red and pink only ever mean "replaced/breaks".
6. **Simplify: drop the bottom "Your path" strip** while the column is visible.

## 4. What must be kept

- The connector line from the current node into the card.
- The header "Your answer keeps one, replaces the other", with per-row "kept if you choose 'exact option title'".
- Lean feedback as a whole-row tint plus words (✓ kept / ✕ replaced / ✕ may break it / ✓ keeps to it), not colour alone.
- The dimmed "builds on" row that doesn't react to leaning.
- "settled earlier" and "your rule" as provenance.
- Landing the exact answer text on the path as "you chose X, not claude-code's pick".
- A single moving element in the animation.
- The 1280 layout as it is now.