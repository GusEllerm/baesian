---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "What one machine sign-in covers: One grant per machine and project (B-84e0d)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-84e0d
card: B-84e0d
revision: 1
title: What one machine sign-in covers
question: Should a machine's sign-in cover one project, so each repo is approved once on each machine, or every project you belong to?
answer: One grant per machine and project
response: accept
not_chosen:
  - One grant per machine
answered: 2026-11-03T13:32:36.960Z
answered_by: Gus Ellerm
topic: hosted/grant-scope
deck: hosted
level: hard
reverse: moderate
touches:
  - security
  - user-facing
  - schema
filed: 2026-11-03T13:32:01.975Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-9tk9m How people sign up and sign in|B-9tk9m]]"
---

# What one machine sign-in covers

Should a machine's sign-in cover one project, so each repo is approved once on each machine, or every project you belong to?

**Decided:** One grant per machine and project, the agent's pick. Then baesian login approves one repo on one machine, and the approval page names it. Its token reaches only that project's cards and answers. Each new repo on each machine needs its own approval in a browser.

**Not chosen:** One grant per machine. One approval per machine covers every project you belong to, as gh auth login covers a host. A new repo on a signed-in machine links without a browser. A leaked or phished token reaches every project's cards and answers.

**It turned on:** Which matters more: fewer approvals in a browser, or a leaked token reaching only one repo? (a preference) A token reaching one repo: One grant per machine and project. Fewer approvals: One grant per machine.

**The fact given:** A machine token can file cards and read every card, answer and comment in what it covers, but never answer (P15, section 3). An agent on the machine can use it through the CLI wherever it's kept. Repos checked out on a machine are readable there anyway; a token also reaches cards filed from other machines. Every grant is listed and revoked on the website's Machines page either way. Five repos on two machines is ten approvals, or two.

**The agent's case:** The token's reach is the boundary that holds when an agent misuses it (B5 F11). Scoping it to one project keeps a leak or a phished approval to one repo, and lets the approval page name exactly what it grants.

**Wrong if:** Approving each repo proves frequent enough that people approve codes without reading the page, or people copy one repo's grant to others to avoid it. **To check:** In dogfooding, count approvals per person per month, and how long the approval page is open before each one.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-84e0d, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-84e0d/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

P15 left this open ([[Hosted Service]], section 2, "Signing in from the CLI"). baesian login uses the device flow (RFC 8628): the CLI shows a code, you approve it in a browser, and the approval page shows the machine, the project and what the machine may do.

A phished approval is the open risk P15 names: an agent can be prompted to ask you to "approve this code". Under the first option that gives one project; under the second, every project. The other side is habit: the more often people approve codes, the less closely they may read the page.

[[Formats for v1]] (P16, section 8) already writes the grant as grants/{project}.json in Baesian's user config folder, and [[MCP Server]] (P18, section 8) speaks of "the grant baesian login made for that machine and project". Both assumed the first option without deciding it; under the second, the file would be one per service, and the token's audience the account rather than a project.
