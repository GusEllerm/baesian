---
type: design
status: draft
authority: proposes
summary: "The hosted service's privacy policy, which Hosted Service section 6 puts before anything is published: who runs it (Gus Ellerm, as an individual, B-mkryw), what it keeps and why, the lawful basis, how long (B-9jqt4, B-ec3kj, B-dsqyd), who else handles it, deleting an account (B-b46z3), people's rights, and where to write (privacy@baesian.dev, forwarded, B-8xxrc). The website's /privacy page carries this text. Not legal advice; what needs a lawyer is listed at the end."
created: 2026-11-04
updated: 2026-11-10
reviewed: 2026-11-04
tags: [baesian, design, hosted, privacy]
---

# Privacy Policy

> **Status: built as a page, not published.** Drafted by the builder of M9f's last pieces on 2026-11-04, because [[Hosted Service]] section 6 puts a privacy policy before anything is published, and filled in as the cards in deck `hosted` decided it: **who runs it**, B-mkryw, "You, as an individual"; **where to write**, B-8xxrc, "An address on baesian.dev, forwarded"; **deleting an account**, B-b46z3, "Closed for 14 days, then deleted"; and **a withdrawn card's text**, B-dsqyd, "30 days after delivery, as answered". Every statement below is meant to be one the code bears out; [[#Where each statement comes from]] says where. The website shows this text at `/privacy` (`<Privacy />`), linked from every page's footer, signing up, `/counts` and the account page; nothing is published until a release is tagged (B-bk20v). The agent isn't a lawyer, and this isn't legal advice: [[#For a lawyer's eye]] lists what should be checked, and [[#Before it's published]] what must be true first.

## The policy, as the page says it

*Last changed 10 November 2026* (`POLICY_CHANGED`). Changed for B-rehdw ("On the service, for every device", decided by the user) and B-j583c ("From a week to a month old"): your answers on practice cards, and your marks in their blind test ([[Practice Cards]]), are kept on the service in a table of the project's own, apart from its cards and log, so no machine or agent is ever sent them; they name a card only by its ID and keep none of its text, never what you wrote on a practice card, and stay while the project exists, going with it when it's deleted. Practice cards come only from cards the relay still holds, so nothing is kept longer for them. The date is the day of the change; if the release that ships it comes later, move it to that day.

*Earlier the same day:* changed for B-ew5e8 ("Name it beside the agent", decided by the user): a card records the model its agent ran on (`source_model`, B-k0w7d), a name like "claude-opus-5-5" the plugin writes from what the harness says, so the list of what your agents file names it beside the agent; it travels and is deleted with the card's text, and was already under "each card's full text". The date is the day of the change; if the release that ships it comes later, move it to that day.

*Before that, 6 November 2026.* Changed for B-15v62 ("Keep it, and say so", decided by the user): a merge whose commits the service was never told cite cards (made on a machine that isn't signed in to the project) is kept while the project exists, as one that brought only a deck is, since nothing ties it to a card's text; the relay had dropped it at its next daily look, reading "never had their ledger entries" as "they all went". Corrected on 2026-11-05 (B-nkbqs): it had said branch names never reach the service, but every card carries `source_branch`, written by the CLI; what's kept didn't change, only what the page says about it. Changed the same day for D181: the commits that cite cards and the merges the CLI finds go up to the service (their IDs, times, branches and cards, never a commit's subject or message), with how long each is kept; and a second correction, that a branch's deck, which names the branch, is kept while the project is, as decks always were. Changed again the same day for B-w41p7 and B-jr8mk: a merge also keeps the ID of the branch's commit that landed and the IDs of the commits citing cards it brought, and is kept until the text of every card those commits cite is removed too; and the name of the repository's default branch is kept, while the project exists. Both only add what the page lists; nothing new reaches the service but commit IDs it already had and one branch name.

Baesian's hosted service, at baesian.dev, passes your coding agents' design decisions to you as cards, and your answers back to them. This page says what it keeps about you and your projects, why, for how long, who else handles it, and how to have it corrected or deleted.

### Who runs it

Gus Ellerm runs the service, as an individual, and decides what it keeps, which makes Gus Ellerm the controller of your data under data protection law. It isn't a service of the University of Chicago or of Globus, though you can sign in through Globus. To write about your data, use privacy@baesian.dev.

### In short

- The service keeps what it needs to sign you in and to pass cards and answers between your machines and you.
- It can read what your cards say, so it can show them to you and hold some back under your settings. It deletes that text on a schedule, below. Your repository keeps its own record, which the service never sees.
- There are no passwords, no advertising, no selling of data, and no tracking across other sites. The service never stores your network address or where you are.
- It counts how the service is used, never what a card says, unless you turn that off.
- Your account page shows what's kept about your account, and you can delete the account there.

### What it keeps, and why

**Your account, to sign you in and to tell you about changes to it:**
- Your handle, and your email address. One that Globus gave is marked as not checked by us.
- Your passkeys: each one's public key, its name, and when it was added and last used. The private key never leaves your device.
- Your recovery code, kept only as a one-way hash, so it can be checked but not read.
- If you link Globus, the identifier Globus gives for you, and when you linked it.
- Where you're signed in: each browser's name, such as "Firefox on a Mac", and when it signed in and was last used. Not its network address or location.

**Your projects, to pass cards and answers between your machines and you:**
- Each project's name, as you typed it, and its random ID.
- Each machine you approve with `baesian login`: the name it gave (its hostname, unless you chose another), its project, and when it was approved and last used.
- What your agents file: each card's full text and its revisions, withdrawals, attachments and decks, the agent that filed it and the model it ran on, the machine it came from, the name of the branch it was filed on, and when. The branch name is kept with the card's text, and deleted with it; a branch's deck, which is named for the branch, is kept while the project is.
- What Baesian's command line finds in your repository's history, to show your decisions by branch: for each commit that cites a card, its ID, when it was made, its branch and the card; for each merge of a branch with cards, or with commits citing them, into another, the two branches, when, the ID of the merge's commit and of the branch's commit that landed, the cards it brought, and the IDs of the commits citing cards it brought; and the name of your repository's default branch, to show it as the trunk. A commit's subject and message, and what it changed, never reach the service.
- What you answer: your choice and anything you wrote, your handle, whether you answered on a phone or a desktop, and, on a hard card, your passkey's signature over the answer. Also your rules, topic merges and gate settings.
- Your answers on practice cards: past cards brought back with the other option shown as the agent's pick, to see how often you come round to a pick an agent didn't make. For each, the card it was rebuilt from, when you answered that card, which option you chose before seeing the pick shown and which after, or that you answered another way, your handle, whether you answered on a phone or a desktop, and when. In the blind test that comes first, also whether you thought each card you answered was rebuilt, and when you started it. Never what you wrote on a practice card. They're kept apart from your cards: no machine or agent is ever sent them.
- While a project's page is open, that you're there: the time of its latest heartbeat, and whether it's a phone or a desktop, so waiting agents know. While an agent waits for a card, that it's waiting. Either counts for 90 seconds after its latest heartbeat.

**Notifications, if you turn them on:** for each browser, the address its push service gives for it, the keys a notification is encrypted to, and the browser's name. A notification says how many cards are waiting, at which levels, in which project. Never what a card says.

**Usage counts:** counts and timings of how the service is used, such as how many cards are answered and how long they waited. Never what a card says, nor anyone's name. Every field is listed at /counts. Every account is counted unless it turns this off on the account page.

**What it doesn't keep:**
- Your network address, which is used in passing to limit how often sign-in can be tried and to check for bots, then forgotten.
- Passwords: there are none.
- Your repository: its code, file paths and name never reach the service, nor any commit's subject or message. Only what an agent writes in a card does, with the name of the branch it was filed on; for the commits that cite cards and the merges that bring them, their IDs, times and branches; and the name of its default branch.

**In your browser:**
- The sign-in cookie while you're signed in, and a second cookie for ten minutes during a Globus sign-in. No other cookies.
- On a project's page, which cards you've seen and how long you spent on each, to show what's new. That stays in your browser.

### Why it's allowed to

- **To provide the service you signed up for:** your account, signing in, passing cards and answers, and the notifications you turn on. This is necessary to perform the contract with you (GDPR Article 6(1)(b)).
- **To keep it safe and to know how it's used:** the limits on sign-in, the bot check at sign-up, and the usage counts. These are legitimate interests (Article 6(1)(f)): the interest in a service that works and can be paid for, weighed against yours, with the counts limited to fixed values and a way to turn them off.

### How long it's kept

| What | How long |
|---|---|
| A card's text, once answered or withdrawn | 30 days after every machine signed in to the project has the answer or the withdrawal. Then only its ID, times, sizes and level stay. |
| A card's text, held back by your settings and never answered | 90 days after it arrived. Then only its ID, times, sizes and level stay. |
| A card's text, waiting for you | Until it's answered or withdrawn. |
| A commit's ID, time and branch, for the card it cites | As long as that card's text: removed with it. |
| A merge: its two branches, its time, the IDs of its commit, of the branch's commit that landed and of the commits citing cards it brought, and the cards it brought | Until the text of every card it brought is removed. One that brought commits citing cards: until the text of every card they cite is removed too, which the service can tell only for the commits it was told cite cards. One whose commits the service was never told cite cards (they were made where Baesian isn't signed in to the project), or that brought only a branch's deck: while the project exists, since nothing ties it to a card's text. |
| Your repository's default branch: its name | While the project exists. |
| Your decks, each a branch's or a piece of work's, with its name | While the project exists. |
| Your rules, topic merges and gate settings | While the project exists. |
| Your answers on practice cards, and your marks in the blind test | While the project exists. They name a card only by its ID, so they keep none of its text. |
| Usage events | 90 days, then only daily totals, with no ID. |
| A sign-in | Until you sign out, or 30 days unused, or 90 days in all. |
| A machine | Until you sign it out, or 30 days unused. |
| An emailed code | 15 minutes. |
| Your account, and everything listed under it | Until you delete it, and 14 days after, while it can still be restored. |

### Who else handles it

- **Cloudflare, Inc.** runs the service: everything above is stored on its platform, it sends the service's emails, and it runs the bot check at sign-up (Turnstile). It carries every request, so it sees your network address. For the bot check it also uses what it sees to improve its own bot detection, for its own purposes.
- **Globus**, run by the University of Chicago, if you sign in through it: you sign in at Globus, which tells the service your Globus identifier and email address. Globus's own privacy policy covers your Globus account.
- **Your browser's push service** (Google's, Mozilla's, Apple's or Microsoft's), if you turn on notifications: it carries each one to your browser, encrypted so it can't read it.

Nobody else. Your data isn't sold, shared for advertising, or used to train models.

### Where it's kept

On Cloudflare's platform, in its default locations; the accounts database is in eastern North America. If you're in the EU or the UK, your data goes to the United States under Cloudflare's data processing terms.

### Your rights

You can ask to see what the service keeps about you, to have it corrected or deleted, to have a copy you can take elsewhere, and to restrict or object to how it's used. You can also complain to your data protection authority.

Much of it you can do yourself, on your account page: see your account, passkeys, sign-ins and machines; sign any of them out; turn off usage counts; and delete your account. For anything else, write to privacy@baesian.dev. You'll have an answer within a month.

### Deleting your account

Deleting it, on your account page, asks for your passkey and your handle. The account is closed at once: every sign-in and machine is signed out, nothing more is relayed or counted, and a notice is emailed to you.

For 14 days, signing in with your passkey can restore it as it was. Then everything goes for good: your account, email addresses, passkeys, recovery code, Globus link, sign-ins, machines, notifications and raw usage events, and every project you own, with all its cards and answers on the service, practice answers included. Daily usage totals, which name no one, stay. Your repositories keep their own record.

### Security

- Every connection is encrypted, and Cloudflare encrypts what it stores.
- Sign-in tokens, emailed codes and recovery codes are kept only as hashes.
- Signing in takes a passkey, and adding a way in, approving a machine or deleting the account asks for it again.
- Baesian's command line refuses to send a card that looks like it holds a password or key, unless the agent gives a reason.
- The service can read what cards say, so its operator technically could. The operator doesn't look at a project's cards unless its owner asks for help with them, or to deal with abuse or a security problem.

### Changes

When this policy changes, the date at the top changes. If a change affects what's kept or why, account holders are emailed before it takes effect.

## Where each statement comes from

- **Who runs it, and where to write:** cards B-mkryw and B-8xxrc; `OPERATOR` and `PRIVACY_CONTACT` in `<Privacy />`.
- **The account's rows:** `Accounts.createAccount`, the tables in `service/migrations/` ([[File Formats#Accounts (M9c)]]). Recovery codes, tokens and emailed codes as hashes: `hashOf()`. A Globus email kept unverified, and only the `sub`: `identityFrom()`, [[service]].
- **Sign-ins:** a browser's name from `browserName()`, the lifetimes in `LIMITS` (`sessionIdleMs`, `sessionMaxMs`, `grantIdleMs`, `codeMs`). The cookies: `SESSION_COOKIE`, and the Globus round trip's ten-minute cookie (`service/src/globus.ts`).
- **Nothing about where a sign-in came from** (B-7bq05): the address is passed to the rate limiter and Turnstile's siteverify (`turnstile()`) and never written.
- **What the relay keeps:** `SqlFileStorage` and its log (`RelayEntry`); the machine's name on an entry (D162); an answer's handle, account, project and client (`Relay.verdict`); presence and waiting markers, stale after 90 seconds (`PRESENCE_STALE_MS`).
- **The commits and merges (D181):** what a machine may send is `AGENT_KINDS` in `service/src/uploads.ts`: a ledger entry (`LedgerMeta`) only with a body that names nothing but the commit's short ID and the card (`isLedgerBody()`), so no subject or message, and the CLI offers only those (`plainLedger()`, [[src-sync]]); a merge (`MergeEvent`), whose `tip` and `commits` are commit IDs (B-w41p7). How long: a ledger entry is its card's path (`cardOfPath()`), removed with its text without putting it off (`SqlFileStorage.cardsInLog`); a merge goes when every card it brought has, and each of its commits had ledger entries here that went with their cards' text, none left (`Relay.sweep`; the relay notes those commits in `retention_commits`, B-15v62), so one listing commits whose entries never came stays while the project does. Decks are never removed by retention.
- **The default branch (B-jr8mk):** `default-branch.json` in `AGENT_KINDS`, read through `DefaultBranch`, whose only field is `branch`, a name as git allows one (`BranchName`): no spaces or other text can ride in it. Mutable state on the relay, replaced by the next one sent, never logged, and gone with the project (`ProjectRelay`'s storage deleted whole).
- **Retention:** `RETENTION` in `service/src/retention.ts` (B-9jqt4, B-ec3kj, B-dsqyd); usage events, `USAGE_RAW_DAYS`.
- **Practice answers (B-rehdw):** `PracticeEntry`, whose fields are the card's ID and revision, when its original was answered, the blind choice and the final answer's kind against the planted pick, and whether it came in the blind test; or in the test a guess, an entry of its own naming its card and whether it was practice; with who, which client and when; a field it doesn't list is refused (`PRACTICE_FIELDS`, `practiceEntry()`). Kept in the project's object by `PracticeTable`, apart from `SqlFileStorage` and its log, at an address a machine's token is refused at (the Worker's `person` routes), and deleted with the project (`ProjectRelay.erase`). Practice comes only from cards the relay still holds (`MAX_AGE_MS`, B-j583c), so `RETENTION` is unchanged.
- **Deleting an account:** B-b46z3, [[service#Deleting an account (service/src/deletion.ts)]].
- **Notifications:** `pushText()` (counts and levels only, B-mjf3g), `encrypt()` (RFC 8291), `pushServiceAllowed()` (the four push services).
- **Usage counts:** `USAGE_KINDS` and `NEVER_COUNTED`, which `/counts` shows.
- **In the browser:** the client's `storageKey()` (seen cards, time spent, notifications), never sent.
- **The secret check:** B-jfkv9, `secret_reason` on `CardMeta`.
- **The model an agent ran on:** B-k0w7d, `source_model` on `CardMeta`, filled in by the CLI from the session's model the plugin's hooks keep (`SessionModel`), never by the agent; named on the page by B-ew5e8.
- **Where:** the accounts database in eastern North America (`service/wrangler.jsonc#d1_databases`); one default location for every project (B-grrr9).

## Before it's published

- **privacy@baesian.dev must reach the operator** (B-8xxrc): turn on Cloudflare's Email Routing for baesian.dev in the dashboard, which adds the domain's MX records, verify the inbox it forwards to, add a rule forwarding `privacy@` there, and send a test message from an outside address. No agent may do this here. Check sign-in codes still arrive after.
- **The date:** set `POLICY_CHANGED` to the day it's published.
- **Workers Logs:** off in the Worker's configuration since 2026-11-04 (below), which every deployment applies. After the first deployment, confirm in the dashboard that the Worker shows no Workers Logs and the account no Logpush job.

## For a lawyer's eye

Things the agent couldn't settle, and which should be checked before the policy is published. None of these is on the page.

- **The operator as an individual** (B-mkryw): the user is personally the controller under the GDPR and similar laws. The service runs in a Cloudflare account under the user's University of Chicago address (D177), and the user works at Globus Labs; the page says it "isn't a service of the University of Chicago or of Globus". Whether the University agrees with that, and whether its rules for accounts under its addresses say otherwise, is worth a check (B-mkryw's own check).
- **Contact details:** the page gives an email address only. GDPR Article 13(1)(a) asks for "the identity and the contact details of the controller"; whether a postal address is needed too.
- **An EU or UK representative** (GDPR Article 27, UK GDPR Article 27): a controller outside the EU that offers a service to people in it may need to name one, unless the processing is occasional and low-risk. *Unverified* whether the exemption applies here.
- **Transfers:** the page says data goes to the United States "under Cloudflare's data processing terms". B-grrr9's research found those rest on the EU-US Data Privacy Framework and standard contractual clauses; whether the operator must also offer clauses to EU organisations, as B-grrr9's alternative mentioned, is open. *Unverified* that Cloudflare's DPA covers Email Sending and Turnstile as it covers Workers (B-pvye0 left that unchecked).
- **Turnstile's role:** B-mz6qc's research read Cloudflare as a controller of Turnstile's signals, and B-1a03b said Cloudflare's Turnstile privacy addendum would be named in the policy. The page says Cloudflare uses them "for its own purposes" and names no addendum. Whether it must link Cloudflare's own policy or the addendum is for a lawyer.
- **Legitimate interests** for the bot check, the limits and usage counts: [[Usage Counts Balancing Test]] covers the counts only. Whether security processing needs its own written test.
- **Contract as the basis** for running the service assumes there are terms of service to perform. None exist yet. Whether the service needs terms before it's published, or the policy should rest on something else until then.
- **The promise not to look at cards** (Security): a commitment, not a fact of the code. The user should agree to it before it's published, and say what "abuse" covers.
- **The promise to email before changes** (Changes): likewise a commitment.
- **"Within a month"**: GDPR Article 12(3)'s period, extendable by two months for complex requests. Whether to say so.
- **The 14 days after deletion** (B-b46z3): everything is kept, closed, for 14 days after someone asks for it to go. Whether that's "without undue delay" (Article 17) when the request is made by deleting, and whether the page should offer deletion at once on request.
- **Children:** the page says nothing about age. The service doesn't ask. Whether a minimum age should be stated.
- **US state laws:** not covered (as [[Usage Counts Balancing Test]] notes); the service is likely below every threshold, *unverified*.
- **Cloudflare's own logs:** the Worker's configuration turns Workers Logs off (`service/wrangler.jsonc#observability`, `enabled: false`; Cloudflare's docs say every new Worker has them on unless its configuration says otherwise) and sets up no Logpush, so the service keeps no request logs of its own. *Unverified* what Cloudflare keeps for its own operation.
- **Email Sending's own retention** of messages and recipients: not checked.
