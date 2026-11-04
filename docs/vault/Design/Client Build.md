---
type: design
status: draft
authority: specifies
summary: "M4 step 5: building the client in React, Vite and Motion (D50) from the round 5 prototype (D91), on the local server's API (D96). Where it lives, what it depends on, how it's served and developed, how it's tested, and the order it's ported in. Its open points were decided as D98 (where it lives), D99 (bundled fonts) and D100 (Playwright, run locally)."
created: 2026-10-31
updated: 2026-11-04
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
- **A phone layout** (D130), the same client: item 18.
- **The website** (M9e), the same client again, served by the hosted service: item 19; installing it as an app, its notifications and usage counts: item 20.

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
- **A layout check:** the clipping detector from the round 5 quality pass, run at desktop and laptop sizes, and at two phone sizes with a check of touch targets (item 18).

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
   - **The path glides into each new arrangement** (2026-11-02), instead of jumping. Each row and heading carries a `data-flip` key; once a change settles, a row that moved glides from where it sat (by layout) to where it now sits, over `GLIDE_MS` (380 ms, landing before your choice's flight does), and a new row fades in. The answered card's row glides from its node's old place (`data-from`), and the next card's node from its row in Next. The path's shift eases too, once the path has settled for the first time (`data-glide`). The lines are measured again on every frame of a glide, and your choice's flight aims at where its row settles. With reduced motion, read live, it all changes at once. Rows are measured by layout (`offsetIn`), so the shift no longer creeps in steps as the next card settles. One browser test.
   - **Focus on the path** (2026-11-03): its rows had lost the focus ring (their `all: unset` removed the global one), and going to a card from the path left the focus on the page, since the row you came from unmounts; both fixed, with a browser test. Found by a usability critique of the drum (D152), which was then removed (D155).
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
   - **The decks you've been briefed on** (`useBriefed`, B-j6b75), so each deck's briefing card comes once.
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
12. **The deck's briefing, with its context notes (M6, P17 §8, 2026-11-03).** Until now the client showed a deck only by name, in the breadcrumbs. When the deck has a briefing or context notes, its name there is a button that opens a panel (`DeckPanel`): the briefing (`Prose`), then each context note the server resolved in the vault (`ApiContextNote`), with its `summary:` line, or "Not in the vault." when no note matches. Without a vault, the links are plain text. A card ID in a summary that the client knows is a link to that card (`withCardLinks`), named by the card's title, with the ID only in its tooltip (D69); in a decision note's summary, which already starts with the title, the title is the link and the bracketed ID is dropped. An ID the client doesn't know stays as written. Esc closes the panel, as it does the others. Two browser tests (`e2e/vault.spec.ts`), with the layout check.
13. **A briefing card before a deck's first card (B-j6b75, 2026-11-03).** The first card you reach from a deck with a briefing or context notes comes after a briefing card (`BriefingCard`): how many of its cards wait, its title, then the same briefing and notes as its panel (`DeckBriefing`). Any arrow, Enter, Esc, a drag or a two-finger sideways swipe goes on to the card, and chooses nothing; the card's reading time (D91) starts then, and it counts as seen only then. It shows once per deck: the decks you've been briefed on are kept in this browser (`useBriefed`), and nothing counts as briefed the first time a browser opens a project. A card reopened from the path skips it, and a branch's own deck never has one (`hasBriefing`), since its briefing is one generated line. The deck's name in the breadcrumbs still opens the panel. The two browser tests cover it: once, not again after a reload, skipped for a branch deck, and earned by context notes alone.
14. **Held cards and audits (M8b, D150, D151, 2026-11-03).** The gate's held cards are out of the queue (`queue()` takes open cards and audits only) and in a list of their own (`heldBack()`, newest first): "Held back" in the menu, with its count, opens it (`<HeldPanel />`), and the empty desk lists the first four after "Put aside", with the rest a click away. Any of them opens on the desk and can be answered. Audits come through the queue, one after every two other cards (`spaceOut()`, `AUDIT_EVERY`), never ahead of an agent that has stopped.
    - **Blind first** (`isHeld()`): until you choose, a held card shows nothing that gives its agent's choice away. Its "Already built" facet, the agent's case and body, and whether its agent waited are hidden; the card reads like any other.
    - **Then what was done:** "You chose X. claude-code went ahead with Y.", why it was held back ("Your setting for runtime dependencies is “let the agent decide”…", and for an audit, that it came back as a sample), what's built, and the agent's case. You keep it ("Keep “Y”") or overturn it ("Overturn it: “X”", which sends the agent a brief of what to redo); a different blind choice can still end on "Keep claude-code's pick". Both answers are kept, as `first_choice` and the response.
    - **"You should have asked me"** (B-87tkc) is a box in the reveal of any card whose gate record says held; on a card shadow would have held, it reads "I'd have wanted to be asked", and says which setting would have held it. It puts `should_have_asked` on the verdict.
15. **Baesian's own cards (M8b, B-y6jn6, D161).** Slider proposals and convention cards are ordinary cards: what they propose is in their own words, and the client only makes them read as Baesian's. They're filed by "Baesian" (`agentOf()`); a slider proposal's stakes line adds "a change to your preferences"; their evidence names decisions by title, with no card IDs or bracketed references (`ownText()`, D69); quoted options aren't quoted twice (`quoted()`); and they offer no topic merge, no "Make this a rule", and no reply from an agent. Once recorded, the toast says what happened ("Saved: Runtime dependencies is at “stop and ask” now."), and an answer that made Baesian propose something says so (`Posted`, from the verdict's `filed`). The server's evidence for a slider proposal was reworded on the way: misses as "1 in 1 final answer", and what the move would have held only for a move to a stop that holds cards back.
16. **Your preferences, and the record by row (M8b, P14 sections 1 and 3, D146–D148).** "Your preferences" in the menu opens a wide panel (`<PreferencesPanel />`), which scrolls on a short window:
    - **Holding back:** "Shadow" or "On" (D148), with what each does.
    - **The presets** (B-wwxa3), each with what it would have held of your past cards, from `GET /api/presets` (`usePresets()`); picking one fills the rows.
    - **Every row** as five stops in words (P14), native radio buttons, the two lowest tinted and headed "Held back, your agents go ahead"; the fixed rows locked at "never without me", and security and privacy's two lowest stops disabled (D146). Each row says what its stop would have held of its past cards, replayed in the client (`pastCards()`, `replayDraft()`, over `replay()`), and the foot says it of all of them.
    - **Saving** sends every row and the mode over the file in force (`changeOf()`, `replacesOf()`, `postPreferences()`), with an optional reason. A draft you haven't touched follows a new file in force; one you have keeps its base, so a save after someone else's is refused (409), and the panel says so plainly: "Your preferences changed while this was open, so nothing was saved." Then it shows them as they are.
    - **The record by row** (`<RowRecord />`, `reportLines()`) sits beside your calibration, in the same panel: pooled first, then each row with its stop, what reached you and what was held back (or in shadow, would have been), the audits answered and waiting, and the misses, with the upper bound when there are none (`boundWords()`: "under about 1 in 9", and no bound under six answers); then how often your blind choice matched the agent's pick, and the switches.
17. **The setup survey (M8b, B-5na1k).** With no preference file, the client offers it once, before the cards, unless an agent has stopped for you (`useSetupOffered()`, kept in this browser): an offer card, then the survey's example decisions from `GET /api/presets` as cards, one per row the presets differ on, answered with the card's gestures (← "Show me ones like it", → "Fine not seeing it", ↓ not sure, by arrow, click, drag or two-finger swipe; Back, and Esc for "Not now"). Then the preset they suggest (`suggestPreset()`), what it would have held of your past cards, and "Use it", which sends the answers and the preset (`surveyChange()`), in shadow, or "Adjust it first", which opens your preferences with it. "Find a preset from example decisions", in your preferences, starts it again. `baesian init` points to it. Browser tests mark it offered (`skipSetup`, `e2e/setup.ts`) where it isn't what they test, and `npm run readme-media` puts it off.
    - **Tests (items 14 to 17):** 18 more unit tests (`prefs.test.ts`, and the model's and the answers'), and 10 browser tests (`e2e/routing.spec.ts`), with the layout check on every new screen at desktop size, and at laptop size for the survey, your preferences and the record. The layout check now knows a scrolling panel: what's scrolled out of a box that fits the window isn't off the window. 431 unit tests and 54 browser tests pass.
18. **The phone layout (M9, D130, [[Hosted Service]] section 7, 2026-11-03).** Below 760 px wide (`PHONE`, in `client/src/media.ts`), the client lays itself out for a phone held upright; above it, the desktop layout is unchanged. The words follow the input instead of the width: on a screen you only touch (`TOUCH`), the key hints go, except the arrows that also say which way to swipe, and "click" becomes "tap" or "press". `useMedia()` reads both.
    - **The card fills the width,** under a header whose summary wraps, and a breadcrumb line tall enough to tap. A card longer than the screen scrolls, so a vertical swipe on it scrolls rather than answers, as a two-finger swipe already does on a desktop (5f): the card is dragged only sideways then, and Other answer and Can't judge, at its foot, are full-size buttons. On a card that fits, all four swipes answer, by the gesture table. Each new card starts at its top.
    - **The path folds into a sheet you pull up** (`<PathSheet />`, `client/src/Sheet.tsx`). A bar at the foot of the screen says what's in it: "Your path", then how many you've answered, how many decisions the card is connected to (with the red dot when one is a conflict or a rule), and how many are next. Tap it or pull it up, and the path (`<Path />`, with `sheet`) opens over the desk, naming the card you're on, since the card isn't beside it; tap outside, pull its head down, or press Esc, and it closes. A row opens its card, as on a desktop. Leaning toward an option lights the path's rows on a desktop; on a phone the bar says it instead ("✗ May break it: Never put secrets in URLs"), tinted as those rows are. Your choice flies from the card into the bar (`flyToBar()`), and the next card waits for it, round 5's one sequenced movement.
    - **Answering by touch.** Everything you tap is at least 44 px each way. The reveal is brought into view under the options, with its confirm when it fits. A mythic card's hold reads "Press and hold to confirm", and a long press neither scrolls nor opens the page's menu. With no Esc key, the reveal has "Back to the choice". Undo is the toast's button, above the bar, or at the top of the screen while the sheet is open, so it never covers the sheet's rows.
    - **Writing with the keyboard open.** The keyboard comes up once you've chosen a reason that needs words (a question, a correction or a rejection), from that tap, since a phone opens it only from one; not at once, where it would cover the reasons. The page shrinks to what the keyboard leaves (`interactive-widget=resizes-content` in `client/index.html`), the field you're writing in stays in view, and the path's bar steps aside while you type.
    - **The panels fill the screen,** and scroll: your preferences, with each row's five stops under its name and the presets one above another; your calibration above the record by row; held back; the deck's briefing. On a touch screen the menu's "Keyboard shortcuts" is "Gestures" (`KeysPanel`).
    - **Nothing scrolls sideways;** a card leaving toward your answer goes off the screen's edge. **A notch and the home indicator** are kept clear (`viewport-fit=cover`, and the safe areas on the header, the bar, the sheet, the toast and the panels). **Reduced motion** is respected: no flight and no slide, and the empty desk no longer fades in.
    - **Not here:** web push and installing the client as an app, which came in M9e step 2 (item 20).
    - **Tests:** 15 browser tests (`e2e/phone.spec.ts`) at 390×844 and 360×740 with touch, through a finger made of Chromium's own touch events (`Finger`, `e2e/touch.ts`), so the page's `touch-action` decides what scrolls, as on a phone: every screen above through the layout check and a check that everything you tap is 44 px (`smallTargets()`); swipes, the scroll, the hold and undo by touch; the sheet's gestures; the keyboard; a notch, through Chromium's safe-area override; reduced motion; and the width where the layout changes. The layout check also finds anything that scrolls sideways now, checks only what's in a modal while one is open, skips text scrolled out of view, and lets the toast lie over a panel. With `BAESIAN_SHOTS` set, each screen at 390×844 is saved as a screenshot. 431 unit tests and 69 browser tests pass.
    - **Found along the way:** under Playwright's clock, the empty desk was still fading in when the layout check ran, so the desktop check of it had been checking nothing; the tests now wait for it. And a pull on the sheet's bar lost its start whenever the desk rendered again mid-pull, as it does when a card settles; it's kept across renders now.
19. **The website (M9e step 1, D130, B-17wn9, B-bv49e, D143, 2026-11-04).** The same client, built a second time for the hosted service, which serves it ([[service#The website (M9e)]]).
    - **Two builds of one app.** `npm run build` builds the local client into `dist/client/` and the website into `dist/site/` (`vite build --mode site`, with `client/site-public/_headers` copied in); `client/src/main.tsx` renders `<Site />` or `<App />` by the build's mode, fixed at build time, so each carries only its own pages. `dist/site/` isn't in the npm package (`!dist/site` in `files`).
    - **The desk, on the relay.** Where the desk reads and answers comes from `EndpointsContext` (`client/src/endpoints.ts`): `LOCAL`, the local server's `/api/`, or `hostedEndpoints()`, one project's `/v1/projects/{project}/…` (B-7z97x). `useHostedState()` (`client/src/live.ts`) reads the relay's state as `useLiveState()` reads the local server's (B-17wn9), and reads it again whenever the relay's live socket says `changed` with a newer version (B-bv49e); a socket that closes is opened again after 1, 2, 5, then 10 seconds, with the state read again, and a `ping` every 30 seconds keeps it from looking idle. The local client keeps its server's events. Answers (`postVerdictTo()`), topic merges, preference changes and the setup survey go through `postAnswer()`; on the website, answers, preference changes and presence name the client, `hosted-desktop` or, in the phone layout, `hosted-phone` (`hostedClient()`, D130).
    - **The passkey on an answer (D139, D163).** When the relay replies 202, `postAnswer()` asks for the passkey (`confirmWithPasskey()`): `<ProofPrompt />` (`client/src/proof.tsx`) says why ("This card is hard, so your answer counts only once your passkey confirms it's yours, not an agent's at your keyboard", or that the change lets more cards past you), and only its button starts the passkey, as Safari requires a tap. The assertion goes to `…/proofs`, and while the reply is 202 (a loosening slider proposal takes two) it asks again, with "Step 2 of 2". "Don't send it", or Esc, sends nothing: the toast says the answer wasn't recorded and why, and the card is back. On a phone the prompt fills the screen, as the panels do.
    - **Passkeys in the browser** (`client/src/webauthn.ts`): `makePasskey()` and `signWithPasskey()` turn SimpleWebAuthn's JSON options into `navigator.credentials`' and the answer back, with no dependency; `PasskeyFailed` says in words what went wrong and what to do (cancelled or too slow, a device that already holds one, a page at the wrong address, a browser that can't).
    - **The pages** (`client/src/site/`), routed in the browser (`useWhere()`, `go()`), at the addresses M9c's redirects use: `/` your projects, or signed out a short welcome; `/sign-up` (`<SignUp />`: an email address behind Turnstile, the emailed code and a handle, then a passkey; from Globus, `#flow=…&via=globus`, only the handle and the passkey); `/sign-in` (`<SignIn />`: a passkey, any of the site's, or Globus; a round trip's `#error`/`message` shown); `/recover` (`<Recover />`: email behind Turnstile, the emailed code and the recovery code together, a new passkey); `/account` (`<Account />`); `/device?code=` (`<Device />`); `/projects/{project}` (`<Project />`, the desk). A page that needs you signed in sends you to `/sign-in?next=…` and back (`signInHere()`, `nextPage()`), and each page reads the account afresh.
    - **Shown exactly once** (`<ShownOnce />`): the recovery code, after signing up or getting back in, with "I've saved my recovery code" before you go on; and each passkey's line for CI's `BAESIAN_TRUST` (D159), when it's enrolled. The account lists passkeys without their lines.
    - **The account:** passkeys, with "Add a passkey", which asks for one you have first when the last check is old (`reauthWith()`, from options prepared before the tap since step 2, item 20); where you're signed in, each with "Sign out", yours marked "this browser"; machines, each with its project's name and "Sign out"; Globus, linked or not, when the service has it; and signing out of this browser or everywhere.
    - **Approving a machine** (`<Device />`): which machine asks for which project, the code to check against the terminal, and that it "can file cards and hear your answers in this project. It can never answer them". A project the service hasn't seen gets a callout, "Approving makes a new project, owned by you", and asks its name (B-zqkwk), saying the repo's own name is never sent; one of another account's says how to link the repo as a project of your own. "Approve with your passkey" checks it afresh when needed.
    - **Your projects** (`<Projects />`): by name (B-zqkwk), "Unnamed project" for one without, the ID only in a tooltip (D69's spirit); each opens its desk, and "Rename" names it again.
    - **Turnstile** (`<Turnstile />`, B-1a03b): Cloudflare's script, loaded only on sign-up and getting back in, rendered in managed mode; a token is used once, so the widget is reset after each try.
    - **On the website, the desk's header** has the wordmark as a link to your projects and the project's name beside it (`.place`); the menu adds "Your projects" and "Your account".
    - **Decided before linking (B-3zjjx):** a card the relay counts from before linking (`ApiCard.before_linking`) is "settled before linking" on the path, where it's a precedent or a card this one builds on (`relationsOf`).
    - **The look:** each page is a sheet the colour of a card's face in its frame, on the desk, with round 5's type: the question's size for a page's heading, the meta face for labels, the card's buttons. Nothing new. Below 760 px the sheets fill the width and every button and link is at least 44 px.
    - **Tests:** a unit test for the label, and 15 browser tests against the service's Worker run locally (`e2e/site.ts`, `startSite()`): `unstable_startWorker` serving `dist/site/` and the service at `http://localhost:<port>`, which Chromium treats as secure; a virtual passkey authenticator through Chromium's DevTools protocol (`virtualAuthenticator()`, `handOver()` for one passkey on two devices); Turnstile's script stood in for in the page (`standInTurnstile()`), its test secret answered by the Worker; Globus stood in for by the service's tests' issuer, reached by the Worker through Wrangler's outbound service and by the browser through a route (`standInGlobus()`); the emails read where the local runtime saves them; and the real CLI signing in and syncing (`startLogin()`, `cli()`). `e2e/site.spec.ts` covers signing up, a wrong code, the recovery code and CI's line shown once, signing in, sign-ins ended one at a time and everywhere, getting back in, another passkey, Globus linked and unlinked, signing up and in through Globus, a Globus error, and every page through the layout check at 1440×900 and with the touch targets at 390×844 and 360×740. `e2e/site-desk.spec.ts` covers approving a machine with a new project named and the passkey checked afresh, renaming it, signing the machine out, refusing one and a wrong code, the desk on the relay (a card answered there and heard by the CLI, a card filed by the CLI arriving over the live socket, a hard card's passkey refused and then given, a card decided before linking), a project that isn't yours, and the approval page, the projects and the desk with the prompt laid out at the three sizes. With `BAESIAN_SHOTS` set, each page is saved at each size.
    - **Found and fixed:** the card's button colour comes from `--c`, which the site's sheets now set; the menu's items can be links; sign-up and getting back in read the account again, so the next page knows you're in.
20. **The website as an app, its notifications and usage counts (M9e step 2, D130, B-mjf3g, B-nk97q, B-advkh, D141, B-7nq85, 2026-11-04).** On the site's build only ([[service#Web push (service/src/push.ts)]], [[Hosted Service]] sections 6 and 7).
    - **Installing it.** `client/site-public/manifest.webmanifest`: "Baesian", standalone, at `/`, the desk's colour as its theme, and three icons, one maskable; an `apple-touch-icon` and `favicon.ico` beside them. The page names them only in the site's build (`installable()` in `client/vite.config.ts`). The icons are drawn in the client's look, a card the colour of a card's face in its frame, on the desk, with the wordmark's B, over a second card of the pile, and rendered by Playwright's Chromium (`scripts/site-icons.ts`), so no image tool is needed. Where the browser offers its install prompt, the account's notifications have "Install Baesian as an app", which uses it (`listenForInstall()`, `useInstall()`); on an iPhone in Safari, the page says how to add it to the Home Screen instead.
    - **The service worker** (`client/site-public/sw.js`), registered at scope `/` as the site starts (`registerServiceWorker()`): it shows a notification for every push, the service's words or, for one it can't read, "Cards are waiting in Baesian" (Safari takes back the permission from a site whose push shows nothing), with a tag per project so a newer one replaces the older, and no actions, so no answer buttons; tapped, it opens or focuses the project's page, and tells the service it was opened (`push_opened`). **It caches nothing and handles no fetch:** every request, `/v1/` and a project's state included, goes to the network as without it. A browser that renews its subscription by itself tells the service the new one. The site's policy needed no change (`client/site-public/_headers`), and `/sw.js` is never kept stale.
    - **Turning notifications on** (`<Notifications />`, `usePush()`, on the account page): the service worker's registration and the service's key are read when the page opens, so "Turn on notifications" calls `pushManager.subscribe()` first thing in the tap's handler; the browser asks then, never on load, and the service is told where to send (`POST /v1/account/push`). On an iPhone or iPad not running it from the Home Screen there's no button: the page says only the app there can get them, and how to add it (`isIos()`, `isInstalled()`). Blocked, it says to allow them in the browser's settings. Every browser that gets them is listed, this one marked, each with "Remove"; removing this one ends its subscription too.
    - **A machine's burst on the desk** (`<Project />`): when the relay has paused a machine's notifications, the desk's stage says so above the card (`pausedLine()`): "laptop filed 21 cards in 10 minutes, so its cards won't notify you until 1:52 PM. They're all here." (`Desk`'s `notice`).
    - **Usage counts:** "Count my use of the service" on the account page, ticked unless the account opted out; unticking it deletes what was kept for it (`UsageCounts`). **`/counts`** (`<Counts />`), open to anyone, lists every kind and field from `USAGE_KINDS`, the list the service checks each event against, with what's never counted, how long it's kept and how to stop it.
    - **Two fixes to step 1.** *Passkeys from a tap:* Safari starts a passkey only from a tap, so a page now fetches a ceremony's options when it opens and keeps them fresh (`usePrepared()`, `PREPARED_MS`, under the service's 5 minutes), and the tap calls `navigator.credentials` first thing: signing in, adding a passkey (with the last check old, two taps: the check, then "Make the new passkey"), approving a machine and linking Globus (`reauthWith()`, `useFresh()`). The button waits for its options; if they've lapsed (a device that slept), the tap fetches new ones and says "Your passkey wasn't ready yet. Tap again to use it." (`TapAgain`). *The prompt on a desktop:* "Confirm with your passkey" is a dialog in the middle of the window over a darker backdrop, rather than a panel at its edge over the end of a line.
    - **Tests:** a unit test of the usage list against the store's own values; 12 browser tests (`e2e/site-app.spec.ts`), in Chromium itself rather than its headless shell, which refuses every notification: the manifest, icons and policy; the service worker at `/`, keeping nothing; notifications turned on only from a tap, the relay's push decrypted with the page's key and shown by the service worker, opening the project, removed again; two browsers listed; an iPhone in Safari and from the Home Screen; the install prompt; each passkey started by its tap, and lapsed options; the prompt centred; a burst on the desk; usage counts and `/counts`; and the layout check with touch targets at 390×844 and 360×740. The browser's push service is stood in for (`standInPushService()`): Chromium under test can't reach Google's, so the page's subscription has a key pair of its own, at an endpoint on the Worker's stand-in push service; the service worker's push is delivered through Chromium's DevTools protocol.
21. **Retention and the privacy policy on the website (M9f, B-9jqt4, B-ec3kj, B-dsqyd, B-mkryw, B-8xxrc, 2026-11-04).** On the website only.
    - **The privacy policy** (`<Privacy />`, `client/src/site/Privacy.tsx`) at `/privacy`, open to anyone, signed in or not ([[Privacy Policy]]): a sheet per section, as `/counts` has them, in round 5's type; lists in the body's face (`.site-list`), and how long each thing is kept as rows (`.site-rows`), what in the option's face and how long in the small one. Who runs it (`OPERATOR`) and where to write (`PRIVACY_CONTACT`, a `mailto:` link) are constants, and so is when it last changed (`POLICY_CHANGED`).
    - **Linked from** every page of the site, in a footer under the page (`<Shell />`'s `nav` "About the service": "Privacy" and "What the service counts"), the first step of signing up, `/counts`, and the account's usage counts. The desk has no footer: its menu is enough.
    - **Cards whose text the relay removed:** the relay's state lists them as `removed` (`ApiRemovedCard`, [[service#Retention (service/src/retention.ts)]]), never among the cards, so none can be opened or answered.
      - *Held back and past 90 days:* "Held back" (`<HeldPanel />`) lists them after the cards that can still be answered, as plain rows, not buttons: "Held back 3 Aug 2026", its level, and when its text was removed, under a line saying they were held back over 90 days ago and never answered, so the service removed their text, and the repo's record keeps them (`heldRemoved()`). The menu's count includes them.
      - *On the path:* a card that builds on one, or would replace or break one, still shows it, named by how it ended, never by its ID (D69): "An earlier decision", "A withdrawn card" or "A card held back", with "settled 3 Aug 2026; its text is no longer on the service" (`removedWords()`, in `relationsOf`). A precedent needs a topic, which is gone, so a removed card is never one.
    - **Tests:** a unit test of the path's words and the held list (`client/src/model.test.ts`), the state itself being the relay's tests' (`service/test/retention.test.ts`); and 5 browser tests (`e2e/site-privacy.spec.ts`): the policy open signed out, reached from the footer, signing up and `/counts`, naming who runs it and where to write; reached from the account page signed in; and the policy, the front door and `/counts` through the layout check at 1440×900, and with the touch targets at 390×844 and 360×740. With `BAESIAN_SHOTS` set, the policy is saved at each size, scrolled to five places.

11. **Retiring a rule (D119, 2026-11-02).** When the option you choose breaks one of your rules (its `_breaks` lists the rule), the reveal offers "Retire this rule", under "Make this a rule", one box per rule (`retirable`). Ticking it puts `retire_rules` on the verdict. Switching to the agent's pick clears the boxes, since the other option breaks other rules. On the path, a retired rule shows as "retired rule", with nothing for either option to break, and no longer counts as a rule on the same topic (`relationsOf`). A browser test covers it.
10. **The card's body, at last (D92, 2026-11-01).** Found while dogfooding: the client showed a card's body nowhere, so context an agent wrote there never reached the reviewer. It now shows in the reveal, beside the agent's case, as "More from" the agent (`Prose`, a small renderer for paragraphs, lists, bold and code, with no dependency). It's open by itself when it's the only reasoning, and folded when the agent also gave its case. The layout check now ignores what a closed disclosure hides. The crux's fact and each option's "then" line render **bold** and `code` the same way (`inline`), since agents write commands in them.
9. **Merging topics on the card (D44, D111, 2026-11-01).** A live card whose topic is near another in use (by the rule `baesian file` warns with, `nearTopics`, shared with the client) says "Its topic, time/formats, looks like time/format (1 card). Same topic?" Choosing one asks once more, since an alias can't be undone, then posts it to `POST /api/aliases`. Once merged, decisions on both count as one topic: the line goes, and the precedent appears. A browser test covers it, with the layout check.
8. **Rules from answers (D16, D109, D110, 2026-11-01),** the first work decided through Baesian itself. The reveal, and a written correction or rejection, have a "Make this a rule" box, which puts `make_rule` on the verdict. The agent drafts the rule with `baesian rule`, and it arrives as a card that builds on the decision; accepting it saves the rule. A ticked box leaves the arrow keys to the card. A browser test covers the round trip.
7. **The agent's reply (D104, 2026-10-31).** A card answered against the agent's pick can come back once, with a fact or a check, filed by `baesian reply`. The client shows it under the crux (`replyOf`), with the answer it replied to. The reveal's reason line promises the reply again, round 5's wording, until the card has had it (`replied`). A browser test covers the round trip.

## Decided by the user (2026-10-31)

- **D98:** `client/` at the root, as above.
- **D99:** the fonts are bundled, through `@fontsource`.
- **D100:** browser tests use Playwright with its own Chromium, run locally only for now.
