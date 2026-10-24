---
type: research
status: active
authority: reference
summary: "The four research lenses behind Contextualising Decisions (theory; analogous review tools; spatial and visual orientation; overseeing AI agents), with sources and read status. Gathered by four research agents on 2026-10-23."
created: 2026-10-23
updated: 2026-10-23
reviewed: 2026-10-23
tags: [baesian, research, client]
---

# Contextualising Decisions: sources

Provenance: four research agents each searched and read sources for one lens on 2026-10-23, and the main agent condensed their reports. Each claim keeps its agent's read-status tag:
- **[P]**, [full] or [read]: the primary text was read.
- **[P-abs]** or [abs]: the abstract only.
- **[V]**: vendor-reported telemetry.
- **[S]**: secondary.
- **[U]**: unverified.

Treat vendor figures and abstract-only claims with care. The synthesis is [[Contextualising Decisions]].

## Lens: theory —
Tags: [read] primary text read; [abstract] abstract only; [secondary] secondary.

- **Furnas 1986, fisheye degree of interest** [read] https://cspages.ucalgary.ca/~saul/581/exer.eps/4furnas86.pdf
  - DOI = a-priori importance minus distance from the focus. In a tree, the ancestral lineage is the zero-order view. Lowering the threshold adds siblings, then cousins.
  - Correct answers: 52% with two flat views, 75% with two fisheye views.
  - Views can have several foci and need task components. The model extends to DAGs and general graphs.
- **Cockburn et al. 2008** [read] https://faculty.cc.gatech.edu/~stasko/7450/Papers/cockburn-surveys08.pdf: overview and detail as separate views costs integration effort; zooming forces reorientation, which animation eases; distortion fisheyes show no reliable gains.
- **Shneiderman 1996** [read] https://www.cs.umd.edu/~ben/papers/Shneiderman1996eyes.pdf: his task list includes *relate* and *history*.
- **Pirolli 2007, information scent; Charnov's patch-leaving rule** [read] https://www.peterpirolli.com/ewExternalFiles/31354_C01_UNCORRECTED_PROOF.pdf. Pirolli & Card 1999 [abstract].
- **Russell et al. 1993** [read] https://www.markstefik.com/wp-content/uploads/2014/04/1993-Cost-Structure-of-Sensemaking1.pdf: sensemaking as a search for a representation. "Residue" (data that doesn't fit) drives merging, splitting and adding categories.
- **Pirolli & Card 2005** [read]: leverage points are directing attention to diagnostic evidence and to disconfirming relations.
- **Klein, Moon & Hoffman 2006, data–frame** [read]: a frame defines what counts as data; committing early sets expectations; "spoon-feeding interpretations… counterproductive"; feedback on reasoning beats feedback on outcomes.
- **Endsley 1995** [read, via OCR]
  - Perception, comprehension, projection.
  - Integrate raw data into levels 2 and 3; organise by goal; make typical-situation cues salient; keep a global overview, because filtering narrows attention; support projection.
- **Kahneman & Klein 2009** [read] https://www.hansfagt.dk/Kahneman_and_Klein(2009).pdf: intuition needs a high-validity environment and practice; confidence isn't accuracy; expertise is fractionated.
- **Vicente & Rasmussen 1992, abstraction hierarchy** [read]: levels linked by means and ends (up is why, down is how), as opposed to spatial or authority hierarchies. Ecological interface design externalises it.
- **Horvitz & Barry 1995, value of revealed and displayed information** [read] https://arxiv.org/abs/1302.4959: "EVRI is zero if the action does not change"; the net value subtracts reading cost; model the real operator, not an ideal one. Howard 1966 [abstract].
- **Itti & Baldi 2009, Bayesian surprise** [read]: KL divergence from the prior to the posterior; surprise isn't Shannon information (TV static); 72% of gaze shifts went to above-average surprise.
- **Cognitive load:**
  - Cowan 2001: about 3–5 chunks [abstract].
  - Chandler & Sweller 1991: non-essential material hurts [abstract].
  - Kalyuga 2003: expertise reversal [abstract].
- **Reyna 2012, fuzzy-trace / gist** [read]: experts use less information yet discriminate better; framing bias is larger in experts.
- **Animation:**
  - Robertson 2008: worst for trend analysis [read].
  - Heer & Robertson 2007: about 1 s, staged transitions help perceive change [read].
  - Archambault 2011: small multiples beat animation; mental-map preservation had little effect [abstract]. For orientation tasks, stable layout helped [secondary].
- **Over-reliance:**
  - Bansal 2021 [read].
  - Buçinca 2021, forcing functions [read].
  - Parasuraman & Manzey 2010 [abstract].
- **Woods 1984, visual momentum:** a long-shot overview and landmarks against keyhole and getting-lost problems [secondary, via Bennett & Flach 2012].

## Lens: analogous review and triage tools — analogous review and triage tools (key points kept for synthesis)
Tags: [P] primary; [S] secondary; [U] unverified.

Code review:
- Bacchelli & Bird ICSE'13 [P]: understanding is the main challenge; "the biggest information need: what instigated the change"; descriptions are distrusted; 91% say unfamiliar files are slower, 82% say file owners give deeper feedback; reviewers go to the author 20–40% of the time.
- Sadowski (Google) '18 [P]: median change of 24 lines, 1 reviewer, under 4 h latency. The "Context" breakdown is not knowing what gave rise to the change (urgent fix or nice to have). The reviewer guide asks "is now a good time?"
- Baum ICSME'17 [P]: "tours". Group related parts, provide information before it's needed, closest distance means "visible on the screen at the same time", keep the description on top.
- Barnett ICSE'15: over 40% of changes decomposable [P-abs/S].
- Gerrit [P]: typed relation tabs (relation chain, submitted together, same topic, merge conflicts), hidden when empty.
- Söderberg '22 [S]: the tool's "unit of analysis" (files) versus the reviewer's "unit of attention".

Wikipedia:
- Huggle (Geiger & Ribes CSCW'10) [P]: queue ranked by suspicion; the user's warning level as one number, "compressed into a single number".
- STiki [P, self-reported]: four buttons (Vandalism, Good-faith revert, Pass for lack of expertise, Innocent); ranked queues hit 25–30% against under 3% for random; "queue exhaustion".
- ORES [P]: separate damaging and good-faith models; calibrated phrases ("may have problems": recall about 82%, precision 15%; "very likely": precision over 90%, recall 10%).
- Halfaker '13 [P]: the tools cut newcomer retention. Snuggle CHI'14 [P]: criticises edits as the unit, sorting by undesirable only, and negative-only actions.

Content moderation:
- Caplan 2018 [P]: context needs (speaker, target, setting, culture); decisions in seconds; Discord takes 10–20 min per server; queue-order effects.
- Pavlopoulos ACL'20 [P]: without the parent post, about 5% of toxicity labels flip.
- Menini '21 [P]: abusive labels fall from 18% to 10%, or 6% with a long thread. Missing context inflates negative judgments.

Clinical decision support:
- The five rights (Osheroff; Campbell '13) [P].
- Overrides: 49–96% (van der Sijs '06) [P]; 73% overridden, 60% of those appropriate (Nanji '18) [P-abs].
- Paterno '09 [P]: tiered 29% against untiered 10%; most severe tier 100% against 34%.
- Ancker '17 [P]: acceptance down 30% per extra reminder; down 10% per 5-point rise in repeats; no workload effect.
- JMIR '19 [P]: interruptive alerts noticed but disruptive; sidebars less visible. Suggests a sidebar plus timed interrupts.
- Bates '03 [P-abs]: speed is valued most; overridden when no alternative is suggested; "changing direction is easier than stopping".
- Goddard '12 [P]: automation bias rises with workload; reduced by screen placement, updated confidence, information rather than recommendation, accountability.

Incidents:
- SRE book [P]: every page actionable; a robotic response shouldn't be a page; pages about novel problems.
- PagerDuty [P]: alerts state what, why it matters, and the runbook. Related Incidents shows up to 20 on dependent services, each with "why suggested"; Past Incidents shows who fixed it and how.

Prodigy [P]: a binary question, the model score and the highlighted pattern; prefer_uncertain; keys a/x/space/backspace; the last 10 decisions editable; "ignore" is ambiguous (corrupt or don't know).

Approvals and swipes:
- Entra [P]: recommendations from 30 days' inactivity or peer outliers; bulk-accept; unanswered items applied automatically; rubber-stamping [S/U].
- Uber '22 [P]: MFA fatigue ("eventually accepted one"); number matching plus app and location context.
- braindr '19 [P]: swiped brain-scan quality checks, 261 users, AUC 0.95–0.97; a bias toward passing; known-image checks planned.
- Kramer '21 [P-abs]: longer swipe duration on errors.
- Chen, Moskowitz & Shue QJE'16 [P]: negative autocorrelation (reversing the previous decision), stronger after streaks and in less experienced deciders.
- Wang '20 [P]: 10.8% single-reviewer error.

ADRs:
- Nygard '11 [P]: context, decision, status, consequences; superseded kept; without rationale, people blindly accept or blindly change.
- adr-tools [P]: supersede, link, generate graph. Structurizr [P]: force-directed graph. MADR [P]: links only in free text.
- Gap: none show the commits built on a decision.

Patterns:
1. Trigger first (what instigated it), and whether the agent is blocked or asking opportunistically.
2. History compressed into a number you can drill into.
3. Typed relationship slots, hidden when empty (depends on, built on, siblings, conflicts with).
4. Related items on one screen: the work's briefing pinned; siblings' titles and verdicts inline.
5. Calibrated phrases and "why you're seeing this".
6. Tier by reversibility; interrupt only for one-way doors.
7. Reject means "take the strongest alternative", so the alternative is an action.
8. "Pass" with a routed reason; the can't-judge rate measures whether the context works.

Extreme ideas: number matching (a 2-second comprehension check on high-tier cards) plus decoys; a hesitation-aware queue (slow swipes on expensive cards flagged, streaks broken up, areas interleaved).

Failure modes: repeat fatigue (deduplicate and cap per piece of work); the default direction wins (accept mustn't be the easiest gesture; check long accept runs); automation bias and auto-applied recommendations (equal visual weight, never auto-resolve); missing context flips verdicts; claims that can't be checked (link the commits); single item with negative-only actions (allow reviewing a whole piece of work, and "accept with note"); interruptive alerts slow work, passive ones go unseen (use both deliberately, by tier).

## Lens: spatial and visual orientation — spatial and visual orientation (key points kept for synthesis)
Tags: [full] full text read; [abs] abstract only; [sec] secondary.

Hierarchy:
- F1 Furnas '86 [full]: DOI(x|y) = API(x) − D(x,y). In a tree, the ancestral lineage is the zero-order view, which our spine already is; first-order adds the ancestors' siblings. Correct answers: 52% with two flat views, 64% with one fisheye, 75% with two.
- F2 Levine '82/'84 [abs]: you-are-here maps need structure matching and alignment; five recommendations; placement predicts use.
- F3 Lam & Munzner, 22 studies [abs]: as many display levels as data levels; higher levels show only task-relevant information; show levels together when the answer spans them.
- F4 Stasko [full]: sunburst beat treemap on first use, 51 of 60 preferred it. Woodburn '19 [abs]: treemap slowest and least preferred; icicle about equal to sundown, slightly preferred.
- F5 Cockburn, Karlson & Bederson [full]: overview+detail preferred; zoom easy to do badly, animation helps; distortion fisheyes hurt; integrating views costs time.
- F6: C4 is "Google Maps for your code"; titles, keys, labelled one-way lines, no vague "Uses". Pad++ semantic zoom.
- F7 Scented widgets [abs]: up to twice as many discoveries.
- F8 Mylyn DOI [abs]: significant productivity gain (16 programmers).
- F9 VS Code minimap: slider; marks for errors, diffs, search and AI edits.

Networks and provenance:
- F10: matrices beat node-link above about 20 vertices, except for path-finding [abs]. Crossings are the most important aesthetic (Purchase) [abs].
- F11: hierarchical edge bundling reduces clutter (informal evaluation), but bundling slowed path tracing (McGee '12).
- F12 Holten '11 [full]: arrowheads are poor; tapered edges are better.
- F13 PROV: arrows point from the future to the past.
- F14 InProv [abs]: radial view with time grouping more accurate on graphs over 1,000 nodes.
- F15: Blast Radius (dependencies, then dependents); van Ham & Perer DOI subgraph, "search, show context, expand on demand" [abs].

Animation:
- F16 Heer & Robertson '07 [full]: animated beats static; staged beats direct; don't reuse marks, minimise occlusion, slow-in/slow-out, translate rather than rotate, about 1 s.
- F17 Bederson & Boltman [full]: animated 1 s viewpoint changes improve reconstruction, with no time penalty.
- F18 Archambault & Purchase [abs]: stable layout helps finding nodes and long paths; no comprehension gain in other experiments.
- F19: trend animation least accurate for analysis, small multiples better [abs]; Tversky: animation's apparent advantage is usually a content difference [abs].
- F20 GraphDiaries [abs]: staged transitions plus difference highlighting.

Games and timelines:
- F21 fog of war [sec]: black for unexplored, grey for stale.
- F22 CK3 nested tooltips [sec]; designer suggests capping at 2–3 levels.
- F23 [full]: expert e-sports players watch the minimap more.
- F24 LifeLines [full]: parallel timelines per facet.
- Gaps: tech trees, git graph reading (Githru is the nearest), Into the Breach previews: unverified.

Patterns:
1. First-order spine (ancestors' siblings as dim stubs, the rest as "+12").
2. Spine with scented marks (dots, commit counts, a red notch for an unanswered dependency).
3. Icicle header strip, 40 px, the path filled, fixed coordinates.
4. Consequence fan: tapered lines right to commits, dependencies left, time left to right; Shift shows dependents.
5. Minimap rail: the work's decisions in time order (filled, hollow, grey stale, pulsing editing), commit ticks.
6. Staged hop between cards across areas (up to the lowest common ancestor, across, down; about 750 ms).
7. Fog states: absent, grey (changed since seen), bright (live).
8. Two-deep concept tooltips.

Extreme concepts:
- A "The Atlas": one semantic-zoom canvas (areas as columns, works as lanes, decisions in time order; the card is the deepest zoom; flights under 1 s; Space peeks one level out; consequences right, dependencies left, parent up, so the gesture aligns; answered cards become stamped dots, a map of what's been reviewed).
- B "Campaign map with outcome preview": a tech tree per area, territory hulls for commits, fog, about 20 lit nodes; drag distance scrubs a preview (reject hatches downstream commits for rework, accept unlocks dependents); release commits.

Don'ts: a hairball (more than 20 nodes); re-running force layouts (breaks spatial memory); distortion lenses on a swipe surface; animation as content; arrowheads and mixed directions, vague labels; bundling when tracing one path; treemaps for "where am I"; an overview that has to be explored (it must be readable at a glance in 10 s).

## Lens: overseeing AI agents — overseeing AI agents (key points kept for synthesis; full report in conversation)
Tags: [P] primary read; [P-abs] primary, abstract only; [V] vendor telemetry; [S] secondary; [U] unverified.

Reliance and explanations:
- Automation bias hits experts, isn't fixed by training, and grows with concurrent tasks (Parasuraman & Manzey 2010) [P-abs].
- Lee & See 2004: appropriate reliance means calibration, resolution and specificity [P-abs].
- Bansal CHI'21: explanations raise acceptance whether or not the advice is right; no gain for the team [P].
- Vasconcelos CSCW'23 and Fok & Weld 2024: explanations help only when verifying through them is cheaper than doing the task [P].
- Steyvers 2025: longer LLM explanations raise confidence, not accuracy. Kim FAccT'24: first-person hedges reduce over-reliance [P-abs].
- Buçinca CSCW'21: cognitive forcing functions cut over-reliance most, and are disliked [P]. Buçinca CHI'25: contrastive explanations against the reviewer's predicted choice improve independent skill (N=628) [P-abs].
- Rastogi CSCW'22: 10 s → 25 s raised disagreement with wrong AI from 48% to 67% [P].
- Fogliato FAccT'22: deciding before seeing the AI lowers agreement, at similar speed [P-abs].
- Lu & Yin CHI'21: without feedback, agreement is a misleading trust cue [P-abs]. He CHI'23: a calibration tutorial backfired for under-confident users [P-abs].
- Wolfe Nature 2005: miss rate 7% at 50% prevalence, 30% at 1% [P-abs]. Threat-image projection needs about 100 events for a reliable measure [P-abs].
- Coding: Perry CCS'23, less secure and more confident [P-abs]; He CHI'25, plausible plans misjudged [P-abs]; Duma EASE'26, most AI pull requests unreviewed [P-abs].

Tools:
- Claude Code plan mode and auto mode: falls back to prompting after 3 consecutive or 20 total blocks [P].
- Anthropic [V]: 93% → 97% of prompts accepted; humans blocked 13.6% of planted dangerous commands, the classifier 89%; the classifier misses 17%; sandboxing cut prompts by 84%; auto-approve rises from 20% to 40%+ of sessions with experience, interrupts from 5% to 9%; "oversight requires more than a human in the approval chain".
- Copilot: can't approve its own pull requests, and nor can the requester; the workflow gate became optional in Mar 2026 [P].
- Codex: auto_review reviewer agent, risk level, fails closed [P]. Cursor auto-review: "not a security boundary" [P].
- Devin 2.1: green/yellow/red confidence; green twice as likely to merge [V].
- Shavit (OpenAI) 2023: many quick approvals degrade; review after the fact suits reversible actions [P].

Habituation:
- Anderson CHI'15: attention drops after the 2nd exposure; polymorphic warnings resist [P-abs]. Vance MISQ'18: decline across a week, recovery between days [P-abs].
- Jenkins ISR'16: warnings mid-task disregarded (74–87%); after the task, processed [P-abs].
- Böhme & Köpsell CHI'10: licence-like dialogs accepted more [P-abs]. Ancker 2017: each 5% more repeats cut acceptance by 10% [P-abs].

Interruption:
- McFarlane 2002: negotiated interruption best but slow; immediate fastest but error-prone [P].
- Iqbal & Horvitz 2007: about 10 min plus 10–15 min to refocus; 27% resumed after more than 2 h; visible cues help [P].
- Iqbal & Bailey 2008: breakpoints help [P-abs]. Parnin & Rugaber 2011: 10% resume within a minute [P-abs].

Levels of automation: Parasuraman, Sheridan & Wickens 2000 (four stages) [P-abs]; Feng 2025 (L1–L5, L4 is "approver") [P-abs]; Endsley 1995 SA levels [P-abs]. Krosnick 2002: "no opinion" options attract satisficers [P-abs].

Principles:
- P1: verify, don't persuade. The claim that would sink the decision, plus where to check it; a rationale of 25 words or fewer.
- P2: contrastive alternative, with what would flip it.
- P3: tier friction by blast radius × reversibility × blocking; low tier reviewed after the fact or turned into rules.
- P4: variable dwell; human-first (unlabelled options) on high tier; hedged first-person voice; forcing functions on 10% or fewer of cards.
- P5: visual form by consequence type; no licence-like walls; cap sessions.
- P6: interrupt at breakpoints; show the cost of waiting for blocking cards; batch in dependency order on the phone.
- P7: SA on every card: breadcrumb (perception), depends/built-on (comprehension), "Accept → …; Reject → rework 4 files" (projection); "changed since you last looked".
- P8: "can't judge" with a reason routed back; track the rate.

Extreme ideas:
- A: canary cards (threat-image projection), opt-in, disclosed, non-blocking.
- B: a calibration mirror tied to outcomes (reverted, worked around, canaries caught), showing both over- and under-reliance.

Failure modes: approval theatre (more than 95% accepted with low dwell → make it a rule); persuasive rationales; plausible plans; uniform templates; mid-task interruptions; negotiated deferral starving agents; low-prevalence blindness; auto-approve drift; no independent reviewer (the requester is the reviewer); "pre-filtered means safe"; forcing functions so annoying they get disabled.
