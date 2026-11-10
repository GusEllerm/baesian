# Setting up Baesian

The [README](../README.md#set-it-up) has the short version. This guide has the rest: each step in full, CI, updating,
what each release keeps working, what a public repo shows, using Baesian without an account or in a repo you share, and
what your agents see.

You need Node 22 or later, git, and Claude Code or Codex. Any agent that reads `AGENTS.md` can file cards with the CLI;
the plugin adds the skill and the checks.

## 1. Install the CLI

```sh
npm install -g baesian
baesian --version    # check it's on your PATH
```

Install it once, globally. The git hooks `baesian init` writes, the plugin and your agents all run the `baesian` on
your PATH, outside any one project. With nvm or another Node version manager, a global install belongs to one Node
version: install it again after you switch.

**If you built Baesian 0.1.x from a clone,** the hosted service now refuses it, with a message to install 1.0.0.
Replace the copy `npm link` made with npm's:

```sh
npm uninstall -g baesian
npm install -g baesian
```

Then follow the rest of [1.0.0's notes](https://github.com/GusEllerm/baesian/releases/tag/v1.0.0): the plugin from
GitHub in place of your clone's, Codex's hooks trusted again, and `baesian ci` and `baesian init` run again in each
repo.

To work on Baesian from a clone instead, see the README's [Development](../README.md#development) section.

## 2. Make an account

Sign up at https://baesian.dev with your email or a [Globus](https://www.globus.org) identity, and make a passkey. The
passkey signs you in, and confirms your answers on hard cards: add one on each device you answer from, your phone
included. The site can notify you when an agent stops for you. What the service keeps, and for how long, is on
https://baesian.dev/privacy.

## 3. Set up your repo

```sh
cd your-repo
baesian init
baesian login
```

`baesian init` sets up the commit gate, the record of decisions in `.baesian/`, and the instructions in `AGENTS.md`
that tell your agents when to file a card. `baesian login` links the repo to baesian.dev and signs this machine in:
approve the machine on the page it prints, then run the `git add … && git commit …` it prints, which commits the link.
Linking also reads the repo's history for merges made before Baesian was installed. `baesian login --service <url>`
links to a service of your own instead. In a public repo, the record of decisions is public too: see
[What a public repo shows](#what-a-public-repo-shows).

## 4. Install the plugin

The plugin teaches your agents to write cards, brings your answers into their sessions, and checks as they act: an
agent that puts a choice to you in chat, at the end of its turn or with its question tool, is sent back to file it as
a card, and one about to edit a path the repo lists as `user_facing` in `.baesian/config.json` is reminded that a
decision there is a card.

The plugin comes from this repo on GitHub, which is its own plugin marketplace, named `baesian`.

**Claude Code**, in the terminal:

```text
/plugin marketplace add GusEllerm/baesian
/plugin install baesian@baesian
```

**Claude Code in VS Code:** run the same from a terminal, then start a new conversation. (The extension's own
**Manage plugins** dialog, which `/plugins` opens, can add the marketplace and install the plugin too.)

```sh
claude plugin marketplace add GusEllerm/baesian
claude plugin install baesian@baesian
```

**Codex:**

```sh
codex plugin marketplace add GusEllerm/baesian
codex plugin add baesian@baesian
```

Codex runs a plugin's hooks only once you've trusted them: start Codex's interactive mode once and accept its "Hooks
need review" prompt, and again after any update. `codex exec` skips untrusted hooks without a warning. In Codex, type
`$baes` to pick the skill.

The marketplace follows this repo's main branch, which moves only when a release is made, so the plugin you get is the
latest release's. Install the CLI at the same release: the plugin runs the `baesian` on your PATH, and when that's
another release, or there's none, it tells your agent to ask you to install or update. [Updating](#updating) says how.

## 5. Check decisions in CI

```sh
baesian ci --github
```

This sets the repository variable `BAESIAN_TRUST` to the lines CI trusts: the project's, the service's key, a spare key
the service keeps offline and never signs with, and your passkeys'. With the spare pinned, if the service ever has to
replace its key, it switches to the spare and your CI keeps passing. Check the passkey lines against your account page
first. Without `--github`, `baesian ci` prints the lines for you to set the variable by hand.

Then add the workflow steps it prints, in a workflow that runs on pushes to your main branch and on pull requests. With
Baesian 1.0.0, a whole workflow, in `.github/workflows/baesian.yml`, looks like this:

```yaml
name: baesian

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      # Keep agents' commits from editing it, with a ruleset or code owners on .github/: it passes the pin to verify.
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0 # verify needs the base, every commit since it, and the commit that linked the repo
      - uses: actions/setup-node@v7
        with:
          node-version: 22
      # Baesian 1.0.0 from npm, pinned: the release that printed these steps. To move CI to another, run `baesian ci` with it, and commit the steps it prints.
      - name: baesian verify (pushed commits)
        if: github.event_name == 'push' && github.event.before != '0000000000000000000000000000000000000000'
        run: npx --yes baesian@1.0.0 verify --base "${{ github.event.before }}"
        env:
          BAESIAN_TRUST: ${{ vars.BAESIAN_TRUST }}
      - name: baesian verify --merge (pull request)
        if: github.event_name == 'pull_request'
        run: npx --yes baesian@1.0.0 verify --merge
        env:
          BAESIAN_TRUST: ${{ vars.BAESIAN_TRUST }}
```

The steps run the release of Baesian that printed them, so a new release changes your CI only in a commit: to move CI
to it, run `baesian ci` with it and commit the steps it prints.

In CI, `baesian verify` checks each commit against its own record of decisions, and `baesian verify --merge` holds a
merge until every card on the branch is answered or deferred. It also holds a branch that answered a question
differently from the branch it merges into, until a card settles which answer stands; `--file-conflicts` files that
card for you.

## Updating

Update the CLI and the plugin together, to the same release. First the CLI:

```sh
npm install -g baesian
```

Then the plugin. In Claude Code, from a terminal, then start a new conversation:

```sh
claude plugin update baesian@baesian
```

In Codex, then start Codex's interactive mode and accept its "Hooks need review" prompt, which comes after every update:

```sh
codex plugin marketplace upgrade baesian
codex plugin add baesian@baesian
```

Each release's notes, on [GitHub Releases](https://github.com/GusEllerm/baesian/releases), say what else to run again.
A release may ask for:

- **`baesian init` in each repo,** when it changes the instructions `init` writes in `AGENTS.md`, or its blocks in your
  git hooks. Commit what it changes. A release that changes a hook block goes on writing the old one, and the release
  after it writes the new one, so teammates and CI a release behind still recognise the block.
- **`baesian ci` in each linked repo,** to move CI to the new release. Commit the steps it prints; until then, CI stays
  on the release its steps name.

## Compatibility

From 1.0, every later 1.x release keeps working with what an earlier 1.x wrote, or told your agents:

- **Files:** it reads every file an earlier 1.x wrote, in `.baesian/`, in `.git/baesian/` and on your machine, and
  every commit trailer. Each file names its format. A format that changes gets a new number, and later releases
  upgrade the older one as they read it.
- **The hosted service's protocol,** at `/v1/`.
- **What your agents are told to use:** the commands, flags, exit codes and MCP tools that `AGENTS.md` and the plugin
  name. Other output, such as a message's wording, may change.

The other way round, a Baesian can't read a format newer than it knows: it stops and names the file, rather than guess.
So a release that changes a format reads the new one but goes on writing the old one, and only the release after it
writes the new one. A teammate, a machine or CI one release behind never meets a file it can't read, and the hook
blocks `baesian init` writes change the same way. Further behind, the hosted service refuses your CLI's requests before
anything is sent or received, naming the release to install, and whatever works without the service keeps working.

Releases before 1.0, 0.1.0 to 0.1.10, changed formats in place. 1.0 reads every file they wrote, but the hosted service
refuses a 0.1.x CLI: install the latest 1.x.

## What a public repo shows

The record of decisions in `.baesian/` is committed with your code, so in a public repo anyone can read it: each card
in full, with its options, the agent's case and its background; each answer, with your comments; and the rules you
accepted. Git keeps every version that's pushed, so pushed text can't be taken back. Agents are told the record is
committed and not to paste secrets into a card, and `baesian file` warns when a card looks like it holds one.

Linking the repo to baesian.dev adds, beside them:

- your handle and account ID on each answer, with the project's ID;
- each passkey's public key and credential ID, in `.baesian/trust/`, which CI checks answers on hard cards against;
- the model each card's agent ran on.

None of these is a secret: a passkey's public key checks your signatures, and can't make one. What the service itself
keeps is on [its privacy page](https://baesian.dev/privacy). To keep Baesian out of a repo's history altogether, use
[personal mode](#in-a-repo-you-share-with-people-who-dont-use-baesian), which commits nothing.

## Without an account

`baesian init` and then `baesian serve` give you the client on 127.0.0.1, and nothing leaves your machine. There's no
phone, no notifications, and CI can't check who answered. `baesian login` links the repo later, and takes the answers
you've given so far with it.

## In a repo you share with people who don't use Baesian

`baesian init --personal` sets Baesian up for your clone alone, and commits nothing. Your cards, answers and config
stay in `.git/baesian/`; the repo's hooks and `AGENTS.md` are left as they are, and your clone's own hooks run
Baesian's gate before the repo's. The gate still checks your commits, and takes its `Baesian-Card` and `Baesian-Ack`
lines out of the commit message once it has, so the shared history never shows them. Your agents hear about Baesian
from the plugin, which you need here. `baesian login` links your clone the same way, but CI can't check decisions that
aren't committed.

The repo's setup script can still set `core.hooksPath`: the gate stays on, since your clone's `.git/config` includes
Baesian's setting last, and the repo's hooks run from the folder the script names. If something turns the gate off,
`baesian` says so: run `baesian init --personal` again, which also moves a clone set up by an older Baesian to the
included setting. Once the team wants the record, `baesian init --shared` writes it into the repo, with the hooks'
block and `AGENTS.md`, for you to commit.

## How merges are recorded

Each branch has its own deck of cards, and the record of them in `.baesian/` is committed with the branch, so
decisions merge with the code they shaped. Your answers reach every worktree at once, though: they live in the repo's
shared git directory, so an agent on another branch doesn't wait for a merge to hear them.

Baesian records a merge from whichever git event shows it: a merge, a fast-forward, a rebase, or a push to the default
branch. The ones made before it was installed are read from git's history when the repo is first linked, or with
`baesian sync --history`. The client's **Your decisions, by branch** (press B) draws them.

## What agents see

Agents use the CLI, or the same commands as tools through the plugin's MCP server: `baesian template` prints a card to
fill in, `baesian file` files it, and `baesian wait` and `baesian inbox` bring the answers back. `baesian --help` lists
the rest. Each command says what happened first, and ends with the next command to run, IDs filled in:

```text
filed B-ym5s9 "How prices are stored"
  level:  blocking, the level you asked for
  deck:   branch-main
next: baesian wait B-ym5s9  # before building on it
  Commits that build on it carry the trailer  Baesian-Card: B-ym5s9
```

That's what an agent reads, and what a pipe gets. At a terminal the same words come with colour and a symbol on each
headline (✓ ✗ ! →), wrapped at its width; never when an agent's harness runs the command, and never under `NO_COLOR`.
`--no-color` shows you what the agent reads, and `--verbose` adds which of Baesian's own design decisions a message
rests on.
