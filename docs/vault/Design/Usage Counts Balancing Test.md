---
type: design
status: draft
authority: proposes
summary: "A draft of the written balancing test D141 asks for: whether the hosted service may count usage from every account, with an opt-out, under legitimate interests (GDPR Article 6(1)(f)). The purpose, why counting is needed, the balance against the people counted, and the safeguards, for the field list put to the user as a card. Not legal advice."
created: 2026-11-04
updated: 2026-11-04
reviewed: 2026-11-04
tags: [baesian, design, hosted, privacy]
---

# Usage Counts Balancing Test

> **Status: a draft, for the user to check.** Drafted by the builder of M9e step 2 on 2026-11-04, as D141 asks ("the lawful basis is legitimate interests, with a written balancing test"). The field list it weighs was put to the user as card B-7nq85 (deck `hosted`, topic `hosted/usage-fields`) and accepted as proposed, "Ten kinds of event, fixed values only"; it's `USAGE_KINDS` in `src/usage-fields.ts`, and the website's `/counts` lists it. If the list changes, this note changes with it. The agent isn't a lawyer, and this isn't legal advice. Before anything is published, a privacy policy goes to the user as a hard card ([[Hosted Service]] section 6).

## What's decided already

- **D129:** the user hosts the service for others, partly to monitor usage.
- **D141 (B-7bk6y), "everyone, with an opt-out":** the service counts usage from every account unless it opts out. Counts and timings only, never card text, topics, names or paths. The lawful basis is legitimate interests, with a written balancing test (this note). A public page lists every field.
- **B-7bq05:** the service keeps nothing about where a sign-in came from: no network address, no location.

## The test

GDPR Article 6(1)(f) allows processing "necessary for the purposes of the legitimate interests pursued by the controller or by a third party, except where such interests are overridden by the interests or fundamental rights and freedoms of the data subject" ([[Hosted Service - Strand B5 Prior Art and Security]], F20). The usual way to show it is three questions, as the UK regulator frames them: the purpose, whether the processing is necessary for it, and the balance (*unverified*: the ICO's three-part test, from the agent's knowledge, not re-read for this note).

### 1. The purpose: is there a legitimate interest?

- **Running and improving the service.** Knowing whether people use it, from which client, and where it fails: how many accounts file and answer, whether answers come from a phone or a desk, whether notifications arrive and get opened, and how often requests fail.
- **Checking that Baesian does what it's for.** The measures [[Baesian Design#First version]] set for dogfooding: how often answers overturn the agent's pick, how often a card needs more context, how long a card waits, how often the gate holds cards back, and whether choosing before the reveal (D86) matches the agent's pick. Today these come only from the user's own repos. Outside users are the test of whether they hold.
- **Paying for it.** The service moves to Workers Paid just before others sign up (B-nm45g); counts show what grows with use, and so what it costs.

These are the service's own interests, of a kind the regulation's recitals accept for a service provider (*unverified*: Recital 47's wording wasn't re-read here). None is marketing, profiling for its own sake, or sale to anyone.

### 2. Necessity: could it be done with less?

- **The relay already sees most of it in order to work.** Each card's level, its `touches` and `reverse`, the harness that filed it, each answer's response and client, and when each arrived are in the project's files on the relay (B-17wn9). Counting them adds a record that outlasts the card's own retention (B-9jqt4), with the content left out.
- **Consent would answer a different question.** The opt-in alternative was put to the user and not chosen (B-7bk6y): a small, self-selected sample can't say how a typical account uses the service.
- **Less data where it serves the same purpose:**
  - no exact times: each event is kept to its hour (UTC), and durations are rounded to the minute;
  - no IDs anyone else knows: a random usage ID per account and a random key per project, not derived from the account, the project, a handle or an address;
  - values from fixed lists or numbers only, so no field can carry text;
  - nothing counted that only an opted-out account's projects produce.
- **The smaller alternative** (filing and answering only, as the card's alternative has it) would answer whether the service is used, and not the dogfooding questions. Whether those are worth the extra fields is the card's crux.

### 3. The balance: do the people counted lose out?

**Whose data.** People who sign up to have their agents' decisions relayed to them: developers and domain experts, adults, choosing a developer tool. Their agents file the cards; the counts describe how they answer them.

**What they'd reasonably expect.** A hosted service counting its own use, at the level of "cards answered, from a phone, in 12 minutes", is widely expected of developer tools (*unverified*, the agent's reading). Counting content would not be, and none is counted: no card text, titles, questions, options, cruxes, comments, topics, deck names, project or repo names, branch names, file paths, code, handles, email addresses, machine names, agents' own names, card IDs, project IDs, account IDs, network addresses or browsers' names.

**What could go wrong for them, and how likely:**
- *Re-identification.* The usage ID is linked to the account in the accounts database, so the operator can link the counts to a person; the counts themselves name nobody. A breach of the events table alone exposes hours, kinds and fixed values. Low impact.
- *Inferences about work.* "This account answers hard cards about money at 2 a.m." could be read from `touches` with hours. The hour is kept for 90 days only; the aggregates after that have no ID and no hour.
- *Use against them.* Someone's employer seeing how fast they answer. In v1 a project has one owner, who is the only one answering (P15 section 2), and the counts are the operator's, not shown to anyone else.
- *Chilling.* People answering differently because they're counted. The opt-out stops it at once.

**Safeguards:**
- **Opt-out, at any time, from the account page.** Turning it off stops counting at once, deletes the account's raw events, and gives it a new usage ID, so nothing before is linked to anything after. Aggregates already made stay: they carry no ID.
- **A public page lists every field** (D141), with what each is for and what's never counted, linked from the opt-out.
- **Retention:** raw events for 90 days, then only daily counts per field value, with no usage ID, project key or hour.
- **No sharing, no selling, no advertising.** The counts stay in the service's own database (B-ytdt2), read by its operator.
- **Organisations' repos.** Where an organisation is the controller of its repos' content, the counts are the service's own, about its service; a data processing agreement and a sub-processor list come with the privacy policy (P15 section 6).

### The outcome

On the field list proposed, the agent's reading is that the interest holds, the processing is limited to what serves it, and the safeguards (pseudonymous IDs, hours not times, fixed values, 90 days raw, an opt-out that deletes) keep the effect on the people counted small, so legitimate interests is a reasonable basis. This is the agent's reasoning for the user to check, not a legal opinion. If the answer is the smaller list, section 2's case gets simpler and this outcome holds more easily.

## Open

- A privacy policy, as a hard card, before anything is published (P15 section 6).
- Whether people outside the EU and UK need anything else: US state privacy laws weren't covered (B5 F20).
- Deleting an account (built in M9f, B-b46z3) stops counting it at once, when it's closed, and deletes its raw events with it 14 days later; its daily counts stay, naming no one.
