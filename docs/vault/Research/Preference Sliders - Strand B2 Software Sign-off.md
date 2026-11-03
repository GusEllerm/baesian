---
type: research
status: active
authority: reference
livedocs: snapshot
summary: "Which software decisions organisations keep for a person and which they delegate: change approval (ITIL, DORA, Google SRE, risk gates at Meta), design decisions and reversibility, what code reviewers actually attend to, and specialist review triggers. Ends with a candidate set of decision axes for the preference sliders, mapped to Baesian's nine facts."
created: 2026-11-03
tags: [baesian, research]
---

# Preference sliders, strand B2: which software decisions need a person's sign-off

This is one of five parallel strands for the design of the preference sliders (D131). Each repo will have settings for how much of each kind of decision the person wants put to them. The user's current view, not yet decided, is that agents file every card they normally would, and a classification gate checks each card against the repo's preferences to decide whether it reaches the person.

This strand asks three things. Which software decisions do organisations keep for people, and which do they delegate? What does heavy approval cost? What do people actually attend to, and what do they skim? It ends with a set of candidate axes mapped onto Baesian's existing facts (schema, public-api, dependency, infra, user-facing, publishes, security, money, data-loss; [[Baesian Design#Routing: when to file a card]]).

Numbers in square brackets point to section 4. "(abstract)" marks a source whose abstract was all I could read. Figures are quoted exactly as the source gives them.

## 1. Key findings

### F1. Uniform approval by an outside body is costly, and it doesn't buy stability

- **DORA 2014.** (DORA, DevOps Research and Assessment, runs the yearly State of DevOps survey.) It reports that "when external approval (e.g., change approval boards) was required in order to deploy to production, IT performance decreased". External approval "had no impact on restore times, and had only a negligible effect on reducing failed changes". In short, external change approval boards "had a big negative impact on throughput, with negligible impact on stability" [3].
- **DORA 2019.** Formal processes that need "the approval of an external body such as a change advisory board (CAB) or a senior manager for significant changes have a negative impact on software delivery performance". (A CAB is a committee that approves changes before release.) Respondents with such a process "were 2.6 times more likely to be low performers". On whether formal approval lowers the change failure rate, "we found no evidence to support this hypothesis". Its explanation is that approvals slow the process, so changes ship in larger batches less often, and larger batches are riskier [1].
- **The reflex makes it worse.** "Organizations often respond to problems with software releases by introducing additional process and more heavyweight approvals. Analysis suggests this approach will make things worse" [1].
- **Treating every change alike is itself a named failure.** DORA lists "Treating all changes equally" as a pitfall: "When all changes are subject to the same approval process, change review is inefficient, and people are unable to devote time and attention to those that require true concentration because of differences in risk profile or timing". Its remedy is "Performing ongoing analysis to detect and flag high risk changes early on so that they can be subjected to additional scrutiny" [2].
- **A clear process helps on its own.** "Survey respondents with a clear change process were 1.8 times more likely to be in elite performers". Clear means people "know the steps it takes to go from 'submitted' to 'accepted' every time for all the types of changes they typically make" [1].
- **ITIL has moved the same way.** (ITIL is the most widely used IT service-management framework.) It defines a standard change as "A low-risk, pre-authorized change that is well understood and fully documented, and which can be implemented without needing additional authorization" [4]. ITIL 4 says: "In high-velocity organizations, it is a common practice to decentralize change approval, making the peer review a top predictor of high performance" (§5.2.4, as quoted in [5]).
- **What is left for a board** is business trade-offs: "important business decisions that require a trade-off and sign-off at higher levels of the business, such as the decision between time-to-market and business risk" [1].
- **The same lesson from practitioners.** Bezos (2015) calls "one-size-fits-all" decision making a pitfall. Using the heavy process on reversible decisions leads to "slowness, unthoughtful risk aversion, failure to experiment sufficiently, and consequently diminished invention" [7]. Google SRE (site reliability engineering) found that "engineers are likely to sidestep processes that they consider too burdensome or as adding insufficient value" [6].

*Weaknesses:* DORA's data are cross-sectional surveys, so the results are correlations. They concern approving production deployments, not design decisions. The mechanism (waiting, then larger batches) carries over to an agent waiting on a card, but that is an analogy.

### F2. Where organisations insist on a person, the trigger is a consequence outside the code

Independent policies, written for different purposes, name much the same triggers. None is about code complexity. Each is about who is affected, or what can't be taken back.

| Trigger | What the sources say |
|---|---|
| **Visible to outsiders** | Google defines a launch as "any new code that introduces an externally visible change to an application" [6]. API design review "is only expected for APIs that users code directly against" [40]. Rust exempts from its RFC process "Additions only likely to be _noticed by_ other developers-of-rust, invisible to users-of-rust" [42]. Kubernetes: "Configuration files, flags, and command line arguments are all part of our user and script facing APIs and must be reviewed" [39]. |
| **Breaking an interface** | Azure allows breaking changes only "if approved by the Azure Breaking Change Reviewers" [41]. Kubernetes reviews "All API implementations (including alpha versions) that are part of core Kubernetes" [39]. |
| **Personal data** | Microsoft's SDL (Security Development Lifecycle) rates a feature "P1 – High Privacy Risk" if it "stores or transfers Personally Identifiable Information (PII) or error reports; monitors the user with an ongoing transfer of anonymous data; changes settings or file type associations; or installs software" [33]. GDPR requires an impact assessment "prior to the processing" when processing "is likely to result in a high risk" [35]. GitLab asks for review when "Processing, storing, or transferring any kind of RED or ORANGE data" [34]. |
| **Security mechanisms** | GitLab's list includes "A new authentication mechanism", "Adding code that touches the authentication model, tokens or sessions", "Touching cryptography functions", "Touching the permission model", "Changes to an existing security control", "Modification of any pipeline security checks or scans", "Exposing a new API endpoint, or modifying an existing one", "Introducing new database queries" and "Dealing with user supplied data" [34]. |
| **Third-party code** | Chromium needs approval "from Chrome's Technical Steering Council and Chrome Security" before a new third-party library [37]. OpenSSF: "Every new dependency increases the attack surface" [38]. |
| **Persistent data** | Google's launch checklist: "Are you storing persistent data?" leads to "Make sure you implement backups" [6]. |
| **Money and compliance** | DORA suggests automated checks that stop a change "(even with peer review) that will increase compute or storage costs over a certain threshold" [1]. Meta's automated reviewer never lands changes that "touch SOX-scoped code" (SOX: US financial-reporting controls) [26]. |
| **Novelty** | The GDPR guidelines list "Innovative use or applying new technological or organisational solutions" as a criterion [36]. Kruchten: a decision's risk "is often related to the uncertainty in the problem domain or to the novelty of the solution domain" [9]. Google gives a "simplified launch process" to "classes of launches that always follow a common pattern" [6], so a new kind of launch gets the full one. |

Two gaps against Baesian's facts stand out. Every source that covers both treats **privacy** apart from security: the SDL has a separate privacy advisor, privacy bug bar and privacy rating [33]. And **audience** splits interfaces: an API only your own team calls is not reviewed like a public one [40].

### F3. Change risk is predictable, and at scale a risk gate sends only a minority of changes to people

- **What predicts a risky change.** Mockus and Weiss (Bell Labs) predicted failures from a change's size, its "diffusion", meaning "the number of files, modules, and subsystems touched", developer experience, and type. "Change diffusion and developer experience are essential to predicting failures". They used the model "to make appropriate decisions regarding inspection, testing, and delivery" [22] (abstract). Baesian's "how many modules it touches" fact is this diffusion measure.
- **Focus pays.** Kamei et al., across eleven projects: "using only 20 percent of the effort it would take to inspect all changes, we can identify 35 percent of all defect-inducing changes" [23] (abstract).
- **Risk gates at Meta.** During a code freeze (a period when changes are blocked), a risk model let low-risk changes through. "During the winter 2023 code freeze, we see that only 16% of changes are gated. Although 42% more changes landed ... there was a 52% decrease in outages" [24]. Meta's Diff Risk Score let it land "10,000+ code changes (that previously could not have landed during a freeze)" during one 2024 event [25].
- **A deployed classification gate (RADAR, Meta, 2026 preprint).** It decides which changes skip human review [26]. It is layered, and every layer must pass:
  - hard constraints first: the change "must not be open source, must not require additional reviews, must not touch SOX-scoped code";
  - then a risk score threshold, set by "organizational risk appetite": sources "with strong safety records use a relaxed P50 threshold, while non-allowlisted runbooks use the stricter default P20" (P50 lets through the safest 50%, P20 the safest 20%);
  - then an LLM review. Its "safe signals" are "refactoring without behavioral change, dead code removal, defensive programming additions, logging additions, pure formatting changes, documentation and comment updates, import hygiene, test additions, and static resource updates". Its "risk signals" include "substantial structural changes", "performance risks, and security vulnerabilities". "If any risk signal is detected, the diff is automatically disqualified from auto-acceptance";
  - sources "that have caused incidents or that target sensitive areas are permanently blocked".

  It started strict and was loosened ("from the 25th to the 50th percentile"). It has reviewed "535K+ diffs and landed 331K+". Its revert rate is 1/3, and its production-incident rate 1/50, of changes it didn't review.

*Weaknesses:* these models predict defects and outages, not whether a design choice was wise. RADAR's changes were picked for low risk, so its low revert rate is partly by construction. The paper is observational, and its authors are Meta staff.

### F4. "Needs a person" comes in grades, and mature policies name them

- **Google's API review** has four outcomes: "Not Required", "FYI", "Recommended" and "Required". Which one applies depends on who codes against the API and its release stage. Alpha is recommended, beta required; a GA (general availability) release is required if it changed since beta, and FYI if not [40].
- **Kubernetes** has two. Mandatory: "the change is blocked on the API reviewer approval". Voluntary: "The review comments are considered recommendations" [39].
- **Azure's guidelines** grade their rules, and each grade sets when to involve the board. To break a DO or DO NOT rule, contact the board "**prior** to implementation". To depart from a SHOULD, "disclose your reason during the ... review". A MAY needs "No notification" [41].
- **GitLab's security review is not a gate.** "No, code changes do not require security approval to progress. Non-blocking reviews enables the freedom for our code to keep shipping fast ... They operate more as guardrails instead of a gate" [34].
- **Microsoft's SDL** scales the work with the risk rating: "Product teams must complete only the work that is relevant to their Privacy Impact Rating" [33].
- **The GDPR guidelines** count criteria: "a processing meeting two criteria would require a DPIA"; "the more criteria are met ... the more likely it is to present a high risk". In some cases one criterion is enough [36]. (A DPIA, data protection impact assessment, is GDPR's documented risk review.)
- **Kruchten's decision states** separate "Decided" from "Approved: by a review, or a board (not significantly different than decided, though, in low ceremony organizations)" [9].

These grades map onto Baesian's levels: provisional, blocking and hard (D42). Below them sit two more that the sources use: "FYI", which is close to an audit card (D126), and "not required", where the agent decides and logs it.

### F5. Reversibility is what makes a decision architectural, and it belongs to the project, not the category

- **Bezos:** one-way doors are decisions that are "consequential and irreversible or nearly irreversible", and "must be made methodically, carefully, slowly, with great deliberation and consultation". Two-way doors "can and should be made quickly by high judgment individuals or small groups" [7].
- **Nygard's ADRs** (architecture decision records, a common short format for recording design decisions) are for "'architecturally significant' decisions: those that affect the structure, non-functional characteristics, dependencies, interfaces, or construction techniques" [8]. Four of those five already have a Baesian fact.
- **Fowler** quotes Ralph Johnson: "Architecture is the decisions that you wish you could get right early in a project", hence "things that people perceive as hard to change". His example is the database schema. Once a colleague built tooling to change it and migrate the data easily, "the database schema was no longer architectural". He sees "one of an architect's most important tasks" as finding "ways to eliminate irreversibility in software designs" [10]. **So the same category can be a one-way door in one repo and a two-way door in another.**
- **Option value.** Baldwin and Clark argue that modularity "freed designers to experiment with different approaches, as long as they obeyed the established design rules" [11] (abstract). Sullivan et al. applied this to software, using design structure matrices (grids of which parts depend on which) and real-options valuation (pricing the freedom to change later). Their results were "consistent with Parnas's conclusions" on information hiding [12] (abstract). The decisions that set the rules between modules (interfaces) are where option value is created or lost. Decisions hidden inside a module stay cheap.
- **Audience size sets the cost of reversing an interface.** Hyrum's Law: "With a sufficient number of users of an API, it does not matter what you promise in the contract: all observable behaviors of your system will be depended on by somebody" [16]. Google's API review lets an alpha skip review, because "bypassing review may be expedient" [40].
- **Where the debt comes from.** A survey of 1,831 practitioners found "architectural decisions are the most important source of technical debt" [13] (abstract). Architectural debt is the "'big' design decisions (e.g., choices regarding structure, frameworks, technologies, languages, etc.) that, while being suitable or even optimal when made, significantly hinder progress in the future". It is "hard to be identified, of wide-ranging remediation cost" [14] (abstract). Such decisions looked right when made, which argues for reviewing them afterwards as well as before.
- **Kruchten's three kinds of design decision** [9]:
  - *existence:* something will exist, whether structural (layers, components) or behavioural (how parts interact). Its opposite, a *ban*, says something won't. Bans lack "any 'hooks' in traditional architecture documentation";
  - *property:* a cross-cutting trait or rule. These "are harder to trace", and "in many cases they are implicit and rapidly forgotten";
  - *executive:* process, technology, tool and organisational choices, "driven more by the business environment". His example of a process decision: "All changes in subsystem exported interfaces (APIs) must be approved by the CCB (Change Control Board) and the architecture team".

  He also warns: "There is a danger in pushing taxonomy too far, too deep too early; it stifles creativity".

### F6. Code review rarely reaches design, so design decisions go through unless someone asks

- **Bacchelli and Bird (Microsoft).** Of 570 review comments, the largest group was "code improvements" (29%). Defects came fourth (78, 14%): "65 are on logical issues ..., 6 on high-level issues, 5 on security". Defect comments "mostly address 'micro' level and superficial concerns; while programmers and managers would expect more insightful remarks on conceptual and design level issues" [17].
- **El Zanaty et al. (OpenStack).** Of 2,817 classified comments, "only 9% and 14% of Nova and Neutron review comments" were "related to software design" [20].
- **Paixao et al.** Of 731 reviews with significant architectural change, developers discussed the architectural impact "in only 31% of the cases". Where architectural feedback was given, 73% of it was addressed, with better results [21] (abstract).
- **Sadowski et al. (Google).** Developers disagreed about "whether code review was the most suitable context for reviewing certain aspects, particularly design reviews". Context breaks down when reviewers don't know "what gave rise to the change", such as "an urgent fix to a production problem or a 'nice to have' improvement" [18].
- **Expertise matters.** McIntosh et al.: "components with many changes that do not involve a subject matter expert in the authoring or reviewing process tend to be prone to post-release defects" [19].

### F7. People rubber-stamp high-volume, low-consequence streams, and they turn the volume down

- **Dependency bots.** In He et al.'s study of Dependabot, "developers tend to configure Dependabot toward reducing the number of notifications". One respondent: "[automerge] is something that basically already happens when I merge such PRs". Another: "If I am merging with Dependabot like 60 deps a day - I don't know if some of the versions are not published by hackers who took over the repository account". An earlier bot had "only 32% of ... PRs ... merged", for two reasons: suspicion that an update would break the code, and "notification fatigue" [30].
- **Attention is a small, fixed budget.** At Google, developers spend "an average of 3.2 (median 2.6 hours a week) reviewing changes", and the "median reviewer count" is 1 [18]. "The most important LGTM is the first one, and subsequent ones don't add as much as you might think" [16]. (LGTM, "looks good to me", is the approval mark.)
- **Checklists must be kept short to keep their force.** At one point, adding a question to Google's launch checklist "required approval from a vice president". Now "Every question's importance must be substantiated, ideally by a previous launch disaster" [6].
- **Agent pull requests (2025–2026 studies):**
  - of 567 Claude Code pull requests, "83.8% ... are eventually accepted and merged", "with 54.9% of the merged PRs being integrated without further modification" [27];
  - in a 33k-PR dataset from five agents, "documentation, CI, and build update tasks are merged at higher rates, while performance and bug-fix contributions show the lowest acceptance" [28];
  - security-related agent PRs "are merged at only 61.50%, compared to 77.33% for non-security PRs", with "a median review latency of 3.92 hours, compared to only 0.11 hours" [29]. The authors read this as "heightened human scrutiny".

*Weaknesses:* review latency measures waiting, not attention, so a fast merge isn't proof of a rubber stamp. The agent studies use open-source repos and are mostly preprints.

### F8. People keep the "what" and the high-responsibility tasks, and agent-era data agrees

- **What closes agent PRs** [27]. Of 92 rejected Claude Code PRs, 64.1% were closed with no feedback. The commonest stated reason (12.0%) was that the PR was "implemented by other PRs/developers": the team "chooses a different solution". Code-level reasons were rare: "non-optimal design solutions" 2.2%, "Introduce bugs/ break APIs" 1.1%. So when a person stepped in, it was mostly about which solution or what to build, not code quality.
- **What developers won't hand to AI.** In the Stack Overflow 2025 survey, developers "show the most resistance to using AI for high-responsibility, systemic tasks like Deployment and monitoring (76% don't plan to) and Project planning (69% don't plan to)". 58.7% don't plan to use it for "Committing and reviewing code". Asked why they would still go to a person, 61.7% chose "When I have ethical or security concerns about code" [31]. This is a self-selected survey about using AI, not about approving its work.
- **An agent's confidence on security is weak evidence.** Perry et al. found that participants with an AI assistant "wrote significantly less secure code" and "were more likely to believe they wrote secure code" [32] (abstract). This supports Baesian's rule that routing uses facts, not self-reported confidence (D3, D11).

### F9. Owners and specialists keep decisions with long-run ownership costs, and some checks can't be automated

- **Google splits approval three ways** [16]:
  - a peer checks correctness ("LGTM");
  - an owner of the directory approves;
  - a reviewer with language "readability" checks style.

  The owner asks different questions: "Will this code be easy or difficult to maintain?" "Does it add to my technical debt?" "Do we have the expertise to maintain it within our team?" Gatekeeping is the main theme of review between peers and other teams [18].
- **Chromium's rules for new dependencies** [37] ask for:
  - motivation, including "Are there alternatives you considered";
  - security: "Is the library written in a memory-safe language? Does it process untrusted input?";
  - maintenance: "You will be responsible for owning the dependency";
  - weight: build time and binary size.

  It delegates inside the category: "new Rust crates do not require security approval", and "minor version updates for crates are regularly handled by a rotation; you'll only be responsible for major version updates".
- **The cost of a loose dependency policy shows up years later.** Google's own third-party policy was "a fairly simple checklist", and the book's example ends in "a costly and difficult upgrade". Its conclusion: "we need a higher bar for ownership" [16].
- **Accessibility needs a person.** Of 143 deliberate barriers on a test page, "29%" were missed by all 10 automated tools; the best tool found 37% to 41%. GOV.UK: "You must get an accessibility audit - and fix any issues - before your service moves into public beta" [43].

### F10. Published policies say what *doesn't* need review as precisely as what does

- **Rust** needs an RFC for "Any semantic or syntactic change to the language that is not a bugfix", "Removing language features" and "Large additions to std". It needs none for "Rephrasing, reorganizing, refactoring", for "Additions that strictly improve objective, numerical quality criteria (warning removal, speedup, better platform coverage, more parallelism, trap more errors, etc.)", or for changes invisible to users [42].
- **Google's API review** isn't required for "An API which will only ever be used by Googlers", or one "only ever be called by an executable program released by Google" [40].
- **Meta's RADAR** lists the safe signals given in F3 [26]; **ITIL** pre-authorises standard changes [4].

A rule saying "this kind of decision never needs you" is as much a part of the policy as a trigger.

## 2. Implications for Baesian

Each implication names the findings it rests on, and how strong the evidence is.

### 2.1 A candidate set of axes

These are categories a developer would recognise from the policies above, mapped to Baesian's facts and the commit gate's detectors (D25). "Kept" means the sources keep it for a person; "delegated" means they let it through, or rubber-stamp it.

| # | Axis | What a developer would call it | Baesian fact | Gate detector today | Kept or delegated, and evidence | Evidence |
|---|---|---|---|---|---|---|
| 1 | **Public interfaces** | API changes, breaking changes, CLI flags, config file formats, URL schemes | public-api | api: (opt-in, breaking only) | Kept when others code against it; graded by audience and maturity (F2, F4, F5) | Strong |
| 2 | **Structure** | module boundaries, a new component or layer, a new pattern, cross-cutting rules | public-api (module boundary), modules touched | none | Wanted but rarely reviewed (F6); the main source of technical debt (F5) | Strong that it matters, weak on who should answer |
| 3 | **Data formats** | schemas, migrations, on-disk and wire formats | schema | schema and migrations | Kept once data or users exist; delegable with migration tooling and no users (F5) | Moderate |
| 4 | **Destroying data** | deletes, overwrites, irreversible migrations | data-loss | none | Kept: one-way (F5) | Strong in principle; little direct study |
| 5a | **New dependencies** | adding a library or service | dependency | dependencies | Kept by owners and security (F9) | Strong |
| 5b | **Dependency updates** | version bumps | dependency | dependencies | Minor: delegated and rubber-stamped (F7, F9). Major: kept (F9) | Strong |
| 6 | **Security** | authentication, authorisation, crypto, secrets, security controls, untrusted input | security | none | Kept, often without blocking (F2, F4). Agent security PRs get more scrutiny (F7) | Strong |
| 7 | **Personal data** | PII, telemetry, tracking, user data in logs | security (merged) | none | Kept; the law says before processing (F2) | Strong (legal) |
| 8 | **Delivery and infrastructure** | CI, deploy config, infrastructure as code, environments | infra | CI, infra and deploy | **Conflicting:** DORA favours peer review plus automation (F1); developers resist handing deployment to AI (F8); agent CI PRs merge often (F7) | Conflicting |
| 9 | **Product behaviour** | what users see or do, UI, copy, accessibility | user-facing | none | Kept: "what to build" (F8), launches (F2); accessibility can't be automated (F9) | Moderate |
| 10 | **Publishing** | releases, package publishing, public posts, domains | publishes | none | Kept: one-way, public record (F2, F5) | Strong in principle |
| 11 | **Spending** | paid services, cloud resources, quotas | money | none | Kept, often by threshold (F2) | Moderate |
| 12 | **Tooling and conventions** | test framework, linter, build tool, code style | none (partly dependency) | dependencies (dev) | Decided once, then by rule: Kruchten's executive decisions, Google's readability (F5, F9) | Weak |
| 13 | **Local implementation** | refactors, tests, docs, logging, formatting, private names | none | none | Delegated (F3, F10); a natural audit sample | Strong |

What this suggests, for the user to decide:

- **Three facts split under the evidence.**
  - *Privacy apart from security* (axes 6 and 7). Every source with both separates them (F2), and their review triggers differ.
  - *A public interface apart from an internal module boundary* (axes 1 and 2). Audience decides whether an interface needs review (F2, F4, F5).
  - *Adding a dependency apart from updating one* (axes 5a and 5b). Chromium and the Dependabot evidence treat them very differently (F7, F9).
- **One fact may be missing: novelty**, meaning "the first decision of its kind in this repo". Three independent sources treat novelty as a trigger (F2). Baesian could derive it from its own record (no resolved card on this topic yet), so the agent wouldn't need to judge it.
- **Not every axis needs a slider.** Axes 4, 10 and 11 carry outside obligations or can't be undone. They might be floors, not sliders (see 2.5). Axis 13 might be a floor in the other direction: never asked, audited only. That would leave about nine sliders.

### 2.2 Slider positions can map onto levels that already exist

Based on F4 (strong). The sources' grades line up with Baesian's levels, plus two below them:

| Slider position | Baesian today | Source analogue |
|---|---|---|
| Not asked | agent decides; one-line reason in the ledger | AIP "Not Required"; Azure MAY; ITIL standard change |
| Afterwards | audit card, "overturn?" (D126) | AIP "FYI"; Kubernetes voluntary review |
| Ask, carry on | provisional | GitLab non-blocking security review |
| Ask, wait a while | blocking | Azure "disclose your reason during the review" |
| Never without you | hard | Kubernetes mandatory; Chromium third-party approval |

So the classification gate's output is a level, not yes or no. This also gives audit cards a defined place: what the person slides below "ask" still reaches them, sampled, afterwards.

### 2.3 What the gate should look at, and in what order

Based on F2 and F3 (strong for change risk at Meta; untested for design decisions).

1. **Hard constraints and rules first.** Floors, accepted rules and the commit gate's detectors are deterministic, as RADAR's first layer is.
2. **Consequence facts next.** Audience, data, security, money and persistence are the triggers every policy uses (F2). These are Baesian's facts.
3. **Statistical modifiers last.** Diffusion (modules touched), size, novelty, and the axis's track record in this repo (overturn rate). RADAR relaxes thresholds per source by track record (F3).
4. **When in doubt, go up a level.** RADAR disqualifies on "any risk signal" (F3).

*Who runs it.* The agent already states the facts, and the gate can apply the repo's preferences to them deterministically. But an agent's view of its own security work is a weak signal (F8, Perry). People also describe changes inaccurately: "people can say they are doing one thing, while they are doing many more" [17]. So for security and privacy, an independent check (the commit gate's detectors, a rule, or a separate classifier) is better evidence than the agent's word alone. The evidence for this is moderate.

### 2.4 Calibrate the sliders from verdicts, and start strict

Based on F1, F3 and F10 (strong in deployment practice; untested for design decisions).

- RADAR started strict and loosened its threshold once outcomes were known (F3).
- ITIL pre-authorises what is "well understood and fully documented" (F1).
- Google builds "fast common paths" for launches that repeat a pattern (F2).

Baesian has the pieces already. Audit cards measure the overturn rate on an axis the person has slid down. Convention cards turn repeated answers into rules, which are standard changes in ITIL's sense. One option is for the client to suggest a move ("You've overturned none of 14 dependency updates. Show them only afterwards?"), and for the person to choose.

### 2.5 Some axes may need floors, not sliders

Based on F2 and F5 (strong for the legal and one-way cases).

- GDPR requires a DPIA "prior to the processing" when risk is high (F2). A slider can't waive that for the repo's owner.
- Destroying data, publishing and spending are one-way (F5). Baesian already makes them hard by default (D42).

The question for the user is whether these axes get sliders at all. If they do, can a slider move them below "ask, carry on"?

### 2.6 "Hard" may belong at release, not at the next step

Based on F4 (moderate). Baesian makes security hard by default, so the agent stops until the person answers. The sources mostly put the hard stop later:

- GitLab's security review doesn't block progress (F4);
- Microsoft's SDL puts its Final Security Review before release [33];
- GDPR's assessment comes before processing data, which is at deployment, not while the code is being written (F2).

Baesian's merge gate already requires every card to be resolved or deferred before merge (D31). One option is to make security cards provisional while the agent works, and hard at merge or publish. That would be a decision card for the user, not something to change quietly.

### 2.7 Reversibility depends on the repo's stage, so one setting might move several sliders

Based on F5 (moderate; it's an inference from Fowler, Hyrum's Law and Google's alpha, beta and GA stages). A repo with no users and no live data (like this one, under D108) can change its formats and interfaces cheaply. One with users can't. A release-stage setting (prototype, pre-release, released) could move axes 1, 3 and 10 together. That might be clearer than asking the person to move each slider when they ship.

### 2.8 Keep the axes few, and show each slider by its volume

Based on F1, F5 and F7 (strong that fatigue exists; no evidence on the right number of axes).

- People rubber-stamp high-volume streams, and they tune the volume down (F7).
- Checklists lose their force as they grow (F7), and Kruchten warns against deep taxonomies (F5).
- A clear process improves performance by itself (F1). Both the person and the agent should be able to predict what will be asked.

So each slider could show its expected cost from this repo's history ("about 3 cards a week at this setting"). Nine to ten axes is a guess to test in dogfooding, not a finding.

### 2.9 Where the evidence is weak

- Most of the evidence is about changes and launches by people in large organisations. Little is about design decisions made by agents in small repos.
- No study I found asks developers directly which kinds of design decisions they want an agent to consult them on. The closest are the Stack Overflow survey (using AI, not approving it) and the agent-PR studies (merging, not deciding).
- DORA's results are survey correlations. Meta's numbers are self-reported, observational and partly selected.
- Defect and outage models measure risk to production, not the quality of a decision.
- I couldn't open the empirical surveys of the kinds of decisions architects make (Weinreich et al. [15]: paywalled, and the abstract names none). I also couldn't open van Vliet and Tang (2016) or Tang et al. (2006), so they are not cited.

## 3. Open questions

1. **Floors.** Do destroying data, publishing, spending and personal data get sliders, or fixed floors (2.5)?
2. **Where hard bites.** Should "hard" stop the agent at the next step, or at merge and publish (2.6)?
3. **Splitting facts.** Split privacy from security, public interfaces from module boundaries, and adding dependencies from updating them (2.1)? This changes the card format, so under the AGENTS.md rules it needs a card.
4. **Novelty.** Add "first of its kind in this repo" as a derived fact (2.1)?
5. **Release stage.** Should one repo-level setting move several sliders together (2.7)?
6. **Who classifies.** Is the agent's own classification enough for most axes, with independent checks only for security and privacy (2.3)? How large must the audit sample be to calibrate a slider safely?
7. **How many axes.** Test with this repo's verdict data: cards and overturn rate per axis per week.
8. **More than one person.** Should axes route to different people (an owner, a security reviewer)? Google's owner and readability split and Chromium's two sign-offs suggest so (F9). Not researched further here.
9. **The direct evidence gap.** Baesian's own verdict history (which axes people overturn, and how fast they answer) may become the best evidence there is. It's worth recording from the start.

## 4. Sources

43 sources, more than the 15–30 aimed for. The specialist policies (F2, F4, F10) are short primary documents, and each adds a distinct trigger or grade. Status: **full text** (read in full or in the relevant sections), **abstract** (abstract only), or **secondary** (seen only as quoted elsewhere).

1. DORA (Google Cloud). *Accelerate: State of DevOps 2019*. https://dora.dev/research/2019/dora-report/2019-dora-accelerate-state-of-devops-report.pdf — full text (change management section).
2. DORA. "Capabilities: Streamlining change approval". https://dora.dev/capabilities/streamlining-change-approval/ — full text.
3. Puppet Labs, IT Revolution, ThoughtWorks (Velasquez, Kim, Kersten, Humble). *2014 State of DevOps Report*. https://services.google.com/fh/files/misc/state-of-devops-2014.pdf — full text (predictors section).
4. PeopleCert. *ITIL 4 Foundation Glossary*, copy hosted by a training provider. https://igen.nl/wp-content/uploads/2024/10/ITIL-4-Foundation_Glossary_Digital.pdf — full text. Not from PeopleCert's own site; "normal change" isn't defined in it.
5. AXELOS and Atlassian. *A practical guide for working with ITIL 4 and Atlassian*, quoting *ITIL Foundation: ITIL 4 Edition* §5.2.4. https://pages.eml.atlassian.com/rs/594-ATC-127/images/Atlassian_Axelos_ITIL4_Guide.pdf — full text of the guide; the ITIL book itself is secondary (not opened).
6. Beyer, Jones, Petoff, Murphy (eds.). *Site Reliability Engineering* (Google, 2016): ch. 1 https://sre.google/sre-book/introduction/, ch. 27 https://sre.google/sre-book/reliable-product-launches/, appendix E https://sre.google/sre-book/launch-checklist/ — full text.
7. Bezos, J. *2015 Letter to Shareholders*. https://s2.q4cdn.com/299287126/files/doc_financials/annual/2015-Letter-to-Shareholders.PDF — full text (practitioner source).
8. Nygard, M. "Documenting Architecture Decisions" (2011). https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions — full text.
9. Kruchten, P. "An Ontology of Architectural Design Decisions in Software-Intensive Systems" (2004). https://philippe.kruchten.com/wp-content/uploads/2009/07/kruchten-2004-design-decisions.pdf — full text.
10. Fowler, M. "Who Needs an Architect?" *IEEE Software*, July/August 2003. https://martinfowler.com/ieeeSoftware/whoNeedsArchitect.pdf — full text.
11. Baldwin, C. Y. and Clark, K. B. *Design Rules, Volume 1: The Power of Modularity*. MIT Press, 2000. Description read through the OpenAlex record with DOI https://doi.org/10.2307/259400 — abstract (book not opened).
12. Sullivan, K., Griswold, W., Cai, Y., Hallen, B. "The Structure and Value of Modularity in Software Design". ESEC/FSE 2001. https://doi.org/10.1145/503209.503224 — abstract.
13. Ernst, N. et al. "Measure It? Manage It? Ignore It? Software Practitioners and Technical Debt". ESEC/FSE 2015. https://doi.org/10.1145/2786805.2786848 — abstract.
14. Verdecchia, R., Kruchten, P., Lago, P., Malavolta, I. "Building and evaluating a theory of architectural technical debt in software-intensive systems". *JSS*, 2021. https://doi.org/10.1016/j.jss.2021.110925 — abstract.
15. Weinreich, R., Groher, I., Miesbauer, C. "An expert survey on kinds, influence factors and documentation of design decisions in practice". *FGCS* 47, 2015. https://doi.org/10.1016/j.future.2014.12.002; summary at https://se.jku.at/an-expert-survey-on-kinds-influence-factors-and-documentation-of-design-decisions-in-practice/ — abstract. No finding rests on it.
16. Winters, T., Manshreck, T., Wright, H. (eds.). *Software Engineering at Google* (2020): ch. 1 https://abseil.io/resources/swe-book/html/ch01.html, ch. 9 https://abseil.io/resources/swe-book/html/ch09.html, ch. 21 https://abseil.io/resources/swe-book/html/ch21.html — full text.
17. Bacchelli, A. and Bird, C. "Expectations, Outcomes, and Challenges of Modern Code Review". ICSE 2013. https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/ICSE202013-codereview.pdf — full text.
18. Sadowski, C. et al. "Modern Code Review: A Case Study at Google". ICSE-SEIP 2018. https://sback.it/publications/icse2018seip.pdf — full text.
19. McIntosh, S., Kamei, Y., Adams, B., Hassan, A. E. "An empirical study of the impact of modern code review practices on software quality". *EMSE*, 2016. Preprint https://rebels.cs.uwaterloo.ca/papers/emse2016_mcintosh.pdf (DOI https://doi.org/10.1007/s10664-015-9381-9) — full text.
20. El Zanaty, F., Hirao, T., McIntosh, S., Ihara, A., Matsumoto, K. "An Empirical Study of Design Discussions in Code Review". ESEM 2018. https://rebels.cs.uwaterloo.ca/papers/esem2018_elzanaty.pdf — full text (abstract and method).
21. Paixao, M. et al. "The Impact of Code Review on Architectural Changes". *IEEE TSE*, 2019. https://doi.org/10.1109/TSE.2019.2912113 — abstract.
22. Mockus, A. and Weiss, D. "Predicting risk of software changes". *Bell Labs Technical Journal*, 2000 (OpenAlex dates it 2002). https://doi.org/10.1002/bltj.2229 — abstract.
23. Kamei, Y. et al. "A Large-Scale Empirical Study of Just-in-Time Quality Assurance". *IEEE TSE* 39(6), 2013. https://doi.org/10.1109/TSE.2012.70 — abstract.
24. Mockus, A. et al. "Leveraging Risk Models to Improve Productivity for Effective Code Un-Freeze at Scale". *ACM TOSEM* 34(7), 2025. https://doi.org/10.1145/3722216, read at https://mockus.org/papers/UnfreezeMeta.pdf — full text (abstract and introduction).
25. Meta Engineering. "Diff Risk Score: AI-driven risk-aware software development" (2025). https://engineering.fb.com/2025/08/06/developer-tools/diff-risk-score-drs-ai-risk-aware-software-development-meta/ — full text (practitioner source).
26. Adams, C. et al. "Automating Low-Risk Code Review at Meta: RADAR, Risk Calibration, and Review Efficiency". arXiv 2605.30208, 2026 (preprint). https://arxiv.org/abs/2605.30208 — full text (abstract, pipeline and eligibility sections).
27. Watanabe, M. et al. "On the Use of Agentic Coding: An Empirical Study of Pull Requests on GitHub". Accepted at *ACM TOSEM*; arXiv 2509.14745v3, 2026. https://arxiv.org/abs/2509.14745 — full text (RQ1, RQ2).
28. Ehsani, R. et al. "Where Do AI Coding Agents Fail? An Empirical Study of Failed Agentic Pull Requests in GitHub". MSR 2026; arXiv 2601.15195. https://arxiv.org/abs/2601.15195 — full text (abstract and RQ1).
29. Siddiq, M. L. et al. "Security in the Age of AI Teammates: An Empirical Study of Agentic Pull Requests on GitHub". arXiv 2601.00477v2, 2026 (preprint). https://arxiv.org/abs/2601.00477 — full text (abstract and review-outcome sections).
30. He, R. et al. "Automating Dependency Updates in Practice: An Exploratory Study on GitHub Dependabot". *IEEE TSE*, 2023. https://arxiv.org/abs/2206.07230 — full text (searched sections). Its figure for the earlier bot comes from Mirhosseini and Parnin, ASE 2017 (not opened).
31. Stack Overflow. *2025 Developer Survey*, AI section. https://survey.stackoverflow.co/2025/ai — full text.
32. Perry, N., Srivastava, M., Kumar, D., Boneh, D. "Do Users Write More Insecure Code with AI Assistants?" CCS 2023; arXiv 2211.03622. https://arxiv.org/abs/2211.03622 — abstract.
33. Microsoft. *SDL Process Guidance*, "Phase 1: Requirements" (archived, c. 2010). https://learn.microsoft.com/en-us/previous-versions/windows/desktop/cc307412(v=msdn.10) — full text. The current SDL practices page (https://www.microsoft.com/en-us/securityengineering/sdl/practices) lists practice names only.
34. GitLab Handbook. "Application Security Review Process". https://handbook.gitlab.com/handbook/security/product-security/security-platforms-architecture/application-security/appsec-reviews/ — full text.
35. Regulation (EU) 2016/679 (GDPR), Article 35, unofficial consolidated text. https://gdpr-info.eu/art-35-gdpr/ — full text.
36. Article 29 Working Party. *Guidelines on Data Protection Impact Assessment*, WP248 rev.01 (2017). https://ec.europa.eu/newsroom/document.cfm?doc_id=47711 — full text (section III.B).
37. Chromium. "Adding third_party Libraries". https://chromium.googlesource.com/chromium/src/+/main/docs/adding_to_third_party.md — full text.
38. OpenSSF Best Practices WG. "Concise Guide for Evaluating Open Source Software" (2025). https://github.com/ossf/wg-best-practices-os-developers/blob/main/docs/Concise-Guide-for-Evaluating-Open-Source-Software.md — full text.
39. Kubernetes SIG Architecture. "API Review Process". https://github.com/kubernetes/community/blob/master/sig-architecture/api-review-process.md — full text.
40. Google. "AIP-100: API Design Review FAQ". https://google.aip.dev/100 — full text.
41. Microsoft. *Azure REST API Guidelines*. https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md — full text (conventions and versioning sections).
42. Rust. RFC process README. https://github.com/rust-lang/rfcs/blob/master/README.md — full text.
43. GOV.UK Service Manual. "Testing for accessibility". https://www.gov.uk/service-manual/helping-people-to-use-your-service/testing-for-accessibility; and GDS Accessibility blog, "What we found when we tested tools on the world's least-accessible webpage" (2017). https://accessibility.blog.gov.uk/2017/02/24/what-we-found-when-we-tested-tools-on-the-worlds-least-accessible-webpage/ — full text.
