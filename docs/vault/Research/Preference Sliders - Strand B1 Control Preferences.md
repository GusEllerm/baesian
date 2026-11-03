---
type: research
status: active
authority: reference
livedocs: snapshot
summary: "How people state how much control they want over automated decisions: levels-of-automation schemes and their failure modes, how preferences are constructed and how strongly defaults win, profiles and learning from behaviour, coding agents' permission models (all gate actions, not decisions, and are converging on a classifier gate), per-repo review policy as configuration, and which risk categories people agree on; with implications for Baesian's preference sliders (D131)."
created: 2026-11-03
tags: [baesian, research]
---

# Preference sliders, strand B1: how people state how much control they want

One of five parallel strands of research before the preference sliders are designed (D131). This strand asks how people state how much control they want, and how well they can. It covers levels of automation, eliciting control preferences in products, coding agents' permission models, per-repo review policy, and which categories of decision people agree on. Background: [[Baesian Design#Routing: when to file a card]], [[Baesian Design#Learning conventions]], [[Contextualising Decisions]] and [[Minimal Card Content]].

The sliders' five positions under discussion are used throughout: **let the agent decide**, **check a sample afterwards**, **tell me but carry on**, **stop and ask**, **never without me**.

Sources are tagged in section 4 by how far I read them: full text, abstract only, or not opened. All web documentation was read on 2026-11-02.

## 1. Key findings

### F1. The classic level scales are well understood, and Baesian's five positions map onto five rungs of one of them

**Sheridan's 10-point scale** (Sheridan & Verplank 1978, as reproduced in Parasuraman, Sheridan & Wickens 2000, Table I) is the most-cited scheme. It describes how far the computer, rather than the human, selects and carries out a decision. Its rungs, quoted from the table:

| Level | Wording (Table I, verbatim) | Baesian position it matches |
|---|---|---|
| 10 | "The computer decides everything, acts autonomously, ignoring the human." | none |
| 9 | "informs the human only if it, the computer, decides to" | none |
| 8 | "informs the human only if asked, or" | **let the agent decide** (logged with a one-line reason, readable on request) |
| between 7 and 8 | no rung: acts, then informs about a *random sample* | **check a sample afterwards** (audit cards, D11) |
| 7 | "executes automatically, then necessarily informs the human, and" | **tell me but carry on** (provisional) |
| 6 | "allows the human a restricted time to veto before automatic execution, or" | **stop and ask** (blocking: waits while you're there, then proceeds provisionally) |
| 5 | "executes that suggestion if the human approves, or" | **never without me** (hard) |
| 4 | "suggests one alternative" | (Baesian shows the agent's pick only after you choose) |
| 3 | "narrows the selection down to a few, or" | what the reviewer actually sees at choice time: two options, pick hidden |
| 2 | "The computer offers a complete set of decision/action alternatives, or" | |
| 1 | "The computer offers no assistance: human must take all decisions and actions." | |

Two things stand out. First, **sampled after-the-fact review has no rung** in any scheme I found; it sits between "necessarily informs" (7) and "informs only if asked" (8). The literature says nothing direct about it. Second, Baesian's hard cards are, at the moment of choice, closer to level 3 than 5, because the pick is hidden until the reviewer chooses (D76, D86). That is the level Parasuraman et al. recommend for risky decisions: "the level of decision automation should not exceed the level of the computer suggesting (but not executing) a preferred alternative".

**Parasuraman, Sheridan & Wickens (2000)** add a second axis: four *stages* (information acquisition, information analysis, decision and action selection, action implementation), each automated to its own level. All Baesian cards are about stages 3 and 4: the agent has already analysed and chosen. They also define risk as the cost of an error times its probability, and argue: "For decisions involving relatively little risk, therefore, out-of-the-loop problems are unlikely to have much impact, even if there is a complete automation failure. Such decisions are strong candidates for high-level automation." Conversely, if people "had to be continually involved in making each of these relatively simple decisions, they could be so overloaded as to prevent them from carrying out other more important functions." This is the case for routing by impact and reversibility, which Baesian already does.

**Endsley & Kaber (1999)** give a 10-level taxonomy that assigns four functions (monitoring, generating options, selecting, implementing) to the human, the computer, or both: manual control, action support, batch processing, shared control, decision support, blended decision making, rigid system, automated decision making, supervisory control, full automation (table reproduced in Save & Feuerberg 2012). It is less used in product design than Sheridan's.

**SAE J3016** (driving automation, levels 0 to 5) is the best-known scale outside human factors. Its axis is different: who drives, and who is the fallback when something goes wrong. Koopman's guide to it stresses that "J3016 is a terminology standard, not a safety standard", and that "Higher level numbers have more automation, but they might not be safer or otherwise 'better.'" The trouble concentrates in the middle: Level 2 is "proving problematic due to the issue of driver complacency", and Level 3 "breeds significant confusion as to driver role".

**For AI agents**, Feng, McDonald & Zhang (2025) define five levels by the *user's role*: operator, collaborator, consultant, approver, observer. At L4 (approver) "the user is only required to interact with the agent when the agent encounters a blocker it cannot resolve on its own", and the user may "specify which actions require approval". They warn: "User disengagement can lower the care with which they approve actions and can result in unintended approvals."

### F2. Each level has a known failure, and the failures move as automation rises

Terms: **situation awareness** is knowing what is going on and what will happen next. **Complacency** is under-monitoring automation that is usually right. **Automation bias** is following an automated recommendation instead of checking it: *omission* errors (missing a problem the automation didn't flag) and *commission* errors (doing what it said when it was wrong). **Misuse** is over-reliance; **disuse** is neglecting automation you no longer trust.

- **The trade-off is robust.** A meta-analysis of 18 experiments (Onnasch, Wickens, Li & Manzey 2014) found "a clear automation benefit for routine system performance with increasing DOA [degree of automation], a similar but weaker pattern for workload ... and a negative impact of higher DOA on failure system performance and SA." The cost appears at a boundary: "negative consequences of automation seem to be most likely when DOA moved across a critical boundary, which was identified between automation supporting information analysis and automation supporting action selection." They conclude that "appropriate function allocation can serve only one of the two aspects." Every Baesian position below "never without me" is past that boundary: the agent selects.
- **Taking people out of implementation hurts recovery.** Endsley & Kaber (1999, 30 participants): "removal of the operator from task implementation is detrimental to performance recovery if the automated system fails." Also: "Joint human/system option generation significantly degraded performance in comparison to human or automated option generation alone."
- **Complacency grows with other work.** It is "greatest when the operator is engaged in multiple tasks and less apparent when monitoring the automated system is the only task" (Parasuraman et al. 2000). Parasuraman & Manzey (2010): complacency "is found in both naive and expert participants and cannot be overcome with simple practice"; automation bias "occurs in both naive and expert participants, cannot be prevented by training or instructions, and can affect decision making in individuals as well as in teams." A developer answering cards between other work is the multi-task case.
- **False alarms cause disuse.** "Disuse, or the neglect or underutilization of automation, is commonly caused by alarms that activate falsely" (Parasuraman & Riley 1997). For Baesian, a card that didn't need the person is a false alarm.
- **Approval becomes rubber-stamping.** Anthropic built Claude Code's auto mode because of "approval fatigue": "in practice users accept 93% of them anyway" (Anthropic, March 2026). Its earlier sandboxing work "safely reduces permission prompts by 84%" (October 2025).
- **Rare problems are missed.** In visual screening, "if observers do not find what they are looking for fairly frequently, they often fail to notice it when it does appear" (Wolfe, Horowitz & Kenner 2005, abstract). This is the risk for audit cards: if almost every sampled decision was fine, the reviewer stops looking.

Mapped to the positions:

| Position | Characteristic failure | Evidence |
|---|---|---|
| never without me | approval fatigue; anchoring on the agent's case | 93% acceptance (Anthropic 2026); automation bias (Parasuraman & Manzey 2010) |
| stop and ask | the same, plus interruption cost; the timeout makes it a veto window | level 6 (Table I); disuse from false alarms |
| tell me but carry on | commission: work piles up on a decision before the answer comes; late answers ignored | out-of-the-loop costs (Onnasch 2014; Endsley & Kaber 1999) |
| check a sample afterwards | low-prevalence misses; complacency | Wolfe 2005 (abstract); Parasuraman et al. 2000 |
| let the agent decide | loss of situation awareness and skill; nobody notices drift | Onnasch 2014; Parasuraman et al. 2000 |

### F3. The level schemes are contested as design tools; delegation by task is the better-supported framing

A 2017–18 debate in the *Journal of Cognitive Engineering and Decision Making* questioned whether level schemes help design. Kaber (2018) lists "presumptions of human behavior with automation" and "imprecision in defining behavioral constructs". Jamieson & Skraaning (2018) "paint LOA frameworks as abstractions suffering a crisis of confidence". Sheridan himself (2018) notes "the difficulty, even impossibility, of making level-of-automation taxonomies into readily useful tools for system design." Wickens (2018) defends the stages-and-levels trade-off as still useful. (All four read as abstracts only.)

Miller & Parasuraman (2007) propose the alternative most relevant here: to "revise the concept of a 'level of automation' as a pattern of task-based roles and authorizations", with the human delegating each task at a chosen level. They report that this *adaptable* automation (the person sets it) can give "improved situation awareness, more accurate automation usage, more balanced mental workload, increased user acceptance". Per-category sliders are exactly a pattern of task-based authorisations. The evidence supports using the levels as shared vocabulary, not as predictions of which setting is right.

### F4. People don't hold control preferences ready-made; they construct them when asked

**Preference construction** is the finding that people often build a preference at the moment they're asked, from whatever the question highlights, rather than read it from a stable list. Slovic (1995): "Preferences appear to be remarkably labile, sensitive to the way a choice problem is described or 'framed' and to the mode of response used to express the preference", so that "beliefs and preferences are often constructed—not merely revealed—in the elicitation process." It applies most to choices "that are important, complex, and perhaps unfamiliar", where "preferences are not simply read off some master list but are constructed on the spot by an adaptive decision maker (Payne, Bettman, & Johnson, 1992, 1993)." **Procedure invariance**, the assumption that asking in equivalent ways gives the same answer, fails. In one study Slovic reviews (Tversky et al. 1990), people's choices and their prices for the same bets disagreed at "the usual rate of preference reversal (between 40% and 50%)", and "the remaining 90%" of reversal patterns, after the intransitive ones, "violated procedure invariance".

Privacy research shows the same for settings. Acquisti, Brandimarte & Loewenstein (2015, abstract) organise it around "people's uncertainty about the consequences of privacy-related behaviors and their own preferences over those consequences", "the context-dependence" of concern, and how "malleable" it is. Liu et al. (2016) build their privacy assistant on observed settings because "self-reported preferences may not necessarily reflect actual privacy behavior". When people are forced to choose, many can't: under Virginia's mandated choice for organ donation, "about 24% of the first million Virginians asked said they were undecided" (Johnson & Goldstein 2003).

For Baesian, asking someone in the abstract how much "schema" decision they want to see, before they've seen any schema cards, is the hard case: unfamiliar, complex, consequences unknown.

### F5. Defaults decide most settings, and people rarely fix them

- **Defaults have large effects.** In Johnson & Goldstein's online experiment (161 respondents), "Revealed donation rates were about twice as high when opting-out as when opting-in", and opt-out "did not differ significantly from the neutral condition". They give three mechanisms: a default reads as a recommendation; accepting it takes no effort; and it is the status quo, so changing it feels like a loss.
- **Meta-analysis:** 58 studies, pooled n = 73,675, "d = 0.68, 95% confidence interval = 0.53–0.83", with defaults "more effective when they operate through endorsement (defaults that are seen as conveying what the choice architect thinks the decision-maker should do) or endowment" (Jachimowicz et al. 2019). (A d of 0.68 is a medium-to-large effect.)
- **Settings stay at defaults and are often wrong.** On Facebook, "36% of content remains shared with the default" settings, settings "match users' expectations only 37% of the time", and changed settings "only match expectations 39% of the time" (Liu, Gummadi, Krishnamurthy & Mislove 2011). In another study "every one of the 65 participants ... had at least one confirmed sharing violation", and "a majority of users cannot or will not fix such errors" (Madejski, Johnson & Bellovin 2012, abstract). Of 51 Unix users followed for four months, "many people do not take advantage of the customization features at all" (Mackay 1991, abstract).
- **Coding agents show defaults and drift together.** Claude Code's default required approval of each action. Users with under 50 sessions use full auto-approve in about 20% of sessions, rising to "over 40%" by 750 sessions; Anthropic notes "part of this transition may reflect users configuring the product" (Anthropic, February 2026). Experienced users also interrupt more (about 5% of turns for new users, about 9% for experienced ones): oversight moves from approving each action to monitoring and stepping in. Since v2.1.283 Claude Code's built-in starting mode is auto mode (a classifier gate) on every plan (Claude Code docs).

### F6. Profiles chosen from a few questions beat a grid of settings; continuous sliders do worse than discrete steps

- **A few profiles capture most preferences.** Lin et al. (2014) clustered people's comfort with app permissions by purpose into four profiles. Each profile set every permission to **Accept**, **Reject** or **Prompt**, the same three-way split as "agent decides / never / ask". Four profiles predicted individual preferences with 79.37% accuracy, against 55.82% for one profile for everyone, and cut the settings a person had to answer to 36.5% instead of "nearly 87%".
- **Five questions are enough to assign one, and people keep it.** Liu et al. (2016, field study, n = 72) assigned users to a profile with "5 questions at most". "78.7% of the recommendations made by the PPA were adopted", and participants later changed only 5.1% of them, despite daily nudges to review.
- **More options aren't harmful in themselves, but uncertainty makes them so.** A meta-analysis of 50 experiments found choice overload's "mean effect size of virtually zero but considerable variance" (Scheibehenne, Greifeneder & Todd 2010). A later one (99 observations) found overload is reliable under "higher levels of decision task difficulty, greater choice set complexity, higher preference uncertainty, and a more prominent, effort-minimizing goal" (Chernev, Böckenholt & Goodman 2015). A grid of nine categories by five positions, set before any cards exist, has all four.
- **Continuous sliders are slower and drop more answers.** In web surveys, slider-style visual analogue scales gave the same distributions as radio buttons but "higher rates of missing data and longer completion times" (Couper et al. 2006); sliders had "higher break-off rates (odds ratio = 6.9) and substantially higher response times" (Funke, Reips & Thomas 2011). Both are survey studies with older technology, so transfer to a settings page is weak, but neither favours a continuous control.

### F7. Learning from behaviour works, but needs a volume knob the person sets, and changes the person can see and accept

- **Per-person learning plus a person-set threshold.** Gmail's Priority Inbox learns importance from what each user does. Its authors write that "users disagree on what is important", "users do not agree on the cost of a false positive versus a false negative", and there was "a huge variation between user preferences for volume of important mail, which can not be correlated with their actions. Thus, we need some manual intervention from users to tune their threshold." On 160,000 user corrections, error fell from 45% (global model) to 38% (per-user models) to 31% (per-user models and thresholds) (Aberdeen, Pacovsky & Slater 2010). This is close to the user's gate idea: a classifier ranks, and the slider is the person's threshold.
- **Proposed rules the person accepts.** PrefMiner mined notification rules and showed each one for consent, because with opaque models "it is nearly impossible for users to understand these models and provide their feedback." In a 15-day field study with 16 people it "suggested 179 rules and 56.98% of these rules were accepted"; filtering then had "a recall of 45.81% and a precision of 100% as all filtering rules were accepted by the users" (Mehrotra, Hendley & Musolesi 2016). **Precision** is the share of withheld items that should have been withheld; **recall** is the share of should-be-withheld items that were. This is the convention card (D16) applied to routing.
- **Behaviour is as good a signal as asking.** For notification preferences, a model personalised from user actions gained 39% over a generic one, against 42% from labels solicited from users, "while using observable user actions causes no extra disruption" (Li et al. 2022, abstract). Users "referred to notification content factors more frequently than contextual factors". Clicks are "informative but biased" by presentation, while "relative preferences derived from clicks are reasonably accurate on average" (Joachims et al. 2005, abstract).
- **Controls that don't visibly work lose trust.** In Mozilla's study of 22,722 YouTube users, "Not interested" prevented about 11% of unwanted recommendations, "Dislike" about 12%, "Remove from watch history" about 29%, and "Don't recommend channel" about 43%; 39.3% of surveyed users felt using the controls had no effect at all (Ricks & McCrosky, Mozilla 2022).

### F8. Coding agents' permission models gate actions, not decisions, and are converging on a classifier gate with hard floors

Every product I checked sets permissions by **tool, command, file path or network**, not by kind of design decision. The middle ground is now usually a model that judges each action, with fixed lists that always ask.

| Product | Levels or modes | Rule axes | Classifier gate | Always asks / floors | Scopes |
|---|---|---|---|---|---|
| **Claude Code** | default (Manual), acceptEdits, plan, auto, dontAsk, bypassPermissions | tool and specifier: Bash commands, Read and Edit paths, WebFetch domains, MCP tools; "deny, then ask, then allow" | auto mode: "A separate classifier model reviews actions before they run" | explicit ask rules and critical-path removals in every mode; writes to protected paths (.git, .claude and others) outside bypass mode | managed settings highest; project settings shared in git, local ones personal; "If a tool is denied at any level, no other level can allow it" |
| **Codex** | sandbox: read-only, workspace-write, danger-full-access; approval: on-request, never, granular (untrusted retired) | sandbox escalations, exec-policy rules, skills, MCP, permission requests (granular toggles) | `approvals_reviewer = "auto_review"`, which "evaluates only actions that already need approval" | managed `allowed_approval_policies` | user config; project trust; managed requirements |
| **Copilot cloud agent** | none for the user | branch, workflows, firewall | none | pushes only to its own copilot/ branch; "Prevents the user who asked ... from approving it"; workflows don't run "until Copilot cloud agent's code is reviewed" | repo branch protection and rulesets apply |
| **Cursor** | Auto-review (default since 3.6), Allowlist, Run Everything | shell, MCP, Fetch; sandbox file and network limits | backend classifier; "Auto-review is not a security boundary" | browser, file deletion, files outside the workspace | user and project files merge; "Team settings take precedence" |
| **Cline** | per-category toggles; YOLO | read, edit (project or all), commands (safe or all), browser, MCP | the agent's model marks each command "with a requires_approval flag" | docs advise leaving "edits, commands, browser, and MCP off" | per user |
| **Gemini CLI** | default, autoEdit, plan, yolo | tool name, command prefix, argument regex | none | admin tier | default < extension < workspace < user < admin; workspace tier "currently non-functional" |
| **Devin CLI** | Normal, Accept Edits, Smart, Bypass, Autonomous | Read, Write, Exec, Fetch, MCP | Smart: "a fast model judges whether the action is safe to run unattended"; if it's uncertain or unavailable, you get the prompt | package installs, mutating git, rm and sudo always prompt | org > session > project local > project > user; "A deny rule always wins" |

What this shows:

- **Nobody routes by design-decision category.** The closest is Claude Code auto mode's default block rules, grouped as "Destroy or exfiltrate", "Degrade security posture", "Cross trust boundaries" and "Bypass review or affect others". Its defaults block "Production deploys and migrations", "Granting IAM or repo permissions" and "Force push" (Claude Code docs). These overlap with Baesian's hard defaults (security, data loss, publishing).
- **The gates' error rates are published, and misses are real.** Claude Code's classifier (Sonnet 4.6, two stages: a fast filter told to "err toward blocking", then reasoning only on flagged actions) had a 0.4% false-positive rate on 10,000 real actions, but a 17% false-negative rate on 52 real overeager actions, which the authors call "the honest number" (Anthropic, March 2026). A **false positive** here is asking when it didn't need to; a **false negative** is letting through what should have been stopped.
- **The gate is kept apart from the agent's reasoning.** Claude Code's classifier sees only user messages and tool calls; agent text and tool outputs are stripped, making it "reasoning-blind by design", so the agent can't argue its way past it.
- **The gates fall back to the person.** Claude Code pauses auto mode after 3 blocks in a row or 20 in total (not configurable); Devin's Smart mode prompts when the model is unsure.
- **People can tighten in plain words.** In Claude Code, "If you tell Claude 'don't push' or 'wait until I review before deploying', the classifier blocks matching actions even when the default rules would allow them."
- **Approving can teach.** Claude Code's "Yes, and don't ask again" saves a Bash command rule "Permanently per repository and command".
- **Agents already make decisions part of their work.** Of the times Claude Code stops itself, 35% are "Presenting a choice between proposed approaches"; and 0.8% of API actions "appear to be irreversible" (Anthropic, February 2026).

### F9. Per-repo review policy: keep it in the repo, merge strictest-wins, inherit down the tree, dry-run before enforcing

- **Policy lives beside the code and is versioned with it.** GitHub's CODEOWNERS file sits in .github/, the root or docs/; the base branch's copy applies; "the last matching pattern takes the most precedence"; code owners "are automatically requested for review". Failures are silent: an invalid line "will be skipped", and an owner without access "will not be assigned" (GitHub docs).
- **Ownership inherits down the directory tree, with rare opt-outs.** In Chromium, "an owner must provide a review for each directory you are touching", and "Owners files are recursive". The opt-out (set noparent) "should be rarely used", and only for approved uses. Categories are routed by path pattern: only security owners can review IPC message files (per-file \*_messages\*.h with //ipc/SECURITY_OWNERS). An Owners-Override label lets named roles bypass (Chromium docs). At Google, OWNERS are "hierarchically additive", and every change needs three approvals (a peer's LGTM, an owner, and "readability" in the language: approval from someone certified in its style), though "most reviews have one person assuming all three roles" (*Software Engineering at Google*, ch. 9).
- **Layers merge strictest-wins.** GitHub rulesets are aggregated with no priority: "the most restrictive version of the rule applies". Claude Code: "a user-level deny blocks a project-level allow". Devin: "Organization-level deny and ask rules cannot be overridden by project or user config." Cursor: "Team settings take precedence". Gerrit's code-owners plugin lets projects inherit settings and override them, while list settings are "extended, not overridden"; it also names the case where no rule matches ("fallback code owners": owned by nobody, or by everyone).
- **Dry runs exist for policy.** A GitHub ruleset in Evaluate mode is "not ... enforced, but you will be able to monitor which actions would or would not violate rules" (Rule Insights). Policy is visible: "Anyone with read access to a repository can view its active rulesets."
- **A repo's own policy file is a security surface.** Gemini CLI's workspace (per-repo) policy tier is "currently non-functional"; Codex lets a user mark a project untrusted, which "disables project-local configuration"; Claude Code never auto-approves writes to .claude and .git outside bypass mode. Whoever, or whatever, can edit the repo can edit a policy kept in it, including the agent.
- **Team defaults with personal additions** is the common shape: Claude Code says "You can check permission settings into version control to share them with every developer in your organization, and each developer can customize their own", with personal settings in a local file. Any layer can add a deny; no layer can lift one.

### F10. People agree on consequence-shaped categories more than on judgement-shaped ones, but no study measures Baesian's nine facts

No study I found measures how far developers agree on categories like "schema" or "user-facing". The indirect evidence:

- **Risk criteria differ by person and team.** In a year-long study of more than 450 developers in over 60 teams, "different developers and different teams have their own criteria for determining risky changes"; models per developer improved precision by 87% over random, models per team by 37%; and "when a change has many related changes, the reliability of developers in marking risky changes is negatively affected" (Shihab et al. 2012, abstract).
- **Category labels are often wrong.** In more than 7,000 issue reports, "33.8% of all bug reports [were] misclassified" (Herzig, Just & Zeller 2013, abstract). In five public datasets, 749 security bug reports were "originally mislabeled as Non-SBRs" (Wu et al. 2021, abstract). Security is both high-stakes and easy to miss.
- **Mechanically checkable categories are mostly, not always, labelled right.** Of 119,879 Maven library upgrades, "83.4% of these upgrades do comply with semantic versioning", and only 7.9% of clients were affected by breaking changes (Ochoa et al. 2022, abstract). Across 18 package ecosystems, communities share values "such as stability and compatibility, but differ in other values" on breaking changes (Bogart et al. 2021, abstract).
- **What people care about is purpose and consequence.** Lin et al. (2014) found that comfort with a permission depends on *why* the app uses it. People explain their notification preferences by content more than context (Li et al. 2022). The coding-agent gates group their rules by harm (F8).
- **Where humans revise agents' work.** Of 567 Claude Code pull requests in 157 projects, 83.8% were merged and 54.9% of those unmodified; the rest needed changes "especially for bug fixes, documentation, and adherence to project-specific standards" (Watanabe et al. 2026, abstract).
- **Classifiers of design talk don't transfer between projects.** For mining design discussions, "conclusion stability ... is generally poor. A classifier trained on a given dataset of software projects has so far not worked well on different artifacts or different datasets" (Mahadi, Tongay & Ernst 2020).

My reading, which is an inference: categories named by a consequence the person recognises (spends money, deletes data, publishes, touches security) are the easiest to state preferences about. Categories named by mechanism (schema, module boundary, dependency) are the easiest to detect from a diff, and Baesian's gate already does. "User-facing" and "security" depend most on judgement and are the most likely to be missed.

## 2. Implications for Baesian

Each implication cites the findings it rests on and says how strong that evidence is. None is decided; the ones that change a format or the routing are decision cards for the user.

1. **Use the five positions, named by what happens, not by numbers** (F1, F3). Each maps onto a known rung (levels 8, 7, 6 and 5, with "check a sample" in between), so the vocabulary is defensible. Label them with verbs ("decides and logs it", "asks, then carries on if you're away"), not "level 3": numbers imply the higher one is better, which J3016's critics warn against. Strong evidence for the mapping; none that any one position is right for a category.

2. **Make each category's setting a five-stop control, not a continuous slider** (F6). Discrete stops are what the positions are. Continuous sliders were slower and lost more answers in surveys, and a segmented control also works on the phone layout (D130). Weak evidence (survey studies), but nothing argues the other way.

3. **Start from a few presets, chosen by answering example decisions, not from a blank grid** (F4, F5, F6). Ask three to five "would you want to see this one?" questions, ideally with real cards from this repo once some exist, assign a preset, and let people adjust single categories afterwards. The privacy-profile evidence (four profiles, at most five questions, 78.7% kept) is the strongest support here; it comes from app permissions, not design decisions.

4. **Treat the default positions as policy, and say why each is set** (F5). Most repos will keep them, and people read a default as a recommendation. Choosing them is a user-facing decision for a card. Keep today's hard defaults (security, money, data loss, publishing; D42) as the starting point: they match where every coding-agent gate puts its fixed "always ask" lists (F8). Strong evidence on defaults; industry practice, not experiment, for the floors.

5. **Give the hard categories a floor the sliders can't go below** (F2, F8, F9). Every agent product keeps some actions no mode auto-approves, and review systems keep "set noparent"-style opt-outs rare and approved. One option: "never without me" by default for the four hard categories, with "stop and ask" as the lowest allowed. Industry practice.

6. **Let the gate fail toward the person, and keep it apart from the agent** (F2, F8, F10). A missed card is a hard-to-undo decision taken silently; an extra card costs a swipe. So: route deterministically from the gate's detectors and the stated facts wherever they apply; use a classifier (an agent, rules, or an external model such as Jev) only for the middle positions; send uncertain cases to the person, as Devin's Smart mode does. The agent that filed a card shouldn't also decide whether its card reaches anyone: the gate should see the card's facts, not the agent's case, as Claude Code's classifier is "reasoning-blind by design". Expect misses (17% on real overeager actions in Claude Code's own test), and expect a classifier tuned on one repo not to transfer to another. Moderate evidence: one vendor's published numbers and one transfer study.

7. **Draw audit cards from what the gate held back** (F2, F7, D11, D126). If "check a sample afterwards" samples the cards the gate withheld, the audit rate *is* the gate's measured false-negative rate per category, and an overturn is direct evidence a setting is too loose. Guard against rubber-stamping: show the alternative as on any card, keep audit runs short, and watch for long runs of "no change". The low-prevalence effect suggests that if sampled decisions are almost always fine, reviewers will miss the rare bad one. No evidence covers sampled after-the-fact review of decisions directly; this is the biggest gap in the literature.

8. **Learn from answers, but change the settings only through proposals the person accepts** (F7). A convention card can propose "you've overturned 3 of 4 dependency audits: ask about dependencies?" or "you accepted every module-boundary card this month: let the agent decide?". Show each change's effect on recent history: "this would have held back 6 of your last 20 cards; you overturned 1 of them". Gmail's threshold, PrefMiner's accepted rules and the ineffective YouTube buttons all point the same way. Moderate evidence, from email and notifications rather than code.

9. **Keep the preferences in the repo, versioned, strictest-wins, with a dry run** (F9, D127). Store them with the record (D34) so they travel with the code and are visible to anyone who can read the repo. A change that loosens them should itself be a hard card, and agents shouldn't edit the file unprompted, because a policy in the repo can be edited by whatever edits the repo. Offer an evaluate mode first: run the gate in shadow, show what it would have withheld, then switch it on. Path-scoped overrides like CODEOWNERS ("anything under migrations/ is never without me") could sit alongside categories. Strong precedent in practice docs; no experiments.

10. **Name the slider rows by consequence, and keep detection separate from preference** (F10). People state preferences about what a decision does. The gate detects how it shows up in a diff. A row can cover several detectors (dependency, schema, CI files) under one consequence the person recognises. Reversibility (cheap, moderate, one-way) is the other half of Parasuraman et al.'s definition of risk; one option is for it to shift a card one stop stricter or looser rather than be a row of its own. This is a design proposal on indirect evidence.

11. **Revisit the settings as people gain experience** (F5). Claude Code users moved from approving each action to monitoring and interrupting over hundreds of sessions. A prompt to review settings after, say, 50 answers, with the overturn data from point 7, fits that drift better than set-once settings.

## 3. Open questions

- **Do people agree on Baesian's nine facts?** No study answers this. A cheap check: two people (or the user and a fresh agent) label the same 50 past decisions from this repo's record against the nine facts, and agreement is measured per fact. Facts with low agreement make poor slider rows.
- **Personal settings inside a per-repo policy.** D131 rejected per-person sliders. The evidence that people and teams differ in their risk criteria (Shihab 2012; Gmail) suggests the hosted service, with several reviewers per repo, may need strictest-wins personal additions: anyone may ask to see more, only the repo may let the agent decide more. That needs a card once there's more than one reviewer.
- **Is "check a sample afterwards" a level people understand and use well?** It has no rung in the literature. What sample rate keeps reviewers alert without wasting their time?
- **Where does the gate run, and who can audit it?** The agent, rules, or an external classifier. If it's an external model, what does the hosted service send it (what the service collects is still open), and how are its errors per repo shown to the person?
- **What happens to a card whose category is uncertain?** The evidence says ask, but too many false alarms lead to disuse (Parasuraman & Riley 1997).
- **How should the gate's misses be counted when an audit isn't answered?** An unanswered audit card can't count as "fine".
- **Does setting per-category positions work on a phone?** None of the evidence here was gathered on phones.

## 4. Sources

**Read:** full text unless marked. **[abstract]**: abstract only (mostly through OpenAlex). **[via X]**: cited through another source, original not read. **[unverified]**: couldn't open.

Levels of automation
1. Parasuraman, R., Sheridan, T. B., & Wickens, C. D. (2000). A model for types and levels of human interaction with automation. *IEEE Trans. SMC-A*, 30(3), 286–297. https://doi.org/10.1109/3468.844354. Full text: https://www.cs.uml.edu/~holly/91.549/readings/sheridan-autonomy.pdf **[full; Table I read from the page image]**
2. Sheridan, T. B., & Verplank, W. L. (1978). *Human and computer control of undersea teleoperators*. MIT report. https://doi.org/10.21236/ada057655 **[abstract; scale read via source 1]**
3. Endsley, M. R., & Kaber, D. B. (1999). Level of automation effects on performance, situation awareness and workload in a dynamic control task. *Ergonomics*, 42(3). https://doi.org/10.1080/001401399185595 **[abstract; levels table via source 4]**
4. Save, L., & Feuerberg, B. (2012). Designing human-automation interaction: a new level of automation taxonomy. HFES Europe. https://www.hfes-europe.org/wp-content/uploads/2014/06/Save.pdf **[full]**
5. Onnasch, L., Wickens, C. D., Li, H., & Manzey, D. (2014). Human performance consequences of stages and levels of automation: an integrated meta-analysis. *Human Factors*, 56(3), 476–488. https://doi.org/10.1177/0018720813501549. Full text: https://depositonce.tu-berlin.de/bitstreams/6a0b7962-cb5f-4317-9d07-ee11707dd51f/download **[full]**
6. Parasuraman, R., & Riley, V. (1997). Humans and automation: use, misuse, disuse, abuse. *Human Factors*, 39(2). https://doi.org/10.1518/001872097778543886 **[abstract]**
7. Parasuraman, R., & Manzey, D. H. (2010). Complacency and bias in human use of automation: an attentional integration. *Human Factors*, 52(3). https://doi.org/10.1177/0018720810376055 **[abstract]**
8. The *JCEDM* debate on levels of automation, all **[abstract]**: Kaber, D. B. (2018), Issues in human–automation interaction modeling, https://doi.org/10.1177/1555343417737203; Jamieson, G. A., & Skraaning, G. (2018), Levels of automation in human factors models for automation design, https://doi.org/10.1177/1555343417732856; Sheridan, T. B. (2018), Comments on Kaber, https://doi.org/10.1177/1555343417724964; Wickens, C. D. (2018), Automation stages & levels, 20 years after, https://doi.org/10.1177/1555343417727438
9. Miller, C. A., & Parasuraman, R. (2007). Designing for flexible interaction between humans and automation: delegation interfaces for supervisory control. *Human Factors*, 49(1), 57–75. https://doi.org/10.1518/001872007779598037 **[abstract]**
10. Koopman, P. *SAE J3016 user guide*. https://users.ece.cmu.edu/~koopman/j3016/ **[full]**. SAE J3016 itself (https://www.sae.org/standards/j3016-taxonomy-definitions-terms-related-driving-automation-systems-road-motor-vehicles) **[unverified: couldn't open; read via Koopman]**
11. Feng, K. J. K., McDonald, D. W., & Zhang, A. X. (2025). Levels of autonomy for AI agents. arXiv:2506.12469. https://arxiv.org/abs/2506.12469 **[full]**
12. Wolfe, J. M., Horowitz, T. S., & Kenner, N. M. (2005). Rare items often missed in visual searches. *Nature*, 435, 439–440. https://doi.org/10.1038/435439a **[abstract; PMC full text blocked]**

Eliciting preferences, defaults, profiles, learning
13. Slovic, P. (1995). The construction of preference. *American Psychologist*, 50(5), 364–371. https://bear.warrington.ufl.edu/brenner/mar7588/Papers/slovic-ampsy1995.pdf **[full]**
14. Payne, J. W., Bettman, J. R., & Johnson, E. J. (1992). Behavioral decision research: a constructive processing perspective. *Annual Review of Psychology*, 43, 87–131. https://doi.org/10.1146/annurev.ps.43.020192.000511 **[via Slovic 1995; a scanned PDF was downloaded but not read]**
15. Acquisti, A., Brandimarte, L., & Loewenstein, G. (2015). Privacy and human behavior in the age of information. *Science*, 347(6221). https://doi.org/10.1126/science.aaa1465 **[abstract]**
16. Johnson, E. J., & Goldstein, D. (2003). Do defaults save lives? *Science*, 302(5649), 1338–1339. https://www.dangoldstein.com/papers/DefaultsScience.pdf **[full]**
17. Jachimowicz, J. M., Duncan, S., Weber, E. U., & Johnson, E. J. (2019). When and why defaults influence decisions: a meta-analysis of default effects. *Behavioural Public Policy*, 3(2). https://doi.org/10.1017/bpp.2018.43 **[full; figures quoted from its abstract]**
18. Liu, Y., Gummadi, K. P., Krishnamurthy, B., & Mislove, A. (2011). Analyzing Facebook privacy settings: user expectations vs. reality. IMC 2011. https://mislove.org/publications/Privacy-IMC.pdf **[full]**
19. Madejski, M., Johnson, M., & Bellovin, S. M. (2012). A study of privacy settings errors in an online social network. PerCom Workshops. https://doi.org/10.1109/percomw.2012.6197507 **[abstract]**
20. Mackay, W. E. (1991). Triggers and barriers to customizing software. CHI 1991. https://doi.org/10.1145/108844.108867 **[abstract]**
21. Lin, J., Liu, B., Sadeh, N., & Hong, J. I. (2014). Modeling users' mobile app privacy preferences: restoring usability in a sea of permission settings. SOUPS 2014. https://www.usenix.org/system/files/conference/soups2014/soups14-paper-lin.pdf **[full]**
22. Liu, B., Andersen, M. S., Schaub, F., et al. (2016). Follow my recommendations: a personalized privacy assistant for mobile app permissions. SOUPS 2016. https://www.usenix.org/system/files/conference/soups2016/soups2016-paper-liu.pdf **[full]**
23. Scheibehenne, B., Greifeneder, R., & Todd, P. M. (2010). Can there ever be too many options? A meta-analytic review of choice overload. *Journal of Consumer Research*, 37(3). https://doi.org/10.1086/651235 **[abstract]**
24. Chernev, A., Böckenholt, U., & Goodman, J. (2015). Choice overload: a conceptual review and meta-analysis. *Journal of Consumer Psychology*, 25(2). https://doi.org/10.1016/j.jcps.2014.08.002 **[abstract]**
25. Couper, M. P., Tourangeau, R., Conrad, F. G., & Singer, E. (2006). Evaluating the effectiveness of visual analog scales: a web experiment. *Social Science Computer Review*, 24(2). https://doi.org/10.1177/0894439305281503 **[abstract]**
26. Funke, F., Reips, U.-D., & Thomas, R. K. (2011). Sliders for the smart: type of rating scale on the web interacts with educational level. *Social Science Computer Review*, 29(2). https://doi.org/10.1177/0894439310376896 **[abstract]**
27. Mehrotra, A., Hendley, R., & Musolesi, M. (2016). PrefMiner: mining user's preferences for intelligent mobile notification management. UbiComp 2016. https://www.mircomusolesi.org/papers/ubicomp16.pdf **[full]**
28. Li, T., Haines, J. K., Flores Ruiz De Eguino, M., Hong, J., & Nichols, J. (2022). Alert now or never: understanding and predicting notification preferences of smartphone users. *ACM TOCHI*. https://doi.org/10.1145/3478868 **[abstract]**
29. Aberdeen, D., Pacovsky, O., & Slater, A. (2010). The learning behind Gmail Priority Inbox. Google research note (NIPS 2010 workshop). https://static.googleusercontent.com/media/research.google.com/en//pubs/archive/36955.pdf **[full]**
30. Joachims, T., Granka, L., Pan, B., Hembrooke, H., & Gay, G. (2005). Accurately interpreting clickthrough data as implicit feedback. SIGIR 2005. https://doi.org/10.1145/1076034.1076063 **[abstract]**
31. Ricks, B., & McCrosky, J. (2022). *Does this button work? Investigating YouTube's ineffective user controls*. Mozilla Foundation. https://assets.mofoprod.net/network/documents/Mozilla-Report-YouTube-User-Controls.pdf **[full]**

Coding agents' permission models (official docs and vendor research, read 2026-11-02)
32. Claude Code docs: *Configure permissions*, https://code.claude.com/docs/en/permissions, and *Permission modes*, https://code.claude.com/docs/en/permission-modes **[full; the second read to about 100,000 of its 119,000 characters]**
33. Anthropic (2026-03-25). *How we built Claude Code auto mode*. https://www.anthropic.com/engineering/claude-code-auto-mode **[full]**
34. Anthropic (2025-10-20). *Claude Code sandboxing*. https://www.anthropic.com/engineering/claude-code-sandboxing **[full]**
35. Anthropic (2026-02-18). *Measuring AI agent autonomy in practice*. https://www.anthropic.com/research/measuring-agent-autonomy **[full]**
36. OpenAI Codex docs: *Agent approvals and security*, https://learn.chatgpt.com/docs/agent-approvals-security (redirected from developers.openai.com/codex), and the AskForApproval and sandbox-mode definitions in the openai/codex repository (via Context7) **[full]**
37. GitHub docs: *Copilot cloud agent: risks and mitigations*. https://docs.github.com/en/copilot/concepts/agents/coding-agent/risks-and-mitigations **[full]**
38. Cursor docs: *Run modes*. https://cursor.com/docs/agent/security/run-modes **[full]**
39. Cline docs: *Auto approve & YOLO mode*. https://docs.cline.bot/features/auto-approve **[full]**
40. Gemini CLI docs: *Policy engine*. https://geminicli.com/docs/reference/policy-engine/ **[full]**
41. Devin docs: *Devin CLI permissions*. https://docs.devin.ai/cli/reference/permissions **[full]**

Per-repo review policy
42. GitHub docs: *About code owners*, https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners; *About rulesets*, https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets; *Creating rulesets for repositories in your organization* (Evaluate mode), https://docs.github.com/en/enterprise-cloud@latest/organizations/managing-organization-settings/creating-rulesets-for-repositories-in-your-organization **[full]**
43. Chromium docs: *Code reviews* (OWNERS files). https://chromium.googlesource.com/chromium/src/+/main/docs/code_reviews.md **[full]**
44. Winters, T., Manshreck, T., & Wright, H. (2020). *Software Engineering at Google*, ch. 9, Code review. https://abseil.io/resources/swe-book/html/ch09.html **[full]**
45. Gerrit code-owners plugin: *Configuration*. https://gerrit.googlesource.com/plugins/code-owners/+/HEAD/resources/Documentation/config.md **[full]**

How developers categorise decisions and risk
46. Shihab, E., Hassan, A. E., Adams, B., & Jiang, Z. M. (2012). An industrial study on the risk of software changes. FSE 2012. https://doi.org/10.1145/2393596.2393670 **[abstract]**
47. Herzig, K., Just, S., & Zeller, A. (2013). It's not a bug, it's a feature: how misclassification impacts bug prediction. ICSE 2013. https://doi.org/10.1109/icse.2013.6606585 **[abstract]**
48. Wu, X., Zheng, W., Xia, X., & Lo, D. (2021). Data quality matters: a case study on data label correctness for security bug report prediction. *IEEE TSE*. https://doi.org/10.1109/tse.2021.3063727 **[abstract]**
49. Ochoa, L., Degueule, T., Falleri, J.-R., & Vinju, J. (2022). Breaking bad? Semantic versioning and impact of breaking changes in Maven Central. *Empirical Software Engineering*, 27. https://arxiv.org/abs/2110.07889 **[abstract]**
50. Bogart, C., Kästner, C., Herbsleb, J., & Thung, F. (2021). When and how to make breaking changes: policies and practices in 18 open source software ecosystems. *ACM TOSEM*, 30(4). https://doi.org/10.1145/3447245 **[abstract]**
51. Watanabe, M., Li, H., Kashiwa, Y., Reid, B., Iida, H., & Hassan, A. E. (2026). On the use of agentic coding: an empirical study of pull requests on GitHub. *ACM TOSEM*. https://doi.org/10.1145/3798166 **[abstract]**
52. Mahadi, A., Tongay, K., & Ernst, N. (2020). Cross-dataset design discussion mining. SANER 2020. https://arxiv.org/pdf/2001.01424 **[full, 2-page version]**

**Not used, or not opened:** Liu et al. (2014, WWW), cited in source 22 for six privacy profiles from 239,000 users, not opened. The Jamieson & Skraaning full text (Norwegian archive) wouldn't load. The Payne, Bettman & Johnson PDF is a scan and wasn't read. The SAE chart and standard PDFs returned HTML instead.
