---
type: research
status: active
authority: reference
summary: "Four independent critiques (measurement, research governance, a computational scientist's practice, adversarial systems design) of making the gate's vocabulary a swappable profile, and of scientists collectively steering an agentic research platform through profiles that learn. Where they agree, what survives, two holes found and confirmed in the built gate, and what to decide next."
created: 2026-11-05
tags: [baesian, research]
---

# Profiles and collective steering: four critiques

Provenance: on 2026-11-05 the user asked how the preference gate would apply in a domain science, and proposed "a profile that defines the axes which differentiate scientists and engineers from one another, and learns over time", as the way scientists collectively steer an agentic research platform. The lead agent described the built mechanism ([[Routing and Preferences]]) and a "profile" bundle: the facts vocabulary, rows, detectors, floors, presets and agent instructions, swappable per domain. Four critics, each run independently and read-only, were asked to argue against it from one lens each. This note is the lead agent's synthesis of their reports; the numbers they computed from this repo's record are theirs.

## The proposal under critique

- **Profiles:** the software vocabulary (`ROW_NAMES`, `ROW_OF_FACT`, `ROW_FLOOR`, the presets, the detectors in `src/facts.ts`, the instructions in `AGENTS_BLOCK`) becomes data, so a research profile (statistical method, data inclusion, parameters and priors, reference data, compute spend, irreversible runs, claims and figures, human-subjects data) can replace it.
- **Collective learning:** many people's answers shape shared defaults over time, along axes that separate scientists from engineers.

## What each critic said it turns on

| Lens | The question it turns on |
|---|---|
| Measurement | When a reviewer comes round after reading the agent's case, are they being corrected or deferring? |
| Research governance | Can the person who moves a slider legitimately hand that decision to the agent? In science, accountability is assigned from outside the project. |
| A computational scientist | Can it see a research choice at the moment it becomes irreversible (job submission, unblinding, sample use, freezing a claim), and know whether the outcome had already been seen? |
| Adversarial design | Can anything the affected person didn't sign, and CI can't recheck, move a card from shown to held? |

## Where they agree

1. **The agent controls the inputs the gate trusts.** It chooses whether to file, which facts to state, `reverse`, the strongest alternative and the neutral `crux_fact`. Floors sit on self-stated facts for every row without a detector (security, privacy, money, data loss, publishing); a card with no facts falls in `other`. Research rows would have almost no detectors, so a research gate would be a policy over the agent's honesty. Remedies offered: an independent labeller or second agent on a sample; the person confirming facts in one tap; sampling commits with no card to estimate how many decisions go unfiled; rows resting on self-stated facts never held; the record stating its own coverage (shown, held, silent).
2. **The calibration signal is weaker than it looks, and it rewards persuasion.** From this repo's record (one reviewer, one agent, five days, 90 answers on 2026-11-03, median 48 s between final answers): blind agreement 75 of 128, 58.6%, against 50% by chance (κ about 0.17); on cards whose crux is a preference, 27 of 53, which is chance; 46 of the 53 blind disagreements ended on the agent's pick (87%). A miss counts final answers (`outcomeOf()`), so a row loosens faster the better the agent argues after the reveal.
3. **The loosening statistics aren't valid as built** (`proposeSliderMoves()`, `LOOSEN_AFTER`). Windows reset after every proposal and end in a miss or 29 clean answers, so loosening is eventually proposed even at a true 10% miss rate (about 1 window in 21); the "under about 1 in 9" bound is a rule of three applied to a streak chosen after the fact; eight rows are tested at once; "tighten after any miss" fires about every 16 answers at this repo's rate, which trains declining; and cards don't record the model, so a model change resets nothing.
4. **"Axes that differentiate scientists and engineers" sorts people, not decisions.** All three critics who addressed it would keep rows as kinds of decision, and put who answers on a separate map of roles (statistician for inference, data steward for access, the PI for claims, an ethics board's designee for consent). A computational biologist is both.
5. **Learning across people has nothing it can identify, and shouldn't set defaults.** With one reviewer per card, reviewer leniency, card difficulty, agent quality and project are confounded; this repo's 8 misses support about one parameter. Remedies: never learn defaults across projects automatically; publish shared profiles as versioned standards with named authors and reasons (the EQUATOR/CONSORT model), signed by maintainers; automatic shared updates may only tighten; pool only rows where reviewers agree with each other (competence), keep low-agreement rows (taste) personal, measured by double review or a shared anchor bank of calibration cards.

## Specific to science

- **The commit is the wrong event.** Exclusions happen in notebook cells and sample sheets; a 50k core-hour run is an `sbatch`; consumed samples and data deposits never touch git. Gate the action: a submit filter with a cost estimate, deletes in project storage, deposition, and a workflow run's manifest (parameters, input hashes, environment, reference versions) compared with the last accepted run. Version bumps of reference data are the reproducibility hazard the software detector deliberately ignores.
- **One-decision cards can launder the garden of forking paths.** Each choice is defensible alone; the damage is in their combination and in choosing after seeing results, and the agent's case is written after the outcome. Remedies: record mechanically whether the outcome had been computed when the choice was made, and escalate post-hoc choices on inclusion, model, inference or claims; route analysis choices on sensitivity (run both branches; hold only if the conclusion doesn't move); make the analysis plan the unit, a deck answered blind before data access (a preregistration), with later cards as deviations from it.
- **Many research rows are obligations, not preferences.** Human-subjects data, a data use agreement, a registered plan and a funder's data policy are set by authorities the slider's owner doesn't hold. Three layers, strictest winning: obligations (each floor citing its source and owner, lowered only by recording that owner's amendment, a miss on one an incident); a community profile; local discretion, where sliders belong.
- **Collective means more than one answer per card.** Several people answering blind on high-stakes rows (dual independent screening), resolutions such as "both, reported as a sensitivity analysis" or "a named arbiter", dissent kept with the decision, and a way to appeal past the PI.
- **Card text can leak results** ("p = .03 vs .08"), which matters for forking paths and, inside a trusted research environment, for data governance: local-only operation must be first-class.
- **Write into the provenance labs already keep** (workflow configs, Workflow Run RO-Crates, DVC or DataLad, electronic lab notebooks, OSF) instead of a separate store keyed to commits.

## Two holes in the built gate

1. **The gate's own settings are unguarded** (adversarial critic, confirmed by test on 2026-11-05): `gate_ignore`, `gate_schema`, `gate_infra` and `gate_api` sit in the committed `.baesian/config.json`, which `DEFAULT_IGNORE` keeps out of the gate's sight except for the link's fields. A commit setting `gate_ignore` to everything and adding a dependency, with no card or ack, passed `baesian verify` with this repo's real pinned keys; the control failed. Card B-qkek1, which the user accepted, closed it (2026-11-05): first a stopgap that made a change to any `gate_*` key a gate fact, then the move itself. The settings are in the preference files now (`Settings.paths`), the config's keys are no longer read, and a change that makes the gate see less takes the passkey in a hosted repo (`pathsLoosening()`, [[src-gate]]). A profile file would be the same route, larger: anything that defines detectors, floors or rows must be out of an agent's reach, or pinned.
2. **Withdrawing a drawn card escapes its audit locally** (adversarial critic, not tested): the local draw is a public hash and the agent can see it. A drawn card withdrawn before it's answered should count against the source.

## What survives, by all four

- The blind choice, with sides shuffled and both answers kept (D86, D88): the judgement before persuasion, which made every diagnosis above possible, and which in science is independent assessment with a recorded reconciliation.
- Shadow mode and `replay()`: any setting evaluated against the whole history.
- Agents only escalate; the strictest row wins; the gate is a pure function rechecked in CI from the record; it fails toward the person.
- Baesian proposes and a person decides; loosening takes the passkey (D163); the audit draw can't be chosen (D158).
- Rules from repeated answers, which in science are versioned standard operating procedures; decisions committed with timestamps, which with the relay's signatures make a plan deck a preregistration.

## Suggested next steps (the lead agent's, not decided)

1. **Now, in the software gate:** B-qkek1; record the model on every card; replace the 29-in-a-row streak with a posterior or sequential test over every answer since a row last moved; a one-tap reason when someone comes round ("a fact I lacked", "the argument", "didn't care enough"), and blind disagreement on a preference crux counting as a miss; practice cards with planted picks (D83) to measure deference.
2. **Before profiles:** pin any profile in CI beside the keys, with floors and fixed rows kept in code as a kernel that profiles extend but never replace; define loosening by outcomes, not by comparing rows.
3. **For research use, a design note first:** rows as kinds of decision; a role map for who answers; obligation floors with sources; gates on actions and run manifests; plan decks and deviations; sensitivity routing; provenance export.
