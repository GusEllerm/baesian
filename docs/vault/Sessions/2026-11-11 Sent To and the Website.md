---
type: session
status: active
livedocs: snapshot
summary: "2026-11-11, on v1/next: several reviewers (P20), steps 2 and 3 of stage 1 built. The relay notes whom each card was sent to and tells each member of their own; the others are told when a card is passed on, or once a blocking or hard card has waited half an hour (B-aaj69, answered against the proposal's ten minutes). The website has a members page with the owner's link, a page the link opens, each member's projects and inbox, and a desk that leads with the cards sent to you and marks the rest. Not released."
created: 2026-11-11
tags: [baesian, session]
---

# 2026-11-11: sent to, who's told, and the website

The lead, on `v1/next`, after [[2026-11-11 Several Reviewers Proposal]]. The user: "Lets continue with the first two" of the five steps left: the service noting whom each card was sent to and notifying them, and the website.

## What was built

**Step 2, on the service** (`990385e`, `e97aa75`; [[service#Whom a card is sent to (P20, B-2n7s4, B-tzdjn; service/src/sent-to.ts)]]):
- **Whom a card was sent to:** the member whose machine uploaded it, noted by the relay in its own table as the upload is written, in no file. The state says it on each card (`ApiCard.sent_to`). A card only owners answer is sent to nobody in particular, and waits for no other member.
- **Each member's count:** `GET waiting`, asked by a member, counts what waits for them and, as `yours`, what was sent to them.
- **Who's told:** `decide()` runs for each member. The member a card was sent to is told as the one reviewer was. The others are told when whoever it was sent to passes it on, and once a blocking or hard card has waited half an hour; never of a provisional card on its own. Presence and the four-an-hour cap are each member's. A project of one is notified exactly as before: `notify.test.ts` passes unchanged but for the count's `yours`.
- **A member who leaves,** or whose account is deleted: their cards are the owners', the pages listening hear of it, and an owner is told.
- The object's migration 3: `sent_to`, `presence_of`, `push_told`, and a column each on `push_sent` and `push_arrivals`.

**Step 3, the website** ([[Client Build]] item 31):
- **Your projects:** every project you're a member of; "Members" on each, "Rename" for an owner; an inbox that says how many of the cards waiting were sent to you.
- **The members page:** who's in the project; an owner makes a link with the passkey, shown once; makes a member an owner or back; removes one. A member leaves. Removing and leaving ask first.
- **Joining:** a link opens `/join` with its code after the `#`, taken out of the address and kept in the tab while someone signs in or signs up, then sent only in a request's body.
- **The desk:** the cards sent to you first, then the rest, each marked "sent to ana", "sent to the owners" or "passed on by ana". A card another member decides while it's in front of you leaves, and the desk says who answered it. An answer that arrives second isn't recorded, and the desk says who came first and what they chose. A member sees the project's preferences with nothing to change.

## One card, answered against the proposal

**B-aaj69,** "How long before the others are told": the user chose **"After half an hour"** over the proposed ten minutes. It's a hard card, so step 2 was committed with neither answer in it (the others weren't told of a waiting card at all), and the half hour was set when the answer came. No reply was made: the agent held no fact the card lacked.

## Decided by the agent

In the [[Decision Log]], two entries: what the cards left open in step 2 (a card only owners answer; what passing on does from whom; a member who leaves; what a notification counts; presence and the cap) and in step 3 (the two pages' addresses; which cards are marked; who, not what, until you've chosen; a member's view of the preferences; asking before removing).

## Tests

- **The service:** 215 tests in workerd and 68 of the store over the relay's storage. New: `sent-to.test.ts` (16), and a project left at schema 2 by 1.0.2 migrating with every row kept. Twelve ways of breaking the rules were each caught by it.
- **Unit:** 1,039 passing, 2 skipped. New: `team.test.ts`, and cases in `inbox.test.ts`, `notify.test.ts` and `answer.test.ts`.
- **Browser:** 175. New: `e2e/site-team.spec.ts` (5): two people, each in a browser with a passkey of their own and each with a machine, the real CLI signed in from two clones of one repo. Six ways of breaking the website's side were each caught by it.

## Found on the way

- The desk's own tab notifications would have told every member of every blocking card at once, as "waiting for you". They're now for the cards sent to you, as the relay's are.
- In the browser tests, Playwright's clock leaves a departing card drawn over the next one, so a screenshot under it shows the wrong card. The new layout checks open the desk without it.

## Not done

- Your decisions by branch still call a card "waiting for you" only when it's open: one another member passed on isn't counted there.
- Nothing is pushed since `eed187b`, and nothing of P20 is released.

## Next

- Step 4: the CLI and the plugin. `baesian login` for a member; who answered, and whom a card was sent to, in `baesian inbox` and `baesian wait`; the instructions' wording; `baesian verify`'s message for a member's passkey that isn't pinned (B-9e7cn).
- Step 5: answering a decided card yourself, blind; raising a difference; the card it becomes and who may settle it (B-v43z8).
- Step 6: the privacy policy's lines, as a card, then the docs. Then a release.
