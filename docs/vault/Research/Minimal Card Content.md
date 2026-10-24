---
type: research
status: draft
authority: reference
summary: "What is the least a card must show for an informed decision, in software and research work, and how does that fit what can be extracted robustly from agentic processes? Framed with facets, not decision types (D72). Five strands reported on 2026-10-24. The synthesis revises the core (trigger, discriminating \"if\"s, costs, the trace as fact), sets out kept and candidate facets, and defines a type-free test of \"enough\" and a measurement plan."
created: 2026-10-24
updated: 2026-10-24
reviewed: 2026-10-24
tags: [baesian, research, card-format]
---

# Minimal Card Content

Provenance: the user asked, on 2026-10-24, "How can we understand the minimal amount of information to make an informed decision within a project / research process context?" The agent proposed goals and a framing. The user rejected strongly defined decision types ("we end up in a definition game which is rigid and unobtainable") and approved the facet framing below and a research cycle (D72). Findings are added as each strand reports.

## The question

A card should hold the smallest set of information that is both **decision-relevant** (it could change the answer) and **obtainable honestly**: either extracted by Baesian, or declared by the agent and worded as the agent's claim ([[Client Data Contract]], D71). Research on relevance alone would produce a wish list agents can't fill.

## The framing: facets, not types

- **The core, required on every card:** the question, plus two options, each saying when it's better and what it would do.
- **Facets** are small, independent properties of a decision. Each is detected by Baesian or is a single yes-or-no declaration by the agent, and each adds one requirement to the card. A card with no facets is just the core. Facets combine without anyone classifying the decision, and adding one doesn't force anything to be reclassified.

| Facet | Where it comes from | What it adds to the card |
|---|---|---|
| touches security, money, data loss or publishing | gate facts | what would show the pick is wrong, with a check |
| hard to undo | declared, with detectors setting a floor | the same, plus hold to confirm |
| a rule may apply | topic match, or the agent cites it | whether the rule covers this case |
| other decisions depend on it | `depends_on` | what each option does to them |
| conflicts with a settled decision | the filing check, the merge gate | which option keeps which |
| adds a dependency | gate fact | what it costs to remove later |
| chosen after seeing results (research) | timestamps, data access | that ordering, stated |

The table is a starting set, not a list to defend.

**Guards against a new definition game:**
- every facet must be machine-detectable or a single declaration;
- each facet must earn its place through measurement, and is retired if it never changes an answer.

**Kinds of decision may emerge, but only as descriptions.** Decisions with similar facets, similar topics and similar reviewer behaviour ("the last six with these facets, you opened the reasoning five times") give precedent, not a taxonomy, and never a gate.

## The goals

1. **The core and the facets.** A minimal universal core, plus an open set of facet-triggered requirements, each with its evidence.
2. **How the minimum scales** with stakes, and with what the reviewer already knows: expertise and precedent substitute for content.
3. **A type-free test of "enough".** It has three parts:
   - **Coverage at filing,** checked mechanically:
     - the card addresses every fact Baesian detected;
     - each option states a condition under which it wins, not one condition and its negation;
     - every facet's requirement is met.

     A failure returns the card to the agent.
   - **Behaviour:** answered without "I need more context", without opening the reasoning, without writing a question back.
   - **Outcome:** the decision wasn't later reversed for a reason the card could have shown.
4. **Measurement by facet.** Record whether each requirement was shown, opened and decisive. Ablate one facet's addition at a time on low-stakes practice cards, where the right answer is known, and compare catch rates. Define how facets are added and retired.

**Not goals:** maximising explanation, or a universal template.

## What can be extracted robustly

From the discussion of 2026-10-24, to be tested by the research:

- **The elements that matter most are the least robust.** "When each option wins" and the alternative's consequences are always the agent's claims.
- **An agent's stated rationale is advocacy, not evidence:** its stated reasons may not be its actual ones.
- **The strongest move is turning "wrong if…" into a runnable check** (a test, a grep, a query). That makes a declared claim a verified fact.
- **What Baesian verifies only needs showing when it fails,** and showing exceptions only is a route to a smaller card.
- **If a decision needs information that can be neither extracted nor honestly declared,** the card goes back as "not ready" rather than being padded.
- **Software and research differ.** Software decisions sit on machine-checkable artefacts (git, tests, types, CI). Research decisions have delayed ground truth, and the most reliable fact is often the *process*: was this choice made before the results were seen?

## The research cycle

The strands run in parallel, one agent each:

1. **Decision relevance:** decision analysis and the decision basis, value of information, recognition-primed decisions, and what extra information does to accuracy and confidence.
2. **What reviewers actually use:** information needs in code review, architecture decision record templates, clinical decision support and alert design.
3. **What agents can report faithfully:** how faithful stated reasoning is, how calibrated stated confidence is, how well agents generate alternatives, and what agent traces make reliably available.
4. **Research-process integrity:** pre-registration, researcher degrees of freedom and forking paths, provenance standards, and what research agents' decisions need.
5. **The empirical pass:** this vault's own record of 71 decisions, read through the facet framing: where the user asked for more, pushed back, or reversed.

## Findings

The five strands reported on 2026-10-24. Sources, and whether each was opened, are in [[Minimal Card Content - Sources]], and the reports themselves in [[Minimal Card Content - Strand reports]]. What follows is the agent's synthesis.

Strength of the evidence:
- **Decision science, code review, clinical alerting and research integrity are established literatures.**
- **Most of the 2026 agent studies are single preprints,** not yet replicated.
- **The empirical pass covers one decider,** who is also the tool's author, in one session.

### What the evidence agrees on

1. **Information belongs on a card only if it could change the choice.** That is the value-of-information principle (Howard; Wilson). People seek out information that wouldn't change their choice, and then let it change their choice anyway (Bastardi & Shafir).
2. **More information raises confidence, not accuracy.**
   - In Oskamp's study, confidence rose from 33% to 53% while accuracy moved from 26% to 28%.
   - Irrelevant detail dilutes the relevant kind (dilution effect).
   - Alerts carrying "more than enough to act on" get ignored (the Five Rights).
   - Each extra alert cut acceptance by about 30% (Ancker).

   So supporting context is a risk, not a neutral extra.
3. **A sufficient explanation is contrastive.** It names the difference between the options; whatever holds for both explains nothing (Lipton's difference condition, via Miller).
4. **What reviewers most need is why the change exists, and whether an alternative would be better.** This held across five code-review studies (Bacchelli & Bird; Pascarella; Tao; Ebert; Ram). Missing rationale leads both to delay and to "blind approval".
5. **The agent's own account is not evidence.**
   - Stated reasons often aren't the actual ones (Turpin; Chen 2025), and unfaithful explanations are longer.
   - Stated confidence is barely better than chance at separating success from failure. Agents predicted 73–77% success against 22–35% actual (Kaddour 2026).
   - Agents claim success on about half their failures (Advani 2026).

   The trace (diffs, test runs, exit codes) is a record; the narrative is a claim.
6. **Explanations raise acceptance, not accuracy, unless they make checking cheap** (Bansal; Vasconcelos; Fok & Weld). Having people decide before seeing the AI's answer reduces over-reliance, although people like it least (Buçinca).
7. **Claims can become checks, but only after filtering.**
   - Generated tests tend to confirm what the code currently does (Konstantinou).
   - A check earns trust when it is shown to fail on a counter-case: the code before the change, the alternative, or a mutant (Foster; Mündler).
8. **In research, process facts carry the clearest evidence.** Whether a choice was made before results were seen is the main one:
   - among large heart and lung trials, 57% found a benefit before registration was required, and 8% after;
   - registered reports have 44% positive results against 96% for standard reports.

   For agents working inside an instrumented environment, that ordering can be computed. For people it can only be declared.
9. **The type of a decision doesn't predict how much it matters.**
   - Many-analysts studies found that coded decisions left more than 95% of the variance in results unexplained (Breznau; Silberzahn).
   - Coders agreed on how many hypotheses a pre-registration contained only 14% of the time.

   This is independent support for D72.

### This vault's own record

- **The owner took the recommendation 93% of the time.** In this corpus that can't be told apart from rubber-stamping.
- **All four times the owner went against a recommendation, the deciding condition was their own priority,** and the card never stated it.
- **Most signs that a card wasn't enough came from outside the cards:** framing challenges in chat, and corrections after seeing something built.
- **Scrutiny followed the owner's values and expertise, not reversibility.** The stack and the interface took longest; formats that were hard to undo took 5–20 s.
- **Of the 14 later revisions, 7 had a cause the card could have shown:**
  - an unchecked premise;
  - an interaction with another decision that went unflagged;
  - an assumption about workflow left unstated.

### The core, revised

| Element | Change | Evidence |
|---|---|---|
| **Trigger** (one line: what prompted this) | **back on the card.** Round 5 moved it behind the reasoning link. | the top need in code review |
| **The question** | unchanged: neutral wording, checked at filing | the risk that wording presupposes the answer |
| **Two real options** | enforced at filing. The alternative must be the reviewer's likely default, not a straw man. | the options field is the one decision records drop; Nutt: success rose from 56% to 70% with several options |
| **"If", the crux** | the two "if"s must hinge on the **same condition**, so that knowing it tells you which to pick. A sure-thing test at filing catches non-discriminating pairs. If the crux is a matter of preference, the card says so. | contrastive explanation; all four owner deviations |
| **"Then"** | includes its **cost**, as "accepting that…" | Nygard, MADR, Y-statements |
| **What the agent did** | **shown first, as fact,** from the trace: the diff, files touched, tests | the trace is a record, the narrative a claim |
| **Rationale** | stays collapsed, labelled as the agent's case | unfaithfulness; explanations raise acceptance |
| **The agent's pick** | shown only after you choose, on high-stakes cards | cognitive forcing helps. Open question: SBAR requires a recommendation, while the automation-bias literature finds recommendations drive over-reliance. |

### Facets, revised

**Kept, with sharper requirements:**
- **Touches security, money, data loss or publishing:** tiered handling. Deciding against the agent is easy; accepting takes more than one tap; a reason is required. Evidence: alert tiering raised compliance from 10% to 29%, and to 100% for the most severe tier.
- **Hard to undo:** option value, and the one-way/two-way door distinction.
- **Conflicts with a settled decision:** link it, and state the difference. The facet worked whenever it was noticed; the weak part was noticing.
- **A rule may apply:** cite the rule.
- **Others depend on it:** name them. Widened to each *response*, not only each option, and to earlier decisions this one relies on.
- **Adds a dependency:** what it brings in and what removing it would cost. Weak evidence; treated as a case of reversibility.
- **Chosen after seeing results:** research. The trace shows ordering; otherwise it's declared on the OSF's five-level scale.

**Candidates, each needing measurement before it ships:**
- **Rests on an unchecked premise** → mark it unverified and give the check. *Empirical: D25, D59, D15.*
- **Turns on your preferences** → state the criterion the recommendation serves. *Empirical: all four deviations.*
- **User-facing** → show it, don't describe it. *Empirical; already on the D11 checklist.*
- **Assumes an answer to an open decision** → name the assumption. *Empirical: D32, D17, D20, D23.*
- **The crux is measurable** → offer "measure first" rather than a verdict. *Value of information.*
- **Cost of delay** → what waiting costs, and what happens with no answer. *Value of information; Eisenhardt.*
- **The agent already acted** → check that its "then" matches what it did. *Mismatched pull requests were accepted 28% of the time, matched ones 80% (Gong).*
- **Research facets:**
  - changes what is tested or how it's judged;
  - departs from the plan;
  - sensitivity of the conclusion, computed by running both options;
  - removes or replaces data;
  - touches held-out data;
  - forks already tried.

  *Evidence: Simmons; Luo; Alizadeh and others.*

**Routing, not content:**
- needs a specialist;
- bundles several decisions (split it);
- options that combine rather than exclude (ask what taking several costs).

**The guard.** That is about fifteen candidates, which is the definition game D72 warns against. A facet ships only if it is detectable or a single declaration, carries a hypothesis about what it changes, and has a measurement attached. Start with the kept set and the two or three candidates with the strongest evidence. A rule for every facet: what it adds must discriminate between the options. Background never qualifies.

### How the minimum scales

- **Stakes change the handling, not the amount of text:**
  - friction (waiting, choosing first, holding);
  - who sees the card;
  - whether a reason is required.

  Where content does grow with stakes, it should be diagnostic only: evidence on the crux, the falsifier and its check. Context should not grow.
- **Experts need less, and scaffolding for novices can hurt them** (the expertise reversal effect). But expertise can be trusted only where feedback is fast and clear. Software design often isn't like that, so where the crux is a prediction with slow feedback, the card should show evidence, not ask for intuition.
- **Friction based on reversibility alone missed where the owner actually engaged.** Their values did better. "Turns on your preferences" is the candidate that would capture this.
- **The number of cards is a cost in itself.** Limit cards per session and remove duplicates.

### The test of "enough", revised

1. **At filing, checked mechanically:**
   - a trigger is present;
   - there are two real options;
   - the "if"s discriminate (the sure-thing test);
   - every detected fact appears in some "then";
   - every facet's requirement is met;
   - what the agent says it did matches what it did;
   - one decision per card;
   - every number is linked to the run that produced it (research).

   A failure returns the card to the agent.
2. **The verifiability criterion.** A card is enough when the deciding "if" can be verified at the cost of a swipe, because Baesian verified it or a check exists. Otherwise the card says it is unverifiable, or offers "measure first". It is never padded.
3. **Behaviour:**
   - "I need more context" is a real signal, and silence isn't proof of sufficiency, because confusion also produces blind approval;
   - confidence and satisfaction are never evidence;
   - a reason is required for every rejection or return.
4. **Outcomes:** audits ask whether the deciding information was correct and available at the time, rather than counting reversals, which mix bad cards with bad luck (outcome bias).
5. **Beyond the card:**
   - give a way to challenge the framing itself ("the question is wrong");
   - show user-facing decisions as something built.
6. **Research:** compare the card alone with the card plus the full trace, as Luo et al. did. A card is enough when planted pitfalls are caught equally well both ways. Their baseline gap was 55% versus 82%.

### What to measure

- **On practice cards with known answers, for each facet:**
  - accuracy;
  - calibration (confidence against accuracy);
  - **over-reliance:** how often reviewers agree with the agent when the agent is wrong.
- **Ablation:** withhold one facet's addition at a time, expecting an inverted U as facets are added.
- **A dilution probe:** add plausible but irrelevant content.
- **The agent's pick:** shown, hidden, or decided first.
- **Volume:** the dose-response of cards per session.
- **Interactions:** facet by reviewer expertise.
- **Mismatches** between declared facets and detected ones.
- **The strength of checks,** using mutants.
- **Each agent's track record by topic,** in place of its stated confidence.
- **"Need more context" and time to answer,** by facet.
- **The lifecycle of facets:** add one when it has a hypothesis and can be detected or declared; retire it if ablation shows it never changes an answer.

### Decided (2026-10-24)

- **D73:** the trigger comes back onto the card.
- **D74:** one shared crux, checked at filing.
- **D75:** trial "unchecked premise", "turns on your preferences" and "the agent already acted".
- **D76:** the agent's pick stays hidden until you choose on high-stakes cards, and is measured.

### Open questions

- Are two options right? Experts check one, fast teams compare several, and research forks may want a third answer: "keep both, and report it as a robustness check".
- Should the agent's pick be shown, and when?
- Is the if/then structure better than prose? There is no direct test.
- Do findings from code review carry over to cards, where there may be no diff?
- In research, what counts as "having seen the results"? Should reviewers see only whether the conclusion flips?
- How can it be measured whether a check is *relevant* to its claim, and not only able to fail?
- Will agents game declarations and checks under the gate's pressure?
- A second corpus exists: personal-website's decision cards, which include money and publishing decisions. Nobody has read it yet.
