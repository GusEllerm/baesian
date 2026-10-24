# Path review 1

Independent reviewer, screenshots only, 2026-10-24, of the path column. Screenshots: scratchpad/path-review-1/.

## 1. Verdict: NOT SUFFICIENT (close; the fixes are mostly wording and label placement)

The path itself works. A solid spine runs through past answers, the current card has a large node with a line into the card edge, the upcoming cards sit on a dotted line, and each past answer has a green "you chose …" line under it. P1–P3 are answered at a glance on nearly every screenshot, and the column reads as attached to the card without competing with it. Layout is clean at both sizes: no clipping or overlap, and the toast stays clear of the column.

The relations layer fails the bar:
- In L-2, "kept by ←/→" is cryptic.
- In L-2, the card header says "1 decision rests on it", but nothing in the column shows it.
- In L-5, the one "builds on an earlier answer" case has its label in a place that points at the wrong item.
- In L-3, it isn't reliably clear which items are steps and which are only related.

## 2. Per screenshot

**L-1** (seen first: the crown node with its line into the card; seen second: the dark "builds on" item at the top)
- P1, nothing answered yet: **medium**. "Serve the client with Node's http module / settled" sits where your history goes, and nothing says "no answers yet".
- P2: **high**.
- P3: **high** for the next card ("Which time format…"). But the header says 5 to answer and only 4 are shown. "Ship the built client" is missing, with no "+1 more".
- P4: **medium-high**. "builds on" is clear. "may conflict / your rule" is clear, and the card's own note repeats it.

**L-2**
- P1: **high**. P2: **high**. P3: **high**.
- P4: **low-medium**.
  - "kept by ←" and "kept by →" only make sense once you link the arrows to the arrow keys on the two answers. "kept by" is also a new word for a conflict, where L-1 said "may conflict".
  - The header's "1 decision rests on it" has nothing matching it in the column.
  - The red dashed bracket runs about 8px from the grey dotted spine, so you see two dashed lines side by side.

**L-3**
- P1: **high**. P2: **high**.
- P3: **medium-high**. "Cache rendered Markdown in memory" comes straight after "relied on by … an agent's own call" with no heading between them, so it can be read as a second "relied on by" item.
- P4: **medium**.
- Step versus related: the "builds on" item sits on the solid answered part of the spine, between "ISO 8601 strings" and the current node. It looks like an answered step that is missing its "you chose".
- The relation brackets are faint and don't reach the node.
- The "relied on by" item has the heaviest text in the column.

**L-5**
- P1: **high**. P2: **high**. P3: **high**.
- P4: **low-medium**. The arc from the star node to the current node gets noticed, which is good. But the "builds on" label sits under "you chose ISO 8601 strings", directly above "How live updates reach the browser". In L-1 and L-3 a relation label sits above the item it describes, so this reads as "builds on How live updates…".
- Nothing on the card says it builds on your earlier answer, so this label is the only signal.

**L-7**
- P1: **high** for the four rows shown. The first two answers, including the security one that was hard to undo, are folded into "2 earlier answers" even though about 600px below is empty.
- P2: **high** that there is no current card.
- P3: **high** ("All answered.").
- P4: not applicable.

**S-2, S-5**: same behaviour as L-2 and L-5, with the same label problems. No layout problems.

## 3. Ranked changes

1. **BLOCKER (L-5): the "builds on" label for an earlier answer.**
   - Remove the free-floating "builds on" line.
   - Put the relation on the answered row itself, e.g. `you chose "ISO 8601 strings" · this card builds on it`, or as a small label at the start of the arc.
   - Keep one rule everywhere: a relation label is always attached to the item it describes.
2. **BLOCKER (L-2): "kept by ←/→".**
   - Replace with one group label that matches the header, "settled, but they disagree".
   - Give each item a suffix: "← keeps this" and "→ keeps this".
   - Use the same conflict wording as L-1's "may conflict".
3. **BLOCKER (L-2): the missing "rests on it" item.** Show the "relied on by" item in the column, or drop the claim from the header. The column and the header have to agree.
4. **BLOCKER (L-3): separating steps from related decisions.**
   - Always put a "Next" heading before the first upcoming card, even when the topic doesn't change. This replaces "then client / then time / then release"; the topic can follow as quiet text if wanted.
   - Move related items off the spine: give them their own indent with a left bullet and no spine segment behind them, so the solid line only ever joins answered nodes.
5. **Refinement: upcoming list cut short.** Add "+N more" when upcoming cards are hidden (L-1), the same way L-7 does for earlier answers.
6. **Refinement: L-7 collapsing.** Don't fold earlier answers into "2 earlier answers" while there is room to show them.
7. **Refinement: quote chosen answers.** Write `you chose "In a cookie set on first visit"`; as it stands, "you chose Let it stand" and "you chose Yes, as static files" read badly.
8. **Simplification: brackets.** Drop the relation brackets, since the labels already say what they are. This also removes the double dashed line in L-2.
9. **Refinement: lighter relation text.** Make related items' text a little lighter than answered steps so they don't outweigh the path.
10. **Outside the column, but it breaks P3.**
    - The bottom "To answer" bar is ordered by topic, while the column is ordered by sequence. In L-1 the bar suggests the diamond card comes next and the column says the star card does. Order the bar by the path, or drop the duplicate.
    - The red dot on the upcoming star in L-1 (which matches "agent stopped") isn't explained anywhere.

## 4. What must be kept

- The solid line for past cards and dotted line for upcoming ones, and the large current node with a line into the card's edge. This is what makes the column feel part of the card.
- The green "you chose …" under past answers, and the small check badges.
- Each card's icon (crown, star, diamond, circle) repeated between the column, the card header and the bottom bar.
- Right-aligned text hugging the spine, with faint text for upcoming cards. It doesn't compete with the card.
- The arc from an earlier answer to the current node in L-5. The idea is right; only its label is wrong.
- The status words "settled", "your rule" and "an agent's own call", and the card text repeating relations (the "Your rule…" note in L-1).
- The layout at both 1440×900 and 1280×800.

The screenshots are in /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/path-review-1/. I also saved enlarged crops of the column in /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/review-crops/.