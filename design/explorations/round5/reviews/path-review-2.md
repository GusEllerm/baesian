# Path review 2

Independent reviewer, screenshots only, 2026-10-24, of the revised path. Verdict: sufficient. Screenshots: scratchpad/path-review-2/.

## 1. Verdict: SUFFICIENT (no blockers)

The column meets the bar in all seven screenshots. Past steps (green "you chose …"), the current step (the large node with a line into the card) and next steps (the "Next" label and dashed spine) can be read in five seconds with high confidence. Relations are named and readable, at medium to high confidence. The arc in L-5, labelled "this card builds on it", is the best part. The column reads as attached to the card and never outweighs it. Nothing is clipped or overlapping at 1440 or 1280. The weak spots are refinements. Related decisions sit in the gap between the current node and "Next", and nothing ties them to the node. The relation labels change grammatical direction from one to the next. And in L-3 the bottom row shows a mark the column doesn't explain.

## 2. Per screenshot

**L-1** (first card)
- P1: none answered yet, high. Nothing sits above the crown and "Your path" starts on it.
- P2: the crown node, high. Its line runs into the card, and the crown matches the card's header icon.
- P3: three listed plus "1 more after these", high.
- P4: builds on "Node's http module" (settled), may conflict with "Never put secrets in URLs" (your rule), medium-high.
- Noticed first: the crown and its connector, then the pink "may conflict".
- Close read:
  - "builds on" has no stated subject. It means "this card builds on".
  - On a first visit, "settled" could be misread as "I settled this".
  - The spine stops at the crown and only restarts at "Next". The relation block in the gap reads a little like the next stops on the path.
  - "Serve the client with Node's http / module" wraps, leaving "module" alone on a line.
  - Each relation has its own glyph (dot, blue square). The words already carry the meaning.

**L-2** (two settled decisions disagree)
- P1: "Where the access token lives", you chose "In a cookie…", high.
- P2: the star node, high.
- P3: three items, high.
- P4: two settled decisions, each "kept if you choose ←/→", medium.
- Noticed first: the two pink "kept if you choose" lines, then the star.
- Close read:
  - The arrows only make sense once you link them to the ←/→ keys on the option cards. The decision titles happen to make the mapping guessable.
  - The relation is never called a conflict, although L-1 uses "may conflict". "Kept" is good news but it is coloured in the warning pink.
  - The 1280 version (S-2) is clean, and the undo toast is well clear of the column.

**L-3** (two answered)
- P1, P2 and P3: high.
- P4: builds on "Node's http module", relied on by "Stream the queue view…" (an agent's own call), medium-high.
- Close read:
  - "relied on by" is passive and runs the opposite way to "builds on". You have to work out who relies on whom.
  - "endpoint" is left alone on its line when the title wraps.
  - **Mismatch:** a blue ring sits on the 5th mark of the bottom row ("Relative times in the queue"). Nothing in the column matches it.
  - The path grew from 5 to 6 here, so the header still says "4 to answer" after an answer. The column never says that a step was added.

**L-5** (builds on an earlier answer)
- P1: four answered, all with choices, high.
- P2: the double-ring node, high.
- P3: "Ship the built client…", high.
- P4: builds on your "ISO 8601 strings" answer, high. The arc and "this card builds on it" leave no doubt.
- Close read: no problems. S-5 is equally clean.

**L-7** (all answered)
- P1: all six with their choices, high.
- P2 and P3: none left, high ("All answered." and "All caught up.").
- Close read: the summary says "5 took the agent's pick and 1 chose the alternative", but the column doesn't show which one was the alternative.

**Path vs connected, overall:** clear enough. Steps sit on the spine with card-type glyphs. Related decisions sit about 30px to the left, off the spine, under relation headings. That 30px offset is small, so the spine break and the headings do most of the work.

## 3. Ranked changes (no blockers)

1. **Relation headings: one wording and one direction everywhere.** Reuse the L-5 phrasing.
   - "builds on" becomes "this card builds on".
   - "may conflict" becomes "this card may conflict with".
   - "relied on by" becomes "relies on this card".
   - In L-2, add the relation type, e.g. "conflicts · kept if you choose ←".
   - This is a text-only change.
2. **Tie off-path relations to the current node.** Draw a short thin branch from the current node to the relation dots, in the same line style as the L-5 arc. Keep the faint dashed spine running from the current node down to "Next". The relations then visibly hang off this card beside the path rather than sitting on it.
3. **Fix the L-3 mismatch in the bottom row.** Either remove the blue ring, or explain it in the column with a small "new" tag on "Relative times in the queue". The tag would also explain why the count didn't drop.
4. **Rename the status word "settled"** to "settled earlier" (or name who settled it), so it can't be mistaken for an answer from this session.
5. **Give relation titles the same width as step titles.** That removes the stranded "module" and "endpoint".
6. **Use one off-path glyph** (a small dot) instead of the dot, blue square and dashed circle. The status words already say what kind of decision it is.
7. **Darken the "Next" item text a little.** Grey on lilac is legible but faint.
8. **Optionally mark agent-pick vs alternative** on answered steps, e.g. a muted "codex's pick" after the choice. This lets L-7's "1 chose the alternative" be traced.
9. **Optional:** drop "All answered." in L-7, since "All caught up." already says it. Or hide the bottom row whenever the full column is visible, because at both sizes it repeats the column exactly.

## 4. What must be kept

- The connector from the current node into the card, and the node sitting level with the card title. This is what attaches the column to the card.
- The glyphs (crown, star, diamond, circle) and the pink "agent stopped" dot. They match the card header and the bottom row, so one visual language runs through all three.
- A solid spine for answered steps, a dashed one for what's next, and "1 more after these".
- The green "you chose '…'" line under each answered step.
- The L-5 arc with "this card builds on it". It is the clearest relation in the set, and the model for change 2.
- Relations kept off the spine, with status words ("settled", "your rule", "an agent's own call").
- The column's restraint: muted serif text, smaller than the card, and no box around it.

Working crops (enlarged views of the column and bottom row) are in /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/crops/.