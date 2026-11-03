# The drum: brief (2026-11-03)

**The vision, in the user's words:** "Can we make the list look as if it's on a rotating cylinder? So they get bigger when approaching, smaller when leaving." Their reference picture is a solid drum, a 3D-printed impeller: a short, thick cylinder with ribs round its edge, seen from slightly above, lit from one side.

**What the first attempt got wrong** (the user: "ok, not great, it does not execute on the vision"). It's in the real client now, `client/src/Path.tsx`, as rows that shrink, flatten a little and fade as they move away from the current card's row. Critique rounds optimised it for legibility until it read as a list that gently shrinks at the ends:
1. **It isn't an object.** You don't see a drum: no surface, no curvature, no light and shade, no edge where it turns away.
2. **The perspective is timid.** Rows barely tilt; a real reel tilts them hard as they leave the front, bunches them toward its edges, and rolls them over the top and out of sight.
3. **It doesn't turn as one body.** Each row moves to its new place on its own; a turn reads as rearranging, not rotating. A drum has mass, turns as one, and clicks into place.
4. **You can't spin it.** Turning it yourself, through your history, is part of the appeal.

**The north star for every decision:** does this feel like a physical drum turning? Legibility matters, but within that, never instead of it: the front row and the one either side must be readable; further round, rows may be glimpses, like the backs of a reel's symbols.

## What it's for

The Baesian client: a person answers decision cards that coding agents file. Beside the card being answered is the **path**: your answers this session (above, each "you chose …"), the current card's node (at the front, joined by a line to the card), and the cards coming next (below). Answering a card (← or → chooses the option on that side, and the same key again confirms) turns the path one step: the answered card turns up and away, the next one turns to the front.

## Three directions

- **A, a real reel.** True 3D: the drum itself is visible as an object, its surface, its curve, light on the front and shade as it turns away, its edges; the rows are mounted on it, tilting properly and rolling over the top and bottom. Answering turns the whole drum one step, with weight, and it clicks into place.
- **B, the drum is the deck.** The current card isn't beside the drum: it's on the drum's front face. Answering rolls the drum, taking the card up and over the top, and the next decision rolls up from below into view. The answered cards are behind you on the drum; the coming ones ahead.
- **C, a reel you can spin.** A's look, plus you can turn it yourself: scroll or drag over it to spin back through your history (and forward through what's coming), with momentum, detents that click into place on each row, and a gentle return to the front when you let go (or Enter to open the row you've spun to). Answering still turns it a step.

## Constraints

- **Standalone prototypes:** each in its own folder here (`a-reel/`, `b-deck/`, `c-spin/`), an `index.html` served by `node design/explorations/drum/serve.mjs` (it serves the repo at http://localhost:4173, so `http://localhost:4173/design/explorations/drum/a-reel/`; set `PORT` to run another copy), vanilla JS (ES modules) and CSS, no build step and no libraries (the real client would have to port it; it uses React and Motion, and CSS 3D works there). Canvas or WebGL only if CSS 3D truly can't do it, and say why.
- **Content:** import the shared cards from `../data.js` (don't invent other content). Start with the first eight answered and the ninth in play.
- **The client's look:** the desk is lilac (`#d9d0da` to `#cbc0cd`, a radial gradient), cards are cream (`#f0e4be`, inner `#f7eed3`, border `#d9c68e`), ink `#2e2343`, soft ink `#5a4d6e`, faint `#8c809b`, green for "you chose" `#225c38`, wine `#8e3a5f` for "an agent has stopped". Fonts: Alegreya (prose, questions, names) and Archivo (UI, labels), loaded from `../../../../node_modules/@fontsource-variable/alegreya/files/alegreya-latin-wght-normal.woff2` and `../../../../node_modules/@fontsource-variable/archivo/files/archivo-latin-wght-normal.woff2` with `@font-face` (relative to each prototype's folder). The rarity marks are a circle (common), diamond (uncommon), star (rare) and crown (mythic); `data.js` has their SVG paths.
- **Interaction:** ← or → chooses that side's option, the same key again confirms (on a mythic card, hold the key about a second), and the drum turns. Z undoes the last answer within five seconds. Reduced motion: no spinning, the drum still drawn. Desktop first, about 1440 by 900.
- **The real client** is in `client/src/` (Desk.tsx, Card.tsx, Path.tsx, style.css) if you want to see what exists; don't edit it.
