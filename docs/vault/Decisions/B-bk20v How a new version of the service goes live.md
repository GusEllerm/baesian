---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How a new version of the service goes live: CI deploys when you tag a release (B-bk20v)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-bk20v
card: B-bk20v
revision: 1
title: How a new version of the service goes live
question: Should a new version of the hosted service go live through CI when you tag a release, or automatically on every push to main?
answer: CI deploys when you tag a release
response: accept
not_chosen:
  - Cloudflare deploys every push to main
answered: 2026-11-03T16:50:53.115Z
answered_by: Gus Ellerm
topic: hosted/deploy-trigger
deck: hosted
level: hard
reverse: cheap
touches:
  - infra
  - security
filed: 2026-11-03T15:26:48.949Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-rca1z Where the hosted service runs|B-rca1z]]"
  - "[[B-sar41 What makes an answer count in a hosted repo|B-sar41]]"
  - "[[B-na7je Proof that a person answered a hard card|B-na7je]]"
---

# How a new version of the service goes live

Should a new version of the hosted service go live through CI when you tag a release, or automatically on every push to main?

**Decided:** CI deploys when you tag a release, the agent's pick. A GitHub Actions job runs wrangler deploy for release tags only, with a Cloudflare token limited to the service's Worker in CI's secrets. Merges to main go live only when you tag, and no machine where agents run holds a deploy credential.

**Not chosen:** Cloudflare deploys every push to main. Workers Builds, Cloudflare's own Git integration, builds and deploys each push to main, with previews for other branches. No Cloudflare token is kept in GitHub; Cloudflare's GitHub app reads the repo. Every merged change is live in minutes.

**It turned on:** Should a change merged to main reach the live service without a separate step by you? (a preference) No: CI deploys when you tag a release. Yes: Cloudflare deploys every push to main.

**The fact given:** The deployed code can read the service's signing key, so whoever can deploy can sign answers to provisional and blocking cards; hard-card answers and loosened preferences also need your passkey (D139, D163). Agents commit and push in this repo, and a change to a workflow file is an infra fact at the gate (D135). Workers keeps the last 100 versions and rolls back with one command, but not past a change to the Durable Object classes. GitHub's required reviewers for a deployment need a public repo on the Free, Pro and Team plans; this repo is private. Deploying by hand needs wrangler signed in on your machine.

**The agent's case:** A tag is a deliberate step, so what agents merge doesn't reach the code that holds the signing key until you choose. The deploy token is narrow and kept off every machine where agents run.

**Wrong if:** Agents can push release tags as easily as branches here, so a tag isn't a step only you take, or the extra step leaves fixes waiting days. **To check:** Protect release tags with a GitHub ruleset, if the plan allows one on a private repo, and confirm a tag pushed with an agent's credentials is refused; in dogfooding, log the time from merge to deploy.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-bk20v, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-bk20v/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

P15 doesn't say how the service is deployed. Deployment is a card under AGENTS.md, and here it is also a security boundary: the signing key lives in the platform's secret store (P15 section 4), and any deployed code can read it.

**What was checked** (2026-11-03):
- *Workers Builds* connects a GitHub or GitLab repo; "every push event made to this branch will trigger a build", followed by the deploy command, `npx wrangler deploy` by default. Monorepos set a root directory and watch paths per Worker. Preview builds can run for other branches.
- *GitHub Actions* uses `cloudflare/wrangler-action` with an API token and account ID kept as CI secrets. Account-owned API tokens can be scoped to one Worker ("If the token is scoped to a specific Worker, Wrangler can only perform actions allowed for that Worker"); deploying an existing Worker needs Editor on it.
- *Rollbacks:* "You can only roll back to the 100 most recently published versions", and rollbacks can't cross a Durable Object class lifecycle change. Resources such as stored data aren't rolled back.
- *GitHub environments:* "required reviewers are only available for public repositories" on the Free, Pro and Team plans; environment secrets in private repos need Pro, Team or Enterprise. Self-review can be prevented.
- *Not checked:* which GitHub plan the account is on, and whether rulesets that protect tags are available to it on a private repo.

**By hand,** the third option, means `wrangler login` on your machine, which leaves an OAuth token there. Agents on that machine run as you and could use it (the reasoning B5 F11 gives for the CLI's token).

Under either option, a deploy that changes Durable Object classes is applied with `wrangler deploy` and can't be rolled back past.

Sources: Cloudflare, Workers CI/CD <https://developers.cloudflare.com/workers/ci-cd/>, Build branches, GitHub Actions <https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/>, Workers authorization, Rollbacks, Durable Objects migrations (through Cloudflare's documentation search); GitHub, "Deployments and environments" <https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments>. All read 2026-11-03.
