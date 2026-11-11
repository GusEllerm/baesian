---
type: session
status: active
livedocs: snapshot
summary: "2026-11-10: 1.0.0 released. security@baesian.dev forwards to the user; a service test broken by the pinned spare key fixed; the release commit 247e62f; the user tagged v1.0.0, the service deployed, the user published baesian@1.0.0 to npm by hand, and the re-run deploy made the GitHub Release."
created: 2026-11-10
tags: [baesian, session]
---

# 2026-11-10: the release commit, and 1.0.0 released

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

## The release

- **The tag:** the user tagged `v1.0.0` on `origin/main` (`247e62f`). The deploy job passed; `/v1/keys` publishes `relay-1` and the spare `relay-2`. The publish job failed as planned: npm answered 404, the package not existing and no trusted publisher set up.
- **The first publish, by hand:** from a clean clone of the tag, `npm ci --ignore-scripts && npm publish`. The first try was refused with 403: npm requires 2FA on the account (or a granular token that bypasses it) to publish, and the account had none. With 2FA on, `npm publish` asked for a browser confirmation and printed `+ baesian@1.0.0`. The tarball's shasum, `8589d72…`, was the same as CI's build of the tag.
- **npm staged it:** for about seven minutes the registry showed only `0.0.0-stage`, "Temporary package placeholder for staged publishing", as `latest`; then 1.0.0 appeared as `latest` with no approval asked for. npm's docs: staging a package that doesn't exist yet publishes that placeholder, publicly; it stays as a version.
- **The GitHub Release:** the failed jobs re-run (`gh run rerun --failed`); the publish job found 1.0.0 on npm and skipped; the release job made "Baesian 1.0.0" from `docs/release-notes/1.0.0.md`.

## Next

- The user, on npmjs.com, adds the trusted publisher (GitHub Actions, `GusEllerm/baesian`, `deploy.yml`, no environment), allows it `npm publish`, and sets publishing access to require 2FA and disallow tokens. Without it, 1.0.1's publish job fails.
- `npm install -g baesian` in place of the linked clone; the plugin from GitHub; `baesian ci --github` here and in chorus_conservancy, for the spare key.
- A look at npm's page for the README ([[Release v1#Not verified]]); optionally deprecate `0.0.0-stage`.
