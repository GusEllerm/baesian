---
type: decision-log
status: active
authority: log
livedocs: snapshot
summary: "Every Baesian decision, with who made it: the user's decisions, agent proposals awaiting the user, and agent two-way-door choices the user can overturn."
created: 2026-10-23
updated: 2026-10-23
reviewed: 2026-10-23
tags: [baesian, decisions]
---

# Decision Log

Newest first in each table. Only the user moves an item from **Proposed** to **Accepted**. Process: [[Working Agreement#Decision cards]].

This vault uses D-numbers for the user's decisions and P-numbers for proposals until Baesian can run its own decisions (D21). After that, decisions carry card IDs (D18, D19).

## Accepted (user)

| ID | Date | Decision | Source |
|---|---|---|---|
| D22 | 2026-10-23 | The [[Working Agreement]] is this repo's baseline, as drafted. (was P10) | decision cards, [[2026-10-23 Design Discussion]] |
| D21 | 2026-10-23 | Dogfood v1 on Baesian's own repo and on personal-website, which gives a before-and-after comparison with its hand-run decision cards. (was P9) | same |
| D20 | 2026-10-23 | First-version order, as proposed: (1) schema and CLI; (2) hooks; (3) the swipe UI as a local stdlib server; (4) the plugin and card-filing skill; (5) the vault adapter; (6) the MCP server last, as a view over the files. (was P8) | same |
| D19 | 2026-10-23 | Card IDs are short random strings with a prefix, such as `B-7f3k`, so parallel sessions and worktrees can't collide. Sequential numbers were rejected because they need a lock or renumbering at merge. | same |
| D18 | 2026-10-23 | One card ID identifies a decision through its whole life, from proposal to acceptance. This replaces today's chain of three IDs (P → DC → G). (was part of P7) | same |
| D17 | 2026-10-23 | The vault adapter owns a marked block inside the existing Decision Log and regenerates it from cards and verdicts. Hand-written rows outside the markers are left alone. The adapter also reads routing rules from the Working Agreement and writes accepted conventions back. Alternatives rejected: a fully generated log; a separate generated note. (was part of P7) | same |
| D16 | 2026-10-23 | Rules are proposed two ways: a "make this a rule" toggle on any response, and mined "Make this a rule?" cards when the same kind of decision is decided the same way repeatedly. (was P6, extended with the toggle) | same |
| D15 | 2026-10-23 | The assumption ledger has two parts. Commits that build on a provisional decision carry a `Baesian-Card: <id>` trailer, which a hook can check. The card's "Implemented in" section names the symbols. (was P5, extended with trailers) | same |
| D14 | 2026-10-23 | Rejecting a card withdraws the cards that depend on it. The agent re-files whichever dependents still make sense after re-proposing. (was P4) | same |
| D13 | 2026-10-23 | Gestures as proposed: Right accept; Left reject (returns); Up for an alternative, a correction or "have you considered X"; Down for "need more context" or "not my area". States: open, returned, resolved, withdrawn, superseded. (was P3) | same |
| D12 | 2026-10-23 | Every card must state the strongest alternative. When there is no credible alternative, the card says so. (was P2) | same |
| D11 | 2026-10-23 | Route from a fixed checklist of impact and reversibility facts. If any fact holds, it's a one-way door and gets a card. Otherwise the agent decides and logs a one-line reason, and a sample of those decisions comes back as audit cards. Blocking cards go out at most four at a time. (was P1) | same |
| D10 | 2026-10-23 | Decks, routing on impact and reversibility facts, and responses that resolve, return or reroute a card go into the design. | [[2026-10-23 Design Discussion]] |
| D9 | 2026-10-23 | Baesian has its own vault, at `docs/vault/`, scaffolded with livedocs. | [[2026-10-23 Design Discussion]] |
| D8 | 2026-10-23 | Cards live in a separate `.baesian/` directory. Baesian works standalone. For the user's projects, it should integrate seamlessly with the vault (livedocs) way of working. | [[2026-10-23 Design Discussion]] |
| D7 | 2026-10-23 | Learn conventions from verdicts: mine patterns from the decisions that affect a project, and turn them into its rules. | [[2026-10-23 Design Discussion]] |
| D6 | 2026-10-23 | Reviewers get an escape hatch when they don't feel informed enough. They also get richer written feedback: "I don't have enough information", "I don't think this is a good idea", "have you considered X?". Written responses may take longer, which is fine. | [[2026-10-23 Design Discussion]] |
| D5 | 2026-10-23 | Context building matters: a briefing card precedes a set of related decisions, to ground the reviewer before they decide. | [[2026-10-23 Design Discussion]] |
| D4 | 2026-10-23 | In non-blocking mode, reversibility gets worse over time. Track what is built on a provisional decision (the assumption ledger). | [[2026-10-23 Design Discussion]] |
| D3 | 2026-10-23 | Route on reversibility and impact. Self-reported confidence is a weak signal. How close the alternatives are is worth exploring. | [[2026-10-23 Design Discussion]] |
| D2 | 2026-10-23 | Coding agents first; research agents are a later application. Design for both settings, so research card types can be added later. | [[2026-10-23 Design Discussion]] |
| D1 | 2026-10-23 | Core concept: agents' design decisions become cards in a queue; a developer or domain expert reviews them with a swipe interface; verdicts go back to the agent that asked. | the original `baesian.md`, now [[Baesian Design]] |

## Proposed (agent, awaiting the user)

None open.

## Agent decisions (two-way doors; the user may overturn)

- 2026-10-23 `[agent decision]` The GitHub repo `GusEllerm/baesian` is **private**. The user asked for the remote without saying which visibility. Private matches vault-drift and personal-website, and it can be made public later, whereas publishing can't be undone.
- 2026-10-23 `[agent decision]` The vault is at `docs/vault/`, the layout personal-website and memgate use, with a `Design/` folder. The design doc moved from `baesian.md` at the repo root to [[Baesian Design]], so the design lives in project memory.
- 2026-10-23 `[agent decision]` The user's decisions get D-numbers and agent proposals get P-numbers, as in the live-docs vault.
- 2026-10-23 `[agent decision]` `livedocs new-vault` crashed on a template bug, so the vault was scaffolded with a patched copy of livedocs in a scratch directory. The live-docs repo was not changed. See [[2026-10-23 Design Discussion#Findings worth remembering]].
