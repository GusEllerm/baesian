# Map review 7

Independent reviewer, fresh context, 2026-10-24, of map.js v7. Verdict: sufficient. Screenshots: scratchpad/harness/map-review-7/shots/.

## 1. Verdict: SUFFICIENT

I tested the map at 1440×900 and 1280×800, on the small project and on `#scale`. Every opening let me answer questions 1–5 quickly and correctly. I opened it from the first card, from a card in another area, after answering 1 and 3 cards, from a reopened answered card, at the end, and from cards near the bottom of `#scale`. The layout really is stable. I logged the position of every decision on the map across each of those openings, each inspect and each answer, and nothing moved; the only change was a newly arrived card added at the end of its track, with a "new" badge.

Relations are drawn across areas, and off-screen endpoints are marked by labelled chips in the edge bars. At ~150 decisions the map fits with 89 px of scroll at 1440 and 189 px at 1280.

What remains are refinements. The one place it breaks the bar to the letter is the side panel being cut off at 1280 while you're looking at another decision (problem 1). It's a small fix and doesn't stop anyone answering 1–5.

## 2. Cold-read answers

1. **Where is my card, and in which area and piece of work?** **High confidence.** The card is outlined in cream, its area's box is highlighted, and the side panel says "The card you're answering … in 'work', area". At scale the map scrolls to the card; when it's out of view, the edge bar has a "your card ↑ gate" chip. A reopened card is labelled "The card you reopened".
2. **What does it build on or conflict with?** **Medium-high.** Related decisions get letters A/B/C. The side panel lists them by type ("your card builds on this", "may conflict", "disagrees") with their piece of work and area. Dashed lines cross areas (time→client→docs, ci→gate with an arrowhead). Two weaknesses:
   - When the related decision sits next to the card in the same track, no line or arrow is drawn, so direction is only in the panel text.
   - The legend groups "conflicts / may conflict / disagrees" without saying how they differ.
3. **What's settled, waiting or deferred?** **Medium-high.** Each area header has three fixed lines: "N to answer", "N with an agent stopped", and small icon-and-number counts. Two weaknesses:
   - The counts are 11 px icons with no words, so you need the legend.
   - The "settled" count silently includes agents' own calls.
4. **Where are the other waiting cards, and which is most urgent?** **High.** Waiting cards carry their names on the map, the next five are numbered, and the panel lists "Next up, with stopped agents first". The weak spot is 1280 at scale: the names of #1–#3 shrink to "Lock ses…", "Lock topi…", "Lock ca…", so you have to read the panel.
5. **How do I get back, or go to another card?** **High.** The close button reads "Close the map Esc", the tooltip says "Click to answer it", and Esc steps back one level at a time.

## 3. Problems, ranked (no blockers)

1. **The side panel is cut off at 1280 while inspecting** (the only literal breach of the bar).
   - **What's wrong:** inspecting a decision with 4 connections overflows the panel by 50 px. The second "Next up" item is cut mid-line and the "and 23 more" note is hidden under the legend. There's no visible scrollbar or other cue.
   - **Evidence:** /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-7/shots/80-1280-inspect-first.png (panel content 686 px tall in 636 px of space; the note sits at y=778, the panel ends at 742).
   - **Fix:** let `fitQueue` drop to zero items, keep the count note pinned, or collapse the queue to one line ("Next up: 25, numbered on the map") while inspecting.
2. **Card names are cut hard at 1280 at scale.**
   - **What's wrong:** every unnumbered card still reserves an empty 17 px slot for an order number, which leaves a 23 px gap between its mark and its name. The current card and the top three in the queue are cut to 7–8 characters.
   - **Evidence:**
     - /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-7/shots/97-1280-zoom-gate-ci.png
     - /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-7/shots/62-scale-1280-open.png
   - **Fix:** put the order number or ✓ as a small badge on the mark, like the letters, so it takes no width. Also make the current card the last to shrink.
3. **Clicking a card while writing an answer silently does nothing.**
   - **What's wrong:** the "Send or cancel your written answer first." message is shown, but it sits under the map (the message is at z-index 40, the map at 50).
   - **Evidence:** /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-7/shots/96-write-mode-click-card.png
   - **Fix:** raise the message above the map, or say so in the map caption.
4. **Direction is missing for neighbouring relations.**
   - **What's wrong:** relations under 200 px apart in one track get no line, so the legend's "builds on" arrow never appears for them.
   - **Evidence:** B in /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-7/shots/03-map-open.png, and A in /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-7/shots/71-1280-auth-bottom.png.
   - **Fix:** draw a short arrow stub, or put a direction glyph in the letter badge.
5. **An edge bar's wording is misleading.**
   - **What's wrong:** it reads "↑ Above: part of gate; nothing to answer" while gate's header says "4 to answer". The statement is true of the hidden part only.
   - **Evidence:** /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-7/shots/71-1280-time-conflicts.png
   - **Fix:** "the top of gate (its 4 cards are in view)".
6. **Keyboard rough edges.**
   - On a freshly opened map, Enter is meant to focus your card. It also presses it, so the map closes straight away. Call `preventDefault` in that branch.
   - ↑ doesn't always undo ↓: ↓↓↑ jumped two rows back. ↓ also skips tracks when the nearest card in the next track is far to the side. Limit ↑/↓ to the adjacent track.
   - The tooltip says "Click…" when a card was reached by keyboard.
7. **The tooltip doesn't appear if the pointer was already resting on a card when the map opened.** Moving within that card shows nothing until you leave it and come back. Fix: on the first `pointermove`, show the tooltip for whatever is under the pointer.
8. **Horizontal position looks like a time axis across tracks, but it's only the order within each track.** Fix: change the header to "each piece of work, oldest → newest", or align tracks by time.
9. **Legend and panel details.**
   - The four shapes are labelled only "to answer". Say "stakes, low → high".
   - The panel numbers a 6th card while saying "The first five are numbered on the map".
10. **A reopened answered card is still called "your card".** The panel says "your card builds on this". Trivial.
    - **Evidence:** /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-7/shots/52-map-from-review.png

## 4. What works and must be kept

- **Fixed positions.** A card's place depends only on its own state, never on which card you open the map from.
- **Structure and emphasis.** Areas are rows and pieces of work are tracks. Cards to answer and answered ones are named; settled decisions, rules and deferred ones are small marks named on hover. Areas with nothing for you fade.
- **One set of letters.** The map and the side panel use the same letters, and hovering a panel entry outlines that decision on the map.
  - **Evidence:** /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-7/shots/72-1280-sidepanel-hover.png
- **Inspecting.** Clicking a settled decision or rule shows what it's connected to, with nothing moving. Esc steps back one level, and the caption and close button follow.
- **Edge bars with labelled chips.** "B ↓ auth", "your card ↑ gate" and "next up: 1 2 3" each scroll to their target.
  - **Evidence:** /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-7/shots/75-1280-edge-chip-click.png
- **Answered cards stay on the map, ticked.** New cards get a "new" badge. The end state is clear.
  - **Evidence:**
    - /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-7/shots/37-map-after-3-answers.png
    - /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-7/shots/55-map-all-done.png
- **Opening and closing.** M, the header button, Esc and Space release close the map from every state, Space peeks, and reopening clears any inspect.
- **Density.** At ~150 decisions the whole project nearly fits on one screen.

## 5. Form

The form is right: a stable overview where areas are rows and pieces of work are tracks, with an inspect mode. It earns its place over the side panels: it shows where all 25 waiting cards are, the state of every area, and lets you step from one decision to the next across areas (ci → gate → time and auth).

Where it departs from the Atlas idea:
- **No zoom from the card.** In the Atlas the card is the deepest zoom level, reached by a staged move of about 1 s. Here the map is an overlay with a 180 ms fade, and the brief pulse on your card is the only link between the two views; it's barely visible (/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-7/shots/61-scale-1280-open-200ms.png). A cheap way to restore that link: on opening, shrink the card into its place on the map (~350 ms), and on clicking a card on the map, grow it back into the card view.
- **Space shows the whole map**, not "one level up".
- **Dependencies sit to the left only within a track**, not across tracks.

None of these is an obstacle.

All scripts and screenshots are in /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-7/. I edited no project files.