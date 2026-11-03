# A, a real reel

The path beside the card is a physical drum in CSS 3D. The strip of answer rows is mounted on a cylinder with knurled rims. The end toward the card shows, with an impeller's vanes on it. Answering turns the whole drum one notch, with weight, and a pawl drops it into place.

## Try it

    PORT=4174 node design/explorations/drum/serve.mjs

Open http://localhost:4174/design/explorations/drum/a-reel/. Eight cards start answered and the ninth is in play.

- **← or →** chooses that side's option. The agent's pick shows only after you choose.
- **The same key again** confirms. On the mythic card (the fourth from the start), hold it for about a second until the bar fills.
- **The other arrow** chooses the other side instead, and **Esc** goes back to the choice.
- **Z** undoes the last answer within five seconds, and the drum turns back.
- **S** turns on a click sound (off to begin with).

With reduced motion the drum is still drawn in 3D, but it moves a notch at once and nothing spins.

Screenshots are in `shots/`: the first state, after one answer, after three, and `04-turn-strip.png`, a turn in frames 50 ms apart.

## What makes it read as a drum

1. **It's an object, under one light.** The strip is 24 flat slots, one row per slot (`rotateX(-15deg × slot) translateZ(R)`). There are 96 ribs on each rim, and every other one is a groove, so the rims show teeth where they turn away. The end toward the card is a disc with the vanes on it. The light is fixed in the world, and each slot and rib is shaded every frame for where it faces now. As the drum turns, the light and shade stay put and the surface slides through them. The light comes from above and to the left: shade gathers toward both edges and deepens at the bottom, and a soft glossy band sits just above the front. A shadow is cast on the desk.
2. **The geometry is real.** The radius is 290 px with 15° between rows. One perspective (1100 px) covers the whole desk, with the eye at the card. Rows tilt by the true angle and bunch toward the edges: the front row and the rows at ±15° and ±30° are readable. Rows at 60–75° are glimpses, and past 90° they roll over the top or under the bottom. Since the eye sits to the right, the near end and its vanes show. The front of the drum sits at z = 0, so the front row draws at 1:1 and stays crisp.
3. **It turns as one body, with weight, against something fixed.** One `rotateX` moves everything on the drum. The turn is a small physical simulation:
   - a push against a detent's resistance until the drum is over the hump (a slow start);
   - then a stiff, lightly damped catch into the notch: the snap at about 280 ms and a 7% overshoot, settled by about 560 ms.

   Fixed in front of the drum are the index ring at the front node, the payline from the ring to the card, and the pawl, a spring tongue on that line. The ribs lift the pawl between notches and it drops as the drum clicks home. The marks roll through the fixed ring, which is what makes a turn read as rotating rather than rearranging. A quick second answer carries the drum on through the next notch, and each notch clicks. The row you answered shows your answer straight away. The arriving row only lights up as the current one once it's at the front, and the next card lands with that click.

CSS 3D was enough; no canvas or WebGL.

## What I'd do next

- **Hover and click** on a row, to open it, like the client's path rows. Drawn in CSS 3D, the rows are real elements, so hit-testing already works. This is half of direction C.
- **Tune the light with the user.** The drum is a bit dark and heavy beside the cream card. A lighter rim colour, or a lilac like the desk, may sit better in the client.
- **The card's relationships** (the client's arcs to related cards) have no home on the drum yet. They could hang off the payline beside the front row.
- **Height.** At a laptop's height (under 860 px) the drum should shrink: a smaller radius at the same 15° step, not fewer degrees.
- **A path longer than 24 slots** needs rows re-printed as slots come round the back. The code maps a row's position to its slot by `position mod 24`; nothing handles reuse yet.

## Porting to the React client

- **Shape.** `drum.js` is framework-free: a `Drum` class that builds the slots, ribs and end, and has `print(rows)`, `turnTo(n)` and `layout(...)`. In React, `<Path />` would own one `Drum` through a ref. It would render each row's content into the slots, through portals or by giving `print()` elements instead of HTML strings. `turnKey` would call `turnTo`.
- **Turning.** The turn should stay outside React's render: one `requestAnimationFrame` loop that writes `transform` and a few CSS custom properties. Motion isn't needed for it. Motion's spring could replace the hand-written physics, but the detent's slow start and snap are what sell it, and a plain spring loses them.
- **What goes away.** The client's per-row FLIP, its `--sx`/`--sy`/`--o` styles and its turn-from maps all go. A row's place is just its index × 15°.
- **What stays as it is.** The payline, index ring and pawl live in the path's existing SVG overlay (`.path-lines`). The line into the card already follows the card's motion there.
- **Layout constraint.** The drum wants one perspective shared with the desk and its eye near the card, so the path column needs `overflow: visible`, with room to its right for the near end.
- **CSS 3D rules to carry over.** Each piece must be `transform-style: flat`, with only the drum itself `preserve-3d`; a row's text in the 3D context misdraws. Clipped screenshots (`page.screenshot({ clip })`) misdraw the 3D layers in Chromium, so capture full frames and crop afterwards.

## Files

- `index.html`: the page.
- `app.js`: the card, the keys, the hold, undo, the toast, the layout, and what each row prints.
- `drum.js`: the drum (geometry, light, physics, pawl).
- `reel.css`: the client's look and the drum's materials.
