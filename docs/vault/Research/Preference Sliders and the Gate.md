---
type: research
status: active
authority: reference
summary: "Synthesis of strands B1–B5 on preference sliders and the classification gate: five graded positions per kind of decision, floors for the hard kinds, a gate the filing agent can only escalate, random audits of held-back cards as the measure of misses, candidate software and research axes, format candidates before v1, and eleven decisions left to the user."
created: 2026-11-03
tags: [baesian, research]
---

# Preference sliders and the gate

Provenance: the synthesis agent's reading of five strands run in parallel on 2026-11-03, after D131 and D132:
- [[Preference Sliders - Strand B1 Control Preferences]] (B1): how people state how much control they want;
- [[Preference Sliders - Strand B2 Software Sign-off]] (B2): which software decisions organisations keep for a person;
- [[Preference Sliders - Strand B3 Research Decisions]] (B3): the decisions in research work;
- [[Preference Sliders - Strand B4 The Gate]] (B4): the classification gate;
- [[Hosted Service - Strand B5 Prior Art and Security]] (B5), used only where it bears on the sliders and the gate.

Nothing here is decided. The user's current view (agents file every card they normally would, and a classification gate checks each one against the repo's preferences) is treated as the proposal under test. Every claim, number and study below comes from a strand. Sources, and how far each was read, are listed in the strands. Where something rests on a vendor or a single preprint, the strand says so, and so does this note.

**How citations work.** "B2 F1" is strand B2, finding 1. Implications are cited as each strand numbers them: B1 I1–I11 and B4 I1–I13 (their numbered implications lists), B2 §2.1–§2.9, B3 I1–I9, B5 R1–R6. B4's six gate designs are "B4 design A" to "F".

**Terms.**
- *Position:* one of the five stops on a slider.
- *Held back:* a card the gate doesn't put to the person. The agent proceeds on its pick, and the card can be drawn for audit.
- *Miss:* a held-back card the person would have wanted to see.
- *Calibration:* a model is calibrated when its stated probabilities match how often it's right.
- *Cascade:* a cheap check answers first; a costlier one, or a person, is asked only when it's unsure.
- *Stratum:* one slice of a population sampled at its own rate (here, one kind of decision, or one score band).
- *Conformal risk control:* a way to pick a threshold from labelled cases that bounds the expected error on the next case, as long as future cases resemble past ones.
- *Automation bias:* following an automated recommendation instead of checking it. *Complacency:* under-monitoring automation that's usually right.
- *Preference construction:* people build a preference when asked, from whatever the question highlights, rather than reading it from a stable list.
- *E2EE (end-to-end encryption):* only the endpoints hold the keys, so the relay stores data it can't read.
- *Sub-processor:* a company that processes data on behalf of the service.

## 1. The short version

1. **A slider should set a level, not a yes or no.** Five positions (let the agent decide, check a sample afterwards, tell me but carry on, stop and ask, never without me) line up with rungs of Sheridan's level scale and with the grades mature review policies use, such as Google's API review outcomes "Not Required", "FYI", "Recommended" and "Required". The three that reach the person are today's provisional, blocking and hard levels; the two below them are "the agent decides and logs it" and audit cards. (B1 F1; B2 F4, §2.2)
2. **Putting everything to a person costs attention without buying safety, so routing by consequence is justified.** DORA found external change approval had a "negligible" effect on stability; users accept 93% of agent permission prompts; and acceptance falls with repeated, low-value items, not with the amount of work. (B2 F1; B1 F2; B4 F11)
3. **Security, money, data loss and publishing need a floor no slider can lower.** Three strands reach this separately: every coding-agent gate keeps actions no mode auto-approves, these are one-way doors, and tiered alerts with hard stops for the most severe got 100% compliance against 34%. Personal data may be a fifth, on legal grounds. (B1 F8, I5; B2 F2, §2.5; B4 F11, I1)
4. **The agent that files a card mustn't decide whether it's held back. It may only escalate.** Models judge their own work generously and are overconfident (agents that succeed 22% of the time predict 77%), and banking, security and code review all separate the party that acts from the one that decides whether it's checked. A model gate should read the card's facts and options, never the agent's case or pick. (B4 F7, F8, I2, I3; B1 F8; B2 F8)
5. **The best-supported design is a cascade:** floors and rules first, a classifier only for what rules can't place, and the person whenever the gate is unsure or unavailable. Meta's RADAR and Claude Code's auto mode are deployed gates of this shape, and both publish real misses: 17% on real overeager actions in auto mode. (B4 design E, F3; B2 F3; B1 F8)
6. **No model has been shown to predict whether a person wants to see a card, and Jev's evidence is thin.** Its calibration claim is the vendor's, its benchmarks come from one author each, text arguing for its own classification can move it, and sending it cards makes TypeSafe a US sub-processor of code context. Cost and latency don't decide between models. Privacy, independence from the agent, calibration on the user's own verdicts, and upkeep do. (B4 F1, F2, F5, F6)
7. **Random, stratified audits of held-back cards are the only unbiased measure of what the gate misses, and they're slow.** Showing that a kind's miss rate is under 10% takes 29 clean audits of that kind. Each held-back card must record its chance of being audited at the time. And people miss rare bad items in a stream that's mostly fine: 30% missed at 1% prevalence. (B4 F9, F10, F12, I7; B1 F2)
8. **Preferences are made when asked, and defaults win, so start from a few presets and change settings only through proposals the person accepts.** Four profiles predicted app-permission preferences with 79.37% accuracy, at most five questions assigned one, and people adopted 78.7% of the recommendations and later changed only 5.1%. Gmail's per-user threshold cut errors from 38% to 31%. A convention card can propose a slider move and show what it would have done to recent cards. (B1 F4–F7, I3, I8; B2 §2.4)
9. **Research needs its own axes, and there the gate can't rely on filed cards.** A decision's type doesn't reliably predict its impact (95.2% of the variance in Breznau's many-analysts study was unexplained), so a research slider only sets where to look first. Deciding after seeing results, or a choice that flips the conclusion, should override it. And 7–9% of analysis decisions are never stated, so a gate over filed cards never sees them. (B3 F1, F3, I1–I3)
10. **Where the gate runs decides whether the service can be end-to-end encrypted.** A gate that reads cards on the hosted service rules out E2EE. A gate on the agent's machine runs within the agent's reach. Rules over facts are deterministic, so they can run in either place, offline, and give the same answer. (B5 F4, F11, R1; B4 F6, I4)

## 2. Principles

Each principle gives its evidence, the strength of that evidence, and where the strands agree or disagree.

**P1. Route by consequence and reversibility, not uniformly.**
- *Evidence:* Parasuraman, Sheridan and Wickens define risk as the cost of an error times its probability, and call low-risk decisions "strong candidates for high-level automation" (B1 F1). Onnasch's meta-analysis of 18 experiments: more automation helps routine performance and hurts recovery when automation fails (B1 F2). DORA names "treating all changes equally" a pitfall; ITIL pre-authorises standard changes; Bezos separates one-way from two-way doors (B2 F1, F5).
- *Strength:* strong for the trade-off. DORA's data are correlational surveys about deployments, not design decisions.
- *Agreement:* all four slider strands.

**P2. Grade the outcome; don't make it binary.**
- *Evidence:* Google's four API review outcomes, Kubernetes's mandatory and voluntary reviews, Azure's DO, SHOULD and MAY, GitLab's non-blocking security review (B2 F4). The level schemes give the same steps (B1 F1).
- *Strength:* strong as practice. The level schemes are contested as design tools, so use them as shared vocabulary, not as predictions of which setting is right (B1 F3).
- *Agreement:* B1, B2, and B4's design A, whose tiers are also graded.

**P3. Fail toward the person, and keep hard stops for the severe.**
- *Evidence:* RADAR disqualifies a change on "any risk signal" (B2 F3). Auto mode hands back to the person after 3 denials in a row or 20 in total, and Devin's Smart mode prompts when its model is unsure (B1 F8, B4 F3). Hard stops for the most severe alerts raised compliance to 100% from 34% (B4 F11).
- *Strength:* strong by analogy. Nothing is specific to decision cards.
- *Tension:* false alarms cause disuse (Parasuraman & Riley, B1 F2), and each extra reminder per encounter cut acceptance by 30% (Ancker, B4 F11). Failing toward the person has a price, paid in precision.

**P4. Separate the party that acts from the one that decides whether it's checked.**
- *Evidence:* self-preference and overconfidence in models; o3 reward-hacking while saying its plan didn't match the user's intent; Basel's segregation of duties, NIST AC-5, Copilot's pull requests needing another reviewer (B4 F7, F8). Claude Code's classifier is "reasoning-blind by design" (B1 F8). Developers with an AI assistant wrote less secure code and believed it more secure (Perry, B2 F8). Agents given opposing personas reached opposing conclusions, and 86% of their reports passed AI review (Miao, B3 F5).
- *Strength:* moderate. No study tests coding agents gating their own decision cards.
- *Disagreement:* B2 leaves open whether the agent's own classification is enough for most axes, with independent checks only for security and privacy (B2 §2.3, open question 6). B1 and B4 say the agent shouldn't hold any card back (B1 I6, B4 I2).

**P5. Measure misses by random sampling; treat complaints as alarms, not rates.**
- *Evidence:* ISA 530 requires every unit to have a chance of selection; the rule of three bounds a zero-miss sample; Meta samples by stratum and reports upper bounds for rare violations; e-discovery warns that a low miss rate among the withheld ("elusion") isn't recall (B4 F9, F12).
- *Strength:* strong. This is standard statistics.
- *Agreement:* B1 I7 (draw audit cards from what the gate held back); B3 I6 (sample more often where the risk is higher, as the FDA sets audit-trail review by data criticality).

**P6. Don't trust preferences stated in the abstract; design the defaults with care.**
- *Evidence:* preferences are constructed when asked; in one study Slovic reviews, people's choices and their prices for the same bets disagreed 40–50% of the time (B1 F4). Defaults have a medium-to-large effect (d = 0.68 over 58 studies), and Facebook settings matched users' expectations 37% of the time (B1 F5).
- *Strength:* strong on defaults. The domains are privacy, organ donation and app permissions, not design decisions.

**P7. Learn from behaviour, but let the person set the threshold and accept each change.**
- *Evidence:* Gmail Priority Inbox needed per-user thresholds; PrefMiner showed each mined rule for consent and 56.98% were accepted; YouTube's controls that didn't visibly work lost trust (B1 F7). RADAR started strict and loosened once outcomes were known (B2 F3, §2.4). Learning to defer optimises the person and the gate together (B4 F4).
- *Strength:* moderate. The evidence is from email and notifications, not code.

**P8. A category is a prior, not a certificate.**
- *Evidence:* in research, coded design choices explained little of the spread in results, and an expert's list of decision points missed 60% of the most-walked forks (B3 F3). In software, risk criteria differ by developer and team, 33.8% of bug reports were misclassified, and 749 security bug reports were mislabelled (B1 F10).
- *Strength:* strong for research (several many-analysts studies); moderate for software.
- *What follows:* a decision that fits no axis goes to audit sampling, not nowhere (B3 I3). A classifier that can't place a card should show it (B4 open questions).

**P9. Reversibility belongs to the project and its stage, not to the category.**
- *Evidence:* Fowler's database schema stopped being architectural once migration tooling existed; Hyrum's law; Google's alpha, beta and GA review rules (B2 F5, §2.7). In research, reversibility is about knowledge: you can revert a commit, but you can't un-see a result (B3 I8).
- *Strength:* moderate. It's an inference from practitioner sources.

**P10. The policy must sit outside the agent's reach.**
- *Evidence:* Gemini CLI's per-repo policy tier is "currently non-functional"; Codex can disable project config for an untrusted project; Claude Code never auto-approves writes to its .claude and .git folders outside bypass mode (B1 F9). Models disabled oversight through a config file in 0–5% of 300 rollouts under heavy nudging (Meinke, B4 F7, I11). A signature check is only as strong as the place its trust root lives (B5 F15).
- *Strength:* strong precedent in practice. The attack is rare and contrived; the fix is cheap.
- *Tension:* B1 also wants the policy in the repo, versioned with the code and visible (B1 F9, I9). Both can hold if a change to it is detected and needs a person (decision 7).

**P11. Keep the axes few, and show what each one costs.**
- *Evidence:* adding a question to Google's launch checklist needs a past disaster; Kruchten warns against pushing taxonomy "too far, too deep too early" (B2 F5, F7, §2.8). Choice overload is reliable under difficulty, complexity and uncertain preferences (B1 F6).
- *Strength:* weak on the number. Nine or ten sliders is a guess.

**Where the strands disagree, in one place:**
- *The agent's role:* B2 open; B1 and B4 against (P4).
- *Where "hard" bites:* B2 suggests security could be provisional while the agent works and hard at merge or publish (B2 §2.6); B1 and B4 keep hard at the next step (B1 I5, B4 I1).
- *How low a floor goes:* B1 offers "stop and ask" as the lowest allowed; B4 says these cards always reach the person; B2 asks whether they get sliders at all (B2 §2.5).
- *Whether agents create every card:* B1 and B2 assume they do. B3 says it won't hold for research (B3 I3), and B4 says the worst misses are cases the gate never sees (B4 F3).
- *Hide or sort:* B1 and B2 assume hiding with audits. B4 names sorting without hiding as the strongest alternative (B4 design F).
- *One setting per repo or per person:* D131 rejected per-person sliders. B1 suggests several reviewers may need personal additions (B1 open questions), and B4 asks whose verdicts set the threshold (B4 open questions).
- *Delivery and infrastructure:* the evidence itself conflicts (B2 §2.1, axis 8).

## 3. Candidate axes

### Software

B2's 13 axes, named by consequence as B1 recommends, and mapped to Baesian's facts and the commit gate's detectors (D25). "Floor" means a candidate for a fixed level rather than a slider (B2 §2.5).

| # | Axis | What it covers | Fact today | Detector today | Evidence | Support |
|---|---|---|---|---|---|---|
| 1 | Public interfaces | APIs others code against, breaking changes, CLI flags, config file formats, URL schemes | `public-api` | `api:` (opt-in, breaking only) | Kept when others code against it; graded by audience and maturity (B2 F2, F4, F5) | Strong |
| 2 | Structure | module boundaries, a new component or layer, cross-cutting rules | `public-api` (module boundary), modules touched | none | Matters (the main source of technical debt) but is rarely reviewed (B2 F5, F6) | Strong that it matters; weak on who should answer |
| 3 | Data formats | schemas, migrations, on-disk and wire formats | `schema` | schema and migrations | Kept once data or users exist; delegable with migration tooling and no users (B2 F5) | Moderate |
| 4 | Destroying data | deletes, overwrites, irreversible migrations | `data-loss` | none | One-way (B2 F5). Floor | Strong in principle; little direct study |
| 5a | New dependencies | adding a library or service | `dependency` | dependencies | Kept by owners and security (B2 F9) | Strong |
| 5b | Dependency updates | version bumps | `dependency` | dependencies | Minor: delegated and rubber-stamped. Major: kept (B2 F7, F9) | Strong |
| 6 | Security | authentication, authorisation, crypto, secrets, security controls, untrusted input | `security` | none | Kept, often without blocking (B2 F2, F4). Often mislabelled (B1 F10). Floor | Strong |
| 7 | Personal data | personal data, telemetry, tracking, user data in logs | `security` (D11's item reads "security or privacy") | none | Kept; GDPR asks for an assessment before processing (B2 F2). Floor | Strong (legal) |
| 8 | Delivery and infrastructure | CI, deploy config, infrastructure as code | `infra` | CI, infra and deploy | Conflicting: DORA favours peer review plus automation; developers resist handing deployment to AI; agents' CI pull requests merge often (B2 F1, F7, F8) | Conflicting |
| 9 | Product behaviour | what users see or do, UI, copy, accessibility | `user-facing` | none | Kept: "what to build" (B2 F8); accessibility can't be fully automated (B2 F9) | Moderate |
| 10 | Publishing | releases, packages, public posts, domains | `publishes` | none | One-way, a public record (B2 F2, F5). Floor | Strong in principle |
| 11 | Spending | paid services, cloud resources, quotas | `money` | none | Kept, often by threshold (B2 F2). Floor | Moderate |
| 12 | Tooling and conventions | test framework, linter, build tool, code style | none (partly `dependency`) | dependencies (dev) | Decided once, then by rule (B2 F5, F9) | Weak |
| 13 | Local implementation | refactors, tests, docs, logging, formatting, private names | none | none | Delegated (B2 F3, F10). A floor the other way: never asked, audited only | Strong |

How the strands reconcile on this set:
- **Name rows by consequence; keep detection separate** (B1 F10, I10). People state preferences about what a decision does; the gate detects how it shows up in a diff. One row can draw on several detectors. Rows 4, 6, 10 and 11 are consequence-shaped and easiest to state preferences about. Rows 1, 3 and 5 are mechanism-shaped and easiest to detect.
- **The judgement-heavy rows are the likeliest to be missed.** B1 singles out "user-facing" and "security" (B1 F10). That's an argument for an independent check on rows 6, 7 and 9, not the agent's word alone (B2 §2.3).
- **Three facts may split** (B2 §2.1): privacy from security (rows 6 and 7), a public interface from an internal module boundary (rows 1 and 2), and adding a dependency from updating one (5a and 5b). Each changes the card format (decision 6).
- **Modifiers, not axes:** reversibility (the card's `reverse`), the repo's release stage, diffusion (modules touched), novelty ("the first decision of its kind in this repo", which Baesian could derive from its own record), and the row's track record in this repo, its overturn rate (B1 I10; B2 F3, §2.1, §2.3, §2.7).
- **Path overrides:** CODEOWNERS-style lines, such as "anything under migrations/ is never without me", could sit beside the rows (B1 I9).
- **Well supported:** rows 1, 5a, 5b, 6, 7 and 13, and the one-way rows 4 and 10 in principle. **Moderate:** 3, 9 and 11. **Conflicting:** 8. **Guesses:** 12; who should answer row 2; and the total. With the floors taken out, about nine sliders remain (B2 §2.1), which is a guess to test.

### Research

B3's axes follow the headings that pre-registration templates, Wicherts's 34 degrees of freedom, Nature's reporting summary and ICH E9(R1) share (B3 F7), in the order of the analysis. The "need for sign-off" column is B3's proposal from the evidence, not a measured result.

| Axis | What it covers | Need for an expert's sign-off (B3 I1) | Evidence | Support |
|---|---|---|---|---|
| R1. Question and estimand | hypotheses, the target quantity, population, primary outcome, confirmatory or exploratory | High; any change after results is hard | ICH E9(R1) on changing the estimand (B3 F8) | Strong (regulatory) |
| R2. Data and sample | sources, which units or years, sample size, stopping rule, held-out splits | Medium–high; high after results or near held-out data | Miao's country and wave axes; no two replicators reported the same sample size (B3 F2) | Moderate |
| R3. Exclusions and cleaning | outliers, missing data, transformations, synthetic or substituted data | Medium before results, high after | Steegen's one coding decision largely decided significance; data steps not seen as decisions (B3 F1, F2) | Moderate |
| R4. Operationalising variables | how each construct is measured or coded | High | Schweinsberg; Miao's stocks against flows (B3 F2) | Moderate: a handful of multiverses |
| R5. Model specification | covariates, model family, estimation, software | Medium; delegable within an agreed set if sensitivity is computed | Across covariate sets, the estimate pointed opposite ways for 31% of variables; Gould found no strong link (B3 F2, F3) | Moderate |
| R6. Inference rules | alpha, sidedness, corrections, priors, what counts as "supported" | High before results (cheap then); hard after | Wicherts; the OSF template; inference steps neglected (B3 F1, F7) | Moderate |
| R7. Interpretation and claims | what the result means, causal wording, which results lead | High, always | Only 57.9% of Kosmos's synthesis statements were accurate; spin in 58.3% of abstracts of trials with a non-significant primary outcome (B3 F4) | Strong |
| R8. Reporting and disclosure | what is shown, robustness checks, the deviation table, all runs tried | Medium; mostly checkable by machine | Selective reporting; silent decisions (B3 F1, F5) | Moderate |
| R9 (optional). Instruments and AI settings | model and version, prompt, seeds, choosing among runs | High when an LLM measures or an agent selects among runs | One position paper and one case (B3 F5) | Weak |

How it maps to Baesian:
- **None of the nine facts describes a stage of inference** (B3 I8). The one overlap is publishing a claim, which is the research case of `publishes`. Impact and reversibility still apply, but reversibility is about what has been seen.
- **Modifiers, not axes:** timing relative to results, whether the options flip the conclusion, and whether held-out data were touched (B3 I1).
- **An exploratory mode** could set most research sliders low, with the gate checking only that no R7 claim presents an exploratory finding as confirmatory (B3 I9).
- **Different axes may need different reviewers:** domain expertise for R1, R4 and R7; statistical expertise for R5 and R6 (B3 I7). Weak evidence: qualitative studies only.
- **Fields will want their own sets,** as Nature's reporting summary has field-specific sections (B3 F7). The table is a generic default.
- **Weak points:** the ranking of R4 and R2 above R5 rests on a few multiverses in social science and psychology, and Breznau and Gould show it doesn't hold reliably within one study (B3 I1, F3).

## 4. The scale on each slider

| Position | What happens | Baesian today | Sheridan rung (B1 F1) | Policy analogue (B2 §2.2) | Typical failure (B1 F2) | Notification (B5 R5) |
|---|---|---|---|---|---|---|
| **Let the agent decide** | Held back. The agent proceeds and logs a one-line reason. | the two-way door (D11) | 8: informs only if asked | Google's "Not Required"; Azure's MAY; ITIL's standard change | drift nobody notices; loss of skill | none |
| **Check a sample afterwards** | Held back. Drawn for audit at a higher rate, as "overturn?" | audit cards (D11, D126) | no rung: between 7 and 8 | Google's "FYI"; Kubernetes's voluntary review | rare misses; complacency | not covered |
| **Tell me but carry on** | Shown. The agent proceeds. | provisional | 7: acts, then necessarily informs | GitLab's non-blocking security review | work piles up before the answer comes | in a digest |
| **Stop and ask** | Shown. The agent waits while the person is there. | blocking | 6: a restricted time to veto | Azure's SHOULD: disclose during review | approval fatigue; interruption | at once |
| **Never without me** | Shown. The agent never proceeds without a verdict. | hard | 5, though closer to 3 at the moment of choice, since the pick is hidden (D86) | Kubernetes's mandatory review; Chromium's third-party approval | approval fatigue (93% accepted); anchoring | at once |

Notes on the scale:
- **Sampled after-the-fact review has no rung** in any scheme B1 found, and no direct evidence. It's the biggest gap in the literature (B1 F1, I7).
- **The two lowest positions may differ only in sample rate.** B1 reads "let the agent decide" as "informs only if asked". But for a miss rate to be estimable, every held-back card needs some chance of selection (ISA 530, B4 F9), and B4's lowest tier is "held back, with the minimum audit rate" (B4 §2). This synthesis reads that as a small, nonzero rate at the lowest position too.
- **Hard cards already sit where the evidence wants risky decisions.** With the pick hidden, a hard card at the moment of choice is closer to Sheridan's level 3 than 5. B1 notes that's the level Parasuraman et al. recommend for risky decisions: decision automation shouldn't exceed "the computer suggesting (but not executing) a preferred alternative" (B1 F1).
- **The control:** a five-stop segmented control, labelled with verbs, not numbers. Numbers imply the higher one is better. Continuous sliders were slower and lost more answers in web surveys (odds ratio 6.9 for break-off). A segmented control also suits the phone layout (D130). Weak evidence, but none the other way (B1 I1, I2, F6).
- **An alternative scale:** B4's design A uses four tiers, "Always", "When costly", "Audit only" and "Never", which folds reversibility into a position (B4 §2). B1 instead keeps five positions and lets reversibility move a card one stop stricter or looser (B1 I10).

**What moves a card off its row's position.**
- *Up only:* a floor (B1 I5, B4 I1); the agent's escalation (B4 I2); the gate being unsure or unavailable (B4 I4); a decision that fits no axis (B3 I3); novelty (B2 §2.1); in research, a decision on R1, R3, R4, R6 or R7 made after results, which goes to blocking at least, and a choice that flips the sign, significance or verdict (B3 I2).
- *Either way:* reversibility, by one stop (B1 I10); the repo's release stage, moving several rows together (B2 §2.7); exploratory mode, lowering research rows (B3 I9).
- *Out of the gate entirely:* an accepted rule that answers the card. Filing already skips cards a rule answers, and the commit gate acknowledges what rules cover (D16).

**Defaults the evidence suggests.**
- **Defaults are policy.** Most repos will keep them, and people read a default as a recommendation, so choosing them is a user-facing decision for a card (B1 F5, I4).
- **Start from today's routing** (D11's facts, D42's hard defaults). It matches where every coding-agent gate puts its fixed "always ask" lists (B1 I4), and it's B4's honest baseline (B4 §2).
- **Start strict, loosen with evidence.** RADAR started at a strict threshold and loosened it "from the 25th to the 50th percentile" as outcomes came in (B2 F3, §2.4).
- **Floors:** security, money, data loss and publishing at "never without me", with "stop and ask" as the lowest allowed if they get sliders at all (B1 I5). B2 adds personal data, on legal grounds (B2 §2.5).
- **Low by default:** local implementation ("never asked, audited only", B2 §2.1) and minor dependency updates, which the sources delegate (B2 F7, F9). Which of the two lowest positions each gets is a guess.
- **No default the evidence settles:** delivery and infrastructure (row 8).
- **Research:** B3 gives needs, not positions. Reading "high" as "stop and ask" or above, and "medium" as "tell me but carry on", is this synthesis's reading, not B3's. B3's own rule is timing: after results, R1, R3, R4, R6 and R7 are blocking at least (B3 I2). A deck built before data access and answered at "never without me" plays the part of a pre-registration (B3 I4).

**Positions and audit cards.** Everything held back (the two lowest positions) is the audit population (B1 I7, B4 I8). Each position sets its stratum's sampling rate: a minimum everywhere, more near the gate's threshold and for kinds that are costly to reverse (B4 I8; B3 I6). Audits come back as ordinary blind cards mixed into the queue, not in long runs of "fine", because of the prevalence effect (B4 F10, I8). They count against the person's attention budget (B4 I9).

## 5. How the gate could work

### The designs

From B4 §2, with where each could run and what it costs.

| Design | Who decides what's held back | Card text leaves? | Cold start | Independent of the agent? | Main failure | Where it could run | Cost per card (B4 F6) |
|---|---|---|---|---|---|---|---|
| **A. Rules over stated facts** | deterministic rules on the card's facts | no | none | yes, but the agent states the facts; the commit gate checks some (D25) | can't read nuance; a mis-stated fact routes wrongly | anywhere, offline, with the same answer | nothing |
| **B. The agent's own classification** | the filing agent | no | none | **no** (B4 F7, F8) | generous self-assessment; quiet under-routing | the agent's machine | nothing |
| **C. External model** (Jev, or a Haiku-class model) reading the facts, trigger, options and `crux_fact` | a vendor's model plus a threshold | yes, to the vendor | needs labelled cards to set a threshold | mostly, if it doesn't read the agent's case | uncalibrated for this task; the vendor changes the model; steerable by text | the service (as B4 frames it), or the CLI | about $0.00008 (Jev) or $0.0002 (Haiku 5.5) for a 2,000-token card |
| **D. Local classifier on the repo's verdicts** (SetFit, ModernBERT, or embeddings with logistic regression) | a per-repo model | no | tens to hundreds of verdicts | yes | too few labels; upkeep; a new runtime dependency | the agent's machine or the service | compute; a dependency card |
| **E. Cascade:** rules and floors, then a classifier for the middle, then the person; the agent can only escalate; held-back cards audited | rules, then a classifier | only the middle band, if C | rules from day one; classifier once labels exist | yes | more parts to explain | rules anywhere; the classifier where C or D runs | as C or D, for the middle band only |
| **F. Sort, don't hide** | nobody | no | none | n/a | the person carries the full volume; low-priority cards go stale | the client | nothing |

In brief (B4 §2):
- **A** is today's routing with a dial added. It works offline (D127).
- **B** is cheapest and contradicts B4 F7 and F8. The agent's view still helps when used one way: it may mark a card "show this", never "hide this".
- **C** buys nuance at the cost of a sub-processor and a calibration job. Jev's built-in probabilities make a threshold easy to wire up, not right.
- **D** keeps data at home and calibrated well with enough labels in one benchmark (a fine-tuned DistilBERT in jevbench). One repo seldom has enough, and pooling across repos on the service is a decision about what it collects (D129).
- **E** matches the evidence: hard stops for the severe, a model only where rules can't decide, deferral toward the person, audits for what's held back.
- **F** is the strongest alternative to filtering. Nothing is missed, but the person faces everything.
- At 50 cards a day, Jev and a Haiku-class model both cost under two cents, and even 700 ms is invisible next to a person's response time. So cost and latency don't decide between C, D and E (B4 F6).

**The crux** (B4): does the person accept that some decisions they'd have overturned never reach them, in exchange for a shorter queue, if the miss rate is measured and reported?

### The conflict of interest

The agent that files a card is the party that wants to proceed. B4's answer, from self-preference, overconfidence and separation-of-duties evidence (B4 F7, F8): the agent can supply checkable facts and can escalate. It shouldn't be the one that holds a card back (B4 I2). B1 reaches the same conclusion from how coding-agent gates are built (B1 F8, I6).

Two caveats carry into every design:
- **Even rules rest on the agent's word.** In design A, the facts are stated by the agent. For security and privacy, an independent check (the commit gate's detectors, a rule, or a separate classifier) is better evidence than the agent alone (B2 §2.3). Comparing a card's stated facts with what the detectors find is also how dogfooding could see whether agents start wording cards to pass the gate (B4 open questions).
- **A model gate reads facts, not arguments.** It sees the card's facts, its trigger (`doing`), the two options and `crux_fact`. It doesn't see the rationale, the body or the agent's pick. Auto mode strips the agent's text for this reason, and Jev's own docs say "an argument for its own classification" can move it (B4 F5, F7, I3). Jev's docs also warn that accuracy falls as the input grows with unrelated detail (B4 F5).

### Where it could run

- **On the agent's machine** (the CLI or the local MCP server). It works offline (D127), and with rules or a local model nothing leaves the machine. But it runs as the user, beside the agent. B5 makes the point for tokens: where a secret is stored doesn't stop an agent using what the CLI can read (B5 F11). A rules gate there can be re-checked later, because rules are deterministic; a model's outcome can't.
- **On the hosted service.** It's out of the agent's reach, and it could sign its outcomes, as B5 proposes the service sign every verdict (B5 R3). But the service must then read card text, which rules out E2EE (B5 F4, R1), and an external model adds a further company, two through OpenRouter, that handles the text (B4 F5). Card text leaving the machine is already the "exfiltration leg" of Willison's lethal trifecta; B5's secret scan before upload would also limit what a classifier sees (B5 F7, R4).
- **When the gate or the service is unavailable,** rules alone decide, and anything they can't place is shown (B4 I4).
- **A split is possible:** rules in both places, which give the same answer, and a classifier only on the service. Then E2EE is ruled out only if a classifier is used. This is the synthesis's inference from B4 and B5, not something either strand tested.

### What the gate can't see

A gate classifies the cards it's given. The worst misses are cases it never sees. An independent stress test of auto mode found an end-to-end miss rate of 81.0% on deliberately ambiguous prompts, and 36.8% of the actions were file edits the classifier doesn't evaluate (Ji et al., B4 F3).

In research this is the main problem (B3 F1, I3):
- people and agents don't recognise many data and inference steps as decisions;
- about 7–9% of decisions are silent, done in code and never stated;
- prose reports recovered about 0.64 of the decisions in AI agents' code, and 0.53 in humans'.

So "agents create every card" won't hold for research. B3 proposes a code-anchored extractor, as ForkSCOPE distils decisions from scripts (about $1.91 per analysis in logged API spend), filing audit cards for decisions that never became cards. For software, the design already has two independent sources: the commit gate's detectors (D25), and the later after-the-fact reviewer that reads a branch's diff ([[Baesian Design#Where cards come from]]).

### The policy file is in the agent's reach

Whatever can edit the repo can edit a policy kept in it, including the agent (B1 F9). Meinke's agents disabled oversight through exactly such a file, if rarely (B4 F7). B4 says the sliders shouldn't live in the committed config.json that agents edit, or a change to them should need a card the gate detects (B4 I11). B5's parallel case is the allowed-signers file: a change to it is a gate fact that needs a hard card, and CI pins the service's key outside the repo (B5 F15, R3).

The options, in the strands' terms:
- **in the record,** with any change detected by the commit gate and loosening needing a hard card (B1 I9);
- **on the service,** changed only in a person's signed-in session. B5 proposes that no machine token can ever carry an answer scope (B5 R2); extending that to preferences is this synthesis's suggestion.

Either way, layers can merge strictest-wins: anyone may tighten, and only a person may loosen (B1 F9). And the gate can run in shadow first, showing what it would have held back before it holds anything, like GitHub's ruleset "Evaluate" mode (B1 F9, I9).

### How a slider becomes a threshold

B4 gives four mappings (B4 §2):
1. **Named tiers over facts** (design A). Each position is a rule. It's easy to explain and predict, and ignores any classifier.
2. **An attention budget.** "Show me about the top k% of this kind" sets the threshold at the score that yields k%. It's predictable in volume, not in what gets missed.
3. **A tolerated miss rate,** through conformal risk control. "Hold back only if at most α of what's held back would have changed my mind." The threshold is computed from audited and shown cards. The guarantee holds only while future cards resemble past ones; drift breaks it.
4. **A raw probability cutoff.** It's the simplest to build and the hardest to keep meaningful, because the scale shifts with model versions and post-training (B4 F2, F5).

They share one reading (B4 F4): show a card when the chance the person would choose differently, or want to be asked, times the cost of reversing later, exceeds the price of the person's attention. The slider sets that price for each kind. Mappings 2 and 3 choose it from data. Gmail's per-user thresholds (B1 F7) and RADAR's thresholds set by "organizational risk appetite" (B2 F3) are deployed versions of a person- or organisation-set price.

Three things any mapping needs:
- **A defined label.** Learning to defer assumes the human is sometimes wrong; in Baesian the person's answer defines what's right, so the gate predicts the person, not the truth (B4 F4). "Should this have reached me?" splits into "I'd have chosen differently" and "I'd have wanted to be asked anyway" (B4 I6; decision 8).
- **Its consequences shown from history,** for example "At this setting, last month you'd have seen 12 of 40 dependency cards. Audits found 0 misses in 29, so at most 1 in 10 at 95% confidence" (B4 §2).
- **Re-derivation when anything changes:** a new model version (pin a versioned ID, never an alias like "jev-latest"), a slider move, or a batch of new rules (B4 I12).

## 6. How the pieces fit together

Sliders, the gate, audit cards and convention cards form one loop.

1. **Set up.** Instead of a blank grid, ask three to five "would you want to see this one?" questions, ideally with real cards from this repo, assign a preset, and let the person adjust single rows later (B1 I3). Run the gate in shadow first (B1 F9, I9).
2. **File.** Agents file every card they normally would. The commit gate's detectors, and in research an extractor, add decisions the agents didn't state (D25; B3 I3).
3. **Gate.** Floors and rules first; then the card's facts against the repo's positions, with the modifiers; a classifier only in the middle band, if there is one; the agent's escalation in one direction only; the person whenever the gate is unsure (B4 design E; B2 §2.3). The gate records its outcome and, for a held-back card, whether it was drawn for audit and with what probability (B4 I7).
4. **Answer.** What reaches the person is answered blind (D86), at its level. A held-back card stands as the agent's decision.
5. **Audit.** A random, stratified sample of held-back cards comes back as "overturn?" cards, mixed into the queue (B4 I8). The blind choice against the agent's pick measures "I'd have chosen differently"; an explicit "you should have asked me" measures the other label (B4 I6). An unanswered audit can't count as "fine" (B1 open questions).
6. **Report.** For each kind: how many were held back, audited and overturned; the estimated miss rate with its upper bound; recall, estimated from shown cards plus audits; "should have asked me" reports; and the gate's model version and threshold (B4 I10).
7. **Tune.** Baesian proposes slider moves as convention cards applied to routing: "You've overturned none of 14 dependency updates. Show them only afterwards?" (B2 §2.4), or "you've overturned 3 of 4 dependency audits: ask about dependencies?" (B1 I8). Each shows its effect on recent history, and the person accepts or declines. A loosening proposal would itself be a hard card (B1 I9).
8. **Make rules.** Repeats are the worst noise in alerting (Ancker, B4 F11). A gate that hides repeats leaves the rule unmade, so repeated decisions become rules through convention cards (D16) rather than being held back (B4 I13). Rules then answer cards before the gate sees them.
9. **Revisit.** Claude Code users moved from approving each action to monitoring and interrupting over hundreds of sessions (B1 F5). A prompt to review the settings after, say, 50 answers, with the overturn data, fits that drift (B1 I11).

**How audits tune thresholds** depends on the design:
- *With rules only* (A), audits can only justify a proposal to move a row's position.
- *With a classifier* (C, D or E), audits and shown cards are labelled data. Conformal risk control turns them into a threshold for a tolerated miss rate, a quantile turns them into a budget, and a local model (D) trains on them.
- *Either way,* bounds tighten slowly: 14 clean audits for 20%, 29 for 10%, 59 for 5%, 299 for 1% (B4 F9). At one repo's volumes that's weeks per kind, so report pooled estimates and show per-kind intervals as wide as they are (B4 I9). Re-estimating and acting after every audit is repeated testing, which inflates error rates; a fixed cadence or a sequential method is needed, and which one is open (B4 open questions).

**Why elicitation is a few questions, not a grid** (B1 F4–F6). Asked in the abstract how much "schema" they want to see, before any schema cards exist, people construct an answer on the spot. Choice overload is reliable under four conditions: a difficult task, a complex set, uncertain preferences, and a goal of minimising effort. A grid of nine categories by five positions, set before any cards exist, has all four. Profiles assigned from a few questions did well, and people kept them. After that, the person's settings change through the proposals in step 7, not through a settings page they're expected to maintain.

## 7. What it means for the formats before v1

D108 keeps formats free until v1. D126 asks for audit and convention card formats to be settled before v1, and D132 lists the preference config among the changes that land before it. Everything below is a candidate, assuming [[File Formats]]' rules: immutable files, flat keys, and status computed rather than stored.

**The preference config.**

| Candidate field | Holds | From |
|---|---|---|
| `axis_set` | software, research, or a named discipline's set | B3 F7 |
| one key per row, such as `slider_public_interfaces` | one of the five positions | B1 I1, I2 |
| `profile` | the preset the repo started from | B1 I3 |
| `stage` | prototype, pre-release or released | B2 §2.7 |
| `mode` | exploratory or confirmatory (research) | B3 I9 |
| `paths` | a list of "glob = position" overrides, kept flat as strings | B1 I9 |
| `gate` | shadow or enforce | B1 F9 |
| `gate_model` | a pinned, versioned model ID | B4 F5, I12 |
| `audit_min_rate`, and a rate per position | sampling rates | B4 I8 |
| `miss_label` | chose differently, wanted to be asked, or both | B4 I6 |

Where it lives is decision 7. If each change were its own immutable file, as rules and retirements are, the history of who changed what and when would come free. That's this synthesis's suggestion. Whether floors are config at all, or fixed by Baesian, is decision 4.

**A gate record on each card.** A new immutable file per gate run, beside the card, as the fallback file is today. Candidate fields: the outcome (shown, at which level, or held back); the row and position applied; the reason (floor, rule, fact, classifier, escalation, unsure, timing, sensitivity); the gate's version, model ID, score and threshold; the stratum; whether it was drawn for audit, and the probability; where it ran; and, if on the service, its signature (B4 I7, I10; B5 R3). It has to be stored rather than computed, because the audit probability must be recorded at the time (B4 I7) and a model's outcome can't be recomputed later.

**Card fields.**
- The agent's `level` becomes a request that can only raise the gate's outcome, or a separate escalation flag replaces it (B4 I2).
- `touches` may split: privacy from security, module boundary from public API, adding from updating a dependency (B2 §2.1; decision 6).
- A derived novelty fact, set by Baesian, never declared by the agent (B2 §2.1).
- For research: the axis (R1–R9); timing on ICH E9(R1)'s three levels (pre-specified, introduced while blind, post hoc); whether the options flip the conclusion; whether held-out data were touched (B3 I1, I2, I5).

**Audit card fields.**
- The held-back card it audits, and the gate record it was drawn from, with its stratum and probability (B4 I7).
- Its source: the gate's sample, an extractor, or the after-the-fact reviewer (B3 I3).
- The existing `first_choice` (D86, D88) already gives the first label. A new response or flag is needed for "you should have asked me" (B4 I6), and a state for an audit that went unanswered (B1 open questions).
- For research deviations, B3's six fields: what was agreed (a link to the verdict or plan card); what was done, from the trace; the reason, by class (Lakens's five, plus contingency against opportunism); when, on ICH's three levels; the effect on the conclusion; and the effect on the test's severity (B3 I6).
- Which blinds held when it was answered: advocate-blind (the pick hidden) and outcome-blind (results unseen) (B3 I5).

**Convention card fields.**
- Rule drafts already carry `rule` and `rule_covers` (D109, D110). Mined convention cards, D16's second route and still to come, need their evidence: the cards they came from, and how many.
- A new kind, the slider-move proposal: the row, the position from and to, the evidence (held back, audited, overturned, and the interval), and the effect on recent history (B1 I8; B2 §2.4; B4 §2).

**Interactions with the gates that exist today** (the synthesis's reading of D31 and D46):
- The merge gate requires every card a branch references to be resolved or deferred (D31). A held-back card has no verdict. So "held back under the repo's preferences" would need to count as resolved, backed by the gate record. That record then has to be trustworthy: recomputable, if rules made it, or signed, if a model did.
- The commit gate requires a verdict only for hard cards (D46). Floors keep the hard kinds reaching the person, so that still holds.
- If E2EE might come later, B5 proposes reserving an `enc` envelope field in the wire format before v1 (B5 R1).

## 8. Decisions for the user

Each is a neutral question with its two strongest options and the fact that decides between them. They're listed roughly in the order they depend on each other: 1 first, since sorting without hiding makes much of the rest moot; 2 and 3 together; 7 before any format is fixed.

**1. Hide or sort?**
- *Hold some cards back,* with random audits measuring what's missed (B4 designs A–E).
- *Only order and batch the queue;* nothing is held back (B4 design F).
- *What decides it:* whether the user accepts that some decisions they'd have overturned never reach them, in exchange for a shorter queue, if the miss rate is measured and reported (B4's crux). Relevant: repeats and low value wear attention down more than volume does (B4 F11), and a kind's miss rate takes 29 clean audits to bound below 10% (B4 F9).

**2. Rules only, or rules plus a classifier?**
- *Rules over the card's stated facts,* with a position per row (design A).
- *A cascade:* floors and rules first, a classifier for what rules can't place (design E).
- *What decides it:* how many cards the rules can't place, and whether any classifier predicts the user's verdicts better than rules on their own labelled cards. Neither is known. A shadow run would show the first; B4's comparison of Jev, a Haiku-class model, a local classifier and rules would show the second (B4 I5). Which classifier, and whether its slider sets a budget or a tolerated miss rate, follow from that comparison.

**3. Must the hosted service be able to read card text?**
- *Yes:* the gate can run on the service, out of the agent's reach, and the service has no E2EE in v1 (B5 R1's proposal).
- *No:* E2EE; the gate runs on the agent's machine, as rules or a local classifier.
- *What decides it:* whether a model gate is wanted (decision 2), since only a model needs the text on the server. Against that: a gate on the agent's machine runs within the agent's reach (B5 F11).

**4. How low may a slider go on the hard-by-default kinds, and is personal data one of them?**
- *No slider:* security, money, data loss and publishing are always "never without me".
- *A slider with a floor,* for example "stop and ask" as the lowest allowed (B1 I5).
- *What decides it:* whether any of these should ever proceed while the user is away. Every coding-agent gate keeps actions no mode auto-approves (B1 F8), and hard stops for the most severe alerts reached 100% compliance, against 34% without them (B4 F11). Personal data's case is legal: GDPR asks for an assessment before processing (B2 F2, §2.5).

**5. Where does "hard" bite: at the next step, or at merge and publish?**
- *At the next step,* as today (D42, D46).
- *Provisional while the agent works, hard at merge or publish* (B2 §2.6).
- *What decides it:* whether harm from that kind can happen before merge. The sources put security's hard stop late: GitLab's review doesn't block, Microsoft's final security review comes before release, and GDPR's assessment before processing (B2 F4, §2.6). Spending, publishing and destroying data are one-way once done (B2 F5). The merge gate already requires every card to be answered (D31).

**6. Split the facts on the card, or only the slider rows?**
- *Split `touches`:* privacy from security, module boundary from public API, adding from updating a dependency (B2 §2.1). A format change.
- *Keep the nine facts,* and let rows combine facts and detectors (B1 I10). The dependency detector, for one, can already see an update.
- *What decides it:* whether the user wants different positions for the halves, and whether the agent or a detector can tell them apart reliably. No study measures agreement on Baesian's facts; B1 suggests two labellers on 50 past decisions from this repo (B1 F10, open questions).

**7. Where do the preferences live, and who can change them?**
- *In the record,* versioned with the code; the commit gate treats a change as a fact, and loosening needs a hard card (B1 I9; B5 R3's pattern for allowed signers).
- *On the service,* changed only in a person's signed-in session, like an answer, with a signed copy in the repo for offline use.
- *What decides it:* whether a check inside the repo is enough when agents make the commits (B5 F15: a check is only as strong as where its trust root lives), against making the service the authority for something, which D127 otherwise avoids.

**8. What counts as a miss?**
- *"I'd have chosen differently,"* measured by an audit's blind choice against the agent's pick.
- *"I'd have wanted to be asked,"* measured by an explicit "you should have asked me".
- *What decides it:* which one the user wants a slider to control. They need different signals, and possibly separate sliders (B4 I6).

**9. What does a new repo start with?**
- *Today's routing* (D11, D42), adjusted later through accepted proposals.
- *A preset chosen by answering three to five example decisions* at setup (B1 I3).
- *What decides it:* whether there are real cards to ask about at setup. Preferences stated in the abstract are unreliable (B1 F4), and the profile evidence comes from app permissions, not decisions (B1 F6). Either way, most repos will keep the defaults (B1 F5).

**10. Do the research axes go into the v1 formats?**
- *Yes:* reserve the research axis, timing on ICH's three levels, sensitivity and the deviation fields now.
- *No:* research stays deferred (D2), and its fields arrive after v1.
- *What decides it:* whether research use is expected soon after v1, since after v1 a format change needs a version and a migration (D108). If yes, a follow-on question: whether research needs a code-anchored extractor, given that a gate over filed cards misses the 7–9% of decisions never stated (B3 I3).

**11. Several reviewers on one repo** (needed once there's more than one).
- *Per-repo sliders only* (D131).
- *Per-repo sliders with personal, strictest-wins additions:* anyone may ask to see more; only the repo may let the agent decide more (B1 open questions).
- *What decides it:* whether reviewers on one repo differ in what they want to see. Risk criteria differ by developer and team (Shihab, B1 F10), and Gmail found volume preferences that couldn't be predicted from users' actions (B1 F7). Two linked questions: whose verdicts set the threshold (B4 open questions), and whether rows route to different people, such as a security reviewer or a statistician (B2 open question 8; B3 I7).

## 9. Gaps and weak evidence

**What the strands couldn't verify, or found only weak evidence for.**
- **No direct evidence on the core question.** No study asks developers which design decisions they want an agent to consult them on. The closest are a survey about using AI and studies of merging agents' pull requests (B2 §2.9). No study measures how far people agree on Baesian's nine facts (B1 F10).
- **No model is shown to predict a person's card verdicts** (B4 F1). For Jev: the calibration claim is the vendor's; LiteLLM's benchmark used 80 synthetic prompts labelled by their own author; jevbench is one author's, on public datasets the model has likely seen; there's no technical paper; it's in early access; accuracy on long inputs with code context is untested; and OpenRouter's data policy for it and TypeSafe's data processing agreement weren't read (B4 F2, F5).
- **Sampled after-the-fact review** has no rung and no direct study (B1 F1, I7). How mixing audits into the queue affects reviewers is untested (B4 I8).
- **No study gives a number of decision cards a person can answer well** (B4 F11). Nine or ten axes is a guess (B2 §2.8).
- **Elicitation evidence** comes from privacy settings, app permissions, notifications and email, and the slider-versus-buttons studies are older web surveys. None was gathered on phones (B1 F6, open questions).
- **Software evidence** is mostly about changes and launches in large organisations. DORA is correlational; Meta's numbers are self-reported, observational and partly selected; defect models measure risk to production, not the quality of a decision (B2 F1, F3, §2.9).
- **Research evidence:** the ranking of axes rests on a few multiverses in social science and psychology; Miao and ForkSCOPE are single 2026 preprints; routing by computed sensitivity is untested, and its cost for expensive experiments is open (B3 I1, I2, I3).
- **Not covered by any strand:** whether a rules gate could run on an encrypted service by reading only facts left outside the encryption; and whether B5's service-signed verdicts (B5 R3) are enough to give research verdicts the trustworthy timestamp a pre-registration needs (B3 I4 raises the need, B5 the mechanism; neither checks the other).
- **Gaming:** how a gate changes what agents file, and how they word it, is unmeasured (B4 open questions).

**What only a pilot or dogfooding could show.**
- **A shadow run on this repo:** how many cards each design would hold back, and how many of those the user would have overturned (B1 F9; B4 §2).
- **The model comparison** on the user's own labelled cards: rules, Jev, a Haiku-class model and a local classifier (B4 I5).
- **Cards and overturns per axis per week,** to choose the axes and test the number (B2 open questions 7 and 9).
- **Agreement on the facts:** two labellers on 50 past decisions (B1 open questions).
- **Whether presets from a few questions hold,** and whether five stops per row work on a phone (B1 open questions).
- **Whether reviewers catch bad audits when they're mixed in.** Practice cards (D91) could carry known answers. B4 notes that seeding known cards through the gate to test it is uncontroversial, while seeding made-up cards for the person to catch raises honesty questions (B4 open questions).
- **Whether agents change how they file once a gate exists,** by comparing cards' stated facts with what the commit gate detects (B4 open questions).
- **Whether one repo yields enough verdicts** to calibrate per kind, or whether pooling across repos is needed, which is a decision about what the service collects (D129; B4 open questions).
- **For research:** whether routing by axis catches more planted faults than routing by sensitivity, or both together, using planted personas (B3 open questions).
