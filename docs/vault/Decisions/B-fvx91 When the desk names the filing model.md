---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "When the desk names the filing model: With the agent's pick, once you've chosen (B-fvx91)."
created: 2026-11-10
updated: 2026-11-10
tags:
  - baesian
  - decision
aliases:
  - B-fvx91
card: B-fvx91
revision: 1
title: When the desk names the filing model
question: Should the desk show which model filed a card on the card itself, before you choose, or only once you've chosen?
answer: With the agent's pick, once you've chosen
response: alternative
not_chosen:
  - On the card, beside the agent's name
answered: 2026-11-10T20:22:56.295Z
answered_by: GusEllerm
topic: calibration/card-model-display
deck: calibration
level: provisional
reverse: cheap
touches:
  - user-facing
filed: 2026-11-10T20:19:38.560Z
filed_by: claude-code
branch: worktree-agent-a2797a2623e7d4991
depends_on:
  - "[[B-k0w7d Where a card's model comes from|B-k0w7d]]"
---

# When the desk names the filing model

Should the desk show which model filed a card on the card itself, before you choose, or only once you've chosen?

**Decided:** With the agent's pick, once you've chosen, the alternative. Then the card names only the agent until you choose, and the reveal names the model beside the agent's pick.

**Not chosen:** On the card, beside the agent's name, the agent's pick. Then the line above the question reads “claude-code (claude-opus-5-5) is writing the CSV import” before you choose, as `baesian show` and the decision notes name it.

**It turned on:** Do you want to know which model filed a card before you make your blind choice? (a preference) Yes, like the agent's name: On the card, beside the agent's name. Only after I've chosen: With the agent's pick, once you've chosen.

**The fact given:** The card already names its agent (claude-code) above the question before you choose; the agent's pick and its case come only after (D86). The model would be one more fact about who filed it. None of this repo's cards records a model yet.

**The agent's case:** A model is a fact about who filed the card, like the agent's name already shown there, not part of the agent's case for its pick; and it reads the same on the card as in the CLI and the vault.

**Wrong if:** Once cards record their model, your blind agreement differs by model more than the cards' rows explain. **To check:** Blind agreement per model, once a few dozen cards record one.

Answered by GusEllerm on 2026-11-10, through Baesian (card B-fvx91, revision 1). Filed by claude-code on worktree-agent-a2797a2623e7d4991, in the deck “How Baesian learns from your answers”.

The record is in `.baesian/cards/B-fvx91/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

B-k0w7d decided that a card records the model its agent ran on, from the harness through the plugin (`source_model`). It didn't say where the desk shows it. As built (provisionally), the card's trigger line names it in brackets after the agent; `baesian show` prints it as a `model:` field, and a decision note says "Filed by claude-code (claude-opus-5-5)", with `filed_model` in its frontmatter.

The alternative keeps the card face as it is and names the model in the reveal, beside "claude-code's pick". Either way the record and the CLI carry it.
