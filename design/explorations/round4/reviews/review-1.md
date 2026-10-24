# Review 1 (of round 3)

Independent reviewer, fresh context, 2026-10-23. Screenshots: scratchpad/harness/review-1/.

## 1. Verdict: NOT SUFFICIENT

The core content is good. Each card has a clear question, two options that are contrasted with a "Better if" condition, "Then:" lines saying what happens, and a labelled "one thing most likely to change your answer". But the prototype is hard to understand for three reasons:

1. **The layout fights the content.** The card sits on top of the map and covers the very context it cites.
2. **Most of the visual signals are unexplained jargon.** Rarity names, foil, the tag hole, "Split card", "No. 2 of 3", node shapes and edges are never explained on screen.
3. **The interaction breaks at its most important moment.** The confirm step on high-stakes cards renders as overlapping, tilted, half-offscreen text. Typing into the write panel can also switch the card underneath it.

A first-time user can answer questions 1–3 roughly. They can't answer 4–5 within a minute, and at 1280×800 there are no answering instructions at all.

## 2. Phase A (cold read, first three cards)

1. **What is this for, and what is it asking?** Medium–high confidence. The header says "5 decisions need you. One is mythic: an agent has stopped." The question, "Keep the client's access token in the URL fragment?", is the largest text on the card. But a yes/no question sits above two columns both labelled "Option", so is it yes/no or A/B?
2. **What are my options and what happens?** High on consequences, thanks to the "Better if…" and "Then: claude-code adds a cookie…" lines. Low on which option the agent proposed, and on what left and right mean: accept, reject, or "take the alternative"?
3. **How do I answer?** Medium at 1440, none at 1280.
   - The only legend is 12.5px grey text in the bottom-right corner. It is `display:none` below 1300px (style.css:199).
   - "Read it first: answers unlock in 2.6 s" and "Drag the card a little either way…" sit in small text at the bottom of the card.
   - Pressing → brings up an unannounced second step: "Hold → or press here".
4. **Why does the card look like this, and how careful should I be?** Low. All the user gets is "Mythic", a crown and a rainbow frame. "why mythic?" looks like a link, but clicking does nothing; the reason exists only as a delayed native tooltip. The header ties mythic to "agent has stopped", yet the Rare card also says "Agent waiting". The punched tag hole and the holo band are never explained.
5. **What is the map showing, and what depends on this?**
   - **Where it sits:** medium. Area "client", lane "The local server the client talks to", and a thread to the crown node.
   - **What depends on it:** low.
     - The grey arcs have no arrows or labels.
     - "4 commits" sits between two nodes, so it's unclear which one it belongs to.
     - The dashed magenta edge runs *behind the card* to the conflicting rule, which you can only see by holding Space.
     - The "bookmarks and Tailscale links" the card says will depend on this appear nowhere on the map.
     - There is no legend for ● ◆ ★ ♛ ■, the dashed node, "an agent's own call", "rule" or "deferred".
6. **How much is left?** High: the header count and the "Next up" chips. Minor confusion: "Next up" includes the current card, and "No. 2 of 3" reads like your position in the queue.
7. **What happened, and can I undo it?** Medium on what happened: a toast restates the verdict, the chip is struck through, and the node becomes an (unexplained) blue stamp. On undo: there is none. The toast has no undo, and clicking a struck chip does nothing.

## 3. Problems, ranked

All screenshots are in `/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-1/`; the filenames below are in that folder.

### Comprehension and structure

**1. The reveal and hold-to-confirm step looks broken.** This is the step on the most consequential cards.
- **Evidence:** `12-release-right-300ms.png` and `30-rare-left.png`.
  - The card stays tilted where you dropped it.
  - The original text shows through, ghosted under the reveal text.
  - The 22px drop bar cuts through the sentences.
  - After a left choice, the reveal text and the hold button run off the left edge of the screen.
- **Why it confuses:** the moment that's meant to slow you down is the hardest text on screen to read.
- **Fix:** snap the card back to its rest position, replace its contents rather than overlaying them, hide the drop bar, and put the hold control under the reveal text.

**2. The map can't do its job behind the card.**
- **Evidence:** `01c-load-6s.png` and `17-space-hold-1600.png`.
  - The card covers the left of the map, and PLAN puts dependencies on the left. The rule the cue cites, "Never put secrets in URLs", is hidden behind it.
  - The right edge is clipped ("Store verdicts in one shared fil").
  - Area counts never update: "client: 4 waiting" after all four were answered; "release: 1 waiting" on the end screen (`55-end.png`).
  - Holding Space hides the card entirely, so you can't relate the map to the card.
- **Fix:** see section 5. Give the map its own space, label and direct the edges, add a small legend, and update the counts.

**3. The write panel doesn't take focus, so keystrokes fire shortcuts.**
- **Evidence:** `87-typing-without-focus.png`. Press ↑, then type "Ask about k":
  - the "k" switches the card underneath to the codex card;
  - the textarea stays empty;
  - the button still says "Send to claude-code".
- **Why it matters:** a written answer can go to the wrong card and the wrong agent.
- **Fix:** focus the textarea when the panel opens, block global shortcuts while it's open, and lock the panel to its card.

**4. Rarity is jargon, and its meaning for "how careful should I be" is hidden.**
- **Evidence:**
  - `57-why-mythic.png`: clicking "why mythic?" shows nothing.
  - `19-j.png`: "Split card" isn't visually split, and the holo band reads as a washed-out rendering fault.
  - `44-card4.png`: "Reprint" is opaque.
  - The tag hole is decoration, and "No. 2 of 3" is the collector number.
- **Why it confuses:** the trading card, the manila luggage tag, the detective's thread and the postal stamp are four metaphors at once.
- **Fix:** keep the glyph and the frame colour, and put the plain reason visibly on the card: "♛ Mythic: security · one-way · agent stopped → you choose first, then hold to confirm". Make "why" a click-open popover. Drop the tag hole. Fold the variants into the reason line.

**5. The human-first blinding leaks.**
- **Evidence:** `01c-load-6s.png`. The question ("Keep … in the URL fragment?"), the Next-up chip and the map node label all name the proposal.
- **Why it confuses:** "Option / Option" then just looks like missing labels.
- **It also withholds the wrong things:** the "Wrong if… Check:" line and the rationale only appear after you choose, on exactly the cards where verifying matters most.
- **Fix:** phrase high-tier questions neutrally ("Where should the client's access token live?") in the card, the chip and the node. Show "Wrong if / Check" before the choice; only the agent's pick and its rationale need hiding.

**6. The consequence preview is tiny and far from your eyes.**
- **Evidence:** `07-drag-left-200.png` and `15-peek-left.png`.
  - The map change is two hatched 6px ticks and one faded label, about 700px from the card.
  - The main signal is a text line that repeats the card's "Then:".
  - Dragging left pushes the option you're choosing off-screen.
- **Fix:** as you lean, enlarge the chosen option on the card and dim the other, and draw the map effects next to the card. Keep the card on screen when dragging left.

**7. Answering is under-signalled, and the tiers aren't explained.**
- **Evidence:** `70-1280-first.png` has no legend at all. The drop zones are asymmetric: the left one is at the screen edge, the right one in the middle of the map.
- **The tiers are inconsistent:** a Common card commits instantly on release, with no confirmation and no undo, while a Mythic needs three steps. Nothing tells you which tier you're in.
- **Fix:** put a persistent answer bar under the card, with "← Cookie · Fragment → · ↑ Write · ↓ Can't judge" and the tier's rule, e.g. "Unlocks in 2 s", "Hold to confirm".

**8. There is no undo or history.**
- **Fix:** add an "Undo" to the toast for about 5 s on non-blocking cards. Make struck chips reopen the verdict, read-only, with "change answer".

### Polish

- **Grammar and copy:**
  - "1 decision need you."
  - "…in memory. the cache stays." (lowercase after a full stop)
  - "Took the alternative: settle the time format conflict" (wrong sense)
  - The Rare question lists ISO first, but ISO is the right-hand option.
- **Inconsistent words:** the same answers appear as Option, Proposal, Take the alternative, Accept, Let it stand and Passed on. "Better if" and "Wins if" mean the same thing; so do "Wrong if", "Check before you choose" and "Check:". "You're here" is a presence indicator that reads like a map marker, and it has no tooltip.
- **Type:**
  - 13 distinct type styles on one card.
  - Many labels are 12.5–13px #5E5170 on manila.
  - The map's area titles ("client", about 30px, heavy condensed) compete with the question.
  - Map labels drop to about 7px under Space.
  - The rule is mentioned three times on the Mythic card.
- **Motion:** during the card-to-card flight, the incoming card is translucent and map labels show through it (`27-after-hold-release-400.png`).
- **Panels:** the write panel covers the cue box (`33-uncommon-up.png`, and `72-1280-write.png` at 1280).
- **Clipping:** map labels are cut at both edges, and the outline of the panel behind the card shows around it.

## 4. What works and must be kept

- The header sentence.
- The question, plus two contrastive options with "Better if" and "Then:". This is the best thing on screen.
- "The one thing most likely to change your answer / Why this one".
- The trigger line in the agent's voice, with the "Agent waiting" badge.
- The locked-drag feedback: a grey bar and a countdown toast.
- Toasts that restate the consequence.
- The write and can't-judge panels with preset reasons.
- The calibration copy, which covers both over- and under-reliance (`58-calibration.png`).
- The practice-card reveal (`63-practice-reveal.png`).
- The clean overview (`14-overview.png`).
- The rarity glyphs (● ◆ ★ ♛) used consistently on chips and nodes.

## 5. Structural recommendation

The overlay layout itself is the root problem, not just polish: a card floating over a full-bleed map that it partly hides and clips. I recommend a fixed three-zone layout:

```
+----------------------------------------------------------------------+
| Baesian  5 need you · 1 agent stopped        Practice   Calibration  |
+------------------+--------------------------------+------------------+
| NEEDS / CONFLICTS| ♛ Mythic: security, one-way,   | WHAT FOLLOWS     |
| ■ Never put      |   agent stopped (why ▸)        | Bookmarks,       |
|   secrets in URLs| Where should the token live?   |  Tailscale links |
|   ──conflicts──▶ | ← Cookie         Fragment →    | ◆ Push live      |
| ● Serve via Node |   Better if…      Better if…   |   updates        |
|   ──needs──────▶ |   Then: …         Then: …      |  (lights up or   |
|                  | Check: does the rule cover #?  |   hatches as you |
|                  | [← → choose · ↑ write · ↓ ?]   |   lean)          |
+------------------+--------------------------------+------------------+
| Atlas strip: gate ■●● | client ●♛◆ ●○◆◆ | time ●★ | release ○●   (Space = full map)
| Queue: ♛ now · ★ · ◆ · ◆ · ●     answered ✓ (click to review / undo)  |
+----------------------------------------------------------------------+
```

- **The card** is centred and never covered.
- **The side panels** show only the typed neighbours, with labelled edges, and are where the preview animates.
- **The full Atlas** becomes a faint strip that expands on Space or on click.

This *demotes* the Atlas from backdrop to context frame; it doesn't remove it. I also recommend demoting the foil, holo band and tag hole of trading-card rarity, while keeping the rarity glyph, the frame colour and the plain-language reason. Every other ingredient stays.

Key screenshots, as full paths:
- /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-1/01c-load-6s.png
- /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-1/12-release-right-300ms.png
- /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-1/30-rare-left.png
- /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-1/87-typing-without-focus.png
- /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-1/17-space-hold-1600.png
- /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-1/70-1280-first.png
- /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-1/55-end.png