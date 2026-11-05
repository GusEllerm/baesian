import { spawnSync } from "node:child_process";
import type { Store } from "./store.js";
import { TRUST_ENV, checkSigned, projectLine } from "./trust.js";

// `baesian ci` (B-pt52b): what a linked repo's CI needs to run `baesian verify` with its keys pinned (D142, D159), and
// the repo's project beside them (B-mar8x). The keys come from the live layer the relay wrote as this machine pulled
// (`.git/baesian/trust/`), never from the committed record (`.baesian/trust/`), which a commit can change: the point of
// pinning them is a source no commit reaches. docs/vault/Modules/src-sync.md describes it.

/** A passkey key file in the pin: the service signed it, and the person checks it's theirs. */
export interface PinnedPasskey {
  file: string;
  handle: string;
  account: string;
  enrolled: string;
}

/** What `baesian ci` prints: the service the keys came from, the pin's lines, and what was left out, with why. */
export interface CiPin {
  service: string;
  project: string;
  /** The website's origin, as the service's key names it: where the person's account page is. */
  site: string;
  /** `BAESIAN_TRUST`'s lines, compact JSON, one each: the project's, the service's keys and revocations, then the passkeys'. */
  lines: string[];
  passkeys: PinnedPasskey[];
  /** Passkey key files in the live layer the service's keys don't sign, which the pin leaves out. */
  skipped: { file: string; why: string }[];
}

/** A file's JSON on one line, its fields in the file's own order: a passkey's line as the website showed it. */
const compact = (store: Store, rel: string) => JSON.stringify(JSON.parse(store.bytes(rel).toString("utf8")));

/**
 * The pin for a linked repo (B-pt52b), from the live layer only: the line naming its project (B-mar8x); each service key
 * and revocation the relay sent; and each passkey key file whose `.sig` checks against those keys (`checkSigned()`), at
 * the time it was enrolled. Or why there's none yet: the relay sends its key with the project's first file.
 */
export function ciPin(store: Store, service: string, project: string): CiPin | { problem: string } {
  const files = store.trustFiles();
  if (!files.service.length) {
    return { problem: `this machine has no key from ${service} for project ${project} yet: the relay sends it with the project's first file. File a card, then run \`baesian ci\` again` };
  }
  const root = { service: files.service.map((s) => s.key), revoked: files.revoked.map((r) => r.key) };
  const passkeys: PinnedPasskey[] = [];
  const signed: string[] = [];
  const skipped: CiPin["skipped"] = [];
  for (const { file, key } of files.passkeys) {
    const sig = store.storage.read(`${file}.sig`);
    const r = sig === undefined ? { problem: "it has no signature" } : checkSigned(root, store.bytes(file), Buffer.from(sig).toString("utf8"), key.enrolled, file);
    if ("problem" in r) {
      skipped.push({ file, why: `${r.problem}, so the service didn't write it` });
      continue;
    }
    passkeys.push({ file, handle: key.handle, account: key.account, enrolled: key.enrolled });
    signed.push(compact(store, file));
  }
  const lines = [projectLine(project), ...files.service.map((s) => compact(store, s.file)), ...files.revoked.map((r) => compact(store, r.file)), ...signed];
  return { service, project, site: files.service[0]!.key.origin, lines, passkeys, skipped };
}

/**
 * The GitHub Actions steps that run `baesian verify` with the pin (B-pt52b), as this repo's own workflow runs it: the full
 * history, which verify needs for the base, every commit in the range and the commit that linked the repo (B-45xz8); the
 * pushed commits on a push, and the merge gate on a pull request (D31). The CLI comes from npm, where it's to be published.
 */
export function workflowSteps(): string[] {
  const env = ["  env:", `    ${TRUST_ENV}: \${{ vars.${TRUST_ENV} }}`];
  return [
    "# In a workflow that runs on pushes to your main branch and on pull requests, as one job's steps.",
    "# Keep agents' commits from editing it, with a ruleset or code owners on .github/: it passes the pin to verify.",
    "- uses: actions/checkout@v7",
    "  with:",
    "    fetch-depth: 0 # verify needs the base, every commit since it, and the commit that linked the repo",
    "- uses: actions/setup-node@v7",
    "  with:",
    "    node-version: 22",
    "# `npx baesian` runs Baesian's CLI from npm: it's to be published there, and isn't yet.",
    "- name: baesian verify (pushed commits)",
    "  if: github.event_name == 'push' && github.event.before != '0000000000000000000000000000000000000000'",
    '  run: npx baesian verify --base "${{ github.event.before }}"',
    ...env,
    "- name: baesian verify --merge (pull request)",
    "  if: github.event_name == 'pull_request'",
    "  run: npx baesian verify --merge",
    ...env,
  ];
}

/** What running another program gave: its exit status, its output, and whether it wasn't found on PATH. */
export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  missing?: boolean;
}

/** Run a program with text on its standard input, as `baesian ci --github` runs `gh`. */
export function runProgram(command: string, args: string[], opts: { input: string; cwd: string }): RunResult {
  const r = spawnSync(command, args, { cwd: opts.cwd, input: opts.input, encoding: "utf8" });
  if (r.error) return { status: null, stdout: "", stderr: r.error.message, missing: (r.error as NodeJS.ErrnoException).code === "ENOENT" };
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}
