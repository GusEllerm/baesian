import { execFileSync } from "node:child_process";
import { CARD_ID } from "./ids.js";

// D52: `Baesian-Card: <id>` (one per line) and `Baesian-Ack: <fact-id> <reason>`.

export const CARD_TRAILER = "Baesian-Card";
export const ACK_TRAILER = "Baesian-Ack";

export interface Trailers {
  cards: string[];
  /** fact ID → reason */
  acks: Map<string, string>;
  /** Baesian trailers that couldn't be read, quoted, with why. */
  malformed: string[];
}

const FACT_ID = /^(dep|schema|infra|api):\S+$/;

/** The message as git will record it: no `#` comment lines, nothing below a `--verbose` scissors line. */
export function cleanMessage(raw: string): string {
  const lines: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (/^# -+ >8 -+$/.test(line)) break;
    if (!line.startsWith("#")) lines.push(line);
  }
  return lines.join("\n");
}

/** Parse the trailer block with git's own rules (`git interpret-trailers --parse`). */
export function parseTrailers(message: string, cwd: string): Trailers {
  const out = execFileSync("git", ["interpret-trailers", "--parse"], {
    cwd,
    input: cleanMessage(message),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "ignore"],
  });
  const result: Trailers = { cards: [], acks: new Map(), malformed: [] };
  for (const line of out.split("\n")) {
    const m = /^([^:]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!.trim().toLowerCase();
    const value = m[2]!.trim();
    if (key === CARD_TRAILER.toLowerCase()) {
      for (const id of value.split(/[\s,]+/).filter(Boolean)) {
        if (CARD_ID.test(id)) result.cards.push(id);
        else result.malformed.push(`${CARD_TRAILER}: ${value} — "${id}" isn't a card ID (B-7f3kq)`);
      }
    } else if (key === ACK_TRAILER.toLowerCase()) {
      const a = /^(\S+)\s+(.+)$/.exec(value);
      if (!a || !FACT_ID.test(a[1]!)) {
        result.malformed.push(`${ACK_TRAILER}: ${value} — expected "<fact-id> <reason>", e.g. "dep:httpx needed for the client"`);
      } else {
        result.acks.set(a[1]!, a[2]!.trim());
      }
    }
  }
  result.cards = [...new Set(result.cards)];
  return result;
}
