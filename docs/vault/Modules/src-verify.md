---
type: module
status: active
authority: describes
summary: "src/verify.ts: baesian verify, the commit gate rerun in CI against committed records, plus the merge gate and conflicting decisions; in a hosted repo, only signed answers count, checked offline with keys pinned in CI (M9a). Includes a GitHub Actions example, and how to check an answer by hand with ssh-keygen."
created: 2026-10-23
updated: 2026-11-04
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
| held | ok, with a note: the gate let its agent go ahead, so it counts as settled (D150) |
| deferred | ok, with the reason shown as a note |
| withdrawn, superseded | a note: the commits that cite it may need another look |
| rejected | fail: rework before merging |
| open, rerouted, returned with a question | fail, with the hint "if it's already answered, run `baesian sync` and commit". The record lags the live layer until something is committed |
| missing | fail, with the same hint |

The messages quote what others wrote, a reviewer's comment or a card's title, with its author (D169).

**The gate's record** (M8, P16 section 3): before it reads a cited card's status, `checkMerge` rechecks the gate record for its latest revision, whatever the status, with `gateProblem`. The preference file it names must be in the record and readable; its mode must match; it must have read the card's own facts and `reverse`; the rules (`route()`) must give the same row, position, outcome, level and reason from it; for a held card, the same chance, draw (`drawOf()`), burn-in and `drawn`; and the card's `level` must be the level the gate gave. A record that doesn't recheck fails, like an uncovered fact: answer the card, or file it again.

The burn-in can't be recounted from one branch's record, since a row's earlier held cards may be on any branch. So the record keeps the count the gate saw (`held_before`), and the recheck uses it. Locally that count is the CLI's word, as a verdict is (D62); in a hosted repo only the relay's own record holds a card back (D158), with its own count and draw (below). Per-commit checks read the card's level in force (`Store.levelOf`), which is its `level` from filing, raised in a hosted repo by the relay's record, so a held card is never blocked as hard.

## In a hosted repo (M9a)

Only answers the service signs count (D138): every verdict, rule, retirement, topic merge and preference change, checked offline with the keys CI pins (D142). The store applies it, so every check below reads the same answers ([[src-store#The hosted service's proof (M9a)]], [[src-trust]]).

- **What makes it hosted.** Keys pinned in CI's protected settings, `BAESIAN_TRUST` or the file `BAESIAN_TRUST_FILE` names (`pinnedTrust()`): then every commit's record is checked as hosted, with those keys alone, whatever the record says, so a commit that drops the record's keys or adds its own changes nothing. `verify()` reads them once and gives them to each commit's record (`RecordAt`). With none pinned, a commit is hosted when its record holds the service's keys, and `verify` warns that a commit can change them. A pin that can't be read stops the run (`BadTrust`).
- **Per commit** (`checkCommit()`): the commit gate as before, over the answers that count, so a hard card answered only on the machine, or without the reviewer's passkey (D139), is still unresolved. And the record's keys must match the pin: a service key or passkey key in the record that CI doesn't pin, or pins differently, fails the commit (`CommitCheck.trust`, from `pinProblems()`; D142, D159), with its line to add if it's yours. A revocation in the record applies whether pinned or not.
- **The merge gate** reads statuses from the answers that count, so a card answered only on the machine is unanswered. `checkMerge` rechecks the CLI's gate record, which set the card's level, and the relay's signed one too (`Store.gateRecordBy`). The relay's is rechecked the same way, but its draw is read from its `draw_proof`, which must be the service's signature over the card revision (`drawOfProof()`), and it doesn't set the card's level. A card the relay hasn't gated isn't held (D158), so it needs an answer.
- **Notes.** The files a person writes at HEAD that don't count are listed with why (`VerifyResult.hosted`, from `Store.uncounted`): ignored, not an error (D138).
- **Answers from before linking (B-45xz8, M9d)** count as they are: an unsigned answer in the record at the commit that linked the repo, with the same bytes ([[src-store#The hosted service's proof (M9a)]]). Each commit's record is read with that commit's history (`RecordAt` passes it to `Store.overRecord`), so the linking commit is found in the config's history. CI needs that history: in a shallow checkout, where the commit found is the clone's boundary, such an answer can't be told from one added later, and the run fails (`VerifyResult.hosted.shallow`), saying to fetch the full history (`fetch-depth: 0`, as the workflow below has it).
- **Linking the repo** is a gate fact, `infra:.baesian/config.json` (B-w4g6c, [[src-gate]]), so the commit that links it needs a card or the ack `baesian login` prints.

## Checking an answer by hand

Each signed file has an OpenSSH signature beside it (D160), so anyone can check one without Baesian. Make an allowed-signers file from the service's key, in the record or as CI pins it, then check the file's bytes:

```sh
# The service's key, as an allowed-signers line: its public_key field, for any principal you choose.
printf 'baesian namespaces="baesian" %s\n' "$(node -p 'require("./.baesian/trust/service-k1.json").public_key')" > allowed_signers
ssh-keygen -Y verify -f allowed_signers -I baesian -n baesian \
  -s .baesian/verdicts/20261103T101500.000Z-B-7f3kq-r1-x4k2m.json.sig \
  < .baesian/verdicts/20261103T101500.000Z-B-7f3kq-r1-x4k2m.json
# Good "baesian" signature for baesian with ED25519 key SHA256:…
```

The same works for a rule (`rules/<id>.md`), a topic alias, a preference file or the relay's gate record. This checks the signature, not the rest: that the key was valid at the file's `at`, that the answer is on the card's latest revision, and a hard card's passkey proof (a WebAuthn assertion, which `ssh-keygen` can't read) are `baesian verify`'s. `ssh-keygen -Y verify` takes `valid-after` and `valid-before` options on the allowed-signers line, to check the key's dates too.

## In GitHub Actions

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
        env:
          # In a hosted repo (M9a): the service's key and your passkeys, pinned in the repo's settings (D142, D159).
          BAESIAN_TRUST: ${{ vars.BAESIAN_TRUST }}
```

With no `--base`, `verify` uses `origin/$GITHUB_BASE_REF`, which pull-request runs set. Exit 1 fails the check.

**The pin** is a repository variable holding the trust files' JSON, one per line: copy the lines from `.baesian/trust/service-*.json` and `trust/passkey-*.json` once you've checked them (each compacted to one line), and add a passkey's line by hand when you enrol one. A repo that isn't hosted leaves the `env` out: `BAESIAN_TRUST` set but empty fails the run, so a misnamed variable can't turn the checks off. The workflow file is in the repo, and a commit could edit it to drop the pin: keep it from agents' commits, with a ruleset or code owners on `.github/`, as the pin itself is kept in the settings.

**Baesian isn't published yet** (`package.json` is private until the licence and release are decided). Until it is, only this repo can run it in CI, by building itself: `npm ci && npm run build && node dist/bin.js verify --merge`. If `gate_api` is set and livedocs isn't installed in CI, the `api:` detector warns and is skipped.
