# Setting up Baesian

The [README](../README.md#set-it-up) has the short version. This guide has the rest: each step in full, CI, using
Baesian without an account or in a repo you share, and what your agents see.

You need Node 22 or later, git, and Claude Code or Codex. Any agent that reads `AGENTS.md` can file cards with the CLI;
the plugin adds the skill and the checks.

## 1. Install the CLI

Baesian isn't on npm yet, so build it from this repo and link it onto your PATH:

```sh
git clone https://github.com/GusEllerm/baesian.git
cd baesian
npm install
npm run build && npm link
baesian --help    # check it's on your PATH
```

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
links to a service of your own instead.

## 4. Install the plugin

The plugin teaches your agents to write cards, brings your answers into their sessions, and checks as they act: an
agent that puts a choice to you in chat, at the end of its turn or with its question tool, is sent back to file it as
a card, and one about to edit a path the repo lists as `user_facing` in `.baesian/config.json` is reminded that a
decision there is a card.

**Claude Code**, in the terminal:

```text
/plugin marketplace add /path/to/baesian
/plugin install baesian@baesian
```

**Claude Code in VS Code**, where `/plugin` isn't available: run the same from a terminal, then start a new
conversation.

```sh
claude plugin marketplace add /path/to/baesian
claude plugin install baesian@baesian
```

**Codex:**

```sh
codex plugin marketplace add /path/to/baesian
codex plugin add baesian@baesian
```

Codex runs a plugin's hooks only once you've trusted them: start Codex's interactive mode once and accept its "Hooks
need review" prompt, and again after any update. `codex exec` skips untrusted hooks without a warning. In Codex, type
`$baes` to pick the skill.

## 5. Check decisions in CI

```sh
baesian ci --github
```

This sets the repository variable `BAESIAN_TRUST`: the keys CI trusts, which are the service's, your passkeys' and the
project's. Check its passkey lines against your account page first. Then add the workflow steps `baesian ci` prints.
In CI, `baesian verify` checks each commit against its own record of decisions, and `baesian verify --merge` holds a
merge until every card on the branch is answered or deferred. It also holds a branch that answered a question
differently from the branch it merges into, until a card settles which answer stands; `--file-conflicts` files that
card for you.

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
