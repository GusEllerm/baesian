# Drum C: a reel you can spin

The path beside the card is a solid drum in CSS 3D: ivory plates (your rows) mounted on a brass drum, with ribbed
rims at both ends and a dial-faced end cap, lit from the upper left. Your answers are above the front; the cards
coming next are below. They tilt with the curve and roll over the top and bottom. The current card's row is at the
front, and an ink pawl rests in the right rim's ribs there, joined by a line to the card. You can turn the drum
yourself, with momentum, detents and ends that resist, and it turns back to the card in play when you let go.
Answering still turns it a step on its own.

## Trying it

```
PORT=4176 node design/explorations/drum/serve.mjs
open http://localhost:4176/design/explorations/drum/c-spin/
```

- **Spin it:** scroll over the drum (trackpad or wheel; a mouse wheel's notch is one row), or drag it and fling.
  With the drum focused (Tab or click), **↑ ↓** step one row.
- **Open a row:** **Enter** opens the row at the pawl, or click any row. An answered row opens read-only, with
  "You chose …" and the agent's pick; a coming one opens read-only too. **Esc** or "Back to the card in play" turns
  the drum back.
- **Let go:** the drum stays where you left it for 2.2 s (0.65 s once the pointer leaves it), shown by a line
  running down under "Enter opens …", then turns gently back to the card in play. Spun with the keys, it waits
  until the drum loses focus.
- **Answer:** **←** or **→** chooses that side's option, and the same key confirms (hold it for about a second on a
  mythic card). The drum turns one step. **Z** undoes within five seconds, and the drum turns back.
- **Reduced motion:** the drum is still drawn, but there's no momentum and no blur. The wheel, a drag and the keys
  step it one row at a time, and turns are instant.

Content is `../data.js`, starting with eight cards answered and the ninth in play.

## What makes it read and feel like a drum

1. **It's an object, and it turns as one body.** It's a real 3D cylinder: 18 plates at `rotateX(-j·20°)
   translateZ(R)` inside one `preserve-3d` drum. Each frame sets a single `rotateX(p·20°)` on the drum. The drum
   is pushed back by its radius, so the front plate sits at z = 0 and is drawn 1:1: crisp text, and clicks land
   where you see them. It's seen from a little above and from just past its right end, toward the card. So you
   see the end cap (its ticks turn with it), the ribbed rims proud of the plates, the left rim's inner face, and
   the rows bunching and going edge-on over the top and bottom. A soft shadow sits on the desk below it.
2. **The light stays in the room.** Each plate's shade and gloss come from its angle every frame (Lambert, plus a
   gloss line where the surface faces halfway between the light and your eye). As a row turns away it moves out
   of the light into shade, and the gloss line on the rims stays put while the ribs run through it: the strongest
   single cue that something is rotating rather than scrolling. At speed the whole surface smears along the turn
   (an SVG blur in each plate's own plane, so it's foreshortened with the drum).
3. **Detents you can see and feel.** A small motion model (`physics.js`, no DOM, tested in Node) drives every
   movement:
   - **By hand,** the drum chases your hand through a stiff spring (mass), and the target is warped so it lingers
     at each row and hurries between. A steady hand gives a stepping motion, not a glide.
   - **A fling** coasts on friction; below 3.4 rows/s the nearest detent catches it.
   - **Every landing** is a slightly under-damped spring, landing a few pixels past the row and settling.
   - **The pawl** rides the rim's ribs. A rib pushes it aside, it snaps back and rings, and each click flashes a
     tick of light at its tip.
   - **Past either end,** a rubber band that gives less the harder you push, showing "Start of this session" or
     "Nothing more in the queue".
   - **An answer** is a push that starts slowly (weight), carries the row up, overshoots about 8% and clicks in,
     in about 350 ms. The "in play" ring moves to the next row as that row reaches the pawl, not before, so it
     reads as turning, not rearranging.

## Shots (`shots/`, by `shoot.cjs`)

| shot | what |
| --- | --- |
| `1-first-state` | eight answers above, the ninth in play at the pawl, three to come |
| `2-mid-spin` | a trackpad flick back through your history, mid-turn: smeared, pawl deflected, line slack |
| `2b-fling-coasting` | a drag flung forward, coasting; the tick of light at the pawl |
| `3-spun-at-rest`, `3c-fling-at-rest` | where they landed, with "Enter opens …" running down |
| `3b-turned-back` | after letting go, back at the card in play |
| `4-after-three-answers` | three answers later |
| `5-spun-two-back`, `6-opened-answer` | ↑ ↑ then Enter: an answered card, read-only |
| `7-against-the-end`, `8-after-the-end` | dragged hard past the first answer, and sprung back |
| `9-reduced-motion-one-step` | reduced motion: one wheel gesture, one row |
| `turn-strip` | one answer, frame by frame, 50 ms apart (Playwright's clock, paused and stepped) |

To retake them, start the server, then run `node design/explorations/drum/c-spin/shoot.cjs` (or pass an output
folder).

## What I'd do next

- **Feel it on real hardware.** The tuning (`TUNING` in `physics.js`, the wheel's 130 ms let-go, the 2.2 s dwell)
  was set by simulation and frame strips, not by hand. Trackpad momentum, mouse-wheel acceleration and the return
  dwell need a person's thumb.
- **Sound, optionally.** A quiet tick per detent would do a lot for the dial feel. It should be off by default.
- **Longer queues.** The 18 slots already reuse themselves out of sight at the back, so a session of any length
  works. Past about 15 answers, the "N earlier answers" list could be a long spin, or a jump.
- **Relationships** (the client's arcs to related answers, and "kept if you choose …") aren't on the drum yet.
  They could hang off the front row beside the pawl, flat, not on the curve.
- **The top rows shear** a little (the eye is above and to the right). That's honest perspective, but worth a
  second look for legibility at smaller sizes.

## Porting it to the React client

- **The model ports as is.** `physics.js` is plain functions. Keep it as a module and drive it from a single
  `requestAnimationFrame` loop in a `useEffect` (or Motion's `useAnimationFrame`). Don't route each frame through
  React state: write the drum's transform, and each plate's CSS variables (`--a0 --a1 --a2 --gy --ga`), straight
  to refs, as `Path.tsx` already does for its join line. Motion's springs could replace `turnTo`'s, but the
  detent capture, the pawl and the rubber band are custom either way.
- **The DOM is a fixed pool of 18 plates** keyed by slot, not by card. Each plate's content comes from
  `row(index)` (past, now, next, an end, or blank), re-rendered only when that slot's index or row changes.
  `Path.tsx`'s trail and next lists map onto it directly. The flex layout, measuring, folding into "N earlier
  answers" and `place()` all go. The current-row-to-question alignment becomes a one-off offset, as here.
- **Inputs** need `wheel` with `{ passive: false }`, pointer capture for drag and fling, and ↑/↓/Enter on the
  focused drum. They must stay out of the desk's arrow-key handler: ←/→ answer, ↑/↓ spin only with focus. Today
  the client uses ↑/↓ for "Other answer" and "Can't judge", so that's a decision to make, not a port.
- **The desk needs** a "reviewing" mode for an opened row (`Mode.review` exists), the return-to-front dwell, and
  the "in play" ring moving when its row reaches the front (`onNear`).
- **Watch for:**
  - the scene's own plane catching the pointer (it sits in front of the drum; keep `pointer-events: none` on it);
  - `filter` on 3D leaves (fine on plates, never on the drum or the scene, which it would flatten);
  - Safari's `preserve-3d` hit-testing and backface culling, which I haven't checked.

## Files

- `index.html`, `style.css`: the page, the card in the client's look, and the drum's materials.
- `app.js`: the desk. Card modes (live, reveal, review), keys, hold, undo, toast, the return to the front, and the
  line to the card.
- `drum.js`: the 3D drum. Building it, per-frame light, the pawl, motion blur, and wheel, drag and key input.
- `physics.js`: the motion model (hand, coast, snap, drive; rubber-band ends; detent ticks).
- `marks.js`: the rarity marks from `../data.js`.
- `shoot.cjs`: the screenshots.

Canvas and WebGL weren't needed: CSS 3D handles the cylinder, the light (as gradients set per frame) and the hit
testing.
