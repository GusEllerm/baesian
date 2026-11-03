---
type: module
status: active
authority: describes
summary: "src/mcp.ts: the local MCP server (M7, P18), baesian mcp, over stdio in both protocol eras, on the official SDK v2 (D164). Its twelve tools, one per agent command (D166), call the CLI's operations, so each returns what its command prints; it takes the card's fields with the template's notes (D167), waits in 100-second calls (D168), quotes text others wrote (D169), names errors with codes, and never answers a card."
created: 2026-11-03
updated: 2026-11-03
reviewed: 2026-11-03
tags: [baesian, module, mcp]
---

# src/mcp.ts

The design is [[MCP Server]] (P18, decided as D164–D169). The server is a tier 2 adapter (D27): it makes Baesian faster to use from a harness, and nothing depends on it. Everything it does goes through the operations the CLI uses ([[src-cli#src/ops.ts]]).

## Starting it

- **`baesian mcp`** calls `serveMcp`, which serves over stdio only: no port and no socket, so other local processes can't reach it (D128).
- **Both protocol eras.** `serveStdio`, from the SDK's `@modelcontextprotocol/server` (D164), lets the opening exchange pick the era: `initialize` for a 2025 client (Codex, by default), or per-request metadata and `server/discover` for 2026-07-28 (Claude Code asks for it). It makes one server per connection with `buildMcpServer`.
- **It runs until its input closes.** Closing the input aborts every call still running, so a wait stops and removes its marker, and the process exits.
- **Only protocol messages go to its output.** Its own logs and a failed notification go to standard error, and `notifyFiled` ignores its children's output. A test runs a user `notify` command that prints, and finds only JSON-RPC on the output.
- **It's registered by the plugin** (D165): `plugins/baesian/.mcp.json` runs `baesian` from PATH with `mcp`, as the hooks run it, with no timeouts, so one file serves Claude Code and Codex. Claude Code names its tools `mcp__plugin_baesian_baesian__file_card` and so on. `baesian init` never writes a `.mcp.json` into a repo.

## The tools (D166)

| Tool | Command | Operation | Hints |
|---|---|---|---|
| `file_card` | `baesian file` | `fileOp` | writes |
| `revise_card` | `baesian revise` | `reviseOp` | writes |
| `reply_to_card` | `baesian reply` | `replyOp` | writes |
| `draft_rule` | `baesian rule` | `ruleOp` | writes |
| `attach_to_card` | `baesian attach` | `attachOp` | writes |
| `withdraw_card` | `baesian withdraw` | `withdrawOp` | destructive |
| `wait_for_verdict` | `baesian wait` | `waitOp` | writes (the marker, a fallback) |
| `check_inbox` | `baesian inbox` | `inboxOp` | writes (the inbox's place) |
| `show_card` | `baesian show` | `showOp` | read-only |
| `list_cards` | `baesian list` | `listOp` | read-only |
| `list_topics` | `baesian topics` | `topicsOp` | read-only |
| `card_template` | `baesian template` | `templateOp` | read-only |

- **A tool's text is the lines its command prints, and its structured content what `--json` prints.** A list comes wrapped, since structured content is an object: `items` for the inbox, `cards`, `topics`. A test runs each tool and its command on the same fixture and compares both.
- **Each call opens the store afresh** (`Store.open`), as each command does, so a checkout mid-session files on the new branch. Every tool but `card_template` takes an optional `cwd`, for an agent working in another worktree; by default it's the directory the harness started the server in.
- **No tool is open-world** yet: none reaches beyond the machine.
- **The descriptions and the instructions (`MCP_INSTRUCTIONS`, a short form of `AGENTS_BLOCK`) are fixed text,** never built from cards and never fetched. A snapshot test shows any change in review.

## The card's fields (D167)

`file_card` and `revise_card` take the card's fields as arguments: the store's `CardDraft`, less `type`, `format` (a draft's own, for drafts in files: D156), `conflict_of` and `caught_at`, which Baesian sets itself, with each field described by its note in `CARD_FIELDS`, the same table `CARD_TEMPLATE` is made from. Plus `body` (background) and, for filing, `new` (file even if it may be a duplicate). The schema is strict, and the SDK checks the arguments before the tool runs, naming each field that's wrong. The store then checks them again, with its filing rules.

## Errors

The store's errors come back as tool results with `isError` set, the CLI's message word for word, and a code in the structured content (`errorCode`): `not_a_repo`, `not_set_up`, `possible_duplicate` (with the matches: ID, status, title, whether by topic or title, and the agent and branch that filed it), `invalid_card`, `no_card`, `not_allowed` and `no_deck`. Only an unknown tool is a protocol error. Any other failure is reported by the SDK as an error result with its message.

## Waiting (D168)

`wait_for_verdict` runs `waitOp`, so `waitForVerdict` with the CLI's options: one call lasts at most `SLICE_MS` (100 seconds), and a call that ends with the reviewer still there returns `next: again`. The 9-minute budget counts from the first call, through the waiting marker (D90, D101). Its result is the `WaitOutcome` with `next` and `exit` (`NEXT`).
- **Cancelling:** the call's abort signal is `WaitOptions.signal`, so a call the harness cancels, or a closed input, stops the wait (`WaitCancelled`) and removes the marker. It records no fallback.
- **Progress:** when the call carries a progress token, `WaitOptions.onBeat` sends progress at each beat of the marker, every 30 seconds.

## Naming the agent

One name per call, as P18 section 6 has it: the global `--agent` from the registration, then `$BAESIAN_AGENT`, then the name the client gave in the protocol (each request's metadata in 2026-07-28, `initialize` in 2025), mapped by `clientAgentName` to `claude-code` or `codex` where it's one of theirs and kept as given otherwise, then `harnessName`, then "agent" (`agentName`). The client's name comes before the harness's variables because a stdio server isn't given them all: Codex passes only a short list.

`check_inbox` reads the session the harness names in the server's environment (`harnessSession`), or the one the call gives; otherwise the branch's place, as `baesian inbox` does.

## What it never does

- **Answer a card** (D32, D62). None of `Store.addVerdict`, `Store.mergeTopics`, `Store.touchPresence` or `Store.recordFallback` is named in `src/mcp.ts` or `src/ops.ts`, and a test reads both to keep it so. Another test calls every tool on every path and finds no new verdict, rule or alias, and presence unchanged. A fallback is recorded only by `waitForVerdict`, as for the CLI.
- **Lower a card's level** (D144): filing goes through `Store.fileCard`.
- **Listen on a port,** fetch anything, or sign in.

## Tests

`test/mcp.test.ts` runs the server in-process, through `serveStdio` over the SDK's in-memory transport, in both eras: the tool list, the hints and the schemas; each tool against its command; each error code; never answering; waiting with the fake clock (again, the answer, a fallback, parking, progress) and with a real one (cancelling); quoting; naming; and the repo each call acts in. `test/mcp-stdio.test.ts` spawns `baesian mcp` from source and drives it with the SDK's client (a dev dependency only), once in each era, and by hand to check its output and that closing the input stops a wait and exits.

## Not yet

- The hosted sign-in (`signed_out`, P18 section 8) comes with M9.
- Not tried in a real harness: rehearse's scenarios for Claude Code and Codex listing the tools, filing and waiting through MCP. Nor checked: the client names each harness sends, and whether Codex asks before starting a plugin's server or counts its `.mcp.json` in the plugin's trust hash.
