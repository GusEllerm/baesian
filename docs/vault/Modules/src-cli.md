---
type: module
status: active
authority: describes
summary: "src/cli.ts, src/ops.ts, src/quote.ts, src/wait.ts, src/notify.ts and src/agents.ts: the agent-facing CLI, the operations it shares with the MCP server, how text others wrote is quoted (D169), its exit codes, waiting for verdicts, notifications, and the AGENTS.md instructions."
created: 2026-10-23
updated: 2026-11-03
reviewed: 2026-10-23
tags: [baesian, module]
---

# src/cli.ts

The CLI is tier 0 (D27): every harness can run it. `buildProgram` defines the commands, and `main` runs them and returns the exit code. `src/bin.ts` is the npm entry point.

All output goes through an `Io` object, and Commander's own output and exits are routed through it too (`exitOverride`), so tests drive `main` directly. Stdin is read as a stream (`readStdin`), because `readFileSync(0)` fails with `EAGAIN` on a pipe whose writer hasn't written yet.

The agent commands' logic is in `src/ops.ts` (below), which the MCP server calls too (P18), so the commands only parse their arguments and print what an operation returns: its lines, or with `--json` its data.

## Commands

| Command | Does |
|---|---|
| `init [--vault <path>] [--no-agents] [--no-hooks]` | sets up both layers, writes the AGENTS.md block, and installs the commit gate ([[src-gate]]) |
| `template [--json]` | prints a card draft (`CARD_TEMPLATE`). Unfilled, it fails validation |
| `file [path]` | files a card from a file or stdin; notifies for blocking and hard cards, and prints notes on long fields |
| `revise <id> [path] [--json]` | the next revision of a returned card |
| `rule <id> <text> [--covers <patterns…>] [--json]` | drafts the rule the reviewer asked for on a decision, as a card that builds on it (D110). `wait` and `inbox` offer it while it's asked for |
| `reply <id> <text> [--json]` | the agent's one reply to an answer against its pick: a fact or a check (D89, D104). `wait` and `inbox` offer it when it's open |
| `attach <id> [--json]` | waits on an existing card instead of filing a duplicate |
| `withdraw <id> --reason [--json]` | withdraws a card you filed or attached to |
| `deck <id> --title [--from] [--note]` | creates a deck; its body is the briefing. `--from -` reads it from stdin and records no `from`, for a harness's plan (D115) |
| `wait <id> [--timeout s] [--no-presence] [--json]` | waits for a verdict; the exit code says what to do. `--json` gives the outcome with `next` and `exit` (`NEXT`). Ctrl-C stops it and removes its waiting marker |
| `list [--all] [--branch]`, `show <id>`, `topics [--json]` | read; each says Baesian isn't set up in a repo that doesn't use it. `show` prints the card as the client shows it: the question, the trigger, the stakes, the crux and the two options, then any context, who is waiting and the briefs. Its `--json` has the waiting markers and the briefs too |
| `inbox [--peek] [--quiet] [--session <id>]` | new verdicts on this branch's cards, less those `wait` already delivered. `--session` is for a harness's hooks: that session keeps its own place, so every session on the branch hears each verdict once (B-ghhym). Without it, an agent's own `baesian inbox` reads the session its harness names (`harnessSession()`: `CLAUDE_CODE_SESSION_ID` in Claude Code, `CODEX_THREAD_ID` in Codex, the same IDs the hooks receive), so the agent and its hooks share one place and nothing is handed over twice. Each names what it decided, as `wait` does: an accept names the proposal (`accept: SQLite (WAL mode)`), as `show` does too. A verdict that retired a rule says so (D119). `--quiet` is for a harness's hooks (M5): a heading and the verdicts, or nothing at all when there's nothing new or the repo doesn't use Baesian, and never a failure |
| `serve [--port <n>] [--no-open] [--poll]` | serves the client on 127.0.0.1 and opens it ([[src-server]]), on the last server's port when it's free (D103). If this repo's server is already running, it prints its address and opens that instead |
| `sync` | copies new verdicts and ledger entries into the record |
| `check [--message <file>] [--json]` | previews the commit gate on the staged changes: the decisions found, and what covers them. Exits 1 when the commit would be blocked, with `--json` too |
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
| 130 | `wait`: stopped with Ctrl-C (`WaitCancelled`) |

`WAIT_EXIT` holds codes 4–7. `AGENTS_BLOCK` lists them for agents, and a test keeps the two in step.

## src/ops.ts

One function per agent command, shared by the CLI and the MCP server ([[src-mcp]]): `fileOp`, `reviseOp`, `replyOp`, `ruleOp`, `attachOp`, `withdrawOp`, `waitOp`, `inboxOp`, `showOp`, `listOp`, `topicsOp` and `templateOp`. Each returns an `Op`: the lines the CLI prints, and the data its `--json` prints, which the server returns as a tool's text and structured content. Errors are the store's classes ([[src-store#Errors]]); `duplicateLines` is what a possible duplicate prints. The filing operations call the notifier they're given (`Actor`), so the CLI and the server each report a failed notification their own way. `waitOp` marks an answer delivered, and adds `next` and `exit` (`NEXT`: use, read, proceed, park, again). `inboxOp` marks each item with whether it can still take a reply or a rule draft. `cardLine`, `cardDetails` and `verdictLine` are how a card and a verdict read.

## src/quote.ts

Text others wrote reaches agents quoted, with its author, on one line (D169): titles, a card's fields, options, a reviewer's choice and comment, a parent's title in a brief. Raw, a field holding a newline could pass for Baesian's own lines ("B-7f3kq resolved: …"). `q` makes a text a JSON string; `said` gives `<what> by <author>: "<text>"`; `byLine` names the author, `Gus Ellerm (a person)` or `claude-code on main (an agent)`, quoting a name that isn't plain, since agents name themselves; `answerLine` is a verdict on one line. Everything an agent reads goes through them: `describeOutcome`, `describeBrief`, the operations' lines, the gate's report (`describeReport`) and `verify`'s messages, and so the plugin's hooks, which print `inbox --quiet`. `show` names the card's author once, above its fields, each of which is quoted on its own line.

## src/wait.ts

`waitForVerdict` runs in short slices (D101), so a run fits inside any harness's command limit (Claude Code's default is 2 minutes). Each poll reads through a fresh `Store.view`, so a card's status reads every other card once, not once per question ([[2026-11-03 Scale Test]]). It polls the store every `POLL_MS` until one of four things happens:
- the card leaves `open` or `rerouted`;
- the client's heartbeat is older than `PRESENCE_STALE_MS`, so the reviewer is away;
- the wait's budget, `DEFAULT_TIMEOUT_MS` (9 minutes), is spent. It counts from the card's first run;
- the run's slice, `SLICE_MS` (100 seconds), is over. The run then returns `again`, exit 7, and the agent runs `baesian wait` again.

While it waits, it keeps a waiting marker (`Store.startWaiting`), refreshed every `WAITING_BEAT_MS` (D90), calling `WaitOptions.onBeat` at each beat (the MCP server reports progress then). `WaitOptions.signal` stops a wait: it throws `WaitCancelled`, removes the marker, and records no fallback; the CLI aborts it on Ctrl-C, the MCP server when a call is cancelled or its input closes. A run that ends with `again` keeps its marker, and the next run picks it up, which is how the budget knows when the wait began. Any other ending removes it. With no verdict, a blocking card gets a fallback recorded (`Store.recordFallback`), and a hard card never proceeds. `exitCodeFor` and `describeOutcome` turn the result into the exit code and the text the agent reads, with what the reviewer wrote quoted and named (D169), including the card's briefs (`describeBrief`): what a parent's verdict did to it, or how its answer changed and the commits to rework, with those a rebase or a squash has since taken off every branch listed apart (D80, D81, B-9v5xj). `baesian inbox` and `baesian show` print the same briefs, and `show` says who is waiting or stopped waiting. A wait that ends with an answer marks what it printed as delivered (`Store.markDelivered`), so `inbox` and the plugin's hooks don't hand it over again. A resolved card whose answer retired a rule tells the agent not to cite the rule again (D119). The clock and the sleep can be injected, so the tests run without real time passing.

## src/notify.ts

`notifyFiled` sends notifications only for blocking and hard cards (`shouldNotify`):
- an OS notification (`osascript` on macOS, `notify-send` on Linux), with the text passed as arguments rather than built into a script;
- the user's `notify` command, with the card as JSON on stdin.

Both are fire-and-forget: a failed notification never fails the filing. Settings come from `userConfig`, never from the repo. `BAESIAN_OS_NOTIFY=0` turns OS notifications off.

## src/agents.ts

`writeAgentsBlock` keeps `AGENTS_BLOCK` between `BEGIN` and `END` in `AGENTS.md`, and leaves everything else in the file alone. `claudeMdMissesAgents` warns when `CLAUDE.md` doesn't import `AGENTS.md`. `CARD_TEMPLATE` is the draft that `baesian template` prints: the required fields of [[File Formats#Card revision]] to fill in, and the optional ones commented out. Its `touches` list includes `infra`. It's made from `CARD_FIELDS`, a table of each field's note, which also describes the MCP filing tools' fields (D167), so the two can't drift. `agentName` names whoever runs a command (D102): `--agent`, then `$BAESIAN_AGENT`, then the name an MCP client gave (`clientAgentName`, which makes Claude Code's and Codex's `claude-code` and `codex`), then the harness's own name (`harnessName`, from variables such as Claude Code's `AI_AGENT`, or Codex's `CODEX_THREAD_ID`), then `agent`. `AGENTS_BLOCK` covers:
- when to file a card, and that every card states its strongest alternative and its crux;
- that a topic names one question, so a follow-on gets its own, narrower topic (D112);
- that the reviewer chooses before seeing the agent's pick, case or body, so what they need in order to choose goes in `crux_fact`, kept neutral (provisional, on the finding 2 card);
- that the decision record is committed with the code, so secrets, credentials and private output stay out of cards (B-vqn69). The plugin's skill says the same, and `baesian file` warns on text that looks like a secret ([[src-store]]);
- the commit gate: card or ack trailers, and `baesian check`;
- `wait`'s exit codes, with the one reply to an answer against the agent's pick (D104);
- drafting a rule when an answer asks for one, with `baesian rule` (D110);
- naming a long-lived agent with `$BAESIAN_AGENT` (D102);
- what to do when `baesian file` exits 3, including for a follow-on (D112);
- that only a person resolves a card.

The template says the same as the block: reuse a topic only for the same question, and `crux_fact` is the only context the reviewer sees first.
