import { spawn } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { relative, resolve } from "node:path";
import { Command, CommanderError, InvalidArgumentError } from "commander";
import { agentName, claudeMdMissesAgents, harnessSession, writeAgentsBlock } from "./agents.js";
import { stagedSnapshot } from "./facts.js";
import { parseDoc } from "./frontmatter.js";
import { describeReport, detectStaged, evaluate } from "./gate.js";
import { installHooks, runHook } from "./hooks.js";
import { notifyFiled } from "./notify.js";
import { openRepo } from "./git.js";
import { parseTrailers } from "./trailers.js";
import { serveMcp } from "./mcp.js";
import {
  type Actor,
  type InboxEntry,
  type Op,
  attachOp,
  duplicateLines,
  fileOp,
  inboxOp,
  listOp,
  replyOp,
  reviseOp,
  ruleOp,
  showOp,
  templateOp,
  topicsOp,
  waitOp,
  withdrawOp,
} from "./ops.js";
import { findRunningServer, serverUrl, startServer } from "./server.js";
import { describeVerify, fileConflicts, verify } from "./verify.js";
import { type Card, PossibleDuplicate, Store, ValidationError } from "./store.js";
import { cleanVaultPath, initVault, vaultGuidance, vaultPathProblem, writeNotes } from "./vault.js";
import { DEFAULT_TIMEOUT_MS, SLICE_MS, WaitCancelled, type WaitOptions } from "./wait.js";

/** Exit code when a card may duplicate an open card or a resolved decision. */
export const EXIT_POSSIBLE_DUPLICATE = 3;

export interface Io {
  out: (line: string) => void;
  err: (line: string) => void;
  stdin: () => string | Promise<string>;
  cwd: string;
  /** Notify the reviewer about a filed card. Replaceable so tests never pop OS notifications. */
  notify?: (card: Card) => void;
  /** Clock and sleep for `wait`, replaceable in tests. */
  waitClock?: Pick<WaitOptions, "now" | "sleep" | "pollMs">;
  /** How hooks run Baesian when it isn't on PATH. Defaults to this process's node and script. */
  hookFallback?: readonly string[];
  /** The environment, for what the harness says about the session; replaceable in tests. */
  env?: NodeJS.ProcessEnv;
}

/** The command line that re-runs this CLI, for hooks when `baesian` isn't on PATH (D48). */
export function selfCommand(argv1: string | undefined = process.argv[1]): string[] {
  if (!argv1) return [];
  // Resolve first: under `npm link` or a global install, argv[1] is the bin symlink (`…/bin/baesian`).
  let script: string;
  try {
    script = realpathSync(argv1);
  } catch {
    return [];
  }
  if (!script.endsWith(".js")) return []; // running from source through tsx: rely on PATH
  return [process.execPath, script];
}

/**
 * Read stdin as a stream. `readFileSync(0)` fails with EAGAIN when the pipe's writer hasn't written
 * yet (`baesian template | baesian file`), so it can't be used here.
 */
async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) throw new Error("no card given: pass a file, or pipe one in");
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const defaultIo: Io = {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
  stdin: readStdin,
  cwd: process.cwd(),
};

/** Set by a command that ends with a meaningful non-zero code, such as `wait`. */
interface RunState {
  code: number;
}

function seconds(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new InvalidArgumentError("expected a number of seconds");
  return n;
}

function port(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new InvalidArgumentError("expected a port number");
  return n;
}

/** Open an address in the default browser; if that fails, the printed address is enough. */
function openInBrowser(url: string): void {
  const [cmd, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  try {
    spawn(cmd as string, args as string[], { detached: true, stdio: "ignore" }).on("error", () => {}).unref();
  } catch {
    // no browser to open
  }
}

async function readInput(path: string | undefined, io: Io): Promise<string> {
  return !path || path === "-" ? await io.stdin() : readFileSync(resolve(io.cwd, path), "utf8");
}

export function buildProgram(io: Io = defaultIo, state: RunState = { code: 0 }): Command {
  const program = new Command()
    .name("baesian")
    .description("Swipe review for agent decisions. Agents file cards; a person answers them in the client.")
    .option("--agent <name>", "who is running this (default: $BAESIAN_AGENT, else the harness's own name, else 'agent'; D102)")
    .showHelpAfterError()
    // Throw instead of calling process.exit, and write through io; subcommands inherit both.
    .exitOverride()
    .configureOutput({ writeOut: (s) => io.out(s.trimEnd()), writeErr: (s) => io.err(s.trimEnd()) });

  const store = () => Store.open(io.cwd);
  const json = (value: unknown) => io.out(JSON.stringify(value, null, 2));
  const notify = (card: Card) => {
    try {
      (io.notify ?? notifyFiled)(card);
    } catch (e) {
      io.err(`notification failed (the card is filed): ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const actor = (): Actor => ({ agent: agentName(program.opts().agent), notify });
  /** Print an operation's lines, or with `--json` its data (P18: what the MCP tool returns as structured content). */
  const print = <T>(op: Op<T>, asJson: boolean | undefined) => (asJson ? json(op.data) : op.lines.forEach((line) => io.out(line)));

  program
    .command("init")
    .description("set up the live layer (.git/baesian/), the record (.baesian/) and the AGENTS.md instructions")
    .option("--vault <path>", "an Obsidian vault for the vault adapter, relative to the repo root")
    .option("--no-agents", "don't write the instructions block in AGENTS.md")
    .option("--no-hooks", "don't install the git gate")
    .action((opts: { vault?: string; agents: boolean; hooks: boolean }) => {
      const s = store();
      const vault = opts.vault === undefined ? undefined : cleanVaultPath(opts.vault);
      if (vault !== undefined) {
        const problem = vaultPathProblem(s.repo.toplevel, vault);
        if (problem) throw new ValidationError(problem);
      }
      const created = s.init();
      if (created.length) {
        io.out(`live layer:  ${relative(s.repo.toplevel, s.live)}/  (shared by every worktree, not committed)`);
        io.out(`record:      ${relative(s.repo.toplevel, s.record)}/  (commit this)`);
      } else {
        io.out("already set up");
      }
      // M6: the vault adapter. An existing config gains the vault; Bases is turned on, and the Decision Log gets its query.
      if (vault !== undefined) for (const line of initVault(s, vault)) io.out(line);
      if (opts.hooks) {
        const r = installHooks(s, io.hookFallback ?? selfCommand());
        const changed = Object.entries(r.files).filter(([, v]) => v !== "unchanged");
        const where = relative(s.repo.toplevel, r.dir) || r.dir;
        if (changed.length) io.out(`git gate:    ${changed.map(([k, v]) => `${k} ${v}`).join(", ")} in ${where}/`);
        if (r.setHooksPath) io.out("             core.hooksPath set to .githooks (each clone runs `baesian init` once)");
        if (!r.versioned) io.out(`note: ${where} isn't versioned, so other clones won't get the gate; CI still checks.`);
      }
      if (opts.agents) {
        const result = writeAgentsBlock(s.repo.toplevel, vaultGuidance(s));
        if (result !== "unchanged") io.out(`AGENTS.md:   instructions ${result}`);
        if (claudeMdMissesAgents(s.repo.toplevel)) {
          io.out("note: CLAUDE.md doesn't import AGENTS.md. Add a line `@AGENTS.md` so Claude Code reads the instructions.");
        }
      }
    });

  program
    .command("template")
    .description("print a card draft to fill in")
    .option("--json", "print it as JSON")
    .action((opts: { json?: boolean }) => print(templateOp(), opts.json));

  program
    .command("topics")
    .description("list the topics in use, to reuse rather than invent near-duplicates")
    .option("--json", "print them as JSON")
    .action((opts: { json?: boolean }) => print(topicsOp(store()), opts.json));

  program
    .command("wait")
    .description("wait for the reviewer's verdict on a card; the exit code says what to do next")
    .argument("<id>", "the card")
    .option("--timeout <seconds>", "how long to wait in all, across runs, before falling back", seconds, DEFAULT_TIMEOUT_MS / 1000)
    .option("--slice <seconds>", "how long this run lasts before it exits 7 to be run again (D101)", seconds, SLICE_MS / 1000)
    .option("--no-presence", "wait the full timeout even if the client says the reviewer is away")
    .option("--json", "print the outcome as JSON")
    .action(async (id: string, opts: { timeout: number; slice: number; presence: boolean; json?: boolean }) => {
      // Ctrl-C stops the wait and removes its marker, since the agent has stopped waiting (P18).
      const stop = new AbortController();
      const cancel = () => stop.abort();
      process.once("SIGINT", cancel);
      try {
        // An answer it gives is marked delivered: `inbox` and the hooks shouldn't hand it over again.
        const op = await waitOp(store(), id, {
          agent: agentName(program.opts().agent),
          timeoutMs: opts.timeout * 1000,
          sliceMs: opts.slice * 1000,
          usePresence: opts.presence,
          signal: stop.signal,
          ...io.waitClock,
        });
        print(op, opts.json);
        state.code = op.data.exit;
      } finally {
        process.off("SIGINT", cancel);
      }
    });

  program
    .command("file")
    .description("file a decision card from a Markdown file (or stdin)")
    .argument("[path]", "the card draft; '-' or omitted reads stdin")
    .option("--new", "file even if an open card or a resolved decision looks like the same decision")
    .option("--json", "print the filed card as JSON")
    .action(async (path: string | undefined, opts: { new?: boolean; json?: boolean }) => {
      const { meta, body } = parseDoc(await readInput(path, io));
      print(fileOp(store(), meta, body, { ...actor(), force: opts.new ?? false }), opts.json);
    });

  program
    .command("revise")
    .description("file the next revision of a returned card: your reply to the reviewer")
    .argument("<id>", "the card")
    .argument("[path]", "the revised card; '-' or omitted reads stdin")
    .option("--json", "print the new revision as JSON")
    .action(async (id: string, path: string | undefined, opts: { json?: boolean }) => {
      const { meta, body } = parseDoc(await readInput(path, io));
      print(reviseOp(store(), id, meta, body, actor()), opts.json);
    });

  program
    .command("reply")
    .description("reply once to an answer that went against your pick: a fact the reviewer lacked, or a check (D89)")
    .argument("<id>", "the card")
    .argument("<text>", "the fact or the check, in a line; not your pick again")
    .option("--json", "print the reply's revision as JSON")
    .action((id: string, text: string, opts: { json?: boolean }) => print(replyOp(store(), id, text, actor()), opts.json));

  program
    .command("rule")
    .description("draft the rule the reviewer asked for on a decision; it goes to them as a card (D16, D110)")
    .argument("<id>", "the decision")
    .argument("<text>", "the rule, in a line")
    .option("--covers <patterns...>", "the gate facts it answers, as gate reports name them: dep:pytest-*, schema:migrations/*")
    .option("--json", "print the draft's card as JSON")
    .action((id: string, text: string, opts: { covers?: string[]; json?: boolean }) => print(ruleOp(store(), id, text, opts.covers ?? [], actor()), opts.json));

  program
    .command("attach")
    .description("wait on an existing card instead of filing a duplicate")
    .argument("<id>", "the card")
    .option("--json", "print the attachment as JSON")
    .action((id: string, opts: { json?: boolean }) => print(attachOp(store(), id, agentName(program.opts().agent)), opts.json));

  program
    .command("withdraw")
    .description("withdraw your own card")
    .argument("<id>", "the card")
    .requiredOption("--reason <text>", "why it's no longer needed")
    .option("--json", "print the withdrawal as JSON")
    .action((id: string, opts: { reason: string; json?: boolean }) => print(withdrawOp(store(), id, opts.reason, agentName(program.opts().agent)), opts.json));

  program
    .command("deck")
    .description("create a deck; its body is the briefing")
    .argument("<id>", "a lowercase slug, e.g. storage-layer")
    .requiredOption("--title <text>", "what the deck decides")
    .option("--from <path>", "use a document (a plan, design note, issue) as the briefing; '-' reads stdin")
    .option("--note <wikilink...>", "vault notes that give context")
    .action(async (id: string, opts: { title: string; from?: string; note?: string[] }) => {
      // A briefing piped in records no `from`: a harness's plan lives outside the repo, and its path would show the
      // machine's layout in the record (as D105 found for worktrees).
      const from = opts.from && opts.from !== "-" ? resolve(io.cwd, opts.from) : undefined;
      const body = opts.from ? await readInput(opts.from, io) : "";
      const deck = store().createDeck(
        { id, title: opts.title, ...(from ? { from } : {}), ...(opts.note ? { context_notes: opts.note } : {}) },
        body,
      );
      io.out(`created deck ${deck.meta.id}; file cards into it with "deck: ${deck.meta.id}"`);
    });

  program
    .command("list")
    .description("list cards that still need the reviewer (or all of them)")
    .option("--all", "include resolved, withdrawn and superseded cards")
    .option("--branch", "only this branch's cards")
    .option("--json", "print as JSON")
    .action((opts: { all?: boolean; branch?: boolean; json?: boolean }) => print(listOp(store(), opts), opts.json));

  program
    .command("show")
    .description("show a card, its status and its verdicts")
    .argument("<id>", "the card")
    .option("--json", "print as JSON")
    .action((id: string, opts: { json?: boolean }) => print(showOp(store(), id), opts.json));

  program
    .command("inbox")
    .description("verdicts on this branch's cards since you last looked")
    .option("--peek", "don't mark them as seen")
    .option("--json", "print as JSON")
    .option("--quiet", "for a harness hook: print nothing when there's nothing new, or the repo doesn't use Baesian")
    .option("--session <id>", "for a harness hook: the session reading, which keeps its own place, so every session on the branch hears each verdict once")
    .action((opts: { peek?: boolean; json?: boolean; quiet?: boolean; session?: string }) => {
      // A session starting in a repo without Baesian, or one not set up, isn't an error for a hook.
      let op: Op<InboxEntry[]>;
      try {
        const s = store();
        // A hook names its session; an agent's own command runs in one too, which the harness says (B-ghhym).
        const session = opts.session ?? harnessSession(io.env ?? process.env);
        op = inboxOp(s, { advance: !opts.peek, ...(session ? { session } : {}) });
      } catch (e) {
        if (opts.quiet) return;
        throw e;
      }
      if (opts.json) return json(op.data);
      if (!op.data.length && opts.quiet) return;
      if (opts.quiet) io.out("Baesian: new verdicts on this branch's cards since you last looked (`baesian inbox`):");
      for (const line of op.lines) io.out(line);
    });

  program
    .command("mcp")
    .description("serve the agent commands as MCP tools over stdio, for a harness to start (the plugin registers it)")
    .action(async () => {
      // Only protocol messages go to the output; the server opens the store on every call, in the harness's directory.
      await serveMcp({ cwd: io.cwd, ...(program.opts().agent ? { agent: program.opts().agent } : {}) });
    });

  program
    .command("serve")
    .description("serve the client on 127.0.0.1 and open it; one server per repo")
    .option("--port <n>", "listen on this port (by default the last server's, if it's free, or one the system picks)", port)
    .option("--no-open", "don't open the browser")
    .option("--poll", "check the live layer every second instead of watching it, for shared storage")
    .action(async (opts: { port?: number; open: boolean; poll?: boolean }) => {
      const s = store();
      const running = await findRunningServer(s);
      if (running) {
        io.out(`already serving this repo: ${serverUrl(running)}`);
        if (opts.open) openInBrowser(serverUrl(running));
        return;
      }
      const server = await startServer(s, { ...(opts.port ? { port: opts.port } : {}), poll: opts.poll ?? false });
      io.out(`serving ${s.repo.toplevel} at ${server.url}`);
      io.out(`watching the live layer by ${server.watchMode() === "poll" ? "polling every second" : "file events, with a rescan every 30 seconds"}; Ctrl-C to stop`);
      if (opts.open) openInBrowser(server.url);
      await new Promise<void>((done) => {
        process.once("SIGINT", done);
        process.once("SIGTERM", done);
      });
      await server.close();
      io.out("stopped");
    });

  program
    .command("sync")
    .description("copy new verdicts and ledger entries into this branch's record (.baesian/), and write the vault's notes")
    .action(() => {
      const s = store();
      const added = s.syncRecord();
      io.out(added.length ? `added to the record:\n${added.map((p) => `  ${p}`).join("\n")}` : "record is up to date");
      // M6 (D170): the vault's notes too, for verdicts that came after the branch's last commit. Not staged.
      const notes = writeNotes(s);
      for (const w of notes.warnings) io.err(`warning: ${w}`);
      if (notes.vault && !notes.unusable) {
        io.out(notes.written.length ? `wrote in the vault:\n${notes.written.map((p) => `  ${p}`).join("\n")}` : "vault notes are up to date");
      }
    });

  program
    .command("verify")
    .description("CI: check every commit since --base against its committed record; --merge adds the merge gate")
    .option("--base <ref>", "the branch being merged into (default: origin/$GITHUB_BASE_REF in GitHub Actions)")
    .option("--merge", "also require every cited card to be resolved or deferred, and no conflicting decisions")
    .option("--file-conflicts", "file a conflict card for each conflict (local only: needs the live layer)")
    .option("--json", "print the result as JSON")
    .action((opts: { base?: string; merge?: boolean; fileConflicts?: boolean; json?: boolean }) => {
      const base = opts.base ?? (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : undefined);
      if (!base) throw new Error("pass --base <ref>, e.g. --base origin/main");
      const repo = openRepo(io.cwd);
      const result = verify(repo, base, { merge: Boolean(opts.merge || opts.fileConflicts) });
      if (opts.json) json(result);
      else for (const line of describeVerify(result)) io.out(line);
      if (opts.fileConflicts && result.merge?.conflicts.length) {
        const s = store();
        for (const card of fileConflicts(s, result.merge.conflicts)) {
          notify(card);
          io.out(`filed conflict card ${card.meta.id}: ${card.meta.title}`);
        }
      }
      state.code = result.ok ? 0 : 1;
    });

  program
    .command("check")
    .description("preview the commit gate on the staged changes: the decisions found, and what covers them")
    .option("--message <file>", "check the trailers in this commit message too")
    .option("--json", "print the report as JSON")
    .action((opts: { message?: string; json?: boolean }) => {
      const s = store();
      const message = opts.message ? readFileSync(resolve(io.cwd, opts.message), "utf8") : "";
      const report = evaluate(s, detectStaged(s, stagedSnapshot(s.repo.toplevel)), parseTrailers(message, s.repo.toplevel));
      // The exit code is the same with --json: found by rehearse's agent, whose graders read the JSON.
      state.code = report.ok ? 0 : 1;
      if (opts.json) return json(report);
      if (!report.facts.length && report.ok) return io.out("no decisions detected in the staged changes");
      for (const line of describeReport(report)) io.out(line.replace("commit blocked.", "this commit would be blocked."));
    });

  program
    .command("hook", { hidden: true })
    .description("run a git hook (called by the hooks `baesian init` installs)")
    .argument("<name>", "pre-commit, commit-msg or post-commit")
    .argument("[args...]", "the hook's arguments")
    .action((name: string, args: string[]) => {
      state.code = runHook(store(), name, args, io);
    });

  return program;
}

export async function main(argv: string[] = process.argv, io: Io = defaultIo): Promise<number> {
  const state: RunState = { code: 0 };
  try {
    await buildProgram(io, state).parseAsync(argv);
    return state.code;
  } catch (e) {
    // Commander has already printed its own message (usage errors, --help, --version).
    if (e instanceof CommanderError) return e.exitCode;
    if (e instanceof PossibleDuplicate) {
      for (const line of duplicateLines(e)) io.err(line);
      return EXIT_POSSIBLE_DUPLICATE;
    }
    // Ctrl-C during `wait`: its marker is gone, so the reviewer no longer sees the agent waiting.
    if (e instanceof WaitCancelled) {
      io.err(`${e.message}; run \`baesian wait ${e.id}\` again to wait on it`);
      return 130;
    }
    io.err(e instanceof ValidationError || e instanceof Error ? e.message : String(e));
    return 1;
  }
}
