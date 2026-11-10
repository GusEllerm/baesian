# Security

## Reporting a problem

Write to **security@baesian.dev**. You don't need a GitHub account. Please don't open an issue, a pull request or a
discussion about it: anyone can read those.

Report anything in Baesian or at [baesian.dev](https://baesian.dev) that could let someone:

- read, change or delete another person's cards, answers, account or projects on baesian.dev;
- sign in as someone else, or answer a card for them, a hard card's passkey included;
- get an answer past `baesian verify` or the commit gate that its reviewer didn't give, or that the service didn't sign;
- run code on someone's machine through the CLI, the client `baesian serve` runs, the git hooks `baesian init` writes,
  or the plugin;
- learn what the [privacy page](https://baesian.dev/privacy) says the service keeps to itself.

Say what you found, how to reproduce it, the release you found it in (`baesian --version`) or the page of baesian.dev,
and what you think it lets someone do. Please test only with your own account and projects, and send the service no
more requests than showing the problem needs.

Questions about your data that aren't a security problem go to privacy@baesian.dev.

## What happens next

Gus Ellerm, who runs Baesian and baesian.dev, reads every report, and you'll get a reply. A fix comes in a release,
whose notes on [GitHub Releases](https://github.com/GusEllerm/baesian/releases) say what it fixed and what to do.

## Supported releases

Security fixes go into the latest 1.x release, of the CLI and the plugin together. baesian.dev always runs the latest
release.

| Release | Supported |
|---|---|
| The latest 1.x | Yes |
| An earlier 1.x | No: update with `npm install -g baesian`, and update the plugin with it |
| 0.1.x | No: the hosted service refuses it. Install the latest 1.x |
