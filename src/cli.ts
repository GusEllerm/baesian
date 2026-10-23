import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { Command, CommanderError } from "commander";
import { parseDoc } from "./frontmatter.js";
import type { Verdict } from "./schema.js";
import { type Card, PENDING, PossibleDuplicate, Store, ValidationError } from "./store.js";

/** Exit code when a card may duplicate an open card or a resolved decision. */
export const EXIT_POSSIBLE_DUPLICATE = 3;

interface Io {
  out: (line: string) => void;
  err: (line: string) => void;
  stdin: () => string;
  cwd: string;
}

const defaultIo: Io = {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
  stdin: () => readFileSync(0, "utf8"),
  cwd: process.cwd(),
};

function agentName(opt: string | undefined): string {
  return opt ?? process.env.BAESIAN_AGENT ?? "agent";
}

function readInput(path: string | undefined, io: Io): string {
  return !path || path === "-" ? io.stdin() : readFileSync(resolve(io.cwd, path), "utf8");
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

export function buildProgram(io: Io = defaultIo): Command {
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

  program
    .command("init")
    .description("set up the live layer (.git/baesian/) and the record (.baesian/) in this repository")
    .option("--vault <path>", "an Obsidian vault for the vault adapter, relative to the repo root")
    .action((opts: { vault?: string }) => {
      const s = store();
      const created = s.init(opts.vault ? { vault: opts.vault } : {});
      if (!created.length) return io.out("already set up");
      io.out(`live layer:  ${relative(s.repo.toplevel, s.live)}/  (shared by every worktree, not committed)`);
      io.out(`record:      ${relative(s.repo.toplevel, s.record)}/  (commit this)`);
    });

  program
    .command("file")
    .description("file a decision card from a Markdown file (or stdin)")
    .argument("[path]", "the card draft; '-' or omitted reads stdin")
    .option("--new", "file even if an open card or a resolved decision looks like the same decision")
    .option("--json", "print the filed card as JSON")
    .action((path: string | undefined, opts: { new?: boolean; json?: boolean }) => {
      const { meta, body } = parseDoc(readInput(path, io));
      const result = store().fileCard(meta, body, { agent: agentName(program.opts().agent), force: opts.new ?? false });
      if (opts.json) return json(result);
      io.out(`filed ${result.card.meta.id} (${result.card.meta.level}, deck ${result.card.meta.deck})`);
      if (result.hardBecause) io.out(`  level raised to hard by: ${result.hardBecause.join(", ")} (D42)`);
      if (result.nearTopics.length) io.out(`  new topic; did you mean: ${result.nearTopics.join(", ")}?`);
      io.out(`  add "Baesian-Card: ${result.card.meta.id}" to commits that build on it`);
    });

  program
    .command("revise")
    .description("file the next revision of a returned card: your reply to the reviewer")
    .argument("<id>", "the card")
    .argument("[path]", "the revised card; '-' or omitted reads stdin")
    .action((id: string, path: string | undefined) => {
      const { meta, body } = parseDoc(readInput(path, io));
      const result = store().reviseCard(id, meta, body, { agent: agentName(program.opts().agent) });
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

  return program;
}

export async function main(argv: string[] = process.argv, io: Io = defaultIo): Promise<number> {
  try {
    await buildProgram(io).parseAsync(argv);
    return 0;
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
