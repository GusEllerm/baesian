// Running the CLI from the plugin's hooks. `missing` means it isn't installed, so the hook says nothing.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

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

/** `feat/run-store` to `feat-run-store`: the names Baesian gives its files, as its own `slug()` makes them (src/git.ts). */
export function slug(text) {
  return (
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "x"
  );
}

/** The clone's live layer, `<git common dir>/baesian`, if the clone uses Baesian: what it keeps outside the record. */
export function liveDirOf(cwd) {
  const r = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, encoding: "utf8" });
  if (r.error || r.status !== 0) return undefined;
  const dir = join(r.stdout.trim(), "baesian");
  return existsSync(dir) ? dir : undefined;
}

/**
 * The model a hook's input names (B-k0w7d): Claude Code's `PostModelSwitch` gives `to_model`, and its `SessionStart`
 * gives `model`, which it may leave out (after /clear, for one); Codex gives every hook `model`.
 */
export function modelOf(input) {
  for (const value of [input?.to_model, input?.model]) {
    const model = typeof value === "string" ? value.trim() : "";
    if (model && model.length <= 200) return model;
  }
  return undefined;
}

/**
 * Keep the session's model where `baesian file` finds it (B-k0w7d): `models/<session>.json` in the live layer, by the
 * session ID the harness gives the hook, which it also gives the commands an agent runs. Neither harness tells those
 * commands the model, so the plugin keeps it for them. Written when it changes, replaced whole, never committed; it
 * never fails the hook. The file is Baesian's `SessionModel` (src/schema.ts). Returns whether it wrote.
 */
export function noteModel(input, now = () => new Date().toISOString()) {
  try {
    const model = modelOf(input);
    const session = typeof input?.session_id === "string" ? input.session_id.trim() : "";
    if (!model || !session) return false;
    const live = liveDirOf(typeof input.cwd === "string" && input.cwd ? input.cwd : undefined);
    if (!live) return false;
    const file = join(live, "models", `${slug(session)}.json`);
    try {
      if (JSON.parse(readFileSync(file, "utf8")).model === model) return false;
    } catch {
      // none yet, or unreadable: write it
    }
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify({ type: "session-model", format: 1, model, at: now() })}\n`);
    renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
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
