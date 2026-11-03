---
type: decision
status: active
authority: log
livedocs: snapshot
summary: "How decision notes are named: Card ID and title (B-1j3yf)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-1j3yf
card: B-1j3yf
revision: 1
title: How decision notes are named
question: Should a decision note's file name be its card ID and title, or its card ID alone?
answer: Card ID and title
response: accept
not_chosen:
  - Card ID alone
answered: 2026-11-03T04:08:38.828Z
answered_by: Gus Ellerm
topic: vault/note-names
deck: vault-adapter
level: blocking
reverse: moderate
touches:
  - schema
  - user-facing
filed: 2026-11-03T03:51:55.718Z
filed_by: claude-code
branch: v1/next
---

# How decision notes are named

Should a decision note's file name be its card ID and title, or its card ID alone?

**Decided:** Card ID and title, the agent's pick. Files read as "B-3akjw How an answer becomes a rule.md" on GitHub and in the file list. In Obsidian an alias finds a note by its ID, and links come out as [[B-3akjw How an answer…|B-3akjw]].

**Not chosen:** Card ID alone. Files are "B-3akjw.md", so a typed [[B-3akjw]] links in Obsidian and in agents' notes. The file list and GitHub show bare IDs; the title shows only inside the note and in the Decision Log's table.

**It turned on:** Will people and agents link decision notes by typing the card ID, or find them by name? If they find them by name: Card ID and title. If they type the ID: Card ID alone.

**The fact given:** Obsidian resolves a [[link]] by file name only. An alias makes its link picker offer the note and write [[name|alias]] (Obsidian help, Aliases). Notes in this vault cite cards as plain text, such as "decision card B-9tk9m r2". Card titles are neutral and don't name the outcome.

**The agent's case:** A name that says what the decision is about is what you scan for on GitHub and in git's output, and the alias keeps finding by ID in Obsidian. The title is neutral, so the name stays right when an answer changes.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-1j3yf, revision 1). Filed by claude-code on v1/next, in the deck “The vault adapter”. Context: [[Vault Adapter]], [[Baesian Design]].

The record is in `.baesian/cards/B-1j3yf/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

The same choice would name rule notes (rule ID and first words, or the rule ID alone). The name uses the card's first revision's title, which never changes, so every branch names a note the same way. See [[Vault Adapter#Path and name]].
