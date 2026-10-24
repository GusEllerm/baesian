# Glance review 2

Independent reviewer, screenshots only, 2026-10-24. Verdict: sufficient. Screenshots: scratchpad/glance-review-2/.

## 1. Verdict: SUFFICIENT

On all five screens a glance answers A (the big serif question) and C (two boxed options, each with a title and an if/then consequence) with high confidence. The words in the card header answer B ("Hard to undo, touches security", "Easy to undo, codex decided it without asking"); the borders only back them up. D is medium everywhere: the option boxes look clickable and the ←/→/↑/↓ keycaps hint at keys or swipes. The top bar and "X stopped" answer E. The question and options are clearly the focus at both sizes. Nothing overlaps or clips. What's left are refinements: one misleading label, some content said twice, two sub-notes that end in a second question, unexplained glyphs in the bottom tray, and a few bad line breaks. None stops a first-time user from answering.

## 2. Per screen

### Screen 1: high-stakes, just opened
**Glance:** (1) the question; (2) the two option boxes; (3) the maroon and rainbow border with tilted cards behind, then "Hard to undo, touches security". The left column registers as a list I don't read.
- A high. B high (from the words; the foil looks "special", not "dangerous"). C high for the two options, low for "Other answer" and "Can't judge": what happens to the stopped agent? D medium. E high ("5 to answer. Two agents have stopped for you." plus "claude-code stopped").

**Close read:**
- The note ends in a second question ("Does that rule cover the part of a link after the #?") and says "one option" without naming it. I have to work out that it means the fragment.
- The conflict with "Never put secrets in URLs" is shown twice: in the left column and in the note.
- "2 more in this pile" repeats the stacked cards and the tray.
- The footer hint wraps, leaving "after." alone on the last line, at both sizes.
- The header badge (a tiny white glyph on a maroon disc) doesn't look like the crown in the left column and tray, so I can't learn the symbol from it.
- At 1440 only, "In a cookie set on first / visit" leaves "visit" alone on its own line.

**Left column:** the "builds on ↑" and "may conflict with ↓" labels read at a glance. The conflict entry is useful but repeats the note. "Serve the client with Node's http module" has no visible bearing on where a token lives, so it's noise here.

### Screen 2: after choosing
**Glance:** (1) the chosen option outlined in blue; (2) the blue "Hold → … to confirm" bar; (3) "You chose X. claude-code picked Y."
- A high. B high. C high, and I now see the agent disagrees. D high. E high.

**Close read:**
- The reasoning box mixes a quote and a paraphrase, and the "it" in "claude-code says it's wrong if…" is unclear.
- The agent's pick is faded until it is hard to read, at the moment I'm asked to weigh our disagreement.
- The bar copy "Hold [→] , or click and hold here, to confirm" has a stray space and comma, and is awkward.
- Layout is fine at both sizes.

### Screen 3: two decisions that disagree
**Glance:** (1) the question; (2) the options; (3) the gold glow and "Costly to undo, two settled decisions disagree". The undo toast is in the corner.
- A high. B high. C high: "claude-code reworks 5 commits" against "codex reworks 1 commit" is concrete and excellent. D medium. E high.

**Close read:**
- The note ends with "Which of those should the format serve?", which restates the main question.
- "Settled" decisions that are now being re-decided is an odd word choice.
- At 1440 the toast breaks as "Sending in 2 / s.", splitting the number from its unit.

**Left column:** the best use of it. "Decides between ↓" and the two settled entries explain the header immediately.

### Screen 4: medium-stakes
**Glance:** (1) the question, broken as "server- / sent"; (2) the options, with a blue "claude-code's pick" label on the right one; (3) "Costly to undo, 1 decision rests on it" with a silver border.
- A high. B medium-high. C medium-high ("codex keeps streaming the queue view" only makes sense with the left column). D medium. E medium: nothing says "stopped", but "1 decision rests on it" could read as something waiting.

**Close read:**
- **Misleading:** the left column names this card "Live updates with server-sent events", which takes the agent's answer as given. Screens 1 and 3 use neutral names.
- The title breaks the technical term across lines at both sizes. On every screen the title is wrapped much narrower than the card.
- The pick label uses the same blue as the "selected" state on screen 2, so it can look pre-selected.
- The note's "If the presence heartbeat … moves onto this connection" doesn't say whether that move is planned.
- The toast bundles the undo with "A new card arrived", and nothing shows which card is new.

**Left column:** "relied on by ↓" shows what "1 decision rests on it" means, which is useful. The "builds on" entry is weak again.

### Screen 5: low-stakes check of the agent's own call
**Glance:** (1) "Let 'cache rendered Markdown in memory' stand?"; (2) "Overturn it" / "Let it stand", with "what codex did" above the second; (3) "Easy to undo, codex decided it without asking".
- A high. B high. C high. D medium. E medium-high.

**Close read:**
- "If the cache is cleared whenever a card's file changes" is something I can't check from the screen. It could also be read as a condition attached to my approval ("let it stand, if…"). The if-line is most ambiguous here.
- There is no left column, so the left 40% of the screen is empty. Keeping the card in the same place across screens is defensible.

### All screens: bottom tray
These are the only elements on any screen with no words: crown, diamond, ring and star glyphs, plus a red dot (agent stopped) and a green check. They also repeat "N to answer" and "N more in this pile". The tray doesn't compete with the card, but it fails "no element unexplained". The breadcrumb "client › The local server the client talks to" reads like a description and doesn't match screen 1's question.

## 3. Ranked changes (none are blockers)

1. **Screen 4, left column:** rename "Live updates with server-sent events" to a neutral name, e.g. "How live updates reach the browser".
2. **Notes on screens 1 and 3:** drop the trailing questions and name the option. For example: "Your rule 'never put secrets in URLs' may rule out the fragment, if the part after # counts." On screen 3, delete "Which of those should the format serve?".
3. **Remove "N more in this pile":** the stacked cards and the tray already show it.
4. **Draw the header badge with the same glyph as the tray and left column** so the symbols can be learned. Give each tray glyph a hover label.
5. **Screen 2:**
   - Rewrite the reasoning box in one voice, e.g. "The fragment is unsafe if any page runs a script that reads the address bar (check src/client/index.html loads no external scripts)."
   - Fade the agent's pick less.
   - Change the bar copy to "Hold → or click and hold to confirm".
6. **Line breaks:**
   - Widen the title measure, or use a non-breaking hyphen in "server-sent".
   - Put a non-breaking space in "2 s".
   - Shorten the footer hint to one line: "Hold to confirm. claude-code's pick shows after."
7. **Left column:** drop the "this card" subtitle (the highlight bar already says it). On screen 1, where the conflict is in the note, drop it from one of the two places.
8. **Pick label:** use a neutral colour, not the selection blue.
9. **Toast:** drop "A new card arrived", or mark the new card in the tray.
10. **Demote the breadcrumb** (the tray already names the topic) and tone down the tilted pile and foil on high-stakes cards.

## 4. What must be kept

- The large question and two side-by-side options, each with a title, an "if" line and a "then" consequence. The concrete costs ("reworks 5 commits", "adds a dependency") are the strongest thing on these screens.
- The stakes stated in words in the card header.
- "X stopped" on the card, and "N to answer. Two agents have stopped for you." in the top bar.
- On high-stakes cards: choosing before seeing the agent's pick, the reveal sentence, hold-to-confirm, and "Esc goes back to the choice."
- The undo toast with its countdown and the Z key.
- The left column on conflict and dependency cards (screens 3 and 4), with its "decides between" and "relied on by" labels.
- The "Overturn it" / "Let it stand" framing for checking an agent's own call, with "what codex did" marking the default.
- The keycap hints.