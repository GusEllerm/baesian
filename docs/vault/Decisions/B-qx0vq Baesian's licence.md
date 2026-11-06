---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Baesian's licence: FSL: use it, don't compete (B-qx0vq)."
created: 2026-11-06
updated: 2026-11-06
tags:
  - baesian
  - decision
aliases:
  - B-qx0vq
card: B-qx0vq
revision: 2
title: Baesian's licence
question: Which licence keeps others from reusing Baesian's code commercially, while the repo is public?
answer: "FSL: use it, don't compete"
response: accept
not_chosen:
  - All rights reserved
answered: 2026-11-06T20:54:03.963Z
answered_by: GusEllerm
topic: release/licence
deck: branch-v1-next
level: hard
reverse: one-way
touches:
  - publishes
  - user-facing
filed: 2026-11-06T20:40:45.072Z
filed_by: claude-code
branch: v1/next
---

# Baesian's licence

Which licence keeps others from reusing Baesian's code commercially, while the repo is public?

**Decided:** FSL: use it, don't compete, the agent's pick. Then a LICENSE file (Functional Source License 1.1, Apache 2.0 future): anyone may use, change and run Baesian for any purpose except a product or service that competes with it; each version becomes Apache 2.0 two years after its release.

**Not chosen:** All rights reserved. Then a LICENSE file stating no permission is granted: the code can be read on GitHub, but nobody may use, copy, change or host it without your permission; the README says so beside its install steps.

**It turned on:** Should people be free to use Baesian on their own repos, as long as they don't compete with it? (a preference) Yes: use, not compete: FSL: use it, don't compete. No: nothing without asking: All rights reserved.

**The fact given:** Today the repo is public with no licence, which reserves every right: nobody else may lawfully follow the README's install steps, and the CLI must be installed from source until it's on npm. The Functional Source License, written by Sentry for its own code and used by Codecov, allows any use except a competing product or service, and turns each version into Apache 2.0 or MIT two years after it's released; it isn't an open-source licence until then. A licence given to a version can't be taken back from it; later versions can change licence.

**First chose:** All rights reserved, then switched once the agent's pick was shown.

**Wrong if:** A competitor ships a substitute for baesian.dev from the code within two years, or an investor's or a lawyer's review asks for a different licence. **To check:** A lawyer's read before Baesian is incorporated or raises money; who forks and what they run, on GitHub's network page.

Answered by GusEllerm on 2026-11-06, through Baesian (card B-qx0vq, revision 2). Filed by claude-code on v1/next, in the deck “Decisions on v1/next”.

The record is in `.baesian/cards/B-qx0vq/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The reviewer's comment on r1: "We should use a licence that stops people from reusing. This may be viable as a start up at some point." MIT and leaving it unlicensed until v1 (r1's options) are dropped. This isn't legal advice: a lawyer should read the choice before Baesian becomes a company. Sources: Sentry's announcement (https://blog.sentry.io/introducing-the-functional-source-license-freedom-without-free-riding), the SPDX text (https://spdx.org/licenses/FSL-1.1-MIT.html), PolyForm Shield (https://scancode-licensedb.aboutcode.org/polyform-shield-1.0.0.html).
