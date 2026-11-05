---
type: module
status: active
authority: describes
summary: "src/verify.ts: baesian verify, the commit gate rerun in CI against committed records, plus the merge gate and conflicting decisions; in a hosted repo, only signed answers count, checked offline with keys pinned in CI (M9a), with the repo's project beside them and one linking commit found from HEAD by ancestry (B-mar8x). Includes the GitHub Actions steps `baesian ci` prints, and how to check an answer by hand with ssh-keygen."
created: 2026-10-23
updated: 2026-11-05
reviewed: 2026-10-23
tags: [baesian, module]
---

# src/verify.ts

`baesian verify` is the CI backstop for the commit gate (D24): it catches commits made with `--no-verify`, on another machine, or before the hooks were installed. With `--merge` it is also the merge gate (D31).

CI has no live layer, only what was committed. `RecordAt` reads `.baesian/` from any commit: it extracts it with `git archive` into a temporary directory and opens it with `Store.overRecord`, a read-only view.

`describeVerify` prints the result for CI's log (B-eyrt5, [[src-cli#What it prints: src/style.ts (B-eyrt5)]]): a headline saying whether it passed and what failed (`baesian verify: failed: 1 of 2 commits since main, and the merge gate`); each commit as a row, `ok` or `FAIL`, its ID to seven characters and its subject; under a failing one, why, and the trailers that would cover it, each at the start of its line, with no advice on previewing or bypassing, which is for a commit not yet made; then the merge gate; and for a failing commit, `next: git rebase -i <base>`, which rewords it. The data `--json` gives, `VerifyResult`, is unchanged.

## Per-commit checks

`checkCommit` runs once for every non-merge commit in `<base>..HEAD`, oldest first. Each run uses:
- **the commit's own diff**, against its first parent (`commitSnapshot`);
- **its own message**, for the trailers;
- **its own record**, for the cards and verdicts, and for where the detectors look: the preference file in force there (B-qkek1, [[src-gate]]), which in a hosted repo is the newest that counts, so a commit can't make the gate see less with a file of its own.

That is the same view the local `commit-msg` hook had, so CI repeats the local check rather than applying today's state to old commits. A commit from before the repo adopted Baesian has no record, and the default detectors still apply; verify from a later `--base`.

## The vault's notes (M6)

With a vault in the record's config, `verify` warns, without failing, when the record at HEAD holds decisions or rules with no note in the vault at HEAD, or the vault isn't in the commit (`vaultWarnings`, [[src-vault]]). The notes are a view of the record, so a lagging vault is advice: `baesian sync`, then commit. `VerifyResult.warnings` holds them, and `describeVerify` prints them last. It holds one more, once, for HEAD: a config that still has the keys the gate read before B-qkek1, which it reads no longer (`configWarnings()`, [[src-gate]]); the commits themselves don't repeat it.

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

- **What makes it hosted.** Keys pinned in CI's protected settings, `BAESIAN_TRUST` or the file `BAESIAN_TRUST_FILE` names (`pinnedTrust()`), with the repo's project beside them (B-mar8x): then every commit's record is checked as hosted, with those keys alone, in that project, whatever the record says, so a commit that drops the record's keys, adds its own or names another project changes nothing. `verify()` reads the pin once and gives it to each commit's record (`RecordAt`). A pin given to `verify()` must name a project too (`pinComplete()`). With none pinned, a commit is hosted when its record holds the service's keys, and `verify` warns that a commit can change them. A pin that can't be read, or lacks the service's key or the project, stops the run (`BadTrust`), saying to run `baesian ci`.
- **Per commit** (`checkCommit()`): the commit gate as before, over the answers that count, so a hard card answered only on the machine, or without the reviewer's passkey (D139), is still unresolved. And the record's keys must match the pin: a service key or passkey key in the record that CI doesn't pin, or pins differently, fails the commit (`CommitCheck.trust`, from `pinProblems()`; D142, D159), with its line to add if it's yours. A revocation in the record applies whether pinned or not. With a pin, a commit whose config names another project than the pinned one fails too (`CommitCheck.trust`, B-mar8x): a commit can't link the repo to a project of its own making, whose answers it could write as from before linking. A config naming no project is from before the link, and is checked in the pinned one.
- **The project and its link, once, from HEAD (B-mar8x).** With a pin, `verify()` finds the commit that linked the repo to the pinned project once, in HEAD's history, by ancestry (`recordAtLinking()`): the commit naming it that has no ancestor naming it. Every commit's record counts its answers from before linking against that commit's record (`StoreTrust.linking`), commits from before the link included, so a branch in flight at linking passes when the answers it builds on were in the record at linking. Two or more such commits, none descending from another, fail the run whatever the commits need (`VerifyResult.hosted.problems`, `unclearLink()`): one was made on a branch from before the link, perhaps with its date set back, or the link was committed twice. With none in HEAD's history (a branch from before the link, on its own), nothing unsigned counts as from before linking, and `verify` warns. HEAD naming another project fails the run too, when HEAD is a merge, which isn't checked as a commit. `describeVerify` names the project and the linking commit on its `hosted:` line.
- **The merge gate** reads statuses from the answers that count, so a card answered only on the machine is unanswered. `checkMerge` rechecks the CLI's gate record, which set the card's level, and the relay's signed one too (`Store.gateRecordBy`). The relay's is rechecked the same way, but its draw is read from its `draw_proof`, which must be the service's signature over the card revision (`drawOfProof()`), and it doesn't set the card's level. A card the relay hasn't gated isn't held (D158), so it needs an answer.
- **Notes.** The files a person writes at HEAD that don't count are listed with why (`VerifyResult.hosted`, from `Store.uncounted`): ignored, not an error (D138).
- **Answers from before linking (B-45xz8, M9d)** count as they are: an unsigned answer in the record at the commit that linked the repo, with the same bytes ([[src-store#The hosted service's proof (M9a)]]). With a pin, the linking commit is the one found from HEAD (above); without one, each commit's record is read with that commit's history (`RecordAt` passes it to `Store.overRecord`), and the linking commit is found there, for the project its config names. CI needs that history: in a shallow checkout, where the commit found is the clone's boundary, such an answer can't be told from one added later, and the run fails (`VerifyResult.hosted.shallow`), saying to fetch the full history (`fetch-depth: 0`, as the workflow below has it).
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

## Conflicting decisions (D35, D38)

`findConflicts` looks for a decision resolved on this branch whose canonical topic matches a decision resolved on the base, but with a different answer. Three things settle a pair:
- one card `supersedes` the other;
- the base's card is already superseded;
- a resolved conflict card names both.

`fileConflicts` files a conflict card. It's local only, because it needs the live layer: `baesian verify --merge --file-conflicts`. The card is blocking, its proposal is the base's decision, and its strongest alternative is the branch's. Baesian writes it with no model, so its crux is a fixed one (D94): "Was the newer decision made with context the older one lacked?" Each option's `_breaks` names the decision it would replace. When the reviewer resolves it, `Store.status` marks the decision that wasn't chosen as superseded, and the conflict stops being reported.

## In GitHub Actions

In a linked repo, `baesian ci` prints the steps, and the pin's lines (B-pt52b, [[src-sync#src/ci.ts: setting up CI (B-pt52b)]]); `baesian ci --github` sets the pin with `gh`. The steps it prints (`workflowSteps()`), in a workflow that runs on pushes to the main branch and on pull requests:

```yaml
- uses: actions/checkout@v7
  with:
    fetch-depth: 0 # verify needs the base, every commit since it, and the commit that linked the repo
- uses: actions/setup-node@v7
  with:
    node-version: 22
# `npx baesian` runs Baesian's CLI from npm: it's to be published there, and isn't yet.
- name: baesian verify (pushed commits)
  if: github.event_name == 'push' && github.event.before != '0000000000000000000000000000000000000000'
  run: npx baesian verify --base "${{ github.event.before }}"
  env:
    BAESIAN_TRUST: ${{ vars.BAESIAN_TRUST }}
- name: baesian verify --merge (pull request)
  if: github.event_name == 'pull_request'
  run: npx baesian verify --merge
  env:
    BAESIAN_TRUST: ${{ vars.BAESIAN_TRUST }}
```

With no `--base`, `verify` uses `origin/$GITHUB_BASE_REF`, which pull-request runs set. Exit 1 fails the check. A pull request's run checks out the merge of the branch into its base, so a branch from before the link is checked with the link in its history.

**The pin** is a repository variable: the project's line (B-mar8x) and the trust files' JSON, one per line (D142, D159), as `baesian ci` prints them from what the service sent, never from the record. Run it again after adding a passkey. A repo that isn't hosted leaves the `env` out: `BAESIAN_TRUST` set but empty fails the run, so a misnamed variable can't turn the checks off; GitHub passes a variable that isn't set as empty, so set it before the workflow first runs. The workflow file is in the repo, and a commit could edit it to drop the pin: keep it from agents' commits, with a ruleset or code owners on `.github/`, as the pin itself is kept in the settings.

**Baesian isn't published yet** (`package.json` is private until the licence and release are decided), so `npx baesian` doesn't work yet. Until it is, only this repo can run it in CI, by building itself: `npm ci && npm run build && node dist/bin.js verify --merge`. If the preferences name public modules (`gate_api`) and livedocs isn't installed in CI, the `api:` detector warns and is skipped.
