---
type: design
status: draft
authority: specifies
summary: "M4 step 5: building the client in React, Vite and Motion (D50) from the round 5 prototype (D91), on the local server's API (D96). Where it lives, what it depends on, how it's served and developed, how it's tested, and the order it's ported in. Its open points were decided as D98 (where it lives), D99 (bundled fonts) and D100 (Playwright, run locally)."
created: 2026-10-31
updated: 2026-11-03
reviewed: 2026-10-31
tags: [baesian, design, client, m4]
---

# Client Build

Provenance: drafted by the agent on 2026-10-31 for M4 step 5. Everything not marked as an open point follows from an earlier decision.

## Already decided

- **React, Vite and Motion,** built at release and shipped as static files that the local server serves (D50).
- **Round 5 is the spec** (`design/explorations/round5/`, D91), with decide-first on every card (D86–D89).
- **The data is the server's snapshot and change events** (D96), described in [[Client Data Contract]], and sign-in is the server's (D62, D97).
- **Desktop first;** phone access comes in M4c (D63).

## Where it lives (D98)

`client/` at the repo root:
- **Its pieces:** `client/index.html`, `client/src/` (React and TypeScript), its own `client/tsconfig.json` (DOM types, JSX), and `client/vite.config.ts`.
- **Its build** goes to `dist/client/`, beside the CLI's build, so it ships in the npm package with no change to `files`.
- **Shared types:** the client imports the API's types from `src/api.ts`, which was written without Node imports for this.
- **The CLI's own build** (`tsc -p tsconfig.build.json`) leaves `client/` out, and `npm run build` builds both.

## Dependencies

`react`, `react-dom`, `motion`, `vite`, `@vitejs/plugin-react`, `@types/react` and `@types/react-dom`, at their current stable versions (React 19, Vite 8, Motion with its `motion/react` import).
- **All are devDependencies.** The client ships prebuilt, so installing `baesian` pulls in none of them, and no runtime dependency is added.
- **The commit gate will flag them,** and the commit will acknowledge D50.
- **Fonts** are bundled with `@fontsource` (D99), and browser tests use `@playwright/test` (D100). Both are devDependencies too.

## How it's served

`baesian serve` serves `dist/client/` at `/`:
- **`index.html` at `/`,** behind the same sign-in as the API.
- **Hashed assets** are cached for good.
- **Any other path that isn't under `/api/`** falls back to `index.html`.
- **A Content-Security-Policy** allows only the server's own origin.
- **If there's no build,** the server shows the step 4 placeholder, saying how to build the client.

## How it's developed

`npm run dev:client` runs Vite's dev server, with hot reload, and proxies `/api/` to the running `baesian serve`. The proxy adds the Bearer token from the server file and the server's Host header. It's for development only, and never ships.

## The client's own pieces

- **The data:** it reads `/api/state`, listens on `/api/events` and reads the snapshot again on each `changed`. From the snapshot it works out what the prototype hard-coded:
  - **areas,** from each card's canonical topic;
  - **works,** from decks;
  - **the queue's order:** by area, then cards with a stopped agent first, then by rarity;
  - **rarity and the stakes line;**
  - **each card's relations:** `depends_on`, `conflict_of`, dependents, cited `rules`, and each option's `_breaks`;
  - **the precedent:** the newest resolved card on the same canonical topic.

  These are pure functions in `client/src/model.ts`, ported from the prototype's `data.js` and `app.js`.
- **Answering:**
  - decide-first, with the reveal, the optional reason and the switch (D86–D88);
  - writing an answer, and "can't judge", including "I need to see it run" (D85);
  - the 5-second undo, held in the client and sent when it closes or the page goes (D82).
- **Presence:** a heartbeat (`POST /api/presence`) every 30 seconds while the tab is open (D41).
- **Notifications:** a browser notification when a blocking or hard card arrives (D40). Permission is asked on a click, never on load.
- **What the client keeps itself,** in the browser's storage: time spent on each card, which cards you've already seen (for the "new" tag), and whether to notify you. A browser keeps storage per address, and the address includes the port, so `serve` starts on the last server's port when it's free (D103): what the client keeps, and notification permission, survive a restart.
- **Not in step 5: practice cards (D83).** They're built from resolved cards, and there are none yet. They come after dogfooding has produced some, with a small design of their own.

## How it's tested

- **Unit tests** (Vitest, already a dependency) for `client/src/model.ts`: rarity, the queue's order, relations and precedent.
- **End-to-end tests in a real browser,** against a real server and a fixture repo: Playwright, run locally (D100). Round 5's self-test (`#selftest`) becomes this suite: answering, the reveal, the hold, undo, writing, "can't judge", the path, and live updates when an agent files a card.
- **A layout check:** the clipping detector from the round 5 quality pass, run at desktop and laptop sizes.

## The order

1. **5a, the scaffold (done, 2026-10-31):** dependencies, the build, serving, the dev server, and the first browser tests.
   - **The dependencies are pinned exactly.** Playwright's own Chromium is installed with `npx playwright install chromium`.
   - **`npm run build` builds the client too, so CI's build step now covers it.** `npm run typecheck` checks the client with its own config, and `npm run e2e` builds, then runs the browser tests.
   - **`npm run dev:client`** runs Vite on port 5317. It passes `/api/` to the running `baesian serve`, signed in with the server file's token, and was smoke-tested against this repo's own server.
   - **The client checks its types against `src/api.ts` without Node's types.** The API's types were made self-contained for this: `Status` and `Brief` moved into `src/api.ts`, and the ID patterns into `src/schema.ts`.
   - **Four browser tests:**
     - signing in through the address `serve` opens;
     - refusal without signing in;
     - a card an agent files appearing live;
     - no request to any other server, and no console errors under the security policy. The bundled fonts must actually be loaded, from the server itself.
2. **5b, the model (done, 2026-10-31):** `client/src/model.ts`, with 13 unit tests in `model.test.ts`.
   - **What it works out:**
     - rarity and the stakes line, counting only live dependents (`rarityOf`, `stakesLine`, `liveDependents`);
     - whether an agent is waiting, gone or carried on, by the server's clock (`waitState`, `serverNow`);
     - the queue and the parked cards (`queue`, `parked`);
     - each card's relations, with their effects (`relationsOf`);
     - each card's sides (`sidesFor`).
   - **The scaffold page now orders cards with it.** It shows the stakes line, and how many agents are waiting.
3. **5c, the card and answering (done, 2026-10-31),** against the live server.
   - **The card** (`client/src/Card.tsx`, with `Mark.tsx`) is drawn as round 5 draws it:
     - the stakes line and rarity mark, and the agent's state: stopped, stopped waiting, or carried on (D90);
     - the trigger, the question and the crux;
     - two options;
     - the facets, and the footer with its reading-time rule.
   - **Every card goes through the reveal** (D86). On a disagreement it offers an optional reason and the switch (D87, D88). A mythic card is held to confirm (D67).
   - **↑ writes:** a question, a correction or a rejection. **↓ can't judge:** more context, outside my expertise, or see it run (D85).
   - **Comments are public with the code (B-vqn69, 2026-11-03).** The reveal's reason line ends "It's committed with the code.", and under the written answer's box, "What you write is committed with the code." Browser tests check both.
   - **The desk** (`client/src/Desk.tsx`) holds:
     - the queue for this session;
     - the reading time (D91);
     - keys (arrows, held to lean; Esc; Z; j and k);
     - dragging, through Motion;
     - the 5-second undo, in `client/src/outbox.ts`: the next answer, or the page closing, sends the waiting one (D82);
     - the toast.
   - **The mapping** from an answer to the API's verdict is `client/src/answer.ts`.
   - **Tests:** 9 unit tests for the mapping and the outbox, and 12 browser tests ported from round 5's self-test. They cover the reveal, a disagreement and the switch, the reading time, undo, closing the page, the hold, writing, "see it run", a refused answer, the lean, the drag, and the layout as a card leaves. Playwright's clock skips the waits, with no test switch in the client.
   - **Bugs the tests found, all fixed:**
     - Motion's `popLayout` injects a `<style>` element, which the page's policy refuses, so a leaving card pushed the next one down. Leaving cards are now taken out of the flow by the stylesheet.
     - A leaving card kept its old props, and could have answered again: it's now inert.
     - Key listeners attached after the first paint, and the reset for a new card ran after it too. Both could miss or undo a key pressed at once.
     - Moving between cards with j and k used the answer's sideways exit: it now fades.
4. **5d, the path, the pile, the breadcrumbs, and their motion (done, 2026-10-31).**
   - **The path** (`client/src/Path.tsx`), as round 5 draws it:
     - your answers this session, as a spine;
     - the current card's node, joined to the card;
     - the card's relationships hanging off the node, worded from its side;
     - what's next, and how many more.
   - **Leaning toward an option, or hovering over it,** lights what it would do to each relationship (✓ kept or keeps to it, ✗ replaced or may break it), from the `_breaks` fields. Leaning counts however it's done: a held arrow, or a drag or swipe that moves the card more than 8 px (`LEAN_LIGHT`, past the 6 px shake), which `<LiveCard />` reports from its own motion. An earlier answer that's related is joined to the node by an arc.
   - **The lines are SVG elements,** measured from the layout, and drawn again on resize and when the fonts arrive. The path lines the node up with the card's question, and folds the oldest answers away when it would fall below the card.
   - **The card is measured where it rests** (`restRect`, `offsetIn`: layout offsets, which transforms don't move), never where a drag or its entrance has carried it. **The line into the card follows it** frame by frame: the card in play hands the path its motion (`CardMotion`: `x`, `y`, `rotate`), and `joinPath()` draws the line to the card's turned left edge at the node's height, outside React. It never runs backwards; with the card over the node, there's no line. Found by the user (2026-11-02): after a drag, the line stayed where the card had been mid-drag. Two browser tests.
   - **The path is a drum** (the user's design, D152, 2026-11-03): drawn as if wrapped round a cylinder turning on a horizontal axis, its front at the current card's row, like a picker wheel. Each top-level row and heading carries a `data-flip` key; its distance from the front along the path becomes an angle round a drum of `DRUM_R` (130 px), and `place()` draws it there with CSS custom properties: it moves along the curve, shrinks with depth about its node (so the spine stays straight), flattens a little as it turns, and fades slightly; past `DRUM_EDGE` (58°), or above the path's top, it's hidden, and a hidden answer folds into "N earlier answers". Drawn flat, not in 3D, so text never shears. "you chose …" fades out between 44° and 54°, and a row fades over the last 12° before the edge rather than popping. The labels at either end sit just past the outermost drawn row, and count every row the drum hides, above (folded into "N earlier answers") and below ("N more after these"). The front is a soft band, drawn in the lines' SVG under them, fixed while the drum turns through it, and running on to the card. The spine's pieces take their rows' flattening and strength. "Next" steps aside while the drum turns. Your choice's flight lands at 0.62 of its 700 ms, once the drum has settled. What the card relates to stays flat at the front, and the drum carries on curving below it. **Answering turns the drum:** each row turns from where it was to where it now sits, as a Motion spring (`TURN_SPRING`), and only when the card in play changes (`turnKey`); anything else, such as a card arriving, settles at once. The card coming to the front shows its name and fades it out; the card just answered fades its name back in. The turn's progress is set by Motion, never read from the clock during a render: renders within a frame must draw the same, or measuring the lines finds a change every time and renders again without end (found as a blank page, React error 185). Hover and focus lay a row flat at full strength, its faded text included; hover's easing comes on only after the first placement (`data-placed`), so the rows don't slide into the drum as the page loads. The path's rows have their focus ring back (their `all: unset` had removed it). Going to a card from the path, or from the answers panel, moves the focus to the card (the row you came from unmounts); the answers panel takes the focus to its first answer and gives it back to "N earlier answers" when it closes. On screens under 900 px wide or without hover, the path is a flat list. With reduced motion, read live, the drum is drawn but doesn't turn. Reviewed in two rounds by two critique agents, visual and usability. "N earlier answers" opens the "Your answers" panel (`AnswersPanel`), beside it in the path's column, oldest first as on the path. Not done yet, from the critiques: lists (`<ol>`) for the answers and Next in the markup, and visually hidden text for each node's stakes and "an agent has stopped for this". Rows are measured by layout (`offsetIn`), never where the drum draws them.
   - **Clicking an answered decision reopens it.** "Change your answer" sends a new verdict, which brings the agent a brief (D81), and the decision keeps its place on the path.
   - **Under the card,** the rest of its area lies in a slightly messy pile. **Above it,** the breadcrumbs name the area and the work.
   - **Your choice flies from the card into its row on the path,** and the next card arrives once it lands (round 5's one sequenced movement). It uses Web Animations, so it needs nothing the page's policy forbids.
   - **Tests:** 5 browser tests (`e2e/path.spec.ts`). 21 browser tests pass in all.
   - **Fixed along the way:**
     - the path's `.row` rules reached the card's own button rows, as they had in round 5; they're now scoped to the path;
     - a card that's both related and next was listed twice; it now shows once, in Next, with its relation.
5. **5e, the rest (done, 2026-10-31).**
   - **Presence** (`usePresence`): a beat when the page opens, every 30 seconds, and at once when you come back to the tab (D41).
   - **Notifications** (`useNotifications`, in `client/src/notify.ts`): off until you turn them on, from the menu or the empty desk. That click asks the browser's permission, never the page load (D40). A blocking or hard card that arrives while you're elsewhere (the tab hidden, or the window not focused) is notified: "claude-code is waiting for you", with the card's question. Clicking it opens the card. Cards already there when the page opens aren't news; a revised card is.
   - **The menu,** "More" in the header: your calibration, keyboard shortcuts, and notifications (on, off, or blocked by the browser). While it's open, the arrow keys move through it, not the card.
   - **The panels** (`client/src/Panels.tsx`), ported from round 5:
     - **keyboard shortcuts,** also opened with `?`;
     - **your calibration** (`client/src/calibration.ts`): the median time on a card by its stakes, from a log kept in this browser (`addSpent`), and the decisions you settled in the client that were later superseded, by name, worded as "superseded", never "wrong" (Client Data Contract). Practice cards join it with D83. Round 5's "both directions" line is dropped: its "overturned decisions that held up" has no count behind it yet.
   - **The empty desk:** "All caught up.", a one-sentence recap of the session (`recap`), the cards you put aside (passed on as outside your expertise, or deferred), which can be answered after all, and the offer of notifications.
   - **The "new" tag** on a card in Next until it's been on the desk (`useSeen`). The first time a browser opens a project, everything already there counts as seen.
   - **Tests:** 5 more unit tests, and 7 browser tests (`e2e/desk.spec.ts`, and one in `client.spec.ts`). Notifications are tested through a stand-in, since Playwright's Chromium can't show real ones. 193 unit tests and 28 browser tests pass.
   - **Found and fixed:** the sign-in cookie had one name for every server, and browsers don't keep cookies apart by port. Two projects served at once signed each other out, and each sent its token to the other. It's now named for the port ([[Local Server]]).
   - **Not ported in 5e:** round 5's two-finger swipe. 5f ported it.
6. **5f, a quality pass (done, 2026-10-31).**
   - **The layout check, rebuilt.** Round 5's script was lost with its scratchpad, so it was rebuilt from what [[2026-10-23 Client Mockups]] records, as a browser test that stays in the repo.
     - **How it runs:** `layoutProblems` (`e2e/layout.ts`) runs in the page. `e2e/layout.spec.ts` walks the desk through eighteen states at 1440×900 and 1280×800 on round 5's own cards, filed through the real store (`fileRound5`, `e2e/round5.ts`).
     - **What it looks for:**
       1. SVG shapes outside a clipping SVG's box;
       2. elements, shadows and outlines cut off by a clipping ancestor;
       3. text overlapping text;
       4. path lines crossing text;
       5. anything off the window;
       6. new: text hidden under something painted over it.
     - **The check was itself checked:** one defect of each kind was planted, and all were caught. That found a hole: straight lines have no height, so they were skipped. The browser runs it with reduced motion, since Motion's exits stall under Playwright's fake clock.
   - **A side-by-side with round 5,** in five states at both sizes. Round 5's screenshots weren't kept either, so the prototype was run again on the same content.
   - **Found and fixed:**
     - **Leaning slid the card 105 px over the path,** hiding the rows that light up to say what leaning does. Round 5 caps the lean at about 18 px and tilts the card, so this was a porting error. The card now leans 17 px (`LEAN_X`), tilts as it moves, and leans a third as far while the reading time runs. The option is picked out as strongly as before.
     - **The card in front of you could change by itself.** With no card picked, the desk showed the queue's first, so a re-sort (an answer reaching the server, an agent starting to wait) swapped the card mid-reveal. The card now stays until you answer it or move on. A test reproduced the bug first.
     - **The undo toast named your choice again;** round 5 had taken that out, since the path shows it. It also lacked round 5's line running down the undo window.
     - **The reveal kept each option's "then" line;** round 5 hides them to make room.
     - **Also restored from round 5:**
       - the summary's bold count and its "stopped" dot;
       - the tighter card on screens under 860 px tall;
       - the armed state: once a drag or swipe has gone far enough, the answer letting go would choose is filled in;
       - the two-finger swipe. A vertical swipe scrolls the desk instead, when the desk has somewhere to scroll.
     - **A one-line rule's full stop** is dropped from its name on the path.
   - **Left out at first:** the reason line in the reveal didn't promise that the agent may reply once (D89). Round 5's did, but nothing let an agent reply. The user then had the reply built (D104, below).
   - **Tests:** 196 unit tests and 32 browser tests pass, steady across three runs.
11. **Retiring a rule (D119, 2026-11-02).** When the option you choose breaks one of your rules (its `_breaks` lists the rule), the reveal offers "Retire this rule", under "Make this a rule", one box per rule (`retirable`). Ticking it puts `retire_rules` on the verdict. Switching to the agent's pick clears the boxes, since the other option breaks other rules. On the path, a retired rule shows as "retired rule", with nothing for either option to break, and no longer counts as a rule on the same topic (`relationsOf`). A browser test covers it.
10. **The card's body, at last (D92, 2026-11-01).** Found while dogfooding: the client showed a card's body nowhere, so context an agent wrote there never reached the reviewer. It now shows in the reveal, beside the agent's case, as "More from" the agent (`Prose`, a small renderer for paragraphs, lists, bold and code, with no dependency). It's open by itself when it's the only reasoning, and folded when the agent also gave its case. The layout check now ignores what a closed disclosure hides. The crux's fact and each option's "then" line render **bold** and `code` the same way (`inline`), since agents write commands in them.
9. **Merging topics on the card (D44, D111, 2026-11-01).** A live card whose topic is near another in use (by the rule `baesian file` warns with, `nearTopics`, shared with the client) says "Its topic, time/formats, looks like time/format (1 card). Same topic?" Choosing one asks once more, since an alias can't be undone, then posts it to `POST /api/aliases`. Once merged, decisions on both count as one topic: the line goes, and the precedent appears. A browser test covers it, with the layout check.
8. **Rules from answers (D16, D109, D110, 2026-11-01),** the first work decided through Baesian itself. The reveal, and a written correction or rejection, have a "Make this a rule" box, which puts `make_rule` on the verdict. The agent drafts the rule with `baesian rule`, and it arrives as a card that builds on the decision; accepting it saves the rule. A ticked box leaves the arrow keys to the card. A browser test covers the round trip.
7. **The agent's reply (D104, 2026-10-31).** A card answered against the agent's pick can come back once, with a fact or a check, filed by `baesian reply`. The client shows it under the crux (`replyOf`), with the answer it replied to. The reveal's reason line promises the reply again, round 5's wording, until the card has had it (`replied`). A browser test covers the round trip.

## Decided by the user (2026-10-31)

- **D98:** `client/` at the root, as above.
- **D99:** the fonts are bundled, through `@fontsource`.
- **D100:** browser tests use Playwright with its own Chromium, run locally only for now.
