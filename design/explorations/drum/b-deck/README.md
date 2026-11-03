# Drum B: the drum is the deck

The card you're answering is the front face of a big drum. The cards you've answered went up and over the top. The ones still to come are underneath, rising toward the front. Answering rolls the whole drum one face, and it clicks into place. There's no separate path list. The path is printed on the drum's left end, a pale dial you can see because you stand a little to the drum's left. Each card's number and rarity mark sit round its rim, along with what you chose or what the card is. A brass index arm, fixed to the axle, marks the face in play ("9 of 12, in play").

Plain CSS 3D (one `perspective`, one `preserve-3d` context), vanilla ES modules, no build step and no libraries. Content comes from `../data.js`.

## Try it

```
PORT=4175 node design/explorations/drum/serve.mjs
open http://localhost:4175/design/explorations/drum/b-deck/
```

- **← / →** choose that side's option. The agent's pick is revealed, and **the same key** confirms. On a mythic card, hold the key (about 0.9 s) or click and hold the bar.
- **Esc** goes back to the choice. **Z** undoes the last answer within 5 s, and the drum rolls back down. **S** toggles sound: the ribs tick past the arm and the drum clacks into its notch. It's off by default.
- Clicking works too: an option, then Confirm, or "Switch to the agent's pick".
- Reduced motion (or `?still`): the drum is drawn and the faces change, but it doesn't roll and the hold doesn't strain it.
- Tuning parameters: `?n=10` sets the faces round the drum, `?p=` the perspective, `?ox=` how far left you stand, `?h=` the face height, and `?wall=0` removes the far wheel.

Screenshots are in `shots/`: the first state, the reveal, after three answers, a turn as a strip (frames 50 ms apart), mid-turn, a mythic hold half done, the end of the session, and reduced motion.

## What makes it read as a drum

1. **You see the object, not just its face.** The camera (`perspective-origin`) sits well to the left of the drum. A plane parallel to the screen projects undistorted, so the front card stays exactly flat and readable while you see the drum's end. That end is a round, lit dial with a ribbed tread. The far wheel's inner wall and its own ribbed tread show behind the cards on the right, so the drum reads as a closed, ribbed cylinder (a spool) and not a strip of cards. The light comes from the upper left: each face and each of the 128 ribs is shaded every frame by where it faces at that moment. The face turning up catches light, the face turning down drops into shade, and a highlight slides along the treads as they turn.
2. **One body, with mass and a detent.** Everything on the drum, cards included, is a child of a single rotor. A turn is one `rotateX` on the rotor, so nothing moves on its own. The rotor is driven by a heavy, soft spring with a stiff notch at each face: it starts slowly (5% of the way at 50 ms), reaches the notch at about 360 ms, snaps in with a small rebound (about 1.5°), and is still by about 500 ms. The index arm's tip rides the ribs and ticks as each one passes (8 per face), and the notch rib is where it comes to rest. Holding a mythic confirm strains the drum up against its notch (up to 4.5°) until it breaks free and rolls. Let go early and it falls back in.
3. **The path is printed on the drum.** On confirming, your answer is stamped on the card's bottom edge: "You chose …" plus "Sending to codex in 4 s. Z undoes it." That edge is the part you see as the card tips up and over. The upper neighbour always shows your last answer and its undo window, and the lower neighbour shows its question rising. The dial carries the rest of the path as glimpses, rotating rigidly with the drum: the last four answers, the three to come, and the count at the arm.

The drum has 8 faces and 12 cards. Each face is handed from the oldest card to the next one coming while it's at the back, where the dial's labels fade out. An end plate closes the session.

## Choices I made, and doubts

- **8 faces.** A full-size card (640 by 484) on each face makes the drum about 1,300 px across. With 8 faces, the top and bottom silhouette (the "edge where it turns away") stays on screen with room to spare. 10 or 12 faces look rounder and tilt the neighbours less, but they need a very wide-angle perspective to fit and they crowd the frame (try `?n=10&p=560`). The cost of 8 is that the card faces are visibly flat facets: a polygon inside round wheels.
- **The side view is the strongest cue and the main compromise.** The dial is seen at about 35°, so its labels are condensed. The one at the arm reads easily, the next ones out read with effort, and further round they're glimpses. Radial text that turns with the drum felt more physical than labels kept level, but it's harder to read away from the front.
- **The far wheel's dark wall** gives the drum a closed, solid form, but it's a large dark area to the right of the card. `?wall=0` shows the alternative: cleaner, but more like a prism with a dial stuck on.
- Not included from the real card: the reading time (D91), ↑ and ↓ (other answer, can't judge), drag and swipe, relationships, the agent's rationale in the reveal (`data.js` has none), and the "N earlier answers" panel.
- Fonts: Archivo is loaded from its `wdth` file (as `client/src/main.tsx` does), not the `wght` one, so `font-stretch` works as in the client.

## What I'd do next

- See it running, not just in stills. The spring constants (`K1`, `C1`, `NOTCH`, `K2`, `C2` in `drum.js`) are tuned from 50 ms frames, and the feel of the notch needs a person watching it at 60 fps. Then decide whether sound earns a place.
- Let the dial show the whole session. Either fold the oldest answers into an "and 4 earlier" plate at the back of the drum, or gear a smaller index wheel to the drum (2:1) so more rows fit at a readable angle.
- Try scrolling the drum back through your history by hand, with the same spring and notch. That's direction C, but the rotor already supports it.
- Scale with the viewport. It currently shrinks to fit below 1440 by 900 but isn't designed for small screens.

## Porting it to the React client

- **Structure.** `<Drum>` would own the rotor and N face slots. Each slot renders a `<Card>` (the existing `Card.tsx`, unchanged, at a fixed height) for whichever card index currently sits on it. The face in play gets the real interactive card and the rest get a static `mode`. `Desk.tsx` keeps owning answers, the undo outbox, the hold and the keys, and it passes the drum a target index plus a hold progress. `Path.tsx` would be replaced by the dial labels and the past card's edge band.
- **Motion.** Use one Motion `useSpring` (or a `useAnimationFrame` loop like `simulate()` here) for the drum angle, and write the rotor's transform from a `MotionValue`. Per-frame lighting (shade on 8 faces, colour on 128 ribs) should be written to styles directly from a `useMotionValueEvent`, not through React state. The notch is a second spring term, which Motion's spring doesn't have, so keep the small custom integrator.
- **CSS 3D rules to keep.** Every ancestor between the scene and the faces needs `transform-style: preserve-3d`: no `overflow: hidden`, `filter` or `opacity < 1` on them, or the 3D flattens. Use `backface-visibility: hidden` on faces. At rest, the front face sits at z = 0 facing you, so it renders 1:1 and its text is crisp (checked in the screenshots). Hit-testing through the 3D transforms works in Chrome (checked here with Playwright clicks).
- **Accessibility.** Only the face in play is focusable and visible to assistive technology (`inert` on the others), the dial labels are `aria-hidden`, and announcements go through a live region. Reduced motion skips the spring.
- About a day to port, plus tuning time; most of the risk is in layering the existing card's reveal, write and pass modes within the fixed face height.
