import { spawn } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { relative, resolve } from "node:path";
import { Command, CommanderError, InvalidArgumentError } from "commander";
import { CARD_TEMPLATE, agentName, claudeMdMissesAgents, writeAgentsBlock } from "./agents.js";
import { stagedSnapshot } from "./facts.js";
import { parseDoc } from "./frontmatter.js";
import { describeReport, detectStaged, evaluate } from "./gate.js";
import { installHooks, runHook } from "./hooks.js";
import { notifyFiled } from "./notify.js";
import { openRepo } from "./git.js";
import { parseTrailers } from "./trailers.js";
import { findRunningServer, serverUrl, startServer } from "./server.js";
import { describeVerify, fileConflicts, verify } from "./verify.js";
import type { Verdict } from "./schema.js";
import { type Card, PENDING, PossibleDuplicate, Store, ValidationError } from "./store.js";
import { DEFAULT_TIMEOUT_MS, SLICE_MS, type WaitOptions, describeBrief, describeOutcome, exitCodeFor, replyHint, ruleHint, waitForVerdict } from "./wait.js";

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

function cardLine(store: Store, card: Card): string {
  const m = card.meta;
  const status = store.status(m.id);
  const topic = m.topic ? ` [${m.topic}]` : "";
  return `${m.id}  ${status.padEnd(10)} ${m.level.padEnd(11)} ${m.title}${topic}  (${m.source_branch}, deck ${m.deck})`;
}

/** The card itself, as the client shows it: the question, the two options and the crux. */
function cardDetails(m: Card["meta"]): string[] {
  const undo = { cheap: "easy", moderate: "costly", "one-way": "hard" }[m.reverse];
  const out = [m.question, `  ${m.source_agent} is ${m.doing}.`, `  stakes: ${undo} to undo${m.touches.length ? `; touches ${m.touches.join(", ")}` : ""}`, ""];
  out.push(`  it turns on: ${m.crux}${m.crux_preference ? " (a preference)" : ""}`);
  if (m.crux_fact) out.push(`  fact: ${m.crux_fact}`);
  out.push(`  ${m.crux_proposal} → ${m.proposal} (the agent's pick): then ${m.proposal_then}`);
  out.push(`  ${m.crux_alternative} → ${m.alternative}: then ${m.alternative_then}`);
  if (m.premise) out.push(`  unverified: "${m[m.premise_option!]}" ${m.premise} (check: ${m.premise_check})`);
  if (m.acted) out.push(`  already built, for "${m[m.acted_option!]}": ${m.acted}`);
  const why = [m.rationale, m.wrong_if ? `Wrong if ${m.wrong_if} (check: ${m.check}).` : undefined].filter(Boolean);
  if (why.length) out.push(`  the agent's case: ${why.join(" ")}`);
  return out;
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
    .option("--timeout <seconds>", "how long to wait in all, across runs, before falling back", seconds, DEFAULT_TIMEOUT_MS / 1000)
    .option("--slice <seconds>", "how long this run lasts before it exits 7 to be run again (D101)", seconds, SLICE_MS / 1000)
    .option("--no-presence", "wait the full timeout even if the client says the reviewer is away")
    .option("--json", "print the outcome as JSON")
    .action(async (id: string, opts: { timeout: number; slice: number; presence: boolean; json?: boolean }) => {
      const outcome = await waitForVerdict(store(), id, {
        agent: agentName(program.opts().agent),
        timeoutMs: opts.timeout * 1000,
        sliceMs: opts.slice * 1000,
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
      for (const w of result.warnings) io.out(`  note: ${w}`);
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
      for (const w of result.warnings) io.out(`  note: ${w}`);
    });

  program
    .command("reply")
    .description("reply once to an answer that went against your pick: a fact the reviewer lacked, or a check (D89)")
    .argument("<id>", "the card")
    .argument("<text>", "the fact or the check, in a line; not your pick again")
    .action((id: string, text: string) => {
      const card = store().replyToCard(id, text, { agent: agentName(program.opts().agent) });
      notify(card);
      io.out(`filed ${id} r${card.meta.revision}: your reply goes to the reviewer, and the card is open again`);
      io.out(
        card.meta.level === "hard"
          ? `  it's hard: don't commit work that cites it until \`baesian wait ${id}\` exits 0`
          : "  until they answer again, proceed with their decision; `baesian inbox` brings the new answer",
      );
    });

  program
    .command("rule")
    .description("draft the rule the reviewer asked for on a decision; it goes to them as a card (D16, D110)")
    .argument("<id>", "the decision")
    .argument("<text>", "the rule, in a line")
    .option("--covers <patterns...>", "the gate facts it answers, as gate reports name them: dep:pytest-*, schema:migrations/*")
    .action((id: string, text: string, opts: { covers?: string[] }) => {
      const card = store().draftRule(id, text, opts.covers ?? [], { agent: agentName(program.opts().agent) });
      notify(card);
      io.out(`filed ${card.meta.id}: the rule goes to the reviewer as a card, and is saved once they accept it`);
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
      for (const line of cardDetails(card.meta)) io.out(line);
      for (const w of s.waitingOn(id)) io.out(`  ${w.marker.agent} ${w.stale ? `stopped waiting (last seen ${w.marker.at})` : `is waiting, since ${w.marker.since}`}`);
      for (const b of s.briefs(id)) for (const line of describeBrief(b)) io.out(line);
      if (card.body.trim()) io.out(`\n${card.body.trimEnd()}`);
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
      const s = store();
      const items = s.inbox({ advance: !opts.peek });
      if (opts.json) return json(items);
      if (!items.length) return io.out("no new verdicts");
      for (const item of items) {
        // A dependent returned by its parent's verdict (D80) is listed under its own ID.
        io.out(item.verdict.card === item.card ? verdictLine(item.verdict) : `${item.card}  returned, by a verdict on ${item.verdict.card}`);
        if (item.brief) for (const line of describeBrief(item.brief)) io.out(line);
        // Only on the answer that's standing now: an earlier one, or one already replied to, takes no reply.
        const latest = s.card(item.card);
        const standing = item.verdict.card === item.card && latest !== undefined && item.verdict.revision === latest.meta.revision;
        if (standing && item.verdict.make_rule && s.ruleAsked(item.card)) for (const line of ruleHint(item.card)) io.out(`  ${line}`);
        if (standing && s.canReply(item.card)) for (const line of replyHint(item.card)) io.out(`  ${line}`);
      }
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
    .description("copy new verdicts and ledger entries into this branch's record (.baesian/)")
    .action(() => {
      const added = store().syncRecord();
      io.out(added.length ? `added to the record:\n${added.map((p) => `  ${p}`).join("\n")}` : "record is up to date");
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
