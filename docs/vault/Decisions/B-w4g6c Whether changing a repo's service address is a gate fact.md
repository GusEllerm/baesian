---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Whether changing a repo's service address is a gate fact: A gate fact, like a CI file (B-w4g6c)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-w4g6c
card: B-w4g6c
revision: 1
title: Whether changing a repo's service address is a gate fact
question: Should a commit that changes the service address or project ID in .baesian/config.json be a gate fact needing a card or an ack, like a CI file?
answer: A gate fact, like a CI file
response: accept
not_chosen:
  - Not a gate fact
answered: 2026-11-03T16:51:17.347Z
answered_by: Gus Ellerm
topic: hosted/service-address-fact
deck: hosted
level: hard
reverse: cheap
touches:
  - security
  - privacy
  - infra
filed: 2026-11-03T15:26:49.247Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-vbqdy Where CI gets the key it checks answers with|B-vbqdy]]"
  - "[[B-84e0d What one machine sign-in covers|B-84e0d]]"
  - "[[B-gq8j1 Where the machine's token is kept|B-gq8j1]]"
---

# Whether changing a repo's service address is a gate fact

Should a commit that changes the service address or project ID in .baesian/config.json be a gate fact needing a card or an ack, like a CI file?

**Decided:** A gate fact, like a CI file, the agent's pick. The commit gate and baesian verify report infra:.baesian/config.json when the service or project changes, so the commit needs a card or an ack and shows in review. First linking a repo needs one too; the link command prints the ack.

**Not chosen:** Not a gate fact. The gate keeps ignoring everything under .baesian/, as now. A changed address is caught on each machine instead, since it holds no grant for the new address and stops syncing until someone runs baesian login there.

**It turned on:** Should changing where a repo's cards are sent need the same sign-off as changing its CI? (a preference) Yes: A gate fact, like a CI file. No, the grant check is enough: Not a gate fact.

**The fact given:** Today the gate ignores everything under .baesian/ (DEFAULT_IGNORE). Grants are per service and project (P16 section 8), so a machine can't sync with a new address until baesian login runs there; an agent can run it, and a server someone else runs can approve its own codes. CI pins the service's key (D142), so a new address can't make answers count in CI. What it changes is where card text is uploaded, for every machine that pulls the commit. A repo is linked about once, and relinked rarely (recovery, B-jzgy4; a template copy, hosted/repo-identity).

**The agent's case:** A changed address redirects every machine's cards, private text included, and is the kind of line a reviewer skims past in a config diff. As a fact it reaches a person at the same rare moments as a CI change.

**Wrong if:** Legitimate address changes are frequent enough that acks become routine, or agents ack the fact themselves without anyone reading it. **To check:** In dogfooding, count gate hits on the config and whether any wasn't a link or relink; look at who wrote each ack.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-w4g6c, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-w4g6c/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The second half of P15's open question on the repo's identity. [[Formats for v1]] section 8 adds `service` and `project` to `Config`, which is committed.

**Who would change the address, and why it matters.**
- *Legitimate:* `baesian init` or a link command, once per repo; a relink after starting a new account (B-jzgy4's background); a template copy linking its own project.
- *Not:* a pull request from a fork, or an agent acting on injected instructions, pointing the repo at another server. Every machine that pulls the commit then uploads its cards there, once it has a grant for that address.
- *What it can't do:* make a forged answer count in CI, since CI checks signatures against keys pinned in its own settings (D142, D159). A key the record lists that CI doesn't pin fails the run (P16 section 7).

**The grant check alone.** A machine's grant names its service (P16 section 8), so a new address means `baesian login` there. For the real service, a person approves a code in a browser. For a server someone else runs, nothing makes it wait for a person, and an agent can run `baesian login`. So the grant check stops accidents more reliably than a deliberate redirect (the agent's reasoning).

**What the first option builds.** A small detector in `detectFacts()`: when `.baesian/config.json` changes its `service` or `project` field, report `infra:.baesian/config.json`, though `.baesian/**` stays ignored for everything else. CI's `baesian verify` reports it the same way, so a pull request shows it. An ack is a two-way-door answer an agent can write itself (`Baesian-Ack: infra:.baesian/config.json <why>`); it makes the change visible, and a card makes it a person's call.
