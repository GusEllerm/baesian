import { spawn } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { Command, CommanderError, InvalidArgumentError } from "commander";
import { agentName, harnessSession, personalInstructions } from "./agents.js";
import { ciPin, runProgram, workflowSteps } from "./ci.js";
import { CONFIG_PATH, stagedSnapshot } from "./facts.js";
import { parseDoc } from "./frontmatter.js";
import { describeReport, detectStaged, evaluate } from "./gate.js";
import { personalProblems, runHook } from "./hooks.js";
import { initShared, setUpPersonal, setUpShared } from "./modes.js";
import { notifyFiled } from "./notify.js";
import { openRepo } from "./git.js";
import { parseTrailers } from "./trailers.js";
import { serveMcp } from "./mcp.js";
import {
  type Actor,
  type InboxEntry,
  type Op,
  attachOp,
  deckWaitIds,
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
  waitAllOp,
  waitOp,
  withdrawOp,
} from "./ops.js";
import {
  DEFAULT_SERVICE,
  type Http,
  Offline,
  firstCommitToLink,
  linkAck,
  linkRepo,
  machineName,
  newProjectId,
  projectPage,
  readGrant,
  removeGrant,
  revokeGrant,
  signInMachine,
  writeGrant,
} from "./login.js";
import { Origin } from "./schema.js";
import { findRunningServer, serverUrl, startServer } from "./server.js";
import { aroundFiling, linkProblem, syncRelay, waitWithRelay } from "./sync.js";
import { describeVerify, fileConflicts, verify } from "./verify.js";
import { type Card, PossibleDuplicate, Store, ValidationError } from "./store.js";
import { TRUST_ENV } from "./trust.js";
import { cleanVaultPath, vaultPathProblem, writeNotes } from "./vault.js";
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
  /** How the CLI reaches the hosted service (M9d): its fetch and a signal, replaceable in tests. */
  http?: Http;
  /** The sleep between `baesian login`'s polls, replaceable in tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Runs another program with text on its input (`baesian ci --github` runs `gh`); replaceable in tests, which never run gh. */
  run?: typeof runProgram;
}

/** How long `baesian inbox --quiet`, a harness's hook, waits for the relay: a hook must stay quick, and never fail. */
export const QUIET_SYNC_MS = 5000;

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

/** A draft with `--secret-reason` on it, which files a card that looks like it holds a secret, in a hosted repo (B-jfkv9). */
function withSecretReason(meta: Record<string, unknown>, reason: string | undefined): Record<string, unknown> {
  return reason === undefined ? meta : { ...meta, secret_reason: reason };
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
  const http = (): Http => io.http ?? {};
  /**
   * A filing command (M9d): in a linked repo, pull first and push after (`aroundFiling()`); what the relay said goes to
   * standard error, so the output is the command's own, as before.
   */
  const filing = async <T>(s: Store, op: () => Op<T>, asJson: boolean | undefined) => {
    const { value, notes } = await aroundFiling(s, op, http());
    print(value, asJson);
    for (const n of notes) io.err(n);
  };

  // Personal mode (B-4rwyz): every command but the hooks', the MCP server's, `init` (which fixes it) and a harness's quiet
  // inbox (which says it once a session) says what's wrong with the clone's setup, such as a gate a setup script turned off.
  program.hook("preAction", (_program, command) => {
    const name = command.name();
    if (name === "hook" || name === "mcp" || name === "init" || (name === "inbox" && command.opts().quiet)) return;
    let problems: string[] = [];
    try {
      problems = personalProblems(store());
    } catch {
      // not a repo, or not set up: the command says so itself
    }
    for (const p of problems) io.err(`warning: ${p}`);
  });

  program
    .command("init")
    .description("set up Baesian in this repo: the live layer (.git/baesian/), the record (.baesian/), the gate's block in the repo's hooks and the AGENTS.md instructions; or with --personal, for this clone alone, committing nothing")
    .option("--personal", "use Baesian in this clone alone, in a repo whose collaborators don't (B-4rwyz): nothing is committed, and the repo's hooks and AGENTS.md are left as they are")
    .option("--shared", "shared mode, which plain init sets up; in a personal clone, switch to it: this branch's record, the hooks' block and AGENTS.md are written into the repo, for you to commit")
    .option("--vault <path>", "an Obsidian vault for the vault adapter, relative to the repo root (shared mode)")
    .option("--no-agents", "don't write the instructions block in AGENTS.md")
    .option("--no-hooks", "don't install the git gate")
    .action((opts: { personal?: boolean; shared?: boolean; vault?: string; agents: boolean; hooks: boolean }) => {
      if (opts.personal && opts.shared) throw new ValidationError("--personal and --shared: choose one");
      const s = store();
      const vault = opts.vault === undefined ? undefined : cleanVaultPath(opts.vault);
      if (vault !== undefined) {
        const problem = vaultPathProblem(s.repo.toplevel, vault);
        if (problem) throw new ValidationError(problem);
      }
      const o = { ...(vault !== undefined ? { vault } : {}), agents: opts.agents, hooks: opts.hooks, fallback: io.hookFallback ?? selfCommand() };
      // B-4rwyz: a personal clone stays personal, unless --shared switches it; plain init in any other clone is shared mode.
      const personal = opts.personal || (!opts.shared && s.personal);
      const lines = personal ? setUpPersonal(s, o) : opts.shared ? initShared(store, o) : setUpShared(s, o).lines;
      for (const line of lines) io.out(line);
      // The first preferences are chosen in the client, from example decisions (B-5na1k): only the client writes them (D147).
      if (!store().inForce().name) io.out("preferences: none yet. Run `baesian serve`: the client asks about a few example decisions and suggests how much should reach you.");
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
    .description("wait for the reviewer's verdict on a card, or on several; the exit code says what to do next")
    .argument("[ids...]", "the cards: with several, it returns when every one is answered, or sooner when one comes back to you (B-xnae9)")
    .option("--deck <id>", "wait on your cards in this deck that are still with the reviewer, with any IDs given")
    .option("--until-answered", "no time limit: return only when the cards are answered, or one comes back, for a run in the background that wakes you when it ends")
    .option("--timeout <seconds>", "how long to wait in all, across runs, before falling back; with --until-answered, how long the reviewer sees you waiting", seconds, DEFAULT_TIMEOUT_MS / 1000)
    .option("--slice <seconds>", "how long this run lasts before it exits 7 to be run again (D101)", seconds, SLICE_MS / 1000)
    .option("--no-presence", "wait the full timeout even if the client says the reviewer is away")
    .option("--json", "print the outcome as JSON")
    .action(async (ids: string[], opts: { deck?: string; untilAnswered?: boolean; timeout: number; slice: number; presence: boolean; json?: boolean }) => {
      if (!ids.length && opts.deck === undefined) throw new Error("name a card to wait on, or several, or a deck with --deck");
      const agent = agentName(program.opts().agent);
      // Ctrl-C stops the wait and removes its markers, since the agent has stopped waiting (P18).
      const stop = new AbortController();
      const cancel = () => stop.abort();
      process.once("SIGINT", cancel);
      try {
        const s = store();
        const options: WaitOptions = {
          agent,
          timeoutMs: opts.timeout * 1000,
          sliceMs: opts.slice * 1000,
          usePresence: opts.presence,
          untilAnswered: opts.untilAnswered ?? false,
          signal: stop.signal,
          ...io.waitClock,
        };
        // One card waits as ever; several, or a deck's, wait together (B-xnae9). The deck's cards are read after the first
        // sync, so an answer given while the agent was away is counted. An answer it gives is marked delivered: `inbox`
        // and the hooks shouldn't hand it over again. In a linked repo it listens on the relay's socket, and the waiting
        // markers go up as a heartbeat (M9d, B-bv49e).
        const one = ids.length === 1 && opts.deck === undefined;
        const { value: op, notes } = await waitWithRelay<Op<{ exit: number }>>(
          s,
          (o) => (one ? waitOp(s, ids[0]!, o) : waitAllOp(s, [...ids, ...(opts.deck === undefined ? [] : deckWaitIds(s, opts.deck, agent))], o)),
          options,
          http(),
        );
        print(op, opts.json);
        for (const n of notes) io.err(n);
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
    .option("--secret-reason <text>", "in a hosted repo, file a card that looks like it holds a secret anyway, saying why; kept on the card (B-jfkv9)")
    .option("--json", "print the filed card as JSON")
    .action(async (path: string | undefined, opts: { new?: boolean; secretReason?: string; json?: boolean }) => {
      const { meta, body } = parseDoc(await readInput(path, io));
      const s = store();
      await filing(s, () => fileOp(s, withSecretReason(meta, opts.secretReason), body, { ...actor(), force: opts.new ?? false }), opts.json);
    });

  program
    .command("revise")
    .description("file the next revision of a returned card: your reply to the reviewer")
    .argument("<id>", "the card")
    .argument("[path]", "the revised card; '-' or omitted reads stdin")
    .option("--secret-reason <text>", "in a hosted repo, file a revision that looks like it holds a secret anyway, saying why (B-jfkv9)")
    .option("--json", "print the new revision as JSON")
    .action(async (id: string, path: string | undefined, opts: { secretReason?: string; json?: boolean }) => {
      const { meta, body } = parseDoc(await readInput(path, io));
      const s = store();
      await filing(s, () => reviseOp(s, id, withSecretReason(meta, opts.secretReason), body, actor()), opts.json);
    });

  program
    .command("reply")
    .description("reply once to an answer that went against your pick: a fact the reviewer lacked, or a check (D89)")
    .argument("<id>", "the card")
    .argument("<text>", "the fact or the check, in a line; not your pick again")
    .option("--json", "print the reply's revision as JSON")
    .action(async (id: string, text: string, opts: { json?: boolean }) => {
      const s = store();
      await filing(s, () => replyOp(s, id, text, actor()), opts.json);
    });

  program
    .command("rule")
    .description("draft the rule the reviewer asked for on a decision; it goes to them as a card (D16, D110)")
    .argument("<id>", "the decision")
    .argument("<text>", "the rule, in a line")
    .option("--covers <patterns...>", "the gate facts it answers, as gate reports name them: dep:pytest-*, schema:migrations/*")
    .option("--json", "print the draft's card as JSON")
    .action(async (id: string, text: string, opts: { covers?: string[]; json?: boolean }) => {
      const s = store();
      await filing(s, () => ruleOp(s, id, text, opts.covers ?? [], actor()), opts.json);
    });

  program
    .command("attach")
    .description("wait on an existing card instead of filing a duplicate")
    .argument("<id>", "the card")
    .option("--json", "print the attachment as JSON")
    .action(async (id: string, opts: { json?: boolean }) => {
      const s = store();
      await filing(s, () => attachOp(s, id, agentName(program.opts().agent)), opts.json);
    });

  program
    .command("withdraw")
    .description("withdraw your own card")
    .argument("<id>", "the card")
    .requiredOption("--reason <text>", "why it's no longer needed")
    .option("--json", "print the withdrawal as JSON")
    .action(async (id: string, opts: { reason: string; json?: boolean }) => {
      const s = store();
      await filing(s, () => withdrawOp(s, id, opts.reason, agentName(program.opts().agent)), opts.json);
    });

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
      const s = store();
      const create = () => {
        const deck = s.createDeck({ id, title: opts.title, ...(from ? { from } : {}), ...(opts.note ? { context_notes: opts.note } : {}) }, body);
        return { lines: [`created deck ${deck.meta.id}; file cards into it with "deck: ${deck.meta.id}"`], data: deck };
      };
      await filing(s, create, false);
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
    .action(async (opts: { peek?: boolean; json?: boolean; quiet?: boolean; session?: string }) => {
      // A session starting in a repo without Baesian, or one not set up, isn't an error for a hook.
      let op: Op<InboxEntry[]>;
      let starting: string[] = [];
      try {
        const s = store();
        // M9d: in a linked repo, pull first, and push what's waiting to go up. A hook's run is brief and silent.
        if (s.isInitialised()) {
          const given = io.http ?? {};
          const synced = await syncRelay(s, opts.quiet ? { ...given, signal: given.signal ?? AbortSignal.timeout(QUIET_SYNC_MS) } : given).catch(() => undefined);
          if (!opts.quiet) for (const n of synced?.notes ?? []) io.err(n);
        }
        // A hook names its session; an agent's own command runs in one too, which the harness says (B-ghhym).
        const session = opts.session ?? harnessSession(io.env ?? process.env);
        // Personal mode (B-4rwyz): AGENTS.md says nothing of Baesian, so a harness's hook hands the agent its instructions
        // at a session's first read, with anything wrong with the clone's setup.
        if (opts.quiet && !opts.json && session && s.isInitialised() && s.personal && !s.sessionKnown(session)) {
          starting = [personalInstructions(), ...personalProblems(s).map((p) => `Baesian: ${p}`)];
        }
        op = inboxOp(s, { advance: !opts.peek, ...(session ? { session } : {}) });
      } catch (e) {
        if (opts.quiet) return;
        throw e;
      }
      if (opts.json) return json(op.data);
      for (const line of starting) io.out(line);
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
    .description("serve the client on 127.0.0.1 and open it; one server per repo. In a repo linked to the hosted service, open the project's page on the website instead (D143)")
    .option("--port <n>", "listen on this port (by default the last server's, if it's free, or one the system picks)", port)
    .option("--no-open", "don't open the browser")
    .option("--poll", "check the live layer every second instead of watching it, for shared storage")
    .action(async (opts: { port?: number; open: boolean; poll?: boolean }) => {
      const s = store();
      // D143 (B-k216t): in a linked repo, every answer comes from the website, signed; the local client doesn't start.
      const link = s.config();
      if (link.service && link.project) {
        const problem = linkProblem(s, link);
        if (problem) {
          io.err(`not serving: ${problem}`);
          state.code = 1;
          return;
        }
        const page = projectPage(link.service, link.project);
        io.out(`this repo is linked to ${link.service}: its cards are answered on the website, signed in with your passkey, not here`);
        io.out(`the project's page: ${page}`);
        if (opts.open) openInBrowser(page);
        return;
      }
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
    .description("in a linked repo, sync with the relay; then copy new verdicts and ledger entries into this branch's record (.baesian/), and write the vault's notes")
    .action(async () => {
      const s = store();
      s.requireInit();
      // M9d: pull the relay's log, and push what it doesn't have, before the record is brought up to date.
      const relay = await syncRelay(s, http());
      if (relay.state === "synced") io.out(`relay: received ${relay.pulled.length} file${relay.pulled.length === 1 ? "" : "s"}, sent ${relay.pushed.length}`);
      for (const n of relay.notes) io.err(n);
      // Personal mode (B-4rwyz) has no record and no vault: the live layer is all there is.
      if (s.personal) return io.out("personal mode: nothing to bring into a record, since this clone commits none (B-4rwyz)");
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
      try {
        if (store().personal) io.err("note: this clone uses Baesian in personal mode (B-4rwyz): its decisions aren't committed, so verify, which reads each commit's own record, sees none of them");
      } catch {
        // CI's checkout has no live layer: it's never personal
      }
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
      if (s.personal) io.out("personal mode (B-4rwyz): the commit-msg hook takes these trailers out of the message once it has checked them, into this clone's ledger");
    });

  program
    .command("hook", { hidden: true })
    .description("run a git hook (called by the hooks `baesian init` installs)")
    .argument("<name>", "pre-commit, commit-msg, post-commit, post-merge or post-rewrite")
    .argument("[args...]", "the hook's arguments")
    .action(async (name: string, args: string[]) => {
      const s = store();
      // Personal mode's post-rewrite hands Baesian the commits it rewrote, on standard input (B-4rwyz); shared mode's doesn't.
      let input = "";
      if (name === "post-rewrite" && s.personal) {
        try {
          input = await io.stdin();
        } catch {
          // no input
        }
      }
      state.code = await runHook(s, name, args, io, http(), input);
    });

  program
    .command("login")
    .description("sign this machine in to the hosted service for this repo's project, linking the repo first if it isn't (B-62qnz)")
    .option("--service <url>", `the service's address, for a repo that isn't linked yet (default: $BAESIAN_SERVICE, else ${DEFAULT_SERVICE})`)
    .option("--machine <name>", "this machine's name, as the website shows it (default: its hostname)")
    .action(async (opts: { service?: string; machine?: string }) => {
      const s = store();
      s.requireInit();
      const c = s.config();
      const asked = opts.service ?? (c.service ? undefined : (io.env ?? process.env).BAESIAN_SERVICE);
      if (asked !== undefined && !Origin.safeParse(asked).success) throw new ValidationError(`--service: the service's address, an origin such as https://baesian.example, with no path (got ${JSON.stringify(asked)})`);
      if (c.service && asked && asked !== c.service) {
        throw new ValidationError(
          s.personal
            ? `this clone is linked to ${c.service}, not ${asked}: to move it, change the service and project in its config, .git/baesian/config.json (personal mode, B-4rwyz)`
            : `this repo is linked to ${c.service}, not ${asked}: to move it, change the service and project in .baesian/config.json, a change the commit gate asks a card or an ack for (B-w4g6c)`,
        );
      }
      // B-f2mfb: with none named, the hosted service. Its approval page names it, and takes a passkey, before any card
      // leaves this machine; someone running their own names it once, and the config keeps it.
      const service = c.service ?? asked ?? DEFAULT_SERVICE;
      if (!c.service && !asked) io.out(`linking this repo to ${DEFAULT_SERVICE}, the hosted service: to use another, run \`baesian login --service <url>\` instead`);
      // Linking (B-62qnz, B-5gnea): a repo with no project, or a copy of another repo's (its history starts elsewhere),
      // gets a project of its own; one whose config lacks its first commit has it recorded.
      const copy = c.project !== undefined && c.first_commit !== undefined && linkProblem(s, c) !== undefined;
      const link =
        c.project === undefined || copy
          ? { service, project: newProjectId(), first_commit: firstCommitToLink(s.repo.toplevel) }
          : c.first_commit === undefined
            ? { service, project: c.project, first_commit: firstCommitToLink(s.repo.toplevel) }
            : undefined;
      const project = link?.project ?? c.project!;
      if (!link) {
        const held = (() => {
          try {
            return readGrant(project);
          } catch {
            return undefined;
          }
        })();
        if (held?.service === service) {
          io.out(`this machine is already signed in to project ${project} on ${service}, as ${held.machine}: \`baesian logout\` first to sign in again`);
          return;
        }
      }
      if (copy) io.out(`this checkout is a copy of another repo, not that repo (B-5gnea): linking it to a project of its own`);
      const grant = await signInMachine({
        ...http(),
        service,
        project,
        machine: opts.machine ?? machineName(),
        ...(io.sleep ? { sleep: io.sleep } : {}),
        onCode: (code) => {
          io.out(`To sign this machine in${link && link.project !== c.project ? " and make this repo's project" : ""}, open this page and check it shows the code ${code.user_code}:`);
          io.out(`  ${code.verification_uri_complete ?? code.verification_uri}`);
          // B-zqkwk: a new project is named on that page, by the person; this repo's own name is never sent.
          const asks = link && link.project !== c.project ? "It asks you to name the project, then for your passkey." : "It asks for your passkey.";
          io.out(`${asks} The code lasts ${Math.round(code.expires_in / 60)} minutes; waiting for it to be approved…`);
        },
      });
      writeGrant(grant);
      if (link) {
        linkRepo(s, link);
        io.out(
          s.personal
            ? `linked this clone to ${service} as project ${link.project}, in its own config, .git/baesian/config.json: personal mode commits nothing, so there's nothing to commit (B-62qnz, B-4rwyz)`
            : `linked this repo to ${service} as project ${link.project}, in .baesian/config.json (B-62qnz, B-5gnea)`,
        );
      }
      io.out(`signed in: ${grant.machine} can now file cards and hear answers in project ${project}, never answer them`);
      // The first sync: the relay's files come down, and everything an agent wrote here goes up (B-6k0rk). A repo with a
      // history of cards sends hundreds of files, so it says how many before it starts.
      const files = (n: number) => `${n} file${n === 1 ? "" : "s"}`;
      const relay = await syncRelay(s, { ...http(), sending: (n) => io.out(`relay: sending ${files(n)} to ${service}…`) });
      if (relay.state === "synced") io.out(`relay: received ${files(relay.pulled.length)}, sent ${relay.pushed.length}`);
      for (const n of relay.notes) io.err(n);
      io.out(`answer its cards at ${projectPage(service, project)}`);
      if (link && !s.personal) {
        // The link is a gate fact (B-w4g6c): a command to commit it with its ack, ready to run, the trailer its own paragraph.
        io.out("Commit the link: the commit gate asks an ack for where cards are sent (B-w4g6c). This commits it with one:");
        io.out(`  git add ${CONFIG_PATH} && git commit -m "Link this repo to Baesian" -m "${linkAck(service, link.project)}"`);
      }
    });

  program
    .command("ci")
    .description("in a linked repo: the lines CI's BAESIAN_TRUST pins, read from the service, and the workflow steps that run baesian verify (B-pt52b)")
    .option("--github", "also set the repository variable BAESIAN_TRUST with gh, after printing it")
    .option("--json", "print the result as JSON")
    .action(async (opts: { github?: boolean; json?: boolean }) => {
      const s = store();
      s.requireInit();
      // B-4rwyz: CI checks each commit against its committed record, and personal mode commits none.
      if (s.personal) {
        throw new ValidationError(
          "this clone uses Baesian in personal mode (B-4rwyz): nothing of Baesian's is committed, so CI has no record to verify, and no pin to set. To have CI check the repo's decisions, switch it to shared mode with `baesian init --shared`, commit, then run `baesian ci`.",
        );
      }
      const c = s.config();
      if (!c.service || !c.project) throw new ValidationError("this repo isn't linked to the hosted service: run `baesian login` first, then `baesian ci`");
      // The keys come from the service, through this pull, never from the committed record, which a commit can change.
      const relay = await syncRelay(s, { ...http(), push: false });
      for (const n of relay.notes) io.err(n);
      if (relay.state === "signed-out") throw new ValidationError(`this machine isn't signed in to project ${c.project} on ${c.service}: run \`baesian login\` first, then \`baesian ci\``);
      if (relay.state === "stopped") throw new ValidationError("this checkout doesn't sync with the project its config names, so it can't read the project's keys (above)");
      if (relay.state !== "synced") throw new ValidationError(`couldn't sync with ${c.service}, and CI's keys must come from it: run \`baesian ci\` again once it's reachable`);
      const pin = ciPin(s, c.service, c.project);
      if ("problem" in pin) throw new ValidationError(pin.problem);
      for (const k of pin.skipped) io.err(`left out ${k.file}: ${k.why}`);
      const steps = workflowSteps();
      if (opts.json) json({ ...pin, steps: steps.join("\n") });
      else {
        const page = new URL("/account", pin.site).href;
        const count = pin.passkeys.length === 1 ? "1 passkey" : `${pin.passkeys.length} passkeys`;
        io.out(`keys read from ${c.service}, the service .baesian/config.json names, for project ${c.project}: if that isn't the service you meant, stop here, since a commit can change the config (B-pt52b)`);
        io.out(`${TRUST_ENV}, a line each: the project's (B-mar8x), the service's key, and ${count}:`);
        io.out("");
        for (const line of pin.lines) io.out(line);
        io.out("");
        if (pin.passkeys.length) {
          const whose = pin.passkeys.map((p) => `${p.handle}'s, added ${p.enrolled.slice(0, 10)}`).join("; ");
          io.out(`Check each passkey is yours (${whose}): compare its line with the one the website showed when you added it, and with the passkeys on your account page, ${page}. Leave out a line that isn't yours.`);
        } else {
          io.out(`No passkey yet: CI counts an answer on a hard card only with a passkey it pins (D139, D159). Add one on your account page, ${page}, and run \`baesian ci\` again.`);
        }
        io.out(`Set them as the repository variable ${TRUST_ENV} (on GitHub: Settings, Secrets and variables, Actions, Variables), or run \`baesian ci --github\`. Run \`baesian ci\` again after adding a passkey.`);
        io.out("");
        io.out("The workflow's steps:");
        io.out("");
        for (const line of steps) io.out(line);
      }
      if (opts.github) {
        // Only after the lines are shown (B-pt52b). gh reads the variable's value from its input.
        const r = (io.run ?? runProgram)("gh", ["variable", "set", TRUST_ENV], { input: `${pin.lines.join("\n")}\n`, cwd: s.repo.toplevel });
        if (r.missing) {
          io.err(`gh isn't on PATH, so ${TRUST_ENV} wasn't set: set it by hand, or install GitHub's CLI (https://cli.github.com) and run \`baesian ci --github\` again`);
          state.code = 1;
        } else if (r.status !== 0) {
          io.err(`gh variable set ${TRUST_ENV} failed${r.stderr.trim() ? `: ${r.stderr.trim()}` : ""}`);
          state.code = 1;
        } else (opts.json ? io.err : io.out)(`set the repository variable ${TRUST_ENV} with gh: ${pin.lines.length} lines`);
      }
    });

  program
    .command("logout")
    .description("revoke this machine's grant for this repo's project, and delete its tokens")
    .action(async () => {
      const s = store();
      s.requireInit();
      const { project } = s.config();
      if (!project) throw new ValidationError("this repo isn't linked to the service, so there's nothing to sign out of");
      let grant;
      try {
        grant = readGrant(project);
      } catch {
        removeGrant(project);
        io.out(`deleted this machine's unreadable grant file for project ${project}; revoke the machine on the website's Machines page`);
        return;
      }
      if (!grant) {
        io.out(`this machine isn't signed in to project ${project}`);
        return;
      }
      let reached = true;
      try {
        await revokeGrant(grant, http());
      } catch (e) {
        if (!(e instanceof Offline)) throw e;
        reached = false;
        io.err(`relay: ${e.message}`);
      }
      removeGrant(project);
      io.out(
        reached
          ? `signed out: revoked this machine's grant for project ${project}, and deleted its tokens`
          : `deleted this machine's tokens for project ${project}, but couldn't revoke its grant: revoke it on the website's Machines page, or it lapses after 30 days unused`,
      );
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
      io.err(`${e.message}; run \`baesian wait ${e.id}\` again to wait on ${e.id.includes(" ") ? "them" : "it"}`);
      return 130;
    }
    io.err(e instanceof ValidationError || e instanceof Error ? e.message : String(e));
    return 1;
  }
}
