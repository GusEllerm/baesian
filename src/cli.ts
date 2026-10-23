import { readFileSync, realpathSync } from "node:fs";
import { relative, resolve } from "node:path";
import { Command, CommanderError, InvalidArgumentError } from "commander";
import { CARD_TEMPLATE, claudeMdMissesAgents, writeAgentsBlock } from "./agents.js";
import { stagedSnapshot } from "./facts.js";
import { parseDoc } from "./frontmatter.js";
import { describeReport, detectStaged, evaluate } from "./gate.js";
import { installHooks, runHook } from "./hooks.js";
import { notifyFiled } from "./notify.js";
import { parseTrailers } from "./trailers.js";
import type { Verdict } from "./schema.js";
import { type Card, PENDING, PossibleDuplicate, Store, ValidationError } from "./store.js";
import { DEFAULT_TIMEOUT_MS, type WaitOptions, describeOutcome, exitCodeFor, waitForVerdict } from "./wait.js";

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

function agentName(opt: string | undefined): string {
  return opt ?? process.env.BAESIAN_AGENT ?? "agent";
}

async function readInput(path: string | undefined, io: Io): Promise<string> {
  return !path || path === "-" ? await io.stdin() : readFileSync(resolve(io.cwd, path), "utf8");
}

function cardLine(store: Store, card: Card): string {
  const m = card.meta;
  const status = store.status(m.id);
  const topic = m.topic ? ` [${m.topic}]` : "";
  return `${m.id}  ${status.padEnd(10)} ${m.level.padEnd(11)} ${m.title}${topic}  (${m.source_branch}, deck ${m.deck})`;
}

function verdictLine(v: Verdict): string {
  const what = v.choice ? `: ${v.choice}` : "";
  const why = v.comment ? ` — ${v.comment}` : "";
  return `${v.card} r${v.revision}  ${v.response}${what}${why}  (${v.reviewer}, ${v.at})`;
}

export function buildProgram(io: Io = defaultIo, state: RunState = { code: 0 }): Command {
  const program = new Command()
    .name("baesian")
    .description("Swipe review for agent decisions. Agents file cards; a person answers them in the client.")
    .option("--agent <name>", "who is filing (default: $BAESIAN_AGENT, or 'agent')")
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

  program
    .command("init")
    .description("set up the live layer (.git/baesian/), the record (.baesian/) and the AGENTS.md instructions")
    .option("--vault <path>", "an Obsidian vault for the vault adapter, relative to the repo root")
    .option("--no-agents", "don't write the instructions block in AGENTS.md")
    .option("--no-hooks", "don't install the git gate")
    .action((opts: { vault?: string; agents: boolean; hooks: boolean }) => {
      const s = store();
      const created = s.init(opts.vault ? { vault: opts.vault } : {});
      if (created.length) {
        io.out(`live layer:  ${relative(s.repo.toplevel, s.live)}/  (shared by every worktree, not committed)`);
        io.out(`record:      ${relative(s.repo.toplevel, s.record)}/  (commit this)`);
      } else {
        io.out("already set up");
      }
      if (opts.hooks) {
        const r = installHooks(s, io.hookFallback ?? selfCommand());
        const changed = Object.entries(r.files).filter(([, v]) => v !== "unchanged");
        const where = relative(s.repo.toplevel, r.dir) || r.dir;
        if (changed.length) io.out(`git gate:    ${changed.map(([k, v]) => `${k} ${v}`).join(", ")} in ${where}/`);
        if (r.setHooksPath) io.out("             core.hooksPath set to .githooks (each clone runs `baesian init` once)");
        if (!r.versioned) io.out(`note: ${where} isn't versioned, so other clones won't get the gate; CI still checks.`);
      }
      if (opts.agents) {
        const result = writeAgentsBlock(s.repo.toplevel);
        if (result !== "unchanged") io.out(`AGENTS.md:   instructions ${result}`);
        if (claudeMdMissesAgents(s.repo.toplevel)) {
          io.out("note: CLAUDE.md doesn't import AGENTS.md. Add a line `@AGENTS.md` so Claude Code reads the instructions.");
        }
      }
    });

  program
    .command("template")
    .description("print a card draft to fill in")
    .action(() => io.out(CARD_TEMPLATE.trimEnd()));

  program
    .command("topics")
    .description("list the topics in use, to reuse rather than invent near-duplicates")
    .action(() => {
      const topics = [...store().topics()].sort();
      io.out(topics.length ? topics.join("\n") : "no topics yet");
    });

  program
    .command("wait")
    .description("wait for the reviewer's verdict on a card; the exit code says what to do next")
    .argument("<id>", "the card")
    .option("--timeout <seconds>", "give up after this long", seconds, DEFAULT_TIMEOUT_MS / 1000)
    .option("--no-presence", "wait the full timeout even if the client says the reviewer is away")
    .option("--json", "print the outcome as JSON")
    .action(async (id: string, opts: { timeout: number; presence: boolean; json?: boolean }) => {
      const outcome = await waitForVerdict(store(), id, {
        agent: agentName(program.opts().agent),
        timeoutMs: opts.timeout * 1000,
        usePresence: opts.presence,
        ...io.waitClock,
      });
      if (opts.json) json(outcome);
      else for (const line of describeOutcome(outcome)) io.out(line);
      state.code = exitCodeFor(outcome);
    });

  program
    .command("file")
    .description("file a decision card from a Markdown file (or stdin)")
    .argument("[path]", "the card draft; '-' or omitted reads stdin")
    .option("--new", "file even if an open card or a resolved decision looks like the same decision")
    .option("--json", "print the filed card as JSON")
    .action(async (path: string | undefined, opts: { new?: boolean; json?: boolean }) => {
      const { meta, body } = parseDoc(await readInput(path, io));
      const result = store().fileCard(meta, body, { agent: agentName(program.opts().agent), force: opts.new ?? false });
      notify(result.card);
      if (opts.json) return json(result);
      const { id, level, deck } = result.card.meta;
      io.out(`filed ${id} (${level}, deck ${deck})`);
      if (result.hardBecause) io.out(`  level raised to hard by: ${result.hardBecause.join(", ")} (D42)`);
      if (result.nearTopics.length) io.out(`  new topic; did you mean: ${result.nearTopics.join(", ")}?`);
      if (level === "blocking") io.out(`  run \`baesian wait ${id}\` before building on it`);
      if (level === "hard") io.out(`  don't proceed with it until \`baesian wait ${id}\` exits 0`);
      io.out(`  add "Baesian-Card: ${id}" to commits that build on it`);
    });

  program
    .command("revise")
    .description("file the next revision of a returned card: your reply to the reviewer")
    .argument("<id>", "the card")
    .argument("[path]", "the revised card; '-' or omitted reads stdin")
    .action(async (id: string, path: string | undefined) => {
      const { meta, body } = parseDoc(await readInput(path, io));
      const result = store().reviseCard(id, meta, body, { agent: agentName(program.opts().agent) });
      notify(result.card);
      io.out(`filed ${id} r${result.card.meta.revision}`);
    });

  program
    .command("attach")
    .description("wait on an existing card instead of filing a duplicate")
    .argument("<id>", "the card")
    .action((id: string) => {
      const s = store();
      s.attach(id, agentName(program.opts().agent));
      io.out(`attached to ${id}; ${s.waiting(id)} agents are waiting on it`);
    });

  program
    .command("withdraw")
    .description("withdraw your own card")
    .argument("<id>", "the card")
    .requiredOption("--reason <text>", "why it's no longer needed")
    .action((id: string, opts: { reason: string }) => {
      store().withdraw(id, opts.reason, agentName(program.opts().agent));
      io.out(`withdrew ${id}`);
    });

  program
    .command("deck")
    .description("create a deck; its body is the briefing")
    .argument("<id>", "a lowercase slug, e.g. storage-layer")
    .requiredOption("--title <text>", "what the deck decides")
    .option("--from <path>", "use a document (a plan, design note, issue) as the briefing")
    .option("--note <wikilink...>", "vault notes that give context")
    .action((id: string, opts: { title: string; from?: string; note?: string[] }) => {
      const from = opts.from ? resolve(io.cwd, opts.from) : undefined;
      const body = from ? readFileSync(from, "utf8") : "";
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
    .action((opts: { all?: boolean; branch?: boolean; json?: boolean }) => {
      const s = store();
      const cards = (opts.branch ? s.branchCards() : s.cards()).filter(
        (c) => opts.all || PENDING.has(s.status(c.meta.id)),
      );
      if (opts.json) return json(cards.map((c) => ({ ...c.meta, status: s.status(c.meta.id) })));
      if (!cards.length) return io.out(opts.all ? "no cards" : "nothing waiting on the reviewer");
      for (const c of cards) io.out(cardLine(s, c));
    });

  program
    .command("show")
    .description("show a card, its status and its verdicts")
    .argument("<id>", "the card")
    .option("--json", "print as JSON")
    .action((id: string, opts: { json?: boolean }) => {
      const s = store();
      const card = s.card(id);
      if (!card) throw new Error(`no card ${id}`);
      const verdicts = s.verdicts(id);
      if (opts.json) return json({ ...card, status: s.status(id), decision: s.decision(id), verdicts });
      io.out(cardLine(s, card));
      const decision = s.decision(id);
      if (decision) io.out(`decided: ${decision}`);
      io.out("");
      io.out(card.body.trimEnd());
      if (verdicts.length) {
        io.out("\nverdicts:");
        for (const v of verdicts) io.out(`  ${verdictLine(v)}`);
      }
    });

  program
    .command("inbox")
    .description("verdicts on this branch's cards since you last looked")
    .option("--peek", "don't mark them as seen")
    .option("--json", "print as JSON")
    .action((opts: { peek?: boolean; json?: boolean }) => {
      const verdicts = store().inbox({ advance: !opts.peek });
      if (opts.json) return json(verdicts);
      if (!verdicts.length) return io.out("no new verdicts");
      for (const v of verdicts) io.out(verdictLine(v));
    });

  program
    .command("sync")
    .description("copy new verdicts and ledger entries into this branch's record (.baesian/)")
    .action(() => {
      const added = store().syncRecord();
      io.out(added.length ? `added to the record:\n${added.map((p) => `  ${p}`).join("\n")}` : "record is up to date");
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
      if (opts.json) return json(report);
      if (!report.facts.length && report.ok) return io.out("no decisions detected in the staged changes");
      for (const line of describeReport(report)) io.out(line.replace("commit blocked.", "this commit would be blocked."));
      state.code = report.ok ? 0 : 1;
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
      io.err("This decision may already be on file:");
      for (const m of e.matches) {
        io.err(`  ${m.card.meta.id}  ${m.status}  ${m.card.meta.title}  (same ${m.by})`);
      }
      io.err("Attach to an open card (`baesian attach <id>`), follow a resolved one,");
      io.err("or file anyway with --new, setting `supersedes:` if you are arguing against a decision.");
      return EXIT_POSSIBLE_DUPLICATE;
    }
    io.err(e instanceof ValidationError || e instanceof Error ? e.message : String(e));
    return 1;
  }
}
