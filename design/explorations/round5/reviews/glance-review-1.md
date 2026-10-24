# Glance review 1

Independent reviewer, screenshots only, 2026-10-24. Screenshots: scratchpad/glance-review-1/.

## 1. Verdict: NOT SUFFICIENT

The core works. The serif question, the two options side by side and the concrete "then…" consequences (such as "5 commits on main" against "1 commit in the views") answer A and C at a glance on every screen. "N to answer" and "claude-code stopped" answer E. Neither size has any overlap or clipping. It misses the bar in three places:
- **B (how much it matters):** the tier word (Mythic, Rare, Uncommon, Common) reads as how rare a card is, not how much it matters. Screen 3 never says how hard it is to undo.
- **Focus:** three things pull the eye from the question and options: the rainbow border, a second bold question in the "Before you choose" box, and a dark toast.
- **Unexplained or removable elements:** the green dot, the icon strip at the bottom, "in gate", "Write", the topic name "time" turning into misleading English, and an empty left column on screen 5.

## 2. Per screen

### Screen 1: high stakes, just opened
**Glance:** (1) the rainbow-bordered card and its question; (2) the two option boxes; (3) the bold line "Does that rule cover the part of a link after the #?"; then the highlighted box at the top of the left column.
- A: high. B: medium. "touches security, hard to undo" gets it across; "Mythic" sounds collectible. C: medium-high. The option titles land at once, the consequences need reading. D: medium. There are small arrow-key chips; "hold to confirm" appears only in tiny grey hint text. E: high.

**Close read:**
- There are two bold questions on one card, and the second has no way to answer it, so a user may look for a yes/no control.
- "claude-code resumes" appears in both "then" lines, so it tells the user nothing.
- The ← chip is red and the → chip is blue. The red one sits on the option that breaks your rule, so it reads as a warning.
- "Write": write what? "Can't judge": what happens next?
- The green dot next to More is unexplained.
- The icon strip at the bottom (crown, diamond, circle, star, red dots) is unexplained and repeats "5 to answer".
- Cosmetic: at 1440 the right option's title leaves "visit" alone on its own line; at 1280 it fits on one line.

### Screen 2: same card, after choosing
**Glance:** (1) the chosen option outlined in blue; (2) the faded option labelled "claude-code's pick"; (3) the "Hold → or press here to confirm" button.
- A: high. B: medium. C: high. D: medium-high. E: high.

**Close read:**
- The reveal is strong: "You chose X. claude-code picked Y", then the agent's case.
- "Wrong if any page can run a script…": whose voice is this? It reads as the app calling the agent wrong.
- "press here": click, or press and hold?
- The layout still fits at 1280×800.

### Screen 3: two earlier decisions disagree
**Glance:** (1) the gold card and its question; (2) the options; (3) the dark toast at bottom left, which is the highest-contrast thing on the screen.
- A: high. B: low-medium. "Rare · two decisions disagree" says why the card exists, not how much it matters, and gives no undo cost. C: high. D: medium. E: high.

**Close read:**
- The left column lists ISO first and epoch second, but the options put epoch on the left and ISO on the right. Use the same order.
- ", and the merge goes ahead" appears in both options.
- "Last in time; next, client": "time" is a topic but reads as ordinary English. The toast's "Chose In a cookie…" has odd capitals.

### Screen 4: medium stakes
**Glance:** (1) the question "Push live updates… with server-sent events?"; (2) the options, one tagged "claude-code's pick"; (3) the "Before you choose" box; then the toast.
- A: medium. The question asks yes or no and assumes the agent's pick, but the options are WebSockets or SSE. B: medium. "costly to undo" works; "Uncommon" is noise. C: high. D: medium. This card has no hint line at all. E: medium-high. There's no "stopped" pill, so no agent seems blocked, but nothing says so.

**Close read:**
- "Changed since you last looked: heartbeat every 30 s": a first-time user has never looked, and the line doesn't say which option it favours.
- The toast's "A new card arrived in time." reads as "arrived punctually".
- "The agent's reasoning": two agents are named, so which one?
- The agent's pick is shown up front here but hidden on screens 1 and 3, and nothing says why.

### Screen 5: low stakes, checking an agent's own call
**Glance:** (1) "Let 'cache rendered Markdown in memory' stand?"; (2) "Overturn it" and "Let it stand"; (3) the 3 ms note.
- A: high. B: high ("easy to undo"). C: high. D: medium. E: high.

**Close read:**
- The left column repeats the card's title and says "Nothing else is connected to it yet." It's pure noise.
- The "Common" badge (a filled dot in a ring) and the empty circle in the left column look like radio buttons on a screen about choosing.
- The toast competes again.

## 3. The left column
The content is useful but it's noisy and doesn't read at a glance.
- It works best on screen 3, where it names the two decisions that clash, and well enough on screen 4, where something depends on the card.
- On screen 1 it repeats the rule conflict the card already shows, and adds a "builds on" item that doesn't bear on the choice.
- On screen 5 it's empty.

Why it doesn't read at a glance:
- The connector labels are backwards. In "↓ this card builds on this" the arrow points at this card, while "this" means the item above it.
- The node shapes (dot, square, dashed circle) are unexplained.
- "in gate" is jargon.
- The highlighted "this card" node copies the main card's fill and border, so it pulls the eye to the top left.

## 4. Ranked changes
1. **[Blocker] Card header:** hide the tier word behind a tooltip on the badge. Always lead with stakes and undo cost, e.g. "Hard to undo · touches security". Screen 3 needs an undo cost.
2. **[Blocker] Misleading or unexplained text:**
   - Hide the green dot unless the connection drops.
   - Change "your rule, in gate" to "your rule".
   - Remove "Last in time; next, client".
   - Make "A new card arrived in time" either style "time" as a topic chip or drop "in time".
3. **[Blocker] Screen 5:** hide the left column when nothing is connected.
4. **[Blocker] Screen 4:**
   - Move "Changed since you last looked…" behind "The agent's reasoning".
   - Make the question neutral: "WebSockets or server-sent events for live updates?"
5. **"Before you choose" box:** drop the label and un-bold the sub-question, so it reads as context rather than a second question.
6. **Toast:** use a light surface so it's never the darkest thing on screen, and quote the option: Chose "In a cookie…".
7. **Option "then" lines:** remove the repeated "claude-code resumes," and ", and the merge goes ahead".
8. **Arrow chips:** use one neutral colour on both sides.
9. **Left column:**
   - Reword the connectors: "builds on ↑", "conflicts with ↓", "relied on by ↓".
   - Show the "this card" node as a plain marker, not a card.
   - Use the same order as the options.
   - Drop the ", in client" suffix.
10. **"Write":** rename it "Other answer". "Can't judge" is fine.
11. **Mythic rainbow border:** make it thinner and static. Right now it's seen before the question.
12. **Bottom icon strip:** lower its opacity and give each icon a hover label, or remove it, since the header already gives the count.
13. **Screen 2:** change "press here" to "click". Attribute the falsifier: "It's wrong if…".
14. **"Common" badge:** swap the radio-button-like glyph.
15. **Breadcrumb above the card:** remove it. The topic already appears below the card and in the bottom bar. Low priority.

## 5. What must be kept
- The large serif question, with two equal options side by side.
- The "if" (when to pick it) and "then" (consequence) lines, especially concrete costs that name the agent and the number of commits.
- "N to answer. Two agents have stopped for you." and the "claude-code stopped" pill.
- On high-stakes cards: choose before seeing the agent's pick, then the reveal ("You chose / claude-code picked / its case"), then hold to confirm.
- Undo with a countdown.
- The crux line in "Before you choose" on screens 1, 3 and 5, with quieter styling.
- The stakes phrases ("hard to undo", "costly to undo", "easy to undo").
- The left column's view of a conflict (screen 3) and of a dependent (screen 4).