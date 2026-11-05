import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { Told, cite, citeIn, segments, unmark, unmarkJson } from "../src/cite.js";
import { main } from "../src/cli.js";
import {
  HARNESS_VARS,
  MAX_WIDTH,
  type Render,
  type Stream,
  cmd,
  failed,
  fields,
  head,
  id,
  literal,
  next,
  note,
  plain,
  render,
  renderFor,
  settingsOf,
  table,
  text,
  trailer,
  unicodeTerminal,
  warning,
} from "../src/style.js";
import { cleanup, draftFile, repo, sh } from "./helpers.js";

afterEach(cleanup);

// What the command line prints (B-eyrt5): one wording, plain for agents and styled for a terminal, with colour decided by
// the command line (B-qszqr), symbols on a terminal (B-t3tev), and citations only with --verbose (B-728jd).

const TTY: Stream = { isTTY: true, columns: 120, hasColors: () => true };
const PIPE: Stream = { isTTY: false };
const UTF8 = { LANG: "en_US.UTF-8" };
const ESC = "\x1b";
/** A terminal's symbols, and their fallbacks, which plain text never has. */
const SYMBOLS = /[✓✗→]|^(ok|x|!|->) /m;

async function cli(dir: string, args: string[], opts: { terminal?: Stream; env?: NodeJS.ProcessEnv; stdin?: string } = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const io = {
    out: (l: string) => out.push(l),
    err: (l: string) => err.push(l),
    stdin: () => opts.stdin ?? "",
    cwd: dir,
    notify: () => {},
    env: opts.env ?? {},
    ...(opts.terminal ? { terminal: { out: opts.terminal, err: opts.terminal } } : {}),
  };
  const code = await main(["node", "baesian", "--agent", "claude-code", ...args], io);
  return { code, out: out.join("\n"), err: err.join("\n") };
}

describe("when to colour (B-qszqr)", () => {
  it("gives a pipe plain text, and a terminal colour, symbols and its width, at most 100", () => {
    expect(renderFor(PIPE, {})).toEqual({ color: false, verbose: false });
    expect(renderFor(undefined, {})).toEqual({ color: false, verbose: false });
    expect(renderFor(TTY, UTF8)).toEqual({ color: true, symbols: "unicode", width: MAX_WIDTH, verbose: false });
    expect(renderFor({ ...TTY, columns: 72 }, UTF8)).toMatchObject({ width: 72 });
  });

  it("never colours for an agent's harness, even in a pseudo-terminal, and even with FORCE_COLOR", () => {
    for (const v of HARNESS_VARS) {
      expect(renderFor(TTY, { ...UTF8, [v]: "1" }), v).toEqual({ color: false, verbose: false });
      expect(renderFor(TTY, { ...UTF8, [v]: "1", FORCE_COLOR: "1" }), v).toEqual({ color: false, verbose: false });
    }
    expect(HARNESS_VARS).toEqual(expect.arrayContaining(["CLAUDECODE", "CODEX_THREAD_ID", "AI_AGENT"]));
    // Set but empty is not set.
    expect(renderFor(TTY, { ...UTF8, CLAUDECODE: "" })).toMatchObject({ color: true });
  });

  it("never colours under NO_COLOR, even with FORCE_COLOR; a terminal keeps its symbols and width", () => {
    expect(renderFor(TTY, { ...UTF8, NO_COLOR: "1" })).toEqual({ color: false, symbols: "unicode", width: MAX_WIDTH, verbose: false });
    expect(renderFor(TTY, { ...UTF8, NO_COLOR: "1", FORCE_COLOR: "1" })).toMatchObject({ color: false, symbols: "unicode" });
    expect(renderFor(PIPE, { NO_COLOR: "1", FORCE_COLOR: "1" })).toEqual({ color: false, verbose: false });
  });

  it("colours a pipe with FORCE_COLOR, but doesn't wrap it; FORCE_COLOR=0 turns colour off", () => {
    expect(renderFor(PIPE, { ...UTF8, FORCE_COLOR: "1" })).toEqual({ color: true, symbols: "unicode", verbose: false });
    expect(renderFor(PIPE, { ...UTF8, FORCE_COLOR: "" })).toMatchObject({ color: true });
    expect(renderFor(TTY, { ...UTF8, FORCE_COLOR: "0" })).toMatchObject({ color: false, symbols: "unicode" });
    expect(renderFor(PIPE, { FORCE_COLOR: "0" })).toEqual({ color: false, verbose: false });
  });

  it("follows --color and --no-color over everything else", () => {
    const all = { ...UTF8, CLAUDECODE: "1", NO_COLOR: "1" };
    expect(renderFor(PIPE, all, { color: true })).toEqual({ color: true, symbols: "unicode", verbose: false });
    expect(renderFor(TTY, UTF8, { color: false })).toEqual({ color: false, verbose: false });
    expect(renderFor(TTY, { ...UTF8, FORCE_COLOR: "1" }, { color: false })).toEqual({ color: false, verbose: false });
  });

  it("leaves a terminal with no colours uncoloured, and asks the stream, not Node's own check", () => {
    expect(renderFor({ ...TTY, hasColors: () => false }, UTF8)).toMatchObject({ color: false, symbols: "unicode" });
    expect(renderFor({ isTTY: true, columns: 80 }, { ...UTF8, TERM: "dumb" })).toMatchObject({ color: false, symbols: "ascii" });
    expect(renderFor({ isTTY: true, columns: 80 }, { ...UTF8, TERM: "xterm-256color" })).toMatchObject({ color: true });
  });

  it("reads the global flags before Commander, stopping at --", () => {
    expect(settingsOf(["list", "--no-color", "--verbose"])).toEqual({ color: false, verbose: true });
    expect(settingsOf(["--color", "list"])).toEqual({ color: true });
    expect(settingsOf(["reply", "B-aaaaa", "--", "--verbose"])).toEqual({});
  });
});

describe("symbols (B-t3tev)", () => {
  it("shows ✓ ✗ ! → where the locale is UTF-8, and ok x ! -> where it isn't", () => {
    expect(unicodeTerminal({ LANG: "en_US.UTF-8" }, "darwin")).toBe(true);
    expect(unicodeTerminal({ LC_ALL: "C", LANG: "en_US.UTF-8" }, "linux")).toBe(false);
    expect(unicodeTerminal({ LC_CTYPE: "de_DE.utf8" }, "linux")).toBe(true);
    expect(unicodeTerminal({}, "linux")).toBe(false);
    expect(unicodeTerminal({ LANG: "en_US.UTF-8", TERM: "linux" }, "linux")).toBe(false);
    expect(unicodeTerminal({ WT_SESSION: "x" }, "win32")).toBe(true);
    expect(unicodeTerminal({}, "win32")).toBe(false);
    const lines = [head("done", "filed ", id("B-aaaaa")), failed("not filed"), head("attention", "returned"), head("next", "again"), next("baesian wait B-aaaaa")];
    const styled: Render = { color: false, symbols: "unicode", verbose: false };
    expect(render(lines, styled)).toEqual(["✓ filed B-aaaaa", "✗ not filed", "! returned", "→ again", "→ baesian wait B-aaaaa"]);
    expect(render(lines, { ...styled, symbols: "ascii" })).toEqual(["ok filed B-aaaaa", "x not filed", "! returned", "-> again", "-> baesian wait B-aaaaa"]);
    // Plain text, what agents read, has neither: the words carry it.
    expect(plain(lines)).toEqual(["filed B-aaaaa", "not filed", "returned", "again", "next: baesian wait B-aaaaa"]);
  });

  it("paints by role in the 16 standard colours, through util.styleText, whatever the stream", () => {
    const how: Render = { color: true, symbols: "unicode", verbose: false };
    const [line] = render([head("done", "filed ", id("B-aaaaa"))], how);
    expect(line).toBe(`${ESC}[32m✓${ESC}[39m filed ${ESC}[1mB-aaaaa${ESC}[22m`);
    expect(render([failed("x")], how)[0]).toContain(`${ESC}[31m✗`);
    expect(render([next("baesian init", "why")], how)[0]).toBe(`${ESC}[2m→${ESC}[22m ${ESC}[36mbaesian init${ESC}[39m  ${ESC}[2m# why${ESC}[22m`);
    expect(render([warning("careful")], how)[0]).toBe(`${ESC}[1m${ESC}[33m!${ESC}[39m${ESC}[22m ${ESC}[33mwarning: ${ESC}[39mcareful`);
    // A trailer is never styled, so it pastes.
    expect(render([trailer("Baesian-Card: B-aaaaa")], how)).toEqual(["Baesian-Card: B-aaaaa"]);
  });
});

describe("the six patterns (B-eyrt5)", () => {
  it("aligns fields, and the rows of a table, by what plain text shows", () => {
    expect(plain(fields([{ label: "live layer", value: ".git/baesian/", why: "never committed" }, { label: "preferences", value: "none yet", why: "the client suggests them" }, { label: "deck", value: "x" }]))).toEqual([
      "  live layer:   .git/baesian/  never committed",
      "  preferences:  none yet       the client suggests them",
      "  deck:         x",
    ]);
    expect(plain(table(["id", "status", "title"], [[id("B-aaaaa"), "resolved", '"A"'], [id("B-bbbbb"), "open", '"B"']]))).toEqual([
      "  id       status    title",
      "  B-aaaaa  resolved  \"A\"",
      "  B-bbbbb  open      \"B\"",
    ]);
  });

  it("writes a command in prose in backticks in plain text, and in colour without them on a terminal", () => {
    const line = text("run ", cmd("baesian init"), " once");
    expect(plain([line])).toEqual(["run `baesian init` once"]);
    expect(render([line], { color: false, symbols: "unicode", verbose: false })).toEqual(["run baesian init once"]);
  });

  it("prefixes a hook's every line alike, wrapped lines too, but a trailer", () => {
    const lines = [failed("commit blocked: 1 decision in it isn't covered by a card or an ack"), text("  Cover each one with a trailer, at the end of the message after a blank line"), trailer("Baesian-Ack: dep:x <why this is fine>")];
    expect(render(lines, { color: false, verbose: false, prefix: "baesian: " })).toEqual([
      "baesian: commit blocked: 1 decision in it isn't covered by a card or an ack",
      "baesian:   Cover each one with a trailer, at the end of the message after a blank line",
      "Baesian-Ack: dep:x <why this is fine>",
    ]);
    const wrapped = render(lines, { color: false, symbols: "unicode", width: 40, verbose: false, prefix: "baesian: " });
    for (const l of wrapped) expect(l.startsWith("baesian: ") || l.startsWith("Baesian-Ack:"), l).toBe(true);
    expect(wrapped.length).toBeGreaterThan(3);
  });

  it("keeps text others wrote from carrying a terminal's escape codes", () => {
    const title = JSON.stringify(`Red ${ESC}[31mtitle`);
    const how: Render = { color: false, symbols: "unicode", verbose: false };
    expect(render([text(title)], how)[0]).not.toContain(ESC);
    // Quoted, a title is a JSON string, whose control characters are escaped; unquoted text is made visible too.
    expect(render([text(`a ${ESC}[2J subject`)], how)[0]).toBe("a \\u001b[2J subject");
    expect(plain([text(`a ${ESC}[2J subject`)])[0]).toBe("a \\u001b[2J subject");
  });
});

describe("width", () => {
  const at = (width: number): Render => ({ color: false, symbols: "unicode", width, verbose: false });

  it("wraps prose at the terminal's width, hanging under its column", () => {
    const lines = render([head("done", "set up Baesian in this repo, in shared mode, with every part in its place")], at(40));
    expect(lines).toEqual(["✓ set up Baesian in this repo, in shared", "  mode, with every part in its place"]);
    const f = render(fields([{ label: "git gate", value: ".githooks/", why: "pre-commit, commit-msg, post-commit, post-merge and post-rewrite" }]), at(50));
    expect(f).toEqual(["  git gate:  .githooks/  pre-commit, commit-msg,", "                         post-commit, post-merge", "                         and post-rewrite"]);
    for (const l of [...lines, ...f]) expect(l.length).toBeLessThanOrEqual(50);
  });

  it("breaks a command only before a flag or &&, with a continuation, and never inside quotes", () => {
    const lines = render([next('git add .baesian .githooks && git commit -m "Use Baesian in this repo" -m "Baesian-Ack: infra:x linked"')], at(50));
    expect(lines).toEqual(["→ git add .baesian .githooks && git commit \\", '    -m "Use Baesian in this repo" \\', '    -m "Baesian-Ack: infra:x linked"']);
    expect(render([next("git add .baesian .githooks && git commit")], at(30))).toEqual(["→ git add .baesian .githooks \\", "    && git commit"]);
    // A command in prose never breaks.
    const prose = render([text("then run ", cmd("baesian init --shared --vault docs/vault"), " in the repo")], at(30));
    expect(prose.some((l) => l.includes("baesian init --shared --vault docs/vault"))).toBe(true);
  });

  it("never breaks IDs, trailers, JSON or a long token: they run over the edge", () => {
    const json = '{"type":"service-key","format":1,"key":"svc-2026a","public_key":"MCowBQYDK2VwAyEAq3Jm0b9F7xW2pLc8Hn4ZtRk1YvE6uS0dGiTfA5oQhNc"}';
    expect(render([literal(json)], at(40))).toEqual([json]);
    expect(render([trailer("Baesian-Ack: schema:migrations/001_runs.sql <why this is fine>")], at(20))).toEqual(["Baesian-Ack: schema:migrations/001_runs.sql <why this is fine>"]);
    expect(render([text("see https://baesian.dev/projects/p-k3n8w2q7x9m4v6b1c5d0 now")], at(30))).toEqual(["see", "https://baesian.dev/projects/p-k3n8w2q7x9m4v6b1c5d0", "now"]);
  });

  it("never wraps plain text: one item, one line", () => {
    const long = "x ".repeat(200).trim();
    expect(plain([text(long)])).toEqual([long]);
    expect(render([text(long)], { color: true, symbols: "unicode", verbose: false })).toEqual([long]); // FORCE_COLOR through a pipe: no width
  });
});

describe("citations of Baesian's own decisions (B-728jd)", () => {
  it("are marked where they're written, and printed only with --verbose, where they were", () => {
    const said = `personal mode${cite("B-4rwyz")}: nothing is committed (personal mode${citeIn("B-4rwyz", "D42")})`;
    expect(unmark(said)).toBe("personal mode: nothing is committed (personal mode)");
    expect(unmark(said, true)).toBe("personal mode (B-4rwyz): nothing is committed (personal mode, B-4rwyz, D42)");
    expect(segments(said).filter((s) => s.cite).map((s) => s.text)).toEqual([" (B-4rwyz)", ", B-4rwyz, D42"]);
    // The user's own card IDs look the same, and are never touched.
    expect(unmark("B-4rwyz resolved (B-4rwyz)")).toBe("B-4rwyz resolved (B-4rwyz)");
    expect(plain([text(said)])).toEqual(["personal mode: nothing is committed (personal mode)"]);
    expect(render([text(said)], { color: false, verbose: true })).toEqual(["personal mode (B-4rwyz): nothing is committed (personal mode, B-4rwyz, D42)"]);
    expect(JSON.stringify({ why: said }, unmarkJson)).toBe('{"why":"personal mode: nothing is committed (personal mode)"}');
  });

  it("leave an error's message, which anything may print, and stay in what the CLI renders from it", () => {
    const e = new Told(`it can't${cite("D89")}`, [{ command: "baesian inbox", why: "the answers" }]);
    expect(e.message).toBe("it can't\nnext: baesian inbox  # the answers");
    expect(unmark(e.marked, true)).toBe("it can't (D89)");
  });

  it("come back with --verbose, in the command line's output and its help", async () => {
    const { dir } = repo();
    const hard = draftFile({ title: "Where the token lives", topic: "auth/token", touches: ["security"], reverse: "one-way", wrong_if: "a script reads it", check: "the scripts" });
    const quiet = await cli(dir, ["file"], { stdin: hard });
    expect(quiet.out).toContain("an agent can raise a card's level, never lower it\n");
    expect(quiet.out).not.toMatch(/\(D42|D144\)/);
    const id = /filed (B-\w{5})/.exec(quiet.out)![1]!;
    await cli(dir, ["withdraw", id, "--reason", "again"]);
    const verbose = await cli(dir, ["--verbose", "file", "--new"], { stdin: hard });
    expect(verbose.out).toContain("an agent can raise a card's level, never lower it (D42, D144)");
    const help = await cli(dir, ["--help"]);
    expect(help.out).not.toContain("(B-4rwyz)");
    expect(help.out).not.toContain("D102");
    expect((await cli(dir, ["--verbose", "init", "--help"])).out).toContain("(B-4rwyz)");
  });
});

describe("the command line", () => {
  it("prints its version", async () => {
    const { dir } = repo();
    const version = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version;
    expect(await cli(dir, ["--version"])).toEqual({ code: 0, out: version, err: "" });
    expect((await cli(dir, ["-V"])).out).toBe(version);
  });

  it("says a wrong flag in a line and where to get help, not the whole help", async () => {
    const { dir } = repo();
    expect(await cli(dir, ["list", "--bogus"])).toEqual({ code: 1, out: "", err: "unknown option '--bogus'\nnext: baesian list --help  # its options" });
    expect(await cli(dir, ["wiat"])).toEqual({ code: 1, out: "", err: "unknown command 'wiat' (did you mean wait?)\nnext: baesian --help  # the commands" });
    expect((await cli(dir, ["withdraw", "B-aaaaa"])).err).toBe("required option '--reason <text>' not specified\nnext: baesian withdraw --help  # its options");
  });

  it("groups its commands in its help", async () => {
    const { dir } = repo();
    const help = (await cli(dir, ["--help"])).out;
    expect(help).toMatch(/^Setting up:$/m);
    expect(help).toMatch(/^Filing and answers:$/m);
    expect(help).toMatch(/^The commit gate:$/m);
    expect(help.indexOf("  check ")).toBeGreaterThan(help.indexOf("The commit gate:"));
  });

  it("gives agents plain text, with no escape codes or symbols, through a pipe and in a harness's pseudo-terminal", async () => {
    const { dir, store } = repo();
    const agent = { ...UTF8, CLAUDECODE: "1" };
    const outputs: string[] = [];
    for (const opts of [{}, { terminal: TTY, env: agent }, { terminal: TTY, env: { ...UTF8 } }]) {
      const said = [
        await cli(dir, ["init"], opts),
        await cli(dir, ["file"], { ...opts, stdin: draftFile({ level: "blocking" }) }),
        await cli(dir, ["file"], { ...opts, stdin: draftFile({ title: "SQLite or Postgres?" }) }),
        await cli(dir, ["list", "--all"], opts),
        await cli(dir, ["check"], opts),
        await cli(dir, ["show", "B-zzzzz"], opts),
      ];
      outputs.push(said.map((r) => `${r.out}\n${r.err}`).join("\n"));
      for (const c of store.cards()) await cli(dir, ["withdraw", c.meta.id, "--reason", "again"]);
    }
    const [piped, harness, terminal] = outputs as [string, string, string];
    for (const o of [piped, harness]) {
      expect(o).not.toContain(ESC);
      expect(o).not.toMatch(SYMBOLS);
      expect(o).toContain("next: ");
    }
    // A person's terminal gets the same words, styled.
    expect(terminal).toContain(ESC);
    expect(terminal).toContain("✓");
    expect(terminal).toContain("→");
  });

  it("shows a person's terminal the same words, wrapped at its width", async () => {
    const { dir } = repo();
    sh(dir, "commit", "-q", "--allow-empty", "-m", "x");
    const narrow = await cli(dir, ["init", "--personal", "--no-hooks"], { terminal: { isTTY: true, columns: 60, hasColors: () => false }, env: UTF8 });
    expect(narrow.code, narrow.err).not.toBe(0); // shared already: an error, a headline then its next step
    const r = await cli(dir, ["file"], { terminal: { isTTY: true, columns: 60, hasColors: () => false }, env: UTF8, stdin: draftFile({ level: "blocking" }) });
    const lines = r.out.split("\n");
    expect(lines[0]).toMatch(/^✓ filed B-\w{5} "The run-metadata store"$/);
    for (const l of lines) if (!/^Baesian-|Baesian-Card: B-\w{5}$/.test(l)) expect(l.length, l).toBeLessThanOrEqual(60);
    expect(r.out).toMatch(/^→ baesian wait B-\w{5}  # before building on it$/m);
  });

  it("prints notes and warnings as their own lines", () => {
    expect(plain([note("a"), warning("b")])).toEqual(["note: a", "warning: b"]);
  });
});
