---
type: module
status: active
authority: describes
summary: "src/facts.ts, src/trailers.ts, src/gate.ts and src/hooks.ts: the commit gate. It detects decisions in a diff, reads the trailers, decides coverage, and installs and runs the git hooks."
created: 2026-10-23
updated: 2026-10-23
reviewed: 2026-10-23
tags: [baesian, module]
---

# The commit gate

The livedocs pattern applied to decisions ([[Baesian Design#The git gate]]). The gate reports facts it can check mechanically. The agent that made the commit covers each one with a card or an ack, because it has the context.

## src/facts.ts: detectors (D25, D55)

`detectFacts` takes a `Snapshot` (two trees, and the paths that differ) and returns `DetectedFact`s plus warnings.
- `stagedSnapshot` compares the index with HEAD, or with `EMPTY_TREE` before the first commit.
- `commitSnapshot` compares a commit with its first parent, for CI.

| Kind | Finds | Defaults |
|---|---|---|
| `dep` | runtime dependencies added to or removed from `package.json`, `pyproject.toml` (PEP 621 and Poetry), `requirements*.txt`. Not dev dependencies, version bumps or lockfiles | Python names normalised (`normalisePython`) |
| `schema` | paths matching `DEFAULT_SCHEMA`, or `gate_schema` | migrations, `*.sql`, Prisma, JSON Schema, GraphQL |
| `infra` | paths matching `DEFAULT_INFRA`, or `gate_infra` | workflows, Dockerfiles, compose, Terraform, wrangler, fly, vercel, netlify |

`DEFAULT_IGNORE` (`node_modules`, `.baesian/`, vendor, fixtures) is never looked at. A rename counts when either the old or the new path is in scope. A manifest that doesn't parse produces a warning, not a guess. Globs come from `globToRegExp`.

## src/trailers.ts (D52)

`parseTrailers` runs `git interpret-trailers --parse` on the message after `cleanMessage`, which drops comment lines and the `--verbose` scissors section. It returns the cards, the acks (fact ID → reason), and any malformed Baesian trailers, which block the commit rather than being ignored.

## src/gate.ts

`evaluate` covers each fact in this order:
1. an ack for its ID;
2. a cited card whose `touches` map to its kind (`KIND_OF_TOUCH`, D53);
3. a rule whose `covers` matches it.

Separately, it checks every cited card:
- unknown, withdrawn or superseded: blocked;
- rejected: blocked, with a rework brief listing the commits in its ledger (D30);
- hard and not resolved: blocked (D46);
- returned with a question, or filed as provisional or blocking: allowed.

`describeReport` prints the result, ending with trailer lines to paste. `verdictsSinceLastCommit` adds the verdicts since the branch's last commit. Commit times have one-second resolution, so a verdict given in the same second as the last commit can be shown twice; that's harmless. `detectStaged` applies the repo's configured paths.

## src/hooks.ts (D54)

`installHooks` finds the hooks directory git uses (`git rev-parse --git-path hooks`):
- with no `core.hooksPath` and no real hooks in `.git/hooks`, it creates a versioned `.githooks/` and points git at it;
- otherwise it installs in place.

`writeHook` puts `hookBlock` right after the shebang, so it runs before livedocs' `exec`.

The block is identical on every machine, because `.githooks/` is committed. It calls `baesian` from PATH. If `baesian` isn't there, it runs the command stored in the clone's own git config under `FALLBACK_KEY` (`baesian.fallback`), which `setFallback` writes at init time (D48). That config is local: shared by the clone's worktrees, never committed. If neither exists, the hook refuses to commit, except in `post-commit`, which can't stop a commit anyway.

The first version embedded the fallback's absolute paths in the hook itself. That would have put one machine's paths in the repo, and made every other machine's `init` rewrite the committed hooks.

`runHook` runs each hook:
- **`pre-commit`** syncs the record and stages all of `.baesian/` (D37).
- **`commit-msg`** runs the gate. It skips merge commits, which CI checks.
- **`post-commit`** writes a ledger entry for each `Baesian-Card:` in the commit (D15).

A repo where the live layer doesn't exist is never blocked.

## Why the record is staged in pre-commit

git ignores files staged by a `commit-msg` hook: they're left for the next commit (tested on git 2.55). So the record is staged in `pre-commit`, and the trailers are read in `commit-msg`. Staging only the files the hook had just copied missed the cards `baesian file` wrote at filing time, so the hook stages the whole record directory.
