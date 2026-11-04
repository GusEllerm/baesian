---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Whether answers from before linking go up to the relay: Up once, at linking, kept apart (B-3zjjx)."
created: 2026-11-04
updated: 2026-11-04
tags:
  - baesian
  - decision
aliases:
  - B-3zjjx
card: B-3zjjx
revision: 1
title: Whether answers from before linking go up to the relay
question: When a repo is first linked and everything in its live layer goes up (B-6k0rk), should its answers from before linking go up too, taken once from a machine, or should no machine ever upload anything that reads as an answer?
answer: Up once, at linking, kept apart
response: accept
not_chosen:
  - Never from a machine
answered: 2026-11-04T16:48:06.591Z
answered_by: Gus Ellerm
topic: hosted/pre-link-answers-upload
deck: hosted
level: hard
reverse: moderate
touches:
  - security
  - public-api
  - user-facing
filed: 2026-11-04T16:04:53.736Z
filed_by: claude-code
branch: worktree-agent-aa96e1a477a6798d1
depends_on:
  - "[[B-6k0rk Which cards go up when a repo is first linked|B-6k0rk]]"
  - "[[B-45xz8 Whether answers from before linking still count|B-45xz8]]"
---

# Whether answers from before linking go up to the relay

When a repo is first linked and everything in its live layer goes up (B-6k0rk), should its answers from before linking go up too, taken once from a machine, or should no machine ever upload anything that reads as an answer?

**Decided:** Up once, at linking, kept apart, the agent's pick. At first link the CLI also uploads the answers, rules, topic merges and preference files that B-45xz8 counts. The relay takes them from a machine only before the project's first answer on the website, keeps them unsigned and marked as from before linking, and shows those cards as decided. Other machines pull them, and count them only where B-45xz8 does: in the record at the linking commit. One exception to "a machine never uploads an answer" (P15 section 3).

**Not chosen:** Never from a machine. Cards, decks and the agent's other files go up; the answers stay in git, where CI counts them (B-45xz8). The website, and the live layer of any other machine that pulls those cards, show them as waiting until something else marks them; the reviewer may answer them again on the website. No token can ever put an answer on the relay.

**It turned on:** May a machine's token ever put something that reads as an answer on the relay, if only once, at linking? (a preference) Yes, once: Up once, at linking, kept apart. Never: Never from a machine.

**The fact given:** B-6k0rk chose that every card, answer and deck goes up when a repo is first linked. As built (M9b), the relay refuses any answer, rule, topic merge or preference file from a machine, by path, before reading it (P15 section 3); only a person's session writes them, and the relay signs them. B-45xz8 counts an unsigned answer when it was in the record at the commit that linked the repo, which needs git; the relay has no git, and counts only what it signed. Each machine's commands read its own live layer: a machine that pulls a card without its answer shows it as waiting, though the record in git holds the answer. A machine's token can be used by any agent on that machine. This repo's live layer holds 116 cards, none waiting.

**First chose:** Never from a machine, then switched once the agent's pick was shown.

**The agent's case:** Without the answers, uploading everything shows the repo's history wrong, on the website and on every other machine. The window is one upload, before any answer is given on the website, and nothing it brings counts in CI unless the linking commit's record already holds it.

**Wrong if:** An agent uses the window to put answers on the website that nobody gave, and someone acts on them there, or the window can be reopened after the first answer. **To check:** When it's built, upload a forged answer with a machine's token before and after the project's first answer on the website, and confirm the relay refuses the second and no other machine counts the first.

Answered by Gus Ellerm on 2026-11-04, through Baesian (card B-3zjjx, revision 1). Filed by claude-code on worktree-agent-aa96e1a477a6798d1, in the deck “The hosted service”.

The record is in `.baesian/cards/B-3zjjx/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Found while building M9d. B-6k0rk's "Everything" says every card, answer and deck goes up; the relay as M9b built it can take only the agent-written kinds (card revisions, the CLI's gate records, withdrawals, fallbacks, attachments, decks, waiting markers).

**What M9d builds meanwhile:** at first link, and at every sync after it, every agent-written file in the live layer goes up, oldest card first: decks, then revisions, then the rest. The answers from before linking stay on the machine and in git, where they count (B-45xz8). So until this card is answered and built, a card answered before linking shows as waiting on the website and on other machines.

**The proposal, in more detail.** A new upload kind, or the answer kinds accepted from a machine only while the project's log holds no answer the relay signed. The relay would keep them as they are, unsigned, and its own store would count them as B-45xz8 does on a machine, trusting the upload instead of git. The website could label them "answered in the repo, before linking".

**The alternative, in more detail.** The website (M9e) could still show which cards the record answered, if the CLI sent a list of card IDs and decisions as data that counts nowhere; that is a smaller exception of its own, and other machines would still show those cards as waiting.
