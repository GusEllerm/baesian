---
type: research
status: active
authority: reference
summary: "The research for several reviewers per project (P20), synthesised from three strands (review tools; decision rights and judgment by several people; how teams oversee agents): who a card should go to, whose answer decides, what a second answer is worth and when, whether people should see each other's answers, how disagreement ends, what keeps a shared queue from being nobody's, and what nobody has built or studied. Findings are cited by strand and number."
created: 2026-11-11
tags: [baesian, research, reviewers]
---

# Several reviewers: what the research says

Provenance: on 2026-11-11 the user asked for the design of several reviewers per project to begin, with its goals and how collaboration works identified first. Three strands were run that day, each by an agent working read-only from the web, and are kept in full: [[Several Reviewers - Strand A Review Tools]] (35 findings), [[Several Reviewers - Strand B Decision Rights and Judgment]] (39), [[Several Reviewers - Strand C Overseeing Agents in Teams]] (40). This note is the lead agent's synthesis; a finding is cited as its strand and number (A27, B24). The proposal built on it is [[Several Reviewers]]. Earlier notes it joins: [[Profiles and Collective Steering - Critique]] (who answers belongs on a map of roles, apart from the gate's rows; "collective means more than one answer per card") and [[Preference Sliders and the Gate]] (decision 16: one set of sliders per repo, with personal additions that only tighten).

**How far to trust it.** Numbers from papers read in full or as raw abstracts are as published. Wording quoted from documentation came through a fetch that summarises, and each strand lists what it couldn't verify. Nothing here is a study of Baesian's own arrangement: see "What nobody has built or studied".

## The eight questions

**Q1. Who should a card go to?** One named person, not a group.
- Naming one reviewer where only a team was assigned cut time in review by 11.6%, in a randomised experiment at Meta, with no sign of rushed reviews (A27). A request by email got a reply from 38% of people addressed alone and 14% of those addressed with fourteen others (C20).
- Task tools and service catalogues insist on one assignee or owner (A19, A20, C16, C39). Tools that accept a group address resolve it to named people (A4, A13, A14).
- The nearest person who can judge it. Approval by a body outside the team went with being slower and not safer (C12). At Google one reviewer is the norm (A14). People who know the area review faster and better, and a newcomer's reviews reach the usual standard by about the fourth exposure to an area (A26, A34).
- A map from areas to people goes stale and fails open: an owner who no longer exists is skipped (C14, C19). It needs a catch-all, and a rule for a dead route. Where people already know whom to ask, a recommender added nothing (A35).

**Q2. Whose answer decides?** One decider; two independent answers only where a miss is costly.
- Every framework read names one decider or one judge (B2, B3, B8, B11). In tools, any one member of the owning group is the usual default, and a count is raised by area or stake, not everywhere (A2, A3, A7, C1, C5).
- A second independent answer cut misses from about one in ten to a few in a hundred in systematic reviews, at the cost of time and more false alarms; an experienced single reviewer came close to a pair (B24). Double reading helps when the stakes are high and the two are combined by a rule set beforehand, and isn't shown to help everywhere (B23, B26). Doubling by risk kept accuracy and nearly halved the work (B29).
- A second person helps only if independent. Mandated double-checks were independent 1% of the time and made no measurable difference (B30); a second checker who saw the first's result put in much less effort (B31); two people watching the same automated recommendation missed what one did (B35).
- Whoever asked an agent for the work may be barred from approving it (C11), and a two-person rule is a control against one account acting alone, not a way to judge better (B32).

**Q3. What happens when two people answer differently?** It's a main path, settled by a rule set beforehand, with both answers kept.
- Disagreement is a base rate: 15% to 37% of patches scored by more than one reviewer, with the objection usually coming second (A32); kappa 0.52 between reviewers labelling agents' actions as risky (C36); and this project's own blind agreement with its agent is a kappa of about 0.18 (B21).
- It ends by a quick reconciliation between the two, since most differences are simple errors, then by a named, qualified person (B23, B28, B3). Not by counting heads (B8), and not by confidence (B22). The view not taken is kept with a reason, beside the original answers (B8, B11, B14, B23).
- Tools give one qualified "no" a block, and a permissioned, recorded way to dismiss it (A5, A10, A18). An answer is bound to the version it was given on (A6), as a verdict here is to its revision.
- Discussion closes a disagreement; it doesn't make the result more reliable (B19).

**Q4. Should people see each other's answers before choosing?** No; afterwards, yes.
- Seeing others' estimates narrowed opinion without improving it (B17); a visible earlier rating raised later ones by a quarter (C27); an unblinded second reader followed the first (B27). Where each had formed a view first, open discussion produced no herding (B18).
- The evidence from code review itself is weak: visible comments biased little (A33). The case for blindness is the independence of the second answer, not proven conformity.
- Deciding before seeing a machine's answer cuts over-reliance on it, and also cuts acceptance of correct advice and asking a colleague (B37). A colleague's differing answer shown beside the machine's is a counterweight (B38).
- Among tools, only two hide other reviewers' answers: HotCRP, for peer review, and LangSmith's annotation queues (A24, C9).

**Q5. Roles: who sets the team's settings and rules?** The team sets limits; a person may only tighten.
- Five coding agents' team controls converge on it: the organisation's limits can't be loosened below, and what a person has learned to allow stays theirs or the repo's (C10). It's the earlier research's decision 16.
- Who sets a rule and who is bound by it are different people (A8, C3). Changing who holds a role goes through the same review as anything else (B12). An arbiter is an appointed role (B28). Owning something and being allowed to decide it are kept apart (C16).

**Q6. What keeps a card from waiting on nobody?** A name, a clock, and a next person.
- A stated time to respond, falling through to a named second person (B15, A22, C17). "I have it" stops the escalation and isn't "it's done", so a claim needs to expire (A23, C9).
- Reminding whoever is blocking cut the time to resolve overdue pull requests by 60% (A30).
- A cheap way to say "not me", and a way to be away (A11, A15, A4, A20).
- The chain needs an end: tools either stop notifying, or turn silence into a refusal that nobody chose (A22, C3, C4). Agent frameworks wait for ever (C7).
- More alerts are heeded less: acceptance fell 30% for each extra reminder (C32). Sending a card to N people multiplies what each receives.

**Q7. What does an inbox mean when several people get an item?** Two sets: who can see it, and whose turn it is.
- Gerrit replaced its single assignee with an "attention set": who is expected to act now, apart from who is a reviewer, with the reason shown (A11, A12). GitLab tried the same and withdrew it (A9).
- "Your answer is wanted" and "for your information" are different (B1, A3, A26).
- Shared inboxes show who has an item open, and stop a reply written against a version that has since changed (A21, C40). Presence misses people on other devices (C40).
- In mainstream tools a notification stays live for everyone after one person acts (C40).

**Q8. Learning, and a new reviewer.** Per person; pooled only where people agree.
- Trust in an agent moves with each person's exposure (C34), and reviewers approve agents' work more as they see more of it (C35). Effort falls when credit is pooled (B33); feeling personally accountable is one of the few things that reduces deference to automation (B36).
- A new reviewer is added beside an experienced one, and audited against peers (A14, B28). Unequal pairs can do worse than their better member (B22).
- With several reviewers, which person a card reaches becomes a source of variation worth measuring (B20, B21).

## Tensions

- **One decider, or a second look.** The frameworks and the latency evidence say one (B2, A27); the miss rates say two, where it matters (B24). They meet at: one by default, two by kind.
- **Independence, or talking.** Two heads beat one only when they can compare notes (B22), and seeing others first degrades the judgment (B17, B27). They fit as: independent first, then shown.
- **Can one reasoned objection block?** Yes in Apache's code votes, Gerrit and consent (A10, A18, B7). No under RAPID, the advice process and rough consensus, where the decider goes on, with reasons (B3, B6, B8).
- **Visible earlier answers.** Harmful in the lab and in screening (B17, B27, C27); nearly harmless in code review (A33). The difference may be whether people had committed first.
- **Deciding first** is disliked, and makes people discount good advice as well as bad (B37).

## What nobody has built or studied

- **No approval layer for agents says who answers,** how many must, what happens when nobody does, or how an item clears for the others (C7, C8). Their default failure is waiting for ever.
- **No tool combines blind, independent answers with a rule for resolving them, as a gate** (C9, A24).
- **Routing is by artefact** (a path, a service, an environment), **never by kind of decision or by an item's stakes** (C gaps). The gate here already sorts cards by kind and level.
- **No study of several people overseeing the same agent was found,** nor of two overseers each blind to the proposal and to each other, which is what two blind answers on one card would be (B tensions, C gaps). This project's record could be the first evidence: two blind human answers on the same card would help tell whether coming round to the agent's pick is being given reasons, or deference (B39).
- **No guidance on how long a waiting agent should wait** (C gaps).

## What it means for the design

1. A card has one person answerable for it at a time, by name.
2. That person is the nearest who can judge it, not a committee.
3. A wait has a clock and a next person, and silence never becomes an answer.
4. Nobody sees another's answer before their own.
5. A different answer from a second person is never an overwrite: someone named settles it, and both answers stay.
6. Two answers are for the kinds of decision where one miss is costly, and only if each is blind.
7. An inbox holds what needs its owner; the rest is there to read.
8. The team sets the limits; a person may only ask to see more.
9. Every answer counts as its author's, and nothing is pooled.

[[Several Reviewers]] turns these into goals, a model and the first cards.
