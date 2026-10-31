---
type: module
status: active
authority: describes
summary: "src/cli.ts, src/wait.ts, src/notify.ts and src/agents.ts: the agent-facing CLI, its exit codes, waiting for verdicts, notifications, and the AGENTS.md instructions."
created: 2026-10-23
updated: 2026-10-23
reviewed: 2026-10-23
tags: [baesian, module]
---

# src/cli.ts

The CLI is tier 0 (D27): every harness can run it. `buildProgram` defines the commands, and `main` runs them and returns the exit code. `src/bin.ts` is the npm entry point.

All output goes through an `Io` object, and Commander's own output and exits are routed through it too (`exitOverride`), so tests drive `main` directly. Stdin is read as a stream (`readStdin`), because `readFileSync(0)` fails with `EAGAIN` on a pipe whose writer hasn't written yet.

## Commands

| Command | Does |
|---|---|
| `init [--vault <path>] [--no-agents] [--no-hooks]` | sets up both layers, writes the AGENTS.md block, and installs the commit gate ([[src-gate]]) |
| `template` | prints a card draft. Unfilled, it fails validation |
| `file [path]` | files a card from a file or stdin; notifies for blocking and hard cards, and prints notes on long fields |
| `revise <id> [path]` | the next revision of a returned card |
| `attach <id>` | waits on an existing card instead of filing a duplicate |
| `withdraw <id> --reason` | withdraws your own card |
| `deck <id> --title [--from] [--note]` | creates a deck; its body is the briefing |
| `wait <id> [--timeout s] [--no-presence]` | waits for a verdict; the exit code says what to do |
| `list [--all] [--branch]`, `show <id>`, `topics` | read. `show` prints the card as the client shows it: the question, the trigger, the stakes, the crux and the two options, then any context |
| `inbox [--peek]` | new verdicts on this branch's cards |
| `serve [--port <n>] [--no-open] [--poll]` | serves the client on 127.0.0.1 and opens it ([[src-server]]). If this repo's server is already running, it prints its address and opens that instead |
| `sync` | copies new verdicts and ledger entries into the record |
| `check [--message <file>]` | previews the commit gate on the staged changes: the decisions found, and what covers them |
| `verify [--base <ref>] [--merge] [--file-conflicts]` | CI: reruns the gate on every commit since the base, against its own committed record. `--merge` adds the merge gate and conflicting decisions ([[src-verify]]) |
| `hook <name> [args…]` | hidden; what the installed git hooks call (`runHook`) |

No command resolves a card (D32). When `init` installs the hooks, it records how to rerun this CLI (`selfCommand`), for hooks run where `baesian` isn't on PATH (D48). `selfCommand` resolves the script path first: under `npm link` or a global install, `argv[1]` is the bin symlink, not the `.js` file. Run from source, there is no fallback, so the hooks rely on PATH.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | done; for `wait`, resolved: use the decision |
| 1 | error, or a usage error |
| 3 | `file`: a possible duplicate (`EXIT_POSSIBLE_DUPLICATE`) |
| 4 | `wait`: answered but not a go-ahead (returned, deferred, withdrawn, superseded) |
| 5 | `wait`: no verdict yet; proceed provisionally |
| 6 | `wait`: no verdict on a hard card; don't proceed |
| 7 | `wait`: no verdict yet, and the reviewer is still there; run it again (D101) |

`WAIT_EXIT` holds codes 4–7. `AGENTS_BLOCK` lists them for agents, and a test keeps the two in step.

## src/wait.ts

`waitForVerdict` runs in short slices (D101), so a run fits inside any harness's command limit (Claude Code's default is 2 minutes). It polls the store every `POLL_MS` until one of four things happens:
- the card leaves `open` or `rerouted`;
- the client's heartbeat is older than `PRESENCE_STALE_MS`, so the reviewer is away;
- the wait's budget, `DEFAULT_TIMEOUT_MS` (9 minutes), is spent. It counts from the card's first run;
- the run's slice, `SLICE_MS` (100 seconds), is over. The run then returns `again`, exit 7, and the agent runs `baesian wait` again.

While it waits, it keeps a waiting marker (`Store.startWaiting`), refreshed every `WAITING_BEAT_MS` (D90). A run that ends with `again` keeps its marker, and the next run picks it up, which is how the budget knows when the wait began. Any other ending removes it. With no verdict, a blocking card gets a fallback recorded (`Store.recordFallback`), and a hard card never proceeds. `exitCodeFor` and `describeOutcome` turn the result into the exit code and the text the agent reads, including the card's briefs (`describeBrief`): what a parent's verdict did to it, or how its answer changed (D80, D81). `baesian inbox` and `baesian show` print the same briefs, and `show` says who is waiting or stopped waiting. The clock and the sleep can be injected, so the tests run without real time passing.

## src/notify.ts

`notifyFiled` sends notifications only for blocking and hard cards (`shouldNotify`):
- an OS notification (`osascript` on macOS, `notify-send` on Linux), with the text passed as arguments rather than built into a script;
- the user's `notify` command, with the card as JSON on stdin.

Both are fire-and-forget: a failed notification never fails the filing. Settings come from `userConfig`, never from the repo. `BAESIAN_OS_NOTIFY=0` turns OS notifications off.

## src/agents.ts

`writeAgentsBlock` keeps `AGENTS_BLOCK` between `BEGIN` and `END` in `AGENTS.md`, and leaves everything else in the file alone. `claudeMdMissesAgents` warns when `CLAUDE.md` doesn't import `AGENTS.md`. `CARD_TEMPLATE` is the draft that `baesian template` prints: the required fields of [[File Formats#Card revision]] to fill in, and the optional ones commented out. Its `touches` list includes `infra`. `agentName` names whoever runs a command (D102): `--agent`, then `$BAESIAN_AGENT`, then the harness's own name (`harnessName`, from variables such as Claude Code's `AI_AGENT`), then `agent`. `AGENTS_BLOCK` covers four things:
- when to file a card, and that every card states its strongest alternative and its crux;
- the commit gate: card or ack trailers, and `baesian check`;
- `wait`'s exit codes;
- that only a person resolves a card.
