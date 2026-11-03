---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Where the relay's tests run: In Cloudflare's runtime (B-hx2fn)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-hx2fn
card: B-hx2fn
revision: 1
title: Where the relay's tests run
question: Should the relay's tests run inside Cloudflare's own runtime, through its Vitest plugin, or in Node with a stand-in for Durable Object storage?
answer: In Cloudflare's runtime
response: accept
not_chosen:
  - In Node, with a stand-in
answered: 2026-11-03T20:32:39.202Z
answered_by: Gus Ellerm
topic: hosted/relay-tests
deck: hosted
level: provisional
reverse: cheap
touches:
  - dependency
filed: 2026-11-03T20:28:39.175Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-pjw5y Which repo holds the service's code|B-pjw5y]]"
  - "[[B-rca1z Where the hosted service runs|B-rca1z]]"
  - "[[B-bk20v How a new version of the service goes live|B-bk20v]]"
---

# Where the relay's tests run

Should the relay's tests run inside Cloudflare's own runtime, through its Vitest plugin, or in Node with a stand-in for Durable Object storage?

**Decided:** In Cloudflare's runtime, the agent's pick. The service's package adds two dev dependencies: wrangler, which also runs and deploys the relay (B-bk20v), and @cloudflare/vitest-plugin. The relay's tests run in workerd, Cloudflare's runtime,, with real storage and eviction helpers.

**Not chosen:** In Node, with a stand-in. The relay's logic is tested in Node against an in-memory stand-in for its storage; only wrangler is added, to run and deploy it. How it behaves in Cloudflare's runtime, such as hibernating and waking, is tried by hand.

**It turned on:** Are the relay's likely bugs in how it uses Cloudflare's runtime, more than in Baesian's own logic? Often: In Cloudflare's runtime. Rarely: In Node, with a stand-in.

**The fact given:** @cloudflare/vitest-plugin (1.5.1, published 2026-11-03; it replaces @cloudflare/vitest-pool-workers) runs Vitest tests inside workerd and supports Vitest 5, which this repo uses. Tests can reach a Durable Object's instance and storage, run its alarms and evict it. wrangler (4.157.0) runs Workers locally and deploys them; B-bk20v has CI deploy with it. Both would be dev dependencies of the service's own package (B-pjw5y), so nothing they bring ships in the CLI. The store's logic has to run in workerd either way (B-17wn9).

**The agent's case:** The relay's risks are where Baesian meets Cloudflare: sockets across hibernation, storage across evictions, concurrent uploads. Tests in workerd catch those; a stand-in only checks what we already believe about it.

**Wrong if:** The plugin makes the suite slow or flaky, or lags behind Vitest releases and holds the rest of the suite back. **To check:** Time the relay's tests in CI, and check the plugin's Vitest support at each Vitest upgrade.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-hx2fn, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-hx2fn/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Both options add wrangler, which local development and B-bk20v's deploy need anyway. The question is the test plugin, and so where the relay's tests run.

**In workerd,** the tests would use the plugin's `runInDurableObject()` to read the object's SQLite tables, and `evictDurableObject()` to check that a socket or the log survives eviction (added June 2026). Types come from `wrangler types`, which writes them from the Worker's config, so `@cloudflare/workers-types` isn't needed.

**In Node,** a stand-in for the object's SQL storage would need SQLite in Node; `node:sqlite` is built in but marked experimental in Node 22 (the agent's knowledge, *unverified* here), or the stand-in would keep rows in memory.

Sources, read 2026-11-03: Cloudflare, "Testing Durable Objects" (updated 2026-10-12) <https://developers.cloudflare.com/durable-objects/examples/testing-with-durable-objects/>; changelog, "Test Durable Object eviction with new cloudflare:test helpers" (2026-06-25); npm, `@cloudflare/vitest-plugin` and `wrangler` (versions read with `npm view`), and `@cloudflare/vitest-pool-workers`, whose npm entry says it "has been renamed to @cloudflare/vitest-plugin".
