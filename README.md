<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/GusEllerm/baesian/main/docs/media/wordmark-dark.png">
    <img src="https://raw.githubusercontent.com/GusEllerm/baesian/main/docs/media/wordmark.png" alt="Baesian" width="280">
  </picture>
</p>

<p align="center"><b>Swipe review for the decisions your coding agents shouldn't make alone.</b><br>
They put each one to you as a card, and you choose before you see their pick.</p>

<p align="center">
  <a href="https://baesian.dev">baesian.dev</a> ·
  <a href="#try-the-demo">Try the demo</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#set-it-up">Set it up</a> ·
  <a href="https://github.com/GusEllerm/baesian/blob/main/docs/setup.md">Setup guide</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/GusEllerm/baesian/main/docs/media/demo.gif" width="74%" alt="Answering two agents' decision cards in Baesian: choose first, then see the agent's pick, while each agent's terminal gets the answer">
  <img src="https://raw.githubusercontent.com/GusEllerm/baesian/main/docs/media/phone.png" width="22%" alt="A Baesian card held on a phone until it lifts, with its four answers named at the screen's edges">
</p>
<p align="center"><sub>At your desk, two agents building a made-up bakery's shop stop for you: you choose, see their pick,
overrule one, and each agent's terminal gets your answer. On your phone, you hold a card until it lifts and drag it to
an answer.</sub></p>

Your Claude Code and Codex agents make design decisions all day, and a few of them are hard to undo: where a
signed-in user's session lives, how prices are stored, what deleting an account removes. Baesian has the agent put
those to you as cards, before it builds on them. You pick one of its two options before you see which it chose, then
confirm or overrule it. Your answer goes back to the agent, and into git with the code it shapes.

## Try the demo

You need Node 22 or later, and git.

```sh
git clone https://github.com/GusEllerm/baesian.git
cd baesian
npm install
npm run demo
```

The demo makes a throwaway repo where two agents are building Crumb, a made-up bakery's online shop, and have filed
five decisions. It opens the client, and its terminal shows what each agent gets as you answer.

## How it works

1. **An agent files a card** when a decision is hard to undo or isn't its call alone: a schema, a public API, a
   dependency, CI, security, anything user-facing. `baesian init` tells your agents when, in `AGENTS.md`.
2. **You choose first,** between its two options, then see which it picked and why, and confirm or switch.
3. **The agent waits as long as the decision needs:** on most cards it carries on and gets your answer at its next
   pause; on a *blocking* card it waits for you; on a *hard* card, the default for security, privacy, data loss, money
   and publishing, it never goes ahead without you, and you hold to confirm.
4. **Your answer goes back to the agent,** and into git, committed with the code it shapes.

Two things keep decisions from slipping past: a **commit gate** blocks a commit that adds a dependency, changes a
schema or touches CI until a card covers it or the agent says why it's safe; and the **plugin** sends an agent that
asks you to choose in chat back to file a card.

## Why choose before you see the pick?

Seeing the agent's case first anchors you: a confident argument is easy to agree with. Choosing first records, for
each kind of decision, how often you'd have picked what the agent picked. That record is how Baesian suggests which
kinds you could leave to the agent. When you keep answering one kind the same way, Baesian offers to make it a rule
your agents follow without asking.

## Decisions live in git

Each branch carries its own cards, committed with its code, so decisions merge with the code they shaped. The client's
**Your decisions, by branch** (press B) draws that history: where each branch began, what was decided on it, and every
merge with what it brought.

<p align="center"><img src="https://raw.githubusercontent.com/GusEllerm/baesian/main/docs/media/branches.png" width="100%" alt="Baesian's Branches drawer on its own history: merges and cards by branch, with one card opened to the three commits that cite it"></p>
<p align="center"><sub>Baesian's own decisions on one evening: worktrees branching off v1/next, the cards filed on them
and the commits citing those cards, merging back.</sub></p>

Every commit names the cards it builds on, so if you change an answer later, the agent is told which commits built on
the old one. In CI, `baesian verify` checks each commit's decisions, and holds a merge until its cards are answered.

<p align="center"><img src="https://raw.githubusercontent.com/GusEllerm/baesian/main/docs/media/checkpoints.png" width="100%" alt="Four commits on feat/checkout, each carrying the decisions as they stood; when an answer later changes, the agent is told which commits built on the old one"></p>
<p align="center"><sub>Each commit carries the decisions as they stood. When an answer changes, the commits that built on
the old one are named.</sub></p>

## Answering with others

A project can have several people answering its cards: the developers on one repo, say, or a developer and the
statistician whose call some decisions are. Any of them can answer any card, and the first answer decides. Each card
is sent to whoever runs the agent that filed it, so it leads their queue and they're the one told of it; the others
see it too, marked with whom it was sent to, and hear of a blocking or hard one if it's still waiting half an hour
later. Each person's record of how often they'd have picked what the agent picked is their own. An owner adds someone
by a link from the project's members page;
[the setup guide](https://github.com/GusEllerm/baesian/blob/main/docs/setup.md#answering-with-others) has the rest.

## Set it up

You need Node 22 or later, git, and Claude Code or Codex. The
[setup guide](https://github.com/GusEllerm/baesian/blob/main/docs/setup.md) has each step in full.

### 1. Install the CLI

```sh
npm install -g baesian
```

### 2. Make an account

Sign up at [baesian.dev](https://baesian.dev) and make a passkey. Add one on each device you answer from, your phone
included.

### 3. Set up your repo

```sh
cd your-repo
baesian init
baesian login
```

`init` sets up the commit gate and tells your agents about Baesian. `login` links the repo to baesian.dev: approve
this machine on the page it prints, then run the commit it prints.

### 4. Install the plugin

In Claude Code:

```text
/plugin marketplace add GusEllerm/baesian
/plugin install baesian@baesian
```

<details>
<summary><b>Claude Code in VS Code, and Codex</b></summary>

In the VS Code extension, run the same from a terminal, then start a new conversation:

```sh
claude plugin marketplace add GusEllerm/baesian
claude plugin install baesian@baesian
```

In Codex:

```sh
codex plugin marketplace add GusEllerm/baesian
codex plugin add baesian@baesian
```

Codex runs the plugin's hooks only after you accept its "Hooks need review" prompt in interactive mode, and again after
any update.
</details>

<details>
<summary><b>Updating</b></summary>

Update the CLI and the plugin together, to the same release: `npm install -g baesian`, then
`claude plugin update baesian@baesian` (in Codex, `codex plugin marketplace upgrade baesian`, then
`codex plugin add baesian@baesian`). When they differ, the plugin tells your agent to ask you to update. Each release's
notes say what else to run again; [the setup guide](https://github.com/GusEllerm/baesian/blob/main/docs/setup.md#updating)
has the details.
</details>

<details>
<summary><b>Adding someone to your project</b></summary>

On baesian.dev, open **Members** beside the project, make a link, and send it to them yourself: it adds one person,
once, within seven days. They sign up, open it and join. Then, in their own clone of the repo, with the CLI and the
plugin installed:

```sh
baesian init
baesian login
```

If your CI checks decisions, run `baesian ci --github` again once they've joined, so it knows their passkey. See
[the setup guide](https://github.com/GusEllerm/baesian/blob/main/docs/setup.md#answering-with-others).
</details>

<details>
<summary><b>Checking decisions in CI</b></summary>

```sh
baesian ci --github
```

sets the repository variable CI reads its keys from: the service's, a spare it keeps offline, and your passkeys'. Then
add the workflow steps it prints, which run the release that printed them until you run `baesian ci` again. See
[the setup guide](https://github.com/GusEllerm/baesian/blob/main/docs/setup.md#5-check-decisions-in-ci).
</details>

<details>
<summary><b>Without an account, or in a repo you share</b></summary>

`baesian init` then `baesian serve` gives you the client on your own machine, with nothing sent anywhere; `baesian
login` links the repo later. In a repo whose other contributors don't use Baesian, `baesian init --personal` keeps
everything in your clone and commits nothing. Both are in
[the setup guide](https://github.com/GusEllerm/baesian/blob/main/docs/setup.md#without-an-account).
</details>

## Releases

Each release's notes, with anything to run again after updating, are on
[GitHub Releases](https://github.com/GusEllerm/baesian/releases). From 1.0, every 1.x release reads the files earlier
ones wrote, and keeps the hosted service's protocol and the commands, flags, exit codes and MCP tools your agents are
told to use: the setup guide's [Compatibility](https://github.com/GusEllerm/baesian/blob/main/docs/setup.md#compatibility)
section says how. To report a security problem, write to security@baesian.dev
([SECURITY.md](https://github.com/GusEllerm/baesian/blob/main/SECURITY.md)).

## Development

To work on Baesian, build it from a clone and link it onto your PATH, in place of the `baesian` from npm:

```sh
git clone https://github.com/GusEllerm/baesian.git
cd baesian
npm install
npm run build && npm link
```

To try the plugin from your clone, add its marketplace by path, `/plugin marketplace add /path/to/baesian`, then install
it as above. Both marketplaces are named `baesian`, so remove the one from GitHub first:
`/plugin marketplace remove baesian`.

```sh
npm test               # unit tests
npm run e2e            # browser tests, with Playwright
npm run typecheck
npm run readme-media   # remakes this README's images (needs ffmpeg)
```

The project's memory is the Obsidian vault in
[`docs/vault/`](https://github.com/GusEllerm/baesian/blob/main/docs/vault/Home.md): the design, the decision log, and a
log of each working session. Start at `Home.md`.

## Licence

Baesian is source-available under the
[Functional Source License 1.1](https://github.com/GusEllerm/baesian/blob/main/LICENSE.md) (FSL-1.1-ALv2): you may use, change
and run it for any purpose except a product or service that competes with it, and each version becomes available under
the Apache License 2.0 two years after its release.

## Why "Baesian"

It's a dating app for decisions. Your agents line up their options, you swipe on the one you'd pick before you see
which one they picked, and over time you build up preferences for each kind of decision. The decisions you keep
agreeing on become rules, so your agents can make them for you from then on.
