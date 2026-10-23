---
type: session
status: active
authority: log
livedocs: snapshot
summary: "First session: designed Baesian with the user (D1–D51), created this vault and repo, chose the stack, and built M1 (the store and the core CLI)."
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
- **Vault.** Ran `git init -b main`, then `livedocs new-vault docs/vault --name Baesian`. Added [[Home]], [[Working Agreement]], [[Decision Log]], the [[Decision Card]] template, and moved the design doc to [[Baesian Design]].
- **Commit and remote.** At the user's request:
  - first commit `fd64e0c`, made with `--no-verify` (see below);
  - created the GitHub repo `GusEllerm/baesian` with `gh` and pushed `main`. It is private, because the user didn't say and their other repos are private.

## Decisions

- **D1–D10** came out of the discussion.
- **D11–D22.** The agent then put proposals P1–P10 to the user as decision cards, and the user accepted all of them. Three were changed in the process:
  - the ledger also uses commit trailers (D15);
  - rules can also be proposed with a toggle at verdict time (D16);
  - the vault adapter owns a block in the existing Decision Log, rather than generating the whole log (D17).
- **Card IDs.** One ID per decision (D18), a short random string with a prefix so parallel sessions can't collide (D19).
- **D23–D26: where cards come from.**
  - v1 sources: plan-time decks, mid-task filing, and a commit gate as the backstop. An after-the-fact reviewer comes later.
  - The gate blocks until each detected decision is covered, by a card trailer or an agent-decision ack.
  - It starts with four detectors, including exported signatures.
  - A filed card counts as covered, except a blocking card.
  - P11, the gate's build order, was proposed. It was later withdrawn and replaced by D33.
- **D27–D36: harness independence and parallel agents.**
  - **The user's challenge:** stateful phases such as plan mode aren't equivalent across harnesses. And in practice, planning and implementing are tightly coupled and iterative, though the user wants to move toward planning first, then long autonomous implementation.
  - **Resolution:**
    - git is the state machine, in three tiers (D27);
    - plans are documents (D28);
    - batching by deck or branch (D29);
    - verdicts delivered through the gate (D30);
    - a merge gate (D31).
  - **The user's refinement:** don't answer inline in coupled mode; use the same client in both situations, for a consistent, polished feel. That became D32: only the client resolves, and blocking is the only difference between the modes.
  - **New v1 order (D33).**
  - **Multi-agent work, raised by the user:**
    - a two-layer store: live in `.git/baesian/`, the record in `.baesian/`, immutable files (D34);
    - conflicting proposals merged into one decision (D35);
    - a duplicate check with attaching (D36).
  - [[Baesian Design]] was rewritten as v0.5.
- **D37–D42: the open questions from v0.5.**
  - the record is written by the agent's own CLI actions plus `pre-commit`, with `baesian sync` as the fallback (D37);
  - contradictions are caught at filing (resolved decisions are searched too), with topic keys and merge-gate conflict cards (D38);
  - vault views are written only on the default branch, with one note per rule (D39, refining D17);
  - notifications come from the client, the OS, and a `notify` hook (D40);
  - presence is in v1 (D41);
  - a hard-blocking level (D42).
- **D43–D46: the open questions from D37–D42.**
  - **D43:** one vault note per decision and per rule, with the Decision Log as an Obsidian Bases query. This came from applying D34's immutable-file idea to the vault, and it supersedes D17 and D39.
  - **D44:** topic-key drift is handled with near-match warnings and alias merging.
  - **D45:** a "conflicts with…" link, plus measuring where contradictions are caught.
  - **D46:** only hard cards need a verdict at commit. The agent found this one while writing up the others: D26 and D42 together would have stopped a provisional blocking card from ever being committed.

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
- **The first commit needed `--no-verify` on livedocs 0.1.4.** The 0.1.4 pre-commit gate blocks a repository's first commit (`GitError: git diff --name-only HEAD`), so `fd64e0c` was made with `--no-verify`.
  - Later the same day, live-docs-agent reported that **livedocs 0.2.0 is released** and is now the user's global install, from PyPI rather than the editable checkout.
  - 0.2.0 fixes the first-commit problem, the `survey` traceback, and `new-vault`, and supports TypeScript.
  - `livedocs verify` passes on this repo under 0.2.0.
- **Obsidian Bases (checked 2026-10-23, obsidian-help docs via Context7):** a note can embed a live table with a `base` code block, filtered by folder (`file.inFolder(...)`) and properties. It isn't enabled in this vault's `.obsidian/core-plugins.json` yet.
- **Git hook behaviour (tested on git 2.55, 2026-10-23):** a file staged by `pre-commit` lands in the commit; a file staged by `commit-msg` doesn't, and is left staged for the next commit. That is why D37 writes the record in `pre-commit`.
- **livedocs decision D4 in live-docs** left decisions and specs to "a different system". Baesian fills that gap, which gives the pattern's framing: livedocs keeps `describes` notes true, and Baesian moves `specifies` notes from proposed to accepted.
- **Three IDs per decision.** In personal-website, one decision carries three IDs (P3 → DC-01 → G6). One card ID with a changing status would remove that bookkeeping.

## Development: M1

The user judged the plan ready for development.
- **Stack (D47–D51).** The agent's first suggestion was Python, to match livedocs. The user asked "what is the best language?" instead, and the analysis favoured TypeScript end to end. The deciding factors:
  - the client needs a build step anyway;
  - one schema is shared by the CLI, the server, the client and MCP;
  - agents are fluent in it.
- **File formats.** Implemented as proposal P12 ([[File Formats]]), for the user to review before 0.1.0, rather than decided field by field.
- **M1 was built** ([[Implementation Plan]]): the store, the core CLI, and 40 tests against real temporary git repos and linked worktrees. A smoke test with the compiled binary covered filing, the duplicate check, attaching from a second worktree, and the on-disk layout.
- **Bugs that came up:**
  - requiring `.baesian/config.json` would have made every fresh worktree say "run init";
  - two millisecond-resolution races, in the parent-rejection check and in verdict ordering. Both were fixed, and the suite was run repeatedly to confirm.

## Next

- The user reviews P12 ([[File Formats]]), including where `source_worktree` should be an absolute path.
- M2: `wait`, presence, notifications, and the `AGENTS.md` block.
- Before building the Claude Code adapter: confirm with `claude --debug` that a `PostToolUse` hook with matcher `ExitPlanMode` fires, and that `tool_response.plan` holds the plan.
