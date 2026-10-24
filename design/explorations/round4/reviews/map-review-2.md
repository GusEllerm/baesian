# Map review 2

Independent reviewer, fresh context, 2026-10-24, of the redesigned map (map.js v2). Screenshots: scratchpad/harness/map-review-2/shots/.

## 1. Verdict: NOT SUFFICIENT

The map's core vocabulary works well. The subject tile is unmistakable, relation tags sit on the endpoints, and the typed panel and clickable queue make it easy to jump between cards. On the 4-area project, "Whole project" is a good overview. It fails three bar items outright, though:
- **The same thing doesn't stay in the same place.** Lanes change direction between the two levels, area positions depend on which card you opened from, and inspecting a decision folds your own card's area. None of it animates.
- **It doesn't hold up at 150 decisions / 8 areas.** "Whole project" loses every decision label, and piece-of-work names are cut to 6–10 characters.
- **At scale the default level can open with your card off-screen,** below the fold with no scroll indicator.

Each has a contained fix. Until they're fixed, question 1 ("where am I") isn't reliably answerable.

All screenshots below are in /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-2/shots/

## 2. Cold-read answers

The openings I tried:
- **A:** the first card, "This area"
- **B:** Space-peek after one answer (time card)
- **C:** the release card
- **D:** while inspecting a rule or a settled decision
- **E:** all answered
- **F:** the scale project, "This area"
- **G:** the scale project, "Whole project"

1. **Where is my card, and in what area and work?**
   - A–C: high, about 3 s. Yellow outlined tile, plus the panel sentence "…in 'The local server…', client."
   - D: low. Your card's area folds, your card becomes an unmarked crown, and the caption still says "Your card's area is open."
   - F: high, except where the card is off-screen.
   - G: medium. You have to find a yellow-filled ringed mark among about 110 marks, and related marks get the same ring.
2. **What does it need or conflict with?**
   - A–C: high, from the tags ("needed by your card", "may conflict") and the panel.
   - Cross-area endpoints are ringed, unlabelled marks inside folded blocks. They are named only in the panel or on hover, and the lines are barely readable.
3. **What's settled, waiting or deferred elsewhere?**
   - Small project, "Whole project": high.
   - "This area": low to medium. You decode marks with the legend, and area headers count only "to answer".
   - Scale: low.
4. **Where are the other waiting cards, and which is most urgent?**
   - Medium. The panel's "To answer, in order" #1 is the obvious pick, but the ordering rule (blocking first, then by area) isn't stated.
   - At scale, cards #7–25 can't be found without hovering mark by mark.
5. **How do I get back or go elsewhere?**
   - High: "Back to the card Esc", plus the tooltips "Click to answer it" and the clickable queue.
   - Confusing in D: two "back" controls do different things.

## 3. Problems, ranked

**P1. BLOCKER: At scale, your card can open off-screen, and long areas are clipped without any cue.**
- **Evidence:**
  - h-1440-70-B-s0128-offscreen.png and h-1280-70-B-s0128-offscreen.png: the subject is below the fold. Only "needed by your card" shows, with its line running off the bottom. B-s0122 does the same at 1280.
  - g-1440-60-B-s0040-area.png: the ci block is 1030 px tall, cut mid-lane.
  - sc-1280-02-map-area.png: gate is clipped.
- **Why it matters:** question 1 fails on opening, and "nothing cut off" fails.
- **Fix:** scroll the subject into view on open, on level change and on inspect, with a bottom fade or a "↓ 7 more in ci" cue. Better still, keep the focus area within the viewport by folding more of its settled decisions.

**P2. BLOCKER: The layout isn't stable.**
- **Evidence:**
  - a-1440-02-map-area.png vs a-1440-04-project.png: the client lanes are a 3-wide wrapping grid in "This area" and a single vertical list in "Whole project". Gate's marks flip from a row to a column.
  - b-1440-12-toarea-30ms.png: at 30 ms the layout is already final. The 360 ms flex transition never runs, because `render()` rebuilds `innerHTML`.
  - d-1440-42-map-release-area.png vs a-1440-02-map-area.png: release sits at x=951 or x=533, and time at 782 or 365, depending on which card you opened from.
  - b-1440-19-click-rule-nohover.png and b-1440-20-click-settled-time.png: clicking a rule or settled decision makes *its* area the open one, folds yours, and leaves the caption stale.
  - b-1440-24-click-agent.png: while inspecting, your card carries no mark at all.
- **Why it matters:** the bar and the Atlas both require fixed coordinates and motion only for change. Here you lose your place on every toggle and every inspect.
- **Fix:**
  - Use one lane direction (rows, time left to right) at both levels.
  - Give each area a fixed slot that doesn't depend on the focus (see section 5).
  - Inspecting should never change which area is open.
  - Keep a persistent "your card" marker (an outline plus a "your card" tag) whatever is being inspected.
  - Animate the change: either FLIP the tiles, or update the classes in place instead of rebuilding the DOM.

**P3. BLOCKER: The scale project loses labels while half the screen is empty.**
- **Evidence:**
  - sc-1440-04-project.png and sc-1280-04-project.png: all 8 blocks are 109–124 px wide, so every block folds to marks, and 20 work titles are truncated ("The comm…", "Rework …").
  - g-1280-60-B-v8nq3-area.png: folded headers wrap to 3 lines, and titles show about 6 characters.
  - The map ends around y=530 of 840.
- **Also:** the side panel names a related decision's area but never its work.
- **Why it matters:** "Whole project" at scale becomes a dot matrix you can only read by hovering. Pieces of work, one of the three things the map exists to show, can't be read.
- **Fix:** past about 5 areas, wrap the areas into 2 rows so each gets 260 px or more and keeps labels. Never truncate work names; wrap them, or abbreviate in a legible way. Add the work to the panel's relation lines.

**P4. Lines are mostly invisible where they matter.**
- **Evidence:** z-1440-80-lines-area-zoom.png and c-1440-34-map-after-2.png. Lines run under the tiles: the "needs" line to a neighbour is a 15 px stub with no visible arrowhead, and the conflict line breaks into dashes under headers.
- **Why it matters:** the legend explains marks you can't actually see. The tags save the meaning.
- **Fix:** draw lines above the tile backgrounds but below the text, or route them in the gutters. Add "decides between" to the legend.

**P5. Hovering a decision draws its relations illegibly.**
- **Evidence:** b-1440-16-hover-waiting-folded.png. Hover lines are faint fragments, and the endpoints get no ring or tag.
- **Why it matters:** this is the only way to discover cross-area relations for anything other than your card.
- **Fix:** on hover, ring the endpoints and show a temporary tag.

**P6. Controls during inspect are misleading.**
- **Evidence:** b-1440-19-click-rule-nohover.png.
  - "Back to the card" (in the header, closes the map) and "Back to the card you're answering" (in the panel, resets the subject) do different things.
  - The caption is stale.
  - When everything is answered, the header still says "Back to the card" (d-1440-46-all-done-map.png).
- **Fix:** rename the panel link to "Show my card's connections", rewrite the caption to describe what's being inspected, and use "Close map" when there's no card.

**P7. Urgency and status are under-explained.**
- **Evidence:** f-1440-52-hover-queue-item.png.
  - Queue-order badges appear only on labelled tiles, never on folded marks.
  - "To answer, in order" doesn't say what the order means.
  - Area headers omit settled and deferred counts.
  - Hover tooltips cover the area header you're trying to find.
- **Fix:**
  - Retitle the queue "Next up: agents stopped first".
  - Show order badges on folded waiting marks, at least the top 6.
  - Use headers like "3 to answer · 8 settled · 1 deferred".
  - Place tooltips below marks that sit near headers.

**P8. Vocabulary differs from the card view.**
- **Evidence:** the card says "builds on" and "disagrees" (b-1440-28-click-waiting.png). The map says "needs", "conflicts" and "decides between" (c-1440-32-space-held.png).
- **Fix:** use one set of words throughout.

**P9. Polish.**
- The legend wraps, leaving "your precedent" orphaned on a second line at both sizes.
- In the all-answered panel, "All answered." sits in a broken two-column layout (d-1440-46-all-done-map.png).
- Old-style numerals make "Ship 0.1.0" read as "o.1.o".
- Opening fades in over 180 ms, but closing is an instant cut.
- There's no arrow-key navigation, so Tab walks through about 150 buttons.
- The intent's "changed since you last looked" and time-direction cues are missing.

## 4. What works and must be kept

- All areas are always on screen, in a fixed order, so the faint global overview never disappears.
- The subject tile is strongly highlighted, and relation tags sit on the endpoints ("needed by your card", "may conflict"). Of everything here, the tags are the best way of showing relations.
- The side panel works well:
  - "The card you're answering" in a single sentence;
  - typed relation rows that are clickable;
  - a queue whose items, on hover, highlight their mark on the map.
- Clicks are consistent, and each tooltip says what clicking does:
  - waiting: answer it;
  - answered: review it;
  - anything else: inspect what it's connected to.
- Inspecting settled decisions and rules is something the side panels can't do. It is the map's clearest reason to exist.
- Answered decisions leave footprints: a green tick and "answered: you chose X" (d-1440-46-all-done-map.png).
- Space peek, M, Esc and the header button all work as described.
- Older settled decisions fold into "6 older, settled", but the subject, related decisions and waiting cards are never folded.
- The small-project "Whole project" view is genuinely useful.

## 5. Form

The form is basically right: areas as blocks, pieces of work as lanes, marks that gain labels as you zoom, and a typed side panel. Don't replace it. What has to change is how the layout is made: **fixed cells instead of a reallocated width.**
- Every area gets a cell that never moves.
- Lanes are always rows, with time running left to right.
- "This area" opens a lens *in place* over the focus cell. The other cells stay where they are, dimmed.
- At 8 areas the cells wrap into 2 rows, so labels survive.

```
┌ Project map        [This area | Whole project]          Close map  Esc ┐
│┌gate 4 to answer·3 stopped┐┌client 3·1 stopped──┐┌time 4·1─────┐┌release 2┐│ panel:
││The commit gate  ● ■ ●    ││Local server ● ♛✓ ◇ ││Card times ● [★]←you │ Your card
││Speed up session          ││Client's views      ││Harden record │      │ needs…
││ 6 settled▸ ◇ ♛ ○ ● ◇     ││ (●)┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘ ○ ◌    │      │ conflicts…
│└──────────────────────────┘└────────────────────┘└─────────────┘└──────┘│ Next up
│┌ci 5────────────────┐┌docs 2──────────────┐┌store 1────┐┌auth 4·2──────┐│ 1 ♛ …
││Rework topic aliases││Extend session state ││Tidy rules ││Extend search │││ 2 ◇ …
││ 4 settled▸ ★ ◇ ★   ││ 5 settled▸ (‖)┄conflicts  ● ★  ││ ♛⁷ ◌ ●       │││
│└────────────────────┘└─────────────────────┘└───────────┘└──────────────┘│
└ "This area" = lens over the focus cell, in place; cells never move ──────┘
```

The playwright scripts and all screenshots are in /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-2/. No project files were edited.