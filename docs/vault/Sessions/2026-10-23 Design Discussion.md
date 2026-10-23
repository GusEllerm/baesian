---
type: session
status: active
authority: log
livedocs: snapshot
summary: "First session: discussed the Baesian concept with the user, folded decks, fact-based routing and the response lifecycle into the design, moved storage to a standalone .baesian/, and created this vault."
created: 2026-10-23
tags: [baesian, session]
---

# 2026-10-23 Design Discussion

## Goal

The user asked for a read of `baesian.md` and a discussion of the design. Afterwards: fold the results into the doc, study the decision patterns in the user's other Obsidian vaults, and design Baesian to fit that way of working.

## What was done

- **Discussion.** The agent raised five points, and the user responded to each (D3–D7):
  - reversibility gets worse over time in non-blocking mode;
  - self-reported confidence is a weak routing signal;
  - verdicts could become standing conventions;
  - "skip" mixes up "not my area" with "unsure";
  - the science angle may be the more distinctive pitch.

  The user added context building (briefing cards, D5) and richer written feedback (D6).
- **Prior practice surveyed.** The live-docs vault (Start Here, Vault Conventions, the Decision Log's D/P split) and the personal-website vault (the Working Agreement's decision cards and one-way/two-way split, the Decision Card template, the style-vote server). The design's mapping table comes from these: [[Baesian Design#With a vault: the adapter]].
- **Design v0.2, then v0.3.** Added:
  - decks, fact-based routing, the response lifecycle;
  - the assumption ledger and learning conventions;
  - for v0.3, the user's decision to keep cards in `.baesian/` (D8), with the vault integration as an adapter.
- **Vault.** Ran `git init -b main`, then `livedocs new-vault docs/vault --name Baesian`. Added [[Home]], [[Working Agreement]], [[Decision Log]], the [[Decision Card]] template, and moved the design doc to [[Baesian Design]]. Nothing is committed.

## Decisions

- **D1–D10** came out of the discussion.
- **D11–D22.** The agent then put proposals P1–P10 to the user as decision cards, and the user accepted all of them. Three were changed in the process:
  - the ledger also uses commit trailers (D15);
  - rules can also be proposed with a toggle at verdict time (D16);
  - the vault adapter owns a block in the existing Decision Log, rather than generating the whole log (D17).
- **Card IDs.** One ID per decision (D18), a short random string with a prefix so parallel sessions can't collide (D19).

All are in [[Decision Log]].

## Findings worth remembering

- **livedocs `new-vault` crashed with `KeyError: '…'`.**
  - Cause: the Home template in `src/livedocs/scaffold.py` contained `` `defineConfig({…})` ``, which `str.format` reads as a placeholder.
  - Workaround: the vault was scaffolded by running a patched copy from a scratch directory. The live-docs repo itself was not changed.
  - Reported to the live-docs-agent session (from session baesian-78), together with a second issue: `livedocs survey` raises a traceback in a repo with no commits.
  - live-docs-agent replied the same day:
    - The global `livedocs` is an editable install of `~/Projects/live-docs`. That checkout was on its unreleased ts-support branch, so the bug was never in a release.
    - The fix is live-docs commit `25297e0`, with a test that runs `new_vault()`. The checkout is back on `main` (0.1.4).
    - The `survey` fix goes into the same release.
- **The first commit needs `--no-verify` on livedocs 0.1.4.** The 0.1.4 pre-commit gate blocks a repository's first commit (`GitError: git diff --name-only HEAD`). This is fixed for 0.2.0, which isn't released yet. Make the first commit with `git commit --no-verify`. No note is stamped yet, so nothing is lost, and later commits go through the gate normally.
- **livedocs decision D4 in live-docs** left decisions and specs to "a different system". Baesian fills that gap, which gives the pattern's framing: livedocs keeps `describes` notes true, and Baesian moves `specifies` notes from proposed to accepted.
- **Three IDs per decision.** In personal-website, one decision carries three IDs (P3 → DC-01 → G6). One card ID with a changing status would remove that bookkeeping.

## Next

- First commit, when the user says so. It needs `git commit --no-verify` until livedocs 0.2.0.
- Candidate next topic: where cards come from. Does the agent decide to file mid-task, or does a hook catch certain decision types (a new dependency, a schema change)?
