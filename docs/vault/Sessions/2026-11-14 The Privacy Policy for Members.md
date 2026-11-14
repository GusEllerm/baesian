---
type: session
status: active
livedocs: snapshot
summary: "2026-11-14, on v1/next: several reviewers (P20), step 6. Two hard cards filed and answered by the user: account holders are emailed the day before the release (B-hr2g2, against the proposal), and a member's practice answers go when they leave (B-wfw7a). The privacy policy's lines for members written into the page and its note, and four gaps the policy would have exposed made true in the code, each with a test that failed first."
created: 2026-11-14
tags: [baesian, session]
---

# 2026-11-14: the privacy policy for members

The lead, on `v1/next`, after [[2026-11-12 Whose Words and the CLI]]. The user asked to push `v1/next` and start on the privacy policy card.

## Two cards, both hard, both answered

- **B-hr2g2,** "When account holders hear of the policy's change for members": **"The day before"**, against the proposal ("A week before"). The user's comment: "I also dont think we have users yet do we?" The agent can't read the accounts database on baesian.dev; the count is the user's to check.
- **B-wfw7a,** "A member's practice answers when they leave": **"They go at once"**, the proposal.

## Built

- **`f2f62cb`:** deleting a member's account deletes their practice answers in projects they only joined. The policy already said "practice answers included"; restoring B-b46z3.
- **`af7cf40`:** leaving a project, or being removed, deletes your practice answers and blind-test marks in it (B-wfw7a), in `ProjectRelay.memberGone`, which the daily job now calls for a deleted member too; `ProjectRelay.accountDeleted` is gone. Deleting an account also clears `added_by` on the members who joined by its link.
- **`a4f527d`:** a member's heartbeat is cleared by the daily look after a day (`MemberPresence.clearStale`), so "kept a day" holds on a quiet project.
- **`758fdc0`:** the policy's new lines in `<Privacy />` and [[Privacy Policy]]: members and links, whom a card was sent to, heartbeats, who was told of which card, a section "Projects you share", the lawful basis, "Nobody else, beyond the members of a project you share", deleting the account that made a project, "one of its owners", and the join link in the tab. Dated 2026-11-14. Seen rendered at `/privacy`.
- **`259674f`:** someone who stops being an owner (removed, leaving, or made a member) has their unused links cancelled, since only owners add members (restoring B-rxbss).

What the cards left open is in the [[Decision Log]] (2026-11-14).

## Tests

- **The service:** 221 in workerd, 68 of the store; the typecheck, and the client's.

## Not done

- **The email** B-hr2g2 promises: not needed. The user is the only account holder (the user, in chat, 2026-11-14), so no email is needed; if anyone else signs up before the release, it is. The draft is in B-hr2g2's background.
- **`POLICY_CHANGED`** moves to the release's day.
- **The docs** for members: the README and `docs/setup.md`.
- **The setup survey's words** still say "you" of what its settings let reach every member.
- **Pushed** up to `fbdf27a`; the commits after it aren't.

## Next

- The docs, then the release (1.1.0 proposed; the user tags it), then step 5.
