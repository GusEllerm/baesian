---
type: session
status: active
livedocs: snapshot
summary: "2026-11-10: the steps before tagging 1.0.0. security@baesian.dev forwards to the user; a service test broken by the pinned spare key fixed; the release commit 247e62f sets 1.0.0 in the three versions and src/version.ts; main fast-forwarded to it and CI passed. The user tags v1.0.0 next."
created: 2026-11-10
tags: [baesian, session]
---

# 2026-11-10: the release commit for 1.0.0

The lead, on `v1/next`, after M10 was merged ([[2026-11-10 M10 Docs]]).

## Goal

The steps on Home before the tag: the security@ forwarding, the release commit, and v1/next to main.

## What was done

- **security@baesian.dev forwards to the user**, in Cloudflare Email Routing on baesian.dev, to the same verified address as privacy@; done in the dashboard with the user's go-ahead. The catch-all stays off. No test email was sent.
- **A broken service test, fixed (5d75624):** 080ea46 put the deployed spare key (`relay-2`) in `service/wrangler.jsonc`'s vars, which the service's tests read, so the test of `/v1/keys`, which assumes no spare, failed. CI runs only on main and pull requests, so nothing caught it on v1/next. `service/vitest.config.ts` now blanks the three spare variables, as it replaces the deployed address and keys; [[service]] says so.
- **The release commit (247e62f):** `npm version 1.0.0 --no-git-tag-version` at the root and in `service/` (which wrote `src/version.ts`), the plugin's manifest by hand (B-3femd). Typecheck, `npm test` (55 files, 1,011 tests), the service's 170 and the store suite's 68 pass; `baesian verify --base origin/main`, from a CLI built in a scratch worktree (the main checkout's `dist/` is left at 0.1.10, which the deployed service accepts), passed for every commit. Home's status and [[Release v1]]'s line on the plugin's version updated; four notes acked (a version bump only).
- **main fast-forwarded** from `1edea8a` to `247e62f`, with v1/next; CI on main passed (run 42946662996).

## Decisions

None new. The steps were decided before: B-3femd (the release commit), B-h0vyy (1.0.0), B-x47ek (the spare key).

## Next

- The user tags `git tag v1.0.0 origin/main && git push origin v1.0.0`. The service deploys and refuses every 0.1.x CLI from then on; the publish job fails once, by design.
- The user publishes 1.0.0 by hand from a clean checkout (`npm ci`, `npm publish`), adds the trusted publisher on npmjs.com (GitHub Actions, `GusEllerm/baesian`, `deploy.yml`) with "Require 2FA and disallow tokens", and re-runs the failed jobs, which makes the GitHub Release.
- Then `npm install -g baesian` in place of the linked clone, the plugin from GitHub, and `baesian ci --github` here and in chorus_conservancy.
