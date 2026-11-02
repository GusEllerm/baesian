---
type: session
status: active
summary: "The overnight run of 2026-11-02 to 11-03: the plan, its progress, and the morning debrief."
created: 2026-11-02
tags: [baesian, session]
---

# Overnight, 2026-11-02 to 11-03

**Go-ahead: given** (2026-11-02, 4:00pm, "Ok begin").

The plan the user approved on 2026-11-02, refined with their answers: the hosted service is part of v1 (D132); Jev is TypeSafe AI's classification model; research may run four agents in parallel plus a synthesis agent, and start more where useful, because it should be high quality and complete; commits go on a branch, pushed so CI runs.

## Rules for the night

- **Work on the branch `overnight/2026-11-03`,** cut from `main` at `7231fba`. Commit after each step, citing cards as usual, and push the branch so CI runs. Never touch `main`, never merge.
- **Decisions are the user's.** File each as a card into the deck named in its step, for the morning. Carry on with my pick only on provisional cards and on what the user has already decided. Park anything hard: nothing published, nothing spent, no sign-ups (no Jev key, no hosting), no CI changes (a card instead).
- **No long-lived background processes** once a step is done. A running one keeps the session busy, and the heartbeat only fires when it's idle. Stop the server and any watchers before going idle.
- **Keep this note current:** tick each step when done, and add a line to the progress log. If the session is cut off, the heartbeat reads this note and carries on from the first unticked step.
- **The heartbeat:** a session cron job every two hours (`CronCreate`, session-only, expires after 7 days; delete it in the morning).

## The plan

### A. Start (about 30 minutes)

- [x] A1. Cut `overnight/2026-11-03` from `main`. Stop the server left running from the day (`baesian serve`).
- [x] A2. Launch the research agents in the background (B below), then work on C while they run.

### B. Research: preference sliders, the gate, and the hosted service (in the background, about 2–3 hours)

Five agents in parallel, each writing a report with its sources:

- [ ] B1. **How people state how much control they want:** levels of automation (Sheridan, Parasuraman, SAE), settings in products, coding agents' permission modes, code owners and branch protection, consent and preference elicitation.
- [ ] B2. **Which software decisions need sign-off:** change-approval practice (standard, normal and emergency changes), decision records, one-way and two-way doors, and studies of what engineers want to review and what they skim.
- [ ] B3. **Decisions in research work:** researcher degrees of freedom, the garden of forking paths, pre-registration, multiverse analysis, analysis decision logs, and what domain experts oversee.
- [ ] B4. **The classification gate:** models as classifiers and routers; Jev (what it does, benchmarks, pricing, caveats, and sending card text to a third party); the conflict of interest when an agent sorts its own cards; sampling audits; alert fatigue; measuring what a gate misses.
- [ ] B5. **The hosted service's prior art and security:** relays for local-first software, remote and local MCP servers with OAuth, scoped tokens, signed approvals and attestations, phone approval flows, and web push on phones.

Then:

- [ ] B6. A synthesis agent writes `Research/Preference Sliders and the Gate.md`: candidate axes for software and for research, ways the gate could work, how sliders, the gate, audit cards and convention cards fit together, and the evidence for each.
- [ ] B7. A fresh reviewer agent checks the synthesis against the reports; I fix what it finds. Start further research agents where the review finds gaps.

### C. Code, while the research runs (about 3 hours)

- [x] C1. **The sidebar's motion,** decided by the user: the connector follows the card (drag, lean, swipe, the shake, spring-back) and never points backwards; dragging lights the path as a held arrow does. A browser test that the connector meets the card at rest.
- [x] C2. **The sidebar, continued:** answering glides the path into place with the flight; it lines up with where the next card comes to rest; folding and new arrivals move instead of jumping. Reduced motion stays instant.
- [ ] C3. **Re-record the README's GIF** (`npm run readme-media -- gif`) once C1 and C2 land.
- [ ] C4. **Two sessions of one agent on one branch share one inbox.** A card (deck `stability`) on how to separate them, provisional; build my pick.
- [ ] C5. **Squash merges and rebases break commit links in the ledger.** A card (deck `stability`) with the options; design only.
- [ ] C6. **A scale test:** 2,000 and 10,000 cards, timing `list`, `inbox`, `wait`'s polling, the server's state endpoint and the client's first render. A report in `Reviews/`; fixes only if trivial.

### D. Designs, once the research is in (about 3 hours)

- [ ] D1. **Routing and preferences** (`Design/Routing and Preferences.md`, a proposal): sliders per repo (D131) and their axes; the classification gate, who runs it (the agent, rules, or a classifier such as Jev); audit cards and convention cards (D126); the config and card-format changes they need before v1. Cards for the cruxes (deck `routing`).
- [ ] D2. **The hosted service** (`Design/Hosted Service.md`, a proposal, v1 per D132): the relay (what goes up and down, and how write-once files sync); accounts and the one-time sign-in; the token's scope (file cards and hear answers, never answer); answers the website signs, which `baesian verify` checks; the local MCP server's security; what usage monitoring collects; the phone layout (D130); hosting options and their costs (no spending); the format changes before v1. Cards for the cruxes (deck `hosted`).
- [ ] D3. **v1's plan:** add the hosted service and the designs to [[Implementation Plan]] as milestones, in order.

### E. Reviews before release (about 1 hour)

- [ ] E1. **Privacy:** what the committed record exposes (reviewer and agent names, comments, branch names, anything about the machine). A report in `Reviews/`.
- [ ] E2. **Security:** the local server (token, Host check, CSP), the hooks (the fallback's `eval`), the `notify` command, and stdin handling. A report in `Reviews/`; fix clear bugs with tests, and file cards for the rest.

### F. The morning (about 30 minutes)

- [ ] F1. Run `npm test`, `npm run typecheck` and `npm run e2e`; push the branch; note CI's result.
- [ ] F2. Write the debrief below: what's done, what's provisional, which cards are waiting and in which decks, and what needs the user first.
- [ ] F3. Update "Current status" in [[Home]]. Delete the heartbeat job only once the user is back.

## Progress log

- 2026-11-02, evening: today's work committed and pushed to `main` as `7231fba`. Plan written; waiting for the go-ahead.
- 2026-11-02, 4:00pm: go-ahead given. Branch `overnight/2026-11-03` cut; the day's `baesian serve` stopped; the five research agents (B1–B5) launched in the background, writing to `Research/Preference Sliders - Strand B1…B4` and `Research/Hosted Service - Strand B5…`. Starting C1.
- 4:20pm: C1 done. The path measures the card where it rests, and the line into it follows the card's own motion frame by frame; a drag or swipe that leans the card more than 8 px lights the path. Two new browser tests, which fail on the old code; all 40 browser tests and 247 unit tests pass. Committed as `fa6c431`; branch pushed.
- 4:45pm: C2 done. Rows and headings glide from where they sat to where they now sit (380 ms), new rows fade in, the shift eases, the lines are redrawn every frame of a glide, and the flight aims at the settled row. Checked frame by frame on a live demo: the next card's node glides 202 → 133 px, with no jump. Reduced motion is read live in the path (Motion's hook reads it once, at mount, which also applies to the flight: noted, not changed). One new browser test; 41 pass.

## Debrief

(Written at the end of the night.)
