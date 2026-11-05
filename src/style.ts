import * as util from "node:util";
import { type Step, segments, unmark } from "./cite.js";

// What the command line prints, written once and rendered twice (B-eyrt5). Every command builds its output from six
// patterns: a headline saying what happened, with the card's ID (`head`); aligned `label:` fields (`fields`); rows with a
// header (`table`); `next: <command>  # why` lines, the command first so the line pastes (`next`); `note:` and
// `warning:` lines; and errors, a headline and a next step (`failure`). Plain text is the contract: what agents, the
// MCP server and the plugin's hooks read, never wrapped and never styled, one item a line. A terminal gets the same words
// styled (`render` with a terminal's `Render`): the 16 standard colours by role (B-qszqr), a symbol before each headline
// (B-t3tev), and prose wrapped at the terminal's width. Whether a stream is a terminal that gets them is decided here
// (`renderFor`), never by Node: `util.styleText` only paints. Citations of Baesian's own decisions are marked where
// they're written (src/cite.ts) and printed only with `--verbose` (B-728jd).

/** What a piece of text is, which a terminal shows by colour or weight. */
export type Role = "ok" | "attention" | "failure" | "hard" | "command" | "id" | "strong" | "dim";

/** A headline's outcome, which a terminal shows as a symbol: done, blocked or failed, needs attention, a next step. */
export type Mark = "done" | "failed" | "attention" | "next";

/** A piece of a line: prose (which wraps at its spaces on a terminal), or text with a role, a command, or a literal. */
export type Piece = string | Styled | Code | Literal | Hang | readonly Piece[];

export interface Styled {
  readonly role: Role;
  readonly text: readonly Piece[];
}

/** A command. In prose (`alone` unset) it's in backticks in plain text, and never broken; alone, it's the line's own. */
export interface Code {
  readonly code: string;
  readonly alone?: boolean;
}

/** Text that is never broken or styled: a trailer at the end of a line, so it copies whole. */
export interface Literal {
  readonly literal: string;
}

/** Where a wrapped line hangs, on a terminal. */
export interface Hang {
  readonly hang: true;
}

export type Kind = "head" | "next" | "note" | "warning" | "text" | "literal" | "trailer" | "blank";

/** One line of output. */
export interface Line {
  readonly kind: Kind;
  readonly indent: number;
  readonly mark?: Mark;
  readonly pieces: readonly Piece[];
}

// ---------------------------------------------------------------- pieces

const role =
  (r: Role) =>
  (...text: Piece[]): Styled => ({ role: r, text });
export const ok = role("ok");
export const attention = role("attention");
export const failure = role("failure");
export const hard = role("hard");
export const strong = role("strong");
export const dim = role("dim");
/** A card's ID, a rule's, a commit's: bold on a terminal. */
export const id = role("id");
/** A command in prose: `baesian init`. */
export const cmd = (code: string): Code => ({ code });
/** Text that never breaks and is never styled. */
export const lit = (literal: string): Literal => ({ literal });
export const HANG: Hang = { hang: true };

/** A level, coloured as the client colours its stakes: hard in magenta. */
export const level = (l: string): Piece => (l === "hard" ? hard(l) : l);

/** A card's status, coloured by what it asks of the agent. */
export function status(s: string): Piece {
  if (s === "resolved") return ok(s);
  if (s === "returned" || s === "deferred") return attention(s);
  if (s === "withdrawn" || s === "superseded" || s === "held") return dim(s);
  return s;
}

// ---------------------------------------------------------------- lines

const line = (kind: Kind, indent: number, pieces: readonly Piece[], mark?: Mark): Line => ({ kind, indent, pieces, ...(mark ? { mark } : {}) });

/** A headline: what happened. `mark` is its symbol on a terminal; plain text has none. */
export const head = (mark: Mark | undefined, ...pieces: Piece[]): Line => line("head", 0, pieces, mark);
/** An error's headline. */
export const failed = (...pieces: Piece[]): Line => head("failed", ...pieces);
/** Prose, or anything else: wraps on a terminal, under where it starts. */
export const text = (...pieces: Piece[]): Line => line("text", 0, pieces);
/** A next step: the command first, so the line pastes, and why as a shell comment. */
export const next = (command: string, why?: string): Line => line("next", 0, [{ code: command, alone: true }, ...(why ? ["  ", dim(`# ${why}`)] : [])]);
/** A next step in words, when it isn't one command. */
export const nextSay = (...pieces: Piece[]): Line => line("next", 0, pieces);
export const note = (...pieces: Piece[]): Line => line("note", 0, pieces);
export const warning = (...pieces: Piece[]): Line => line("warning", 0, pieces);
/** A line to copy as it is (JSON, YAML, a command): never wrapped or styled. */
export const literal = (text: string): Line => line("literal", 0, [lit(text)]);
/** A trailer to paste into a commit message: at the start of its line, never wrapped, styled or prefixed. */
export const trailer = (text: string): Line => line("trailer", 0, [lit(text)]);
export const blank: Line = line("blank", 0, []);

/** Lines indented by `n` more. Trailers stay where they are, so they paste. */
export function indent(n: number, line: Line): Line;
export function indent(n: number, lines: readonly Line[]): Line[];
export function indent(n: number, lines: Line | readonly Line[]): Line | Line[] {
  const one = (l: Line): Line => (l.kind === "trailer" || l.kind === "blank" ? l : { ...l, indent: l.indent + n });
  return Array.isArray(lines) ? (lines as readonly Line[]).map(one) : one(lines as Line);
}

/** A field: `label:`, its value, and an explanation that recedes. */
export interface Field {
  label: string;
  value?: Piece;
  why?: Piece;
}

/** Fields under a headline: labels padded to the longest, values to the longest that has an explanation after it. */
export function fields(rows: readonly (Field | undefined | false)[], at = 2): Line[] {
  const rs = rows.filter((r): r is Field => Boolean(r));
  if (!rs.length) return [];
  const labelWidth = Math.max(...rs.map((r) => r.label.length + 1)) + 2;
  const both = rs.filter((r) => r.value !== undefined && r.why !== undefined);
  const valueWidth = both.length ? Math.max(...both.map((r) => width(r.value!))) + 2 : 0;
  return rs.map((r) => {
    const pieces: Piece[] = [strong(`${r.label}:`), " ".repeat(labelWidth - r.label.length - 1)];
    if (r.value !== undefined && r.why !== undefined) pieces.push(r.value, " ".repeat(valueWidth - width(r.value)), HANG, dim(r.why));
    else if (r.value !== undefined) pieces.push(HANG, r.value);
    else if (r.why !== undefined) pieces.push(HANG, dim(r.why));
    return line("text", at, pieces);
  });
}

/** Rows with a header: each column padded to its widest, two spaces between, the last left as it is. */
export function table(header: readonly string[] | undefined, rows: readonly (readonly Piece[])[], at = 2): Line[] {
  const all: (readonly Piece[])[] = header ? [header.map((h) => dim(h)), ...rows] : [...rows];
  if (!all.length) return [];
  const n = Math.max(...all.map((r) => r.length));
  const widths = Array.from({ length: n }, (_, c) => Math.max(...all.map((r) => (c < r.length - 1 ? width(r[c]!) : 0))));
  return all.map((r) =>
    line(
      "text",
      at,
      r.flatMap((cell, c) => (c === r.length - 1 ? [HANG, cell] : [cell, " ".repeat(widths[c]! - width(cell) + 2)])),
    ),
  );
}

// ---------------------------------------------------------------- rendering

/** How a stream gets its output: plain (`PLAIN`), or as a terminal shows it. */
export interface Render {
  /** Paint roles in colour. */
  color: boolean;
  /** A terminal's symbols before headlines (and → for `next:`); none in plain text. */
  symbols?: "unicode" | "ascii";
  /** Wrap prose at this width; plain text never wraps. */
  width?: number;
  /** Print citations of Baesian's own decisions (`--verbose`). */
  verbose: boolean;
  /** Before every line but a trailer: the hooks' `baesian: `. */
  prefix?: string;
}

export const PLAIN: Render = { color: false, verbose: false };

const SYMBOLS: Record<"unicode" | "ascii", Record<Mark, string>> = {
  unicode: { done: "✓", failed: "✗", attention: "!", next: "→" },
  ascii: { done: "ok", failed: "x", attention: "!", next: "->" },
};
const MARK_STYLE: Record<Mark, Style> = { done: { fg: "green" }, failed: { fg: "red" }, attention: { fg: "yellow", bold: true }, next: { dim: true } };

type Colour = "green" | "yellow" | "red" | "magenta" | "cyan";
interface Style {
  fg?: Colour;
  bold?: boolean;
  dim?: boolean;
}
const ROLE_STYLE: Record<Role, Style> = {
  ok: { fg: "green" },
  attention: { fg: "yellow" },
  failure: { fg: "red" },
  hard: { fg: "magenta" },
  command: { fg: "cyan" },
  id: { bold: true },
  strong: { bold: true },
  dim: { dim: true },
};
const merge = (a: Style, b: Style): Style => ({ ...a, ...b, bold: Boolean(a.bold || b.bold), dim: Boolean(a.dim || b.dim) });

/** Control characters made visible, so nothing printed can carry a terminal's escape codes. Newlines stay. */
const sanitize = (s: string): string => s.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

/** A piece as plain text reads it, without citations: for measuring columns. */
function plainPiece(p: Piece, verbose = false): string {
  if (typeof p === "string") return sanitize(unmark(p, verbose));
  if (Array.isArray(p)) return (p as readonly Piece[]).map((x) => plainPiece(x, verbose)).join("");
  if ("role" in p) return p.text.map((x) => plainPiece(x, verbose)).join("");
  if ("code" in p) return p.alone ? sanitize(p.code) : `\`${sanitize(p.code)}\``;
  if ("literal" in p) return sanitize(unmark(p.literal, verbose));
  return "";
}

/** How wide a piece is in plain text. */
export const width = (p: Piece): number => plainPiece(p).length;

/** One character on a terminal: its style, and whether a line may break at it (a space). */
interface Cell {
  ch: string;
  style: Style;
  /** 1: prose may break here; 2: a command may, with a continuation (before a flag or `&&`). */
  brk?: 1 | 2;
}

const PLAIN_PREFIX: Partial<Record<Kind, string>> = { next: "next: ", note: "note: ", warning: "warning: " };

/** A line's cells, and where it hangs when it wraps. */
function cellsOf(l: Line, how: Render): { cells: Cell[]; hang: number | undefined } {
  const cells: Cell[] = [];
  let hang: number | undefined;
  const push = (s: string, style: Style, brk?: 1) => {
    for (const ch of s) cells.push(ch === " " && brk ? { ch, style, brk } : { ch, style });
  };
  for (let i = 0; i < l.indent; i++) cells.push({ ch: " ", style: {} });
  const styled = how.symbols !== undefined;
  const base: Style = l.kind === "note" ? { dim: true } : {};
  if (styled && l.kind === "head" && l.mark) {
    push(SYMBOLS[how.symbols!][l.mark], MARK_STYLE[l.mark]);
    push(" ", {});
  } else if (styled && l.kind === "next") {
    push(SYMBOLS[how.symbols!].next, MARK_STYLE.next);
    push(" ", {});
  } else if (styled && l.kind === "warning") {
    push(SYMBOLS[how.symbols!].attention, MARK_STYLE.attention);
    push(" ", {});
    push("warning: ", { fg: "yellow" });
  } else if (PLAIN_PREFIX[l.kind]) push(PLAIN_PREFIX[l.kind]!, base);
  const lead = cells.length;
  const walk = (p: Piece, style: Style) => {
    if (typeof p === "string") {
      for (const seg of segments(p)) {
        if (seg.cite && !how.verbose) continue;
        push(sanitize(seg.text), seg.cite ? merge(style, { dim: true }) : style, 1);
      }
    } else if (Array.isArray(p)) for (const x of p as readonly Piece[]) walk(x, style);
    else if ("role" in p) for (const x of p.text) walk(x, styled ? merge(style, ROLE_STYLE[p.role]) : style);
    else if ("code" in p) {
      const code = sanitize(p.code);
      const s = styled ? merge(style, ROLE_STYLE.command) : style;
      if (!p.alone) {
        // In plain text a command in prose is in backticks; on a terminal its colour marks it instead.
        push(styled ? code : `\`${code}\``, s);
        return;
      }
      // A command alone may break only before a flag or `&&`, outside quotes, with a continuation.
      let quote: string | undefined;
      for (let i = 0; i < code.length; i++) {
        const ch = code[i]!;
        if (quote) {
          if (ch === quote) quote = undefined;
        } else if (ch === '"' || ch === "'") quote = ch;
        const before = ch === " " && !quote && (code[i + 1] === "-" || code.startsWith("&&", i + 1));
        cells.push(before ? { ch, style: s, brk: 2 } : { ch, style: s });
      }
    } else if ("literal" in p) push(sanitize(unmark(p.literal, how.verbose)), {});
    else hang = cells.length;
  };
  for (const p of l.pieces) walk(p, base);
  if (hang === undefined && (l.kind === "head" || l.kind === "next" || l.kind === "warning" || l.kind === "note")) hang = lead;
  return { cells, hang: hang ?? (l.kind === "text" ? l.indent : undefined) };
}

/** Wrap at `width`: prose at its spaces, under its hang; a command only before a flag or `&&`, with a `\`. */
function wrap(cells: Cell[], hangAt: number | undefined, width: number | undefined): Cell[][] {
  const out: Cell[][] = [];
  const pad = (n: number): Cell[] => Array.from({ length: n }, () => ({ ch: " ", style: {} }));
  const trimEnd = (c: Cell[]) => {
    while (c.length && c.at(-1)!.ch === " ") c.pop();
    return c;
  };
  const trimStart = (c: Cell[]) => {
    let i = 0;
    while (i < c.length && c[i]!.ch === " ") i++;
    return c.slice(i);
  };
  let hang = hangAt ?? 0;
  if (width !== undefined && hang > width * 0.6) hang = Math.min(4, hang);
  let rest = cells;
  let start = cells.findIndex((c) => c.ch !== " ") + 1;
  for (;;) {
    const nl = rest.findIndex((c) => c.ch === "\n");
    const stop = nl < 0 ? rest.length : nl;
    // A newline in a text (an error from elsewhere) starts a line as it is; plain text breaks nowhere else.
    const newline = () => {
      out.push(trimEnd(rest.slice(0, nl)));
      rest = rest.slice(nl + 1);
      start = 1;
    };
    if (width === undefined || stop <= width) {
      if (nl < 0) {
        out.push(rest);
        return out;
      }
      newline();
      continue;
    }
    let bp = -1;
    let cont = false;
    for (let k = Math.max(start, 1); k < Math.min(stop, width + 1); k++) {
      const c = rest[k]!;
      if (c.brk === 1) [bp, cont] = [k, false];
      else if (c.brk === 2 && k + 2 <= width) [bp, cont] = [k, true];
    }
    // Nothing to break at before the edge: the token runs over it, and the line breaks at the first place after.
    if (bp < 0) {
      for (let k = Math.max(start, 1); k < stop; k++) {
        if (rest[k]!.brk) {
          [bp, cont] = [k, rest[k]!.brk === 2];
          break;
        }
      }
    }
    if (bp < 0) {
      if (nl < 0) {
        out.push(rest);
        return out;
      }
      newline();
      continue;
    }
    const first = trimEnd(rest.slice(0, bp));
    if (cont) first.push({ ch: " ", style: {} }, { ch: "\\", style: { fg: "cyan" } });
    out.push(first);
    const by = hang + (cont ? 2 : 0);
    rest = [...pad(by), ...trimStart(rest.slice(bp + 1))];
    start = by + 1;
  }
}

/** The SGR codes for a style, through `util.styleText`, which only paints: whether to is decided here. */
function paint(text: string, s: Style): string {
  const formats: string[] = [];
  if (s.fg) formats.push(s.fg);
  if (s.bold) formats.push("bold");
  if (s.dim) formats.push("dim");
  let out = text;
  for (const f of formats) out = styleText(f, out);
  return out;
}

const SGR: Record<string, [number, number]> = { green: [32, 39], yellow: [33, 39], red: [31, 39], magenta: [35, 39], cyan: [36, 39], bold: [1, 22], dim: [2, 22] };
/** `util.styleText`, told not to check a stream: Node's own check exists only from 22.8, and isn't ours to make. */
function styleText(format: string, text: string): string {
  const st = (util as { styleText?: (f: string, t: string, o?: { validateStream?: boolean }) => string }).styleText;
  if (typeof st === "function") return st(format, text, { validateStream: false });
  const [on, off] = SGR[format]!;
  return `\x1b[${on}m${text}\x1b[${off}m`;
}

function paintLine(cells: Cell[], color: boolean): string {
  if (!color) return cells.map((c) => c.ch).join("");
  let out = "";
  let run = "";
  let style: Style | undefined;
  const same = (a: Style, b: Style) => a.fg === b.fg && Boolean(a.bold) === Boolean(b.bold) && Boolean(a.dim) === Boolean(b.dim);
  const flush = () => {
    if (run) out += style && (style.fg || style.bold || style.dim) ? paint(run, style) : run;
    run = "";
  };
  for (const c of cells) {
    if (!style || !same(style, c.style)) {
      flush();
      style = c.style;
    }
    run += c.ch;
  }
  flush();
  return out;
}

/** Lines as a stream gets them: plain text, or as a terminal shows them. */
export function render(lines: readonly Line[], how: Render = PLAIN): string[] {
  const out: string[] = [];
  const prefix = how.prefix ?? "";
  const prefixCells: Cell[] = [...prefix].map((ch) => ({ ch, style: how.symbols ? { bold: true } : {} }));
  for (const l of lines) {
    if (l.kind === "trailer") {
      out.push(plainPiece(l.pieces, how.verbose));
      continue;
    }
    if (l.kind === "blank") {
      out.push(prefix.trimEnd());
      continue;
    }
    const { cells, hang } = cellsOf(l, how);
    const width = l.kind === "literal" || how.width === undefined ? undefined : Math.max(20, how.width - prefix.length);
    // Plain text never wraps; a newline in a text (an error from elsewhere) still starts a line, prefixed.
    for (const row of wrap(cells, hang, width)) out.push(paintLine([...prefixCells, ...row], how.color && how.symbols !== undefined));
  }
  return out;
}

/** Lines as plain text: what agents, the MCP server and the plugin read. */
export const plain = (lines: readonly Line[]): string[] => render(lines, PLAIN);

/** Plain text, one string. */
export const plainText = (lines: readonly Line[]): string => plain(lines).join("\n");

// ---------------------------------------------------------------- deciding (B-qszqr, B-t3tev)

/** What a stream says about itself: `process.stdout` and `process.stderr` are these. */
export interface Stream {
  isTTY?: boolean;
  columns?: number;
  hasColors?: () => boolean;
}

/** The global flags: `--color` (true), `--no-color` (false), `--verbose`. */
export interface Settings {
  color?: boolean;
  verbose?: boolean;
}

/**
 * The variables agents' harnesses set in the commands they run, any of which means an agent reads the output: Claude
 * Code (`CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, and `AI_AGENT`, which others set too), Codex (`CODEX_THREAD_ID`), Gemini
 * CLI (`GEMINI_CLI`), Cursor's agent (`CURSOR_AGENT`) and opencode (`OPENCODE`).
 */
export const HARNESS_VARS = ["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "AI_AGENT", "CODEX_THREAD_ID", "GEMINI_CLI", "CURSOR_AGENT", "OPENCODE"] as const;

/** The variable that says an agent's harness runs this command, if one does. */
export function harnessVar(env: NodeJS.ProcessEnv): string | undefined {
  return HARNESS_VARS.find((v) => Boolean(env[v]?.trim()));
}

/** Whether a terminal can show ✓ ✗ →: a UTF-8 locale, or Windows Terminal; not the Linux console, or a dumb terminal. */
export function unicodeTerminal(env: NodeJS.ProcessEnv, platform: string = process.platform): boolean {
  if (env.TERM === "dumb" || env.TERM === "linux") return false;
  if (platform === "win32") return Boolean(env.WT_SESSION || env.TERM_PROGRAM === "vscode" || env.ConEmuANSI === "ON");
  const locale = env.LC_ALL || env.LC_CTYPE || env.LANG || "";
  return /utf-?8/i.test(locale);
}

/** The widest a terminal's lines get, however wide it is. */
export const MAX_WIDTH = 100;

/**
 * How a stream gets its output (B-qszqr). `--color` and `--no-color` decide it, whatever else is set: `--no-color` gives
 * exactly what an agent reads. Otherwise an agent's harness gets plain text, even in a pseudo-terminal. A terminal gets
 * symbols and wrapping, and colour unless `NO_COLOR` is set (even with `FORCE_COLOR`) or it has none (`TERM=dumb`).
 * `FORCE_COLOR` gives colour and symbols through a pipe too, unless `NO_COLOR` is set; `FORCE_COLOR=0` turns colour off.
 */
export function renderFor(stream: Stream | undefined, env: NodeJS.ProcessEnv, settings: Settings = {}, platform: string = process.platform): Render {
  const verbose = settings.verbose ?? false;
  const tty = Boolean(stream?.isTTY);
  const noColor = Boolean(env.NO_COLOR);
  const force = env.FORCE_COLOR === undefined ? undefined : ["", "1", "2", "3", "true"].includes(env.FORCE_COLOR);
  let styled: boolean;
  let color: boolean;
  if (settings.color === true) [styled, color] = [true, true];
  else if (settings.color === false || harnessVar(env)) [styled, color] = [false, false];
  else {
    styled = tty || (force === true && !noColor);
    color = styled && !noColor && (force ?? (stream?.hasColors ? stream.hasColors() : env.TERM !== "dumb"));
  }
  if (!styled) return { color: false, verbose };
  const columns = tty && stream?.columns ? stream.columns : undefined;
  return { color, symbols: unicodeTerminal(env, platform) ? "unicode" : "ascii", verbose, ...(columns ? { width: Math.min(columns, MAX_WIDTH) } : {}) };
}

/** The global flags in an argument list, read before Commander parses it, so its own output follows them too. */
export function settingsOf(argv: readonly string[]): Settings {
  const out: Settings = {};
  for (const a of argv) {
    if (a === "--") break;
    if (a === "--color") out.color = true;
    else if (a === "--no-color") out.color = false;
    else if (a === "--verbose") out.verbose = true;
  }
  return out;
}

/** An error's lines, for the CLI and the MCP server: its headline (citations marked), then its next steps. */
export function errorLines(e: unknown): Line[] {
  if (e instanceof Error && "marked" in e && "steps" in e) {
    const told = e as Error & { marked: string; steps: readonly Step[] };
    const [first, ...more] = told.marked.split("\n");
    return [failed(first!), ...more.map((m) => text(m)), ...told.steps.map((s) => next(s.command, s.why))];
  }
  const message = e instanceof Error ? e.message : String(e);
  const [first, ...more] = message.split("\n");
  return [failed(first!), ...more.map((m) => text(m))];
}
