---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "How a decision note changes after it's written: Edit frontmatter and add a dated section (B-s480j)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-s480j
card: B-s480j
revision: 1
title: How a decision note changes after it's written
question: When a decision is superseded or its answer changes, should Baesian edit the note's frontmatter and add a dated section, or rewrite the whole note?
answer: Edit frontmatter and add a dated section
response: accept
not_chosen:
  - Rewrite the note from the record
answered: 2026-11-03T04:11:40.148Z
answered_by: Gus Ellerm
topic: vault/note-changes
deck: vault-adapter
level: blocking
reverse: moderate
touches:
  - schema
  - user-facing
filed: 2026-11-03T03:51:55.989Z
filed_by: claude-code
branch: v1/next
---

# How a decision note changes after it's written

When a decision is superseded or its answer changes, should Baesian edit the note's frontmatter and add a dated section, or rewrite the whole note?

**Decided:** Edit frontmatter and add a dated section, the agent's pick. What the note said stays. Its status and answer fields change, and a dated section at the end says what happened. Text you add to a note is kept. Two branches changing one note differently conflict, as D43 expects.

**Not chosen:** Rewrite the note from the record. The note always reads as the decision stands now, with its history only in git. Anything added to the note by hand is overwritten at its next change.

**It turned on:** Will people add their own writing to decision and rule notes? If they will: Edit frontmatter and add a dated section. If they won't: Rewrite the note from the record.

**The fact given:** D43 allows one edit to an existing note, marking a decision superseded, and says the adapter never edits hand-written prose. Since then, an answer can change after a card is resolved (D81), a parent's rejection withdraws a card (D14), and a rule can be retired (D119).

**The agent's case:** The note stays a record of what was decided and when, like the hand-written log, and nothing a person adds is lost. Rendered in order from the record, both ways give the same bytes on every branch.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-s480j, revision 1). Filed by claude-code on v1/next, in the deck “The vault adapter”. Context: [[Vault Adapter]], [[Baesian Design]].

The record is in `.baesian/cards/B-s480j/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Four things can change a decision after its note is written: it's superseded, its answer changes, it's reopened, or it's withdrawn; a rule can be retired. Either way the note follows the record; the choice is whether its earlier text and any hand-written additions stay. See [[Vault Adapter#4. When a decision changes]].
