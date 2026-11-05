---
type: deck
format: 1
id: branches-view
title: The branches panel, redrawn
branch: v1/next
created: 2026-11-05T20:15:41.084Z
---

A design loop on the "Your decisions, by branch" panel (D181), asked for by the user after the panel drew fork and merge curves straight down across many lanes. Eight agents: one diagnosed today's panel with this repo's real data (22 defects, including correctness bugs: 97 of 275 commit marks on the wrong branch's lane, merged branches drawn as unmerged, one commit drawn once per card it cites); three built working mockups in different directions (layout, what to show when, phone first); a critic tried each; one combined them into a final design and a build spec.

The final design: on a computer, time still runs across, with main on top and each branch directly under the lane it came from, so every fork and merge crosses one row (3 rows instead of 9); merges solid with an arrowhead, branch starts dashed; picking a card lights its commits. On a phone, a newest-first list with the branch lines in a narrow gutter. These cards are the choices it left open; smaller defaults (a branch idle for 24 hours frees its row; touch screens get the list; filter chips) are the builder's, to revisit.
