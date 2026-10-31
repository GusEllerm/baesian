---
type: design
status: draft
authority: specifies
summary: "M4 step 5: building the client in React, Vite and Motion (D50) from the round 5 prototype (D91), on the local server's API (D96). Where it lives, what it depends on, how it's served and developed, how it's tested, and the order it's ported in. Its open points were decided as D98 (where it lives), D99 (bundled fonts) and D100 (Playwright, run locally)."
created: 2026-10-31
updated: 2026-10-31
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
- **What the client keeps itself,** in the browser's storage: time spent on each card, which cards you've already seen (for the "new" tag), and which reasoning you opened.
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
2. **5b, the model,** with its unit tests.
3. **5c, the card and answering,** against the live server.
4. **5d, the path, the pile, the breadcrumbs, and their motion.**
5. **5e, the rest:** presence, notifications, the calibration panel, keyboard help, and the empty state.
6. **5f, a quality pass:** the layout check, and a side-by-side with round 5's screenshots.

## Decided by the user (2026-10-31)

- **D98:** `client/` at the root, as above.
- **D99:** the fonts are bundled, through `@fontsource`.
- **D100:** browser tests use Playwright with its own Chromium, run locally only for now.
