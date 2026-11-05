---
type: research
status: active
authority: reference
summary: "Whether a maintained library could draw 'Your decisions, by branch' (D181) so Baesian needn't maintain it: none does. React Flow is the closest (MIT, maintained, CSP-clean) but would replace about 100 of the panel's 700 lines and fight its keyboard model; Observable Plot, Cytoscape, Mermaid, ECharts, G6 and Vega break the CSP or keyboard access; gitgraph.js is archived. Keep it in-house."
created: 2026-11-05
tags: [baesian, research]
---

# Graph libraries for the branches view

Provenance: a research agent's survey on 2026-11-05, at the user's request ("ideally we would not build this in-house"), read-only: npm registry and GitHub for maintenance, bundlephobia for sizes, each package's published bundle searched for what breaks the site's CSP (`script-src 'self'`, `style-src 'self'`, no `'unsafe-eval'`).

**The panel when this was written** (D181's first build): `client/src/lanes.ts` and `client/src/Branches.tsx`, about 700 lines with their CSS, plus `lanes.test.ts`. Most of it was Baesian's own logic (card states and words, merges, lane order, forks, how lanes end, the callout); about 100 lines were SVG drawing and placing marks. The x axis was ordinal (a slot per event, broken at days), not a time scale.

**Since 2026-11-05** (B-v8jzy, B-vfdhz, B-tgq5p) it's a list in a drawer, newest first: the model is still pure functions in `lanes.ts` (`branchModel()`, `columnsOf()`, `listRows()`), and each row draws its own short gutter of lines as plain React SVG ([[Client Build]] item 26). That's less drawing than the lanes were, so the recommendation below holds the more.

## The shortlist

| Option | Licence | Maintained | gz size | CSP | What we'd still write | Verdict |
|---|---|---|---|---|---|---|
| In-house, with d3-shape/d3-scale only if needed | ISC | d3 7.9.2, 2026-11-03 | 9–18 KB | clean (React renders the SVG) | everything, as now | **keep** |
| React Flow (`@xyflow/react`) | MIT | 12.12.1, 2026-11-02; 408 commits a year | 60 KB | clean | positions, days, lane names, callout, phone layout, a keyboard model against its own (every node a tab stop, arrows move nodes) | more code, not less |
| Observable Plot | ISC | 0.6.18 after 21 months; still 0.x | 127 KB | appends a `<style>` into the SVG | keyboard access (marks can't take focus), the HTML callout, a React wrapper | worse accessibility |
| Cytoscape.js | MIT | 3.34.4, 2026-10-15 | 137 KB | injects a `<style>` into `<head>` | axis, lane names, all accessibility (canvas) | worse accessibility |
| vis-timeline | Apache-2.0/MIT | 8.5.6, 2026-10-26 | 122 KB + peers | `innerHTML` templates | every connector (no edges), keyboard, an ordinal axis | poor fit |

**Ruled out:** Mermaid's `gitGraph` (injects styles; commit order only, no per-commit events); `@gitgraph/js` (archived 2024, last release 2021); `commit-graph` (vertical list, one maintainer); GitKraken's components and `vscode-git-graph` (not open source); VS Code's, Gitea's and GitLab's graphs (not packages); ECharts (368 KB, its HTML tooltip breaks `style-src`, canvas); AntV G6 (about 400 KB, injects styles, canvas); Vega and Vega-Lite (need `'unsafe-eval'` or the slower interpreter, about 270 KB, no keyboard access); nivo (no release since 2025-05, no arbitrary edges); GoJS and yFiles (commercial, about $4–7k and $11k a year; still the same layout work).

## Recommendation

Keep the panel in-house. The cost to hold down is the layout logic, which is pure functions in `lanes.ts` with unit tests; the drawing is plain React SVG and safe under the CSP. At many thousands of marks, draw only those in view before reaching for a library.
