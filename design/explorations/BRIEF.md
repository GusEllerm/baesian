# Client mockups: brief and plans (D64)

**Subject.** The Baesian desktop client: a local web app where a person answers the decision cards that coding agents file.

**Audience.** Gus, at his desk next to a terminal; later, domain experts.

**Primary job.** Judge one decision in about 10 seconds, and answer it with one key:
- → accept;
- ← reject;
- ↑ answer in writing;
- ↓ can't judge.

When the reviewer wants more, the card's provenance should be one glance away: the evidence, what it depends on, and the commits already built on it.

**What the user liked before** (personal-website style vote, 2026-10-23):
- "Provenance Trail": threads tying claims to manila source tags; Archivo and Alegreya.
- "Open Vault": an engineering-pad notebook, Alegreya, and an animated graph of the work.

Rejected as "too simple" or "abstract": the technical-report and control-loop directions.

**Shared content**, so the vote compares designs, not copy. It's the queue an agent would plausibly file while building M4:

| Card | Level | Topic | Notes |
|---|---|---|---|
| B-h2wq8: Keep the client's access token in the URL fragment? | hard | client/security | security, so hard by default |
| **B-k7m2p: Push live updates to the client with server-sent events?** | provisional | client/live-updates | 2 agents waiting; 2 commits built on it; depends on B-r4tz9 (resolved); deck `client-server` |
| B-v8nq3: Conflict on time/format: ISO 8601 strings or Unix epoch integers? | blocking | time/format | a conflict card, caught at merge |
| B-c5d1x: Ship the built client inside the npm package? | provisional | release/packaging | |
| B-9fz6m: Overturn? Cache rendered Markdown in memory | — | — | an audit card: an agent's two-way-door decision, sampled |

B-k7m2p is the focused card in every mockup.

---

## A. Provenance: the decision tag

The card is a manila tag hanging from a string, and threads tie its lines to the sources pinned beside it. Answering stamps the tag; then it swings away and the next tag drops in.

- **Colour:**
  - mauve desk `#D9D0DA`;
  - manila `#EBDBA9`;
  - aubergine ink `#2E2343`;
  - thread `#8E3A5F`;
  - stamp ultramarine `#2C3DA6`;
  - level marks: hard is the thread colour, filled; blocking is ochre `#9A7406`.
- **Type:** Alegreya for the card's prose (the decision reads like a written note); Archivo with its width axis for the interface (condensed for tags and keys, normal for controls).
- **Layout:**
  ```
  queue (tags on pegs) | the hanging tag              | pinned sources
                       |   ~~ threads ~~~~~~~~~~~~~~~>| briefing, depends on, ledger, evidence
                       | stamps: reject accept answer can't judge
  ```
  Left-aligned prose inside the tag; the tag itself is centred on its string.
- **The one bold thing:** the threads, drawn from specific lines of the card to the sources that back them.
- **Motion:** one moment per answer. The stamp lands, then the tag swings out.

## B. Notebook: the engineering pad

The decision is an entry on a graph-paper page. The left page is the contents, the queue in priority order, so numbering means something. The right page's margin holds the graph of the work: decisions as rings, commits as ticks, and the edges between them. The graph draws itself once when the page opens, and inks in a node when you answer.

- **Colour:**
  - paper `#FAFBFE`;
  - grid `#D3DCF3`;
  - ultramarine ink `#2337A8`;
  - graphite `#34363E`;
  - highlighter for "needs you" `#F1E66B`;
  - magenta pen for hard `#B8235A`.
- **Type:** Alegreya for entries; Alegreya Sans for the interface and margin notes.
- **Layout:**
  ```
  contents (1–5, priority) | margin graph | the entry: question, proposed, strongest alternative,
                           |  o--o--▫     | context, why now, cost to reverse; marginalia; keycaps
  ```
- **The one bold thing:** the margin graph. Everything else is quiet, like ruled paper.
- **Motion:** the graph's edges draw once on open; an answer inks its node.

## C. Signal: the answer frame

The screen's four edges are the four answers. You push the card into one: the card tilts toward an edge as you press its key, and the edge's colour deepens until the card goes. The question is set very large in a condensed grotesque, so it reads in one look. The provenance lives in a drawer (`i`).

- **Colour:**
  - white `#FFFFFF`;
  - ink `#16181D`;
  - accept, deep teal `#0B7A64`;
  - reject, deep red `#A8231C`;
  - answer, indigo `#3A49C2`;
  - can't judge, steel `#858B95`;
  - each band at 8% until pressed.
- **Type:** Instrument Sans only. The question is condensed and bold, at about 56 px; the body is at normal width. The type's width is what carries the hierarchy.
- **Layout:**
  ```
            ↑ answer in writing
  ← reject [   the card, centred   ] accept →
            ↓ can't judge
  queue rail on the far left; drawer on the right
  ```
- **The one bold thing:** the frame of answers. The card itself has no ornament.
- **Motion:** answering the action only. The card tilts toward the edge while the key is held, then commits.

## Review against the generic defaults

- **No default palettes:** no cream with terracotta, and no black with a single neon accent. A was the closest risk, because warm paper suggests cream; it uses manila on mauve with aubergine ink and an ultramarine stamp instead.
- **No broadsheet hairlines,** and no rounded-card kit. C's card is the only card on its screen.
- **Labels are sentence case,** and there are no tracked all-caps eyebrows. Card IDs are set in the interface face, not a monospace one.
- **No decorative arrows.** The arrow glyphs appear only where they're the actual keys.
- **Numbering only in B's contents,** where the order is the priority order.
- **One orchestrated motion per direction,** each one a response to an answer, except B's single draw-on.
- **Quality floor:** visible keyboard focus, `prefers-reduced-motion` honoured, and no breakage below 900 px. These are desktop mockups, so the phone layout comes in M4c.
