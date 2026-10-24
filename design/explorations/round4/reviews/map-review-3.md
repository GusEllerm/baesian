# Map review 3

Independent reviewer, fresh context, 2026-10-24, of map.js v3 (one stable level). Screenshots: scratchpad/harness/map-review-3/shots/.

## 1. Verdict: NOT SUFFICIENT

On the 15-decision project the map is close to sufficient. Opening it from any card answers questions 1–5 quickly, mostly through the inline relation tags and the side panel. At about 150 decisions it fails the job only it can do, which is orientation in the whole project. At 1280×800, half the areas are out of view when it opens, and nothing says what is hidden. Opened from a card in the second row, the first row is gone with no cue above. Your own card lands under the bottom fade. Hovering the queue list scrolls the map away and never scrolls it back. Separately, the layout is not stable: degree-of-interest naming makes chips grow and shrink, so marks move by up to 120 px between openings. The prototype's own header comment says "Nothing moves", and the research's main reason for a map is fixed coordinates. Neither fix needs a new form.

All screenshots are in `/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-3/shots/`. I give file names below.

## 2. Cold-read answers

1. **Where is my card, and what area and piece of work is it in?**
   - On the small project, and at scale with the card in row 1: high confidence. The card is outlined in yellow, tagged "your card", sits under its work's title inside its area, and the side panel repeats all of it.
   - At scale with the card in row 2: medium. The card sits on the bottom edge under the "More of the project below" fade, its tag is faded, and the area name may be scrolled off. The side panel rescues it.
2. **What does it build on, and what does it conflict with?**
   - High, but from the tags ("your card builds on this", "builds on your card", "may conflict", "disagrees") and the side panel, which gives each item's area and work.
   - From the lines alone: low. Arrowheads are hidden under the chips, lines within a lane show as stubs, and long cross-area lines run through unrelated labels and off-screen. The map gives no endpoint label; only the side panel names the far end.
3. **What else is settled, waiting or deferred?**
   - Small project: high, from each area's header counts.
   - Scale: low to medium. You only get counts for the areas in view, and answered decisions aren't counted at all.
4. **Where are the other waiting cards, and which is most urgent?**
   - Most urgent: high. The #1 badge matches the "Next up, with stopped agents first" list.
   - Locating the rest at scale: medium. About 12 of the 25 are below the fold, and the panel says only "and 19 more, named on the map". The "agent has stopped" dot is tiny.
5. **How do I get back, or go to another card?** High. "Back to the card (Esc)" is clear, and clicking a waiting chip goes to that card. The keyboard does work, but nothing tells you so.

## 3. Problems, ranked

**B1. BLOCKER: at scale the map doesn't keep the project in view or frame your card.**
- Evidence:
  - `sc-1280-02-open.png`: ci, docs, store and auth (4 of 8 areas, about 12 of 25 waiting cards) are entirely below the fold, with only a generic line saying there's more.
  - `sz-1440-00-after5.png` (opened from an auth card): gate, client, time and release are scrolled off the top with no cue above. Your card is under the bottom fade.
  - `sx-1280-06-ci-open.png`: the same problem at 1280×800.
  - `sq-1280-01-queue-hover.png`: hovering item 6 in "Next up" scrolls the map 670 px. Moving the pointer away leaves it there, with your card off-screen.
  - `sz-1440-02-end-map.png`: when everything is answered, the map opens at the previous scroll position (585 px) with row 1 hidden.
  - Area names are cut in half at the top edge when scrolled.
- Why it matters: this is the map's unique value. The side panels already cover the card's immediate context.
- Fix:
  - Add a sticky overview strip that is always visible (sketch in §5).
  - Scroll your card to the centre, clear of the fade (`block: "center"`).
  - Add a "more above" cue, and make both cues name what's hidden ("Below: ci, docs, store, auth: 12 to answer, 2 agents stopped").
  - Reset the scroll when the map opens.
  - On hover over the queue, point to the item's location rather than scrolling; scroll only on click.
  - Make area headers sticky.

**B2. BLOCKER: the layout moves.**
- Evidence (I measured the position of every mark):
  - Opening from the time-format card instead of the first card: 124 of 142 marks move by more than 2 px, up to 120 px. The whole second row shifts 51 px; from a ci card it shifts 17–35 px.
  - Clicking a dot expands it into a chip in place and pushes everything below down by about 80 px (`sy-1440-01-dot-hover.png` against `sy-1440-03-dot-click.png`).
  - On the small project, shifts are 17–20 px (`b-1440-00-open-first.png` against `b-1440-08-click-settled.png`).
- Why it matters: it's an explicit criterion of the bar, and the reason for having a map rather than a list.
- Fix: let degree of interest change emphasis, never size.
  - Decide what gets a name by a rule that doesn't depend on the card you're looking from: waiting and answered are always named, settled is always a dot.
  - Give chips a fixed two-line height.
  - Draw tags and the names of inspected dots in a floating layer that doesn't reflow.

**R1. The tooltip hides what it explains.**
- Evidence:
  - It sits above the mark and covers the related items it has just highlighted (`b-1440-01-hover-Which_time.png`, `b-1440-02-hover-Store_times.png`, `c-1440-02-kb-down5.png`).
  - It stays after a click and hides the "looking at" tag and the relation (`b-1440-10-click-deferred.png`).
  - It pops up when the map opens under a pointer left where it was (`d-1440-09-map-from-other-area.png`).
- Fix: place it to the side, away from related items. Hide it on click. Show none until the pointer moves after opening.

**R2. The lines don't read on their own.**
- Evidence: arrowheads, which the legend promises, sit under the chips' backgrounds, and lines within a lane are short arcs (`z-c-arrows.png`, `z-base-open-lines.png`). Long lines cross unrelated labels (`sx-1440-09-hub.png`).
- Fix: draw line ends above the chips, route lines through the gutters between areas, and label ends that are off-screen at the edge ("↓ docs: Lock search results").

**R3. Keyboard.**
- Arrows step through page order, so Down means "next", not "the one below". Nothing tells you about them, and j/k don't work in the map.
- Esc while looking at another decision closes the whole map. In the rest of the client, Esc steps back one level.
- Fix: arrows that move spatially, j/k between waiting cards, a key hint in the map's bar, and Esc returning to your card's connections first.

**R4. Counts ignore answers.** `d-1440-12-map-end.png`: client says "nothing to answer, 3 settled" next to three green answers. Add "3 answered".

**R5. Legend gaps.**
- It doesn't explain the queue-number badges, the outline on your card, or what a row of dots is.
- The map uses three words for conflict ("conflicts", "may conflict", "disagrees") against one legend entry.
- Fix: add those entries, and make the "agent has stopped" dot larger on the map.

## 4. What works and must be kept

- **Degree-of-interest naming.** Waiting, answered and related decisions get names; runs of settled ones collapse to marks. Each area stays readable at 150 decisions.
- **Relation tags written from your side** ("your card builds on this", "builds on your card"), with the side panel giving each one's area and work. This is the clearest part of the map.
- **Footprints.** "answered: you chose 'X'" turns the map into a record of your review.
- **Clicks that depend on kind.** Waiting goes to the card, answered opens your answer, anything else shows its connections, and "Show my card's connections instead" brings you back.
- **Queue numbers** on the map match the "Next up, with stopped agents first" list.
- **Consistency with the card view.** The same marks and type as the card view, a fixed order of areas, and the Space peek works without ever confirming an answer.

## 5. Is the form right?

Mostly. Areas as cells, pieces of work as lanes and time order are right. A single level with degree-of-interest labelling serves 15 decisions well. At 150 decisions on an 800 px screen it can't show the whole project, and that is exactly what the research's semantic zoom was for. Keep this view as the detailed level, and add a level 0 that always fits on screen:

```
┌ Project map · your card ◇19 "Stream error reports" — ci › Rework topic aliases  [Back Esc] ┐
│ gate ♛◇○●  4 ●3 │ client ♛◇○ 3 │ time ☆☆○○ 4 │ release ○◇ 2 │      ← always visible,       │
│ ci ☆◇[◇]☆☆ 5    │ docs ◇☆ 2    │ store ☆ 1   │ auth ♛◇○☆ 4 ●2│        click to jump         │
│  ▲builds on                                                       ●n = agents stopped       │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ today's grid, fixed slot sizes, your card centred, sticky area headers;                     │
│ a line that leaves the screen ends in an edge label:  "↑ gate · Debounce search results"    │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

The strip shows each area's waiting cards as marks and its stopped agents. It also tags the areas related to your card ("builds on", "conflicts"), so relations across areas stay visible even when their endpoints are scrolled away. Space could peek the strip alone.

I edited no project files.