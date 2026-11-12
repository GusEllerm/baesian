---
type: session
status: active
livedocs: snapshot
summary: "2026-11-12, on v1/next: several reviewers (P20). Two cards answered with the proposal: the first release with members goes out once the CLI and privacy policy are done (B-av0wb), and each member's calibration counts their own answers (B-4mt91). Step 4, the CLI, built: three messages, the instructions unchanged. A read of the whole client for words that said \"you\" of another member's doing: the decisions by branch, cards answered in chat, calibration, practice cards and the settings put right. Links forgotten a day after use. Not released."
created: 2026-11-12
tags: [baesian, session]
---

# 2026-11-12: whose words, and the CLI

The lead, on `v1/next`, after [[2026-11-11 Sent To and the Website]]. The user asked for the plan to continue; then, as an aside, how to install Baesian for another project.

## Two cards, both answered with the proposal

- **B-av0wb,** "What the first release with members includes": **"Once the CLI and privacy policy are done"**. Raising a different answer (step 5) follows in a release of its own.
- **B-4mt91,** "What 'Your calibration' shows in a project with members": **"Your own answers"**.

## Step 4, the CLI and the plugin: smaller than planned

Read before building. `baesian wait` and `baesian inbox` already name who answered; a card someone passed on already keeps its agent waiting; and nothing the instructions say is untrue of a team, so the block in `AGENTS.md` and the plugin's skill are unchanged (`2be5c4b`). Three messages changed: `baesian ci` asks each member to check their own passkey's line; `baesian verify` says a passkey that isn't pinned may be a member's; `baesian login`, refused in a repo that's linked already, says how to join.

## The website said "you" for what another member did

The website step, reported done the day before, wasn't: the decisions by branch said "you chose …" of another member's answer, and the calibration panel pooled everyone's answers as yours. An agent read the whole client for such words: 68 places, 26 of them wrong and 27 calling the project's things yours. Put right ([[Client Build]] item 31, "Whose words"):

- **Who gave an answer** is named, "you" only when it was you; a handle is never capitalised to start a sentence, which a browser test caught.
- **The decisions by branch** are the project's where other members answer too, and each row says who chose. A card another member passed on is waiting for you.
- **A card answered in chat** carries the answer of the member it was sent to.
- **Your calibration is your own** (B-4mt91): the bars count the cards you answered; what a row needs before it moves stays the project's and says so.
- **Practice cards come from cards you answered yourself.**
- **The project's preferences, settings, rules and past cards** are called the project's.
- **Baesian's own cards** name who chose, once the record holds more than one person's answers ([[src-routing]]).

## Also

- **A link is forgotten a day after it's used or it expires** (`753ce9f`): found while reading what the privacy policy will have to say.
- **The aside:** the steps to set Baesian up in the user's Chorus repo, an organisation's, with the choice between `baesian init --personal` and `baesian init`. Nothing was run there.

## Tests

- **Unit:** 1,055 passing, 2 skipped. One run in five had 6 failures, in `test/relay.test.ts`, `test/style.test.ts` and two other files; the four runs after it passed, and the cause wasn't found. It ran straight after a browser run on the same machine.
- **The service:** 216 in workerd, 68 of the store.
- **Browser:** 175 passing. `e2e/site-team.spec.ts` now also checks an owner's drawer and each member's calibration; it caught the drawer capitalising a member's handle.

## Not done

- **The privacy policy's lines** (step 6), as a card. Read for it, from the code:
  - Members see each other's handles, roles and when they joined; every answer with who gave it, what they chose before seeing the agent's pick, what they wrote, and whether on a phone or a desktop; whom each card was sent to; and that someone is at the desk, not who.
  - Each member's machines are sent the log, whose entries name the machine that uploaded each file: a hostname, unless its person chose another name.
  - The service keeps, per project: who is a member, their role, when they joined and whose link they joined by; for a link, a hash of its code, who made it and when it expires, until a day after it's used or it expires; whom each card was sent to, until the card's text goes; each member's last heartbeat, for a day; and which member was told of which card.
  - A member who leaves, or deletes their account: their answers in someone else's project stay with their handle, and go with each card's text on the usual schedule; a rule or a preference file they wrote stays while the project does.
  - Deleting an account deletes the projects it made, for every member; the ones it only joined stay.
  - The policy says "every project you own" and "unless its owner asks"; and it promises account holders an email before a change to what's kept takes effect, so the release needs that email first.
- **The setup survey's words** still say "you" of what its settings let reach every member; only an owner sees it.
- **Nothing is pushed** since `eed187b`. The user was asked whether to push `v1/next`; no answer yet.

## Next

- The privacy policy card, then the docs; then the release, with the email the policy promises; then step 5.
