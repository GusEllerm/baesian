// Citations of Baesian's own decisions in what it prints (B-728jd): "(B-4rwyz)", "(D42, D144)". They're notes for
// whoever works on Baesian, and outside this repo they point nowhere, so ordinary output leaves them out and the global
// `--verbose` puts them back where they were. Each is marked where it's written, with `cite()` or `citeIn()`, never
// found by matching the finished text: a citation has the same shape as the user's own card IDs. The marks are two
// characters from Unicode's private use area, which nothing Baesian prints otherwise holds, around the citation and its
// punctuation; `unmark()` takes them out, with the citation or without it. Every place text leaves Baesian goes through
// it: the CLI's renderer (src/style.ts), `--json`, the MCP server, the local server's responses, and errors' messages
// (`Told`). No imports: the relay's store imports this too.

const OPEN = "";
const CLOSE = "";
const MARKED = /([^]*)/g;

/** A citation after a phrase: ` (B-4rwyz)`, or ` (D42, D144)`. Printed only with `--verbose`. */
export function cite(...ids: string[]): string {
  return `${OPEN} (${ids.join(", ")})${CLOSE}`;
}

/** A citation inside a parenthesis that says something else too: `(personal mode, B-4rwyz)`. */
export function citeIn(...ids: string[]): string {
  return `${OPEN}, ${ids.join(", ")}${CLOSE}`;
}

/** Text as it's printed: without its citations, or with them (`--verbose`), and never with their marks. */
export function unmark(text: string, verbose = false): string {
  return text.includes(OPEN) ? text.replace(MARKED, verbose ? "$1" : "") : text;
}

/** Whether a text has a citation in it. */
export const hasCitation = (text: string): boolean => text.includes(OPEN);

/** A text in pieces: what it says, and its citations, for a renderer that styles them. */
export function segments(text: string): { text: string; cite: boolean }[] {
  if (!text.includes(OPEN)) return [{ text, cite: false }];
  const out: { text: string; cite: boolean }[] = [];
  let at = 0;
  for (const m of text.matchAll(MARKED)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index), cite: false });
    out.push({ text: m[1]!, cite: true });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), cite: false });
  return out;
}

/** A JSON replacer that unmarks every string, for `--json` and the MCP server's structured content. */
export function unmarkJson(_key: string, value: unknown): unknown {
  return typeof value === "string" ? unmark(value) : value;
}

/** A value with its strings unmarked, for output that isn't serialised here (the MCP server's structured content). */
export function unmarked<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, unmarkJson)) as T;
}

/** A next step an error knows: a command to run, and why. */
export interface Step {
  command: string;
  why?: string;
}

/**
 * An error whose message may cite Baesian's decisions and name what to do next. `message` is its plain text, without
 * citations, with each step as a `next:` line, so anything that prints it (the MCP server, the local server, the relay)
 * prints what an agent reads; `marked` keeps the citations, and `steps` the next steps, for the CLI to render.
 */
export class Told extends Error {
  readonly marked: string;
  readonly steps: readonly Step[];
  constructor(message: string, steps: readonly Step[] = []) {
    super([unmark(message), ...steps.map(nextLine)].join("\n"));
    this.marked = message;
    this.steps = steps;
  }
}

/** A next step as plain text reads it: `next: <command>  # why`. */
export const nextLine = (s: Step): string => `next: ${s.command}${s.why ? `  # ${s.why}` : ""}`;
