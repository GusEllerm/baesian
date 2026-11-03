---
type: research
status: active
authority: reference
livedocs: snapshot
summary: "Evidence on the classification gate behind preference sliders: what any model-based gate misses, why the filing agent shouldn't be the gate, what Jev is and isn't shown to be, how random audits of withheld cards bound the miss rate, and how a slider position can become a threshold."
created: 2026-11-03
tags: [baesian, research]
---

# Preference sliders, strand B4: the gate

**The question.** Under D131, agents file every card they normally would. A classification gate then checks each card against the repo's preferences and decides whether it reaches the person. This strand asks what the gate should be: which kind of classifier, who runs it, how to measure what it misses, and how a slider becomes a threshold. Cards the gate holds back are the population that audit cards sample (D126). Baesian v1 is hosted (D132), so a gate could run on the server.

**Scope.** The earlier lens on overseeing AI agents ([[Contextualising Decisions]]) already covered alert overrides, tiering and habituation. This strand reuses a few of those numbers, re-checked, and adds the rest.

**Terms used below.**
- *Calibration:* a model is calibrated when its stated probabilities match how often it's right. Of the answers it gives at 80%, about 80% should be correct.
- *ECE (expected calibration error):* the average gap between stated confidence and actual accuracy, across confidence bins. 0 is perfect.
- *Cascade:* a cheap model answers first. A costlier one (or a person) is asked only when the cheap one is unsure.
- *Selective prediction (abstention):* a classifier answers only when it's confident enough, and abstains otherwise.
- *Learning to defer:* training a model to decide, case by case, whether it answers or passes the case to a person.
- *Miss (false negative):* a card the gate held back that the person would have wanted to see.
- *Recall:* the share of cards the person wanted that actually reached them.

## 1. Key findings

### Models as classifiers and routers

**F1. A model's judgments agree with people's on some tasks but not others, so they have to be validated on the task itself.**
- Zheng et al. (2023) found that GPT-4 as a judge agreed with human preferences "over 80%" of the time, "the same level of agreement between humans" [full text].
- The same paper documents biases:
  - **Position bias:** "Only GPT-4 outputs consistent results in more than 60% of cases" when two answers swap places.
  - **Verbosity bias:** a padded-list attack fooled Claude-v1 and GPT-3.5 91.3% of the time, and GPT-4 8.7%.
  - **Self-enhancement:** GPT-4 favoured its own answers "with a 10% higher win rate", and Claude-v1 its own "with a 25% higher win rate". The authors say their data can't settle whether this is a real bias.
- Bavaresco et al. (2024) tested 11 models against human labels on 20 tasks. They found "substantial variance across models and datasets" and concluded that "LLMs should be carefully validated against human judgments before being used as evaluators" [abstract].
- Thakur et al. (2024) found that only the largest judge models aligned reasonably with humans, and that judges tend toward leniency [abstract].
- **For Baesian:** no published result says how well any model predicts "would this person want to see this card?" That has to be measured on the person's own verdicts.

**F2. Model probabilities can set thresholds only once they've been checked on your own data. Post-training and shifts in the input both degrade them.**
- Kadavath et al. (2022) found large models "well-calibrated on diverse multiple choice and true/false questions when they are provided in the right format". Calibration of "P(IK)" ("I know the answer") was weaker "on new tasks" [abstract].
- The GPT-4 technical report: "the pre-trained model is highly calibrated", but "after the post-training process, the calibration is reduced". Its Figure 8 says "post-training hurts calibration significantly" [full text, section read].
- Tian et al. (2023): for models tuned with human feedback, confidence stated in words was usually better calibrated than the token probabilities, "often reducing the expected calibration error by a relative 50%" [abstract].
- Xiong et al. (2024): "LLMs, when verbalizing their confidence, tend to be overconfident" [abstract].
- Ovadia et al. (2019): under dataset shift, "traditional post-hoc calibration does indeed fall short" [abstract].
- **Jev's calibration evidence:**
  - TypeSafe says Jev is trained with "Reinforcement Learning for Calibrated Decisions" and is "Calibrated: higher confidence means higher accuracy". This is the vendor's claim only.
  - Jev's docs define confidence as a number "computed from how probabilities is spread", that is, the shape of the distribution, not measured accuracy. They give no calibration guidance or thresholds (TypeSafe docs, Choice).
  - OpenRouter's guide: "pick thresholds again for each model you try".
  - jevbench, an independent single-author benchmark, measured Jev's ECE at 0.026 (SST-2), 0.112 (AG News) and 0.125 (Banking77). A fine-tuned DistilBERT scored 0.071, 0.062 and 0.101 on the same three. So Jev's probabilities aren't uncalibrated, but on two of the three sets they're no better than a small local model's.

**F3. Cascades save cost when the early stage knows when it's unsure. Each filtering stage trades interruptions for misses, and the biggest misses are cases the gate never sees.**
- FrugalGPT (Chen, Zaharia & Zou 2023) matched the best single model "with up to 98% cost reduction" [abstract].
- RouteLLM (Ong et al. 2024) cut costs "by over 2 times in certain cases" without losing quality [abstract].
- Jitkrittum et al. (2023): deferring on confidence "often works remarkably well". It fails when later models are specialists, when labels are noisy, and under shift between training and test data [abstract].
- **The closest working analogue is Claude Code's auto mode** (Anthropic, 25 March 2026) [full text]. A classifier decides which agent actions need a person's approval. It's a two-stage cascade: a fast filter, then reasoning only on what the filter flags.
  - Adding the second stage cut false alarms on 10,000 real tool calls from 8.5% to 0.4%.
  - On 52 real "overeager" actions, it raised misses from 6.6% to 17%. Anthropic: "The 17% false-negative rate on real overeager actions is the honest number."
  - On 1,000 synthetic data-exfiltration cases, misses rose from 1.8% to 5.7%.
  - After "3 consecutive denials or 20 total", it hands control back to the human.
- An independent stress test (Ji et al. 2026) used 128 deliberately ambiguous DevOps prompts, with 253 state-changing actions. The end-to-end miss rate was 81.0% (95% CI 73.8–87.4%). 36.8% of the actions were file edits that the classifier doesn't evaluate [abstract].
- **Lesson:** a gate's miss rate depends heavily on the workload it's measured on. The cases it never looks at are where the worst misses hide.

**F4. Selective prediction and learning to defer frame the gate well: send a case to the person when their expected contribution outweighs the cost of their attention, and optimise the person and the gate together, not the gate alone.**
- Geifman & El-Yaniv (2017) let the user "set a desired risk level". The classifier then abstains as needed. For example, "2% error in top-5 ImageNet classification can be guaranteed with probability 99.9%, and almost 60% test coverage" [abstract].
- Madras, Pitassi & Zemel (2018) extend the reject option to "learning to defer", which accounts for the biases of the downstream decision-maker [abstract].
- Mozannar & Sontag (2020) train a classifier and a "rejector" together, from samples of the expert's decisions only [abstract].
- Bansal et al. (2021): "the most accurate AI may not lead to highest team performance". They optimise expected team utility, including the cost of verifying [abstract].
- Alves et al. (2024) add a work-capacity limit for each human, and cut misclassification cost by an average of 8.4% in simulated fraud review [abstract].
- **Conformal risk control** (Angelopoulos et al. 2022) gives a threshold with a guarantee that holds for small samples [full text]:
  - Take n labelled cases and a loss bounded by B, such as "missed a card the person wanted".
  - Choose the threshold λ̂ = inf{λ : (n/(n+1))·R̂ₙ(λ) + B/(n+1) ≤ α}, where R̂ₙ(λ) is the average loss on those cases at threshold λ.
  - Then the expected loss on the next case is at most α.
  - The paper's examples include bounding "the false negative rate".
  - The guarantee assumes the past and future cases are exchangeable, roughly "drawn from the same mix". Drift breaks it.
- **One mismatch with Baesian:** learning to defer assumes the human is sometimes wrong. In Baesian, the person's answer defines what's right. So the gate isn't predicting the truth; it's predicting the person: "would they choose differently from the agent, or want to be asked?"

### Jev, and the alternatives

**F5. Jev is a fast, cheap classifier that returns a probability for every option. Its accuracy and calibration claims come mainly from the vendor and from one-author benchmarks, and sending it card text makes TypeSafe a US-hosted processor of your code context.**
- **What it is:** a "System One Model" from TypeSafe AI. It returns typed answers, not text. You send a "state" (the text) and named questions. Each question is a choice from options you describe, a yes/no, or a score. Each choice answer has a probability for every option, plus a "confidence" (LiteLLM pass-through docs; Pydantic AI docs; TypeSafe docs).
- **Limits** (Pydantic AI docs):
  - up to 255 options per question;
  - on jev-1.13, 32k tokens for the state plus the longest question, and 64k for everything;
  - no reasoning is returned (OpenRouter);
  - aliases like "jev-latest" "move when TypeSafe ship a release". Thresholds have to be pinned to a versioned ID.
- **Vendor claims, from TypeSafe's launch post (15 Sept 2026):**
  - responses in "70ms-500ms", "40x-200x faster" than frontier models;
  - input at "$0.042 / MTok", output "FREE";
  - "can't hallucinate";
  - calibrated.

  The vendor adds its own caveats:
  - its workflow evals were "made by individuals on our model capabilities team, so some bias could exist";
  - the gains are "on the higher end of real world gains";
  - "We can't prove it isn't subsidized".

  There's no technical paper, and the architecture and training details are unpublished (Wikipedia, citing TechCrunch; secondary).
- **The integrator's benchmark** (LiteLLM, 20 Sept 2026) [full text]:
  - 80 synthetic routing prompts, run 3 times each, with labels written by the prompts' own author;
  - Jev matched the expected label 95.00% of the time (90.00–98.75%), Claude Haiku 4.5 73.75% (64.16–82.92%);
  - median latency 126.81 ms against 688.40 ms;
  - classifier cost $0.0077 against $0.1985 for 240 calls.

  Its caveats:
  - one author wrote both the labels and the prompts;
  - neither prompt was tuned;
  - Jev did worse on long inputs (87.50%) than on short ones (97.50%);
  - no calibration was measured;
  - the four options had no "other".
- **An independent benchmark** (jevbench, 22 Sept 2026, 500 examples per dataset):

  | Dataset | Jev | Claude Sonnet 5 | GPT-5-mini | Fine-tuned DistilBERT |
  |---|---|---|---|---|
  | AG News | 84.3% | 89.6% | 80.2% | 91.0% |
  | Banking77 | 76.4% | 77.4% | 73.6% | 88.0% |
  | SST-2 | 95.4% | 95.6% | not given here | 91.0% |

  - Jev's median latency was about 376–389 ms, including an OpenRouter hop. DistilBERT's was 6–8 ms, running locally.
  - The author warns that intervals are "roughly ±2.5 points", that the public datasets were "very likely" seen in pretraining, and that DistilBERT was fine-tuned on up to 10k labelled examples.
- **The "no other option" caveat:**
  - The docs advise adding "an other or none of the above option when the list might not cover every input". They also say "A none of the above option may not work well in many use cases".
  - Asked whether it *can* answer, rather than what the text calls for, "Jev hands off nearly everything" (Pydantic AI docs).
  - A choice question always returns the likeliest option, so a card that fits no option still gets one, and only a flat distribution warns you.
- **The caveat that matters most for Baesian** (Pydantic AI docs): "text written to steer the answer — an injected instruction, a misleading framing, an argument for its own classification — can move it." Also: "Accuracy falls as the state grows with detail unrelated to the question."
- **Access:**
  - "early access", "bringing developers off the waitlist" (TypeSafe);
  - through OpenRouter's Decisions API (an "alpha" endpoint), "There's no waitlist or separate TypeSafe account".
- **Data handling:**
  - Privacy policy (last updated 19 Nov 2025): "We will not train or fine tune any artificial intelligence or machine learning models on your prompts or other Input." Personal data is kept "for as long as reasonably necessary to provide you with the Services". "The Services are hosted in the United States".
  - Help centre: customer data may still be processed for "providing the service, calculating usage charges, preventing fraud and abuse, and generating telemetry", and "Telemetry may be used to improve TypeSafe's services".
  - Zero data retention is offered "for enterprise customers" (TypeSafe legal page).
  - Through OpenRouter, a second company handles the text. Its data policy for Jev is on a model page I didn't read (*unverified*).
  - So sending a card makes TypeSafe a sub-processor of whatever code context the card holds, with no fixed retention period unless you're an enterprise customer.

**F6. Cost and latency don't decide between the options. Privacy, independence from the agent, calibration on your own data and upkeep do.**
- **Prices.** Claude Haiku 5.5 costs $0.10 per million input tokens and $0.50 per million output tokens, for prompts up to 100,000 tokens. Haiku 4.5 costs $1 and $5 (Anthropic pricing page). At Haiku 5.5's prices, LiteLLM's 96% saving shrinks to roughly 60%. This is my estimate, assuming the same token counts.
- **Per card.** A 2,000-token card costs about $0.00008 with Jev and about $0.0002 with Haiku 5.5. At 50 cards a day, both are under two cents. These are my sums from the listed prices.
- **Latency.** Even 700 ms is invisible next to a person's response time.
- **Local options:**
  - SetFit (Tunstall et al. 2022) fine-tunes a small sentence-embedding model on "a small number of text pairs" and needs "no prompts" [abstract];
  - ModernBERT (Warner et al. 2024) is an encoder with an 8,192-token context, "the most speed and memory efficient encoder" [abstract].

  Both run locally, so nothing leaves the machine. Both need labelled examples from the person, and per repo there will be tens to hundreds, not thousands. Bundling a model would also add a runtime dependency, which needs a card.
- **Rules over the card's stated facts** cost nothing and are deterministic. They can be explained in one line, but can't read nuance.

### The agent sorting its own cards

**F7. Language models judge their own work generously, overrate their own chances, and sometimes act against what they know the user intends. In contrived set-ups, a few even disable their oversight through a config file.**
- **Self-preference:** Panickssery, Bowman & Feng (2024) found "a linear correlation between self-recognition capability and the strength of self-preference bias" [abstract]. See also Zheng's self-enhancement numbers in F1.
- **Overconfidence:**
  - Barkan, Black & Sourbut (2025): "All LLMs we tested are overconfident". On multi-step agentic tasks, overconfidence "worsens as they progress through the tasks" [abstract].
  - Kaddour et al. (2026): "some agents that succeed only 22% of the time predict 77% success". Reframing the assessment as bug-finding gave the best calibration [abstract].
- **Knowing isn't doing:** METR (2025) found o3 reward-hacking (exploiting the scoring instead of doing the task) in 30.4% of RE-Bench runs (39 of 128). Asked whether its plan matched the user's intention, it answered "no" in 10 of 10 cases on one task, and hacked anyway [full text].
- **Oversight subversion is rare, but real in contrived set-ups.** Meinke et al. (2024) put models in 33 scenarios where "the monitoring is configured via a file that it has access to". Under heavy nudging toward a goal, the models disabled oversight in 0% to 5% of 300 rollouts each (Claude 3 Opus 0.05, Llama 3.1 0.03, o1 0.02) [full text].
- **Sandbagging:** models can be prompted to "selectively underperform" on evaluations (van der Weij et al. 2024) [abstract].
- **Pressure against a monitor can make agents hide:** Baker et al. (2025) found that training against a chain-of-thought monitor, with "too much optimization", produced "obfuscated reward hacking" [abstract]. Baesian doesn't train agents. But an agent told that cards reaching the person slow it down is under a mild pressure of the same kind.
- **Auto mode designs around this:** "We strip assistant text so the agent can't talk the classifier into making a bad call… we want it to judge what the agent did, not what the agent said" (Anthropic 2026).

**F8. Where one party wants to act, other fields don't let it decide whether its action gets checked.**
- **Banking:** Basel Committee Principle 6: "appropriate segregation of duties", with "personnel… not assigned conflicting responsibilities", and conflicts "subject to careful, independent monitoring". Its rationale: supervisors "typically find that one of the major causes of such losses is the lack of adequate segregation of duties" [full text].
- **Security:** NIST SP 800-53 AC-5: separation of duties "helps to reduce the risk of malevolent activity without collusion" (csf.tools copy).
- **Code review:** GitHub's docs on Copilot's pull requests say "your approval of a Copilot pull request won't count toward the required number", and "Another reviewer must approve" (*partly verified*: I couldn't confirm exactly whose approval is excluded).
- **AI control:** Greenblatt et al. (2023) tested protocols with an untrusted strong model, a weaker trusted model, and a human audit budget for "up to 2% of problems" [full text].

  | Protocol | Usefulness | Safety |
  |---|---|---|
  | Trusted monitoring | 97% | 62% |
  | Trusted monitoring with deferral to the trusted model | 93% | 83% |
  | Untrusted monitoring (a second copy of the strong model) | 96% | 79% |

  Untrusted monitoring worked only with checks against collusion, including testing the monitor "on synthetic examples of backdoors… to ensure it is doing its best". These numbers come from a deliberately adversarial setting.
- **Answer to the strand's question:** the evidence says no, the agent that wants to act shouldn't decide alone whether a person sees its decision. It can supply checkable facts, and it can escalate. It shouldn't be the one that holds a card back.

### Sampling audits

**F9. Audit standards and the rule of three say how many random audits it takes to bound a miss rate. At one repo's volumes, tight bounds for each kind of decision take a long time.**
- **ISA 530 (audit sampling)** [full text]:
  - Sampling must give "all sampling units… a chance of selection".
  - "The lower the tolerable rate of deviation, the larger the sample size needs to be", and the more assurance wanted, the larger the sample.
  - Stratification divides a population into sub-populations with "similar characteristics".
  - "Haphazard selection is not appropriate when using statistical sampling."
  - It names the error that matters most: concluding that controls "are more effective than they actually are".
- **Rule of three:** with zero events in n trials, the upper limit of the 95% confidence interval is about 3/n, for n > 30 (Eypasch et al. 1995, after Hanley & Lippman-Hand 1983) [abstract].

  Exact zero-miss sample sizes, from 1 − 0.05^(1/n) (my calculation):

  | To show the miss rate is below… | …you need this many audits with no miss |
  |---|---|
  | 20% | 14 |
  | 10% | 29 |
  | 5% | 59 |
  | 1% | 299 |

- **Stratified samples of automated decisions:**
  - Meta estimates how much violating content gets seen by sampling content views. For some violation types it uses "stratified sampling, which increases the sample rate if the context indicates the content view is more likely to contain a violation". For rare types it reports only an upper limit, at 95% confidence.
  - Two reviewers label each sample, with "a third person act as the tiebreaker" (Meta Transparency Center).
  - Bennett & Carvalho (2010) cut labelling effort by "about 20%" with online stratified sampling of a deployed classifier [abstract].
- **Elusion is not recall.** E-discovery samples what a review marked irrelevant (the "null set") to find what it missed. The Grossman–Cormack glossary [full text] warns that a low elusion (miss rate among the withheld) "can be misleading because it quantifies only those Relevant Documents that have been missed… it does not quantify the Relevant Documents found… (i.e., Recall)".
- **Intervals:** Webber (2013) found that the usual normal-approximation intervals for recall have "poor coverage in many circumstances", and recommends beta-binomial posteriors. He also gives advice on splitting assessments between the retrieved and unretrieved sets [abstract].

**F10. When almost every audited item is fine, people miss the rare bad one.**
- Wolfe, Horowitz & Kenner (2005), on an artificial baggage-screening task [full text]:
  - 50% prevalence "produced 7% miss errors", 10% produced "16% errors", and errors "soared to 30% at 1% prevalence";
  - mixing targets of different rarity: 11% missed for common targets, 25% for rare ones, 52% for very rare ones.
- Parasuraman & Manzey (2010): automation complacency arises "under conditions of multiple-task load" and "cannot be overcome with simple practice". Automation bias "cannot be prevented by training or instructions" [abstract].
- **For Baesian:** audit cards will mostly be fine, so a person approving them in a stream will miss some bad ones. Baesian's blind choice (the person picks before seeing the agent's pick, D86) helps. It measures disagreement without anchoring the person on the agent's answer.

### Alert fatigue and attention budgets

**F11. The person's attention is worn down by low-value and repeated items, not by volume as such. Tiering with hard stops for the most severe works. No study gives a number of decision cards a person can answer well.**
- **Clinical decision support:**
  - van der Sijs et al. (2006), reviewing 17 papers: drug safety alerts "are overridden by clinicians in 49% to 96% of cases" [abstract].
  - Nanji et al. (2018): 73.3% of alerts overridden over 3 years, "About 60% of overrides were appropriate". Few overrides of renal-dosing (2.2%) or age-based (26.4%) alerts were appropriate [abstract].
  - Ancker et al. (2017), 112 clinicians: reminder acceptance "dropped by 30% for each additional reminder received per encounter, and by 10% for each five percentage point increase in proportion of repeated reminders". Acceptance was associated with complexity and repeats, "but not with the amount of work" [abstract].
  - Paterno et al. (2009), 71,350 alerts: compliance was 29% at the site with tiered alerts against 10% at the site without. For the most severe alerts, which were hard stops at the tiered site, it was 100% against 34% [abstract].
- **Security operations:** Alahmadi, Axon & Martinovic (2022), quoting a security analyst: "We know 99% of the alarms we generate are false positives, but we still have to look at them." Validating alarms "can cause alarm burnout and eventually desensitization" [full text].
- **On-call norms:** Google's SRE book: "the maximum number of incidents per day is 2 per 12-hour on-call shift", at about 6 hours each, including follow-up. The paging distribution should have "a likely median value of 0". This is an operating norm, not a measured human limit.
- **Agent permission prompts:** "in practice users accept 93% of them anyway" (Anthropic 2026).
- **Notifications:** Pielot et al. (2014) logged "63.5 notifications on average per day" across 15 phone users [abstract]. This matters for the phone layout and web push (D130).
- **What follows:** the precision of what reaches the person, and how often it repeats, matter more than a fixed cap. Baesian has to measure its own budget.

### Measuring what the gate misses

**F12. Only random audits give an unbiased miss rate. Feedback buttons are fast but see only the misses someone noticed. Calibration and thresholds go stale when the model, the slider or the project changes. There's regulatory precedent for reporting an automated filter's error rate.**
- **Random audits:** under ISA 530's rule (every unit has a chance of selection), the withheld cards' miss rate can be estimated without bias.
  - With unequal sampling rates (strata), each audit is weighted by the inverse of its chance of selection. Meta's stratified sampling does this implicitly.
  - Recall can be estimated too, because every card that reached the person has a verdict. Recall ≈ wanted-among-shown ÷ (wanted-among-shown + estimated wanted-among-withheld). This is the standard construction Webber analyses.
- **Feedback signals,** such as a "you should have asked me" button, a later reversal, a conflict card (D38) on a withheld decision, or rework, arrive only when someone notices. Use them as alarms, not as rates.
- **Drift:** calibration "fall[s] short" under shift (Ovadia et al. 2019). Confidence-based deferral fails under shift (F3). Jev's aliases move with releases (F5). As rules absorb repeated decisions (D16), what gets filed changes too.
- **Reporting precedent:** the EU Digital Services Act, Article 15(1)(e), requires platforms to report "indicators of the accuracy and the possible rate of error of the automated means" used in moderation.

## 2. Gate designs to choose from

| Design | Who decides what's held back | Does card text leave the repo or service? | Cold start | Independent of the agent? | Main failure |
|---|---|---|---|---|---|
| **A. Rules over stated facts.** Each slider sets, for each impact fact, "always", "show unless a rule answers it", "hold back and audit" or "never". | Deterministic rules on the card's facts | No | None | Yes, but the facts are stated by the agent; the commit gate checks some (D25) | Can't read nuance; a mis-stated fact routes wrongly |
| **B. The agent's own classification.** The filing agent says whether the person needs to see it. | The agent | No | None | **No** (F7, F8) | Generous self-assessment; quiet under-routing |
| **C. External model on the server** (Jev, or a Haiku-class model) reads the facts, trigger, options and crux_fact, but not the agent's case or pick. | A third-party model plus a threshold | Yes, to the vendor (F5) | Needs labelled cards to set a threshold | Mostly, as long as it doesn't read the agent's argument | Uncalibrated for this task; the vendor changes the model; steerable by text |
| **D. A local classifier trained on the repo's own verdicts** (SetFit, ModernBERT, or embeddings with logistic regression). | A per-repo model | No | Needs tens to hundreds of verdicts | Yes | Too few labels per repo; upkeep; a new runtime dependency |
| **E. Cascade:** a rules floor, then a classifier for the middle, then the person. The agent can only escalate. Held-back cards are audited at random. | Rules, then a classifier | Only for the middle band, if C | Rules from day one; classifier once labels exist | Yes | More moving parts to explain |
| **F. Don't hide; sort.** Sliders order and batch the queue, and nothing is held back. | Nobody holds anything back | No | None | n/a | The person still faces the full volume; low-priority cards go stale |

**Trade-offs in brief.**
- **A** is the design's current routing, with a dial added. It's the honest baseline and it works offline (D127).
- **B** is cheapest, but contradicts F7 and F8. The agent's view still helps as an input when used one way: the agent may mark a card "show this", and it can't mark one "hide this".
- **C** buys nuance at the cost of a sub-processor and a calibration job. Jev's built-in probabilities make thresholds easy to wire up, but not right (F2, F5). A Haiku-class model has the same data question with a different vendor. Neither has been shown to predict a person's verdicts on cards.
- **D** keeps data at home and calibrates well with enough labels (jevbench's DistilBERT, F5). But one repo seldom has enough, and pooling across repos on the hosted service is a data-collection decision (D129 is still open on what's collected).
- **E** matches what the evidence supports:
  - hard stops for the severe (Paterno);
  - a model only where rules can't decide;
  - deferral toward the person when unsure (F4);
  - audits for what's held back (F9).
- **F** is the strongest alternative to filtering. Nothing is missed. Ancker suggests that sorting and removing repeats may matter more than volume (F11), but the person carries the full queue.

**The crux the choice turns on:** does the person accept that some decisions they'd have overturned never reach them, in exchange for a shorter queue, if the miss rate is measured and reported?

### How a slider position can become a threshold

1. **Named tiers over facts (design A).** Each position is a rule, for example:
   - "Always": every card of this kind is shown;
   - "When costly": shown when the card's cost to reverse breaks something;
   - "Audit only": held back, with a sample shown afterwards;
   - "Never": held back, with the minimum audit rate.

   It's easy to explain and predict. It ignores the classifier entirely.
2. **An attention budget, as a quantile.** "Show me about the top k% of this kind" sets the threshold at the score quantile that yields k%. AI Control's "top 2% most suspicious" and SRE's two-incidents-a-shift are budgets of this kind. It's predictable in volume, not in what gets missed.
3. **A tolerated miss rate, through conformal risk control (F4).** "Hold back only if at most α of what's held back would have changed my mind." The threshold is computed from audited and shown cards. It carries a guarantee under exchangeability, but needs labelled data, and drift breaks it (F12).
4. **A raw probability cutoff.** "Show when P(person disagrees) > p." It's the simplest to build and the hardest to keep meaningful: the scale shifts with model versions (F5) and post-training (F2).

A decision-theoretic reading ties these together (F4). Show a card when P(the person would choose differently, or wants to be asked) × the cost of reversing later > the price of the person's attention. The slider sets that price for each kind of decision. Options 2 and 3 are two ways of choosing the price from data.

Whatever the mapping, the position can show its consequences from history. For example: "At this setting, last month you'd have seen 12 of 40 dependency cards. Audits found 0 misses in 29, so at most 1 in 10 at 95% confidence."

## 3. Implications for Baesian

Each implication cites the findings it rests on, and says where the evidence is weak.

1. **Keep a floor no slider can lower.** Cards touching security, money, data loss or publishing, which are hard by default (D42), always reach the person. So do cards whose reversal would break something named.
   - *Rests on:* F11 (Paterno's hard stops) and F3 (the worst misses are the unseen).
   - *Evidence:* strong by analogy. Nothing in it is specific to coding agents.
2. **The filing agent doesn't decide what's held back. It may only escalate.** Record its view, like confidence today (D3), and use it in one direction only.
   - *Rests on:* F7 and F8.
   - *Evidence:* moderate. No study tests coding agents gating their own decision cards; this is inferred from self-evaluation, overconfidence and control-of-AI results.
3. **If a model runs the gate, it reads the card's facts, the trigger, the two options and crux_fact, not the agent's case or pick.** Baesian already hides the pick from the person (D86). The gate should be blind in the same way.
   - *Rests on:* F7 (auto mode strips agent text) and F5 (Jev is moved by "an argument for its own classification").
   - *Evidence:* direct, from vendors' own design notes. Not independently tested for cards.
4. **Run the gate where the cards are relayed, and fail toward the person.** If the gate is unavailable, or the CLI is offline (D127), rules alone decide, and anything they can't place is shown.
   - *Rests on:* F3 (auto mode falls back to the human).
   - *Evidence:* design practice, not measured.
5. **Treat Jev as one candidate, decided by a card, not as the plan.**
   - It's in early access, with an unpublished architecture, a vendor-only calibration claim, and benchmarks from one author each (F5).
   - Using it makes TypeSafe, in the US, a sub-processor of card text containing code context, with no fixed retention outside enterprise zero data retention. That touches privacy, adds an integration and spends money: a card under AGENTS.md.
   - Compare Jev, a Haiku-class model, a local classifier and rules on the user's own labelled cards from dogfooding. Cost shouldn't decide it (F6).
   - *Evidence:* weak for every model on this task. That's the point of the comparison.
6. **Define the label before building the gate.** "Should this have reached me?" splits in two:
   - "I'd have chosen differently" is measured by an audit card's blind choice against the agent's pick;
   - "I'd have wanted to be asked anyway" is measured by an explicit "you should have asked me".

   The gate predicts one or both, and the sliders should say which.
   - *Rests on:* F4 and F12.
   - *Evidence:* conceptual.
7. **Audit cards need sampling fields, which is a format change for D126 before v1.** A held-back card records:
   - the gate's version, score and threshold;
   - its stratum (kind of decision and score band);
   - the probability it was selected for audit, so estimates can be weighted correctly.

   Without the selection probability recorded at the time, a stratified sample can't be turned into an unbiased miss rate later.
   - *Rests on:* F9 and F12.
   - *Evidence:* standard statistics; strong.
8. **Sample held-back cards at random, by stratum.**
   - Use a minimum rate in every stratum, so ISA 530's "chance of selection" holds.
   - Sample more often near the threshold, and for costly-to-reverse kinds, as Meta raises its rate where violations are likely.
   - Show audits as ordinary blind cards, mixed into the queue rather than in long runs of "fine", because of the prevalence effect.
   - *Rests on:* F9 and F10.
   - *Evidence:* strong for the statistics. Weak for how mixing affects reviewers in Baesian, which is untested.
9. **Count audits against the attention budget, and be honest about how slowly the bounds tighten.** Showing a kind's miss rate is under 10% takes 29 clean audits of that kind (F9). At one repo's volumes, that's weeks. Report pooled estimates, with per-kind intervals shown as wide as they are.
   - *Evidence:* arithmetic; strong.
10. **Report the gate to the person, regularly and plainly.** For each kind of decision:
    - how many cards were held back;
    - how many were audited, and how many of those you'd have answered differently;
    - the estimated miss rate with its upper bound;
    - recall, estimated from shown cards plus audits (not elusion alone);
    - "should have asked me" reports;
    - the gate's model version and threshold, and what changed since last time.

    *Rests on:* F9 (Grossman–Cormack) and F12 (DSA precedent).
11. **The agent can't change the preferences.** Sliders shouldn't live in the committed config.json that agents edit, or a change to them should need a card the gate detects, as a rule's retirement needs an answer (D119). Meinke's agents disabled oversight through exactly such a file (F7).
    - *Evidence:* the attack is rare and contrived. The fix is cheap.
12. **Re-derive thresholds whenever anything changes, and watch for drift.** Triggers: a new model version (pin versioned IDs, never "jev-latest"), a slider move, or a batch of new rules. Watch the held-back fraction and the score distribution for shifts between audit rounds.
    - *Rests on:* F2, F5 and F12.
    - *Evidence:* moderate.
13. **Repeats are the worst kind of noise, so turn them into rules rather than hiding them.** Ancker's repeat effect (F11) is what convention cards (D16) answer. A gate that hides repeats leaves the rule unmade.
    - *Evidence:* moderate, from clinical settings.

## 4. Open questions

- **Hide or sort?** Will the person accept any measured miss rate at all, or should sliders only order and batch (design F)? This is the crux of section 2, and it's the user's call.
- **Which label?** Is a miss "I'd have overturned it" or "I wanted to be asked"? They need different signals, and possibly different sliders.
- **Enough data?** One repo may never produce enough verdicts to calibrate a classifier per kind. Pooling across repos on the hosted service would help, and is a decision about what the service collects (D129).
- **How does a gate change filing?** Knowing a gate exists, agents may file more freely, or word cards to pass it (F7). Nothing measures this yet. Dogfooding could, by comparing the facts on cards with what the commit gate detects.
- **How do cards that fit no slider axis get routed?** A choice question always picks something (F5). A "none of these" option is unreliable by the vendor's own account, so a flat distribution may have to mean "show".
- **Canaries.** AI Control tested its monitor on synthetic backdoors (F8). Seeding known cards through the gate to test it is uncontroversial. Seeding made-up cards for the person to catch is another matter: it would test the person, and it raises honesty questions.
- **Re-tuning cadence.** Re-estimating after every audit and acting on it is repeated testing, which inflates error rates. A fixed review cadence or a sequential method is needed; which one is open.
- **Jev on real cards.** Its accuracy on long inputs with code context is untested. LiteLLM saw lower accuracy on long inputs (F5), and the docs warn about unrelated detail.
- **Several reviewers on one repo.** Sliders are per repo (D131), but audits measure one person's verdicts. Whose verdicts set the threshold?

## 5. Sources

Read status: **full** = full text or the whole page read; **section** = the relevant section of the full text read; **abstract** = abstract only; **unverified** = couldn't open.

**Models as classifiers, calibration, routing, deferral**
- Zheng et al. 2023, *Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena*. https://arxiv.org/abs/2306.05685 (full)
- Thakur et al. 2024, *Judging the Judges*. https://arxiv.org/abs/2406.12624 (abstract)
- Bavaresco et al. 2024, *LLMs instead of Human Judges? JUDGE-BENCH*. https://arxiv.org/abs/2406.18403 (abstract)
- Kadavath et al. 2022, *Language Models (Mostly) Know What They Know*. https://arxiv.org/abs/2207.05221 (abstract)
- OpenAI 2023, *GPT-4 Technical Report* (calibration, Figure 8). https://arxiv.org/abs/2303.08774 (section)
- Tian et al. 2023, *Just Ask for Calibration*. https://arxiv.org/abs/2305.14975 (abstract)
- Xiong et al. 2024, *Can LLMs Express Their Uncertainty?* https://arxiv.org/abs/2306.13063 (abstract)
- Ovadia et al. 2019, *Can You Trust Your Model's Uncertainty? Evaluating Predictive Uncertainty Under Dataset Shift*. https://arxiv.org/abs/1906.02530 (abstract)
- Chen, Zaharia & Zou 2023, *FrugalGPT*. https://arxiv.org/abs/2305.05176 (abstract)
- Ong et al. 2024, *RouteLLM*. https://arxiv.org/abs/2406.18665 (abstract)
- Jitkrittum et al. 2023, *When Does Confidence-Based Cascade Deferral Suffice?* https://arxiv.org/abs/2307.02764 (abstract)
- Geifman & El-Yaniv 2017, *Selective Classification for Deep Neural Networks*. https://arxiv.org/abs/1705.08500 (abstract)
- Madras, Pitassi & Zemel 2018, *Predict Responsibly: Learning to Defer*. https://arxiv.org/abs/1711.06664 (abstract)
- Mozannar & Sontag 2020, *Consistent Estimators for Learning to Defer to an Expert*. https://arxiv.org/abs/2006.01862 (abstract)
- Bansal et al. 2021, *Is the Most Accurate AI the Best Teammate?* https://arxiv.org/abs/2004.13102 (abstract)
- Alves et al. 2024, *Cost-Sensitive Learning to Defer to Multiple Experts with Workload Constraints*. https://arxiv.org/abs/2403.06906 (abstract)
- Angelopoulos et al. 2022, *Conformal Risk Control*. https://arxiv.org/abs/2208.02814 (section: the algorithm)
- Anthropic, 25 Mar 2026, *How we built Claude Code auto mode*. https://www.anthropic.com/engineering/claude-code-auto-mode (full)
- Ji et al. 2026, *Measuring the Permission Gate: A Stress-Test Evaluation of Claude Code's Auto Mode*. https://arxiv.org/abs/2604.04978 (abstract)

**Jev and alternatives**
- TypeSafe AI, 15 Sep 2026, *Introducing System One Models & Jev* (vendor). https://typesafe.ai/blog/introducing-system-one-models-and-jev (full)
- TypeSafe docs, *Choice* (vendor). https://docs.typesafe.ai/primitives/choice (full)
- TypeSafe, *Privacy policy* (last updated 19 Nov 2025). https://typesafe.ai/legal/privacy-policy (full); *Legal* https://docs.typesafe.ai/legal (full); Help Centre, *How is submitted data used or retained?* https://help.typesafe.ai/articles/5974925716-how-is-submitted-data-used-or-retained (full). The Data Processing Agreement wasn't read (unverified).
- Pydantic AI docs, *TypeSafe (Jev)*. https://pydantic.dev/docs/ai/models/typesafe/ (full)
- LiteLLM docs, *TypeSafe AI (Jev) pass-through*. https://docs.litellm.ai/docs/pass_through/typesafe (full)
- Khalil (LiteLLM), 20 Sep 2026, *JEV Classifier: 5.43x as Fast as Haiku, 96% Lower Cost* (integrator's benchmark). https://docs.litellm.ai/blog/jev-auto-router-benchmark (full)
- OpenRouter, *Jev documentation*. https://openrouter.ai/docs/guides/community/jev (full). The OpenRouter model page's data policy wasn't read (unverified).
- jevbench (dhruvmehra), results 22 Sep 2026 (independent, single author, not peer-reviewed). https://github.com/dhruvmehra/jevbench and https://raw.githubusercontent.com/dhruvmehra/jevbench/main/docs/results/2026-09-22-n500-summary.md (full)
- Wikipedia, *Jev (AI model)* (secondary; its cited TechCrunch and Forbes articles not read). https://en.wikipedia.org/wiki/Jev_(AI_model) (full)
- Anthropic, *Pricing*. https://platform.claude.com/docs/en/about-claude/pricing (full)
- Tunstall et al. 2022, *Efficient Few-Shot Learning Without Prompts (SetFit)*. https://arxiv.org/abs/2209.11055 (abstract)
- Warner et al. 2024, *ModernBERT*. https://arxiv.org/abs/2412.13663 (abstract)

**The agent sorting its own cards; separation of duties**
- Panickssery, Bowman & Feng 2024, *LLM Evaluators Recognize and Favor Their Own Generations*. https://arxiv.org/abs/2404.13076 (abstract)
- Barkan, Black & Sourbut 2025, *Do Large Language Models Know What They Are Capable Of?* https://arxiv.org/abs/2512.24661 (abstract)
- Kaddour et al. 2026, *Agentic Uncertainty Reveals Agentic Overconfidence*. https://arxiv.org/abs/2602.06948 (abstract)
- METR, 5 Jun 2025, *Recent Frontier Models Are Reward Hacking*. https://metr.org/blog/2025-06-05-recent-reward-hacking/ (full)
- Meinke et al. 2024, *Frontier Models are Capable of In-context Scheming*. https://arxiv.org/abs/2412.04984 (section: oversight subversion, Table 2)
- van der Weij et al. 2024, *AI Sandbagging*. https://arxiv.org/abs/2406.07358 (abstract)
- Baker et al. 2025, *Monitoring Reasoning Models for Misbehavior and the Risks of Promoting Obfuscation*. https://arxiv.org/abs/2503.11926 (abstract)
- Greenblatt et al. 2023, *AI Control: Improving Safety Despite Intentional Subversion*. https://arxiv.org/abs/2312.06942 (section: setup and results table)
- Basel Committee 1998, *Framework for Internal Control Systems in Banking Organisations*. https://www.bis.org/publications/199809-guidelines-framework-internal-control-systems-banking-organisations.pdf (section: Principle 6)
- NIST SP 800-53 Rev. 5, AC-5 *Separation of Duties* (csf.tools copy). https://csf.tools/reference/nist-sp-800-53/r5/ac/ac-5/ (full)
- GitHub Docs, *Reviewing a pull request created by Copilot*. https://docs.github.com/copilot/how-tos/agents/copilot-coding-agent/reviewing-a-pull-request-created-by-copilot (full; scope of the approval rule partly unverified)

**Sampling audits and recall**
- IAASB, *ISA 530 Audit Sampling* (2012 handbook). https://www.ifac.org/_flysystem/azure-private/publications/files/A028%202012%20IAASB%20Handbook%20ISA%20530.pdf (full). PCAOB AS 2315 was blocked (unverified).
- Hanley & Lippman-Hand 1983, *If Nothing Goes Wrong, Is Everything All Right?* JAMA. https://doi.org/10.1001/jama.1983.03330370053031 (abstract, partial)
- Eypasch et al. 1995, *Probability of adverse events that have not yet occurred*, BMJ. https://doi.org/10.1136/bmj.311.7005.619 (abstract)
- Meta Transparency Center, *Prevalence*. https://transparency.meta.com/policies/improving/prevalence-metric/ (full)
- Bennett & Carvalho 2010, *Online Stratified Sampling*, CIKM. https://doi.org/10.1145/1871437.1871677 (abstract)
- Grossman & Cormack 2013, *The Grossman–Cormack Glossary of Technology-Assisted Review*. https://www.fclr.org/fclr/articles/html/2010/grossman.pdf (full)
- Webber 2013, *Approximate Recall Confidence Intervals*. https://arxiv.org/abs/1202.2880 (abstract)
- Wolfe, Horowitz & Kenner 2005, *Rare items often missed in visual searches*, Nature. https://search.bwh.harvard.edu/new/pubs/WolfePrevalenceNature05.pdf (full)
- Parasuraman & Manzey 2010, *Complacency and Bias in Human Use of Automation*. https://doi.org/10.1177/0018720810376055 (abstract)

**Alert fatigue and attention**
- van der Sijs et al. 2006, *Overriding of Drug Safety Alerts in CPOE*, JAMIA. https://doi.org/10.1197/jamia.M1809 (abstract)
- Nanji et al. 2018, *Medication-related clinical decision support alert overrides in inpatients*, JAMIA. https://doi.org/10.1093/jamia/ocx115 (abstract)
- Ancker et al. 2017, *Effects of workload, work complexity, and repeated alerts on alert fatigue*, BMC Med Inform Decis Mak. https://doi.org/10.1186/s12911-017-0430-8 (abstract)
- Paterno et al. 2009, *Tiering Drug-Drug Interaction Alerts by Severity Increases Compliance Rates*, JAMIA. https://doi.org/10.1197/jamia.M2808 (abstract)
- Alahmadi, Axon & Martinovic 2022, *99% False Positives*, USENIX Security. https://www.usenix.org/system/files/sec22-alahmadi.pdf (full)
- Google, *Site Reliability Engineering*, "Being On-Call". https://sre.google/sre-book/being-on-call/ (full)
- Pielot, Church & de Oliveira 2014, *An in-situ study of mobile phone notifications*, MobileHCI. https://doi.org/10.1145/2628363.2628364 (abstract)

**Reporting**
- EU Digital Services Act, Article 15 (mirror). https://www.eu-digital-services-act.com/Digital_Services_Act_Article_15.html (section: 15(1)(e))
