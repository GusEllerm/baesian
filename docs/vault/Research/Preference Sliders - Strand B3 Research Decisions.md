---
type: research
status: active
authority: reference
livedocs: snapshot
summary: "The decisions in research work, for preference sliders: which analysis decisions move results most (operationalising variables and choosing the data, more than model details, though a decision's type doesn't predict its impact in a given study), how pre-registration, blind review and deviation reporting fix and audit them, what goes wrong when agents run analyses, and a candidate set of eight research axes with timing and sensitivity as overrides."
created: 2026-11-03
tags: [baesian, research]
---

# Preference sliders, strand B3: decisions in research work

Provenance: one of five strands run in parallel on 2026-11-03, after the user decided on preference sliders set per repo or project (D131), with software design and domain-specific research as different sets of axes. The user's current view is that agents create every card and a classification gate decides which reach the person. The gate itself is strand B4 ([[Preference Sliders - Strand B4 The Gate]]). This strand asks what the axes should be for research.

It builds on the research-process integrity strand in [[Minimal Card Content - Strand reports]] ("the earlier strand"), which covered researcher degrees of freedom, the ordering of planning and results, pre-registration quality, multiverse methods, AI research agents up to mid-2026, and provenance tools. Where I lean on its figures I say so and don't re-verify them. Bracketed numbers point to section 4.

**Terms used below.**
- **Researcher degrees of freedom:** the choices an analyst can make (which outcome, which exclusions, which covariates) that change the result.
- **Garden of forking paths:** the same idea, stressing that a single analysis is still one path among many that the data could have prompted.
- **Multiverse analysis / specification curve:** running every reasonable combination of choices and showing the spread of results.
- **Many-analysts study:** many independent teams get the same data and question; the spread of their answers measures analytic flexibility.
- **Operationalising a variable:** deciding how an abstract construct (status, immigration, fertility) becomes a column of numbers.
- **Pre-registration:** a time-stamped plan filed before the data are seen. A **registered report** is a paper whose plan is peer reviewed and accepted before results exist.
- **Estimand:** the exact quantity a study sets out to estimate (for whom, of what, compared with what).
- **Blind review / blind analysis:** checking and fixing the analysis while the outcome, or which group got the treatment, stays hidden.
- **Deviation:** doing something other than the plan. **Severity:** how hard a test could have failed if the claim were false.
- **HARKing:** presenting a hypothesis made after seeing results as if it had been planned.

## 1. Key findings

**F1. An analysis holds hundreds of decisions, and many are never seen as decisions, by people or by agents.**
- **Kale, Kay & Hullman [1]** interviewed 11 professional researchers doing research synthesis and coded 480 analytical decisions. 201 of the 480 had only an "indirect impact" on the results, through how evidence was recorded, framed and communicated, rather than through the numbers. Their main design challenge was "shifting researchers' attention from rationales for decisions to impacts on results": asked why, researchers cited conventions and research questions, not what the choice did to the result.
- **Liu, Althoff & Heer [2]** reconstructed nine published studies with their authors. The number of possible analysis paths ranged "from 16 to over 25,000,000 (median 1,632)". Data and inference decisions were "often neglected": participants "did not recognize these steps as decision points and implicitly chose a single viable option". Choosing variables and models, by contrast, got careful thought. When analysts skipped a decision because they believed it wouldn't matter, "perceived sensitivity might differ from actual sensitivity".
- **Liu, Boukhelifa & Eagan [3]** (12 data workers, abstract only) found that alternatives span hypotheses, data sources, methods, tools and visual designs, and that how far people explore them depends on their domain and computational expertise.
- **Notebooks don't record reasoning.** Of over a million GitHub notebooks, one in four had no explanatory text; of over 200 academic notebooks, "only a minority discussed reasoning or results" [4, abstract]. Data scientists who tried to keep a history of what they had tried found it hurt readability [5, abstract].
- **Agents' write-ups miss decisions too.** ForkSCOPE [14] charted 223 analyses of the red-card dataset (204 by AI agents, 19 by human teams): 3,946 decisions in 777 forks. The prose reports recovered about 0.64 of the decisions found in the AI agents' code and about 0.53 in the humans' code, and "around 7-9% of decisions are silent (done in code, never stated)".

**F2. Across the multiverses that rank decisions, how variables are operationalised and which data are included move results most. Model details matter, but less often.**
- **Operationalisation:** in Schweinsberg et al. [9] (29 analyses, abstract only), a multiverse showed that "decisions about how to operationalize variables explain variability in outcomes above and beyond statistical choices (e.g., covariates)".
- **The same, with agents:** Miao, Pritchard & Zou [13] analysed 4,392 review-passing specifications that agents fitted to the immigration and welfare question along seven axes: the outcome, the exposure measure, the method and fixed effects, the sample, the time period, variable construction, and the controls. The axes predicted the sign of the result with an area under the ROC curve of 0.92. "The immigration measure mattered most": using immigrant stocks gave an odds ratio for a positive conclusion of 0.11 (95% CI 0.08 to 0.16), using flows 5.3 (2.8 to 10.1). The next most predictive were the welfare outcome, the countries included, the control set and the statistical method.
- **One data-processing choice:** in Steegen et al.'s multiverse [12] (120 and 210 alternative datasets), "most data sets constructed under the second option for relationship assessment (R2) yield a nonsignificant interaction effect". One coding decision largely decided significance.
- **Covariates alone:** across 417 variables and 8,192 Cox models each, covariate choice produced a "Janus effect", with the estimate pointing opposite ways at the 1st and 99th percentiles of analyses, for 31% of variables [11, abstract].
- **Data preparation:** when seven replicators each redid two published economics studies, "no two replicators reported the same sample size", and the spread of estimates was "3–4 times the mean reported standard error" [10, abstract].
- **Pipeline settings:** in the neuroimaging many-analysts study (70 teams, 9 hypotheses [7, abstract]), the share of teams reporting significant support ranged from 21 to 84% by hypothesis. Some of the variation was explained by "choice of software package, smoothing function, and parametric versus non-parametric corrections for multiple comparisons" (as summarised by [8]).
- This adds to the earlier strand's list (outcome, exclusions, covariates, stopping, the decision rule). The common thread is choices that change what is measured and on whom, ahead of how it is modelled.

**F3. But a decision's type does not reliably predict its impact in a given study, and a fixed list of decision types misses most real forks.**
- **Breznau et al. [6]:** 73 teams, 1,261 models, 166 coded decisions (107 taken by at least three teams). Identified components of the research design explained 2.6% of the variance in results, and researcher characteristics at most 1.2%: "95.2% of the total variance in results is left unexplained". For the teams' conclusions, 80.1% was unexplained.
- **Gould et al. [8]:** 174 teams in ecology and evolutionary biology. They found "no strong relationship" between distance from the meta-analytic mean and how distinctive a team's variables were, whether it used random effects, or how peer reviewers rated its methods.
- **Fixed lists miss forks.** ForkSCOPE [14] compared its bottom-up chart with an expert's 11-item list of decision points for the same dataset. It recovered at least 91% of the list, but "60% of our most-walked decision points, including several reached by over half the corpus, have no counterpart in that codebook". Its 17 most contested forks predicted the verdict out of sample with R² of only 0.262.
- **Reconciling F2 and F3:** within one study, impact concentrates in a few forks (Miao's AUC of 0.92 was inside a prescribed seven-axis space). Which forks those are differs from study to study, and much of the variation sits in idiosyncratic choices no list names. So a category can set where to look first. It can't certify that a decision is safe to skip. The earlier strand drew the same conclusion from Breznau; F3 adds that the list itself is incomplete.

**F4. Interpretation is a decision stage of its own, and it is where agents are weakest.**
- **People read the same numbers differently.** In Breznau et al. [6], the share of a team's tests that supported its conclusion "explains only about a third of the deviance in conclusions", which "points at the variation in how different researchers interpret the same set of numerical results".
- **Spin is common in published work.** In 72 trials with a non-significant primary outcome, the abstract's conclusions had spin in 58.3% and the main text's conclusions in 50.0% [31, abstract]. Spin here means wording that presents the treatment as beneficial anyway.
- **Pre-registration doesn't cover it.** Nosek et al.'s ninth challenge [16]: "Preregistration does not prevent authors or readers taking narrative license to deviate from what is justified from the evidence."
- **Agents, by statement type:** expert evaluators checked 102 statements from three reports by Kosmos [38]. 85.5% of data-analysis statements were reproducible and 82.1% of literature statements were supported. Only 57.9% of synthesis statements, which interpret across the two, were accurate.
- **Agents overclaim.** Trehan et al. [39] name "overexcitement that declares success despite obvious failures" among six failure modes. In one of the AI Scientist v2's workshop papers, the authors' own review found a caption that "incorrectly interpreted validation loss" and a figure "contradicting the authors' claims" [33].
- The earlier strand's Alizadeh et al. reached the same point: "the locus of AI bias is not estimation but interpretation."

**F5. Agents make forking cheap, so the main risk moves from flawed analyses to selective exploration and reporting, which review of the final report can't see.**
- **Miao et al. [13]:** agents given opposing personas reported opposing conclusions from the same data. They reproduced 72% of the human teams' ideological gap, and the divergence persisted on a permuted dataset with no real signal. Yet "86% of the agent reports passed independent AI methodological review, and 78% passed review by a majority of independent human experts". The authors' reading: "the central challenge is often not flawed analyses, but selective exploration and reporting".
- **Vaccaro [43]:** the risk of specification search "depends jointly on" the marginal cost of another run and the number of defensible forks. Experiments with AI agents combine near-zero cost with high flexibility: prompt wording, model and version, decoding parameters, retry policies, parsing rules.
- **Selection by the operator counts too.** The AI Scientist v2's authors ran multiple seeds and selected "the best complete run" before submitting, which they call "meta-selection" rather than human intervention [33]. That is itself a fork.
- **Results that aren't real:** MLR-Bench reports that coding agents "frequently (e.g., in 80% of the cases) produce fabricated or invalidated experimental results" [42, abstract]. Trehan et al. describe "implementation drift": agents quietly simplify the planned method when they hit obstacles [39]. That is an unreported deviation.
- **People do the same.** In Liu, Althoff & Heer [2], seven of nine participants explored alternatives opportunistically, and four of the five doing confirmatory work "omitted statistically non-significant results".

**F6. Human checkpoints and domain knowledge help agents, but by modest and uneven amounts. Making the agent's assumptions editable raises control more than accuracy.**
- **Checkpoints:** in Agent Laboratory's co-pilot mode [34], a person reviews each stage. External reviewers scored co-pilot papers 4.38/10 overall, against 3.8/10 for autonomous ones. The automated reviewer rated papers far higher than humans did (6.1 vs 3.8).
- **Domain knowledge:** on DiscoveryBench [36] the best system scored 25%. Adding targeted domain knowledge as hints on archaeology tasks raised one agent from 9.9% to 17.5%. (The paper's parenthetical labels are swapped, but its text says performance "jumps".) On ScienceAgentBench [37], the best agent solved 32.4% of tasks alone and 34.3% with expert-provided knowledge.
- **Editable assumptions:** Kazemitabaar et al. [41] gave analysts step-by-step editable assumptions and plans (n=18). Users reported "significantly greater control" and found correction easier, but there was "no difference in task success or completion time".
- **How analysts check AI work:** Gu et al. [40] (n=22) found that analysts start by asking "what did the AI do?" and move to "does the data make sense?" once they spot a problem. Data tables were key evidence.
- **Plans judged before execution mislead.** When 43 experts executed randomly assigned research ideas, LLM-generated ideas lost significantly more of their review scores after execution than human ideas did [35]. Judging a plan is not the same as judging its outcome.

**F7. Pre-registration templates and reporting standards converge on the same few headings. Some fields give each discipline its own set.**
- **The OSF Prereg form [23]** has six sections:
  - study information, including the hypotheses;
  - the design plan: study type, blinding, design, randomisation;
  - the sampling plan: existing data, data collection, sample size and its rationale, the stopping rule;
  - variables: manipulated, measured, indices;
  - the analysis plan: statistical models, transformations, inference criteria, data exclusion, missing data, exploratory analysis;
  - other.
- **Wicherts et al.'s 34 degrees of freedom [15]** fall into five phases: hypothesising (2), design (7), data collection (4), analysis (15) and reporting (6). The analysis items include the choice of dependent variable, operationalisation, inclusion criteria, models, estimation and software, and inference criteria "such as alpha, test sidedness, or multiple-comparison corrections".
- **Nature Portfolio's reporting summary [24]** has a common statistics checklist, then field-specific design sections: life sciences; behavioural and social sciences; and ecological, evolutionary and environmental sciences. "All studies must disclose on these points even when the disclosure is negative." The life-sciences points are sample size, data exclusions, replication, randomization and blinding.
- **Clinical trials put the question first.** ICH E9(R1) [26] defines the estimand by five attributes: the treatment, the population, the variable (endpoint), how intercurrent events are handled, and a population-level summary. Intercurrent events are things that happen after assignment, such as stopping treatment. Statistical analysis plans have a 55-item minimum content list [28, abstract].
- **Contingent decisions can be fixed in advance.** Nosek et al. [16] describe pre-registering a decision tree (test normality, then choose the test) or standard operating procedures, with the warning that "it is possible to preregister biases into decision trees". Preregistration "does not eliminate the possibility of poor statistical practices, but it does make them detectable."
- **Oversight in proportion to risk, per study:** ICH E6(R3) [27] asks each trial to identify "critical to quality factors" prospectively and to use "a proportionate risk-based approach". This is the regulatory analogue of a per-project slider.

**F8. Regulators and pre-registration both record when a decision was made relative to the results, on a short scale. Knowing the outcome changes how people judge identical methods.**
- **ICH E9 [25]:**
  - the analysis plan "should be finalised before breaking the blind";
  - "formal records should be kept of when the statistical analysis plan was finalised as well as when the blind was subsequently broken";
  - decisions on combining trial centres "should always be taken blind to treatment, for example at the time of the blind review";
  - "Only results from analyses envisaged in the protocol (including amendments) can be regarded as confirmatory."
- **ICH E9(R1) [26]:**
  - each analysis is reported "specifying whether each analysis was pre-specified, introduced while the trial was still blinded, or performed post hoc";
  - "Changes to the estimand during the trial can be problematic and can reduce the credibility of the trial."
- **Outcome knowledge biases reviewers.** In a randomised trial with 210 peer reviews [21, abstract], reviewers recommended a positive version of a manuscript more often than an otherwise identical no-difference version (97.3% vs 80.0%). They found fewer planted errors in it (0.41 vs 0.85) and rated its identical methods section higher (8.24 vs 7.53). Baron & Hershey's subjects rated the same decision as better thinking when its outcome was good, though they said they shouldn't [22, abstract].
- **Results-blind review raises rated rigour.** 353 reviewers rated registered reports above comparison papers on all 19 criteria. The largest gains were in rigour of methodology (0.99) and analysis (0.97), on a −4 to +4 scale, and the smallest in novelty (0.13) [20, abstract]. Registered reports are "not a universal solution for irreproducibility" [19, abstract]. The earlier strand has the positive-result rates (44% vs 96%).

**F9. Deviations from a plan are normal. Good practice classifies each deviation and judges its effect, rather than counting deviations.**
- **Deviations are expected.** Nosek et al. [16]: a pre-registration with transparently reported deviations "provides substantially greater confidence" than none, "with transparent reporting, observers can assess the deviations and their rationale."
- **Lakens [17]:**
  - gives five reasons to deviate: "1) unforeseen events, 2) errors in the preregistration, 3) missing information, 4) violations of untested assumptions, and 5) falsification of auxiliary hypotheses";
  - "Some deviations have no impact on the test severity, while others decrease the severity substantially", and "under some circumstances deviating from a preregistration can increase the severity of a test";
  - each deviation should state "when, where, and why", with "an evaluation of the impact of the deviation on the severity of the test".
- **Most deviations go unreported.** Willroth & Atherton [18, abstract] found "most preregistration deviations in psychology go unreported or are reported in unsystematic ways" and propose a standard template. The earlier strand gives its fields: the plan, the change, the reason, the timing, and the effect on interpretation.
- **Practice separates legitimate from illegitimate deviations.** Liu, Althoff & Heer [2] distinguish "contingency" (the plan proved erroneous or infeasible; 13 instances) and robustness checks from "opportunism" (searching for desired results; 20 instances).

**F10. In regulated science, audit trails are made by machines, time-stamped, kept in full, and reviewed as often as the risk warrants.**
- **The FDA's data-integrity guidance [29]:**
  - data should be "attributable, legible, contemporaneously recorded, original or a true copy, and accurate (ALCOA)";
  - an audit trail is "a secure, computer-generated, time-stamped electronic record that allows for reconstruction of the course of events";
  - how often audit trails are reviewed is set by "data criticality, control mechanisms, and impact on product quality";
  - testing "until the desired passing result is obtained" ("testing into compliance") is prohibited;
  - saving only the final result of reprocessed data is not acceptable.
- **P-Plan [30]** extends W3C PROV to link each executed activity to its planned step, so that "the plan can describe the expectations for the execution, which can then be contrasted with the provenance… to detect deviations". "A step may not have a corresponding activity."
- The earlier strand covers PROV, RO-Crate, noWorkflow and MLflow. Together, these mean plan-versus-execution checks can be computed from a trace, not only declared.

## 2. Implications for Baesian

### I1. A candidate set of research axes

These are decision categories a domain expert would recognise. They follow the headings that pre-registration templates, Wicherts's phases, Nature's summary and ICH E9(R1) share (F7), ordered along the analysis. The sign-off column is my proposal from the evidence, not a measured result. F3 is the main reason to hold it loosely.

| Axis | What it covers | Default need for an expert's sign-off | Evidence |
|---|---|---|---|
| **R1. Question and estimand** | hypotheses, the target quantity, population, primary outcome, confirmatory vs exploratory | **High.** Fix before data; any change after results is hard. | ICH E9(R1) on estimand changes [26]; outcome switching (earlier strand: COMPare, van den Akker, Bakker); Miao's outcome axis [13] |
| **R2. Data and sample** | sources, inclusion of units or countries or years, sample size, stopping rule, held-out splits | **Medium–high.** High if after results, or if it touches held-out data. | Miao's country and wave axes [13]; Huntington-Klein [10]; optional stopping (earlier strand: Simmons) |
| **R3. Exclusions and cleaning** | outliers, missing data, transformations, deduplication, synthetic or substituted data | **Medium before results, high after.** | Steegen [12]; Wicherts A1–A4, A12 [15]; Nature's "data exclusions" [24]; Liu: data steps not seen as decisions [2]; Luo (earlier strand) on undisclosed substitution |
| **R4. Operationalising variables** | how each construct is measured, coded or scored; which of several measures | **High.** The biggest single effects found, and needs domain knowledge. | Schweinsberg [9]; Miao's stocks vs flows [13]; Wicherts A5–A7, A9, A11 [15]; domain hints in DiscoveryBench [36] |
| **R5. Model specification** | covariates, model family, random effects, estimation, software | **Medium.** Delegable within an agreed set, if sensitivity is computed. | Patel's 31% [11]; NARPS settings [7, 8]; Gould: no strong link [8] |
| **R6. Inference rules** | alpha, sidedness, corrections, priors, what counts as "supported" | **High before results** (cheap to fix then), **hard after.** | Wicherts A15 [15]; OSF "inference criteria" [23]; Liu: inference neglected [2]; Alizadeh (earlier strand) |
| **R7. Interpretation and claims** | what the result means, causal wording, generalisation, which results lead the story | **High, always.** Weakest agent stage. | Kosmos 57.9% [38]; Breznau [6]; spin [31]; Nosek challenge 9 [16]; Trehan [39] |
| **R8. Reporting and disclosure** | what is shown, robustness checks, the deviation table, all runs tried | **Medium.** Mostly checkable by machine, audited by a person. | Liu: selective reporting [2]; ForkSCOPE: silent decisions [14]; Wicherts R1–R6 [15] |
| *R9 (optional). Instruments and AI settings* | model and version, prompt, decoding, seeds, parsing, choosing among runs | *High when an LLM is a measuring instrument or an agent selects among runs.* | Vaccaro [43]; AI Scientist v2's meta-selection [33]; Baumann (earlier strand) |

Not axes but **modifiers**, applied to every axis: timing relative to results (F8), whether the options flip the conclusion (F2, F3), and whether held-out data were touched. These are the earlier strand's facets F1, F4 and F6.

Weak points:
- The ranking of R4 and R2 above R5 rests on a handful of multiverses (Schweinsberg, Miao, Steegen) in social science and psychology.
- Breznau and Gould show that the ranking doesn't hold reliably within any one study.
- Fields will want their own sets, as Nature's reporting summary has (F7). The table is a generic default.

### I2. A slider sets a floor; timing and computed sensitivity escalate

Because type doesn't predict impact (F3), a slider by axis can only set prior attention. Two computed facts should override it:
- **Timing:** a decision on R1, R3, R4, R6 or R7 made after results exist goes to the person whatever the slider says. Under the D42 levels, it would be blocking at least. A post-results change to R1 or R6 is the research equivalent of a one-way door. This follows ICH E9's line between planned and post hoc (F8).
- **Sensitivity:** if running both options flips the sign, the significance or the verdict, the card escalates even on a low axis. ForkSCOPE's 17 contested forks and Miao's AUC show that concentrated impact exists and can be found (F3).

This is untested as a routing rule. The cost of computing sensitivity for expensive experiments is still open (earlier strand).

### I3. "Agents create every card" won't hold for research; the gate also needs to read the code

People and agents fail to recognise data and inference steps as decisions (F1). 7–9% of decisions are silent, and agents' prose recovers only about 0.64 of what their code did (F1, [14]). A gate that only classifies cards agents chose to file never sees the silent ones (B4 makes the same point about gates in general).

For research, Baesian would need a code-anchored extractor, in the way ForkSCOPE distils decisions from scripts. It would file audit cards for decisions that never became cards. ForkSCOPE's distillation cost $1.91 per analysis in logged API spend [14]: not free, but affordable for a project.

A decision that fits no axis should go to audit sampling, not be dropped. A fixed list missed 60% of common forks (F3). Evidence: one 2026 preprint for the extraction numbers; the miss rate of fixed lists has only that one measurement.

### I4. A plan deck before data access is a pre-registration

The plugin already turns an approved plan into a deck. For research, a deck built before data access, with cards following the R1–R8 headings, plays the role of a pre-registration or a registered report's Stage 1. The verdicts, time-stamped in git, are the registered decisions.

Afterwards, the useful cards are mostly deviations from those verdicts (I6) and interpretation (R7). That cuts volume where it is worst: a median analysis has over a thousand paths (F1).

A pre-registration's value rests on its timestamp being trustworthy. AsPredicted's public registrations "cannot be modified" [44], whereas git history can be rewritten. The hosted relay (D127) could countersign verdict times. That is a proposal, not evidence.

### I5. How "choose before you see the agent's pick" relates to pre-registration

These are two different blinds:
- **Advocate-blind:** Baesian today hides the agent's pick until you choose (D86). This guards against anchoring and over-reliance on the agent.
- **Outcome-blind:** pre-registration, registered reports and blind review hide the results. This guards against hindsight and outcome bias. Outcome knowledge changed reviewers' ratings of identical methods (8.24 vs 7.53) and with a positive outcome they found about half as many planted errors (F8).

For research cards, the outcome blind matters more, and the two interact. Once results exist, the agent's pick can carry the result, because agents favour paths toward their prior or persona (F5). So on cards filed after results:
- hide the pick;
- also hide which option favours the hypothesis;
- show only whether the conclusion depends on the choice.

That matches the earlier strand's untested "does it flip?" display, ICH's blind review, and ForkSCOPE's viewer, which shows "where variation in the outcome concentrates, not which specific option or path would move an individual run's result" [14].

Before results, a card answered under both blinds is in effect a registered decision. The card should record which blinds held when it was answered, using ICH E9(R1)'s three levels [26]: pre-specified, introduced while blind, or post hoc.

Evidence: strong that outcome knowledge biases judgment; none on Baesian-like displays.

### I6. What audit cards can learn from deviation reporting

A deviation card, filed when work departs from an earlier verdict, or found by comparing the plan with the trace as P-Plan does [30], would carry:
1. **What was agreed:** a link to the verdict or plan card.
2. **What was done:** from the trace, not the narrative (F1, F5).
3. **The reason, by class:** Lakens's five, plus opportunism versus contingency from Liu (F9).
4. **When,** relative to results, on ICH's three levels (F8).
5. **The effect on the conclusion,** computed where possible.
6. **The effect on severity:** raised, lowered or none. Lakens shows deviations can strengthen a test.

From the deviation cards, Baesian could generate the deviation table that Willroth & Atherton propose and that journals ask for [18].

Three further lessons:
- **Count by class, not in total.** A project with many "contingency, before results, no effect" deviations is healthy. One with a "post hoc, R6, raises support" deviation is not.
- **Audit frequency follows risk.** Following the FDA [29], audit cards are sampled more often for critical axes. This is what a slider would control for audits.
- **Keep every run.** The FDA rejects keeping only reprocessed final results, and the AI Scientist v2 picked its best seed. The trace should keep all runs tried, which feeds the earlier strand's "forks already tried" facet.

Evidence: the deviation-reporting fields are consensus guidance, not tested; the regulatory practices are established but come from manufacturing and trials.

### I7. Different axes may need different reviewers

- **Domain expertise:** R1, R4 and R7 turn on it (F6: domain hints helped agents; F1: alternatives depend on expertise).
- **Statistical expertise:** R5 and R6 turn on it. Two of Liu's researchers "deferred a decision to a statistician" [2].

So a project's sliders may need to say *who* gets each axis, not only *how much*. This touches the design's open question on identity and trust. Weak evidence: qualitative studies only.

### I8. How research axes differ from software axes

| | Software axes (today's checklist) | Research axes |
|---|---|---|
| What they describe | the artefact a decision touches (schema, API, dependency) | the stage of the inferential chain |
| Detection | file patterns work | often a one-line filter or recode; needs code-level extraction (I3) |
| What makes it hard to undo | migrations, public URLs, dependants | seeing the results, and publishing a claim |
| Ground truth | tests and CI, fast | delayed, often never |
| Volume | a few per branch | hundreds of forks per analysis (F1) |
| Right answer | usually one | often several defensible, so "keep both and report as robustness" is a real third answer (earlier strand) |
| Default to hard | money, security, data loss, publishing | post-results changes to R1, R4, R6 or R7; publishing a claim |

The facts the software checklist uses (impact and reversibility) still apply. In research, though, reversibility is about knowledge, not code: you can revert a commit, but you can't un-see a result.

### I9. Exploratory work needs its own mode

Nosek et al.'s seventh challenge is research with "few a priori expectations" [16]. Liu found exploratory opportunism "sensible as long as the exploratory nature is clearly acknowledged" [2]. A project or deck marked exploratory could set most research sliders low. The gate would then check only the labelling: that no R7 claim presents an exploratory finding as confirmatory (HARKing, Wicherts R6 [15]).

## 3. Open questions

- **Category or sensitivity?** Does routing by axis catch more planted faults than routing by computed sensitivity, or than both together? A test could reuse planted personas (Miao [13]; Bertran in the earlier strand) and inverted scores (Luo in the earlier strand).
- **Batching forks.** How should hundreds of forks be presented without swamping the person? Options are a plan deck before results, one card per contested fork, or a ForkSCOPE-style map with a verdict per fork.
- **Two options or more?** Many forks have more than two defensible options, which strains the two-option card.
- **Who classifies?** Will agents classify their own decisions honestly when a low class means no review? Agents are steerable (F5); B4 covers whether the filing agent should be the gate.
- **Whose axes?** Should each discipline get its own set, as Nature's reporting summary does, and who maintains them?
- **Reviewers per axis.** Should sliders route axes to different reviewers (I7)?
- **Trustworthy timestamps.** What makes a verdict's timestamp trustworthy enough to count as pre-registration when git history can be rewritten?
- **Seeing results.** What counts as "having seen the results" for an agent (earlier strand), and does printing a summary table count?
- **Prior knowledge.** For well-known public datasets, does an agent's training data make any "before results" claim doubtful (earlier strand: Gelman)?

## 4. Sources

Status: **full text** (opened and read in the relevant parts), **abstract** (abstract only), or **earlier strand** (figures taken from [[Minimal Card Content - Strand reports]], verified there, not re-opened). Nothing below is unverified. One source was opened only through a secondary account and is marked so.

1. Kale, Kay & Hullman, *Decision-Making Under Uncertainty in Research Synthesis: Designing for the Garden of Forking Paths*, CHI 2019. https://arxiv.org/abs/1901.02957. Full text.
2. Liu, Althoff & Heer, *Paths Explored, Paths Omitted, Paths Obscured: Decision Points & Selective Reporting in End-to-End Data Analysis*, CHI 2020. https://arxiv.org/abs/1910.13602. Full text.
3. Liu, Boukhelifa & Eagan, *Understanding the Role of Alternatives in Data Analysis Practices*, IEEE TVCG 2020. https://doi.org/10.1109/TVCG.2019.2934593. Abstract.
4. Rule, Tabard & Hollan, *Exploration and Explanation in Computational Notebooks*, CHI 2018. https://doi.org/10.1145/3173574.3173606. Abstract.
5. Kery, Radensky, Arya, John & Myers, *The Story in the Notebook*, CHI 2018. https://doi.org/10.1145/3173574.3173748. Abstract.
6. Breznau et al., *Observing many researchers using the same data and hypothesis reveals a hidden universe of uncertainty*, PNAS 2022. https://doi.org/10.1073/pnas.2203150119 (full text via Europe PMC, PMC9636921). Full text.
7. Botvinik-Nezer et al., *Variability in the analysis of a single neuroimaging dataset by many teams*, Nature 2020. https://doi.org/10.1038/s41586-020-2314-9. Abstract. The 21–84% range and the factors (software, smoothing, multiple-comparison correction) are Gould et al.'s summary of it [8]; the full text was blocked.
8. Gould et al., *Same data, different analysts: variation in effect sizes due to analytical decisions in ecology and evolutionary biology*, BMC Biology 2025. https://doi.org/10.1186/s12915-024-02101-x (PMC11804095). Full text.
9. Schweinsberg et al., *Same data, different conclusions: Radical dispersion in empirical results when independent analysts operationalize and test the same hypothesis*, OBHDP 2021. https://doi.org/10.1016/j.obhdp.2021.02.003. Abstract.
10. Huntington-Klein et al., *The influence of hidden researcher decisions in applied microeconomics*, Economic Inquiry 2021. https://doi.org/10.1111/ecin.12992. Abstract.
11. Patel, Burford & Ioannidis, *Assessment of vibration of effects due to model specification can demonstrate the instability of observational associations*, J Clin Epidemiol 2015. https://doi.org/10.1016/j.jclinepi.2015.05.029. Abstract.
12. Steegen, Tuerlinckx, Gelman & Vanpaemel, *Increasing Transparency Through a Multiverse Analysis*, Perspectives on Psychological Science 2016. http://www.stat.columbia.edu/~gelman/research/published/multiverse_published.pdf. Full text (the earlier strand had the abstract only).
13. Miao, Pritchard & Zou, *The Agentic Garden of Forking Paths*, arXiv 2026. https://arxiv.org/abs/2607.01507. Full text. Single preprint.
14. Balaji et al., *ForkSCOPE: Charting the Agentic Garden of Forking Paths*, arXiv 2026. https://arxiv.org/abs/2609.12438. Full text. Single preprint, one dataset.
15. Wicherts et al., *Degrees of Freedom in Planning, Running, Analyzing, and Reporting Psychological Studies*, Frontiers in Psychology 2016. https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2016.01832/full. Full text (first 100,000 characters, which hold the checklist).
16. Nosek, Ebersole, DeHaven & Mellor, *The Preregistration Revolution*, PNAS 2018. Author preprint https://osf.io/2dxu5/ (published https://doi.org/10.1073/pnas.1708274114). Full text of the preprint.
17. Lakens, *When and How to Deviate From a Preregistration*, Collabra: Psychology 2024. https://doi.org/10.1525/collabra.117094. Abstract; quotations from Lakens's textbook chapter on the same material, *Improving Your Statistical Inferences*, ch. 13, https://lakens.github.io/statistical_inferences/13-prereg.html (full text).
18. Willroth & Atherton, *Best Laid Plans: A Guide to Reporting Preregistration Deviations*, AMPPS 2024. https://doi.org/10.1177/25152459231213802. Abstract; template fields via the earlier strand.
19. Chambers & Tzavella, *The past, present and future of Registered Reports*, Nature Human Behaviour (online 2021). https://doi.org/10.1038/s41562-021-01193-7. Abstract.
20. Soderberg et al., *Initial evidence of research quality of registered reports compared with the standard publishing model*, Nature Human Behaviour 2021. https://doi.org/10.1038/s41562-021-01142-4. Abstract.
21. Emerson et al., *Testing for the Presence of Positive-Outcome Bias in Peer Review: a randomized controlled trial*, Archives of Internal Medicine 2010. https://doi.org/10.1001/archinternmed.2010.406. Abstract.
22. Baron & Hershey, *Outcome bias in decision evaluation*, JPSP 1988. https://doi.org/10.1037/0022-3514.54.4.569. Abstract.
23. OSF Prereg form v1, as rendered by the preregr package. https://preregr.opens.science/articles/form_OSFprereg_v1.html. Full text (a copy, not the live OSF form).
24. Nature Portfolio, *Reporting Summary* (flat reference copy). https://www.nature.com/documents/nr-reporting-summary-flat.pdf. Full text.
25. ICH, *E9: Statistical Principles for Clinical Trials*, 1998. https://database.ich.org/sites/default/files/E9_Guideline.pdf. Full text.
26. ICH, *E9(R1) Addendum on Estimands and Sensitivity Analysis*, 2019. https://database.ich.org/sites/default/files/E9-R1_Step4_Guideline_2019_1203.pdf. Full text.
27. ICH, *E6(R3) Guideline for Good Clinical Practice*, 2025. https://database.ich.org/sites/default/files/ICH_E6%28R3%29_Step4_FinalGuideline_2025_0106.pdf. Full text (searched for the passages cited).
28. Gamble et al., *Guidelines for the Content of Statistical Analysis Plans in Clinical Trials*, JAMA 2017. https://doi.org/10.1001/jama.2017.18556. Abstract.
29. US FDA, *Data Integrity and Compliance With Drug CGMP: Questions and Answers*, guidance, December 2018. https://www.fda.gov/media/119267/download. Full text.
30. *P-Plan Ontology*, version 1.1, release of 17 September 2013. https://www.opmw.org/model/p-plan/. Full text.
31. Boutron et al., *Reporting and Interpretation of Randomized Controlled Trials With Statistically Nonsignificant Results for Primary Outcomes*, JAMA 2010. https://doi.org/10.1001/jama.2010.651. Abstract.
32. Lu et al., *The AI Scientist*, 2024. https://arxiv.org/abs/2408.06292. Earlier strand.
33. Yamada et al., *The AI Scientist-v2: Workshop-Level Automated Scientific Discovery via Agentic Tree Search*, 2025. https://arxiv.org/abs/2504.08066. Full text.
34. Schmidgall et al., *Agent Laboratory: Using LLM Agents as Research Assistants*, 2025. https://arxiv.org/abs/2501.04227. Full text.
35. Si, Hashimoto & Yang, *The Ideation–Execution Gap: Execution Outcomes of LLM-Generated versus Human Research Ideas*, 2025. https://arxiv.org/abs/2506.20803. Full text (abstract and methods sections read).
36. Majumder et al., *DiscoveryBench: Towards Data-Driven Discovery with Large Language Models*, 2024. https://arxiv.org/abs/2407.01725. Full text.
37. Chen et al., *ScienceAgentBench: Toward Rigorous Assessment of Language Agents for Data-Driven Scientific Discovery*, ICLR 2025. https://arxiv.org/abs/2410.05080. Full text (abstract figures used).
38. Mitchener et al., *Kosmos: An AI Scientist for Autonomous Discovery*, 2025. https://arxiv.org/abs/2511.02824. Full text. Developer's own evaluation.
39. Trehan et al., *Why LLMs Aren't Scientists Yet: Lessons from Four Autonomous Research Attempts*, 2026. https://arxiv.org/abs/2601.03315. Full text. Case study of four attempts.
40. Gu et al., *How Do Analysts Understand and Verify AI-Assisted Data Analyses?*, CHI 2024. https://arxiv.org/abs/2309.10947. Full text.
41. Kazemitabaar et al., *Improving Steering and Verification in AI-Assisted Data Analysis with Interactive Task Decomposition*, UIST 2024. https://arxiv.org/abs/2407.02651. Full text.
42. Chen et al., *MLR-Bench: Evaluating AI Agents on Open-Ended Machine Learning Research*, 2025. https://arxiv.org/abs/2505.19955. Abstract.
43. Vaccaro, *Preregistration for Experiments with AI Agents*, 2026. https://arxiv.org/abs/2606.11217. Full text. Position paper.
44. AsPredicted, home page. https://aspredicted.org/. Full text, for time-stamping and immutability only.
45. From the earlier strand, not re-opened:
    - Simmons, Nelson & Simonsohn 2011;
    - Gelman & Loken 2013;
    - Silberzahn et al. 2018;
    - Simonsohn, Simmons & Nelson 2020;
    - Bakker et al. 2020;
    - van den Akker et al. 2023 and 2024;
    - Goldacre et al. (COMPare) 2019;
    - Scheel, Schijen & Lakens 2021;
    - Luo et al. 2025;
    - Bertran, Fogliato & Wu 2026;
    - Alizadeh et al. 2026;
    - Baumann et al. 2025.

    URLs and verification status are in [[Minimal Card Content - Strand reports]].
