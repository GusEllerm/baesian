// Running the CLI from the plugin's hooks. `missing` means it isn't installed, so the hook says nothing.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function baesian(args, input, cwd) {
  const r = spawnSync("baesian", args, { input, cwd, encoding: "utf8" });
  if (r.error) return { missing: r.error.code === "ENOENT", status: 1, stdout: "", stderr: String(r.error.message) };
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/**
 * The repo the hook runs in, if it uses Baesian, read without running the CLI, for hooks that run on every edit: its
 * top folder and its config, the clone's own in personal mode (B-4rwyz, `.git/baesian/config.json`), else the
 * committed `.baesian/config.json`, as the store reads it. An unreadable config reads as empty.
 */
export function repoOf(cwd) {
  const r = spawnSync("git", ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir"], { cwd, encoding: "utf8" });
  if (r.error || r.status !== 0) return undefined;
  const [toplevel, commonDir] = r.stdout.trim().split("\n");
  if (!toplevel || !commonDir) return undefined;
  for (const path of [join(commonDir, "baesian", "config.json"), join(toplevel, ".baesian", "config.json")]) {
    if (!existsSync(path)) continue;
    try {
      const config = JSON.parse(readFileSync(path, "utf8"));
      return { toplevel, config: config && typeof config === "object" && !Array.isArray(config) ? config : {} };
    } catch {
      return { toplevel, config: {} };
    }
  }
  return undefined;
}

/**
 * What each session has already been told, as keys, in a file of its own under the system's temporary folder: the
 * plugin's own memory, not Baesian's, so the hooks say a thing once a session. Nothing kept means it may say it again;
 * it never fails the hook.
 */
export function sessionMemory(kind, dir = join(tmpdir(), "baesian-plugin")) {
  const file = (session) => join(dir, `${kind}-${createHash("sha256").update(session).digest("hex").slice(0, 32)}.json`);
  return {
    read(session) {
      try {
        const keys = JSON.parse(readFileSync(file(session), "utf8"));
        return new Set(Array.isArray(keys) ? keys : []);
      } catch {
        return new Set();
      }
    },
    write(session, keys) {
      try {
        mkdirSync(dir, { recursive: true });
        writeFileSync(file(session), JSON.stringify([...keys]));
      } catch {
        // no memory of it: it may be said again
      }
    },
  };
}

/** The session reading the inbox, so each session on a branch keeps its own place (B-ghhym). Both harnesses give it. */
export function sessionArgs(input) {
  return typeof input?.session_id === "string" && input.session_id ? ["--session", input.session_id] : [];
}

/**
 * Read the hook's input from stdin, and write its output, if any: an object as the harness's JSON, a string as plain
 * text, which `SessionStart` and `UserPromptSubmit` add to the agent's context in both harnesses.
 */
export async function runHook(handle) {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  try {
    const out = await handle(JSON.parse(text));
    if (typeof out === "string") process.stdout.write(out);
    else if (out) process.stdout.write(JSON.stringify(out));
  } catch (e) {
    // Any exit but 2 is a non-blocking error: Claude Code shows it, and the session carries on.
    process.stderr.write(`baesian: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  }
}
