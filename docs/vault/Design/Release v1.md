---
type: design
status: draft
authority: proposes
summary: "M10's plan, for the lead to hand to builders: what's already done; the formats review D108 and D124 call for before v1, with ten findings; publishing the CLI to npm from CI with provenance, and the plugin from this repo's marketplace for Claude Code and Codex; what v1 means; the docs; the steps in order, each with the card it waits on. Thirteen decisions are cards in deck release-v1."
created: 2026-11-10
updated: 2026-11-10
tags: [baesian, design, release, plan]
---

# Release v1

> **Status: plan (2026-11-10), by an agent, for the lead to hand to builders. Nothing in it is built.** M10 in [[Implementation Plan]]: "the review before publishing (D108) and the cards in deck `release`, the stability cards in deck `stability`, a licence, publishing (npm, the plugin's marketplace), and the docs". Every decision here that the [[Working Agreement]] gives the user is a card in deck `release-v1`, listed in [[#Decisions in deck release-v1]]. Only what cites a D-number or an answered card is decided; the rest is the agent's recommendation, for builders to follow once the cards it rests on are answered.

## In brief

- **Done already:** the `release` and `stability` decks, the licence, the public repo, the service deploying from a release tag, and the README with its setup guide. Nothing here redoes them.
- **The formats review** found no file that must change in place before formats freeze. It found five things about how changes roll out once releases differ, each a card: a format change reaching an older CLI, the relay's own tables, hook blocks across releases, a single pinned service key, and which Baesian a repo's CI runs. The rest are fixes a builder makes without asking.
- **npm:** the name `baesian` is free. The package is nearly ready: it needs `private` gone and a repository field, which trusted publishing requires. CI publishes it from the same release tag that deploys the service, after the service.
- **The plugin:** this repo stays its marketplace, added as `GusEllerm/baesian` in both harnesses. Its version must move with each release, or nobody who installed it gets an update.
- **v1:** the number, what it promises, and how a format change rolls out are the user's, on three cards. Once v1 is published, D108 ends.
- **The docs** change once install is `npm install -g baesian`: the README, the setup guide, and three new pieces (updating, compatibility, and what a linked public repo publishes), with a SECURITY.md and release notes.

## What's done

| What | Where |
|---|---|
| The deck `release` (B-7sjec, B-g6ywj, B-vqn69) and the deck `stability` (B-9v5xj, B-ghhym): answered and built | [[Decision Log]] |
| The licence, FSL-1.1-ALv2 (B-qx0vq), in `LICENSE.md` and `package.json#license` | the README's Licence section |
| The repo is public (D182) | GitHub |
| The service is live at https://baesian.dev, deployed by `.github/workflows/deploy.yml` on a `v*` tag on main whose name matches package.json's version (B-bk20v, B-3femd) | [[Hosted Service]], [[service]] |
| The README is a front page (B-3fgyc), leading with the hosted client (B-k3451), with the full setup in `docs/setup.md` | the README |
| The plugin lives in this repo, with the marketplace file at its root, and versions with the CLI (D114, B-rwp68); Codex installs the same plugin from the same marketplace (D118) | [[Baesian Design]] |
| `package.json` already has the command (`package.json#bin`), what ships (`package.json#files`: `dist` without `dist/site`) and Node 22 or later (`package.json#engines`). It's still `package.json#private`, "until the licence and the release are decided" ([[Implementation Plan#Stack]]) | |

Today people build the CLI from a clone (`npm run build && npm link`) and add the plugin from a local path.

## The formats review (D108, D124)

D108 left the formats free to change until a v1 is published, and D124 accepted them "to be reviewed again just before publishing". From v1 on, a change to a format needs a new format number and an upgrade from the one before (D156, D157; `upgradeFile()`). This is that review: every file Baesian writes, what has changed since D124 (2026-11-02), and what to settle before the formats freeze. [[File Formats]] describes each one; [[Formats for v1]] designed most of what's new.

### What changed since D124

| Where | What changed | Decided by |
|---|---|---|
| Every file | a format number, read by kind, older read in memory, newer refused by name | D156, D157 |
| The record (`.baesian/`) | preference files, with what the commit gate looks at; gate records and the held status; on cards: convention and slider fields, `secret_reason`, `answered_in_chat`, `source_model`, the privacy fact; on verdicts: `should_have_asked`, `seen`, `account`, `project`, `card_digest`; ledger entries that go up to the relay | D144–D151, D161, B-qkek1, B-y6jn6, B-jfkv9, B-hswmx, B-k0w7d, B-z3agk, B-87tkc, B-tf9fc, B-f571v, D181 |
| Signatures and trust | `.sig` files in OpenSSH's format; passkey proofs, then their batch form; the service's keys, revocations and passkey keys in `trust/`; the project's line in CI's pin | D138, D139, D142, D159, D160, D163, B-a6xpc, B-mar8x |
| The live layer (`.git/baesian/`) | merges, with the tip and commits they brought, named by target; per-session cursors; each session's model, written by the plugin; `relay.json`; personal mode's config and `before-linking.json` | D181, B-w41p7, B-ttn2c, B-ghhym, B-k0w7d, B-4rwyz, B-45xz8 |
| The config | `service`, `project`, `first_commit`, `user_facing`; the gate's lists moved out to the preference files | B-5gnea, B-w4g6c, B-bf29j, B-qkek1 |
| Personal files | the machine's grant, mode 0600 | B-84e0d, B-gq8j1 |
| The relay | its entry, with `enc` reserved and `before_linking`; the default branch; a protocol versioned at `/v1/` | D137, D162, B-3zjjx, B-jr8mk, B-7z97x |
| The relay's storage | each project's tables: files, log, meta, pending, before_linking, retention and notifications | B-0ag7h, B-9jqt4, B-ec3kj, B-15v62, B-advkh |
| The accounts database | five numbered migrations, applied by the deploy, only adding | B-ytdt2 |
| The vault | decision and rule notes, each with its own format number | D170–D175 |

Each of these changed in place, at format 1, as D108 allowed. File Formats is up to date with all of them.

### Findings

1. **Format 1 is everything 0.1.x wrote, and that's how it should freeze.** Several kinds changed in place at format 1, and v1's schemas still read the older shapes: merges without a tip, ledger entries listing files, cursors without a type, configs that still hold the gate's lists, and proofs without a batch. All of these are additions, read as File Formats says. Bumping every kind to format 2 at v1 would buy little, since every released 0.1.x already refuses a newer format by name. **No card: it's how D156 was built.** A builder adds a test that reads the record at every release tag, `v0.1.0` to `v0.1.10`, with v1's schemas, and the test stays as releases accrue.
2. **No release knows another's version across the relay.** The CLI sends the relay no version, and the relay checks none. Under D157, a file in a newer format that comes down in a pull stops the next command partway, whether the service wrote it or a teammate's newer CLI did. **Card B-4p43b** asks whether a release writes a new format at once or keeps writing the old one for a release. Either way the CLI should send its version on every request, and the relay should answer a CLI it knows is too old before any pull.
3. **The relay's tables have no version.** Each project's Durable Object makes its tables with `CREATE TABLE IF NOT EXISTS` and nothing else, and real projects are already stored. **Card B-866d2** asks for numbered migrations, run as each project wakes, or tables and columns that are only ever added to.
4. **Hook blocks across releases.** `onlyBaesianBlock()` lets a commit add only Baesian's own block when it's exactly this version's (B-g6ywj). Its text changed three times in three days. Once teammates and CI run different releases, a teammate's `baesian init` would need an ack, and CI on another release would fail it. **Card B-np6af**, a narrower question on B-g6ywj's subject.
5. **One pinned service key.** CI trusts only the keys in `BAESIAN_TRUST`, and a pinned key the record doesn't hold yet is no problem for it (`pinProblems()`). So a spare could be pinned now. Without one, replacing the service's key fails CI in every hosted repo until each owner pins again. **Card B-x47ek.**
6. **Which Baesian CI runs.** `workflowBody()` prints `npx baesian verify`, unpinned, so each run fetches the latest release. Under D157 that keeps CI new enough to read what the service writes, but it also lets a new release change a repo's CI result with no commit. **Card B-c0e0d**, which builds on B-4p43b.
7. **AGENTS.md's block across releases.** `baesian init` rewrites the block to its own text, so teammates on different releases would flip it back and forth in their commits. It isn't a gate fact, and the plugin's hooks print the installed CLI's own instructions anyway. *The agent's recommendation, a two-way door:* `init` leaves a block that a newer release wrote, and says so. What the block may change between releases depends on B-4kj4d.
8. **The plugin's version never moves.** `plugins/baesian/.claude-plugin/plugin.json#version` is 0.0.0. Claude Code and Codex both install a plugin again only when its version changes (Claude Code's plugin docs; Codex keys its plugin cache by the manifest's version), so nobody who added the marketplace would get an update. **No card:** the plugin versions with the CLI (D114, B-rwp68), and the release commit sets the version (B-3femd). The release commit sets the plugin's version to package.json's, and the deploy's tag check covers both. The version stays out of the marketplace entry, since Claude Code reads plugin.json's and reports a mismatch.
9. **What a linked public repo publishes besides the cards' text.** That's the reviewer's handle and account ID on each answer, each passkey's public key and credential ID in `trust/`, and the model each card's agent ran on. B-vqn69 decided what a public repo's record keeps, and the privacy page covers only what the service keeps. **No card;** the setup guide says it in a sentence ([[#The docs]]).
10. **Digests carry no algorithm name.** `card_digest`, the relay entry's digest and the passkey batch are bare SHA-256 hex. A move to another hash would be a new format, as anything is from v1, so nothing to do now.

**Checked, and fine:** the session's model file, which the plugin writes and the CLI reads: one in a newer format is ignored (`Store.sessionModel`), not refused. The reserved fields (`enc`, a classifier's) are refused by name. A `.sig` carries SSHSIG's own version. The accounts database has numbered migrations. Mutable local files are written in the newest format the next time they're written. The commit trailers need no version (D52).

## Publishing the CLI to npm

**The name.** On 2026-11-10 `npm view baesian` and `npm view @baesian/cli` both returned 404, so neither is taken; `bayesian` is (0.0.1). The hook block `hookBlock()` writes already tells people `npm i -g baesian` when the CLI is missing. **Card B-emtd9** (hard): `baesian`, or `@baesian/cli` under an npm organisation.

**How people install it.** **Card B-n15wk:** `npm install -g baesian`, or `npx baesian` with nothing installed. The crux is the commit gate, which runs from git's hooks outside any agent session. They run `baesian` from PATH, and otherwise the fallback `baesian init` records, which is the path of the script that ran it (`selfCommand()`). Under npx, that path is in npm's cache.

**What ships.** `npm pack --dry-run` on 2026-11-10, from a `dist/` built on 2026-11-05: 111 files, 1.07 MB packed and 2.57 MB unpacked.
- **The CLI's JavaScript**, and `LICENSE.md`, the README and package.json.
- **The client's build in `dist/client/`**, 1.19 MB of it, which `baesian serve` finds beside its module (`findClient()`, D98). So the client ships with the CLI, as D50 planned.
- **Nothing of the website or the service:** `dist/site/` and `service/` stay out.
- **Five runtime dependencies,** all in `dependencies`. React and Motion are bundled into the client by Vite.
- `VERSION` reads package.json, so `baesian --version` reports the release (B-3femd).

**What package.json needs,** once B-emtd9 and B-xr2fa are answered:
- **`private` goes.**
- **A repository field,** `{"type": "git", "url": "git+https://github.com/GusEllerm/baesian.git"}`. Trusted publishing and provenance need it to match the repo exactly, case included (npm's docs).
- **Homepage, bugs and keywords,** for npm's page.
- **No source maps:** `!dist/**/*.map` in `files`. They're 639 KB of the package and point at `src/`, which doesn't ship. *The agent's choice; including `src/` instead is the alternative.* Under a scoped name, `publishConfig.access` is public too.
- **`bin` and `engines` stay.** Node 22 is what Baesian needs; publishing needs Node 22.14 or later and npm 11.5.1 or later on the runner, not on people's machines.

**From CI.** **Card B-xr2fa** (hard): CI publishes on the release tag, or stages the version on npm for the user to approve with 2FA. Either way, the steps:
1. **A publishing job in `.github/workflows/deploy.yml`, after the deploy.** It needs the deploy job, so the service goes live before the CLI that talks to it. It has `id-token: write` on that job alone; the deploy keeps `contents: read`.
2. **Node 24, with setup-node's npm cache off** (`package-manager-cache: false`), from setup-node's docs: a poisoned cache could reach the job's credentials. Then `npm ci` and `npm run build` from a clean checkout, since `tsc` doesn't clear `dist/` and a local `dist/` can hold removed modules. Then `npm publish`, or `npm stage publish` (npm 11.15.0 or later). Provenance is automatic under trusted publishing from a public repo.
3. **On npmjs.com, the user** makes or uses an npm account with 2FA, adds a trusted publisher naming GusEllerm/baesian and `deploy.yml`, and sets the package to disallow tokens. *Unverified:* whether a trusted publisher can be set up before the package's first version exists. If not, the user publishes or stages the first version by hand, and CI takes over from the second.
4. **The release, as B-bk20v and B-3femd have it:**
   - merge v1/next into main;
   - set the version in package.json, `service/package.json` and the plugin's manifest;
   - tag `vX.Y.Z` on main.

   The deploy then migrates the accounts database, deploys the service, and publishes the CLI.

**Which Baesian a repo's CI runs** once it's on npm is **card B-c0e0d**. This repo's own CI keeps running its own build (`node dist/bin.js`).

## Publishing the plugin

**The marketplace is this repo** (D114, D118): `.claude-plugin/marketplace.json` names the marketplace `baesian`, with one plugin, `baesian`, at `./plugins/baesian`. From GitHub:
- **Claude Code:** `/plugin marketplace add GusEllerm/baesian`, then `/plugin install baesian@baesian`. In a shell, or for the VS Code extension: `claude plugin marketplace add GusEllerm/baesian`, then `claude plugin install baesian@baesian`. Updating: `claude plugin update baesian@baesian`. Auto-update is off by default for a marketplace like this one.
- **Codex:** `codex plugin marketplace add GusEllerm/baesian`, then `codex plugin add baesian@baesian`. Codex takes GitHub's `owner/repo` form, and finds `.claude-plugin/marketplace.json` and the plugin's `.claude-plugin/plugin.json` in its search order (Codex's source, through Context7). Running `codex plugin add` again after a version change installs the new version. Codex asks for its hooks to be trusted again after every update.
- **Either way,** a marketplace added from GitHub follows the default branch, main, which moves only at a release.

**Versioning,** from finding 8: each release commit sets the plugin manifest's version to the release's, and the deploy checks it beside package.json's.

**How the plugin finds the CLI.** Today the hooks run `baesian` from PATH (`baesian()` in the hooks' `baesian.mjs`) and say nothing when it's missing; the MCP server runs `baesian mcp`. **Card B-pw9ak**, which builds on B-n15wk, asks whether that stays, checked against the plugin's own version, or the plugin runs its own release through npx. Between a release's merge to main and its publish on npm, the plugin on main is a release ahead of the CLI, so the check matters either way.

**Not proposed here:** listing the plugin in Anthropic's plugin directory, which would be a card of its own if wanted.

## What v1 means

Three cards, the user's to answer:
- **B-h0vyy** (hard): the first release on npm is 1.0.0, ending D108, or a 0.x that keeps formats free until a later 1.0.
- **B-4kj4d:** what each later 1.x keeps working. Either the files and the relay's protocol only, or also the commands, flags, exit codes and MCP tools that AGENTS.md and the plugin tell agents to use.
- **B-4p43b:** whether a release that changes a format writes it at once, or keeps writing the old one for a release (finding 2).

**Once v1 is published, D108 is over.** A format change is then a new number with an upgrade in `upgradeFile()`'s table, and the relay's storage changes as B-866d2 decides. The "before v1, changes freely (D108)" lines in [[File Formats]] become history. The user's note to agents, "don't design for Baesian version skew until a v1 is published", stops applying; the lead updates it, with Home's status.

## The docs

Once the cards are answered, following B-3fgyc (the README is a front page) and B-k3451 (the hosted client first).

**The README:**
- **Set it up, step 1:** the install from B-n15wk, with Node 22 or later.
- **The note "not released yet"** gives way to the release's number and what it promises (B-h0vyy, B-4kj4d).
- **The plugin step** adds the marketplace as `GusEllerm/baesian`, not `/path/to/baesian`, in Claude Code, the VS Code extension and Codex.
- **Try the demo stays a clone,** since `scripts/demo.ts` isn't in the package. **Building from source** moves to Development.

**`docs/setup.md`:**
- **Step 1** installs from npm, with building from source as a side path for contributors.
- **Step 4** uses GitHub's form and says how to update.
- **Step 5** shows the steps `baesian ci` prints (B-c0e0d).
- **New, Updating:** the CLI and the plugin together; `baesian init` again when a release changes the hook blocks; in Codex, trusting the hooks again.
- **New, Compatibility:** what a release keeps working, and what happens to an older Baesian meeting a newer file (B-4kj4d, B-4p43b).
- **New, what a linked public repo publishes:** the cards' text (B-vqn69), and the handle, account ID and passkey keys beside it (finding 9).

**Beside them:**
- **A SECURITY.md** (B-480t1).
- **Release notes for each version** (B-yj9wc).
- **npm's page shows the README.** *Unverified:* how npm renders its relative image paths and `<picture>` elements; check the package page after the first publish, and use absolute URLs if they break.
- **In the vault:** File Formats' status line, the M10 row in [[Implementation Plan]], and Home.

## The steps, in order

| # | Step | Waits on | Who |
|---|---|---|---|
| 1 | Answer the deck `release-v1` | — | the user |
| 2 | A test that reads every release tag's record with v1's schemas (finding 1) | nothing | a builder, now |
| 3 | The relay's tables: a version in each project's meta, with migrations, or the rule that tables only grow | B-866d2 | a builder (service) |
| 4 | The CLI's version on every relay request, the relay's answer to one too old, and the format rollout rule in `upgradeFile()`'s writers | B-4p43b | a builder (CLI and service) |
| 5 | Hook blocks from earlier releases recognised, or left as they are | B-np6af | a builder (gate) |
| 6 | A spare service key: the user makes it and keeps it offline; the service publishes its public half; `baesian ci` prints both | B-x47ek | the user, then a builder |
| 7 | package.json, the plugin's version, and the publishing job in the deploy workflow | B-emtd9, B-xr2fa | a builder; then the user on npmjs.com |
| 8 | The plugin's check of the CLI's version, or its npx command | B-pw9ak (after B-n15wk) | a builder (plugin) |
| 9 | What `baesian ci` prints | B-c0e0d (after B-4p43b) | a builder (CLI) |
| 10 | The README, the setup guide, SECURITY.md, release notes | B-n15wk, B-h0vyy, B-4kj4d, B-480t1, B-yj9wc | a builder; the user turns on GitHub's private reporting or the address |
| 11 | The release: merge v1/next into main, set the three versions, tag on main | every card above | the user |
| 12 | After it: provenance on npm's page; a clean install on a fresh machine; the plugin from GitHub in Claude Code and in Codex; `baesian verify` in a fresh repo's CI; the vault and the user's note on D108 | the release | the lead |

Steps 2 to 9 are independent of each other and can run in parallel once their cards are answered. Step 10 waits for the steps whose behaviour it describes.

## What builders do once the cards are answered

- **The relay (steps 3, 4):**
  - with migrations: a schema version row in each project's meta, numbered migrations run in one transaction when an object wakes, a test that wakes an object made by the release before;
  - only ever adding: a test that fails on any statement that alters or drops.
  - Then a version header from the CLI on every request; the relay refuses a CLI below its minimum with a message naming the release to install. Then the writers follow B-4p43b: with a release of overlap, each kind keeps a writer for its previous format for one release.
- **The gate (step 5):**
  - a released block: the digest of every hook block each release wrote, kept in the code beside `onlyBaesianBlock()`, which accepts any of them, in the commit gate and `baesian verify`, with tests for an older and a newer block;
  - otherwise nothing changes.
- **Trust (step 6):** the service publishes the spare's public key beside its own, as a key file it never signs with; `baesian ci` prints both lines; a test signs with the spare and verifies.
- **The package (step 7):**
  - package.json as above; the plugin's version;
  - a check in the deploy that the tag, package.json, `service/package.json` and the plugin's manifest all agree;
  - the publishing job (or staging job) after the deploy;
  - `claude plugin validate` on the plugin.
- **The plugin (step 8):**
  - checked: at `SessionStart`, the hook compares `baesian --version` with its manifest's version, and tells the agent once when they differ or the CLI is missing, naming the install command;
  - npx: the hooks and `.mcp.json` run `npx --yes baesian@<version>`, with the version written by the release commit.
- **`baesian ci` (step 9):** `workflowBody()` prints the pinned or the unpinned step.
- **The docs (step 10):** as [[#The docs]] says, and the vault after.

None of these needs a card of its own, beyond the one it builds on. A builder who finds a new choice the [[Working Agreement]] gives the user files it in deck `release-v1`.

## Decisions in deck release-v1

| Card | Topic | Question | Level | Builds on |
|---|---|---|---|---|
| B-emtd9 | release/npm/name | Under what name is Baesian's command line published on npm? | hard | |
| B-n15wk | release/install/cli | Once it's on npm, do the README and setup guide install Baesian's command line globally, or run it through npx with nothing installed? | blocking | |
| B-pw9ak | release/plugin/cli | Do the plugin's hooks and MCP server run the `baesian` on PATH, or the release the plugin came with, through npx? | blocking | B-n15wk |
| B-xr2fa | release/npm/publishing | When you tag a release on main, does CI publish the command line to npm by itself, or stage it there for you to approve? | hard | |
| B-h0vyy | release/v1/number | Is the first release on npm 1.0.0, ending D108's freedom to change formats in place, or a 0.x that keeps it until a later 1.0? | hard | |
| B-4kj4d | release/v1/promise | From 1.0, what does each later 1.x keep working: only Baesian's files and the relay's protocol, or also the commands agents are told to run? | provisional | |
| B-4p43b | release/v1/format-rollout | After 1.0, does a release that changes a format write the new one at once, or keep writing the old one for a release so older Baesians keep working? | blocking | |
| B-c0e0d | release/ci/version | Do the CI steps `baesian ci` prints run the latest Baesian release each time, or the release that printed them, pinned in the repo? | hard | B-4p43b |
| B-np6af | release/init-hook-acks/other-versions | Does the gate count a hook block that another released Baesian wrote as Baesian's own, or only the block this version writes? | hard | (B-g6ywj, decided) |
| B-866d2 | release/relay/object-migrations | After 1.0, how do the tables in each project's relay storage change: by numbered migrations run as a project wakes, or only ever by adding? | provisional | |
| B-x47ek | release/trust/spare-key | Should hosted repos' CI pin a second, unused service signing key now, so replacing the service's key doesn't break their CI? | hard | |
| B-480t1 | release/docs/security-contact | Where do people report a security problem in Baesian or baesian.dev: GitHub's private reporting, or an email address? | hard | |
| B-yj9wc | release/docs/release-notes | Where do people read what changed in each release: GitHub Releases made from the tag, or a CHANGELOG.md in the repo? | hard | |

## Not verified

- Whether the npm organisation name `baesian` is free: that needs a login.
- Whether npm lets a trusted publisher be set up before the package's first version exists.
- How npmjs.com renders the README's relative images and `<picture>` elements.
- Whether `npx --yes baesian@<version>` runs offline from its cache once fetched. This matters only if B-n15wk or B-pw9ak goes to npx.
- The Codex command that refreshes a marketplace added from GitHub; `codex plugin add` again after a version change is in Codex's own help.
- The tarball's figures come from a `dist/` built on 2026-11-05; a fresh build will differ a little.
