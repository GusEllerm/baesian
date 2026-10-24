# Map review 1

Independent reviewer, fresh context, 2026-10-24, of the project map only. Screenshots: scratchpad/harness/map-review-1/shots/.

## 1. Verdict: NOT SUFFICIENT

The project map fails the bar in four ways. First, the "This area" view is framed on the current card's related decisions, not on the area, so it routinely crops the area you're in, clips labels at both edges and runs relations off-screen. You can't pan to recover them. Second, switching from "Whole project" back to "This area" corrupts the camera (the viewBox becomes NaN), and the current card can end up off-screen. Third, the two zoom levels are different representations: an SVG of lanes and an HTML list. Nothing stays in place between them, and the project level drops every relation. Fourth, the geometry is hard-coded to the sample data and falls apart at 150 decisions. Questions 1 and 5 are answerable from most openings. Questions 3 and 4 aren't answerable in the default view. Today the "Whole project" list does most of the useful work, and it's a table of contents, not a map.

All screenshots are in `/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-1/shots/` (abbreviated as `…/shots/` below). The scripts are in the parent folder, `map-review-1/`.

## 2. Cold-read answers

| Opening | Q1 Where am I | Q2 Builds on / conflicts | Q3 Settled, waiting, deferred | Q4 Other waiting cards, most urgent | Q5 Back or go |
|---|---|---|---|---|---|
| First card, client, mythic (`…/shots/1440-a02-map-area-first.png`) | Ring, caption and the "client" heading: high, about 5 s | The "builds on" arrow is legible once you read the legend. The conflicting rule's area name is clipped ("gate" is cut off), so you need to hover: medium | Not answerable: the rest of client is cut off on the right, and the other areas are at 14% opacity: low | No urgency marks on the SVG: none | Esc, the back button, or click a node: high |
| Time conflict card (`…/shots/1440-b-02-after1-area.png`) | High | Both conflicts are visible and labelled: high | Low | None | High |
| Release card (`…/shots/1440-b-13-card-area.png`) | High | Deferred dependency is visible: high | Two thirds of the screen is empty, plus an empty neighbouring frame: low | None | High |
| After Project → Area (`…/shots/1440-a08-area-again.png`) | The card is clipped or off-screen: fails | Fails | Low | None | High |
| End, everything answered (`…/shots/1440-b-21-end-map-area.png`) | Rings an answered card, with no caption: a first-time user would answer wrongly | n/a | Project list is good: high | n/a | High |
| "Whole project", any card (`…/shots/1440-a06-project.png`) | Bold item with a ringed glyph: medium | No relations shown: none | High, after about 15 s of reading | You have to scan the text for "an agent is stopped"; there's no order: medium | High |

## 3. Problems, ranked

**1. BLOCKER: "This area" doesn't show the area.**
- What's wrong: `viewFor()` in `atlas.js` (lines 163–167) frames the x-range of the current and related decisions, with a minimum width, not the area's bounds. Columns and labels get clipped at both edges: "Live u…", "Cache ren…", "gate", "release". Relations run off-screen with no labelled endpoint, and there is no wheel or drag pan.
- Evidence: `…/shots/1440-a02-map-area-first.png`, `…/shots/1440-b-02-after1-area.png`, `…/shots/1440-b-12-card-area.png`, `…/shots/1280-a02-map-area-first.png`.
- Why it matters: it breaks Q3 and Q4 and the no-clipping bar, and the label lies.
- Fix: always frame the whole area. Show related decisions outside it as edge stubs with labelled, clickable chips, e.g. "conflicts → Never put secrets in URLs · gate".

**2. BLOCKER: the camera breaks after "Whole project".**
- What's wrong: the canvas is `display:none` at project level, so `aspect()` returns 0 and `viewFor("project")` returns Infinity. The glide back then produces a viewBox of "NaN NaN NaN NaN", which the console logs dozens of times.
- Evidence: `…/shots/1440-a08-area-again.png`, `…/shots/1280-a08-area-again.png`. In the 1280 shot the current card is entirely off-screen.
- Fix: don't compute a camera on the hidden canvas, guard `aspect()` against zero, and jump instead of gliding from an invalid camera.

**3. BLOCKER: the two levels share no representation or positions.**
- What's wrong: the area level is lanes; the project level is four text columns. Nothing animates between them, and edges are removed from both the project view and the legend.
- Evidence: compare `…/shots/1440-a02-map-area-first.png` with `…/shots/1440-a06-project.png`.
- Why it matters: it fails "the same thing stays in the same place" and "relations across areas".
- Fix: one representation, zoomed (section 5).

**4. BLOCKER: it doesn't scale.**
- What's wrong: there are 4 slots per lane, 2 lanes per area, and a 4-column grid. I served about 150 decisions in 8 areas by intercepting `data.js` (no files edited).
  - Lanes overflowed into the next column.
  - Lanes past the second spilled below their area's box.
  - One far-away conflict zoomed the area view out to 7,450 units, with text about 3 px tall.
  - The overview became 2,352 px tall, three screens, with the second row of areas below the fold.
- Evidence: `…/shots/1440-c01-scale-area-first.png`, `…/shots/1440-c02-scale-project.png`.
- Fix: lay out from the data, at a fixed glyph pitch. Label by degree of interest.

**5. Urgency and "waiting" are missing from the map.**
- What's wrong: the SVG has no "agent stopped" mark and no queue order. Settled nodes say "settled", but waiting nodes carry no word. Waiting cards in other areas are faded to 14%. The map also covers the queue dock, which is the one place urgency is shown.
- Evidence: `…/shots/1440-a02-map-area-first.png`, `…/shots/1440-b-02-after1-area.png`.
- Fix:
  - reuse the queue chip's red "stopped" dot;
  - add numbered queue order;
  - fade only settled decisions, never waiting ones (degree of interest: open is interesting).

**6. The end state misleads.**
- What's wrong: with nothing left, the map rings the first queue card, which is already answered, and the caption is just "Project map."
- Evidence: `…/shots/1440-b-21-end-map-area.png`.
- Fix: open at "Whole project" with "All answered" and no ring.

**7. Encoding gaps.**
- The legend doesn't explain the ring, the fading, or the bold labels.
- "Answered" is drawn three ways: the legend's green dot, a green rarity shape on the SVG, and a rarity glyph with green text in the list (`…/shots/1440-b-22-end-map-project.png`).
- Which option you chose isn't shown.
- Common, settled and deferred are three circles that differ only by fill.
- The arrow points to the later decision, so it reads backwards against "builds on".
- Fix:
  - add "◎ this card" and "faded: other areas" to the legend;
  - draw answered as the glyph plus ✓ everywhere;
  - give deferred its own shape;
  - label edges "needs".

**8. Interaction is inconsistent.**
- Clicking an answered node does nothing (`…/shots/1440-b-04-click-answered.png`), but the project caption says to click answered cards to see them.
- Hovering doesn't light up a node's relations.
- Tab moves focus to the hidden card's "Choose this" buttons behind the overlay, and nodes can't be focused.
- Opening, closing and zooming are instant cuts, not the staged moves of about 1 s the research asked for.
- The scale changes from card to card: the view is 1,257 to 1,630 units wide, so labels run from about 10 to 15 px.
- Fix:
  - one click rule: waiting cards go to the card, answered ones reopen it;
  - trap focus in the map and let j/k move the ring;
  - glide for about 300 ms;
  - keep a fixed scale for each level.

**9. Dead space.**
- Half of the area canvas is empty, and the bottom 40% of the project view is empty.
- Evidence: `…/shots/1440-b-13-card-area.png`, `…/shots/1440-a06-project.png`.

**10. Polish at 1280.**
- The caption wraps to two lines and the labels shrink.
- Evidence: `…/shots/1280-b-02-after1-area.png`.

**Does it earn its place?** Only partly. The area view mostly repeats the side panels, less legibly. Only the project list adds something.

## 4. What works and must be kept

- The shared set of marks: rarity glyphs that match the queue and the card, the blue square for rules, the dashed ring for an agent's own call.
- The hover sentence: "your rule, in the work 'The commit gate'. Click to go to it."
- The overview's area → work → decision structure, with the state in words and links you can click.
- M, holding Space, Esc, the "Back to the card Esc" button, and remembering the zoom level.
- The caption naming the current decision.
- Green footprints for answered cards.
- Fixed world positions and fading by interest. These are the right ideas, wrongly tuned.
- Clicking a waiting node goes straight to that card.

## 5. Recommended form: an area-block map with the current card's relations drawn on top

This is a **redesign** of the geometry and the zoom model. It reuses the overview's structure, the marks and the interactions.

```
Project map · baesian  [Whole project|This area]  5 waiting · 2 agents stopped   Back to the card Esc
┌ gate ─── 0 waiting ┐┌ client ── 3 waiting ┐┌ time ─── 1 waiting ┐┌ release ─ 1 waiting ┐
│ The commit gate    ││ The local server    ││ Card timestamps    ││ Ship 0.1.0          │
│  ●  ■  ●           ││  ●━━▶◉  ◇           ││  ●  ☆•             ││  ‖━━▶○              │
│     ┆              ││ The client's views  ││                    ││                     │
│     ┆              ││  ●  ◌  ○            ││                    ││                     │
└─────┆──────────────┘└─────────────────────┘└────────────────────┘└─────────────────────┘
┌ ci ──────┐┌ docs ────┐┌ store ───┐┌ auth ────┐   all 8 areas always on screen
      ┆
 ◉ Where the access token lives · client · agent stopped
     needs       ● Serve the client with Node's http module · client
     conflicts   ■ Never put secrets in URLs · your rule · gate
 Waiting, in queue order: ① ♛• Where the access token lives  ② ☆• Which time format  ③ ◇ Live updates
 ● settled ■ rule ◌ agent's call ‖ deferred ○◇☆♛ waiting • agent stopped ✓ answered ◉ this card
```

- **Whole project** (the default for Space):
  - each decision is an unlabelled glyph at a fixed position in its work's row, inside a fixed block for its area;
  - only the current card's relations are drawn, and every endpoint is on screen, named in the panel below;
  - hovering shows any node's name and lights up its relations;
  - the queue strip answers Q4.
- **This area:** the camera glides into the same block in place. Every decision gets a label and the lanes become visible. The other blocks stay as dim tiles at the edges, showing their counts.
- **At 150 decisions in 8 areas:** about 19 glyphs per block at a pitch of about 14 px. Eight blocks fit at 1280×800 without scrolling. In long works, older settled decisions collapse to "+12 settled".