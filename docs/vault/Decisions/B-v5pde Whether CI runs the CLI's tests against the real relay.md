---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Whether CI runs the CLI's tests against the real relay: Install them first, in CI (B-v5pde)."
created: 2026-11-04
updated: 2026-11-04
tags:
  - baesian
  - decision
aliases:
  - B-v5pde
card: B-v5pde
revision: 1
title: Whether CI runs the CLI's tests against the real relay
question: Should CI install the service's packages before the root tests, so the CLI's tests against the locally run relay run there too, or leave them to run only where the service's packages are installed?
answer: Install them first, in CI
response: accept
not_chosen:
  - Leave CI's order as it is
answered: 2026-11-04T16:48:15.712Z
answered_by: Gus Ellerm
topic: hosted/relay-cli-tests-ci
deck: branch-worktree-agent-aa96e1a477a6798d1
level: provisional
reverse: cheap
touches:
  - infra
filed: 2026-11-04T16:22:13.233Z
filed_by: claude-code
branch: worktree-agent-aa96e1a477a6798d1
---

# Whether CI runs the CLI's tests against the real relay

Should CI install the service's packages before the root tests, so the CLI's tests against the locally run relay run there too, or leave them to run only where the service's packages are installed?

**Decided:** Install them first, in CI, the agent's pick. Then `npm ci --prefix service` moves up, before `npm test`. The root suite's 16 tests that run the CLI against the relay, started in workerd from the service's own Wrangler, run on every push. CI does the same work, in another order.

**Not chosen:** Leave CI's order as it is. CI keeps installing the service's packages after the root tests. The 16 tests are skipped there, as they are on any machine without the service's packages; they run on machines that have them, and the service's own suites run in CI as before.

**It turned on:** Should CI check the CLI against the real relay on every push? Yes: Install them first, in CI. Not needed: Leave CI's order as it is.

**The fact given:** The root tests (`npm test`) run before the service's packages are installed in CI (`.github/workflows/ci.yml`). M9d's tests of the CLI against the relay start the service's Worker locally with Wrangler's `unstable_startWorker`, from `service/node_modules`, and skip themselves when it isn't installed. They take about 8 seconds, contact nothing but 127.0.0.1, and turn off Wrangler's metrics. The service's packages are installed in CI anyway, for `npm run test:service`.

**The agent's case:** They are the only tests that run the CLI and the relay together; skipped in CI, a change to either could break the other unseen. Moving one step costs nothing.

Answered by Gus Ellerm on 2026-11-04, through Baesian (card B-v5pde, revision 1). Filed by claude-code on worktree-agent-aa96e1a477a6798d1, in the deck “Decisions on worktree-agent-aa96e1a477a6798d1”.

The record is in `.baesian/cards/B-v5pde/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Found while building M9d. The tests are in `test/relay.test.ts`, with the harness in `test/relay-harness.ts`. Nothing else in CI changes.
