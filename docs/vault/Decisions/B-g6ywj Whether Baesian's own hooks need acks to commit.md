---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Whether Baesian's own hooks need acks to commit: Baesian's own block passes (B-g6ywj)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-g6ywj
card: B-g6ywj
revision: 1
title: Whether Baesian's own hooks need acks to commit
question: Should the commit gate let through a hook change that only adds or updates the block `baesian init` writes, or keep asking for a card or an ack?
answer: Baesian's own block passes
response: accept
not_chosen:
  - init prints the acks
answered: 2026-11-03T20:18:34.512Z
answered_by: Gus Ellerm
topic: release/init-hook-acks
deck: release
level: hard
reverse: cheap
touches:
  - security
  - infra
  - user-facing
filed: 2026-11-03T20:17:50.276Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-7sjec Where the commit gate's hooks live|B-7sjec]]"
---

# Whether Baesian's own hooks need acks to commit

Should the commit gate let through a hook change that only adds or updates the block `baesian init` writes, or keep asking for a card or an ack?

**Decided:** Baesian's own block passes, the agent's pick. The gate and verify skip a change under .githooks/ when the hook is otherwise unchanged and its block is exactly what this Baesian's init writes. The setup commit passes; any other edit to a hook still needs a card or an ack.

**Not chosen:** init prints the acks. The gate stays as D135 has it. baesian init ends by printing the three Baesian-Ack lines, with a reason filled in, for the commit that sets Baesian up, and the README says so.

**It turned on:** Should adding Baesian's own hooks to a repo show in its history as something a committer acknowledged? (a preference) No: running init is the decision: Baesian's own block passes. Yes, like any hook change: init prints the acks.

**The fact given:** D135 makes any change under .githooks/ an infra fact, which needs a card or an ack. baesian init writes three hooks there (pre-commit, commit-msg, post-commit). Each holds a fixed block between Baesian's markers that runs `baesian hook <name>`, and people may add their own lines outside the markers. So today the commit that sets Baesian up is blocked until it carries three acks or uses --no-verify. Rehearse's setup hit this. Before D135 (29be803) the same commit went through. An ack is written by whoever commits, an agent or a person, and is kept in the commit message. A newer Baesian's init may write a different block.

**First chose:** init prints the acks, then switched once the agent's pick was shown.

**The agent's case:** The block's text is Baesian's, not the committer's, so an ack on it records nothing anyone decided. A first commit that asks for acks people don't understand teaches them to ack blindly or skip the gate. A hook changed to run something else, which is what D135 guards against, still needs a card or an ack.

**Wrong if:** Agents run baesian init in repos whose owners haven't chosen Baesian, so the setup commit is the one moment a person should be asked; or CI on an older Baesian often flags a block a newer init wrote. **To check:** In rehearse and while dogfooding, note who runs init in each new repo, and whether CI ever flags a block written by a newer init.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-g6ywj, revision 1). Filed by claude-code on v1/next, in the deck “Before release: privacy and security”.

The record is in `.baesian/cards/B-g6ywj/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

**Found by rehearse** (2026-11-03), and reproduced on `v1/next`: `git init`, a first commit, `baesian init`, then `git add -A && git commit` is refused, with `infra:.githooks/pre-commit`, `infra:.githooks/commit-msg` and `infra:.githooks/post-commit` uncovered. Rehearse works around it by running `baesian check --json` and adding one `Baesian-Ack:` per `.githooks/` fact to its setup commit. That adds no ledger or record files, the next commit is clean, and `baesian verify` passes.

**How the proposal would decide "only Baesian's block".** Take the managed block, from `# >>> baesian >>>` to `# <<< baesian <<<`, out of the hook before and after the change. If what's left is the same, and the new block is byte for byte what this version's `baesian init` writes, the change isn't a fact. So a hook created by init, or one init updated, passes. A changed line outside the markers, or a block that differs from init's, is a fact as now. CI runs the same check, so a repo whose hooks a newer init wrote, checked by an older Baesian in CI, would see that block as changed and need an ack. Before v1, no compatibility across versions is designed (D108).

**What the alternative prints**, after the hooks are written:

```
Commit the setup with these lines at the end of its message:
  Baesian-Ack: infra:.githooks/pre-commit Baesian's commit gate, written by baesian init
  ...
```
