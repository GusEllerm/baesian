---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Where a planted pick's case comes from: A case the agent writes for its alternative (B-sy0kz)."
created: 2026-11-10
updated: 2026-11-10
tags:
  - baesian
  - decision
aliases:
  - B-sy0kz
card: B-sy0kz
revision: 1
title: Where a planted pick's case comes from
question: On a practice card, should the planted pick come with a case the agent wrote for its alternative when it filed, or with no case of its own?
answer: A case the agent writes for its alternative
response: accept
not_chosen:
  - No case for the planted pick
answered: 2026-11-10T20:17:46.917Z
answered_by: GusEllerm
topic: calibration/practice-case
deck: calibration
level: blocking
reverse: cheap
touches:
  - schema
  - user-facing
filed: 2026-11-10T20:15:32.800Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-kb5yt Measuring whether you defer to the agent's case|B-kb5yt]]"
---

# Where a planted pick's case comes from

On a practice card, should the planted pick come with a case the agent wrote for its alternative when it filed, or with no case of its own?

**Decided:** A case the agent writes for its alternative, the agent's pick. Then cards gain an optional field, the agent's case for the option it didn't pick, never shown on its own card; only cards that carry one can come back as practice, so practice waits for cards filed from now on.

**Not chosen:** No case for the planted pick. Then the reveal shows the planted pick with the card's background and no case of its own, as on a card filed without a rationale; practice cards can come from the cards there are now.

**It turned on:** Would a pick shown with no case of its own stand out to you as practice? It would: A case the agent writes for its alternative. It wouldn't: No case for the planted pick.

**The fact given:** Practice cards use only the agent's own words: nothing generates text (the Client Data Contract, after D65). A card's case (its rationale, and what would show it wrong) argues for the pick the agent made. Of the 80 past cards practice could come from today, 76 have a rationale.

**First chose:** No case for the planted pick, then switched once the agent's pick was shown.

**The agent's case:** The reveal is where you decide whether to come round, so it's where a practice card most needs to look real; a pick with no case looks like 4 cards in 80. A case the agent wrote at filing reads like its other cases.

**Wrong if:** Agents write their alternatives' cases so much thinner than their rationales that the blind test spots practice cards at the reveal. **To check:** The blind test's marks, made after each reveal.

Answered by GusEllerm on 2026-11-10, through Baesian (card B-sy0kz, revision 1). Filed by claude-code on v1/next, in the deck “How Baesian learns from your answers”.

The record is in `.baesian/cards/B-sy0kz/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

B-kb5yt left this to be settled with the blind test, since the planted pick's case decides whether practice cards can pass it. The design is in [[Practice Cards]].

What a practice card keeps either way: the question, `doing`, the crux and its fact, and both options with their own crux answers and outcomes, swapped so the option the agent didn't pick is shown as its pick (D83). The original's rationale, "wrong if", check and `serves` go, since they argue for the other option. Its background (the body) stays; cards whose background speaks of "the proposal" or the agent's own pick (about one in six) are left out of practice.

Under the proposal, the field would be optional, written in the rationale's voice ("why take this one"), and named in building. Agents would know the field exists, but not which cards come back. A thin case for the alternative would also confound the measure: you'd come round to planted picks less because they're argued worse, not because you weigh agents' cases. Under the alternative, a planted pick could only measure coming round to a pick with no case, which isn't what you do on real cards.
