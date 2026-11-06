# Baesian

Swipe review for agent decisions.

![An agent's decision card in the Baesian client: you choose between two options, the agent's pick and reasoning are revealed, and the agent's terminal receives your answer](docs/media/demo.gif)

Coding agents make design decisions all day, and most of them are the agent's to make. Some aren't: where a
signed-in user's session lives, how prices are stored, what deleting an account removes. Baesian has the agent
put those to you as cards. You choose between its two options before you see which one it picked, then read its
case and confirm. Your answer goes back to the agent, and it's committed to git beside the code it decides.

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
  decision that touches security, data loss, money or publishing takes a hold to confirm.
- **The agent waits as long as the decision needs.** On a *provisional* card it carries on with its pick, and hears
  your answer at its next stopping point. On a *blocking* card it waits for you, for a while. On a *hard* card,
  the default for security, data loss, money and publishing, it never goes ahead without you.
- **Your answer goes back to the agent,** through `baesian wait` and `baesian inbox`, and the Claude Code plugin
  brings late answers into the session when it reaches a stopping point. When you overrule an agent, it may
  reply once, with a fact you lacked or a check that would settle it.
- **A commit gate catches the decisions nobody filed.** A commit that adds a dependency, changes a schema or a
  migration, or changes CI and deploy files is blocked until a card covers it, or the agent acknowledges it as
  easy to undo, with a reason. An answer can become a rule, and a rule acknowledges matching changes for you.

## Decisions branch with the code

![Two branches off main. On feat/checkout, claude-code's two cards are answered, and the commits that build on them cite them; the branch merges. On feat/catalog, codex has stopped on a card that's still waiting, so its merge is held.](docs/media/branches.png)

Each branch has its own deck of cards, and the record of them, in `.baesian/`, is committed with the branch. So
the decisions merge with the code they decided, and a branch's history says what was decided along the way.
Your answers reach every worktree at once, though: they live in the repo's shared git directory, so an agent
on another branch doesn't wait for a merge to hear them. In CI, `baesian verify --merge` holds a merge until
every card on the branch is answered or deferred. It also holds a branch that answered a question differently
from the branch it merges into, until a card settles which answer stands; `--file-conflicts` files that card for
you.

## Every commit is a checkpoint

![Four commits on feat/checkout, each carrying the decisions as they stood. Later the answer on the session card changes, and the agent is told which commits built on the old answer.](docs/media/checkpoints.png)

Every commit carries the decisions as they stood when it was made, and names the cards it builds on with a
`Baesian-Card:` trailer. `baesian verify` checks each commit in CI against its own record. If you change an
answer later, the agent is told which commits built on the old one, so it knows what to rework. Only commits
that cite the card are listed, so it's told to look for other work built on it as well.

## Use it in a repo

Baesian isn't published yet, so install it from this checkout:

```sh
npm run build && npm link   # puts `baesian` on your PATH
cd your-repo
baesian init                # the git gate, the record, and the instructions in AGENTS.md
baesian serve               # opens the client
```

Agents use the CLI: `baesian template` prints a card to fill in, `baesian file` files it, and `baesian wait` and
`baesian inbox` bring the answers back. `baesian --help` lists the rest. Each command says what happened first, and
ends with the next command to run, IDs filled in:

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

To answer cards on the hosted service, https://baesian.dev, from a laptop or a phone, link the repo to it:

```sh
baesian login   # links the repo to baesian.dev and signs this machine in: approve it on the page it prints
                # then run the `git add … && git commit …` it prints, which commits the link
baesian ci      # prints the lines for CI's BAESIAN_TRUST variable and the workflow steps to paste
```

Set the repository variable `BAESIAN_TRUST` to the lines `baesian ci` prints (or run `baesian ci --github`), after
checking its passkey lines against your account page, then add its steps to your workflow. `baesian login --service
<url>` links to a service of your own instead.

For Claude Code, install the plugin, which teaches the agent to write cards and brings your answers into its
sessions. It also checks as the agent acts: an agent that puts a choice to you in chat, at the end of its turn or with
its question tool, is asked to file it as a card instead, and one about to edit a path the repo lists as
`user_facing` in `.baesian/config.json` is reminded that a decision there is a card:

```text
/plugin marketplace add /path/to/baesian
/plugin install baesian@baesian
```

Codex installs the same plugin, with `codex plugin marketplace add /path/to/baesian` and then
`codex plugin add baesian@baesian`. Codex runs a plugin's hooks only once you've trusted them: start Codex's
interactive mode once and accept its "Hooks need review" prompt. `codex exec` skips untrusted hooks without a
warning, and any update to the plugin needs trusting again. In Codex, type `$baes` to pick the skill.

**In a repo you share with people who don't use Baesian,** `baesian init --personal` sets it up for your clone alone,
and commits nothing: your cards, answers and config stay in `.git/baesian/`, the repo's hooks and `AGENTS.md` are left
as they are, and your clone's own hooks run Baesian's gate before the repo's. The gate still checks your commits, and
takes its `Baesian-Card` and `Baesian-Ack` trailers out of the message once it has, so the shared history never shows
them. Your agents hear about Baesian from the plugin, which you need here. `baesian login` links your clone the same
way, but CI can't check decisions that aren't committed. The repo's setup script can still set `core.hooksPath`: the
gate stays on, since your clone's `.git/config` includes Baesian's setting last, and the repo's hooks run from the folder
the script names. If something turns the gate off, `baesian` says so: run `baesian init --personal` again, which also
moves a clone set up by an older Baesian to the included setting. Once the team wants the record, `baesian init
--shared` writes it into the repo, with the hooks' block and `AGENTS.md`, for you to commit.

## Status

Baesian is in development, and not released. The CLI, the commit gate, the CI check, the client and the Claude
Code plugin work, and Baesian's own design decisions go through it. The plugin's hooks are tested in real
Claude Code and Codex sessions. Still to come: notes in an Obsidian vault for each decision, and an MCP
server. Until v1 is published, the file formats may change between versions without migrations.

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
