# Map review 6

Independent reviewer, fresh context, 2026-10-24, of map.js v6 (tracks, edge bars). Screenshots: scratchpad/harness/map-review-6/shots/.

## 1. Verdict: NOT SUFFICIENT, because of one bug with a one-line fix

The map is close. Its form is right, it holds up at 150 decisions, and from any card a first-time user can answer questions 1–5 within about 20 seconds. One bug sits on a common path, though, and it makes the map contradict itself about which decision is outlined:
- you click a decision to look at it, then close the map any way other than Esc (M, Space release, or the "Back to the card" button);
- the next time the map opens, the caption still reads "You're looking at '<that decision>', outlined";
- in fact your own card is outlined, and the side panel says "The card you're answering".

That undermines question 1. Once it's fixed I'd call the map SUFFICIENT: everything else below is a refinement.

## 2. Cold-read answers

1. **Where is my card, and in what area and piece of work?** The yellow outlined chip, plus a pulse when the map opens. The side panel names the card, its piece of work and its area. On opening, the map scrolls so your card and everything it's connected to are in view, including from the bottom of `#scale`. **High** confidence, except right after the stale-caption bug, when it drops to low.
2. **What does it build on or conflict with, including in other areas?** Each related decision has a letter that matches the panel, which tags the relation ("may conflict", "your card builds on this") with its place and state. Lines run between areas: dashed wine for conflicts, arrows for builds-on. When a related decision is off-screen, a labelled chip in the edge bar ("B ↑ gate") stands in for it. Decisions next to each other get a letter but no line, and the panel covers that. **High.**
3. **What else is settled, waiting or deferred?** Each area header counts them, and the legend explains every mark. The weak spots: the deferred mark is pale and small, and at scale the area tallies are glyph plus number only. **Medium-high.**
4. **Where are the other waiting cards, and which is most urgent?** Numbers on the chips, with 1 the most urgent (stopped agents first), and a "Next up" list. At scale, the edge bars list the numbers that are off-screen ("Below: … to answer: 6 7"). The numbers are scattered across the map, and they renumber after every answer. **High** for the most urgent, **medium** for finding, say, number 9.
5. **How do I get back or go elsewhere?** "Back to the card Esc", clicking a chip, or Enter. Esc steps back one level at a time. While you're looking at another decision there are two different "backs", which is confusing. **High / medium.**

## 3. Problems, ranked

Screenshots are in `/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-6/shots/`, written below as `shots/<name>`.

**1. BLOCKER: the caption and close button are stale after you close the map while looking at another decision.**
- **Evidence:** `shots/1280-111-stale-caption-after-close.png`. The caption says "You're looking at 'Store times as ISO 8601 strings', outlined", but the outlined chip is your card and the panel says "The card you're answering". The close button has also lost its Esc key.
- **Cause:** `openMap()` calls `mapCaption()` and `mapCloseLabel()` before `map.show()` resets `inspect`. It's reproducible after closing with M, Space release or the header button.
- **Why it matters:** the first line a user reads misidentifies the subject.
- **Fix:** call `map.show()` first, or clear `inspect` in `closeMap()`.

**2. The layout moves, despite the "nothing ever moves" promise.** I measured three shifts:
- (a) Looking at another decision drops the Esc key from the close button. The map bar shrinks from 50 to 43 px, so the whole map jumps up 7–8 px on every click and again on Esc (`shots/1440-03-map-first.png` against `shots/1440-11-inspect-rule.png`).
- (b) At scale, after answering 4 cards, the gate area's counts wrap onto one line fewer. Everything below moves up 13 px (for example "Stream error reports" goes from y 358 to 345).
- (c) An answered chip loses its order number, so later decisions in the same track slide 13–21 px sideways.
- **Why it matters:** stable layout is the core claim of the Atlas.
- **Fix:** give the map bar a fixed height (hide the Esc key's slot rather than removing it); give area headers a fixed height (reserve the lines, or use single-line counts); put the answered tick in the number's slot.

**3. Two different "backs".**
- While you're looking at another decision, the header button says "Back to the card" and closes the map. The caption says "Esc goes back to your card", but Esc only restores your card's connections inside the map.
- When everything is answered, the caption still says "Esc goes back to your card", and there is no card (`shots/1280-43-map-all-done-inspect.png`).
- **Fix:** label the button "Close the map" always. Make the caption say "Esc: back to your card's connections", or "Esc: back to the whole map" when there's no card.

**4. The side panel is cut off at 1280 with no cue.**
- When the subject has 3 or more relations, the panel's queue scrolls under the legend: 720 px of content in a 636 px panel. Item 6 is cut in half and "and 19 more" is hidden (`shots/1280-6x-timefmt.png`, `shots/1280-70-scale-inspect-deferred.png`).
- **Fix:** show only as many queue items as fit and keep the "n more" line pinned; or add a fade with "more below"; or make the relation rows more compact.

**5. When your card scrolls out of view, the edge bars don't say so.**
- After j/k or a manual scroll, the bar shows your card's order number but nothing marks it as yours (`shots/1280-92-scale-j6.png`).
- **Fix:** add a "you ↑ gate" chip like the relation chips, which reveals it on click.

**6. The tooltip covers what it explains.**
- Hovering the rule puts the tooltip over your card and the conflict line it's describing.
- It also repeats itself: "A: may conflict" and then "Connected: may conflict 'Where the access token lives'" (`shots/1440-05-hover-rule.png`).
- **Fix:** place it on the side away from the subject and the line's path, and drop the line that duplicates the letter.

**7. The order numbers churn.**
- Every answer renumbers almost every chip ("Compress gate facts" goes from 8 to 4: `shots/1440-52-scale-map-first.png` against `shots/1440-101-scale-after4.png`). They read like IDs.
- **Fix:** number only the next 5 or so and mark the rest as "waiting", or make the legend say "next-up rank".

**8. Small refinements:**
- The relation wording varies: the legend says "conflicts", the panel says "disagrees", "may conflict" or "conflicts".
- The "A · you" badge covers the chip's mark (`shots/1280-70-scale-inspect-deferred.png`).
- ↑ doesn't reverse ↓ in keyboard navigation (from "Live updates", ↑ goes to a different gate decision).
- At scale, area headers drop the answered count ("1 to answer" when 3 have been answered).
- Newly arrived cards appear without any signal ("Relative times in the queue", `shots/1440-26-map-after2.png`).
- The shared "Oldest decision first → newest" heading suggests decisions line up in time across tracks. They don't: position is only an order within each track.

## 4. What works and must be kept

- **Areas as rows, pieces of work as tracks, decisions in time order.** A decision gets a name only when it's to answer or answered, and settled ones, rules and deferred ones are marks. This is what makes 142 marks readable at 1280.
- **Letters shared between map and panel.** The panel's typed tags with place and state answer question 2 precisely, and hovering a panel row points at the decision on the map.
- **Framing on open,** so your card and its connections fit on screen, and the pulse.
- **The edge bars:** areas out of view, the numbers of off-screen cards, stopped agents, and clickable relation chips. This is the best part at scale.
- **Order numbers on the map, with j/k following queue order.**
- **Esc going back one level at a time,** Space to peek, M, the header button, and Enter to open the focused card.
- **Footprints for answered cards** (green tint and tick), and the reopened state ("The card you reopened: you chose …").
- **Fading areas that don't concern you,** a minimal legend that includes the keys, and the all-answered state.
- **It earns its place.** The side panels can't show a conflict running from time to a deferred decision in docs, or where the 25 waiting cards sit.

## 5. Form

The form is right, so I'm not proposing an alternative. Where it departs from the Atlas, the departures are sensible:
- There's no semantic zoom and no staged move of about 1 s. The map is a separate overlay and the card view stays put. That matches the research's own rule that the view where you judge stays static.
- Space shows the whole map rather than zooming out one level.

Two gaps from the research are worth closing:
- **"Changed since you last looked":** new or changed decisions get a marker that fades once seen.
- **Stronger degree of interest at scale:** almost every area has a card to answer, so nothing fades and every settled dot weighs the same. Shrinking the settled run between named chips would help, for example "●●●●" collapsing to "·4·", expanding on hover.

Fix #1 first, then #2 and #3; the rest are polish.