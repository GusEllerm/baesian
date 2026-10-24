---
type: research
status: active
authority: reference
summary: "Trading-card rarity as the visual form of a decision's consequence: the design language of Magic, Pokémon and Hearthstone rarity, how foil effects are built in CSS, the motivation research behind gamification, and a mapping and guardrails for Baesian. Proposed for round 3."
created: 2026-10-23
updated: 2026-10-23
reviewed: 2026-10-23
tags: [baesian, research, client, design]
---

# Card Rarity

Provenance: the user's idea (2026-10-23). The agent then ran web searches for card-game rarity systems, holographic CSS techniques and gamification research. Sources are cited inline; figures from secondary guides are marked.

## The design language

- **Magic: The Gathering.** Rarity is the colour of the set symbol: black for common, silver for uncommon, gold for rare, orange-red for mythic (added in 2008). Foil is a separate *treatment*, not a rarity. [MTG rarity guide](https://tcgpricelookup.com/blog/mtg-rarity-explained) (secondary).
- **Pokémon TCG.**
  - **Symbols:** a circle for common, a diamond for uncommon, a star for rare, in a corner. Newer tiers are two black stars, then one, two and three gold stars.
  - **Secret rares** are numbered above the set's total (for example 205/198).
  - **Holo** is a treatment, separate from the symbol.

  [Wargamer](https://www.wargamer.com/pokemon-trading-card-game/pokemon-rarity), [Dexerto](https://www.dexerto.com/pokemon/pokemon-card-symbols-explained-2457360/) (secondary).
- **Hearthstone,** the closest digital precedent.
  - **Gems:** a gem on the card shows rarity: white for common, blue for rare, purple for epic, orange for legendary.
  - **Legendaries** add a dragon frame, and allow only one copy per deck.
  - **Golden, Signature and Diamond** are cosmetic, animated treatments.

  [Hearthstone Wiki: Rarity](https://hearthstone.fandom.com/wiki/Rarity), [Golden card](https://hearthstone.fandom.com/wiki/Golden_card), [PC Gamer on Diamond cards](https://www.pcgamer.com/hearthstone-diamond-cards-announcement/) (secondary).
- **The common grammar** across all three:
  - **rarity** is a small, consistent mark: a symbol or colour in the same place on every card;
  - **treatment** (foil, holo, animated) is a separate layer that adds salience;
  - **set and collector number** place the card within a collection;
  - **frames** escalate with rarity, ending in an ornate frame for the top tier.

## How foil is built on the web

The best-known implementation is simeydotme's *pokemon-cards-css* ([demo](https://poke-holo.simey.me/), [repo](https://github.com/simeydotme/pokemon-cards-css), GPL-3.0, so its code can't be copied into Baesian). It uses CSS transforms, gradients, blend modes and filters, with the pointer driving custom properties and 3D tilt. The general recipe, from [CSS-Tricks](https://css-tricks.com/holographic-trading-card-effect/) and practitioner guides:
- **Pointer position** becomes normalised custom properties (`--px`, `--py`), which set the foil gradient's `background-position` and the card's `rotateX`/`rotateY`.
- **The foil layer** is a repeating rainbow gradient under `mix-blend-mode: color-dodge`, at reduced opacity.
- **The glare layer** is a radial gradient centred on the pointer, using overlay or soft-light.
- **`@property`** registers the custom properties so they interpolate smoothly.
- **`isolation: isolate`** on the card stops colour-dodge from bleaching the page behind it.

## The motivation evidence: why this needs guardrails

- **Contingent rewards undermine intrinsic motivation.** Deci, Koestner & Ryan's meta-analysis of 128 experiments found that rewards contingent on engagement, completion or performance undermined free-choice motivation (d = −0.40, −0.36, −0.28). *Positive feedback enhanced it* (d = +0.33). [Psychological Bulletin 1999, PDF](https://selfdeterminationtheory.org/wp-content/uploads/2014/04/1999_DeciKoestnerRyan_Meta.pdf).
- **Game elements raised quantity, not quality.** In Mekler et al. (2017), game elements increased how much people did, but not their intrinsic motivation or the quality of their work (cited via secondary sources).
- **What this means for Baesian:** rarity must be **information, not a reward**. It's safe when it says "this decision matters more". It's harmful as soon as it pays for volume or speed, and approving more, faster, is exactly the failure we're designing against.

## Why it fits the research

[[Contextualising Decisions]] already asked for this:
- **Distinct forms against habituation:** cards should look different only when their consequences are different (warning habituation; polymorphic warnings).
- **Salience for critical cues only** (Endsley).
- **Help with rare targets:** rare errors are missed most (low-prevalence effect), and making the rare, consequential card *visually special* puts salience exactly where vigilance fails.
- **Tiering works in clinical alerting:** compliance was 29% against 10%, and 100% against 34% for the most severe alerts.

## Proposed mapping for Baesian

Rarity is **computed from the card's facts** (level, the touches facts, cost to reverse, what's built on it, whether it's blocking). It is never taken from the agent's own claim about importance. Agents therefore can't inflate rarity to get attention, and every card can explain why it has its rarity.

| Rarity | Mark | Treatment | When | Friction |
|---|---|---|---|---|
| Common | ● in ink | matte manila | reversible and local: a two-way door | fast |
| Uncommon | ◆ in silver | a silver edge with a faint sheen on tilt | something is built on it, or the cost to reverse is moderate | short dwell |
| Rare | ★ in gold | a holo band across the question | a one-way door or a large blast radius | human-first, preview before it unlocks |
| Mythic | a gold crown, in an oxblood seal | full foil, plus an ornate frame | hard: security, money, data loss, publishing | human-first, hold to confirm |

Keeping the distribution skewed is what keeps the mythic tier meaningful. Aim for mythics under about 5% of cards and rares around 10–15%. If everything shines, nothing does.

**Variants,** which are treatments rather than rarities:
- **Split card** for a conflict: two half-cards, one decision each, as in Magic's split cards.
- **Reprint** for an audit card: an agent decision brought back for review, marked like an older printing.
- **First edition** stamp for a card that sets a precedent: the first decision on its topic, and so a likely rule candidate.

**Collector's language:**
- the **set** is the work (a branch or deck);
- the **set symbol** is the area;
- the **collector number** is the card's position in the work ("3/7", the gist sentence as a number);
- the work is **complete** when every decision in it is settled.

On the Atlas, each node carries its rarity mark, so you can see where the mythics are at a glance.

## Guardrails

- **No points, streaks, pack openings or celebration on accept.** A celebration would reward the default direction. The foil shows whatever you answer.
- **Practice cards look exactly like their rarity.** A visual tell would defeat them.
- **Feedback rewards care, not volume.** The calibration mirror can say "rares you caught", "mythics answered with a full read", and "canaries caught". That's positive informational feedback, the kind the meta-analysis found helps.
- **Reduced motion means static foil.** Foil layers carry no essential information: the rarity mark and the label say it in text.
- **The rarity thresholds are tunable** in `.baesian/config.json`, with the distribution shown in the calibration view.
