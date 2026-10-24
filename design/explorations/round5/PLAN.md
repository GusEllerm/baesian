> **Out of date:** this is round 3's plan, copied as round 4's starting point. Round 4's design came out of the independent review loops in `reviews/`, and is described in `docs/vault/Reviews/2026-10-23 Client Mockups.md` (round 4 and the project map loop).

# Round 3 plan (D70)

The research is in docs/vault/Research/Contextualising Decisions.md. This plan turns it into one prototype.

## The pieces

- **The Atlas** (`atlas.js`): one SVG map of the project with fixed coordinates.
  - **Layout:** areas are columns; each piece of work is a lane; decisions sit along the lane in the order they were filed.
  - **Commits** are small ticks to the right of the decision they build on.
  - **Dependencies** are tapered edges, running left to right with time.
  - **Semantic zoom:** at project level you see areas and counts; at area level, lanes with work titles and decision chips; at card level, the current lane with neighbours, edges and commits.
  - **Moving to another card** is a staged flight of about 750 ms: out to the shared ancestor, across, back in.
  - **Holding Space** zooms out one level.
  - **Answered decisions** become stamped footprints.
  - **Fog:** unrelated areas are faint; decisions changed since you last looked are marked.
- **The one-cue card** (`app.js`): placed on the left, and tied by a thread to its node on the map. From top to bottom:
  1. the trigger, and whether the agent is blocked;
  2. the decision type and your precedent;
  3. the question;
  4. two contrastive options with a flip condition;
  5. a hedged rationale of 25 words or fewer;
  6. "sinks if", with where to check;
  7. a projection for each answer;
  8. **one** context cue, ranked by a rule-based value of information and labelled "why this".
- **Gestures,** reusing round 2's engine (pointer, two-finger wheel, keys, hold):
  - on labelled cards, → accepts and ← takes the alternative;
  - ↑ opens a written answer (including a plain reject);
  - ↓ means can't judge, with a reason.
- **Consequence preview:** the drag distance scrubs the map.
  - **Toward the alternative:** the commits built on the decision get hatched as rework, and its dependents fade.
  - **Toward accept:** the dependents light up as unblocked.
  - **Blocking cards:** the agent's waiting time shows.
- **Tiers** = blast radius (commits plus dependents) × reversibility × blocking:
  - **low** commits at once;
  - **medium** has a 2 s minimum dwell;
  - **high** stays locked until 3 s have passed *and* you've dragged far enough to see the preview. It's human-first: the options are unlabelled, on randomised sides. Swiping picks an option, then the agent's pick is revealed, then you hold to confirm.
  - Hard cards always need the hold (D67).
- **Canary cards:** opt-in from the header. When on, one practice card is a mutated past decision: Baesian's real choice in D34 is flipped. It's revealed right after you swipe.
- **Calibration:** "Your calibration" in the header opens outcome-based figures, baseline plus this session's live numbers: median dwell by tier, reversals, alternatives the agent worked around, canaries caught. It shows both over-reliance and under-reliance.
- **Naming** (D69): semantic names only; IDs appear in tooltips.

## The look

The Provenance palette and type, which you rated best: mauve desk, manila card, aubergine ink, thread magenta, stamp ultramarine; Alegreya with Archivo. The map is drawn in ink on the desk, so the card is the only manila object, and the one bold thing on screen.

## Rarity (the user's idea; see docs/vault/Research/Card Rarity.md)

The tiers get a visual form taken from trading cards. Rarity is computed from facts, never claimed by the agent:

| Tier | Rarity | Look |
|---|---|---|
| low | common | ● matte |
| medium | uncommon | ◆ silver edge with sheen |
| high | rare | ★ gold, a holo band over the question |
| hard | mythic | a crown in an oxblood seal, full foil, an ornate frame |

- **Variants:** a split card for a conflict; a reprint for an audit card; a first-edition stamp for a precedent-setting card.
- **Collector's language:** the set is the work; the set symbol is the area; the collector number is the card's position in the work.
- **On the Atlas,** each node shows its rarity mark.
- **Foil:** a color-dodge gradient layer driven by `--px`/`--py`, from the pointer and the drag tilt, with `isolation: isolate` on the card. It's static under reduced motion.
- **No rewards for volume, and no celebration on accept.** Practice cards look exactly like their rarity.
