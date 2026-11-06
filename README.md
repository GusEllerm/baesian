# Baesian

Swipe review for agent decisions.

![The Baesian client answering two agents building a made-up bakery's shop: you choose between two options before the agent's pick is shown, hold to confirm, then overrule codex on how prices are stored, while each agent's terminal hears your answer. It ends on the Branches drawer, where both branches' merges are held by cards still waiting.](docs/media/demo.gif)

Coding agents make design decisions all day, and most of them are the agent's to make. Some aren't: where a
signed-in user's session lives, how prices are stored, what deleting an account removes. Baesian has the agent
put those to you as cards. You choose between its two options before you see which one it picked, then read its
case and confirm, at your desk or on your phone. Your answer goes back to the agent, and it's committed to git
beside the code it decides.

## Try the demo

You need Node 22 or later, and git.

```sh
git clone https://github.com/GusEllerm/baesian.git
cd baesian
npm install
npm run demo
```

The demo makes a throwaway repo for Crumb, a made-up bakery's online shop, where two agents are at work on two
branches and have filed five decisions. It opens the client in your browser, and the terminal shows what each
agent hears as you answer. Press Enter for a stopping point, where the agents check for answers to the cards they
didn't wait on. Ctrl-C stops it, and leaves the repo where it says.

## How it works

- **An agent files a card** when a decision is hard to undo or isn't its call alone: it changes a schema or an
  on-disk format, a public API, CI or deployment; adds a dependency; touches security or privacy; is user-facing;
  or deletes data. `baesian init` writes these instructions into the repo's `AGENTS.md`. A card states the
  question, two real options and what each one leads to, and the one question the choice turns on.
- **You choose before you see the agent's pick.** The client shows the question, what it turns on, and the two
  options. Once you've chosen, it reveals which option the agent picked and why, and you confirm or switch. A
  decision that touches security, data loss, money or publishing takes a hold to confirm. On a phone, you hold a
  card until it lifts, then drag it toward an answer.
- **The agent waits as long as the decision needs.** On a *provisional* card it carries on with its pick, and hears
  your answer at its next stopping point. On a *blocking* card it waits for you, for a while. On a *hard* card,
  the default for security, data loss, money and publishing, it never goes ahead without you.
- **Your answer goes back to the agent,** through `baesian wait` and `baesian inbox`, and the Claude Code plugin
  brings late answers into the session when it reaches a stopping point. When you overrule an agent, it may
  reply once, with a fact you lacked or a check that would settle it.
- **A choice asked in chat becomes a card too.** An agent that puts a choice to you in chat, at the end of its turn
  or with its question tool, is sent back to file it as a card. If you'd already answered it in the conversation,
  the card arrives marked as seen, with what you said, for you to confirm with one tap.
- **A commit gate catches the decisions nobody filed.** A commit that adds a dependency, changes a schema or a
  migration, or changes CI and deploy files is blocked until a card covers it, or the agent acknowledges it as
  easy to undo, with a reason. An answer can become a rule, and a rule acknowledges matching changes for you.

<img src="docs/media/phone.png" alt="A decision card on a phone, held until it lifts: its four answers are named at the screen's edges, an option to drag to on each side, Other answer above and Can't judge below" width="320">

## Decisions branch with the code

![The Branches drawer on an evening of Baesian's own history: v1/next merges into main twice, four worktrees start from v1/next (dashed) and merge back with the cards and commits they brought, and one card is opened to list the three commits that cite it](docs/media/branches.png)

Each branch has its own deck of cards, and the record of them, in `.baesian/`, is committed with the branch. So
the decisions merge with the code they decided, and a branch's history says what was decided along the way.
Your answers reach every worktree at once, though: they live in the repo's shared git directory, so an agent
on another branch doesn't wait for a merge to hear them. In CI, `baesian verify --merge` holds a merge until
every card on the branch is answered or deferred. It also holds a branch that answered a question differently
from the branch it merges into, until a card settles which answer stands; `--file-conflicts` files that card for
you.

**Your decisions, by branch** (press B in the client) draws the project's history as it happened: where each branch
began, the cards filed on it, the commits that cite them, and every merge with what it brought. The figure is
Baesian's own, on the evening of 5 November. Baesian records a merge from whichever git event shows it, whether a merge, a fast-forward, a rebase
or a push to the default branch, and reads the ones made before it was installed from git's history when the repo is
first linked.

## Every commit is a checkpoint

![Four commits on feat/checkout, each carrying the decisions as they stood. Later the answer on the session card changes, and the agent is told which commits built on the old answer.](docs/media/checkpoints.png)

Every commit carries the decisions as they stood when it was made, and names the cards it builds on with a
`Baesian-Card:` trailer. `baesian verify` checks each commit in CI against its own record. If you change an
answer later, the agent is told which commits built on the old one, so it knows what to rework. Only commits
that cite the card are listed, so it's told to look for other work built on it as well.

## Set it up

Baesian isn't published yet: the CLI and the plugin install from this repo, and you answer cards at
https://baesian.dev.

**1. Install the CLI.**

```sh
git clone https://github.com/GusEllerm/baesian.git
cd baesian
npm install && npm run build && npm link   # puts `baesian` on your PATH
```

**2. Make an account** at https://baesian.dev, with your email or Globus, and make a passkey. It signs you in, and
confirms your answers on hard cards; add one on each device you answer from, your phone included. The site can
notify you when an agent stops for you.

**3. Set up your repo.**

```sh
cd your-repo
baesian init          # the commit gate, the record in .baesian/, and the instructions in AGENTS.md
baesian login         # links the repo to baesian.dev and signs this machine in: approve it on the page it prints,
                      # then run the `git add … && git commit …` it prints, which commits the link
baesian ci --github   # sets CI's BAESIAN_TRUST variable, once you've checked its passkey lines on your account page
```

Then add the workflow steps `baesian ci` prints, so CI checks each commit's decisions and holds a merge until its
cards are answered. `baesian login --service <url>` links to a service of your own instead.

**4. Install the plugin,** which teaches your agents to write cards and brings your answers into their sessions. In
Claude Code:

```text
/plugin marketplace add /path/to/baesian
/plugin install baesian@baesian
```

In the VS Code extension, where `/plugin` isn't available, run the same in a terminal as
`claude plugin marketplace add /path/to/baesian` and `claude plugin install baesian@baesian`, then start a new
conversation. Codex installs it with `codex plugin marketplace add /path/to/baesian` and then
`codex plugin add baesian@baesian`. Codex runs a plugin's hooks only once you've trusted them: start Codex's
interactive mode once and accept its "Hooks need review" prompt, and do it again after any update; `codex exec`
skips untrusted hooks without a warning. In Codex, type `$baes` to pick the skill.

The plugin also checks as the agent acts: a choice put to you in chat is sent back to be a card, and an agent about to
edit a path the repo lists as `user_facing` in `.baesian/config.json` is reminded that a decision there is a card.

**Without an account,** `baesian init` and then `baesian serve` give you the client on 127.0.0.1, and nothing leaves
your machine: no phone, no notifications, and CI can't check who answered. `baesian login` links the repo later, and
takes the answers you've given so far with it.

**In a repo you share with people who don't use Baesian,** `baesian init --personal` sets it up for your clone alone,
and commits nothing: your cards, answers and config stay in `.git/baesian/`, the repo's hooks and `AGENTS.md` are left
as they are, and your clone's own hooks run Baesian's gate before the repo's. The gate still checks your commits, and
takes its `Baesian-Card` and `Baesian-Ack` trailers out of the message once it has, so the shared history never shows
them. Your agents hear about Baesian from the plugin, which you need here. `baesian login` links your clone the same
way, but CI can't check decisions that aren't committed. The repo's setup script can still set `core.hooksPath`: the
gate stays on, since your clone's `.git/config` includes Baesian's setting last. If something turns the gate off,
`baesian` says so: run `baesian init --personal` again. Once the team wants the record, `baesian init --shared` writes
it into the repo, with the hooks' block and `AGENTS.md`, for you to commit.

## What agents see

Agents use the CLI, or the same commands as tools through the plugin's MCP server: `baesian template` prints a card to
fill in, `baesian file` files it, and `baesian wait` and `baesian inbox` bring the answers back. `baesian --help`
lists the rest. Each command says what happened first, and ends with the next command to run, IDs filled in:

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

## Status

Baesian is in development, and not released. Version 0.1.8 runs at https://baesian.dev, and Baesian's own design
decisions go through it. The CLI, the commit gate, the CI check, the hosted and local clients, the phone layout, the
Claude Code and Codex plugin with its MCP server, and a note for each decision in the repo's Obsidian vault all work.
Still to come for v1: a licence, publishing the CLI to npm and the plugin to a marketplace, and a review before
release. Until v1 is published, the file formats may change between versions without migrations.

## Development

```sh
npm test               # unit tests
npm run e2e            # browser tests, with Playwright
npm run typecheck
npm run readme-media   # remakes this README's GIF and figures (needs ffmpeg)
```

The project's memory is the Obsidian vault in [`docs/vault/`](docs/vault/Home.md): the design, the decision log,
and a log of each working session. Start at `Home.md`.

## Why "Baesian"

It's a dating app for decisions. Your agents line up their options, you swipe on the one you'd pick before you see
which one they picked, and over time you build up preferences for each kind of decision. The decisions you keep
agreeing on become rules, so your agents can make them for you from then on.
