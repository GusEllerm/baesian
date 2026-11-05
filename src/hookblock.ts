import { basename } from "node:path";

// D54: Baesian's hooks are a marked block inside whatever hook files the repo already uses, placed right after the
// shebang, because livedocs' pre-commit ends in `exec`. The block's text is here, apart from the installer in
// src/hooks.ts, so the fact detector can tell Baesian's own block from any other change to a hook (B-g6ywj).

/**
 * The hooks Baesian installs. `post-merge` and `post-rewrite` find merges (D181): git runs the first after a merge or a
 * fast-forward (`git pull` too), never `post-commit`; the second after a rebase (`git pull --rebase` too).
 */
export const HOOKS = ["pre-commit", "commit-msg", "post-commit", "post-merge", "post-rewrite"] as const;
export type HookName = (typeof HOOKS)[number];

export const BEGIN = "# >>> baesian >>>";
export const END = "# <<< baesian <<<";

/** Per-clone git config key holding the command that runs Baesian when it isn't on PATH (D48). */
export const FALLBACK_KEY = "baesian.fallback";

/** What `writeHook` writes for a hook that didn't exist: a shebang, then the block. */
export const NEW_HOOK = (block: string) => `#!/bin/sh\n${block}\n`;

/** Personal mode (B-4rwyz): the block in this clone's own hooks, which nobody else runs. */
export interface PersonalBlock {
  /** The command that points this clone's git back at the repo's own hooks, for the message when Baesian is missing. */
  restore: string;
}

/** Text quoted for a double-quoted shell string. */
const dq = (s: string) => s.replace(/[\\"$`]/g, (c) => `\\${c}`);

/**
 * The marked block for one hook. It's the same on every machine, because `.githooks/` is committed:
 * the machine-specific fallback lives in the clone's own git config, never in the file.
 *
 * In personal mode (B-4rwyz) it's in the clone's own hooks instead, written by `baesian init --personal`, before the line
 * that runs the repo's hook. There `post-rewrite`'s standard input has been read into `$baesian_input` first, and Baesian
 * gets a copy of it (it carries the ledger over to the rewritten commits), as the repo's hook does; and a missing Baesian
 * says how to stop using it in this clone, rather than to commit with `--no-verify`.
 */
export function hookBlock(name: HookName, personal?: PersonalBlock): string {
  // commit-msg gets the message file; post-merge whether it was a squash; post-rewrite what rewrote (D181). post-rewrite's
  // standard input (the commits rewritten) is left for the repo's own lines after the block: Baesian doesn't read it.
  const withArg = name === "commit-msg" || name === "post-merge" || name === "post-rewrite";
  const stdin = name === "post-rewrite" && !personal ? " </dev/null" : "";
  const pipe = name === "post-rewrite" && personal ? `printf '%s' "$baesian_input" | ` : "";
  const args = withArg ? ` ${name} "$1"${stdin}` : ` ${name}`;
  const evalArgs = withArg ? ` ${name} \\"\\$1\\"${stdin}` : ` ${name}`;
  // The hooks after the fact can't stop anything: they record the ledger and merges, so a missing binary is skipped quietly.
  const missing =
    name === "post-commit" || name === "post-merge" || name === "post-rewrite"
      ? "  :"
      : personal
        ? `  echo "baesian: not on PATH; this clone's hooks run Baesian's gate (personal mode). Install it, or stop using it here: ${dq(personal.restore)}" >&2\n  exit 1`
        : `  echo "baesian: not on PATH; install it (npm i -g baesian) or commit with --no-verify (CI runs the same check)." >&2\n  exit 1`;
  return [
    BEGIN,
    personal
      ? "# Baesian's commit gate, for this clone only (B-4rwyz). Managed by `baesian init --personal`."
      : "# Baesian's commit gate (D54). Managed by `baesian init`: edit outside the markers.",
    "if command -v baesian >/dev/null 2>&1; then",
    `  ${pipe}baesian hook${args} || exit $?`,
    `elif baesian_fallback="$(git config --get ${FALLBACK_KEY})" && [ -n "$baesian_fallback" ]; then`,
    `  ${pipe}eval "$baesian_fallback hook${evalArgs}" || exit $?`,
    "else",
    missing,
    "fi",
    END,
  ].join("\n");
}

/** A hook's text with Baesian's block, and the line break after it, taken out. */
function withoutBlock(text: string): string {
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (start < 0 || end < start) return text;
  const after = end + END.length;
  return text.slice(0, start) + text.slice(text[after] === "\n" ? after + 1 : after);
}

/**
 * Whether a change to a hook file only adds or updates Baesian's own block (B-g6ywj): the file is a hook Baesian
 * installs, its new block is exactly what this Baesian's `baesian init` writes, and nothing outside the block changed.
 * Such a change isn't an infra fact: its text is Baesian's, so an ack on it would record nothing anyone decided. Any
 * other change to a hook is one (D135), as is deleting a hook or taking the block out.
 */
export function onlyBaesianBlock(path: string, before: string | undefined, after: string | undefined): boolean {
  const name = basename(path);
  if (after === undefined || !(HOOKS as readonly string[]).includes(name)) return false;
  const block = hookBlock(name as HookName);
  const start = after.indexOf(BEGIN);
  const end = after.indexOf(END);
  if (start < 0 || end < start || after.slice(start, end + END.length) !== block) return false;
  if (after.indexOf(BEGIN, start + 1) >= 0) return false;
  return before === undefined ? after === NEW_HOOK(block) : withoutBlock(before) === withoutBlock(after);
}
