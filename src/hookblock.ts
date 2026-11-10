import { createHash } from "node:crypto";
import { basename } from "node:path";
import { VERSION, compareReleases } from "./version.js";

// D54: Baesian's hooks are a marked block inside whatever hook files the repo already uses, placed right after the
// shebang, because livedocs' pre-commit ends in `exec`. The block's text is here, apart from the installer in
// src/hooks.ts, so the fact detector can tell Baesian's own block from any other change to a hook (B-g6ywj).

/**
 * The hooks Baesian installs. `post-merge` and `post-rewrite` find merges (D181): git runs the first after a merge or a
 * fast-forward (`git pull` too), never `post-commit`; the second after a rebase (`git pull --rebase` too). `pre-push`
 * records a branch pushed to the remote's default branch as merged into it (B-h7rsv), and never stops a push.
 */
export const HOOKS = ["pre-commit", "commit-msg", "post-commit", "post-merge", "post-rewrite", "pre-push"] as const;
export type HookName = (typeof HOOKS)[number];

/** The hooks that can't stop anything, or mustn't (B-h7rsv): with Baesian missing, or failing, they carry on quietly. */
const NEVER_STOPS: readonly HookName[] = ["post-commit", "post-merge", "post-rewrite", "pre-push"];

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
 * that runs the repo's hook. There `post-rewrite`'s and `pre-push`'s standard input has been read into `$baesian_input`
 * first, and Baesian gets a copy of it, as the repo's hook does; and a missing Baesian says how to stop using it in this
 * clone, rather than to commit with `--no-verify`.
 *
 * `pre-push` (B-h7rsv) reads the refs being pushed from its standard input. In shared mode the block sits at the top of
 * the repo's own hook, whose lines after it may read them too (Git LFS's do): the input is copied to a temporary file,
 * which Baesian reads and which becomes the script's standard input again, whole. It never stops a push: whatever
 * Baesian does, the hook carries on.
 */
export function hookBlock(name: HookName, personal?: PersonalBlock): string {
  // commit-msg gets the message file; post-merge whether it was a squash; post-rewrite what rewrote (D181); pre-push the
  // remote's name. post-rewrite's standard input (the commits rewritten) is left for the repo's own lines after the
  // block: Baesian doesn't read it.
  const withArg = name === "commit-msg" || name === "post-merge" || name === "post-rewrite" || name === "pre-push";
  const pushing = name === "pre-push" && !personal;
  const stdin = name === "post-rewrite" && !personal ? " </dev/null" : pushing ? ` <"$baesian_refs"` : "";
  const pipe = (name === "post-rewrite" || name === "pre-push") && personal ? `printf '%s' "$baesian_input" | ` : "";
  const args = withArg ? ` ${name} "$1"${stdin}` : ` ${name}`;
  const evalArgs = withArg ? ` ${name} \\"\\$1\\"${stdin.replace(/"/g, '\\"').replace(/\$/g, "\\$")}` : ` ${name}`;
  const never = NEVER_STOPS.includes(name);
  // The hooks after the fact can't stop anything: they record the ledger and merges, so a missing binary is skipped
  // quietly. Nor does pre-push stop a push, whatever happens (B-h7rsv).
  const missing = never
    ? "  :"
    : personal
      ? `  echo "baesian: not on PATH; this clone's hooks run Baesian's gate (personal mode). Install it, or stop using it here: ${dq(personal.restore)}" >&2\n  exit 1`
      : `  echo "baesian: not on PATH; install it (npm i -g baesian) or commit with --no-verify (CI runs the same check)." >&2\n  exit 1`;
  const after = name === "pre-push" ? " || :" : " || exit $?";
  return [
    BEGIN,
    personal
      ? "# Baesian's commit gate, for this clone only (B-4rwyz). Managed by `baesian init --personal`."
      : "# Baesian's commit gate (D54). Managed by `baesian init`: edit outside the markers.",
    ...(pushing ? ['if baesian_refs="$(mktemp 2>/dev/null)"; then cat >"$baesian_refs"; exec <"$baesian_refs"; else baesian_refs=/dev/null; fi'] : []),
    "if command -v baesian >/dev/null 2>&1; then",
    `  ${pipe}baesian hook${args}${after}`,
    `elif baesian_fallback="$(git config --get ${FALLBACK_KEY})" && [ -n "$baesian_fallback" ]; then`,
    `  ${pipe}eval "$baesian_fallback hook${evalArgs}"${after}`,
    "else",
    missing,
    "fi",
    ...(pushing ? ['[ "$baesian_refs" = /dev/null ] || rm -f "$baesian_refs"'] : []),
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
 * Every block a released Baesian's `baesian init` wrote in a repo's committed hooks (B-np6af), by hook: the SHA-256 of
 * the block's text, from its first marker to its last, as `hookBlock()` returned it in that release. Personal mode's
 * blocks (B-4rwyz) are never committed, so they're not here. Teammates and CI are often a release apart, so a block any
 * release wrote is Baesian's own, as this one's is (B-g6ywj).
 *
 * A release that changes a block adds the one it replaces here, if a release wrote it, and in `CHANGED_BLOCKS`, so
 * `baesian init` writes it for one more release (B-amxkp); test/releases.test.ts checks every release tag's blocks are
 * listed. A block found flawed is taken out, and from then on counts as any change to a hook.
 * A release can't know the blocks of the releases after it: a newer release's block, which this list lacks, counts as a
 * change to the hook here, as before B-np6af.
 */
export const RELEASED_BLOCKS: Readonly<Record<HookName, readonly string[]>> = {
  "pre-commit": ["24cb63901109e4b7868618c4c51a88e5ddcaf72426ee5d40c4680bfc8b3921e9"], // v0.1.0 to v0.1.10
  "commit-msg": ["2f4a00b996aefc51e88e05c18709f7a3ef59e5444ff30229488d1d4bebce24a3"], // v0.1.0 to v0.1.10
  "post-commit": ["cae9c1b0840004bdee362cbb9d43f6184f99c972351105c3895a1b574757d214"], // v0.1.0 to v0.1.10
  "post-merge": ["8912aee3dee4dfde79bf04687553b3a4d9400bc9351cf3cfbe8f15b9a0803c39"], // v0.1.5 to v0.1.10
  "post-rewrite": ["944bb30617d56c767f8229cdb76cdb76b42f4684b799bba436c563e0fc69e73c"], // v0.1.5 to v0.1.10
  "pre-push": ["ad03a493a081320304d0b2a1040a6c676725244bb818561372ee508ad12b08dd"], // v0.1.8 to v0.1.10
};

/** A block's digest, as `RELEASED_BLOCKS` lists it. */
export const blockDigest = (block: string) => createHash("sha256").update(block).digest("hex");

/** A hook whose block a release changed (B-amxkp), while the block before it is still the one written. */
export interface ChangedBlock {
  /**
   * The release that first has the new block, `hookBlock()`'s, as package.json will name it. It recognises the new block
   * and writes the one before; the releases after it write the new one.
   */
  since: string;
  /** The block before, exactly as the releases before wrote it: its digest is in `RELEASED_BLOCKS`. */
  before: string;
}

/**
 * The hooks whose block a release changed, by hook (B-amxkp, "The old block for a release"): when a release changes what
 * `hookBlock()` returns for a committed hook, it puts the block before here, and adds the new one's digest to
 * `RELEASED_BLOCKS` once a release has written it. `baesian init` writes the block before until a release after `since`
 * (`writtenBlock()`), so CI pinned a release behind (B-c0e0d), and a teammate a release behind, recognise every block a
 * commit adds, as formats roll out under B-4p43b. An entry may go once no release it names is supported. None today.
 */
export const CHANGED_BLOCKS: Partial<Record<HookName, ChangedBlock>> = {};

/**
 * The block `baesian init` writes in a repo's hooks (B-amxkp): this release's, `hookBlock()`, or while a change to it is
 * new, the block before (`CHANGED_BLOCKS`). Personal mode's blocks are never committed, so they're written new at once.
 */
export function writtenBlock(name: HookName, release: string = VERSION): string {
  const changed = CHANGED_BLOCKS[name];
  return changed && compareReleases(changed.since, release) >= 0 ? changed.before : hookBlock(name);
}

/** Whether a block is one Baesian wrote for this hook: this release's, or any released one's (B-np6af). */
export function isBaesianBlock(name: HookName, block: string): boolean {
  return block === hookBlock(name) || RELEASED_BLOCKS[name].includes(blockDigest(block));
}

/**
 * Whether a change to a hook file only adds, updates or swaps Baesian's own block (B-g6ywj, B-np6af): the file is a hook
 * Baesian installs, its new block is one a Baesian's `baesian init` wrote for that hook, this release's or any released
 * one's (`isBaesianBlock()`), and nothing outside the block changed. Such a change isn't an infra fact: its text is
 * Baesian's, so an ack on it would record nothing anyone decided. Any other change to a hook is one (D135), as is
 * deleting a hook or taking the block out. The commit gate and `baesian verify` both judge hooks by it.
 */
export function onlyBaesianBlock(path: string, before: string | undefined, after: string | undefined): boolean {
  const name = basename(path);
  if (after === undefined || !(HOOKS as readonly string[]).includes(name)) return false;
  const start = after.indexOf(BEGIN);
  const end = after.indexOf(END);
  if (start < 0 || end < start) return false;
  const block = after.slice(start, end + END.length);
  if (!isBaesianBlock(name as HookName, block)) return false;
  if (after.indexOf(BEGIN, start + 1) >= 0) return false;
  return before === undefined ? after === NEW_HOOK(block) : withoutBlock(before) === withoutBlock(after);
}
