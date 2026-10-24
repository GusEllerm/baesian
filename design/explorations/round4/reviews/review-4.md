# Review 4 (of round 4c, with the pile)

Independent reviewer, fresh context, 2026-10-23. Screenshots: scratchpad/harness/review-4/.

## 1. Verdict: SUFFICIENT

Nothing I found stops a first-time user from understanding the screen, and no redesign is needed. Nearly everything now explains itself in words. The rarity line gives the reason ("Mythic, the highest of four levels, because it touches security…"). A stepper shows why you can't answer yet ("Read it 2.6 s → Choose → Hold to confirm"). Each option has "Better if" and "Then…". Typed rails show what this builds on and what your answer changes. A first-time user can answer questions 1–5 on the first card in about a minute, and faster after that. What's left is fixable without restructuring. Two of those problems should still be fixed before early users see it, because they work against the friction and practice ingredients: Space means two things (problem 1), and header buttons keep keyboard focus (problem 8). There's no overlap or overflow in the card view at 1280×800 or 1440×900. The map does cut neighbouring columns off at the screen edges.

## 2. Phase A answers (cold read, cards 1–3)

1. **Purpose and current ask.** High confidence. The header says "5 cards need your answer. Two agents are waiting on you." Then the question, with "I've stopped until you answer."
2. **Options and consequences.** High from the option boxes ("Then claude-code resumes, and puts the token in each link as /#t=…"). Medium for the right rail's filled and outlined chips.
3. **How to answer.** High. The screen shows "← Choose this →", "↑ Write an answer", "↓ I can't judge this", "You can also drag the card…", and a dwell countdown. If you answer too early it says "Read it first: answers open in 1.2 s", but that message appears bottom-left, where it's easy to miss. Space confuses, because it has two meanings.
4. **Why it looks like this.** High for "this is the most serious kind", from the sentence. Low for what the frame and sheen each encode. The pile is clear from "2 more in client under this one". On card 2, the mythic card's rainbow edge shows under the uncommon card, so card 2 looks foil too.
5. **Where it sits, what depends on it.** Medium-high, from the breadcrumb, "Never put secrets in URLs · may conflict · your rule", and the right rail. The rails do this job better than the map.
6. **How much is left, what's next.** High: the header count, "Last card in time. Next: client.", and the queue. Medium on urgency, because nothing shows which cards have an agent stopped.
7. **After answering.** High. A toast says "It goes to claude-code in 4 s. Undo Z", the queue item gets ✓, and clicking it reopens the card with "Change your answer".

## 3. Problems, ranked

None of these block understanding. Problems 1 and 8 should be fixed before early users.

### Comprehension and structure

**1. Space means "look at the map" and "confirm" at once.**
- **What's wrong:** In the confirm step on a mythic card, the bar says "Hold ← or Space … to confirm". The footer still says "Hold Space to look at the map". When I held Space to look at the map, it confirmed the mythic card. On rare cards, a single tap of Space confirms.
- **Evidence:** /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-4/04c-tap-left-in-confirm.png
- **Why it confuses:** It's a contradiction on the same screen, on exactly the cards hold-to-confirm exists to protect.
- **Fix:** Make Space mean "map" everywhere. Confirm by holding the chosen arrow, or by holding the bar.

**2. The map cuts off the relation that matters most.**
- **What's wrong:** At the "This area" level, the "conflicts" line from the token card runs off the left edge into a faded gate column you can't read. Neighbouring columns are cut mid-word ("Card tir", "claude-cod"). The mid-flight frame shows the endpoint exists. At "Whole project" there are no edges at all, though the legend still lists arrows, conflicts and commits.
- **Evidence:**
  - /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-4/07d-space-hold-950.png
  - /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-4/09a-thisarea-again-150.png (mid-flight)
  - /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-4/24c-map-whole-after-answers.png
- **Why it confuses:** It reads as broken layout, and it hides the contradicting rule, which the research ranks as the most valuable context.
- **Fix:**
  - Frame the camera on the current card plus all its typed neighbours, across areas if needed.
  - Show endpoints outside the frame as labelled stubs ("⇢ Never put secrets in URLs · gate").
  - Replace the cut-off columns with edge tabs.
  - At "Whole project", draw the current card's edges, or drop those legend items there.

**3. "Waiting for you" means two different things.**
- **What's wrong:** The tag on the card means an agent is stopped. On the map it means "unanswered": client shows "3 waiting for you" when only one card there has an agent stopped. Queue chips don't show which cards have a stopped agent. Grouping by area also puts the rare card that blocks codex's merge behind two client cards with no agent stopped.
- **Evidence:**
  - /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-4/01c-load-6s.png
  - /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-4/20e-1280-map-whole.png
- **Fix:** Keep "waiting" for stopped agents only, and say "3 to answer" on the map. Put an "agent stopped" marker on queue chips. Let a card with a stopped agent jump ahead of its area's pile.

**4. The consequence rail looks pre-selected when you're not leaning.**
- **What's wrong:** Before you lean, one side's chips are filled ("← switches to it", "← reworked", "← re-decided"). That looks like a selection. "Resumes either way" is drawn outlined, which the legend says means "stays as it is", but resuming is a change. A legend of chips literally labelled "filled" and "outlined" repeats on every card.
- **Evidence:** /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-4/04h-after-hold-200.png
- **Fix:** Show neutral chips at rest, since the words already carry the meaning. Fill only the side you lean toward. Mark rework with a single hatch. Drop the legend.

**5. The hidden proposal leaks out.**
- **What's wrong:** On a rare card, opening ↓ (or ↑) labels the options "Proposed by codex" and "The alternative". Esc hides the labels again, and you can then choose, already anchored.
- **Evidence:**
  - /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-4/16b-rare-down.png
  - /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-4/16c-rare-after-cancel.png
- **Fix:** Keep the labels hidden in those panels. Or, once they've been revealed, keep them visible and record "saw the proposal first".

**6. The pile puts other cards' foil around the current card.**
- **What's wrong:** The uncommon card shows the rainbow edge of the mythic card underneath it.
- **Evidence:** /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-4/20g-1280-card2.png
- **Why it confuses:** It undermines question 4: the card's look no longer tells you its own rarity.
- **Fix:** Draw the cards in the pile as plain manila backs, with only the top card treated.

**7. Feedback appears far from where you're looking, and the dwell drag misleads.**
- **What's wrong:** During the read dwell, a drag animates fully and the rail says "Let go to choose it". Releasing then refuses, with a toast 400 px away in the bottom-left. The undo toast sits there too.
- **Evidence:**
  - /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-4/21a-drag-far-during-read.png
  - /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-4/21b-release-far-during-read.png
- **Fix:** Make the drag resist during the dwell, and have the rail say "Answers open in 1.2 s". Pulse the "Read it" step itself. Show the undo message under the card.

### Polish and bugs

**8. Header buttons keep focus, so Enter and Space activate them.**
- **What's wrong:** After I clicked "Practice cards: off", pressing Enter on the practice-card reveal both continued and silently turned practice back off. After Esc, a focus ring stays on the header buttons.
- **Evidence:** /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-4/23b-after-enter.png
- **Fix:** Blur header buttons after a click, and handle card keys globally so they never reach a focused button.

**9. Badge sentences run on.** They read "may conflict your rule in the work 'The commit gate'", "builds on settled in the work…", "disagrees settled in…". "The work" is jargon. Reword them, for example "Your rule, in The commit gate. May conflict."

**10. The mythic seal is unreadable on the card.** It's a 20 px blob, though the crown reads fine in the queue and on the map. The rare "holo band over the question" from PLAN.md isn't there, so rare and uncommon differ only in frame colour. Enlarge the mark to about 28 px.

**11. The queue truncates to mush.**
- **What's wrong:** Chips shrink to "Wher…" and "Store v…" as cards are answered. The end screen still shows "j k move between cards".
- **Evidence:**
  - /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-4/14b-ask-question.png
  - /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-4/17h-wait6.png
- **Fix:** Collapse answered chips to a ✓ count per area, and hide the key hints on the end screen.

**12. "Agents can see you're here" is unexplained.** It has no hover text and is hidden at 1280. Add a line such as "Agents waiting on you keep waiting instead of timing out."

**13. Small items:**
- The hold-to-confirm fill is a low-contrast grey (/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-4/04e-hold-700.png).
- "Cancel" and its "Esc" key label sit on different baselines.
- The stepper's steps look like buttons but can't be clicked.
- In the calibration panel, "which can mean a rejection needed a reason" is opaque (/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-4/24d-calib-after-answers.png).
- A reopened card's rail still says "stopped until you answer" (/private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-4/19c-reopen-settled.png).
- Nothing says which key sends a written answer.
- A 3 s dwell on a card of about 250 words is a speed bump, not a guarantee that it was read.

## 4. What works and must be kept

- **Every element names itself in plain English.** That includes the rarity sentence with its "because", the stepper with its countdown, and the "you choose first" note.
- **"Better if / Then" option boxes.** They hold the contrast, the flip condition and the projection in one place.
- **Typed rails.** Dependencies sit on the left ("builds on", "may conflict", "your precedent"), and "What your answer changes" sits on the right. The slots disappear when empty.
- **The one-cue box with "Why this one".**
- **The lean preview.** The option highlights, the rail header changes to "If you choose …", and the other side's chips fade.
- **Undo and reopening.** The undo toast counts down ("It goes to … in 4 s", Z to undo). Answered cards get ✓ in the queue and can be reopened with "Change your answer".
- **The practice-card reveal** ("That was a practice card… You caught it").
- **Outcome-based calibration** that names both over-reliance and under-reliance.
- **The end summary.**
- **A clean card layout at both sizes.**

## 5. Structural?

No. The one structural shift from the plan is that the Atlas is now a modal (M, or hold Space), and the rails do the orientation work in the card view. That works. Keep the Atlas as a modal, but centre it on the current card (problem 2) so it adds what the rails can't: the endpoints of each relation, and neighbours across areas. None of my fixes removes an ingredient the owner chose.

All scripts and screenshots are in /private/tmp/claude-501/-Users-gusellerm-Projects-baesian/b76b3c24-f3ae-4e3e-9e52-3f7abe1c9031/scratchpad/harness/review-4/