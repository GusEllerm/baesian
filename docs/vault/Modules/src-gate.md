---
type: module
status: active
authority: describes
summary: "src/facts.ts, src/trailers.ts, src/gate.ts and src/hooks.ts: the commit gate. It detects decisions in a diff, reads the trailers, decides coverage, and installs and runs the git hooks."
created: 2026-10-23
updated: 2026-11-03
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
| `infra` | paths matching `DEFAULT_INFRA`, or `gate_infra` | workflows, Dockerfiles, compose, Terraform, wrangler, fly, vercel, netlify, and committed git hooks (`.githooks/`, `.husky/`), which run on everyone's machine (D135) |

**`api:` facts (M3c; D56, D58, D59).** The detector is off unless `gate_api` lists the project's public modules. When it's on, `Snapshot.apiChanges` asks livedocs: `livedocsSignatures` runs `livedocs signatures --cached`, or `--rev <commit>` for CI, with `--json`.
- Only breaking changes count (`BREAKING`: a changed signature, or a removed export), and only in the listed modules. A new export is additive.
- Each one becomes `api:<qualname>`.
- If livedocs is missing or fails, that's a warning, never a block.

What counts as a signature is livedocs' rule: parameters, defaults, return types and class heritage. For constants, only a declared type annotation counts. Zod schema constants therefore aren't API facts: in this repo, format changes are caught by listing `src/schema.ts` in `gate_schema`.

`DEFAULT_IGNORE` (`node_modules`, `.baesian/`, vendor, fixtures) is never looked at. A rename counts when either the old or the new path is in scope. A manifest that doesn't parse produces a warning, not a guess. Globs come from `globToRegExp`.

## src/trailers.ts (D52)

`parseTrailers` runs `git interpret-trailers --parse` on the message after `cleanMessage`, which drops comment lines and the `--verbose` scissors section. It returns the cards, the acks (fact ID → reason), and any malformed Baesian trailers, which block the commit rather than being ignored.

`readHistory` searches the history of every branch, local and remote-tracking, for `Baesian-Card` trailers (B-9v5xj), so a changed answer's brief finds a card's commits after a rebase, or a squash that keeps the trailer, rewrote them ([[src-store]]). One `git log` reads each commit that mentions the trailer, with git's own trailer rules, as `parseTrailers` does: only the message's last paragraph counts, so a squash message that lists each commit's message, trailers and all, isn't read as citing anything. It returns a `History`: the `CitingCommit`s for each card, oldest first, and `History.onBranch`, which says whether a commit is on a branch at all (false once it's rewritten, or if it never existed). It's cached per process for as long as the branches point where they did.

## src/gate.ts

`evaluate` covers each fact in this order:
1. an ack for its ID;
2. a cited card whose `touches` map to its kind (`KIND_OF_TOUCH`, D53);
3. a rule whose `covers` matches it, unless the rule is retired (D119).

Separately, it checks every cited card, by the level in force, which the gate at filing wrote on the card ([[src-routing]]):
- unknown, withdrawn or superseded: blocked;
- rejected: blocked, with a rework brief listing the commits in its ledger (D30);
- hard and not resolved: blocked (D46);
- returned with a question, filed as provisional or blocking, or held back by the gate (written provisional): allowed.

`describeReport` prints the result, ending with trailer lines to paste. What a reviewer wrote, in a rejection or a new verdict, is quoted with their name (`answerLine`, D169). `verdictsSinceLastCommit` adds the verdicts since the branch's last commit. Commit times have one-second resolution, so a verdict given in the same second as the last commit can be shown twice; that's harmless. `detectStaged` applies the repo's configured paths.

## src/hooks.ts (D54)

`installHooks` finds the hooks directory git uses (`git rev-parse --git-path hooks`):
- with no `core.hooksPath` and no real hooks in `.git/hooks`, it creates a versioned `.githooks/` and points git at it;
- otherwise it installs in place.

`writeHook` puts `hookBlock` right after the shebang, so it runs before livedocs' `exec`.

The block is identical on every machine, because `.githooks/` is committed. It calls `baesian` from PATH. If `baesian` isn't there, it runs the command stored in the clone's own git config under `FALLBACK_KEY` (`baesian.fallback`), which `setFallback` writes at init time (D48). That config is local: shared by the clone's worktrees, never committed. If neither exists, the hook refuses to commit, except in `post-commit`, which can't stop a commit anyway.

The first version embedded the fallback's absolute paths in the hook itself. That would have put one machine's paths in the repo, and made every other machine's `init` rewrite the committed hooks.

`runHook` runs each hook:
- **`pre-commit`** syncs the record and stages all of `.baesian/` (D37). With a vault configured, it then writes the vault's notes from that record (`writeNotes`, [[src-vault]]; D170) and stages them: the notes written now, those `baesian sync` wrote and nobody added, and those whose only unstaged change is Baesian's own (bringing the index's version up to date gives the same note). A note with someone's unstaged edit is left as it is, with a message: staging it would commit their unfinished edit. A missing vault is a warning, never a block. It notes which record files and notes nobody had staged before it, in this worktree's own git directory (`baesian-staged.json`).
- **`commit-msg`** runs the gate. It skips merge commits, which CI checks. When it blocks a commit, it unstages the record files and notes `pre-commit` staged, back to the last commit's version, and leaves any you staged yourself (D122). The next commit stages them again. A commit blocked by another hook still leaves them staged: livedocs' `pre-commit` runs after Baesian's part, and blocking there means `commit-msg` never runs.
- **`post-commit`** writes a ledger entry for each `Baesian-Card:` in the commit (D15): one line naming the commit (D120).

A repo where the live layer doesn't exist is never blocked.

## Why the record is staged in pre-commit

git ignores files staged by a `commit-msg` hook: they're left for the next commit (tested on git 2.55). So the record is staged in `pre-commit`, and the trailers are read in `commit-msg`. Staging only the files the hook had just copied missed the cards `baesian file` wrote at filing time, so the hook stages the whole record directory.
