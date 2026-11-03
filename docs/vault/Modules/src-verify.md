---
type: module
status: active
authority: describes
summary: "src/verify.ts: baesian verify, the commit gate rerun in CI against committed records, plus the merge gate and conflicting decisions. Includes a GitHub Actions example."
created: 2026-10-23
updated: 2026-11-03
reviewed: 2026-10-23
tags: [baesian, module]
---

# src/verify.ts

`baesian verify` is the CI backstop for the commit gate (D24): it catches commits made with `--no-verify`, on another machine, or before the hooks were installed. With `--merge` it is also the merge gate (D31).

CI has no live layer, only what was committed. `RecordAt` reads `.baesian/` from any commit: it extracts it with `git archive` into a temporary directory and opens it with `Store.overRecord`, a read-only view.

## Per-commit checks

`checkCommit` runs once for every non-merge commit in `<base>..HEAD`, oldest first. Each run uses:
- **the commit's own diff**, against its first parent (`commitSnapshot`);
- **its own message**, for the trailers;
- **its own record and config**, for the cards, verdicts and detector paths.

That is the same view the local `commit-msg` hook had, so CI repeats the local check rather than applying today's state to old commits. A commit from before the repo adopted Baesian has no record, and the default detectors still apply; verify from a later `--base`.

## The vault's notes (M6)

With a vault in the record's config, `verify` warns, without failing, when the record at HEAD holds decisions or rules with no note in the vault at HEAD, or the vault isn't in the commit (`vaultWarnings`, [[src-vault]]). The notes are a view of the record, so a lagging vault is advice: `baesian sync`, then commit. `VerifyResult.warnings` holds them, and `describeVerify` prints them last.

## The merge gate

`checkMerge` reads the record at HEAD. For every card the range cites:

| Status | Result |
|---|---|
| resolved | ok |
| deferred | ok, with the reason shown as a note |
| withdrawn, superseded | a note: the commits that cite it may need another look |
| rejected | fail: rework before merging |
| open, rerouted, returned with a question | fail, with the hint "if it's already answered, run `baesian sync` and commit". The record lags the live layer until something is committed |
| missing | fail, with the same hint |

The messages quote what others wrote, a reviewer's comment or a card's title, with its author (D169).

## Conflicting decisions (D35, D38)

`findConflicts` looks for a decision resolved on this branch whose canonical topic matches a decision resolved on the base, but with a different answer. Three things settle a pair:
- one card `supersedes` the other;
- the base's card is already superseded;
- a resolved conflict card names both.

`fileConflicts` files a conflict card. It's local only, because it needs the live layer: `baesian verify --merge --file-conflicts`. The card is blocking, its proposal is the base's decision, and its strongest alternative is the branch's. Baesian writes it with no model, so its crux is a fixed one (D94): "Was the newer decision made with context the older one lacked?" Each option's `_breaks` names the decision it would replace. When the reviewer resolves it, `Store.status` marks the decision that wasn't chosen as superseded, and the conflict stops being reported.

## In GitHub Actions

```yaml
name: baesian
on: pull_request
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0          # verify needs the base branch and every commit in the PR
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm i -g baesian     # not on npm yet: see below
      - run: baesian verify --merge
```

With no `--base`, `verify` uses `origin/$GITHUB_BASE_REF`, which pull-request runs set. Exit 1 fails the check.

**Baesian isn't published yet** (`package.json` is private until the licence and release are decided). Until it is, only this repo can run it in CI, by building itself: `npm ci && npm run build && node dist/bin.js verify --merge`. If `gate_api` is set and livedocs isn't installed in CI, the `api:` detector warns and is skipped.
