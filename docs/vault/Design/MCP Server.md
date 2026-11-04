---
type: design
status: draft
authority: proposes
summary: "P18, a proposal for M7, its six cards accepted as D164–D169: a local stdio MCP server started as baesian mcp and registered by the plugin, whose twelve tools call the same store code as the CLI's agent commands, wait in the CLI's 100-second slices, never answer, quote text others wrote, use the hosted sign-in through the CLI's code later, and are built on the official TypeScript SDK v2; with six open choices drafted as cards."
created: 2026-11-03
tags: [baesian, design, mcp]
---

# MCP Server

> **Status: proposal P18. Its six cards were accepted as D164–D169 on 2026-11-03, each the agent's pick; the rest is the agent's, standing unless the user overturns it.** Drafted by an agent on 2026-11-03 for M7, for the user to review. Only what cites a D-number is decided. Each open choice is marked **Decision for the user**, with the agent's recommendation and the strongest alternative. Six are drafted as cards MCP-1 to MCP-6 (deck mcp-server, topics under mcp/; see [[#Decisions for the user]]). The security evidence is in [[Hosted Service - Strand B5 Prior Art and Security]] (cited as B5) and [[Hosted Service]] (P15).

## Already decided

- **D27:** the MCP server is a tier 2 adapter. The CLI, the gate and `AGENTS.md` are the product; the server only makes it faster, and nothing may depend on it.
- **D33, D125:** M7 is the MCP server, in v1, "a view over the live layer".
- **D32, D62:** only the client resolves. Agents never record verdicts.
- **D101:** `baesian wait` waits in runs of at most 100 seconds, inside a 9-minute budget.
- **D102:** how an agent is named: `--agent`, `$BAESIAN_AGENT`, the harness's variables, then "agent".
- **D116:** answers that come after a wait arrive at stopping points, never mid-task.
- **D128:** agents reach the hosted service through Baesian on their machine, the CLI and a local MCP server, after a one-time sign-in. The user's caveat: a local MCP server may complicate security. This note answers it in sections 5 to 8.
- **D136, D144, D153:** `baesian file` warns on likely secrets; an agent may raise a card's level, never lower it; the CLI's machine tokens are Baesian's own.

## What was checked

All while drafting this note, by the agent.

- **The MCP specification, revision 2026-07-28** (the current one): the stdio transport, versioning, tools and changelog pages, through Context7 (library modelcontextprotocol_io_specification_2026-07-28) and on modelcontextprotocol.io directly.
- **The TypeScript SDK, v2.4.0:** its docs through Context7 (library typescript-sdk, v2.4.0), and the npm registry for versions and dependencies.
- **Claude Code:** code.claude.com/docs/en/mcp (the first 100,000 of about 155,000 characters), and the plugins reference and environment variables through Context7 (library claude-code-docs, an archive of Anthropic's docs).
- **Codex:** its source and README through Context7 (library openai/codex): plugin MCP files, timeouts, the environment and working directory a stdio server gets, and its protocol mode. Read, not tried.
- **Seen in this agent's own session:** Claude Code names a plugin's MCP tools mcp__plugin_(plugin)_(server)__(tool), and defers them behind a tool search when there are many.
- **Not checked:** the client names each harness sends; whether Codex asks before starting a plugin's MCP server, or counts its MCP file in the plugin's trust hash; whether Claude Code passes its own variables to MCP servers.

## 1. Transport, starting and registering

**stdio only (D128, B5 F6 and R4).** The harness starts the server as a child process and talks over its standard input and output. There is no port, no HTTP listener and no socket, so other local processes and DNS rebinding can't reach it.

**Started as baesian mcp,** a new subcommand in `buildProgram()`. It takes the global `--agent` option and nothing else.
- It runs until its input closes, then exits. The spec says servers SHOULD exit promptly on end of input.
- Only protocol messages go to its output. Logs go to standard error. `notifyFiled()` already starts its processes with their output ignored, and a test keeps it so.
- **It opens the store on every call** (`Store.open`), as each CLI command does. So a checkout mid-session gives the right branch.
- **The repo** is the server's working directory. Both harnesses start a stdio server in the session's workspace. Each tool also takes an optional cwd argument, for an agent working in another worktree, since the server's own directory never moves. The 2026-07-28 spec deprecates roots and says to pass directories as tool arguments instead.
- **In a repo without Baesian,** the tools are listed, and each call returns the CLI's own "not set up" error.

**Two protocol eras.** MCP changed shape on 2026-07-28. There is no initialize handshake any more: every request carries its version and the client's identity in its metadata, and servers must answer a server/discover request. Older clients still open with initialize.
- Claude Code asks stdio servers whether they speak 2026-07-28, and falls back if not (its MCP docs).
- Codex keeps 2026-07-28 behind a feature flag, so by default it opens with initialize (its README, through Context7).
- So the server must serve both. The spec allows this: a "dual-era" server picks the era from how the client opens.

**Registering it.** *Recommendation (MCP-2):* the plugin in `plugins/baesian/` gets a .mcp.json at its root that runs baesian mcp:

```json
{ "mcpServers": { "baesian": { "command": "baesian", "args": ["mcp"] } } }
```

- Claude Code starts a plugin's MCP servers when the plugin is enabled. Codex reads a plugin's .mcp.json too, and takes a bare command name on PATH, as this is.
- The hooks already need `baesian` on PATH, so this adds no new requirement.
- In Claude Code the tools appear as mcp__plugin_baesian_baesian__file_card and so on.
- No timeouts are set in the file, so one file serves both harnesses (section 4).
- `baesian init` never writes a .mcp.json into a repo. Claude Code loads a repo's servers without asking in claude -p runs and SDK sessions (B5 F8).
- *Strongest alternative:* the plugin carries no server, and each person adds it once: claude mcp add --scope user baesian -- baesian mcp, or codex mcp add baesian -- baesian mcp. **Decision for the user (MCP-2).**

## 2. One set of operations, so the CLI and the server never drift

**The rule:** each tool calls the same store code as its command, and returns the same result.
- **The text a tool returns** is the lines the CLI prints for that command.
- **Its structured content** is what the command prints with `--json`, where it has that option. Where it doesn't (attach, withdraw, reply, rule, topics, template), the server returns a small object, and the CLI gains the same `--json`.
- **Errors** carry the CLI's message, word for word.

**What has to move first.** Some of the logic is inside `buildProgram()`'s actions today: the inbox's "standing answer" check and its hints (`ruleHint()`, `replyHint()`), what `baesian show` puts together, and the lines `baesian file` prints after filing. These move into functions both the CLI and the server call. The CLI's interface doesn't change, so this is the agent's call ([agent decision], to be logged when built).

**The store tells its errors apart.** `Store.fileCard` raises `PossibleDuplicate` and `ValidationError`, but "no card" and "wrong status" are plain errors today. The server needs their kind for its error codes, so they get error classes of their own. The CLI's messages and exit codes stay the same.

## 3. The tools

*Recommendation (MCP-3):* one tool for each agent-facing command, named for what it does. *Strongest alternative:* the three tools [[Baesian Design#Getting it into harnesses]] lists (file_card, get_verdict with a wait option, and list_resolved since a time), leaving the rest to the CLI. **Decision for the user (MCP-3).**

| Tool | Command | Store code | Inputs | Read-only |
|---|---|---|---|---|
| file_card | `baesian file` | `Store.fileCard`, then `notifyFiled()` | the card's fields (MCP-4), body, new | no |
| revise_card | `baesian revise` | `Store.reviseCard` | id, the card's fields, body | no |
| reply_to_card | `baesian reply` | `Store.replyToCard` | id, text | no |
| draft_rule | `baesian rule` | `Store.draftRule` | id, rule, covers | no |
| attach_to_card | `baesian attach` | `Store.attach` | id | no |
| withdraw_card | `baesian withdraw` | `Store.withdraw` | id, reason | no (destructive) |
| wait_for_verdict | `baesian wait` | `waitForVerdict()`, then `Store.markDelivered` | id, timeout_seconds, slice_seconds, presence | no |
| check_inbox | `baesian inbox` | `Store.inbox` | peek, session | no |
| show_card | `baesian show` | `Store.card`, `Store.status`, `Store.decision`, `Store.verdicts`, `Store.waitingOn`, `Store.briefs` | id | yes |
| list_cards | `baesian list` | `Store.cards`, `Store.branchCards` | all, branch | yes |
| list_topics | `baesian topics` | `Store.topics` | none | yes |
| card_template | `baesian template` | `CARD_TEMPLATE` | none | yes |

Every tool also takes cwd (section 1). Reads happen inside one `Store.view`, as the CLI's do.

### Inputs and outputs

- **file_card.** *Recommendation (MCP-4):* the card's fields as JSON arguments, with a schema generated from `CardDraft`. Each field's description is the note `CARD_TEMPLATE` gives it, from one shared table, so the template and the schema can't drift. Plus body (the background), and new (file even if it may be a duplicate, as `--new`). *Strongest alternative:* one string holding the card as the template's Markdown, parsed by `parseDoc()` as `baesian file` does. **Decision for the user (MCP-4).**
  - *Returns* the `FileResult`: the card's ID, level, deck and revision; what raised it to hard (D144); near-match topics; warnings, including likely secrets (`filingWarnings()`); and the CLI's next steps (wait before building on it, the trailer to add).
- **revise_card** returns the same as file_card, for the new revision. **reply_to_card** returns the card's ID, its new revision and level, and the CLI's next step. **draft_rule** returns the new card's ID. **attach_to_card** returns the card's ID and how many agents now wait on it. **withdraw_card** returns the withdrawal.
- **wait_for_verdict** returns the `WaitOutcome`, the CLI's lines (`describeOutcome()`), and a field named next, with the exit code `baesian wait` would give (`exitCodeFor()`):

  | next | Exit code (`WAIT_EXIT`) | Meaning |
  |---|---|---|
  | use | 0 | resolved: use the decision |
  | read | 4 | answered otherwise: read the comment, then revise or withdraw |
  | proceed | 5 | no verdict in time: proceed provisionally |
  | park | 6 | no verdict on a hard card: don't proceed |
  | again | 7 | the reviewer is still there: call it again |
  | go | 8 | held back by the repo's preferences: go ahead with the pick, as provisional (M8, B-chq61) |

- **check_inbox** returns each `InboxItem` (the card, the verdict, any brief), marked with whether it can still take a reply or a rule draft, and the CLI's lines.
- **show_card** returns what `baesian show --json` prints. The CLI's text shows waiting markers and briefs, and its JSON doesn't, so both gain them.
- **list_cards, list_topics and card_template** return what their commands print.

### Errors

Errors a model can act on come back as tool results with isError set, as the spec asks, with the CLI's message and a code. Protocol errors are only for an unknown tool or malformed arguments.

| Code | When | The CLI today |
|---|---|---|
| not_a_repo | the directory isn't in a git repository (`openRepo()`) | exit 1 |
| not_set_up | Baesian isn't set up in the repo | exit 1, "run `baesian init`" |
| possible_duplicate | an open card or a resolved decision may already cover it; the matches come with it (ID, status, title, and whether by topic or title), with the CLI's advice | exit 3 (`EXIT_POSSIBLE_DUPLICATE`) |
| invalid_card | the card fails its schema or a filing rule (`ValidationError`) | exit 1 |
| no_card | no card with that ID | exit 1 |
| not_allowed | the card's state doesn't allow it: revising a card that isn't returned, a second reply, a rule nobody asked for | exit 1 |
| no_deck | the card names a deck that doesn't exist | exit 1 |
| signed_out | later, in a hosted repo with no grant (section 8) | the same, once it exists |

### Tool hints

- show_card, list_cards, list_topics and card_template are marked read-only.
- The writing tools are marked not destructive, since every file they write is new (D34). withdraw_card is marked destructive: it ends a card, and an agent can't undo it.
- wait_for_verdict and check_inbox write local state (the waiting marker, a fallback, the inbox cursor), so they aren't marked read-only. The cost: Codex's "writes" approval mode would ask before each wait. Codex may allow approval per tool in its configuration; that isn't checked.
- Open world: no, until the hosted service ships. Then yes, for the tools that reach the relay.

**Left out:** `baesian check` and `baesian deck`. An agent that commits has a shell, and decks come from the plan hook or from a person. People's commands (`baesian init`, `baesian serve`, `baesian sync`, `baesian verify`) and the git hooks stay CLI-only.

**Descriptions are fixed text,** shipped with each release, never built from card text, and never fetched from anywhere. That closes off "rug pulls", where a description changes after you approved it (B5 F7). The server's instructions, which both eras let it send, are a short form of `AGENTS_BLOCK`.

## 4. Waiting within a tool call

**The same mechanism as `baesian wait`.** wait_for_verdict runs `waitForVerdict()` with the same options. The waiting marker (D90), the 9-minute budget counted from the first wait (D101), the fallback recorded on a blocking card, and the "reviewer away" return (D41) all behave the same. A resolved or answered outcome is marked delivered (`Store.markDelivered`), so the hooks don't hand it over again.

**How long one call lasts.** *Recommendation (MCP-5):* the CLI's slice, 100 seconds (`SLICE_MS`). A call that ends with the reviewer still there returns next: again, and the agent calls again.
- It fits every limit found, with nothing to configure. Claude Code's default limit for an MCP call is about 28 hours, with an idle window of 30 minutes for stdio servers. Codex's default is 300 seconds (tool_timeout_sec).
- The cost: a model turn for each 100 seconds of waiting, up to six in all.
- *Strongest alternative:* one call waits the whole budget, sending progress every 30 seconds. The registration raises Codex's limit to 10 minutes. **Decision for the user (MCP-5).**

**Cancelling.** If the harness cancels a call (the person presses Esc), the server stops the wait and removes the marker, since the agent has stopped waiting. That needs an abort option on `WaitOptions`, which the CLI can use on Ctrl-C too. If the input closes, every wait stops and the server exits.

**Progress.** When a request carries a progress token, the server reports progress at each beat of the marker (every 30 seconds). Both eras support it. It keeps Claude Code's idle window from closing on a long wait.

## 5. What the server must never do

- **Answer a card** (D32, D62). No tool gives a verdict, makes a rule, retires one, merges topics or writes presence. The server's code never calls `Store.addVerdict`, `Store.mergeTopics` or `Store.touchPresence`. Rules are saved only through a verdict, so this covers them too. A false presence heartbeat would tell waiting agents the reviewer is there, so it counts as much as an answer.
- **Record a fallback** other than through `waitForVerdict()`, as the CLI does.
- **Lower a card's level** (D144). It can't: filing goes through `Store.fileCard`, whose floors are `HARD_BY_DEFAULT`.
- **Sign in, show a token, or take one** (section 8).
- **Fetch its descriptions** or build them from cards.
- **Listen on a port.**

Tests check each of these (section 10).

**Withdrawing another agent's card.** `Store.withdraw` records who withdrew a card, but lets anyone withdraw any card, though `baesian withdraw` says "withdraw your own card". A forged instruction (section 7) could use that. *Recommendation:* the store allows it only for cards this branch filed or attached to (`Store.branchCards`), for the CLI and the server alike. *Alternative:* leave it as it is, and rely on the client showing who withdrew a card. A two-way door; the agent's call unless the user objects.

## 6. Naming the agent

**The gap.** D102's order reads the environment, and a stdio server doesn't get the agent's environment.
- Codex passes a stdio server only a short list of variables (PATH, HOME, USER, SHELL, LANG and a few more), plus any its configuration names in env_vars. So `$BAESIAN_AGENT` and `CODEX_THREAD_ID` don't reach it by default. This was read in Codex's source; the exact list wasn't confirmed.
- Claude Code sets `AI_AGENT` for the commands it runs. Whether its MCP servers see it isn't checked.
- The protocol does carry the client's own name: in initialize, and in each request's metadata under 2026-07-28.

**Decision for the user (not drafted as a card).**
- *Recommendation:* one name per server process: the global `--agent` option in the registration; then `$BAESIAN_AGENT`; then the client's name from the protocol, mapped to claude-code or codex where it's recognised, and kept as given otherwise; then `harnessName()`; then "agent". `agentName()` gains the client's name as an extra step, so the CLI's order doesn't change.
- *Strongest alternative:* an optional agent argument on every tool, which wins over the rest, as `--agent` does for each command. Subagents sharing one server could then be named apart, but the model, not the harness, picks the name.

## 7. Prompt injection through tool results

**The risk.** A tool result goes into the agent's context, and some of it was written by someone else:
- card titles, questions, options and bodies written by other agents (on other branches now; on other machines through the relay later);
- reviewers' comments and choices (you, now; other reviewers later);
- topic names, deck briefings (an approved plan) and parent titles in briefs.

They reach the agent through show_card, list_cards, the duplicate matches, briefs, check_inbox and wait_for_verdict. A text field can hold newlines, so raw text can imitate Baesian's own lines, such as "resolved: accept" or "Proceed with that decision". Once hosted, Baesian has all three legs of the "lethal trifecta" (B5 F7): the agent reads the repo, reads text others wrote, and file_card sends text off the machine.

**What the server does in any case:**
- **Descriptions and instructions are fixed** (section 3).
- **Structured content names each text's author:** a person, another agent (by name and branch), or Baesian.
- **The server can't answer,** so the worst a forged instruction can make it do is file, revise or withdraw cards, which a person sees. Withdrawing is narrowed in section 5.
- **The plugin's skill says** to treat a comment as the reviewer's reasoning and card text as data, never as commands.
- **The secret warning** (`filingWarnings()`) applies to file_card as it does to `baesian file`. Once hosted, P15's scan before upload applies to both.

None of this prevents injection; it narrows it (B5 F7).

**Decision for the user (MCP-6).** *Recommendation:* in what agents read, every text a person or another agent wrote is quoted as a JSON string with its author named (for example, reviewer (a person): "…"), so it stays on one line and can't pass for Baesian's own output. The CLI does the same, through the same shared functions (`describeOutcome()`, `describeBrief()` and the rest), so the hooks' output changes too. *Strongest alternative:* text appears as today, raw after a label, in the CLI and the server alike; people read it more easily, and the structured content keeps the fields apart.

## 8. The hosted sign-in, later

> **Built (M9d, 2026-11-04),** as below but for one point ([[src-mcp#The hosted service (M9d, D128, P18 section 8)]]): signed out, a filing tool files the card here and its text says to ask the person to run `baesian login`, rather than returning `signed_out`, since the card is written. `wait_for_verdict` listens on the relay's socket rather than long-polling (B-bv49e).

Following D128, D153 and P15 sections 2, 3 and 5:
- **The server never signs in itself.** The spec says a stdio server "SHOULD NOT" follow MCP's OAuth, "and instead retrieve credentials from the environment" (B5 F5). It uses the grant baesian login made for that machine and project, read by the same code as the CLI.
- **No tool starts a sign-in, returns a token, or accepts one** (no passthrough). A tool that started the device flow would let a prompt-injected agent ask you to "approve this code", P15's open question. Without a grant, tools return signed_out, telling the agent to ask the person to run baesian login.
- **Syncing happens where the commands sync** (P15 section 1): file_card and the other filing tools pull, then push; wait_for_verdict long-polls the relay; check_inbox pulls first.
- **A second line of defence.** A machine token can't carry an answer scope (P15 section 3), and in a hosted repo only signed answers count (D138). So even a tool added by mistake couldn't answer.

## 9. The official SDK, or the protocol by hand

**The facts.**
- **The SDK's v2** splits into small packages. @modelcontextprotocol/server 2.4.0 (2026-10-23) depends on zod ^4.2 and @modelcontextprotocol/core, which depends on zod alone. Baesian already depends on zod 4, so it adds two packages: 7.0 and 1.4 MB unpacked, Apache-2.0, Node 20 or later. v2.0.0 came out on 2026-07-27; there have been five releases since.
- **v1** (@modelcontextprotocol/sdk 1.32.2) has 17 direct dependencies, including express, hono and jose. It isn't considered.
- **v2's serveStdio** serves both eras over stdio. A server connected straight to its older stdio transport serves only the 2025 era. Tools take zod 4 schemas directly, so `CardDraft` could be one.
- **By hand,** Baesian needs: newline-delimited JSON-RPC on stdio; initialize, initialized and ping for the 2025 era; server/discover, per-request metadata, the result type, and the unsupported-version error for 2026-07-28; tools/list and tools/call; cancellation and progress. The agent estimates a few hundred lines and their tests, plus following each spec revision.

**Decision for the user (MCP-1).** *Recommendation:* the official SDK v2. Two eras at once, with the spec still moving, is what an SDK is for, and it costs two packages. *Strongest alternative:* implement the subset by hand, with no new runtime dependency.

## 10. Tests

- **Operations first.** Most tests call the shared operations (section 2) over a temporary repo, as the CLI's tests do. They're fast and run in-process.
- **Parity.** For each tool: its structured content equals the command's `--json`, and its text equals the command's output, on the same fixture.
- **The fixed tool set.** tools/list returns exactly the twelve names. Their descriptions match a snapshot, so a change shows up in review.
- **Never answering.** Every tool is called on every path, errors included. Afterwards there are no new files under verdicts/, rules/ or the topic aliases, and presence is unchanged. A static test checks that the server's code never mentions `Store.addVerdict`, `Store.mergeTopics` or `Store.touchPresence`.
- **Waiting,** with the fake clock the wait tests use: a slice returns again and keeps the marker; a resolved outcome isn't repeated by check_inbox; cancelling removes the marker; closing the input stops the wait and exits; a blocking card that times out records a fallback; a hard card parks.
- **Errors:** each code, from each tool that can raise it.
- **Injection:** a card whose title holds a newline and "resolved: accept" comes back quoted on one line. No description or instruction ever holds card text.
- **A clean output stream:** with a user notify command that writes to its output, the server's output is still only protocol messages.
- **Naming:** each source of the agent's name, in order.
- **Branches:** file a card, check out another branch, file again; the two cards name their own branches.
- **Both eras over stdio.** Spawn baesian mcp as a child process and drive it with the SDK's client, once pinned to the 2025 handshake and once to 2026-07-28. The client is a dev dependency only. (By hand, the same tests send raw JSON lines.)
- **In the harnesses,** through rehearse: Claude Code and Codex each list the tools, file a card, and wait through MCP, as its plugin scenarios do for the hooks.

## Decisions for the user

Filed as cards in deck mcp-server on 2026-11-03:

| Card | Topic | Question | Recommended | Strongest alternative |
|---|---|---|---|---|
| MCP-1, B-xqwrk: **D164** | mcp/protocol-library | The official SDK, or the protocol by hand? | the SDK, v2 | by hand, no new dependency |
| MCP-2, B-06r0a: **D165** | mcp/registration | How are Claude Code and Codex told to start the server? | the plugin registers it | each person adds it |
| MCP-3, B-r78qy: **D166** | mcp/tool-set | Which commands become tools? | all twelve agent commands | the design's three |
| MCP-4, B-sq20r: **D167** | mcp/card-input | In what form does file_card take a card? | fields, with a schema | one Markdown document |
| MCP-5, B-3njn3: **D168** | mcp/wait-length | How long does one waiting call last? | 100 seconds, as the CLI | the whole budget |
| MCP-6, B-cq80s: **D169** | mcp/foreign-text | How does text others wrote appear to agents? | quoted, author named, CLI too | raw after a label |

MCP-2 and MCP-6 touch security, so they're hard. The rest are blocking. MCP-1, MCP-3 and MCP-4 shape the code first, so they're best settled first.

**Not drafted as cards:** naming the agent (section 6). **The agent's calls, which the user may overturn:** moving the CLI's logic into shared operations; error classes in the store; the cwd argument; the tool hints; narrowing who may withdraw a card (section 5).

## As built (M7, 2026-11-03)

Built as above ([[src-mcp]]), with these choices the proposal left open, each the agent's:
- **Every quoted text carries its author on its own line,** as D169 says, in show_card too, where each field has a line: `question by claude-code on main (an agent): "…"`. Briefs now name who wrote their texts (`Brief`).
- **card_template takes no cwd:** it reads no repo.
- **The filing tools' schema leaves out** `type`, `conflict_of` and `caught_at`, which Baesian sets itself; `supersedes`, `confidence`, `domain`, `evidence` and `modules_touched` are in it, with notes of their own in `CARD_FIELDS`.
- **wait_for_verdict's slice_seconds** is at most 100 (D168).
- **The CLI's read commands** (`list`, `show`, `topics`) say Baesian isn't set up in a repo without it, as the tools do, instead of listing nothing. `baesian wait` stopped with Ctrl-C removes its marker and exits 130.
- **Withdrawing a card twice** is refused (`not_allowed`) instead of failing on the file.
- **The SDK's version range** is `^2.4.0`, like the other runtime dependencies; its client, `@modelcontextprotocol/client`, is a dev dependency for the tests.

## Open questions

- **The inbox and sessions.** The server doesn't know the harness's session ID, so check_inbox reads the branch's place, as `baesian inbox` without `--session` does. A hook in the same session may then repeat a verdict the tool showed. The same happens today when an agent runs `baesian inbox` itself. A fix belongs in `Store.inbox`, for both.
- **The client names** Claude Code and Codex send aren't checked. rehearse can record them.
- **Codex and plugin servers:** whether Codex asks before starting one, whether its trust hash covers the MCP file, and whether env_vars works in a plugin's file.
- **Subagents** share their session's MCP server in Claude Code (*unverified*), so they share its agent name unless section 6's alternative is chosen.
- **The protocol's tasks extension** could let a long wait run in the background. It's an extension, not core, in 2026-07-28; not needed for v1.
