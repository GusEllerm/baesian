---
type: design
status: draft
authority: proposes
summary: "The hosted service's privacy policy, drafted for the hard card Hosted Service section 6 asks for before anything is published: who runs it, what it keeps and why, the lawful basis, how long, who else handles it, people's rights and how to reach the operator. Its two open choices (who is named as running it, and the contact address) are cards; the website's /privacy page carries this text. Not legal advice; what needs a lawyer is listed at the end."
created: 2026-11-04
updated: 2026-11-04
reviewed: 2026-11-04
tags: [baesian, design, hosted, privacy]
---

# Privacy Policy

> **Status: a draft, for the user to check.** Drafted by the builder of M9f's last pieces on 2026-11-04, because [[Hosted Service]] section 6 puts a privacy policy before anything is published. Every statement below is meant to be one the code bears out; [[#Where each statement comes from]] says where. Two choices the policy turns on are open, as cards in deck `hosted`: **who is named as running the service** and **which address people write to** (marked ⟨operator⟩ and ⟨contact⟩ below). The policy describes account deletion as its card decides it (⟨deletion⟩). The website shows this text at `/privacy` (`<Privacy />`); nothing is published until a release is tagged (B-bk20v). The agent isn't a lawyer, and this isn't legal advice: [[#For a lawyer's eye]] lists what should be checked.

## The policy, as the page says it

*Last changed: the day it's published.*

Baesian's hosted service, at baesian.dev, passes your coding agents' design decisions to you as cards, and your answers back to them. This page says what the service keeps about you and your projects, why, for how long, who else handles it, and how to have it corrected or deleted.

### Who runs it

⟨operator⟩ runs the service and decides what it keeps, which makes ⟨operator⟩ the controller of your data under data protection law. To reach ⟨operator⟩, write to ⟨contact⟩.

### In short

- The service keeps what it needs to sign you in and to pass cards and answers between your machines and you.
- It can read what your cards say, so it can show them to you and hold some back under your settings. It deletes that text on a schedule, below. Your repository keeps its own record, which the service never sees.
- There are no passwords, no advertising, no selling of data, and no tracking across other sites. The service never stores your network address or where you are.
- It counts how the service is used, never what a card says, unless you turn that off.
- Your account page shows what's kept about your account, and you can delete the account there.

### What it keeps, and why

**Your account**, to sign you in and to tell you about changes to it:
- your handle, and your email address (one that Globus gave is marked as not checked by us);
- your passkeys: each one's public key, its name, and when it was added and last used. The private key never leaves your device;
- your recovery code, kept only as a one-way hash, so it can be checked but not read;
- if you link Globus, the identifier Globus gives for you, and when you linked it;
- where you're signed in: each browser's name, such as "Firefox on a Mac", and when it signed in and was last used. Not its network address or location.

**Your projects**, to pass cards and answers between your machines and you:
- each project's name, as you typed it, and its random ID;
- each machine you approve with `baesian login`: the name it gave (its hostname, unless you chose another), its project, and when it was approved and last used;
- what your agents file: each card's full text and its revisions, withdrawals, attachments and decks, the agent that filed it, the machine it came from, and when;
- what you answer: your choice and anything you wrote, your handle, whether you answered on a phone or a desktop, and, on a hard card, your passkey's signature over the answer. Also your rules, topic merges and gate settings;
- while a project's page is open, that you're there, so waiting agents know; while an agent waits for a card, that it's waiting. Each lapses after 90 seconds without a heartbeat.

**Notifications, if you turn them on:** for each browser, the address its push service gives for it, the keys a notification is encrypted to, and the browser's name. A notification says how many cards are waiting, at which levels, in which project. Never what a card says.

**Usage counts:** counts and timings of how the service is used, such as how many cards are answered and how long they waited. Never what a card says, nor anyone's name. Every field is listed at /counts. Every account is counted unless it turns this off on the account page.

**What it doesn't keep:**
- your network address, which is used in passing to limit how often sign-in can be tried and to check for bots, then forgotten;
- passwords: there are none;
- your repository: its code, branches, file paths and name never reach the service. Only what an agent writes in a card does.

**In your browser:**
- the sign-in cookie while you're signed in, and a second cookie for ten minutes during a Globus sign-in. No other cookies;
- on a project's page, which cards you've seen and how long you spent on each, to show what's new. That stays in your browser.

### Why it's allowed to

- **To provide the service you signed up for:** your account, signing in, passing cards and answers, and the notifications you turn on. This is necessary to perform the contract with you (GDPR Article 6(1)(b)).
- **To keep it safe and to know how it's used:** the limits on sign-in, the bot check at sign-up, and the usage counts. These are legitimate interests (Article 6(1)(f)): ⟨operator⟩'s interest in a working, affordable service, weighed against yours, with the counts limited to fixed values and an opt-out.

### How long it's kept

| What | How long |
|---|---|
| A card's text, once answered | 30 days after every machine signed in to the project has the answer. Then only its ID, times, sizes and level stay. |
| A card's text, once withdrawn | ⟨withdrawn⟩ |
| A card's text, held back by your settings and never answered | 90 days after it arrived, then only its ID, times, sizes and level. |
| A card's text, waiting for you | until it's answered or withdrawn |
| Your rules, topic merges and gate settings | while the project exists |
| Usage events | 90 days, then only daily totals, with no ID |
| A sign-in | until you sign out, or 30 days unused, or 90 days in all |
| A machine | until you sign it out, or 30 days unused |
| An emailed code | 15 minutes |
| Your account, and what's listed under it | until you delete it |

### Who else handles it

- **Cloudflare, Inc.** runs the service: everything above is stored on its platform, it sends the service's emails, and it runs the bot check at sign-up (Turnstile). It carries every request, so it sees your network address. For the bot check it also uses what it sees to improve its own bot detection, for its own purposes.
- **Globus**, run by the University of Chicago, if you sign in through it: you sign in at Globus, which tells the service your Globus identifier and email address. Globus's own privacy policy covers your Globus account.
- **Your browser's push service** (Google's, Mozilla's, Apple's or Microsoft's), if you turn on notifications: it carries each one to your browser, encrypted so it can't read it.

Nobody else. Your data isn't sold, shared for advertising, or used to train models.

### Where it's kept

On Cloudflare's platform, in its default locations; the accounts database is in eastern North America. If you're in the EU or the UK, your data goes to the United States under Cloudflare's data processing terms.

### Your rights

You can ask to see what the service keeps about you, to have it corrected or deleted, to have a copy you can take elsewhere, and to restrict or object to how it's used. You can also complain to your data protection authority. Much of it you can do yourself, on your account page: see your account, passkeys, sign-ins and machines; sign any of them out; turn off usage counts; and ⟨deletion⟩. For anything else, write to ⟨contact⟩. You'll have an answer within a month.

### Security

- Every connection is encrypted, and Cloudflare encrypts what it stores.
- Sign-in tokens, emailed codes and recovery codes are kept only as hashes.
- Signing in takes a passkey, and adding a way in, approving a machine or deleting the account asks for it again.
- Baesian's command line refuses to send a card that looks like it holds a password or key, unless the agent gives a reason.
- The service can read what cards say, so ⟨operator⟩ technically could. ⟨operator⟩ doesn't look at a project's cards unless its owner asks for help with them, or to deal with abuse or a security problem.

### Changes

When this policy changes, the date at the top changes. If a change affects what's kept or why, account holders are emailed before it takes effect.

## The open choices

- **⟨operator⟩, who is named as running the service:** card **B-mkryw** (topic `hosted/privacy-operator`), filed 2026-11-04. The user runs it, in the Cloudflare account under their University of Chicago address (D177), and works at Globus Labs; the card asks whether the policy names the user as an individual or the University.
- **⟨contact⟩, where people write:** card **B-8xxrc** (topic `hosted/privacy-contact`).
- **⟨deletion⟩, deleting an account:** card **B-b46z3** (topic `hosted/account-deletion`), what it removes and whether there's a grace period. Until it's answered, the page says to write to ⟨contact⟩ to have the account deleted.
- **⟨withdrawn⟩, a withdrawn card's text:** card **B-dsqyd** (topic `hosted/withdrawn-text-retention`). Until it's answered, a withdrawn card keeps its text while the project exists.

## Where each statement comes from

- **The account's rows:** `Accounts.createAccount`, the tables in `service/migrations/` ([[File Formats#Accounts (M9c)]]). Recovery codes, tokens and emailed codes as hashes: `hashOf()`. A Globus email kept unverified, and only the `sub`: `identityFrom()`, [[service]].
- **Sign-ins:** a browser's name from `browserName()`, the lifetimes in `LIMITS` (`sessionIdleMs`, `sessionMaxMs`, `grantIdleMs`, `codeMs`). The cookies: `SESSION_COOKIE`, and the Globus round trip's ten-minute cookie (`service/src/globus.ts`).
- **Nothing about where a sign-in came from** (B-7bq05): the address is passed to the rate limiter and Turnstile's siteverify (`turnstile()`) and never written.
- **What the relay keeps:** `SqlFileStorage` and its log (`RelayEntry`); the machine's name on an entry (D162); an answer's handle, account, project and client (`Relay.verdict`); presence and waiting markers, stale after 90 seconds (`PRESENCE_STALE_MS`).
- **Retention:** `RETENTION` in `service/src/retention.ts` (B-9jqt4, B-ec3kj); usage events, `USAGE_RAW_DAYS`.
- **Notifications:** `pushText()` (counts and levels only, B-mjf3g), `encrypt()` (RFC 8291), `pushServiceAllowed()` (the four push services).
- **Usage counts:** `USAGE_KINDS` and `NEVER_COUNTED`, which `/counts` shows.
- **In the browser:** the client's `storageKey()` (seen cards, time spent, notifications), never sent.
- **The secret check:** B-jfkv9, `secret_reason` on `CardMeta`.
- **Where:** the accounts database in eastern North America (`service/wrangler.jsonc#d1_databases`); one default location for every project (B-grrr9).

## For a lawyer's eye

Things the agent couldn't settle, and which should be checked before the policy is published. None of these is on the page.

- **Who the controller is** (the operator card): if the University of Chicago, its own privacy office and policies likely govern the wording, and it may need to approve the service first. If the user as an individual, the user is personally responsible under the GDPR and similar laws.
- **An EU or UK representative** (GDPR Article 27, UK GDPR Article 27): a controller outside the EU that offers a service to people in it may need to name one, unless the processing is occasional and low-risk. *Unverified* whether the exemption applies here.
- **Transfers:** the page says data goes to the United States "under Cloudflare's data processing terms". B-grrr9's research found those rest on the EU-US Data Privacy Framework and standard contractual clauses; whether the operator must also offer clauses to EU organisations, as B-grrr9's alternative mentioned, is open. *Unverified* that Cloudflare's DPA covers Email Sending and Turnstile as it covers Workers (B-pvye0 left that unchecked).
- **Turnstile's role:** B-mz6qc's research read Cloudflare as a controller of Turnstile's signals; the page says Cloudflare uses them "for its own purposes". Whether the policy must name Cloudflare's own privacy policy, or the basis for sending the signals at all, is for a lawyer.
- **Legitimate interests** for the bot check, the limits and usage counts: [[Usage Counts Balancing Test]] covers the counts only. Whether security processing needs its own written test.
- **Contract as the basis** for running the service assumes there are terms of service to perform. None exist yet. Whether the service needs terms before it's published, or the policy should rest on something else until then.
- **The promise not to look at cards** (Security): a commitment, not a fact of the code. The user should agree to it before it's published, and say what "abuse" covers.
- **The promise to email before changes** (Changes): likewise a commitment.
- **"Within a month"**: GDPR Article 12(3)'s period, extendable by two months for complex requests. Whether to say so.
- **Children:** the page says nothing about age. The service doesn't ask. Whether a minimum age (16 in much of the EU for consent; contract is the basis here) should be stated.
- **US state laws:** not covered (as [[Usage Counts Balancing Test]] notes); the service is likely below every threshold, *unverified*.
- **Cloudflare's own logs:** the Worker's configuration enables no Workers Logs or Logpush (`service/wrangler.jsonc` has no `observability`), so the service keeps no request logs of its own. *Unverified* what Cloudflare keeps for its own operation, and whether the dashboard turned Workers Logs on for the Worker; check before publishing.
- **Email Sending's own retention** of messages and recipients: not checked.
