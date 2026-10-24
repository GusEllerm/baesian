# Map review 5

Independent reviewer, fresh context, 2026-10-24, of map.js v5 (tracks). Screenshots: scratchpad/harness/map-review-5/.

## 1. Verdict: NOT SUFFICIENT (close)

The form is right. It stays stable: after I answered three cards in `#scale`, none of the 150 decisions had moved. It's honest about relations (typed letters, mirrored in the side panel) and it does give orientation the side panels can't. Two obstacles remain, both cheap to fix:
- **Off-screen content isn't signalled reliably.** There's no "above" cue at all. The "below" cue miscounts on first open. Relation endpoints leave the screen with no label.
- **The map's keyboard stops working** after you go back from looking at another decision.

In `#scale` at 1280×800, opening the map from a card in the auth area hides cards #1–#3 above the view, and nothing says so. That fails question 4 and the "clearly signalled" bar. Everything else below is a refinement.

## 2. Cold-read answers

| Opening | Q1 where | Q2 relations | Q3 settled/waiting/deferred | Q4 waiting, most urgent | Q5 back / go |
|---|---|---|---|---|---|
| Small, first card, 1440 | High: outlined chip, tinted area, side panel names work and area | High: conflicting rule in gate, dashed line; settled decision it builds on, next to it | Medium: the area count lines help; the legend maps 4 marks to 4 words by position | High: numbered chips plus "Next up"; #1 is this card | High: "Back to the card Esc"; click a chip |
| After 3 answers / another area | High | High ("Nothing else is connected") | Medium-high (answered chips are green and ticked) | High | High |
| Answered card reopened in review | Medium: the panel still says "The card you're answering" | High | Medium | High | High |
| All answered | n/a | Click to inspect | High; the map reads as a record | "Nothing." | High |
| `#scale`, first card, 1440 | High (centred), though every name is cut short | High | **Low-medium:** compact area headers drop the settled, rule and deferred counts | Medium: numbers scattered across 8 areas; the "below" cue is good | High |
| `#scale`, card in auth, 1280 | High | High | Low-medium | **Low:** #1–#3 are above the view, no cue | High |
| `#scale`, looking at a settled decision | High | **Medium:** endpoints clipped off-screen | — | — | Medium: Esc means two things |

## 3. Problems, ranked

All screenshots are in `/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-5/`; each path is given in full.

**P1 — BLOCKER. Cues for off-screen content are missing or wrong.**
- **No "above" cue.** In `#scale` at 1280×800, opening the map from an auth card hides gate and half of client. That includes #1, #2, #3 and #8, and client's own heading is clipped.
  - Evidence: /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-5/j1280-01-map-from-auth-card.png
- **The first-open "below" cue misses an area.** It says "Below: auth, with 4 cards" while store (#23) is fully hidden too. After a 2 px scroll it corrects itself to "store, auth, with 5".
  - Cause: `overflow()` measures before the bar appears and shrinks the map body, and isn't run again.
  - Evidence: /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-5/g1280-scale-03-map.png and /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-5/d1280-scale-02-space-held.png
- **Relation endpoints leave the screen unlabelled.** Looking at a settled decision, the line to B (in auth) runs into the bottom bar. On another card, B's letter is clipped at the top edge.
  - Evidence: /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-5/f1280-07-inspect.png and /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-5/i1280-03-offscreen-rel.png
- **Hovering a side-panel entry for an off-screen decision shows nothing.** It doesn't scroll there.
- **In the done state the cue reads "with 0 cards to answer".**
- **Why it matters:** the most urgent cards and the conflicts are exactly "what matters", and they're hidden without a signal.
- **Fix:**
  - Run `overflow()` again after toggling the bar (or reserve its row).
  - Add a matching ↑ cue.
  - Name what's off-screen: "↑ gate: #1 #2 #3, 3 stopped · B".
  - Pin a letter chip such as "B ↓ auth" where a line leaves the view.
  - On open, scroll so the subject *and its relations* fit, rather than just centring the subject.
  - Make side-panel hover or click scroll an off-screen target into view.

**P2 — BLOCKER. The map's keyboard stops working after going back.** After Esc from looking at a decision, or after clicking "Show my card's connections instead", the focused button is re-rendered away and focus falls to `body`. `onKey` listens on `.map`, so arrows, j/k and Enter do nothing until you click or Tab. The legend advertises these keys.
- Evidence: the logs show focus empty after Esc for every key and `BODY` after the panel link. Screenshot: /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-5/b1440-10-key-down2.png (no focus after Esc, ↓, ↓).
- **Fix:** in `backToCard()`, quietly focus the subject chip, or listen on `document` while the map is open.

**P3. Wrapped lanes break the time order.** At scale, "Speed up session state" wraps onto a second line. That line has no label and starts at the left again, so newer decisions sit to the left of, and below, older ones. Where it wraps depends on the viewport: "Debounce search results…" is at the end of line 1 at 1440 and the start of line 2 at 1280.
- Evidence: /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-5/f1280-07-inspect.png and /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-5/f1440-07-inspect.png
- **Fix:** don't wrap lanes. Collapse runs of settled, rule and deferred marks into a count ("‹5›"), or, if a lane must wrap, indent the continuation and mark it with ↪.

**P4. Names are cut short when there's room.** At scale, all 25 named chips are truncated at both sizes; in the small project, 3 of 5 are. Often more than half the lane is empty.
- Evidence: /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-5/e1440-03-map.png and /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-5/a-03-map.png
- **Fix:** size chips from the lane's free width; truncate only when the lane is full.

**P5. Esc means two things while looking at another decision.** The header says "Back to the card Esc" and the panel says "Show my card's connections instead Esc". Esc does the second.
- Evidence: /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-5/j1280-02-inspect-esc-labels.png
- **Fix:** in that state, drop the Esc hint from the close button.

**P6. Weak support for question 3 at scale.**
- Compact area headers show only "4 to answer, 3 stopped"; the other counts are hidden in a tooltip.
- The deferred and agent's-own-call marks are faint.
- The legend lists four marks and then four words, so you have to match them by position.
- **Fix:**
  - Give compact counts: "9• 2▪ 1‖".
  - Put each mark next to its own word in the legend.

**P7. Your card loses its "you" badge when it's lettered as a relation.** When you look at the rule your card conflicts with, your card shows only "A", and the panel doesn't say it's yours.
- Evidence: /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-5/b1440-04-click-rule.png
- **Fix:** show "A · you".

**P8. Wording.**
- A card opened for review is still headed "The card you're answering". Evidence: /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-5/d1440-11-map-from-review.png
- "Next up" doesn't give each card's area.
- The "below" cue doesn't mention stopped agents (#6 and #7 in auth are stopped).

**Where it departs from the Atlas intent.**
- **No zoom levels and no staged move.** It's a modal overlay with a 180 ms crossfade: /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/map-review-5/d1440-03-space-up-60ms.png. So the "where am I" link at the moment of opening is lost. A brief pulse of the subject chip on open would restore it cheaply.
- **No degree of interest.** Unrelated areas aren't faded. There's no "changed since you last looked". Conflicts elsewhere in the project are invisible unless you hover each decision. One flat level works at 150 decisions, but won't at 500.

## 4. What works and must be kept

- **A stable layout.** Whether a decision gets a name depends only on its own state, so after three answers none of the 150 moved.
- **The current card is easy to find:** outlined, with a "you" badge, in a tinted area.
- **The relations list.** Lettered relations are repeated in the side panel with typed tags ("builds on", "may conflict", "disagrees") and a sentence saying where each one is. Hovering an entry rings the decision on the map.
- **Lines only where needed:** none between neighbours; dashed wine for conflicts; arrows for builds-on. Hovering shows a second set of relations in a lighter tone.
- **The queue order.** Order numbers on the chips, plus "Next up, with stopped agents first". j/k walk the queue and scroll it into view.
- **Clicks do what you'd expect for each kind:** a card waiting for you opens it, an answered one opens your answer, anything else shows its connections. Tooltips say which.
- **The ways in and out:**
  - Esc goes back one step at a time.
  - Space peeks and never confirms an answer.
  - M and the header button both open it.
- **The finished map reads as a record of what you answered.**

## 5. Form

The form is right: areas as rows, pieces of work as lanes, time running left to right, names only for what needs you, and the relations of one decision at a time. Fix how it handles what's off-screen and how lanes fill, rather than replacing it:

```
 ↑ Above: gate #1 #2 #3 (3 stopped), client · 7 to answer        [B ↑ gate]
┌ time   4 to answer · 1 stopped · 9• 2▪ ─────────────────────────────────┐
│ Card timestamps     •──(★5 Which time format the record uses)───────────│
│ Harden record sync  ▪ ‹3› ▪ (★11 Cache topic aliases per worktree) ‹2› ▶│
└──────────────────────────────────────────────────────────────────────────┘
 ↓ Below: store #23, auth #6 #7 (2 stopped) · 5 to answer         [C ↓ auth]
```

- ‹n› is a collapsed run of settled, rule or deferred marks; hovering it expands the run.
- [B ↑ gate] is an edge chip where a relation line leaves the view; clicking it scrolls there.
- Lanes never wrap.

An optional "conflicts anywhere" toggle, putting a badge on every decision with an open conflict, would cover relations across areas without turning the map into a hairball.