---
type: decision
format: 1
status: active
authority: log
livedocs: snapshot
summary: "Whether a signed file names its project: Each signed file names its project (B-tf9fc)."
created: 2026-11-03
updated: 2026-11-03
tags:
  - baesian
  - decision
aliases:
  - B-tf9fc
card: B-tf9fc
revision: 1
title: Whether a signed file names its project
question: Should every file the service signs name the project it's for, so a signed rule or preference change from one of your repos can't count in another?
answer: Each signed file names its project
response: accept
not_chosen:
  - Signed files name no project
answered: 2026-11-03T20:06:14.602Z
answered_by: Gus Ellerm
topic: hosted/signed-file-project
deck: hosted
level: hard
reverse: cheap
touches:
  - security
  - schema
filed: 2026-11-03T17:48:38.471Z
filed_by: claude-code
branch: v1/next
depends_on:
  - "[[B-sar41 What makes an answer count in a hosted repo|B-sar41]]"
---

# Whether a signed file names its project

Should every file the service signs name the project it's for, so a signed rule or preference change from one of your repos can't count in another?

**Decided:** Each signed file names its project, the agent's pick. Verdicts, rules, retirements, topic aliases, preference files and the relay's gate records carry project, the repo's project ID; verify counts one only when it matches the project the repo is linked to.

**Not chosen:** Signed files name no project. As P16 has them. One service key signs every project's files, so a signed rule or preference change copied from another of your repos counts here, a passkey-proved loosening included.

**It turned on:** Will agents work in more than one of your hosted repos from the same machine? If they will: Each signed file names its project. If they won't: Signed files name no project.

**The fact given:** The service signs every project's files with one key (D142), over their bytes alone (D160). A rule's covers and a preference file's rows mean the same in any repo, and a preference change's passkey proof covers only its bytes. An agent that can read two of your repos can copy a file and its .sig from one to the other. The project ID is in the committed config (P16 section 8); tying it to the repo is B-5gnea, M9d's.

**The agent's case:** It closes copying between your own repos for one field, checked against a value verify already has to read.

**Wrong if:** The project ID proves as easy for a commit to change as the copied file, so the check adds nothing, or relinking a repo leaves its old signed files not counting. **To check:** B-5gnea's outcome; and whether CI's pin can hold the project ID too, where a commit can't change it.

Answered by Gus Ellerm on 2026-11-03, through Baesian (card B-tf9fc, revision 1). Filed by claude-code on v1/next, in the deck “The hosted service”.

The record is in `.baesian/cards/B-tf9fc/`. To change this decision, answer the card again or file one that supersedes it: editing this note changes nothing.

## Background

Found while building M9a. Within one repo, M9a makes a signed file count only where its bytes say it belongs (`Store.judge`): an answer under another card's name, a relay's record in another card's folder, or an old preference change under a newer name counts nowhere. Across repos nothing ties a file to its repo: a rule is just its covers, and a preference file just its rows.

**Where the project would be checked.** The config's `project` (M9d) is committed, so a commit could change it to match copied files; that change is a gate fact under B-w4g6c, which an agent can acknowledge itself. CI's pin (D142) could carry the project ID as well, so verify in CI checks against a value a commit can't change.

**A key per project** would close it without a field, at the cost of one more key to pin in each repo's CI and for the service to keep.
