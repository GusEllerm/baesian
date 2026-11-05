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

/** The trailers git has parsed out of a message, one `Key: value` per line, as `--parse` and `%(trailers:only,unfold)` print them. */
function trailerLines(parsed: string): { key: string; value: string }[] {
  return parsed.split("\n").flatMap((line) => {
    const m = /^([^:]+):\s*(.*)$/.exec(line);
    return m ? [{ key: m[1]!.trim().toLowerCase(), value: m[2]!.trim() }] : [];
  });
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
  for (const { key, value } of trailerLines(out)) {
    if (key === CARD_TRAILER.toLowerCase()) {
      for (const id of value.split(/[\s,]+/).filter(Boolean)) {
        if (CARD_ID.test(id)) result.cards.push(id);
        else result.malformed.push(`${CARD_TRAILER}: ${value} — "${id}" isn't a card ID, which looks like B-7f3kq`);
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

/** A commit on a branch whose trailers cite a card (B-9v5xj). */
export interface CitingCommit {
  commit: string;
  /** The branch the search reached it through: `main`, or a remote's, `origin/main`. */
  branch: string;
  /** When it was authored, in ms. A rebase keeps it, where it changes the commit's own time. */
  authored: number;
}

/** What the history says about the cards: the commits that cite each, and whether a commit is on a branch. */
export interface History {
  /** Card ID → the commits on any branch, local or remote-tracking, whose trailers cite it, oldest first. */
  citing: Map<string, CitingCommit[]>;
  /**
   * Whether a commit is on a branch, local or remote-tracking: false once it's rewritten. A commit this clone doesn't have,
   * which another machine's ledger names (pulled from the relay, D181), counts as on one: nothing here says it was rewritten.
   */
  onBranch(commit: string): boolean;
}

const BRANCH_REFS = ["refs/heads", "refs/remotes"];
const histories = new Map<string, { refs: string; history: History }>();

function gitOut(cwd: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 });
  } catch {
    return undefined;
  }
}

/**
 * Search the history of every branch, local and remote-tracking, for `Baesian-Card` trailers (B-9v5xj), so the commits
 * that built on a card are found after a rebase, or a squash that keeps the trailer, rewrites them. Trailers are read
 * with git's own rules, as `parseTrailers` reads them: only from the message's last paragraph. A brief may ask about
 * many cards, so the search is cached per process for as long as the branches point where they did.
 */
export function readHistory(cwd: string): History {
  const refs = gitOut(cwd, ["for-each-ref", "--format=%(objectname) %(refname)", ...BRANCH_REFS]) ?? "";
  const cached = histories.get(cwd);
  if (cached && cached.refs === refs) return cached.history;
  // Only commits that mention the trailer at all are parsed; git's grep reads every message faster than we could.
  const out = gitOut(cwd, ["log", "--branches", "--remotes", "--source", "--reverse", "-i", `--grep=${CARD_TRAILER}`, "--format=%x1e%H%x00%at%x00%S%x00%(trailers:only,unfold)"]) ?? "";
  const citing = new Map<string, CitingCommit[]>();
  const found = new Set<string>();
  for (const record of out.split("\x1e").slice(1)) {
    const [commit, at, source, trailers = ""] = record.split("\0");
    if (!commit || !at) continue;
    found.add(commit);
    const branch = (source ?? "").replace(/^refs\/(heads|remotes)\//, "");
    const ids = new Set(
      trailerLines(trailers)
        .filter((t) => t.key === CARD_TRAILER.toLowerCase())
        .flatMap((t) => t.value.split(/[\s,]+/).filter((id) => CARD_ID.test(id))),
    );
    for (const id of ids) citing.set(id, [...(citing.get(id) ?? []), { commit, branch, authored: Number(at) * 1000 }]);
  }
  const memo = new Map<string, boolean>();
  const onBranch = (commit: string): boolean => {
    if (found.has(commit)) return true;
    if (!/^[0-9a-f]{4,64}$/i.test(commit)) return false;
    if (!memo.has(commit)) memo.set(commit, gitOut(cwd, ["cat-file", "-e", `${commit}^{commit}`]) === undefined || !!gitOut(cwd, ["for-each-ref", "--count=1", `--contains=${commit}`, "--format=%(refname)", ...BRANCH_REFS])?.trim());
    return memo.get(commit)!;
  };
  const history = { citing, onBranch };
  histories.set(cwd, { refs, history });
  return history;
}
