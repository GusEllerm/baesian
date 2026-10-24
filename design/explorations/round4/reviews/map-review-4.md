# Map review 4

Independent reviewer, fresh context, 2026-10-24, of map.js v4 (fixed cells, strip, edge cues). Screenshots: scratchpad/harness/map-review-4/shots/.

## 1. Verdict: NOT SUFFICIENT

The structure is sound. Areas sit in fixed cells and pieces of work are lanes. The layout never moves between openings: I measured identical block positions from four different cards and while inspecting. Inspect and Esc work one level at a time, the relation tags use the card view's words, and the strip gives a real cross-area signal. On the small project at 1440 it comes close to the bar. At about 150 decisions, and at 1280, the map hides what it exists to show:
- floating labels cover your own card's name, waiting cards and each other, and get cut off at the screen edges;
- sticky area headers swallow related decisions and cards focused with j/k;
- the tooltip lands away from the thing you hovered and covers what it's connected to.

These are mechanical faults, not conceptual ones, but they break "nothing is cut off", "holds up at 150" and "polish at both sizes".

## 2. Cold-read answers

1. **Where is my card; which area and work?** Small project: high confidence. It has a cream outlined chip with a "your card" tag, and the side panel says "in 'The local server…', client". At scale it's centred on open and the strip tags the area, so mostly high. It drops to low when a floating label covers the card's name (the auth example in problem 1).
2. **What does it build on or conflict with, including other areas?** Small: high, from the tags and the side panel. The map's own lines are weak: the builds-on line between neighbouring chips doesn't show. At scale: medium. The side panel is reliable and the strip says "client disagrees, docs disagrees", but on the map the labels collide or are clipped and the far ends are hidden.
3. **What's settled, waiting or deferred?** Medium. The count line in each area header answers it, but rules and agents' own calls are counted as "settled", and at scale the settled runs are unnamed dots you must hover.
4. **Where are the other cards waiting, and which is most urgent?** Small: high (order numbers, "Next up" #1). Scale: medium. The strip shows waiting marks per area, but the side panel lists only six; finding #7 onward means scrolling, and j sometimes lands under a header.
5. **How do I get back or go elsewhere?** High: "Back to the card Esc", click any card, Esc steps back out of inspect first. At 1280 the map's key hints vanish.

## 3. Problems, ranked

**1. BLOCKER: floating labels cover content and are cut off.**
- **What's wrong:** labels for unnamed dots and for off-screen line ends sit on top of the grid with no collision handling. They cover:
  - your own card's name: "Versi…", with the label itself cut to "Log ses…" or "L…" at the side-panel edge;
  - waiting card #16;
  - an answered card's name;
  - each other: three labels stack at the same y.
- **Clipping:** at 1280 an off-screen label is cut at the left edge ("ur card builds on this…").
- **Evidence:**
  - /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-4/shots/s12-1280-space-auth.png
  - /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-4/shots/s12-1440-space-auth.png
  - /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-4/shots/s13-1440-inspect-hub.png
  - /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-4/shots/s8-1280-ci-open.png
  - /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-4/shots/s15-1280-scale-after2.png
- **Why it matters:** it breaks questions 1 and 2 at scale, and "nothing is cut off".
- **Fix:**
  - Don't float names over the grid. Give each related decision a small letter badge (A, B…) that matches the side panel's list, which already names each one with its state and place.
  - Put off-screen ends in a fixed bar outside the scroll area ("↑ A builds on: Debounce…, gate"). Make it clickable so it scrolls there, and clamp it to the body's width.

**2. BLOCKER: sticky headers and the edge cues hide decisions.**
- **What's wrong:**
  - A related decision in the visible strip under a sticky header counts as "in view". So no off-screen label appears, the line ends under the header, and the "↑ Above" cue leaves that area out.
  - With j/k, cards 4, 5, 19, 22 and 23 scroll under the header and can't be seen. The tooltip then floats over the app header.
  - The "Above" gradient also washes out the sticky area names, including your own area's.
- **Evidence:**
  - /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-4/shots/s11-1280-j5-under-header.png
  - /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-4/shots/s9-hidden-endpoint-zoom.png
  - /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-4/shots/s12-1440-strip-click.png
- **Why it matters:** keyboard movement and cross-area relations fail at exactly the scale where they're needed.
- **Fix:**
  - Set `scroll-padding-top` to the header plus cue height, and scroll to the centre rather than "nearest".
  - Test visibility against the area below the sticky header.
  - Move the Above/Below cues out of the scroll area, into the strip row or the bottom edge.

**3. BLOCKER (a one-line fix): the tooltip lands in the wrong place.**
- **What's wrong:** `.map-tip` has `transform: translate(-50%, calc(-100% - 10px))`, but `setHover` works out `left` and `top` for a box that isn't transformed. The tip ends up up and to the left, over:
  - the decisions it lists as connected (hovering "Which time format…" covers "Store times as ISO…");
  - the neighbouring area headers;
  - other columns, up to about 450 px away.
- **Evidence:**
  - /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-4/shots/s2-04-hover-time-waiting.png
  - /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-4/shots/s15-1280-small-hover-rightcol.png
- **Why it matters:** hover is the main way to inspect, on every hover.
- **Fix:** remove the transform. Also clamp the tip vertically to the map body, not to the whole map.

**4. Builds-on lines don't show between neighbours.** The curve runs under the adjacent chip, leaving a stray arrowhead in the gap. Elsewhere lines cross the text of unrelated chips.
- **Evidence:**
  - /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-4/shots/s1-03-zoom-lines.png
  - /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-4/shots/s3-02-map-card2.png
- **Fix:** drop the line for neighbours in the same lane (the tag already says it), and route the others through the gutters between columns.

**5. Keyboard hints disappear below 1320 px wide,** so the map has no visible keys at 1280.
- **Evidence:** /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-4/shots/s7-1280-02-open.png
- **Fix:** move the hints into the legend row.

**6. The strip is unexplained and can mask a conflict.**
- It has no visible title, and nothing says its marks are only the cards to answer.
- It doesn't show which card is #1.
- Each area's tag shows only the first relation found, so a conflict can read as "connected".
- **Fix:** label it "To answer, by area", put the order numbers on the marks, and give conflicts priority in the tag.

**7. Smaller issues.**
- The caption says "left to right", but the lanes read top to bottom.
- The count lines fold rules and agents' calls into "settled".
- The cue says "1 agents stopped".
- ArrowDown at the bottom of a column jumps sideways to another column.
- Hovering a "Next up" entry whose decision is off screen gives no sign of where it is.

## 4. What works and must be kept

- **A stable layout:** fixed cells and lanes, and nothing re-lays out between cards or when inspecting.
- **The inspect model:**
  - clicking a card to answer opens it, and clicking an answered one opens your answer;
  - anything else becomes "looking at", which changes only highlights and tags;
  - Esc steps back out of inspect, then closes the map.
- **Typed tags in the card view's words, and a side panel** that lists each relation with its state, piece of work and area.
- **The strip as level 0:** "your card", "disagrees" and "connected" per area, with the waiting marks, and a click scrolls to the area.
- **The ordering:** order numbers, and "Next up, with stopped agents first".
- **Answered footprints** ("answered: you chose …"), and the same marks as everywhere else in the client.
- **The entry points:** M, holding Space, the header button and a short fade; and the "Below: ci, docs… 12 to answer" cues.
- **The all-answered state.**

## 5. Is the form right?

Mostly. Keep the stable layout of areas, then pieces of work, then decisions, with the strip on top. But the lanes are currently vertical lists inside narrow cells. That makes the map 2.5 to 3 screens tall at 150 decisions, which is what brings in the sticky headers, the floating labels and the hidden ends.

The Atlas in the research note says decisions sit along each lane in time order. Taking that literally, each lane is one horizontal track, and the whole project fits on one screen. At #scale that's 21 lanes and 8 area rows, about 620 to 720 px tall, which fits even at 1280×800. Rules for the tracks:
- only the cards to answer, and your card, carry a short name inline;
- settled decisions stay as marks;
- relations are letter-badged and named only in the side panel;
- nothing ever floats over the grid.

```
┌ Project map · your card ♛1 Lock session state · gate › Speed up session state ─── [Back Esc] ┐
│ AREA · WORK              OLDEST ─────────────────────────────────────▶ NEWEST │ YOUR CARD     │
│ gate  4 to answer · 11 settled                                                 │ ♛ Lock session│
│  The commit gate         ● ■ ●                                                 │ A builds on ● │
│  Speed up session state  ■ ● ● ◇8 Compress… ● ●[♛1 Lock session…]◌ Ⓐ● ◉3 Lock… │   Paginate…   │
│ client  3 to answer · 9 settled                                                │ B may conflict│
│  The local server        ● ♛4 Where the access… ◇9 Live updates…               │   ■ Log…, time│
│  The client's views      ● ◌ ○10 Cache rendered…                               │ NEXT UP       │
│ time  4 to answer · 8 settled                                                  │ 1 ♛ Lock sess…│
│  Harden the record sync  Ⓑ■ ● ● ■ ☆11 Cache topic…   ○12 Shard…  ◌  ○13 Sign… │ 2 ◇ Lock card…│
│ … ci · docs · store · auth: all on one screen, no scrolling                    │ …             │
└──────────────────────────────────────────────────────────────────────────────┴───────────────┘
```

The lines run between the marks, across the area rows. The lettered endpoints (Ⓐ, Ⓑ) match the side panel, so you never need a floating label.

Scripts and all screenshots are in /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-4/ (screenshots under /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-4/shots/). I didn't edit any prototype files.